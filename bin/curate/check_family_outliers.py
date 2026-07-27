#!/usr/bin/env python3
"""Family-outlier curation gate (born 2026-07-27 from a real defect).

A curated equilibrium constant is hard to eyeball: -4.059 looks as
plausible as +1.106.  But chemical FAMILIES are not arbitrary -- the
alkaline-earth bicarbonate ion pairs, the alkali halide solubilities, the
divalent-metal hydroxide complexes each cluster tightly.  A value orders of
magnitude away from its own family is almost always a transcription or
re-baselining error, and this gate says so.

THE DEFECT THAT CAUSED THIS GATE.  chemistry/CaHCO3-formation.dat held

    logK25 -4.059 ;  dH 158117.5 J/mol

against siblings MgHCO3+ (+1.07 / 3305), SrHCO3+ (+1.18 / 25313) and
BaHCO3+ (+0.98 / 23263) -- five orders of magnitude out on log K and six
times the highest sibling on dH, while CITING a source (phreeqc.dat) that
holds log_k 1.106.  Nothing in the corpus noticed; the pair silently never
formed, overestimating free Ca2+ and calcite saturation.

WHAT IT DOES.  Groups records by declared FAMILY (same reaction shape over
a periodic-family cation set, read from the stoichiometry -- never from the
file name), and reports a member whose logK25 or dH sits beyond a declared
number of median-absolute-deviations from its siblings.

WHAT IT IS NOT.  It never "corrects" anything and never fails on a lone
record with no family.  A flagged value may be perfectly right -- chemistry
has real outliers.  The gate's claim is only "this deserves a human eye",
which is why it reports and, by default, does NOT fail the suite.  Pass
--strict to make outliers fatal once the corpus is clean.
"""
import re
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STD = ROOT / "data" / "standards"

# Cation families whose members are chemically comparable.  Declared, not
# inferred: a curator adds a family deliberately.
FAMILIES = {
    "alkalineEarth": ["Mg", "Ca", "Sr", "Ba"],
    "alkali":        ["Li", "Na", "K", "Rb", "Cs"],
    "divalentTM":    ["Mn", "Fe", "Co", "Ni", "Cu", "Zn"],
}
MAD_LIMIT = 6.0        # median-absolute-deviations before we speak up
MIN_SIBLINGS = 3       # never judge a pair on one sibling


def strip(t):
    t = re.sub(r'/\*.*?\*/', '', t, flags=re.S)
    return re.sub(r'//.*$', '', t, flags=re.M)


records = []
for p in sorted((STD / "chemistry").glob("*.dat")):
    raw = p.read_text()
    if "recordType aqueousSpeciation" not in raw:
        continue
    t = strip(raw)
    sp = re.search(r'\bspecies\s+([A-Za-z0-9_]+)\s*;', t)
    k = re.search(r'\blogK25\s+(-?[\d.eE+-]+)', t)
    if not (sp and k):
        continue
    dH = re.search(r'\bdH\s+(-?[\d.eE+-]+)\s*;', t)
    masters = [(m, int(n)) for m, n in
               re.findall(r'\{\s*ion\s+([A-Za-z0-9_]+)\s*;\s*nu\s+([+-]?\d+)',
                          t)]
    nw = re.search(r'\bnuWater\s+([+-]?[\d.]+)\s*;', t)
    records.append(dict(home=p.name, species=sp.group(1),
                        logK=float(k.group(1)),
                        dH=float(dH.group(1)) if dH else None,
                        masters=masters,
                        nuWater=float(nw.group(1)) if nw else 0.0))


def shape(rec, cation):
    """The reaction shape with the family cation abstracted away, so that
    Mg/Ca/Sr/Ba bicarbonate pairs land in ONE bucket."""
    parts = sorted((("M" if m == cation else m), n) for m, n in rec["masters"])
    return (tuple(parts), rec["nuWater"])


findings = []
for fam, cations in FAMILIES.items():
    buckets = {}
    for r in records:
        present = [m for m, _ in r["masters"] if m in cations]
        if len(present) != 1:
            continue
        buckets.setdefault(shape(r, present[0]), []).append(r)
    for sh, members in buckets.items():
        if len(members) < MIN_SIBLINGS:
            continue
        for field in ("logK", "dH"):
            vals = [(m, m[field]) for m in members if m[field] is not None]
            if len(vals) < MIN_SIBLINGS:
                continue
            xs = [v for _, v in vals]
            med = statistics.median(xs)
            mad = statistics.median([abs(x - med) for x in xs])
            if mad == 0:
                continue
            for m, v in vals:
                score = abs(v - med) / mad
                if score > MAD_LIMIT:
                    sibs = ", ".join(f"{o['species']} {o[field]:.4g}"
                                     for o, ov in vals if o is not m)
                    findings.append(
                        f"{m['home']}: {field} = {v:.6g} is {score:.0f} MAD "
                        f"from its {fam} family (median {med:.4g})\n"
                        f"      siblings: {sibs}\n"
                        f"      -> transcription / re-baselining error?  "
                        f"check the record against its own cited source")

print(f"family-outlier gate: {len(records)} constants over "
      f"{len(FAMILIES)} declared families")
if findings:
    print(f"  {len(findings)} value(s) deserve a human eye:")
    for f in findings:
        print("  " + f)
    if "--strict" in sys.argv:
        sys.exit(1)
else:
    print("  no family outliers")
sys.exit(0)
