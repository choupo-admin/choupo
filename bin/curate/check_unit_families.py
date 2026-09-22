#!/usr/bin/env python3
"""Gate: every unit type the ENGINE registers has a silhouette, and no more.

    bin/curate/check_unit_families.py

WHY THIS EXISTS.  Vitor said the flowsheet boxes carry no symbol of the unit
operation.  Measured, the cause was not size: the engine registers 51 unit
types and `gui/src/ui/unitIcons.tsx` mapped 24.  The remaining 27 --
gibbsReactor, flash, column, evaporator, pipe among them -- all fell through
`default: return IconAdjustments`, the generic settings-sliders glyph.  The
same picture stood for a Gibbs reactor, a pipe and a column, and nothing ever
said so, because a default never complains.

The drawing was then fixed by families (gui/src/case/unitFamily.ts).  THIS
GATE IS WHY THAT FIX IS NOT THE SAME MISTAKE AGAIN.  A hand-kept per-type
table in the GUI drifted to 24 of 51 while the engine grew; a second one
would drift the same way for the same reason.  Here the table is recounted
against the engine's own registry, so it cannot go quietly short.

WHAT THIS CHECKS.
  (a) COVERAGE.  Every `reg("<type>", ...)` in
      src/unitOperations/UnitOperation.cpp has a key in UNIT_FAMILY.  A unit
      added to the engine without a silhouette FAILS here rather than
      arriving on screen as a generic glyph.
  (b) NO ORPHANS.  Every key in UNIT_FAMILY names a type the engine
      registers.  A type deleted or renamed leaves a dead entry that would
      otherwise sit there looking maintained.
  (c) EVERY FAMILY IS DRAWABLE.  Each family used by the table has a spec in
      FAMILIES with a non-empty SVG path, so a type can never be assigned to
      a family nobody drew.
  (d) NO UNUSED SILHOUETTE.  A family defined and assigned to nothing is a
      drawing with no subject; it is reported, because the legend lists what
      is PRESENT and a never-present family cannot be checked by looking.

WHAT THIS DOES NOT CHECK, said plainly:
  * WHETHER A TYPE IS IN THE RIGHT FAMILY.  That is a reading judgement --
    whether a crystalliser reads as a vessel or a reactor is an argument
    between engineers, not something a script can settle.  The assignments
    carry their reasoning in the module, which is where a reviewer checks
    them.
  * WHETHER A SILHOUETTE LOOKS LIKE THE THING.  No script can see a picture.
  * The ALIAS structure.  `column` and `distillationColumn` construct the
    same class and must share a family, but this gate reads the registry as
    a flat list of names and does not resolve aliases; a mis-assigned alias
    passes here and is caught by reading.

Exit 1 with the offending names.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENGINE = ROOT / "src" / "unitOperations" / "UnitOperation.cpp"
TABLE = ROOT / "gui" / "src" / "case" / "unitFamily.ts"

#  Keys of the FamilySpec interface, which match the entry-line shape but are
#  not unit types.  Named rather than filtered by position so that adding a
#  field to the interface fails loudly here instead of inventing a unit.
SPEC_KEYS = {"family", "label", "path"}


def main() -> int:
    if not ENGINE.is_file():
        print(f"check_unit_families: FAILED\n  {ENGINE} is missing -- the "
              "registry this gate recounts against does not exist, so nothing "
              "was checked.")
        return 1
    if not TABLE.is_file():
        print(f"check_unit_families: FAILED\n  {TABLE} is missing.")
        return 1

    engine = set(re.findall(r'reg\("([A-Za-z0-9_]+)"', ENGINE.read_text()))
    src = TABLE.read_text()

    #  The map entries: `  someType: "family",` at the indentation the object
    #  literal uses.  The trailing quote is what separates a unit entry from
    #  a FamilySpec field, whose value is also a string -- hence SPEC_KEYS.
    #  A TRAILING COMMENT IS PART OF THE CORPUS, not an exception.  The
    #  first run of this gate reported seven types missing -- FUG, MHeatX,
    #  REquil, boiler, column, condenser, extract -- and every one of them
    #  was PRESENT: they are the alias entries, and each carries a
    #  `// alias of ...` after the value.  Anchoring to the end of the line
    #  made the gate blind to exactly the rows whose reasoning is written
    #  down, which is the 2026-09-07 lesson (a pattern anchored where its
    #  subject does not live is a check that cannot fire) in miniature.
    table = {m.group(1): m.group(2)
             for m in re.finditer(
                 r'^\s+([A-Za-z0-9_]+):\s*"([a-zA-Z]+)",?\s*(?://.*)?$',
                 src, re.M)
             if m.group(1) not in SPEC_KEYS}

    families_declared = set(re.findall(r'family:\s*"([a-zA-Z]+)"', src))
    #  A path is only a silhouette if it is not empty.
    drawn = {m.group(1) for m in re.finditer(
        r'family:\s*"([a-zA-Z]+)",[\s\S]{0,400}?path:\s*"([^"]+)"', src)}

    fails = []

    missing = sorted(engine - set(table))
    if missing:
        fails.append(
            f"{len(missing)} unit type(s) the engine registers have NO "
            f"silhouette, so they would draw as a generic glyph: "
            + ", ".join(missing)
            + " -- add them to UNIT_FAMILY in gui/src/case/unitFamily.ts")

    orphans = sorted(set(table) - engine)
    if orphans:
        fails.append(
            f"{len(orphans)} entr(ies) in UNIT_FAMILY name no registered "
            f"type: " + ", ".join(orphans)
            + " -- the engine deleted or renamed them and the table kept "
              "looking maintained")

    used = set(table.values())
    undrawn = sorted(used - drawn)
    if undrawn:
        fails.append(
            "assigned to famil(ies) with no drawable silhouette: "
            + ", ".join(undrawn))

    unused = sorted(families_declared - used)
    if unused:
        fails.append(
            "famil(ies) defined and assigned to nothing (a drawing with no "
            "subject, and one no reader can ever check by looking): "
            + ", ".join(unused))

    if fails:
        print("check_unit_families: FAILED")
        for f in fails:
            print("  -", f)
        return 1

    per = {}
    for t, f in table.items():
        per.setdefault(f, []).append(t)
    shape = ", ".join(f"{f} {len(v)}" for f, v in sorted(per.items()))
    print(f"check_unit_families: OK -- all {len(engine)} unit type(s) the "
          f"engine registers carry a silhouette and no entry is an orphan "
          f"({len(used)} famil(ies): {shape}).  NOT CHECKED: whether a type "
          f"is in the RIGHT family (a reading judgement, reasoned in the "
          f"module), whether a silhouette resembles its subject (no script "
          f"sees a picture), and the alias structure -- `column` and "
          f"`distillationColumn` construct one class and must share a family, "
          f"which this gate reads as two independent names.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
