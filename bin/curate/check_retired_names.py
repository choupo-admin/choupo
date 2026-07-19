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

4. Aggregated-snapshot spelling: writers/migrators (bin/curate),
   teaching docs (docs/ai) and src comments speak streamFaces/faces{}
   -- never the retired aggregated `streams` name.

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

# ---- 4. aggregated-snapshot spelling: streamFaces/faces{}, never streams ----
# The aggregated instant snapshot is the `streamFaces` file (faces{} block).
# No writer, migrator, source comment or teaching doc may spell the retired
# aggregated name.  Word-boundary regexes: `0/streamFaces` does NOT match.
AGG = re.compile(r"0/streams\b|<t>/streams\b|<n>/streams\b"
                 r"|latest/streams\b|\.\./streams\b")


def tutorial_snapshot_scan_files(tutorials_root):
    """The tutorial files the aggregated-snapshot scan covers.  The AUTHORED
    `0/` directory is IN scope (0/internalState, 0/streamFaces headers teach
    students); numbered TRANSIENT instants (50/, 0.01/, iterations/NNNNNN)
    and other run outputs are not."""
    out = []
    for f in tutorials_root.rglob("*"):
        if not f.is_file():
            continue
        sf = str(f)
        if any(x in sf for x in ("/reports/", "/converged/", "/iterations/",
                                 "/postProcessing/", "/.build/", "/code/")):
            continue                  # run output may carry old artefacts
        if f.name.startswith("log.choupo") or f.suffix in (".csv", ".ods"):
            continue
        rel = f.relative_to(tutorials_root).parts[:-1]
        if any((seg.isdigit() or seg.replace(".", "", 1).isdigit())
               and seg != "0" for seg in rel):
            continue                  # non-zero numbered instant dirs only
        out.append(f)
    return out


# CAUSAL self-test of the scope: a fixture 0/internalState carrying the
# retired spelling MUST be selected (the authored 0/ is in scope) and a
# numbered transient instant must NOT be.  Without this the gate can claim
# coverage its own filter silently skips.
import tempfile
with tempfile.TemporaryDirectory(prefix="choupo-retgate-") as _tmp:
    _t = Path(_tmp) / "tutorials"
    (_t / "case" / "0").mkdir(parents=True)
    (_t / "case" / "0" / "internalState").write_text("// see 0/streams\n")
    (_t / "case" / "100").mkdir()
    (_t / "case" / "100" / "internalState").write_text("// see 0/streams\n")
    _sel = {f.relative_to(_t).as_posix()
            for f in tutorial_snapshot_scan_files(_t)}
    if "case/0/internalState" not in _sel or "case/100/internalState" in _sel:
        print("RETIRED-NAME GATE SELF-TEST FAILED: the snapshot scan scope"
              " is wrong (authored 0/ must be IN, numbered instants OUT);"
              f" selected = {sorted(_sel)}")
        sys.exit(1)

agg_files = []
for d, exts in ((ROOT / "bin" / "curate", (".py",)),
                (ROOT / "docs" / "ai", (".md",)),
                (ROOT / "docs", (".tex",)),
                (ROOT / "src", (".H", ".cpp"))):
    for f in d.rglob("*"):
        if f.suffix in exts:
            agg_files.append(f)
agg_files += tutorial_snapshot_scan_files(ROOT / "tutorials")
for f in agg_files:
    if f.name in ("check_retired_names.py", "check_stream_faces.py"):
        continue                      # the gates name the pattern they hunt
    try:
        txt = f.read_text(errors="replace")
    except OSError:
        continue
    m = AGG.search(txt)
    if m and not allowed_history(txt, m.start()):
        bad.append(f"{f.relative_to(ROOT)}: retired aggregated-snapshot"
                   f" spelling '{m.group(0)}'")

if bad:
    print("RETIRED-NAME GATE FAILED (%d):" % len(bad))
    for b in bad[:60]:
        print("  " + b)
    sys.exit(1)
print("retired-name gate: component corpus flat, tutorial sources clean,"
      " src/ clean, aggregated snapshot speaks streamFaces")
