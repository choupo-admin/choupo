#!/usr/bin/env python3
"""Gate: every unit type has a symbol, and two types share one only if the
ENGINE says they are the same object.

    bin/curate/check_unit_families.py

WHY THIS EXISTS, AND WHY IT WAS REWRITTEN THE DAY AFTER IT SHIPPED.

Round one: Vitor said the flowsheet boxes carry no symbol of the unit
operation.  Measured, the cause was not size -- the engine registered 51 unit
types and `gui/src/ui/unitIcons.tsx` mapped 24; the other 27 fell through
`default: return IconAdjustments`, the generic settings-sliders glyph.  The
same picture stood for a Gibbs reactor, a pipe and a column, and nothing ever
said so, because a default never complains.  The fix grouped the types into
ELEVEN FAMILIES and this gate recounted them against the registry.

Round two, within the hour: `mixer` and a `splitter` wore the SAME BOW-TIE on
his screen.  So did `pump`, `compressor` and `turbine`; so did all five
reactors.  THE FAMILIES WERE ARGUED ON MAINTENANCE -- a hand-kept per-type
table is what had drifted to 24 of 51 -- and that argument was already void,
because THIS GATE had solved maintenance in the same commit.  The coarseness
went on being paid for a problem that no longer existed.

    GRANULARITY MUST FOLLOW MEANING.  A gate that prevents drift is what
    makes fine granularity affordable; it is not a reason to stay coarse.

THE RULE, AND IT IS NOT A JUDGEMENT.  `UnitOperation::registerBuiltins()` maps
each registered NAME to the C++ CLASS it constructs: 51 names, 42 classes.
The nine names sharing a class are one object under two words (`flash` and
`isothermalFlash`; `boiler`, `condenser` and `phaseChanger`; ...).  So:

    TWO TYPES SHARE A SYMBOL IF AND ONLY IF THEY CONSTRUCT THE SAME CLASS.

Nothing here decides what "looks similar enough" -- that question is what
produced the bow-tie.  The engine has already answered it, in the only place
that can be checked, and this gate derives the map from that source.

WHAT THIS CHECKS.
  (a) COVERAGE.  Every `reg("<type>", ... make_unique<Class>)` has an entry in
      UNIT_FAMILY's UNIT_CLASS.  A unit added to the engine without a symbol
      FAILS here rather than arriving on screen with no drawing.
  (b) NO ORPHANS.  Every entry names a type the engine registers.
  (c) THE CLASS IS THE ENGINE'S.  Each entry names the class the engine
      actually constructs for that type.  This is the arm that makes the
      whole rule mechanical: a type repointed at another class in C++ fails
      here instead of going on wearing its old picture.
  (d) EVERY CLASS IS DRAWN, with a non-empty path.
  (e) NO TWO CLASSES SHARE A PATH.  The round-two defect, made impossible:
      two classes are two operations, and a reader must be able to tell them
      apart by looking.  Whitespace-normalised, so a reformat cannot hide a
      duplicate.
  (f) NO UNUSED DRAWING.  A class drawn that no type constructs is a picture
      with no subject.

WHAT THIS DOES NOT CHECK, said plainly:
  * WHETHER A SYMBOL LOOKS LIKE ITS SUBJECT.  No script sees a picture.  That
    the crystalliser's crystals read as crystals is a human's judgement, and
    `/tmp`-rendered contact sheets are how it was actually reviewed.
  * WHETHER TWO DISTINCT PATHS LOOK DISTINCT.  Arm (e) catches an identical
    path, not a nearly identical one.  Two drawings differing by one stray
    line would pass and read the same on screen.
  * THE LABEL.  Whether "rotary dryer" is the right words for SolidDryer is
    prose, checked by reading.

Exit 1 with the offending names.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENGINE = ROOT / "src" / "unitOperations" / "UnitOperation.cpp"
TABLE = ROOT / "gui" / "src" / "case" / "unitFamily.ts"


def main() -> int:
    if not ENGINE.is_file():
        print(f"check_unit_families: FAILED\n  {ENGINE} is missing -- the "
              "registry this gate derives its rule from does not exist, so "
              "nothing was checked.")
        return 1
    if not TABLE.is_file():
        print(f"check_unit_families: FAILED\n  {TABLE} is missing.")
        return 1

    #  The engine's own answer: name -> class it constructs.
    engine = dict(re.findall(
        r'reg\("([A-Za-z0-9_]+)"[^;]*?make_unique<([A-Za-z0-9_]+)>',
        ENGINE.read_text()))
    src = TABLE.read_text()

    m = re.search(r"export const UNIT_CLASS[^{]*\{(.*?)\n\};", src, re.S)
    table = dict(re.findall(r'\n  ([A-Za-z0-9_]+): "([A-Za-z0-9_]+)",',
                            m.group(1))) if m else {}

    #  The drawings.  A class is DRAWN only when its entry carries a path, so
    #  the two are harvested together and an entry with an empty path is not
    #  counted as a drawing at all.
    drawn = {}
    for e in re.split(r"\n  \{ cls: ", src[src.find("export const SYMBOLS"):]):
        cm = re.match(r'"([A-Za-z0-9_]+)"', e)
        if not cm:
            continue
        tail = re.sub(r"//[^\n]*", "", e[e.find("label:"):]) \
            if "label:" in e else ""
        chunks = re.findall(r'"((?:[^"\\]|\\.)*)"', tail)
        path = "".join(chunks[1:])            # chunk 0 is the label
        if path.strip():
            drawn[cm.group(1)] = re.sub(r"\s+", " ", path).strip()

    fails = []

    if not engine:
        fails.append("harvested NO types from the engine registry -- the "
                     "shape of registerBuiltins() changed, so this gate is "
                     "blind rather than satisfied")
    if not table:
        fails.append("harvested NO entries from UNIT_CLASS -- the shape of "
                     "the table changed, so this gate is blind rather than "
                     "satisfied")
    if not drawn:
        fails.append("harvested NO drawings from SYMBOLS -- the shape of the "
                     "table changed, so this gate is blind rather than "
                     "satisfied")
    if fails:
        print("check_unit_families: FAILED")
        for f in fails:
            print("  -", f)
        return 1

    missing = sorted(set(engine) - set(table))
    if missing:
        fails.append(
            f"{len(missing)} unit type(s) the engine registers have NO "
            f"symbol: " + ", ".join(missing)
            + " -- add them to UNIT_CLASS in gui/src/case/unitFamily.ts")

    orphans = sorted(set(table) - set(engine))
    if orphans:
        fails.append(
            f"{len(orphans)} entr(ies) in UNIT_CLASS name no registered "
            f"type: " + ", ".join(orphans)
            + " -- the engine deleted or renamed them and the table kept "
              "looking maintained")

    wrong = sorted(t for t in table if t in engine and table[t] != engine[t])
    if wrong:
        fails.append(
            "the table names a class the engine does not construct for: "
            + ", ".join(f"{t} (table {table[t]}, engine {engine[t]})"
                        for t in wrong)
            + " -- the SHARING RULE is derived from the class, so a wrong "
              "class silently makes two operations one picture, or one two")

    used = set(table.values())
    undrawn = sorted(used - set(drawn))
    if undrawn:
        fails.append("class(es) a type maps to with no drawing: "
                     + ", ".join(undrawn))

    unused = sorted(set(drawn) - used)
    if unused:
        fails.append("class(es) drawn that no registered type constructs (a "
                     "picture with no subject): " + ", ".join(unused))

    #  (e) the round-two defect.
    by_path = {}
    for cls, path in sorted(drawn.items()):
        by_path.setdefault(path, []).append(cls)
    collisions = [v for v in by_path.values() if len(v) > 1]
    if collisions:
        fails.append(
            "two or more CLASSES share one drawing: "
            + "; ".join(" = ".join(v) for v in collisions)
            + " -- two classes are two operations, and this is exactly the "
              "defect that put one bow-tie on a mixer and a splitter.  A "
              "type may share a symbol ONLY by sharing the engine class.")

    if fails:
        print("check_unit_families: FAILED")
        for f in fails:
            print("  -", f)
        return 1

    shared = {c: [t for t in sorted(table) if table[t] == c]
              for c in sorted(used)}
    multi = {c: ts for c, ts in shared.items() if len(ts) > 1}
    print(f"check_unit_families: OK -- all {len(engine)} unit type(s) the "
          f"engine registers carry a symbol; they construct {len(used)} "
          f"distinct class(es) and each is drawn exactly once, with no two "
          f"classes sharing a path.  {len(multi)} class(es) are reached by "
          f"more than one name and therefore SHARE a drawing, which the "
          f"ENGINE sanctions by constructing one object for both: "
          + "; ".join(f"{c} <- {', '.join(ts)}" for c, ts in multi.items())
          + ".  NOT CHECKED: whether a symbol resembles its subject or "
            "whether two DISTINCT paths look distinct (no script sees a "
            "picture -- arm (e) catches an identical path, not a nearly "
            "identical one), and the labels, which are prose.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
