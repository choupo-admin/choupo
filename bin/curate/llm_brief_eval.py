#!/usr/bin/env python3
"""llm_brief_eval.py -- measure what an LLM DOES with a Choupo brief.

DEV.md 4c C200; record docs/design/an-llm-learns-choupo-from-a-brief.md
section 5 (phase A).  A TOOL, deliberately not a gate: it calls a paid model
and is wired into nothing (bin/runTests never runs it).

WHAT IT DOES
    For each (brief, problem): send  brief + fixed instruction block + problem
    to a proxy assistant (`claude -p --model haiku`, tools disabled, no session
    persistence, a one-line system prompt), parse the reply (`=== FILE: <path> ===`
    blocks) into a case directory under the scratch output dir, and score it
    MECHANICALLY.  Output: summary.md (table) + summary.json + per-run folders.

USAGE
    bin/curate/llm_brief_eval.py --out <scratchDir> [--brief core|bridge|name=path ...]
                                 [--problems p01,p05 ...] [--model haiku] [--rescore]
    Default briefs: core (bin/llmctx --core) and bridge (the GUI clipboard guide).
    --rescore re-reads existing reply.txt files and calls NO model.

SCORING (per run)
    design    DESIGN.md present, and how many of the seven items of record 4.2
              are detected.  HEURISTIC and lenient: an item counts when any of
              its keyword patterns (ITEM_PATTERNS below) occurs anywhere in
              DESIGN.md, case-insensitive.  It measures presence of the topic,
              not its correctness; a stricter reader is a later refinement.
    init0     `choupoSolve -init0 <case>` (no --force) run BEFORE lint: the student's
              Complete 0/ step, which the brief delegates; its exit code is reported.
    lint      `choupoSolve --lint <case>` exit code (bin/choupo-lint:26 is
              `exec choupoSolve --lint`; src/applications/choupoSolve/main.cpp
              :538 documents the flag).  Only for application choupoSolve.
    solves    the binary named by controlDict `application` (the word bin/runCase
              reads, bin/runCase:241-256; default choupoSolve) exits 0, writes
              converged/ , and neither the log nor converged/ holds nan/inf.
    balances  READ from the engine's own reports (never recomputed), written by
              default on a converged steady run under <case>/reports/balances/:
                massBalance.csv    row TOTAL's closure_pct line
                                   (src/reporting/MassBalanceReport.cpp)
                elementBalance.csv closure_pct per element, minimum reported
                                   (src/reporting/ElementBalanceReport.cpp:145)
                globalEnergyBoundary.csv  `residual` (kW) and `residual_pct`
                                   (src/reporting/EnergyBalanceReport.cpp:1082;
                                   pct is blank when UNAVAILABLE: a plant with
                                   no duty has no exchanged-energy scale)
                *.meta `status` : FULL or otherwise (reported verbatim)
              "balances ok" = mass >= 99.99 % and element min >= 99.99 % and,
              |energy residual| < 1 % where a pct exists, else < 1 kW (the pct is
              blank when there is no exchanged-energy scale).  A case that did
              not solve scores none.
    similarity  max difflib ratio, on comment-stripped whitespace-normalised
              text, of the case's system/flowsheetDict and
              constant/thermoPhysPropDict against EVERY tutorial file of the
              same name (tutorials/**), and which tutorial gave the max.
    tokens    input (incl. cache read/creation) and output from the CLI's
              `--output-format json` usage block; the CLI adds a constant
              overhead of its own (measured by one trivial call, reported as
              overhead_in and subtracted in input_net).

ENGINE BINARIES.  The worktree usually has no build.  Binaries and the data
root are taken from $CHOUPO_BIN_HOME (default /home/vitor/Choupo, read-only
use: nothing is ever written there) and CHOUPO_HOME is set to it for the
runs.  The commit the binary reports is recorded in the summary.

The tool never writes under tutorials/ or data/.  Stdlib only.
"""
import argparse, difflib, glob, json, os, re, subprocess, sys, time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
PROBLEM_DIR = HERE / "llm_eval" / "problems"
CLAUDE = os.environ.get("CLAUDE_BIN", "/home/vitor/.local/bin/claude")
BIN_HOME = Path(os.environ.get("CHOUPO_BIN_HOME", "/home/vitor/Choupo"))

# Same list and order as gui/src/agent/authoringGuide.ts (ORDER, line ~44);
# each file is preceded by "\n<!-- docs/ai/NAME.md -->\n" and followed by "\n".
BRIDGE_ORDER = ["overview", "dict-syntax", "case-layout", "thermo", "unit-ops",
                "components", "patterns", "pitfalls", "consistency"]

