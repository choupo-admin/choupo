#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""c413_flip -- flip sealed cases to pins, one case at a time, and PROVE each one
(DEV.md 4c C413 slice 2).

    c413_flip.py --pristine DIR --base-bin DIR [--jobs 4] [--only NAME ...] [--out FILE]

For every top-level sealed case under tutorials/ it runs, in this order of
trouble:

  A  identical-only   every copy equals the catalogue record: copies deleted, pinned;
  B  held stale       a copy differs from the catalogue record: kept in force under
                      `held {}` (read alone, announced, hash-verified);
  C  ion / identity   a held copy is a DIFFERENT species under the catalogue's name
                      (ion kept as a component): `distinctFrom <name>;` plus a
                      `variationReason` is added to the record, then it is held;
  D  unclaimed        a local record with a catalogue homonym that the sealed manifest
                      never claimed: `variationOf <name>;` plus a `variationReason`
                      read from the record's own header or the case's README.

The work is `bin/choupo-import --pin --from-sealed` (the engine observes the run and
proposes the pins); this driver only classifies its refusals, declares what the
refusal asks to be declared, retries, and then runs THE PROOF: the sealed case as it
was (from --pristine) on the main build against the flipped case on this build under
CHOUPO_PINS=refuse -- stdout, stderr and every written file identical, after
normalising the commit hash, temp paths, the record HOME labels (`sealed case copy
constant/X` becomes `catalogue data/standards/X`), the package identity, the seal
block and the [held] / [seal] / [sealed] announcements, which are what the flip is
SUPPOSED to change.  A case that fails the proof is restored to its pristine state
and listed with the difference; it stays sealed and blocks nothing.

Never touched here: the unsealed demos, a case with sector manifests, a `code/` case,
pairLookup03 (its subject is a stale seal), the GUI export.  Writes one JSON line per
case to --out (default build/c413_flip.jsonl).
"""
import argparse
import concurrent.futures as cf
import difflib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import case_records  # noqa: E402

NEW_BIN = ROOT / "build" / "linux64Gcc"
MAX_PINS = 60       # a manifest a student can read; above it the case stays sealed

EXCLUDED = {
    "tutorials/props/molecular/pairLookup03_provenance_stale_seal":
        "its subject is a stale SEAL (its golden pins `caseSeal sealed`); it must stay sealed",
}


def top_level_sealed():
    caseDirs = {c.parent.parent for c in Path("tutorials").rglob("system/controlDict")}
    out, skipped = [], {}
    for c in sorted(caseDirs):
        if any(p in caseDirs for p in c.parents):
            continue
        m = c / "constant" / "propertyManifest"
        if not m.exists():
            skipped[str(c)] = "no manifest (an unsealed demo; declared in slice 4)"
            continue
        mf = case_records.read_manifest(m)
        if mf["has_pins"]:
            continue
        if not mf["sealed"]:
            continue
        if str(c) in EXCLUDED:
            skipped[str(c)] = EXCLUDED[str(c)]
        elif len(list(c.rglob("constant/propertyManifest"))) > 1:
            skipped[str(c)] = "sector manifests (one pin set per sector context: a later slice)"
        elif (c / "code").is_dir():
            skipped[str(c)] = "a code/ case: the stock binary cannot run it for the observation"
        else:
            out.append(str(c))
    return out, skipped


# ---------------------------------------------------------------- declarations
def _strip(txt):
    txt = re.sub(r"/\*.*?\*/", "", txt, flags=re.S)
    return re.sub(r"(?m)^\s*//.*$", "", txt)


def formula_of(path):
    m = re.search(r'(?m)^\s*formula\s+"?([^";\s]+)"?\s*;', _strip(Path(path).read_text(errors="replace")))
    return m.group(1) if m else "?"


def header_sentence(path, case):
    """One sentence for variationReason, read from the record's own header comment,
    else from the case's README; never invented."""
    txt = Path(path).read_text(errors="replace")
    m = re.search(r"/\*(.*?)\*/", txt, flags=re.S)
    cands = []
    if m:
        body = re.sub(r"[-*|\\/]{3,}", " ", m.group(1))
        body = re.sub(r"\s+", " ", body).strip()
        cands.append(body)
    readme = Path(case) / "README.md"
    if readme.exists():
        for para in re.split(r"\n\s*\n", readme.read_text(errors="replace")):
            p = re.sub(r"\s+", " ", re.sub(r"^#+.*$", "", para, flags=re.M)).strip()
            if len(p) > 40:
                cands.append(p)
                break
    for c in cands:
        s = re.split(r"(?<=[.!?])\s", c)[0].strip()
        s = s.replace('"', "'").replace("\\", "")
        if len(s) > 25:
            return s[:240]
    return "the case's own record, kept as the sealed run read it (see the header of the file)"


def declare(path, kind, name, reason):
    """Set the record's declaration to `kind name;` + variationReason (replacing one)."""
    p = Path(path)
    txt = p.read_text()
    txt = re.sub(r"(?m)^(overlayOf|variationOf|distinctFrom)\s+\S+;\s*\n", "", txt)
    txt = re.sub(r"(?m)^variationReason\s+.*;\s*\n", "", txt)
    if not txt.endswith("\n"):
        txt += "\n"
    txt += f'\n{kind} {name};\nvariationReason "{reason}";\n'
    p.write_text(txt)


