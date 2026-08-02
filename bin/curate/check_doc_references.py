#!/usr/bin/env python3
"""Every path and case name the AI-facing docs point at must exist.

Design record: DEV.md section 5 debt 5.

`bin/llmctx` concatenates `docs/ai/*.md` into the context an assistant uses to
author a case for a user.  A path in there is not decoration -- it is an
instruction the reader will follow, and a dead one costs them a search that
ends nowhere.  Measured on 2026-08-02, out of 213 path mentions and 102 case
names, seven were dead: an archive directory that had been dissolved into the
categorised layout (`tutorials/props/old/`), three starter-table cases that no
longer existed under those names, UNIFAC groups still filed at their
pre-Migration-2 address, a k_ij folder that was never built, and a machinery
credit in CLAUDE.md for two directories that never existed at all.  Each was
individually harmless and collectively they made the docs untrustworthy.

Two checks, both mechanical:

  PATHS       anything shaped like a repo path (tutorials/, src/, data/, ...)
              must exist on disk.
  CASE NAMES  anything shaped like a case name in backticks (`flash01_...`)
              must be a real tutorial directory.

NOT-YET / DELIBERATELY-ABSENT entries are ALLOWED, but only by being listed
below with the reason -- naming a retired thing is legitimate prose and the
list is where that legitimacy is written down, not inferred.

Exit 1 listing the dead references."""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

DOCS = sorted((ROOT / "docs" / "ai").glob("*.md")) + [ROOT / "CLAUDE.md",
                                                      ROOT / "DEV.md"]

PREFIXES = ("tutorials", "src", "bin", "data", "docs", "gui", "make",
            "metadata", "generated", "etc")

#  A path may legitimately not exist.  Each entry says WHY, and the reason is
#  the thing a reviewer checks -- an unexplained entry here is a suppressed
#  failure wearing a whitelist.
ALLOWED_PATHS = {
    # The private tier ships EMPTY and gitignored; the docs describe where a
    # user's own data GOES, which is exactly a path that is absent by design.
    "data/local/components/":            "private tier, ships empty (gitignored)",
    "data/local/parameters/":            "private tier, ships empty (gitignored)",
    "data/local/cosmo/":                 "private tier, ships empty (gitignored)",
    "data/local/CHEMSEP-PAIR-AUDIT.md":  "written by the importer into the private tier",
    # Retired homes, named BECAUSE they are retired.  Removing the mention
    # would lose the instruction not to recreate them.
    "data/proposed/":                        "RETIRED 2026-07-13, named as retired",
    "data/standards/propertyPackages/":      "RETIRED 2026-07-15, named as retired",
    "data/standards/components/true/aqueous/": "RETIRED layout, named as banned",
    "generated/indexes/":  "never built; named in CLAUDE.md as a correction, so\n"
                           "                          the next reader stops looking for it",
    # Hypothetical names in worked examples.
    "tutorials/plant/myPlant/":                  "placeholder in a worked example",
    "tutorials/plant/myPlant":                   "placeholder in a worked example",
    "tutorials/plant/myPlant/sectors/REACTION":  "placeholder in a worked example",
}

#  A source reference without its extension (`src/thermo/SystemClassifier`
#  meaning the .H/.cpp pair) is the project's normal way of naming a
#  translation unit; accept it when either file is there.
SRC_EXT = (".H", ".cpp", ".h", ".hpp")

#  A tutorial case name always starts LOWERCASE (flash01_, batch19_, ctrl16_,
#  userOp01_, cosmoSAC01_, vanKrevelen01_ ...).  Requiring that is what keeps
#  catalogue record names out of the case check: `NF270_dspmde` otherwise
#  parses as NF + "27" + "0_dspmde" and gets reported as a missing tutorial.
#  The uppercase-initial tutorial directories that do exist (SECTOR_R,
#  ChemicalPlantTutorial, ...) carry no NN_ index, so nothing real is lost.
CASE_RE = re.compile(r'`([a-z][A-Za-z0-9]*\d{2}_[A-Za-z0-9_]+)`')
#  `*` and `<...>` are placeholders, not paths -- a mention carrying one is a
#  pattern the reader fills in, so match them and skip rather than truncate the
#  path at the placeholder and then report the stump as missing.
PATH_RE = re.compile(r'(?<![\w/.-])((?:' + "|".join(PREFIXES) +
                     r')/[A-Za-z0-9_./<>*-]+)')
PLACEHOLDER = re.compile(r'[<>*]')

dead = []


def path_exists(p: str) -> bool:
    f = ROOT / p
    if f.exists():
        return True
    return any((ROOT / (p + e)).exists() for e in SRC_EXT)


def main() -> int:
    cases = {d.name for d in (ROOT / "tutorials").glob("*/*") if d.is_dir()}
    cases |= {d.name for d in (ROOT / "tutorials").glob("*/*/*") if d.is_dir()}
    if len(cases) < 100:
        print(f"check_doc_references: only {len(cases)} tutorial dirs found --"
              " the corpus scan is not working, refusing to pass on it")
        return 1

    nPaths = nCases = 0
    for doc in DOCS:
        if not doc.exists():
            dead.append(f"{doc.relative_to(ROOT)}: the doc itself is missing")
            continue
        txt = doc.read_text()
        rel = doc.relative_to(ROOT)

        for p in sorted({m.group(1).rstrip('.,;:)`"\'')
                         for m in PATH_RE.finditer(txt)}):
            nPaths += 1
            if PLACEHOLDER.search(p) or p in ALLOWED_PATHS or path_exists(p):
                continue
            dead.append(f"{rel}: path '{p}' does not exist")

        for c in sorted(set(CASE_RE.findall(txt))):
            nCases += 1
            if c not in cases:
                dead.append(f"{rel}: case '{c}' is not a tutorial directory")

    #  An allow-list entry that has come TRUE is also rot -- the prose still
    #  says "retired" about something now on disk, or the placeholder collided
    #  with a real case.  Say so rather than let it sit.
    for p, why in sorted(ALLOWED_PATHS.items()):
        if path_exists(p):
            dead.append(f"ALLOW-LIST: '{p}' now EXISTS but is listed as"
                        f" absent ({why}) -- update the prose and drop the"
                        " entry, or the docs are describing the opposite of"
                        " what is on disk")

    if dead:
        print("check_doc_references: FAIL")
        for d in dead:
            print("  -", d)
        return 1
    print(f"check_doc_references: OK -- {nPaths} path mention(s) and {nCases}"
          f" case name(s) across {len(DOCS)} AI-facing docs all resolve;"
          f" {len(ALLOWED_PATHS)} deliberate absences are listed with their"
          " reason and none of them has quietly come true")
    return 0


if __name__ == "__main__":
    sys.exit(main())