SYSTEM_PROMPT = "You are a careful chemical process engineer."

INSTRUCTIONS = """\
You are given reference documentation for a process simulator called Choupo, and then a design problem.
Design the process and write a complete Choupo case that solves it.

You cannot read files, run commands or ask questions; assume the documentation above is all you have.
Reply ONLY with files, in exactly this format, and no prose outside the files:

=== FILE: <relative path inside the case> ===
<file content>

The FIRST file must be DESIGN.md (your design notes). The remaining files are the case files, with paths
relative to the case root (for example system/controlDict). Write every file the case needs.
"""

ITEM_PATTERNS = [
    ("1 goal/spec", r"specification|product spec|\bgoal\b|\bobjective\b|\btarget\b"),
    ("2 components", r"component"),
    ("3 thermo model", r"thermodynamic|thermo model|property (model|package)|activity model|equation of state|"
                       r"\bnrtl\b|uniquac|wilson|peng|\bsrk\b|\bideal\b|raoult|pitzer|enrtl|\bpr\b"),
    ("4 topology", r"topology|flowsheet|\btear\b|intermediate|solve order|unit order"),
    ("5 DOF", r"degrees? of freedom|\bdof\b"),
    ("6 expected", r"expected result|expected value|sanity|hand[- ]check|order of magnitude|expect"),
    ("7 leaves out", r"leaves? out|left out|not modell?ed|omit|neglect|out of scope|simplif|assum"),
]

# ----------------------------------------------------------------- briefs
def brief_core():
    r = subprocess.run([str(ROOT / "bin" / "llmctx"), "--core"], capture_output=True, text=True, check=True)
    return r.stdout

def brief_bridge():
    out = ""
    for name in BRIDGE_ORDER:
        p = ROOT / "docs" / "ai" / f"{name}.md"
        if p.exists():
            out += f"\n<!-- docs/ai/{name}.md -->\n{p.read_text()}\n"
    return out

def load_brief(spec):
    if spec == "core":
        return "core", brief_core()
    if spec == "bridge":
        return "bridge", brief_bridge()
    name, _, path = spec.partition("=")
    return name, Path(path).read_text()

# ----------------------------------------------------------------- proxy
def run_claude(prompt, model, timeout=900):
    cmd = [CLAUDE, "-p", "--model", model, "--tools", "", "--no-session-persistence",
           "--system-prompt", SYSTEM_PROMPT, "--output-format", "json"]
    for attempt in (1, 2):                      # one retry, transport errors only
        try:
            r = subprocess.run(cmd, input=prompt, capture_output=True, text=True,
                               timeout=timeout, cwd=str(NEUTRAL_CWD))
            j = json.loads(r.stdout) if r.stdout.strip().startswith("{") else None
            if r.returncode == 0 and j and not j.get("is_error") and j.get("result"):
                return j, None
            err = f"rc={r.returncode} stderr={r.stderr[:300]!r} out={r.stdout[:300]!r}"
        except Exception as e:                  # timeout, bad JSON
            err = repr(e)
        print(f"  proxy attempt {attempt} failed: {err}", file=sys.stderr)
    return None, err

NEUTRAL_CWD = Path("/tmp")   # replaced in main() by a dir with no CLAUDE.md above it

def usage_of(j):
    u = j.get("usage", {})
    tin = u.get("input_tokens", 0) + u.get("cache_creation_input_tokens", 0) + u.get("cache_read_input_tokens", 0)
    return tin, u.get("output_tokens", 0)

# ----------------------------------------------------------------- reply -> case
FILE_RE = re.compile(r"^=== FILE:\s*(.+?)\s*===\s*$", re.M)

def parse_reply(text):
    marks = list(FILE_RE.finditer(text))
    files = []
    for i, m in enumerate(marks):
        body = text[m.end(): marks[i + 1].start() if i + 1 < len(marks) else len(text)]
        body = body.strip("\n")
        lines = body.split("\n")
        if lines and lines[0].lstrip().startswith("```"):          # strip a code fence
            lines = lines[1:]
            if lines and lines[-1].strip().startswith("```"):
                lines = lines[:-1]
        rel = m.group(1).strip().strip("`")
        files.append((rel, "\n".join(lines) + "\n"))
    return files

def write_case(files, case_dir):
    """Write files; return (list of written paths, list of refused paths)."""
    ok, bad = [], []
    for rel, body in files:
        p = Path(rel)
        if p.is_absolute() or ".." in p.parts or not rel:
            bad.append(rel); continue
        dst = case_dir / p
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(body)
        ok.append(rel)
    return ok, bad

