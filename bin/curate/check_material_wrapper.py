#!/usr/bin/env python3
"""Gate: the `material { ... }` wrapper — one rule, and ONE form per inlet.

    bin/curate/check_material_wrapper.py

WHY THIS EXISTS.  Vítor's aqueous-analysis ruling (2026-08-10) made a
total flow and a laboratory analysis one heading, because neither means
anything without the other.  His correction to the proposal is the part
this gate pins:

    "the parser understands both alternatives" does NOT mean the same
    stream may contain two competing material specifications.

So the wrapper is READ for every canonical form, and a stream declaring
the wrapper beside a top-level material form is REFUSED rather than
resolved by a precedence nobody declared.

WHAT THIS CHECKS, all from fresh runs:

  (A1) THE CANONICAL ROUND TRIP.  `analysis01_water_analysis_inlet` with
       its `aqueousAnalysis` block moved inside `material { ... }`
       resolves to the SAME answer as the corpus case: same pH, same
       conserved inventory, same reconciliation.  A spelling that changed
       an answer would not be a spelling.
  (A2) THE AMBIGUITY REFUSAL fires, naming the offending key -- a wrapper
       beside a bare top-level form.
  (A3) ONE RULE, NO SPECIAL CASE: the wrapper also serves a NON-analysis
       form (componentMolarFlows), because a wrapper that only worked for
       the form it was introduced for would be a second grammar wearing
       the first one's name.

WHAT THIS DOES **NOT** COVER, stated so the green line cannot imply it:

  * it does not check the WRITER, because there is none to check: the
    analysis form is author-only input, and `converged/` emits the
    RESOLVED `componentMolarFlows` + `speciation` + `calculated {}`.  The
    "writer emits only the canonical form" clause of the ruling has no
    subject for this form, and inventing a writer to satisfy a clause
    would be worse than reporting that.
  * it does not check `equilibriumState`.  RESOLVED 2026-08-10 (this
    note used to say "escalated, not decided here"): Vitor ruled it a
    CROSS-REFERENCE, never a copy -- the canonical home stays THE TWO
    BASES, and `calculated { equilibriumState }` carries only a target +
    fingerprint the reader re-verifies.  Its own gate is
    check_equilibrium_state_ref.
  * it does not check the analytical qualifier (slice C) or calculated
    density (slice B).

SABOTAGE-VERIFIED 2026-08-10; OBSERVED output recorded, not predicted.

Sabotage 1 -- the ambiguity refusal removed (the wrapper silently wins):

    check_material_wrapper: FAILED
      A2: a stream declaring `material {}` AND a top-level
      componentMolarFlows was ACCEPTED -- exactly one authoritative
      material-input form is selected per inlet, and an undeclared
      precedence is what this refusal exists to prevent

Sabotage 2 -- form detection left on the top level while reading moved
into the wrapper (the detect/read split):

    check_material_wrapper: FAILED
      A1: the wrapped case refused where the corpus case runs -- 'stream
      state feed: no material-flow specification ...'; detection and
      reading must share one source
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CASE = os.path.join(ROOT, "tutorials", "steady", "flash",
                    "analysis01_water_analysis_inlet")
CMF_CASE = os.path.join(ROOT, "tutorials", "steady", "flash",
                        "flash01_benzene_toluene")
SOLVE = os.path.join(ROOT, "build", "linux64Gcc", "choupoSolve")
ENV = dict(os.environ, CHOUPO_HOME=ROOT)

fails = []


def run(cwd):
    p = subprocess.run([SOLVE], cwd=cwd, env=ENV, capture_output=True,
                       text=True, timeout=900)
    return p.returncode, p.stdout + p.stderr


def result_json(text):
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  text, re.S)
    return json.loads(m.group(1)) if m else None


def wrap_block(path, key):
    """Move the top-level `key { ... }` block inside `material { ... }`.

    Anchored at column 0 deliberately: an earlier draft matched the key
    inside a COMMENT (the file documents its own grammar) and wrapped a
    fragment, producing an unmatched brace instead of a test."""
    s = open(path, encoding="utf-8").read()
    m = re.search(rf"^{key}\s*$", s, re.M)
    if not m:
        return False
    i = m.start()
    j = s.index("{", i)
    depth, k = 0, j
    while True:
        if s[k] == "{":
            depth += 1
        elif s[k] == "}":
            depth -= 1
        if depth == 0:
            break
        k += 1
    block, rest = s[i:k + 1], s[:i] + s[k + 1:]
    open(path, "w", encoding="utf-8").write(
        rest.rstrip() + "\n\nmaterial\n{\n    "
        + block.replace("\n", "\n    ") + "\n}\n")
    return True


def stage(src):
    d = tempfile.mkdtemp(prefix="matwrap_")
    dst = os.path.join(d, os.path.basename(src))
    shutil.copytree(src, dst)
    return d, dst


# ---- A1: the canonical round trip ---------------------------------------
rc0, out0 = run(CASE)
base = result_json(out0)
tmp, case = stage(CASE)
try:
    feed = os.path.join(case, "0", "feed")
    if not wrap_block(feed, "aqueousAnalysis"):
        fails.append("A1: no top-level `aqueousAnalysis` block in the witness "
                     "case -- the gate's subject moved")
    else:
        rc1, out1 = run(case)
        got = result_json(out1)
        if rc1 != 0 or got is None:
            first = next((l for l in out1.splitlines() if "ERROR" in l), "")
            fails.append(f"A1: the wrapped case refused where the corpus case "
                         f"runs -- '{first.strip()}'; detection and reading "
                         f"must share one source")
        elif base is not None:
            pb = base["kpis"]["flash01"]["pH"]
            pg = got["kpis"]["flash01"]["pH"]
            if abs(pg - pb) > 1e-9 * max(1.0, abs(pb)):
                fails.append(f"A1: the wrapper CHANGED the answer -- pH {pg} "
                             f"wrapped vs {pb} bare.  A spelling that moves a "
                             f"number is not a spelling.")
finally:
    shutil.rmtree(tmp, ignore_errors=True)

# ---- A2: ambiguous double specification refuses -------------------------
tmp, case = stage(CASE)
try:
    feed = os.path.join(case, "0", "feed")
    wrap_block(feed, "aqueousAnalysis")
    with open(feed, "a", encoding="utf-8") as f:
        f.write("\ncomponentMolarFlows\n{\n    water  1.0 kmol/h;\n}\n")
    rc2, out2 = run(case)
    if rc2 == 0:
        fails.append("A2: a stream declaring `material {}` AND a top-level "
                     "componentMolarFlows was ACCEPTED -- exactly one "
                     "authoritative material-input form is selected per "
                     "inlet, and an undeclared precedence is what this "
                     "refusal exists to prevent")
    elif "AMBIGUOUS" not in out2 or "componentMolarFlows" not in out2:
        fails.append("A2: it refused, but without naming the ambiguity or the "
                     "offending key -- a refusal a reader cannot act on is "
                     "half a refusal")
finally:
    shutil.rmtree(tmp, ignore_errors=True)

# ---- A3: one rule -- the wrapper serves a NON-analysis form -------------
if os.path.isdir(CMF_CASE):
    rcb, outb = run(CMF_CASE)
    baseb = result_json(outb)
    tmp, case = stage(CMF_CASE)
    try:
        feed = os.path.join(case, "0", "feed")
        if os.path.exists(feed) and wrap_block(feed, "componentMolarFlows"):
            rc3, out3 = run(case)
            got3 = result_json(out3)
            if rc3 != 0 or got3 is None:
                first = next((l for l in out3.splitlines() if "ERROR" in l), "")
                fails.append(f"A3: the wrapper failed on a NON-analysis form "
                             f"-- '{first.strip()}'.  It is one rule, or it is "
                             f"a second grammar wearing the first one's name.")
            elif baseb is not None:
                kb = sorted(baseb["kpis"])[0]
                a = baseb["kpis"][kb]
                b = got3["kpis"].get(kb, {})
                for k, v in a.items():
                    if k in b and abs(b[k] - v) > 1e-9 * max(1.0, abs(v)):
                        fails.append(f"A3: the wrapper changed {kb}.{k} "
                                     f"({b[k]} vs {v})")
                        break
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

if fails:
    print("check_material_wrapper: FAILED")
    for f in fails:
        print("  " + f)
    sys.exit(1)

print("check_material_wrapper: OK -- the `material { ... }` wrapper resolves"
      " identically to the bare form (analysis AND componentMolarFlows: one"
      " rule), and a wrapper beside a top-level form is refused by name."
      "  NOT COVERED: the writer (the analysis form is author-only input;"
      " converged/ emits the resolved material, so the ruling's"
      " writer-emits-canonical clause has no subject here), the"
      " `equilibriumState` cross-reference (its own gate:"
      " check_equilibrium_state_ref), and slices C/B.")
