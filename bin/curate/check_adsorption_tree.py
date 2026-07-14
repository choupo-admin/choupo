#!/usr/bin/env python3
# -----------------------------------------------------------------------------
#  check_adsorption_tree.py -- layout gate for the adsorption data tree
#
#  Forum #106/#116 A1 contract (migrated 2026-07-12):
#    * data/standards/adsorbents/<name>.dat  = INTRINSIC identity ONLY.
#      An embedded isotherms{} block is the pre-migration layout -- a second
#      home for pair data that silently drifts.  HARD FAIL, no dual reader.
#    * data/standards/parameters/adsorption/equilibria/<adsorbent>/<species>.dat
#      = ONE record per (adsorbent x adsorbate) pair.  Every record must
#      declare model, loadingBasis, pressureBasis (bases are converted by the
#      engine, never guessed) and provenance{}, and its `adsorbent` key must
#      match the directory it lives in (a mislabelled record is refused).
#
#  Exit 1 on any violation.  Comments are stripped before matching so header
#  prose never false-positives.
# -----------------------------------------------------------------------------
import re, sys
from pathlib import Path

repo = Path(__file__).resolve().parents[2]

def code_text(path):
    """File text with /* */ and // comments stripped."""
    t = path.read_text(errors="ignore")
    t = re.sub(r"/\*.*?\*/", "", t, flags=re.S)
    t = re.sub(r"//[^\n]*", "", t)
    return t

fails = []

# (a) adsorbent identity files: no embedded isotherms{}
ads_dir = repo / "data/standards/adsorbents"
n_ads = 0
for p in sorted(ads_dir.glob("*.dat")):
    n_ads += 1
    if re.search(r"(?m)^\s*isotherms\b", code_text(p)):
        fails.append(f"{p.relative_to(repo)}: embedded isotherms{{}} block -- "
                     "equilibrium is PAIR data; move it to data/standards/"
                     "parameters/adsorption/equilibria/<adsorbent>/<species>.dat "
                     "and delete the block (no dual reader).")

# (b) equilibrium records: mandatory declarations + directory match
eq_dir = repo / "data/standards/parameters/adsorption/equilibria"
n_eq = 0
for p in sorted(eq_dir.rglob("*.dat")) if eq_dir.exists() else []:
    n_eq += 1
    t = code_text(p)
    rel = p.relative_to(repo)
    for key in ("model", "loadingBasis", "pressureBasis", "adsorbent", "adsorbate"):
        if not re.search(rf"(?m)^\s*{key}\s+\S", t):
            fails.append(f"{rel}: missing mandatory `{key}` declaration")
    if not re.search(r"(?m)^\s*provenance\s*", t) or "provenance" not in t:
        fails.append(f"{rel}: missing provenance{{}} block")
    quality = re.search(r"(?m)^\s*quality\s+([\w.\-]+)\s*;", t)
    if not quality:
        fails.append(f"{rel}: missing mandatory `quality` declaration")
    elif quality.group(1) == "teachingOnly":
        origin = re.search(r"(?m)^\s*origin\s+([\w.\-]+)\s*;", t)
        if not origin or origin.group(1) != "assumed":
            fails.append(f"{rel}: teachingOnly records must declare `origin assumed`; "
                         "a cited basis is not evidence that these parameters were "
                         "measured or reproducibly regressed")
    m = re.search(r"(?m)^\s*adsorbent\s+([\w.\-]+)\s*;", t)
    if m and m.group(1) != p.parent.name:
        fails.append(f"{rel}: declares adsorbent '{m.group(1)}' but lives under "
                     f"'{p.parent.name}/' -- a mislabelled record is refused, "
                     "not re-homed")

print(f"checked {n_ads} adsorbent identity file(s), {n_eq} equilibrium record(s)")
if fails:
    print("\nADSORPTION-TREE VIOLATIONS:")
    for f in fails:
        print("  " + f)
    sys.exit(1)
print("adsorption tree clean: identity-only adsorbents, fully-declared pair records.")