def find_case_root(case_dir):
    """The shallowest directory holding system/flowsheetDict (models often add a wrapper folder)."""
    cands = sorted(case_dir.glob("**/system/flowsheetDict"), key=lambda p: len(p.parts))
    return cands[0].parent.parent if cands else None

# ----------------------------------------------------------------- scoring
def score_design(case_dir):
    cands = list(case_dir.glob("**/DESIGN.md"))
    if not cands:
        return {"present": False, "items": 0, "detail": {}}
    t = cands[0].read_text().lower()
    detail = {n: bool(re.search(p, t)) for n, p in ITEM_PATTERNS}
    return {"present": True, "items": sum(detail.values()), "detail": detail, "chars": len(t)}

def sh(cmd, cwd, env, timeout=300):
    try:
        r = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout)
        return r.returncode, r.stdout + r.stderr
    except subprocess.TimeoutExpired:
        return 124, "TIMEOUT"

NANINF = re.compile(r"(?<![A-Za-z_])-?(nan|inf)(?![A-Za-z_])", re.I)

def read_csv_rows(p):
    if not p.exists(): return []
    return [l.split(",") for l in p.read_text().splitlines() if l and not l.startswith("#")]

def meta_status(p):
    for r in read_csv_rows(p):
        if r[0] == "status": return r[1]
    return None

def score_run(case_dir, run_dir):
    root = find_case_root(case_dir)
    s = {"case_root": str(root.relative_to(case_dir)) if root else None}
    s["design"] = score_design(case_dir)
    if root is None:
        s.update(lint=None, solves=False, reason="no system/flowsheetDict in the reply")
        return s
    env = dict(os.environ, CHOUPO_HOME=str(BIN_HOME))
    app = "choupoSolve"
    cd = root / "system" / "controlDict"
    if cd.exists():
        m = re.search(r"^\s*application\s+(\w+)", cd.read_text(), re.M)
        if m: app = m.group(1)
    s["application"] = app
    binp = BIN_HOME / app
    if not binp.exists():
        s.update(lint=None, solves=False, reason=f"binary {binp} missing"); return s
    if app == "choupoSolve":
        # THE STUDENT'S STEP, NOT THE ASSISTANT'S: the brief tells the assistant to
        # write only the authored inlets and tear seeds and the student to run
        # Complete 0/ (the app) or bin/choupo-init0 -- the same `-init0`, never
        # --force.  Scoring lint on the bare reply would fail every case for a
        # step the brief delegates (measured 2026-11-02: 20 of 20 runs).  Its
        # own result is reported (`init0`), so a case that cannot be completed
        # is told apart from one that completes and then fails.
        rc0, out0 = sh([str(BIN_HOME / "choupoSolve"), "-init0", str(root)], str(root), env)
        (run_dir / "init0.log").write_text(out0)
        s["init0"] = rc0
        rc, out = sh([str(BIN_HOME / "choupoSolve"), "--lint", str(root)], str(root), env)
        (run_dir / "lint.log").write_text(out)
        s["lint"] = rc
        s["lint_last"] = [l for l in out.splitlines() if l.strip()][-1:] if out else []
    else:
        s["lint"] = None
    rc, out = sh([str(binp), str(root)], str(root), env, timeout=600)
    (run_dir / "solve.log").write_text(out)
    s["solve_rc"] = rc
    conv = root / "converged"
    # nan/inf is looked for in the RESULT (the block between the engine's
    # <<<Choupo:result-begin/end>>> markers) and in converged/ -- not in the free-text
    # log, where a solver trace may legitimately print "g(V=1) = -inf".
    mres = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>", out, re.S)
    nan = bool(mres and NANINF.search(mres.group(1)))
    if conv.exists():
        nan = nan or any(NANINF.search(f.read_text(errors="ignore")) for f in conv.glob("**/*") if f.is_file())
    s["nan_inf"] = nan
    s["converged_dir"] = conv.exists()
    s["solves"] = rc == 0 and conv.exists() and not nan
    if rc != 0:
        err = [l for l in out.splitlines() if re.search(r"error|refus|not converged|fatal", l, re.I)]
        s["reason"] = (err[:1] or out.splitlines()[-1:] or [""])[0][:300]
    # balances: read the engine's own reports
    bal = root / "reports" / "balances"
    b = {}
    for r in read_csv_rows(bal / "massBalance.csv"):
        if r and r[0] == "closure_pct" and len(r) > 3 and r[3]:
            b["mass_pct"] = float(r[3])
    el = [float(r[4]) for r in read_csv_rows(bal / "elementBalance.csv")[1:] if len(r) > 4 and r[4]]
    if el: b["element_min_pct"] = min(el)
    for r in read_csv_rows(bal / "globalEnergyBoundary.csv"):
        if r[0] == "residual" and len(r) > 1: b["energy_residual_kW"] = float(r[1])
        if r[0] == "residual_pct" and len(r) > 1 and r[1]: b["energy_residual_pct"] = float(r[1])
    b["mass_status"] = meta_status(bal / "massBalance.meta")
    b["element_status"] = meta_status(bal / "elementBalance.meta")
    s["balances"] = b
    s["balances_ok"] = bool(s["solves"] and b.get("mass_pct", 0) >= 99.99 and b.get("element_min_pct", 0) >= 99.99
                            and (abs(b["energy_residual_pct"]) < 1.0 if "energy_residual_pct" in b
                                 else abs(b.get("energy_residual_kW", 1e9)) < 1.0))
    s["similarity"] = similarity(root)
    return s

