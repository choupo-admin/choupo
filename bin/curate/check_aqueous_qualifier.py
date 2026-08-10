#!/usr/bin/env python3
"""Gate: the analytical qualifier (slice C) -- no default, no inference.

    bin/curate/check_aqueous_qualifier.py

WHY THIS EXISTS.  Vitor's slice-C ruling (2026-08-10): whether a reported
value is a dissolved concentration, a total, or a free-ion measurement is a
property of the SAMPLE PREPARATION and the analytical method -- a fact about
the laboratory Choupo cannot infer safely.  The proposal's "default to
dissolved, announced" was REJECTED: there is NO default at all.  The grammar
is a block-level `defaultQualifier` with per-analyte `qualifier` overrides;
a row neither resolves REFUSES; `total` and `freeIon` are parsed and
PRESERVED but their calculation refuses until their meaning is honoured.

WHAT THIS CHECKS, all through real engine runs on staged copies of
`analysis01_water_analysis_inlet` (which now declares
`defaultQualifier dissolved;`):

  (Q1) THE DECLARED CASE runs, and the resolved snapshot PRESERVES the
       semantics as data: `defaultQualifier dissolved;` in the
       analysisReconciliation record and `qualifier dissolved;` on every
       measured row -- with no inline comment inside a row (the
       row-swallowing trap this writer has hit before, and hit AGAIN
       building this slice: the first draft's `// from defaultQualifier`
       ate each row's uncertainty and closing brace).
  (Q2) NEITHER RESOLVES: `defaultQualifier` removed and no row qualifier --
       refuses naming the analyte and BOTH remedies.
  (Q3) A PER-ROW OVERRIDE resolves that row -- with the default removed and
       `qualifier dissolved;` added to every analyte row, the case runs
       identically (same pH as the reference run).
  (Q4) `total` REFUSES at resolution, naming the collapse it would commit
       (dissolved / total-recoverable / particulate-bearing).
  (Q5) `freeIon` REFUSES at resolution, naming the speciation boundary and
       the preservation promise (never quietly reinterpreted as a total).
  (Q6) an UNKNOWN word refuses naming the vocabulary.

WHAT THIS DOES **NOT** COVER, stated so the green line cannot imply it:

  * the SEMANTICS of `total` and `freeIon` -- they have none yet, by ruling;
    when a future slice defines them, this gate's Q4/Q5 arms must be
    rewritten, not merely deleted;
  * the A1/A2 reconciliation arithmetic (check_aqueous_analysis /
    check_aqueous_reconciliation own it);
  * whether `dissolved` is TRUE of any given laboratory sheet -- that is the
    author's declaration, which is the whole point.

SABOTAGE-VERIFIED 2026-08-10; OBSERVED output recorded, not predicted.

Sabotage 1 -- the resolution refusal removed (unqualified rows silently
accepted):

    check_aqueous_qualifier: FAILED
      Q2: an analyte with no qualifier and no defaultQualifier was ACCEPTED
      -- the ruling is that there is NO default, announced or otherwise

Sabotage 2 -- freeIon quietly reinterpreted (the refusal replaced by a
fall-through to dissolved):

    check_aqueous_qualifier: FAILED
      Q5: a freeIon analyte was ACCEPTED -- it must refuse at resolution;
      reinterpreting a free-ion measurement as a total is exactly what the
      preservation clause forbids
"""

import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CASE = os.path.join(ROOT, "tutorials", "steady", "flash",
                    "analysis01_water_analysis_inlet")
SOLVE = os.path.join(ROOT, "build", "linux64Gcc", "choupoSolve")
ENV = dict(os.environ, CHOUPO_HOME=ROOT)

fails = []


def run(cwd):
    p = subprocess.run([SOLVE], cwd=cwd, env=ENV, capture_output=True,
                       text=True, timeout=900)
    return p.returncode, p.stdout + p.stderr


def pH_of(out):
    m = re.search(r'"pH":\s*([0-9.eE+-]+)', out)
    return float(m.group(1)) if m else None


def staged(mutate=None):
    d = tempfile.mkdtemp(prefix="qual_")
    dst = os.path.join(d, "case")
    shutil.copytree(CASE, dst)
    if mutate:
        p = os.path.join(dst, "0", "feed")
        s = open(p, encoding="utf-8").read()
        s2 = mutate(s)
        if s2 == s:
            shutil.rmtree(d, ignore_errors=True)
            return None, None, "mutation did not apply"
        open(p, "w", encoding="utf-8").write(s2)
    rc, out = run(dst)
    return (d, dst), (rc, out), None


NO_DEFAULT = lambda s: re.sub(r"\n\s*defaultQualifier\s+dissolved;\n", "\n", s)


