#!/usr/bin/env python3
"""Gate: the corpus is classified by AUDIENCE, and the tiers mean what they say.

    bin/curate/check_case_tiers.py

THE DOCTRINE (ratified in principle by Vitor, 2026-08-09):

    Tests isolate features.  Tutorials compose features.
    Showcases compose engineering.

    Classify IN PLACE -- move and rename nothing merely to express the view.
    A new case is a WITNESS by default; the learning surface grows only by
    deliberate promotion.

WHY IT WAS NEEDED.  `generated/releaseInventory.json` published
`runnableCases` for every case in the tree -- the key literally called all
335 of them tutorials.  Case count and tutorial count had become synonyms,
so a corpus of hundreds of deliberately narrow regression witnesses was
presented to the public as a learning surface.  Meanwhile only 35 cases
carried a README and the catalogue annotated 161: the tree already knew,
implicitly, that only part of it could be narrated as lessons.

The classification is a `tier` word in the case's own controlDict, so
nothing moves: the same posture as `components/` staying physically flat
while its categories live inside each record (browsability is a VIEW
problem, not a storage problem).

WHAT THIS CHECKS.
  (a) VOCABULARY: every declared tier is one of witness / tutorial /
      showcase.  A typo is a silent demotion to nothing.
  (b) A SHOWCASE COMPOSES ENGINEERING: it must be a multi-unit flowsheet
      (>= 2 units, or a fractal case with sectors).  A single unit cannot
      demonstrate engineering composition, whatever its README says.
  (c) A TUTORIAL IS NARRATED: it must carry a README.md.  A lesson nobody
      wrote down is a witness with ambitions.
  (d) THE COUNTS ARE RECOUNTED, never transcribed: the inventory's byTier
      block must equal a fresh walk of the tree (the release-inventory gate
      owns staleness; this arm owns the tier arithmetic itself).

WHAT THIS DOES NOT CHECK, said plainly:
  * WHETHER A CASE IS IN THE RIGHT TIER.  That is a reading judgement about
    audience, and no gate can make it: a witness that deserves promotion
    looks exactly like one that does not.  This checks that a declared tier
    is honoured, never that it is wise.
  * COVERAGE.  Nothing here requires a minimum number of tutorials.  The
    default is witness precisely so the learning surface stays small and
    deliberate; a gate demanding growth would defeat the doctrine.
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
TIERS = {"witness", "tutorial", "showcase"}


def main() -> int:
    fail = []
    counts = {"witness": 0, "tutorial": 0, "showcase": 0}
    for cd in (ROOT / "tutorials").rglob("system/controlDict"):
        txt = cd.read_text()
        if not re.search(r"^\s*application\b", txt, re.M):
            continue                      # a sector/sub-unit, not a case
        case = cd.parent.parent
        rel = case.relative_to(ROOT)
        m = re.search(r"^\s*tier\s+([A-Za-z]+)\s*;", txt, re.M)
        tier = m.group(1) if m else "witness"
        if tier not in TIERS:
            fail.append(f"{rel}: `tier {tier};` is not one of "
                        f"{sorted(TIERS)} -- a typo silently classifies a "
                        "case as nothing")
            continue
        counts[tier] += 1

        if tier == "showcase":
            fs = case / "system" / "flowsheetDict"
            body = fs.read_text() if fs.is_file() else ""
            #  Comment-stripped and NOT line-anchored: hda writes its units
            #  inline (`{ name Mixer;    type mixer;`), which a `^\s*name`
            #  pattern silently counts as zero.  Second time this arm was
            #  written from a single example -- the first assumed one fractal
            #  layout, this one assumed one formatting style.  A structural
            #  test must read the GRAMMAR, never a file's typography.
            body = re.sub(r"/\*.*?\*/", "", body, flags=re.S)
            body = re.sub(r"//[^\n]*", "", body)
            units = len(re.findall(r"\bname\s+[A-Za-z_][\w.]*\s*;", body))
            #  FRACTAL COMES IN MORE THAN ONE LAYOUT, and the first version of
            #  this arm encoded exactly one: it looked for a `sectors/` folder
            #  (lithiumBrinePlant's shape) and failed sugarPlantEconomicsSweep,
            #  whose sectors are named directories at the case root
            #  (CONCENTRATION, DRYING, FERMENTATION, ...).  The gate was wrong,
            #  not the case.  A SECTOR is any subdirectory that is itself a
            #  case node -- it carries its own system/ or constant/ -- which is
            #  the definition the flatten seam uses and does not care what the
            #  author named it.
            #  THE DECLARATION IS THE TEST.  Sector FOLDERS come in at least
            #  two layouts (lithiumBrinePlant nests them under `sectors/`,
            #  sugarPlantEconomicsSweep puts them at the case root), and
            #  chasing layouts is what made this arm wrong twice.  The root
            #  flowsheetDict's own `sectors ( ... )` block is the grammar that
            #  makes a case fractal, so that is what is read; the directory
            #  walk stays only as a fallback for a case that nests without
            #  declaring.
            sectors = bool(re.search(r"^\s*sectors\b", body, re.M)) or any(
                (d / "system").is_dir() or (d / "constant").is_dir()
                for d in case.rglob("*") if d.is_dir())
            if units < 2 and not sectors:
                fail.append(f"{rel}: declared `tier showcase;` but carries "
                            f"{units} unit(s) and no sectors -- a showcase "
                            "composes ENGINEERING, which one unit cannot do")
        if tier == "tutorial" and not (case / "README.md").is_file():
            fail.append(f"{rel}: declared `tier tutorial;` with no README.md "
                        "-- a lesson nobody wrote down is a witness with "
                        "ambitions")

    inv = ROOT / "generated" / "releaseInventory.json"
    if not inv.is_file():
        fail.append("generated/releaseInventory.json is missing")
    else:
        pub = json.loads(inv.read_text())["tutorials"].get("byTier")
        if pub != counts:
            fail.append(f"the published tier counts {pub} do not equal a "
                        f"fresh walk {counts} -- run "
                        "bin/curate/release_inventory.py")

    if fail:
        print("check_case_tiers: FAILED")
        for f in fail:
            print("  " + f)
        return 1
    print(f"check_case_tiers: OK -- {counts['witness']} witness(es), "
          f"{counts['tutorial']} tutorial(s), {counts['showcase']} showcase(s), "
          "recounted from the tree rather than trusted.  Every showcase is a "
          "multi-unit or fractal flowsheet; every tutorial carries a README; "
          "absence of a `tier` key means WITNESS, so a slice's witness is born "
          "classified by its author doing nothing.  NOT CHECKED: whether any "
          "case sits in the RIGHT tier (a reading judgement about audience, "
          "which no gate can make), and coverage -- nothing here demands the "
          "learning surface grow, because deliberate smallness is the point.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