# ----------------------------------------------------------------- similarity
def strip(t):
    t = re.sub(r"/\*.*?\*/", " ", t, flags=re.S)
    t = re.sub(r"//[^\n]*", " ", t)
    return re.sub(r"\s+", " ", t).strip()

_TUT = {}
def tutorial_index():
    if _TUT: return _TUT
    for rel in ("system/flowsheetDict", "constant/thermoPhysPropDict"):
        L = []
        for p in glob.glob(str(ROOT / "tutorials" / "**" / rel), recursive=True):
            try: L.append((str(Path(p).parent.parent.relative_to(ROOT / "tutorials")), strip(Path(p).read_text(errors="ignore"))))
            except Exception: pass
        _TUT[rel] = L
    return _TUT

def similarity(root):
    out = {}
    for rel, idx in tutorial_index().items():
        f = root / rel
        if not f.exists():
            out[rel] = None; continue
        a = strip(f.read_text(errors="ignore"))
        sm = difflib.SequenceMatcher(autojunk=False)
        sm.set_seq2(a)
        scored = []
        for name, b in idx:
            sm.set_seq1(b)
            if sm.real_quick_ratio() < 0.2 or sm.quick_ratio() < 0.2: continue
            scored.append((sm.quick_ratio(), name, b))
        scored.sort(reverse=True)
        best = (0.0, None)
        for _, name, b in scored[:12]:             # exact ratio only on the 12 best upper bounds
            sm.set_seq1(b)
            r = sm.ratio()
            if r > best[0]: best = (r, name)
        out[rel] = {"max": round(best[0], 3), "tutorial": best[1]}
    return out

# ----------------------------------------------------------------- main
def engine_commit():
    try:
        r = subprocess.run([str(BIN_HOME / "choupoSolve"), "--help"], capture_output=True, text=True, timeout=20,
                           env=dict(os.environ, CHOUPO_HOME=str(BIN_HOME)))
        m = re.search(r"commit (\w+)", r.stdout + r.stderr)
        return m.group(1) if m else "unknown"
    except Exception:
        return "unknown"

def fmt(v, f="{:.2f}"):
    return "-" if v is None else f.format(v)

