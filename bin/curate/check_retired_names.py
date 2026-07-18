#!/usr/bin/env python3
"""Retired-name gate: no SOURCE a student reads may teach a retired
architecture spelling.  A green case with a false comment teaches the wrong
layout.  Three contextual scans -- a record's HOME decides what is retired
there, never a global grep of one word (identity{} inside an asset's
provenance{} is legitimate; the runtime class ThermoPackage is legitimate;
the refusal messages themselves must pronounce the old names):

1. COMPONENT corpus (data/standards/components, data/groupEstimative,
   tutorials .../constant/components/*.dat): the component grammar is FLAT
   -- block spellings (identity/critical/liquidPure/gasIdeal/component{}),
   the bare `nonvolatile <bool>` and any `speciesMap` are offenders, in
   keys AND in comment prose (whitespace/backtick tolerant).

2. TUTORIAL sources (dicts, README, .cho -- not generated output): retired
   case-grammar homes.  Lines explicitly marked as history ("was",
   "retired", "renamed", ...) are allowed.

3. src/: `translateV2` must not exist anywhere.

Exit 1 listing offenders."""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
bad = []

HISTORY = ("was ", "previously", "renamed", "retired", "old ", "legacy",
           "propertyData")


def allowed_history(txt, start):
    line = txt[max(0, txt.rfind("\n", 0, start)):
               txt.find("\n", start)].lower()
    return any(h in line for h in HISTORY)


# ---- 1. component corpus ---------------------------------------------------
COMP_PATTERNS = [
    (re.compile(r"^\s*(identity|critical|liquidPure|gasIdeal|component)"
                r"\s*\n\s*\{", re.M), "block-form component layout"),
    (re.compile(r"`?nonvolatile`?\s*=?\s*`?(true|false)\b"),
     "bare nonvolatile bool (the category is `role nonvolatile;`)"),
    (re.compile(r"speciesMap"), "speciesMap (spelled dissociatesTo{})"),
]

comp_files = []
comp_files += (ROOT / "data" / "standards" / "components").rglob("*.dat")
comp_files += (ROOT / "data" / "groupEstimative").rglob("*.dat")
for f in (ROOT / "tutorials").rglob("*.dat"):
    parts = f.parts
    if "components" in parts and "constant" in parts:
        comp_files.append(f)

for f in comp_files:
    try:
        txt = f.read_text(errors="replace")
    except OSError:
        continue
    for pat, label in COMP_PATTERNS:
        if pat.search(txt):
            bad.append(f"{f.relative_to(ROOT)}: {label}")
            break

# ---- 2. tutorial sources ---------------------------------------------------
TUT_PATTERNS = [
    (re.compile(r"electrolyte/ions\.dat"), "electrolyte/ions.dat"),
    (re.compile(r"constant/propertyDict"), "constant/propertyDict"),
    (re.compile(r"constant/thermoPackage\b"), "constant/thermoPackage"),
    (re.compile(r"`?nonvolatile`?\s*=?\s*`?true\b"),
     "nonvolatile true (the category is `role nonvolatile;`)"),
    (re.compile(r"component\.speciesMap|speciesMap\s*\{"), "speciesMap"),
    (re.compile(r"translateV2"), "translateV2"),
]

for f in (ROOT / "tutorials").rglob("*"):
    if not f.is_file() or f.suffix == ".dat":
        continue                      # .dat handled by the component scan
    n = f.name
    if n.startswith("log.choupo") or n == "expected" or f.suffix in (".csv",
                                                                     ".ods"):
        continue
    sf = str(f)
    if any(x in sf for x in ("/reports/", "/converged/", "/iterations/",
                             "/.build/", "/code/")):
        continue                      # generated output / compiled artifacts
    try:
        txt = f.read_text(errors="replace")
    except OSError:
        continue
    for pat, label in TUT_PATTERNS:
        for m in pat.finditer(txt):
            if allowed_history(txt, m.start()):
                continue
            bad.append(f"{f.relative_to(ROOT)}: {label}")
            break
        else:
            continue
        break

# ---- 3. src/: translateV2 is gone ------------------------------------------
for f in (ROOT / "src").rglob("*"):
    if f.suffix not in (".H", ".cpp"):
        continue
    try:
        if "translateV2" in f.read_text(errors="replace"):
            bad.append(f"{f.relative_to(ROOT)}: translateV2 in src/")
    except OSError:
        continue

if bad:
    print("RETIRED-NAME GATE FAILED (%d):" % len(bad))
    for b in bad[:60]:
        print("  " + b)
    sys.exit(1)
print("retired-name gate: component corpus flat, tutorial sources clean,"
      " src/ clean")