# ---------------------------------------------------------------- the proof
def app_of(case):
    t = _strip((Path(case) / "system" / "controlDict").read_text())
    m = re.search(r"\bapplication\s+(\w+)\s*;", t)
    return m.group(1) if m else "choupoSolve"


def _run(case, bindir, strict, tag):
    tmp = Path(tempfile.mkdtemp(prefix="c413p-" + tag + "-"))
    work = tmp / "case"
    shutil.copytree(case, work, symlinks=True,
                    ignore=shutil.ignore_patterns("converged", "log.*", "iterations", "postProcessing"))
    before = {p.relative_to(work) for p in work.rglob("*") if p.is_file()}
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    env.pop("CHOUPO_PINS", None)
    env.pop("CHOUPO_RECORD_LEDGER", None)
    if strict:
        env["CHOUPO_PINS"] = "refuse"
    try:
        r = subprocess.run([str(bindir / app_of(case)), "."], cwd=work, env=env,
                           capture_output=True, text=True, timeout=3000)
        rc, out = r.returncode, r.stdout + "\n=====STDERR=====\n" + r.stderr
    except subprocess.TimeoutExpired:
        rc, out = -9, "TIMEOUT"
    return tmp, work, rc, out, before


def _norm(t, tmp):
    t = t.replace(str(tmp), "<T>")
    t = re.sub(r"/tmp/c413p-[A-Za-z0-9_]+-[A-Za-z0-9_]+", "<T>", t)
    t = re.sub(r"(?i)(commit[: ]+)[0-9a-f]{7,40}", r"\1<H>", t)
    t = re.sub(r'("commit": ")[0-9a-f]{7,40}', r"\1<H>", t)
    t = re.sub(r"[0-9a-f]{9,40}-dirty|\b[0-9a-f]{9}\b(?=\s*[)\]])", "<H>", t)
    t = re.sub(r'"seal": \{[^}]*\},?\n', '"seal": <S>,\n', t)
    t = re.sub(r"case record constant/(\S+) \(declared variation or held copy, read alone\)", r"<REC>/\1", t)
    t = re.sub(r"(?:sealed case copy constant/|case copy constant/|catalogue data/standards/)(\S+)"
               r"(?: \(on the catalogue record\))?", r"<REC>/\1", t)
    #  which TIER a pair record was read from (a deleted copy is the catalogue's now)
    t = re.sub(r"(pair \S+: )(?:caseLocal|caseRoot|standard)( \()", r"\1<TIER>\2", t)
    t = re.sub(r'("status": ")(?:caseLocal|caseRoot|standard)(")', r"\1<TIER>\2", t)
    #  where a record was read FROM, in any message: the case's own constant/ (sealed) or the catalogue
    t = t.replace(str(ROOT) + "/data/standards/", "<REC>/")
    t = re.sub(r"<T>/case/constant/(components|species|chemistry|parameters|assets|utilities|adsorbents|mixtures)/",
               r"<REC>/\1/", t)
    t = re.sub(r"package [0-9a-f]{16}", "package <P>", t)
    t = re.sub(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d", "<TS>", t)       # wall-clock stamps (solution.log)
    t = "\n".join(l for l in t.split("\n")
                  if not l.startswith(("[held]", "[seal]", "[sealed]")))
    return t


def prove(pristine_case, flipped_case, base_bin):
    ta, wa, ra, oa, ba = _run(pristine_case, base_bin, False, "A")
    tb, wb, rb, ob, bb = _run(flipped_case, NEW_BIN, True, "B")
    problems = []
    if ra != rb:
        problems.append(f"exit {ra} (sealed, main build) vs {rb} (pinned, strict)")
    na, nb = _norm(oa, ta), _norm(ob, tb)
    if na != nb:
        d = [l for l in difflib.unified_diff(na.splitlines(), nb.splitlines(), lineterm="", n=0)
             if not l.startswith(("---", "+++", "@@"))]
        problems.append("stdout/stderr differ (%d lines): %s" % (len(d), " | ".join(x[:260] for x in d[:10])))
    fa = {p.relative_to(wa) for p in wa.rglob("*") if p.is_file()} - ba
    fb = {p.relative_to(wb) for p in wb.rglob("*") if p.is_file()} - bb
    if fa != fb:
        problems.append("written files differ: only sealed %s, only pinned %s" % (sorted(map(str, fa - fb))[:3], sorted(map(str, fb - fa))[:3]))
    for rel in sorted(fa & fb):
        x = _norm((wa / rel).read_text(errors="replace"), ta)
        y = _norm((wb / rel).read_text(errors="replace"), tb)
        if x != y:
            problems.append("file differs: %s" % rel)
            break
    shutil.rmtree(ta, ignore_errors=True)
    shutil.rmtree(tb, ignore_errors=True)
    return problems


# ---------------------------------------------------------------- one case
def restore(case, pristine):
    shutil.rmtree(case)
    shutil.copytree(Path(pristine) / case, case, symlinks=True)


def flip_case(case, pristine, base_bin):
    res = {"case": case, "class": None, "status": None, "held": 0, "deleted": 0,
           "pins": 0, "declared": [], "reason": ""}
    declared_c, declared_d = [], []
    imp = [sys.executable, str(ROOT / "bin" / "choupo-import")]
    for attempt in range(40):
        r = subprocess.run(imp + ["--pin", case, "--from-sealed"], capture_output=True,
                           text=True, cwd=ROOT, timeout=3000)
        out = r.stdout + "\n" + r.stderr
        if r.returncode == 0:
            break
        # --- D: unclaimed homonyms
        m = re.search(r"--pin refuses: .*?:\n((?:  \S+\.dat\n)+)", out)
        if m:
            for rel in re.findall(r"  (\S+\.dat)\n", m.group(1)):
                f = Path(case) / "constant" / rel
                name = f.stem
                declare(f, "variationOf", name, header_sentence(f, case))
                declared_d.append(rel)
            continue
        # --- C: a copy that is a different species under the catalogue's name
        m = re.search(r"the case's record '([^']+)' .*?is (?:HELD as a copy of the catalogue's record but is )?"
                      r"a DIFFERENT species", out)
        if m:
            rel = m.group(1)
            f = Path(case) / "constant" / rel
            name = f.stem
            cat = ROOT / "data" / "standards" / rel
            reason = ("kept as a component under the catalogue's name: the case's %s is formula %s,"
                      " the catalogue's is formula %s, a different species"
                      % (name, formula_of(f), formula_of(cat)))
            declare(f, "distinctFrom", name, reason)
            declared_c.append(rel)
            continue
        # --- a declaration the identity contradicts: it is another species
        m = re.search(r"the case's record '([^']+)' .*?declares `variationOf", out)
        if m:
            rel = m.group(1)
            f = Path(case) / "constant" / rel
            cat = ROOT / "data" / "standards" / rel
            declare(f, "distinctFrom", f.stem,
                    "kept under the catalogue's name: the case's %s is formula %s, the catalogue's is formula %s,"
                    " a different species" % (f.stem, formula_of(f), formula_of(cat)))
            declared_d = [x for x in declared_d if x != rel]
            declared_c.append(rel)
            continue
        res.update(status="left-sealed", reason="--pin refused: " + " ".join(out.split())[-420:])
        restore(case, pristine)
        return res
    else:
        res.update(status="left-sealed", reason="--pin did not settle in 40 attempts")
        restore(case, pristine)
        return res

    m = re.search(r"pins: (\d+) record\(s\); held: (\d+); copies deleted \(identical\): (\d+)", out)
    if m:
        res["pins"], res["held"], res["deleted"] = int(m.group(1)), int(m.group(2)), int(m.group(3))
    #  A run that scans WHOLE directories of the catalogue (the aqueous speciation network reads every
    #  species, chemistry and component record) consumes more than a reader can read in a manifest, and
    #  the relevance rule has no closure for it: the case stays sealed, said so, until it has one.
    if res["pins"] > MAX_PINS:
        res.update(status="left-sealed",
                   reason="the run consumes %d catalogue records (it scans whole species/chemistry/components"
                          " directories): a manifest nobody can read; the relevance rule has no closure for"
                          " an aqueous network yet" % res["pins"])
        restore(case, pristine)
        return res
    res["declared"] = sorted(set(declared_c + declared_d))
    res["class"] = "C" if declared_c else "D" if declared_d else "B" if res["held"] else "A"
    problems = prove(Path(pristine) / case, case, Path(base_bin))
    if problems:
        res.update(status="left-sealed", reason="proof failed: " + " ;; ".join(problems)[:600])
        restore(case, pristine)
        return res
    res["status"] = "flipped"
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pristine", required=True, help="a copy of the repository's tutorials/ before the flip")
    ap.add_argument("--base-bin", required=True, help="the main build's binaries (the sealed side of the proof)")
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--out", default=str(ROOT / "build" / "c413_flip.jsonl"))
    a = ap.parse_args()
    os.chdir(ROOT)
    cases, skipped = top_level_sealed()
    if a.only:
        cases = [c for c in cases if any(o in c for o in a.only)]
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    with open(a.out, "w") as out, cf.ThreadPoolExecutor(a.jobs) as ex:
        for c, why in skipped.items():
            out.write(json.dumps({"case": c, "status": "left-sealed", "class": "-", "reason": why}) + "\n")
        futs = {ex.submit(flip_case, c, a.pristine, a.base_bin): c for c in cases}
        for f in cf.as_completed(futs):
            try:
                r = f.result()
            except Exception as e:           # a driver defect must not stop the batch
                r = {"case": futs[f], "status": "left-sealed", "class": "-",
                     "reason": "driver error: %r" % (e,)}
                try:
                    restore(futs[f], a.pristine)
                except Exception:
                    pass
            out.write(json.dumps(r) + "\n")
            out.flush()
            print(r["status"], r.get("class"), r["case"], r.get("reason", "")[:120], flush=True)


if __name__ == "__main__":
    main()