def table(rows, briefs):
    L = ["| brief | problem | DESIGN items | lint | solves | mass % | elem min % | energy resid kW | sim flowsheet | sim thermo | tok in (net) | tok out |",
         "|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        s = r["score"]; b = s.get("balances", {}); sim = s.get("similarity") or {}
        sf = (sim.get("system/flowsheetDict") or {}); st = (sim.get("constant/thermoPhysPropDict") or {})
        L.append("| {} | {} | {} | {} | {} | {} | {} | {} | {} | {} | {} | {} |".format(
            r["brief"], r["problem"],
            f'{s["design"]["items"]}/7' if s["design"]["present"] else "none",
            "-" if s.get("lint") is None else ("ok" if s["lint"] == 0 else f'FAIL({s["lint"]})'),
            "yes" if s.get("solves") else "NO",
            fmt(b.get("mass_pct"), "{:.3f}"), fmt(b.get("element_min_pct"), "{:.3f}"),
            fmt(b.get("energy_residual_kW"), "{:.3g}"),
            fmt(sf.get("max"), "{:.2f}") + (f' ({sf["tutorial"].split("/")[-1]})' if sf.get("tutorial") else ""),
            fmt(st.get("max"), "{:.2f}"),
            r["tokens"]["in_net"], r["tokens"]["out"]))
    L += ["", "Per brief (sum over problems):", "",
          "| brief | runs | DESIGN.md present | mean items | lint ok | solves | balances ok | tok in (net) total | tok out total |",
          "|---|---|---|---|---|---|---|---|---|"]
    for bn in briefs:
        rs = [r for r in rows if r["brief"] == bn]
        if not rs: continue
        n = len(rs); sc = [r["score"] for r in rs]
        L.append("| {} | {} | {}/{} | {:.1f} | {}/{} | {}/{} | {}/{} | {} | {} |".format(
            bn, n, sum(x["design"]["present"] for x in sc), n,
            sum(x["design"]["items"] for x in sc) / n,
            sum(x.get("lint") == 0 for x in sc), n, sum(bool(x.get("solves")) for x in sc), n,
            sum(bool(x.get("balances_ok")) for x in sc), n,
            sum(r["tokens"]["in_net"] for r in rs), sum(r["tokens"]["out"] for r in rs)))
    return "\n".join(L)

def main():
    global NEUTRAL_CWD
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", required=True, help="scratch output dir (never inside tutorials/ or data/)")
    ap.add_argument("--brief", action="append", help="core | bridge | name=path (repeatable)")
    ap.add_argument("--problems", help="comma list of problem prefixes, e.g. p01,p05")
    ap.add_argument("--model", default="haiku")
    ap.add_argument("--rescore", action="store_true", help="re-score existing reply.txt, call no model")
    a = ap.parse_args()
    out = Path(a.out).resolve()
    for bad in ("tutorials", "data"):
        if (ROOT / bad).resolve() in [out, *out.parents]:
            sys.exit(f"refusing --out inside {bad}/")
    out.mkdir(parents=True, exist_ok=True)
    NEUTRAL_CWD = out / "_neutral"; NEUTRAL_CWD.mkdir(exist_ok=True)
    briefs = [load_brief(b) for b in (a.brief or ["core", "bridge"])]
    probs = sorted(PROBLEM_DIR.glob("p*.md"))
    if a.problems:
        keep = a.problems.split(",")
        probs = [p for p in probs if any(p.name.startswith(k) for k in keep)]

    overhead = 0
    ov_file = out / "overhead.json"
    if ov_file.exists():
        overhead = json.loads(ov_file.read_text())["in"]
    elif not a.rescore:
        j, _ = run_claude("Reply with the single word OK.", a.model)
        if j:
            overhead = usage_of(j)[0]; ov_file.write_text(json.dumps({"in": overhead}))
    rows = []
    for bname, btxt in briefs:
        for p in probs:
            pid = p.stem.split("_")[0]
            rd = out / bname / pid; rd.mkdir(parents=True, exist_ok=True)
            reply_f = rd / "reply.txt"; raw_f = rd / "raw.json"
            tokens = {"in": 0, "in_net": 0, "out": 0}
            err = None
            if reply_f.exists() and (a.rescore or raw_f.exists()):
                j = json.loads(raw_f.read_text()) if raw_f.exists() else None
            else:
                prompt = f"{btxt}\n\n---\n\n{INSTRUCTIONS}\n---\n\n{p.read_text()}"
                print(f"[{bname}/{pid}] proxy call, prompt {len(prompt)} chars", file=sys.stderr)
                j, err = run_claude(prompt, a.model)
                if j:
                    raw_f.write_text(json.dumps(j)); reply_f.write_text(j["result"])
            if j:
                ti, to = usage_of(j)
                tokens = {"in": ti, "in_net": max(ti - overhead, 0), "out": to}
            if not reply_f.exists():
                rows.append({"brief": bname, "problem": pid, "tokens": tokens, "error": err,
                             "score": {"design": {"present": False, "items": 0}, "solves": False,
                                       "reason": f"no reply: {err}"}})
                continue
            case_dir = rd / "case"
            if case_dir.exists():
                import shutil; shutil.rmtree(case_dir)
            case_dir.mkdir()
            files, refused = write_case(parse_reply(reply_f.read_text()), case_dir)
            sc = score_run(case_dir, rd)
            sc["files"] = files; sc["refused_paths"] = refused
            (rd / "score.json").write_text(json.dumps(sc, indent=1))
            rows.append({"brief": bname, "problem": pid, "tokens": tokens, "score": sc})
            print(f"[{bname}/{pid}] items={sc['design']['items']} lint={sc.get('lint')} solves={sc.get('solves')}",
                  file=sys.stderr)
    meta = {"date": time.strftime("%Y-%m-%d"), "model": a.model, "engine_commit": engine_commit(),
            "overhead_in_tokens": overhead, "brief_chars": {n: len(t) for n, t in briefs}}
    (out / "summary.json").write_text(json.dumps({"meta": meta, "rows": rows}, indent=1))
    md = table(rows, [n for n, _ in briefs])
    (out / "summary.md").write_text(md + "\n")
    print(md)

if __name__ == "__main__":
    main()
