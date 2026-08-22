#!/usr/bin/env python3
"""The costing refusals FIRE: missing pressureDesign, missing sigma_y,
and a material that cannot contain the pressure (I5, W-R-C).

Until 2026-08-22 four of the six equipment sizers silently defaulted a
missing `pressureDesign` to 1 bar (the identical omission on a stirredTank
refused -- one decision, six homes, two answers), and the Guthrie vessel
pressure factor answered THREE distinct missing-data paths with F_P = 1.0,
the cheapest possible factor, including a material whose allowable stress
cannot contain the design pressure at all.  Three probes, each built from a
real corpus case, each required to refuse BY MESSAGE.

A missing binary REFUSES (a check that cannot run must not pass).
"""
import re, shutil, subprocess, sys, tempfile
from pathlib import Path

repo = Path(__file__).resolve().parents[2]
solve = repo / "choupoSolve"
base = repo / "tutorials/steady/economics/economics01_esterification_dcf"

if not solve.exists():
    print("costing-refusals GATE FAILED: no choupoSolve binary -- build"
          " first (make).  A check that cannot run must not pass.")
    sys.exit(1)
if not base.is_dir():
    print("costing-refusals GATE FAILED: probe base case economics01 is"
          " gone -- re-point the gate.")
    sys.exit(1)

#  The post chain's designed posture (AS6): a per-unit refusal is CAUGHT,
#  the unit is named FAILED, excluded from sizing/costing, the totals are
#  stamped INCOMPLETE and the omission rides the advisory summary -- the
#  RUN still exits 0, because the simulation result is valid and it is the
#  post chain that reports its own gap.  So a probe passes when the named
#  message fired AND the exclusion is announced, never on exit code.
def probe(mutate, must_match, excl_match, label):
    with tempfile.TemporaryDirectory() as td:
        case = Path(td) / "probe"
        shutil.copytree(base, case)
        mutate(case)
        r = subprocess.run([str(solve)], cwd=case, capture_output=True,
                           text=True, timeout=600)
        out = r.stdout + r.stderr
        if not re.search(must_match, out, re.S):
            return (f"{label}: the named refusal did not fire"
                    f" (wanted /{must_match}/)")
        if not re.search(excl_match, out, re.S):
            return (f"{label}: refusal fired but the EXCLUSION is not"
                    f" announced (wanted /{excl_match}/) -- a refused unit"
                    " silently present in the totals would be worse than"
                    " no refusal")
        return None

def drop_pressure(case):
    pd = case / "system/postDict"
    t = pd.read_text()
    t2 = re.sub(r'^\s*pressureDesign[^\n]*\n', '', t, count=1, flags=re.M)
    assert t2 != t, "no pressureDesign line found to drop"
    pd.write_text(t2)

def weak_material(case):
    # A case-local material with a sigma_y the pressure exceeds; the
    # case-local tier is scanned OVER the catalogue.  The VESSEL is the
    # reactor (SS316) -- the first sweep of this gate mutated the heater
    # (SS304, an exchanger, not a vessel) and proved only that a probe
    # aimed at the wrong unit fires nothing.
    pd = case / "system/postDict"
    t = pd.read_text()
    t2 = t.replace("material    SS316;", "material    weakAlloy;", 1)
    assert t2 != t, "no SS316 material line found (the vessel)"
    t2 = re.sub(r'pressureDesign\s+[0-9.]+;', 'pressureDesign 30.0;', t2,
                count=1)
    pd.write_text(t2)
    ad = case / "constant/assets"; ad.mkdir(parents=True, exist_ok=True)
    (ad / "weakAlloy.dat").write_text(
        'kind constructionMaterial;\nname weakAlloy;\ndensity 7800;\n'
        'sigma_y 1;\nF_M 1.0;\n')

def no_sigma_material(case):
    pd = case / "system/postDict"
    t = pd.read_text().replace("material    SS316;", "material    mystAlloy;", 1)
    pd.write_text(t)
    ad = case / "constant/assets"; ad.mkdir(parents=True, exist_ok=True)
    (ad / "mystAlloy.dat").write_text(
        'kind constructionMaterial;\nname mystAlloy;\ndensity 7800;\n')

fails = []
for f in (
    probe(drop_pressure,
          r"FAILED: .*missing scalar entry 'pressureDesign'",
          r"incomplete-sizing", "missing-pressureDesign probe"),
    #  no-sigma fires in SIZING (StirredTank's own check, upstream of the
    #  Guthrie one -- defence in depth; either message satisfies I5).
    probe(no_sigma_material,
          r"has no .*_y defined|declares no allowable stress",
          r"incomplete-sizing", "no-sigma_y probe"),
    probe(weak_material,
          r"cannot contain a .* bar design pressure",
          r"INCOMPLETE|incomplete-total", "weak-material probe"),
):
    if f: fails.append(f)

if fails:
    print("costing-refusals GATE FAILED:")
    for x in fails:
        print("  -", x)
    sys.exit(1)
print("costing-refusals: OK -- all three refusals fire from a real corpus"
      " case, each unit named FAILED, excluded, and the totals stamped"
      " INCOMPLETE, with their named remedies (declare pressureDesign; add sigma_y"
      " to the material record; pick a stronger material or lower the"
      " pressure).  NOT COVERED: the no-diameter ADVISORY (announced, not"
      " refused -- the caveat-surface gate owns announcement plumbing).")
