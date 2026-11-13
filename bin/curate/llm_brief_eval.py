#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
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
    Brief `llm` = docs/ai/brief.md + every docs/ai/packs/*.md (what a student's assistant reads).
    Brief `prompts` = the THREE-PROMPT PATH of docs/ai/prompts.md (C252): prompt A's reading list
    (start-here, brief, capabilities, whole, in that order) + the ONE pack prompt B would name for
    the problem (PROMPT_PACK below; a problem a student would not send to a pack gets none).

REVISION MODE (DEV.md 4c C200; the brief's section 10).  A problem file whose first lines
declare  `start: <case path under tutorials/>`  and  `feedback: <text>`  is a REVISION
problem; a problem file without them is scored exactly as before.  Optional lines:
    allowed: f1, f2    files the change list legitimately needs (DESIGN.md always allowed)
    check: <file> <path> == <value> [unit]    a key read FROM THE CASE after the reply is applied;
                       <path> = dotted keys, a list element selected as units[NAME]; value and unit
                       compared numerically in SI (rel 1e-6), a bare word compared as text
    check: <file> absent /<regex>/    the comment-stripped file must not match (no invented key)
    expect: unsupported   the feedback asks for what Choupo cannot do: DESIGN.md must say so
                       (regex UNSUPPORTED_RE) and the case must still solve
The start case (non-output files only: no converged/, reports/, expected, README) is copied to
the run dir as the student's current case; `llm_eval/starts/<case>.DESIGN.md` is added when
the case has no DESIGN.md.  The prompt is brief + the case files (system/, 0/, DESIGN.md,
constant/thermoPhysPropDict, reactions) + the feedback.  The reply is applied OVER the start the
way the app does it (gui/src/agent/clipboardContext.ts applyEdits: a block REPLACES the file
or ADDS it; there is NO delete), then the usual init0 / lint / solve / balances.  Reported:
files changed vs the start (counted BEFORE init0 writes anything), which are outside `allowed`,
DESIGN.md has a Revisions entry quoting the feedback verbatim, each `check:`.

MORE REVISION LINES (C250).
    touch: <file>     the change list MUST include this file (it counts as a check)
    omit: <regex>     files whose path matches are left out of the prompt dump (listed as "not shown, unchanged"),
                      for a start case whose full text is far larger than the change needs
    check: <file> <path> ~= <value> [unit]    as ==, within 1 % (a model rounds a molar flow)
    A list element is also selected by the value of its `product`, `unitName`, `stage` or `train` key.

THE PROXY (C250).  Default: `claude -p --model haiku`.  A non-Claude model is measured through an
OpenAI-compatible chat endpoint:  --endpoint <url> (or $CHOUPO_LLM_ENDPOINT, e.g. https://host/v1/chat/completions),
key in $CHOUPO_LLM_KEY, model in --model (or $CHOUPO_LLM_MODEL).  --dry-run builds every request, prints it (key
masked, prompt shortened) and calls NOTHING, for either proxy.  Tokens are those the service reports.  The summary
prints tokens per SOLVED problem (net input + output, over the runs that solved).

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

def brief_llm():
    out = (ROOT / "docs" / "ai" / "brief.md").read_text()
    for p in sorted((ROOT / "docs" / "ai" / "packs").glob("*.md")):
        out += f"\n\n<!-- docs/ai/packs/{p.name} -->\n{p.read_text()}"
    return out

# The pack a student would pick for prompt B, per problem prefix (the pack list of
# docs/ai/prompts.md).  A flash or a revision problem names no pack: prompt A alone.
PROMPT_PACK = {
    "p04": "recycles", "p05": "reactors", "p06": "separations", "p07": "separations",
    "p08": "pressure", "p09": "pressure", "p11": "batch-plant", "p12": "batch-plant",
    "p13": "layout", "p-pharma-1": "pharmaceutical", "p-pharma-2": "pharmaceutical",
    "p-pharma-3": "pharmaceutical",
}

def brief_prompts(pid):
    """Prompt A's three documents, whole and in order, then the pack of prompt B (if any)."""
    sys.path.insert(0, str(ROOT / "bin" / "curate"))
    import prompts_home
    ai = ROOT / "docs" / "ai"
    # the student's first message (prompt A, read from its one home), then the three
    # documents it names, which the assistant would have fetched
    out = ("# The student's first message (docs/ai/prompts.md, prompt A)\n\n"
           + prompts_home.load()["sections"][0]["prompt"])
    for name in ("start-here", "brief", "capabilities"):
        out += f"\n\n<!-- docs/ai/{name}.md -->\n{(ai / (name + '.md')).read_text()}"
    pack = PROMPT_PACK.get(pid)
    if pack:
        pf = ai / "packs" / f"{pack}.md"
        if not pf.is_file():
            sys.exit(f"PROMPT_PACK names pack {pack!r} for {pid}: docs/ai/packs/{pack}.md does not exist")
        out += f"\n\n<!-- docs/ai/packs/{pack}.md -->\n{pf.read_text()}"
    return out

def load_brief(spec):
    if spec == "prompts":
        return "prompts", brief_prompts(None)    # per-problem text is rebuilt in main()
    if spec == "llm":
        return "llm", brief_llm()
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

# ---- an OpenAI-compatible chat endpoint (C250): a proxy that is not Claude -------------------
PROXY = {"endpoint": None, "key": None, "dry": False}   # set in main()

def endpoint_request(prompt, model):
    """-> (url, headers, body-dict) of one chat-completions call; NO network here."""
    body = {"model": model, "temperature": 0,
            "messages": [{"role": "system", "content": SYSTEM_PROMPT},
                         {"role": "user", "content": prompt}]}
    headers = {"Content-Type": "application/json", "Authorization": "Bearer " + (PROXY["key"] or "")}
    return PROXY["endpoint"], headers, body

def show_request(label, url, headers, body, prompt):
    shown = dict(body, messages=[dict(m, content=(m["content"] if m["role"] == "system" else
                f"<{len(prompt)} chars: {prompt[:200]!r} ... {prompt[-200:]!r}>")) for m in body["messages"]])
    h = {k: ("Bearer ***" if k == "Authorization" else v) for k, v in headers.items()}
    print(f"[dry-run] {label}\n  POST {url}\n  headers {json.dumps(h)}\n  body {json.dumps(shown, indent=2)}")

def run_endpoint(prompt, model, timeout=900):
    import urllib.request
    url, headers, body = endpoint_request(prompt, model)
    err = None
    for attempt in (1, 2):
        try:
            rq = urllib.request.Request(url, data=json.dumps(body).encode(), headers=headers, method="POST")
            with urllib.request.urlopen(rq, timeout=timeout) as r:
                j = json.loads(r.read().decode())
            txt = j["choices"][0]["message"]["content"]
            u = j.get("usage", {})
            return {"result": txt, "is_error": False,
                    "usage": {"input_tokens": u.get("prompt_tokens", 0), "output_tokens": u.get("completion_tokens", 0)}}, None
        except Exception as e:
            err = repr(e)
            print(f"  endpoint attempt {attempt} failed: {err}", file=sys.stderr)
    return None, err

def run_proxy(prompt, model):
    return run_endpoint(prompt, model) if PROXY["endpoint"] else run_claude(prompt, model)

NEUTRAL_CWD = Path("/tmp")   # replaced in main() by a dir with no CLAUDE.md above it

def usage_of(j):
    u = j.get("usage", {})
    tin = u.get("input_tokens", 0) + u.get("cache_creation_input_tokens", 0) + u.get("cache_read_input_tokens", 0)
    return tin, u.get("output_tokens", 0)

# ----------------------------------------------------------------- reply -> case
FILE_RE = re.compile(r"^=== FILE:\s*(.+?)\s*===\s*$", re.M)

END_RE = re.compile(r"\n?^=== END FILE ===\s*$", re.M)

def parse_reply(text):
    text = END_RE.sub("", text)        # the bridge's closing marker (clipboardContext.ts:57); not file content
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


# ----------------------------------------------------------------- revision mode
import shutil
HEAD_RE = re.compile(r"^(start|feedback|allowed|check|expect|touch|omit):\s*(.*)$")
UNSUPPORTED_RE = re.compile(r"cannot|can ?not|not (supported|available|implemented|modell?ed)|no (packing|packed)|"
                            r"does not (have|support|model|exist)|n[aã]o (suporta|existe|consegue|[ée] poss)|"
                            r"unsupported|not in choupo|no such", re.I)
OUTPUT_SKIP = ("converged", "reports", "expected", "README.md", "log.choupo")

def parse_problem(text):
    """(meta, body). meta has start/feedback/allowed/checks/expect when the file declares a revision."""
    meta = {"checks": [], "touch": []}
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        m = HEAD_RE.match(lines[i])
        if not m: break
        k, v = m.groups()
        if k == "check": meta["checks"].append(v.strip())
        elif k == "touch": meta["touch"].append(v.strip())
        else: meta[k] = v.strip()
        i += 1
    return (meta if "start" in meta else None), "\n".join(lines[i:]).strip()

def copy_start(start_rel, dst):
    src = ROOT / start_rel
    if not (src / "system" / "flowsheetDict").exists():
        sys.exit(f"revision problem: start case {start_rel} has no system/flowsheetDict")
    for f in src.rglob("*"):
        rel = f.relative_to(src)
        if f.is_file() and not any(part.startswith(OUTPUT_SKIP) for part in rel.parts):
            (dst / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(f, dst / rel)
    if not (dst / "DESIGN.md").exists():
        d = HERE / "llm_eval" / "starts" / (src.name + ".DESIGN.md")
        if not d.exists(): sys.exit(f"missing prepared DESIGN.md {d}")
        shutil.copyfile(d, dst / "DESIGN.md")

PROMPT_FILES = re.compile(r"^(system/|0/|DESIGN\.md$|constant/thermoPhysPropDict$|constant/reactions$)")

def case_dump(case, omit=None):
    out, other = "", []
    for f in sorted(case.rglob("*")):
        if not f.is_file(): continue
        rel = str(f.relative_to(case))
        if rel.endswith(".cho"): continue
        if PROMPT_FILES.match(rel) and not (omit and re.search(omit, rel)):
            out += f"\n=== FILE: {rel} ===\n{f.read_text()}\n=== END FILE ===\n"
        else:
            other.append(rel)
    return out.strip() + ("\n\n(also in the case, not shown, unchanged: " + ", ".join(other) + ")" if other else "")

REV_INSTRUCTIONS = """\
You are given reference documentation for a process simulator called Choupo, then the student's CURRENT case
(the files they approved so far), then their feedback.  Revise the case following the documentation.

You cannot read other files, run commands or ask questions beyond what the documentation allows.
Reply ONLY with files, each closed by its end marker, in exactly this format, and no prose outside the files:

=== FILE: <relative path inside the case> ===
<file content>
=== END FILE ===

The FIRST file must be DESIGN.md.
"""

def snapshot(case):
    return {str(f.relative_to(case)): f.read_bytes() for f in case.rglob("*") if f.is_file()}

UNITS = {"bar": 1e5, "pa": 1.0, "kpa": 1e3, "mpa": 1e6, "atm": 101325.0, "k": 1.0, "kw": 1e3, "w": 1.0, "mw": 1e6,
         "kmol/h": 1e3/3600, "mol/s": 1.0, "kmol/s": 1e3, "m2": 1.0, "w/m2/k": 1.0, "kg/h": 1/3600, "kg/s": 1.0}

def to_si(tokens):
    """['3','bar'] -> 3e5 ; ['25','degC'] -> 298.15 ; a lone number is raw SI ; else None."""
    try: v = float(tokens[0])
    except Exception: return None
    if len(tokens) == 1: return v
    u = tokens[1].lower()
    if u in ("degc", "c"): return v + 273.15
    return v * UNITS[u] if u in UNITS else None

def toks(text):
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.S)
    text = re.sub(r"//[^\n]*", " ", text)
    return re.findall(r'"[^"]*"|[{}();]|[^\s{}();]+', text)

def parse_dict(t, i=0):
    d = {}
    while i < len(t) and t[i] != "}":
        key = t[i]; i += 1
        if i < len(t) and t[i] == "{":
            d[key], i = parse_dict(t, i + 1); i += 1
        elif i < len(t) and t[i] == "(":
            L, i = [], i + 1
            while i < len(t) and t[i] != ")":
                if t[i] == "{":
                    e, i = parse_dict(t, i + 1); i += 1; L.append(e)
                else: L.append(t[i]); i += 1
            d[key] = L; i += 1
            if i < len(t) and t[i] == ";": i += 1
        else:
            v = []
            while i < len(t) and t[i] != ";": v.append(t[i]); i += 1
            d[key] = v; i += 1
    return d, i

def lookup(d, path):
    cur = d
    for seg in path.split("."):
        m = re.match(r"(\w+)(?:\[(\w+)\])?$", seg)
        if not m or not isinstance(cur, dict) or m.group(1) not in cur: return None
        cur = cur[m.group(1)]
        if m.group(2) is not None:
            sel = m.group(2)
            hit = [e for e in cur if isinstance(e, dict) and any(e.get(k) == [sel] for k in ("name", "product", "unitName", "stage", "train"))] if isinstance(cur, list) else []
            if not hit and sel.isdigit() and isinstance(cur, list) and int(sel) < len(cur): hit = [cur[int(sel)]]
            if not hit: return None
            cur = hit[0]
    return cur

def run_check(root, line):
    """-> (ok, text). Smallest honest checker: see the module docstring."""
    m = re.match(r"(\S+)\s+absent\s+/(.*)/\s*$", line)
    if m:
        f = root / m.group(1)
        if not f.exists(): return True, f"{line}  (file absent)"
        body = " ".join(toks(f.read_text()))
        hit = re.search(m.group(2), body, re.I)
        return (not hit), f"{line}  -> " + (f"FOUND {hit.group(0)!r}" if hit else "absent")
    m = re.match(r"(\S+)\s+(\S+)\s*(==|~=)\s*(.+?)\s*$", line)
    if not m: return False, f"unparsable check: {line}"
    f, path, want = root / m.group(1), m.group(2), m.group(4).split()
    tol = 1e-2 if m.group(3) == "~=" else 1e-6
    if not f.exists(): return False, f"{line}  -> {m.group(1)} missing"
    d, _ = parse_dict(toks(f.read_text()))
    got = lookup(d, path)
    if got is None: return False, f"{line}  -> key not found"
    w, g = to_si(want), (to_si(got) if isinstance(got, list) else None)
    if w is not None and g is not None:
        ok = abs(g - w) <= tol * max(abs(w), 1e-30)
    else:
        ok = isinstance(got, list) and got == want
    return ok, f"{line}  -> found {' '.join(got) if isinstance(got, list) else '{...}'}"

def norm(s):
    s = re.sub(r"^\s*>\s?", "", s, flags=re.M)
    return re.sub(r"\s+", " ", s.replace("*", "").replace("`", "")).strip().lower()

def simulate_student_deletes(case_dir, design_text):
    """The app cannot delete (applyEdits: replace or add only), so a removed stream's 0/ file is an ORPHAN
    the engine refuses.  The brief tells the assistant to NAME the file to delete; the student then deletes it.
    Simulate exactly that and nothing more: an engine-reported ORPHAN is deleted only if DESIGN.md names its
    path next to a delete/remove word.  An orphan the reply did not mention stays and the case fails, as it would."""
    root = find_case_root(case_dir)
    if root is None: return []
    env = dict(os.environ, CHOUPO_HOME=str(BIN_HOME))
    _, out = sh([str(BIN_HOME / "choupoSolve"), "--lint", str(root)], str(root), env)
    done = []
    for m in re.finditer(r"ORPHAN\s+(0/\S+)", out):
        rel = m.group(1)
        if re.search(r"(delet|remov|apag|elimin)[^\n]{0,160}" + re.escape(rel) + r"|" + re.escape(rel) +
                     r"[^\n]{0,160}(delet|remov|apag|elimin)", design_text, re.I):
            f = root / rel
            if f.is_file(): f.unlink(); done.append(rel)
    return done

def score_revision(meta, start_snap, case_dir, run_dir, files):
    """Apply the reply over the start (app semantics), score the changes, then the usual run score."""
    for rel, body in files:                       # applyEdits: replace or add, never delete
        pth = Path(rel)
        if pth.is_absolute() or ".." in pth.parts: continue
        dst = case_dir / pth; dst.parent.mkdir(parents=True, exist_ok=True); dst.write_text(body)
    now = snapshot(case_dir)
    changed = sorted(r for r, b in now.items() if start_snap.get(r) != b)
    allowed = {x.strip() for x in meta.get("allowed", "").split(",") if x.strip()} | {"DESIGN.md"}
    extra = [r for r in changed if r not in allowed]
    dtxt = (case_dir / "DESIGN.md").read_text() if (case_dir / "DESIGN.md").exists() else ""
    has_rev = bool(re.search(r"^#+.*revis", dtxt, re.I | re.M))
    quotes = norm(meta["feedback"]) in norm(dtxt)
    deleted = simulate_student_deletes(case_dir, dtxt)
    sc = score_run(case_dir, run_dir)
    sc["revision"] = {"student_deleted": deleted, "files_changed": changed, "n_changed": len(changed), "extra_files": extra,
                      "design_has_revisions": has_rev, "design_quotes_feedback": quotes,
                      "asks_for_numbers": bool(re.search(r"not yet known|paste|new (streams|numbers|results)|please (send|share)", dtxt, re.I))}
    root = find_case_root(case_dir)
    res = []
    for c in meta["checks"]:
        ok, txt = run_check(root, c) if root else (False, f"{c} (no case root)")
        res.append({"ok": ok, "check": txt})
    for tf in meta.get("touch", []):
        res.append({"ok": tf in changed, "check": f"touch {tf}  -> " + ("changed" if tf in changed else "NOT changed")})
    sc["revision"]["checks"] = res
    if meta.get("expect") == "unsupported":
        sc["revision"]["says_unsupported"] = bool(UNSUPPORTED_RE.search(dtxt))
    return sc

def per_solved(rs):
    """Tokens (net input + output) per solved problem, over the runs of rs: '-' when none solved."""
    solved = [r for r in rs if r["score"].get("solves")]
    tot = sum(r["tokens"]["in_net"] + r["tokens"]["out"] for r in rs)
    return (f"{tot // len(solved)}" if solved else "-"), len(solved), tot

def rev_summary(rows, briefs):
    L = ["", "Per brief, REVISION problems:", "",
         "| brief | runs | solved | checks passed | tokens in (net) | tokens out | tokens per solved problem (all runs' tokens / solved) |",
         "|---|---|---|---|---|---|---|"]
    for bn in briefs:
        rs = [r for r in rows if r["brief"] == bn and "revision" in r["score"]]
        if not rs: continue
        cks = [c for r in rs for c in r["score"]["revision"]["checks"]]
        ps, ns, _ = per_solved(rs)
        L.append("| {} | {} | {} | {}/{} | {} | {} | {} |".format(bn, len(rs), ns, sum(c["ok"] for c in cks), len(cks),
                 sum(r["tokens"]["in_net"] for r in rs), sum(r["tokens"]["out"] for r in rs), ps))
    return "\n".join(L)

def rev_table(rows):
    L = ["| brief | problem | solves | balances ok | files changed | outside allowed | student deleted | REVISIONS | quotes feedback | checks | says unsupported |",
         "|---|---|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        s = r["score"]; v = s.get("revision")
        if v is None: continue
        ck = v["checks"]
        L.append("| {} | {} | {} | {} | {} ({}) | {} | {} | {} | {} | {}/{} | {} |".format(
            r["brief"], r["problem"], "yes" if s.get("solves") else "NO", "yes" if s.get("balances_ok") else "NO",
            v["n_changed"], ", ".join(v["files_changed"]), ", ".join(v["extra_files"]) or "-", ", ".join(v["student_deleted"]) or "-",
            "yes" if v["design_has_revisions"] else "NO", "yes" if v["design_quotes_feedback"] else "NO",
            sum(c["ok"] for c in ck), len(ck), {True: "yes", False: "NO", None: "-"}[v.get("says_unsupported")]))
    return "\n".join(L)

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
          "| brief | runs | DESIGN.md present | mean items | lint ok | solves | balances ok | tok in (net) total | tok out total | tok per solved |",
          "|---|---|---|---|---|---|---|---|---|---|"]
    for bn in briefs:
        rs = [r for r in rows if r["brief"] == bn]
        if not rs: continue
        n = len(rs); sc = [r["score"] for r in rs]
        L.append("| {} | {} | {}/{} | {:.1f} | {}/{} | {}/{} | {}/{} | {} | {} | {} |".format(
            bn, n, sum(x["design"]["present"] for x in sc), n,
            sum(x["design"]["items"] for x in sc) / n,
            sum(x.get("lint") == 0 for x in sc), n, sum(bool(x.get("solves")) for x in sc), n,
            sum(bool(x.get("balances_ok")) for x in sc), n,
            sum(r["tokens"]["in_net"] for r in rs), sum(r["tokens"]["out"] for r in rs), per_solved(rs)[0]))
    return "\n".join(L)

def main():
    global NEUTRAL_CWD
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", required=True, help="scratch output dir (never inside tutorials/ or data/)")
    ap.add_argument("--brief", action="append", help="core | bridge | llm | prompts | name=path (repeatable)")
    ap.add_argument("--problems", help="comma list of problem prefixes, e.g. p01,p05")
    ap.add_argument("--model", default="haiku")
    ap.add_argument("--rescore", action="store_true", help="re-score existing reply.txt, call no model")
    ap.add_argument("--endpoint", default=os.environ.get("CHOUPO_LLM_ENDPOINT"),
                    help="OpenAI-compatible chat-completions URL (key in $CHOUPO_LLM_KEY); default: claude -p")
    ap.add_argument("--dry-run", action="store_true", help="print each request, call no model, score nothing")
    a = ap.parse_args()
    PROXY.update(endpoint=a.endpoint, key=os.environ.get("CHOUPO_LLM_KEY"), dry=a.dry_run)
    if a.endpoint:
        if a.model == "haiku":
            a.model = os.environ.get("CHOUPO_LLM_MODEL") or sys.exit("--endpoint needs --model (or $CHOUPO_LLM_MODEL)")
        if not PROXY["key"] and not a.dry_run and not a.rescore:
            sys.exit("--endpoint needs $CHOUPO_LLM_KEY")
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
    elif not a.rescore and not a.dry_run and not a.endpoint:
        j, _ = run_claude("Reply with the single word OK.", a.model)
        if j:
            overhead = usage_of(j)[0]; ov_file.write_text(json.dumps({"in": overhead}))
    rows = []
    for bname, btxt in briefs:
        for p in probs:
            pid = p.stem.split("_")[0]
            rmeta, rbody = parse_problem(p.read_text())
            if bname == "prompts":
                btxt = brief_prompts(pid)
            rd = out / bname / pid; rd.mkdir(parents=True, exist_ok=True)
            reply_f = rd / "reply.txt"; raw_f = rd / "raw.json"
            tokens = {"in": 0, "in_net": 0, "out": 0}
            err = None
            if reply_f.exists() and (a.rescore or raw_f.exists()):
                j = json.loads(raw_f.read_text()) if raw_f.exists() else None
            else:
                prompt = f"{btxt}\n\n---\n\n{INSTRUCTIONS}\n---\n\n{p.read_text()}"
                if rmeta:
                    st = rd / "_start"
                    if st.exists(): shutil.rmtree(st)
                    st.mkdir(); copy_start(rmeta["start"], st)
                    prompt = (f"{btxt}\n\n---\n\n{REV_INSTRUCTIONS}\n---\n\n# The student's current case\n\n"
                              f"{case_dump(st, rmeta.get('omit'))}\n\n# The student's feedback\n\n{rmeta['feedback']}\n")
                if a.dry_run:
                    if a.endpoint:
                        show_request(f"{bname}/{pid}", *endpoint_request(prompt, a.model), prompt)
                    else:
                        print(f"[dry-run] {bname}/{pid}: {CLAUDE} -p --model {a.model} --tools '' "
                              f"--no-session-persistence --output-format json  (stdin: {len(prompt)} chars)")
                    continue
                print(f"[{bname}/{pid}] proxy call ({'endpoint' if a.endpoint else 'claude -p'}), prompt {len(prompt)} chars", file=sys.stderr)
                j, err = run_proxy(prompt, a.model)
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
                shutil.rmtree(case_dir)
            case_dir.mkdir()
            if rmeta:
                copy_start(rmeta["start"], case_dir)
                start_snap = snapshot(case_dir)
                freplies = parse_reply(reply_f.read_text())
                files = [r for r, _ in freplies]; refused = []
                sc = score_revision(rmeta, start_snap, case_dir, rd, freplies)
            else:
                files, refused = write_case(parse_reply(reply_f.read_text()), case_dir)
                sc = score_run(case_dir, rd)
            sc["files"] = files; sc["refused_paths"] = refused
            (rd / "score.json").write_text(json.dumps(sc, indent=1))
            rows.append({"brief": bname, "problem": pid, "tokens": tokens, "score": sc})
            print(f"[{bname}/{pid}] items={sc['design']['items']} lint={sc.get('lint')} solves={sc.get('solves')}",
                  file=sys.stderr)
    if a.dry_run:
        return
    meta = {"date": time.strftime("%Y-%m-%d"), "model": a.model, "endpoint": bool(a.endpoint), "engine_commit": engine_commit(),
            "overhead_in_tokens": overhead, "brief_chars": {n: len(t) for n, t in briefs}}
    (out / "summary.json").write_text(json.dumps({"meta": meta, "rows": rows}, indent=1))
    plain = [r for r in rows if "revision" not in r["score"]]
    md = table(plain, [n for n, _ in briefs]) if plain else ""
    rt = rev_table(rows)
    if rt.count("\n") > 1: md += ("\n\n" if md else "") + "REVISION problems:\n\n" + rt + "\n" + rev_summary(rows, [n for n, _ in briefs])
    (out / "summary.md").write_text(md + "\n")
    print(md)

if __name__ == "__main__":
    main()