def per_row(s):
    s = NO_DEFAULT(s)
    #  every analyte row is the sub-dict spelling in this case
    s = s.replace("{ value  84.0 mg/L;",
                  "{ value  84.0 mg/L;  qualifier dissolved;")
    s = s.replace("{ value  45.0 mg/L;",
                  "{ value  45.0 mg/L;  qualifier dissolved;")
    s = s.replace("value          143.0 mg/L;",
                  "value          143.0 mg/L;\n            qualifier      dissolved;")
    return s


# ---- Q1: the declared case, and the preserved semantics -------------------
st, (rc, out), err = staged()
try:
    if rc != 0:
        fails.append("Q1: the declared witness refused -- " + out[-300:])
        base_pH = None
    else:
        base_pH = pH_of(out)
        conv = open(os.path.join(st[1], "converged", "feed"),
                    encoding="utf-8").read()
        if "defaultQualifier       dissolved;" not in conv:
            fails.append("Q1: the resolved snapshot does not preserve "
                         "`defaultQualifier dissolved;` in the "
                         "analysisReconciliation record")
        rows = re.findall(r"^\s+\w+ \{ amount [^\n]*\}", conv, re.M)
        for r in rows:
            if "qualifier dissolved;" not in r:
                fails.append(f"Q1: a measured row lost its qualifier: {r[:80]}")
            if re.search(r"qualifier[^}]*//[^}]*\b(uncertainty|\})", r):
                fails.append("Q1: an inline comment inside a measured row -- "
                             "the row-swallowing trap")
finally:
    if st:
        shutil.rmtree(st[0], ignore_errors=True)

# ---- Q2: neither resolves --------------------------------------------------
st, res, err = staged(NO_DEFAULT)
if err:
    fails.append("Q2: " + err)
else:
    rc, out = res
    shutil.rmtree(st[0], ignore_errors=True)
    if rc == 0:
        fails.append("Q2: an analyte with no qualifier and no "
                     "defaultQualifier was ACCEPTED -- the ruling is that "
                     "there is NO default, announced or otherwise")
    elif "defaultQualifier" not in out or "qualifier" not in out:
        fails.append("Q2: it refused, but without naming both remedies")

# ---- Q3: per-row overrides resolve without a default ----------------------
st, res, err = staged(per_row)
if err:
    fails.append("Q3: " + err)
else:
    rc, out = res
    shutil.rmtree(st[0], ignore_errors=True)
    if rc != 0:
        fails.append("Q3: per-row `qualifier dissolved;` on every analyte "
                     "did not resolve -- " + out[-300:])
    elif base_pH is not None:
        got = pH_of(out)
        if got is None or abs(got - base_pH) > 1e-9:
            fails.append(f"Q3: the per-row spelling changed the answer "
                         f"(pH {got} vs {base_pH}) -- a spelling that moves "
                         f"a number is not a spelling")

# ---- Q4/Q5/Q6: the three refusing words -----------------------------------
for word, q, need in [
    ("total",   "Q4", "must be defined precisely"),
    ("freeIon", "Q5", "speciation"),
    ("murky",   "Q6", "vocabulary"),
]:
    st, res, err = staged(lambda s, w=word: s.replace(
        "{ value  84.0 mg/L;", "{ value  84.0 mg/L;  qualifier " + w + ";"))
    if err:
        fails.append(f"{q}: {err}")
        continue
    rc, out = res
    shutil.rmtree(st[0], ignore_errors=True)
    if rc == 0:
        fails.append(f"{q}: a {word} analyte was ACCEPTED -- it must refuse "
                     f"at resolution"
                     + ("; reinterpreting a free-ion measurement as a total "
                        "is exactly what the preservation clause forbids"
                        if word == "freeIon" else ""))
    elif need not in out:
        fails.append(f"{q}: '{word}' refused, but the refusal does not say "
                     f"why (expected it to mention '{need}')")

if fails:
    print("check_aqueous_qualifier: FAILED")
    for f in fails:
        print("  " + f)
    sys.exit(1)

print("check_aqueous_qualifier: OK -- the declared case preserves its "
      "qualifiers as data (block default + every measured row, no inline "
      "row comments); an unresolved analyte refuses naming both remedies; "
      "per-row overrides resolve to the identical answer; total, freeIon "
      "and an unknown word each refuse naming their reason.  NOT COVERED: "
      "total/freeIon SEMANTICS (none exist yet, by ruling -- Q4/Q5 must be "
      "rewritten when a slice defines them), the reconciliation arithmetic "
      "(its own gates), and whether `dissolved` is true of a given sheet "
      "(the author's declaration, which is the point).")
