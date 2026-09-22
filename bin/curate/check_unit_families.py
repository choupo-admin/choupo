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
  (e) SHAPE IS THE EQUIPMENT, TAG IS THE CALCULATION MODEL.  Two classes may
      not share BOTH a path and a tag -- the round-two defect made
      impossible.  They MAY share a path where the hardware genuinely is the
      same (RStoic, REquil and RGibbs are one vessel with three
      specifications; a flash drum is one drum whether the spec is T or
      Q=0), and then every class sharing it must carry a NON-EMPTY tag, so
      the sheet still tells them apart.  Whitespace-normalised, so a reformat
      cannot hide a duplicate.  What this does NOT judge is whether a shared
      shape SHOULD be shared: that a crystalliser is not a flash drum is an
      equipment judgement, reasoned in the module and listed in the tests.
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
#  THE ENGINE HAS THREE REGISTRIES, AND THIS GATE COUNTED ONE.
#
#  Round three's claim line said "all 51 unit type(s) the engine registers
#  carry a symbol".  True of `UnitOperation::registerBuiltins()` and FALSE as
#  a statement about the engine: `dynamicCSTR` is registered by
#  `DynamicUnitOperation` and the nine batch units by `BatchUnitOperation`, so
#  every case under tutorials/unsteady, tutorials/ctrl and tutorials/batch went
#  on drawing the generic glyph -- and this gate could not see it, because it
#  was not looking there.  Vitor found it by opening `unsteady/`.
#
#  A gate's claim is the line it prints, and that line promised more than the
#  gate had measured.  All three registries are read now, each with the call
#  shape it actually uses, and a registry that yields NOTHING fails rather
#  than quietly narrowing the domain.
REGISTRIES = [
    ("UnitOperation",
     ROOT / "src" / "unitOperations" / "UnitOperation.cpp",
     r'reg\("([A-Za-z0-9_]+)"[^;]*?make_unique<([A-Za-z0-9_]+)>'),
    ("DynamicUnitOperation",
     ROOT / "src" / "unitOperations" / "dynamic" / "DynamicUnitOperation.cpp",
     r'registerType\("([A-Za-z0-9_]+)"[^;]*?make_unique<([A-Za-z0-9_]+)>'),
    ("BatchUnitOperation",
     ROOT / "src" / "unitOperations" / "batch" / "BatchUnitOperation.cpp",
     r'registerType\("([A-Za-z0-9_]+)"[^;]*?make_unique<([A-Za-z0-9_]+)>'),
]
ENGINE = REGISTRIES[0][1]
TABLE = ROOT / "gui" / "src" / "case" / "unitFamily.ts"


def main() -> int:
    for name, path, _ in REGISTRIES:
        if not path.is_file():
            print(f"check_unit_families: FAILED\n  {path} is missing -- "
                  f"{name} is one of the three registries this gate derives "
                  f"its rule from, so nothing was checked.")
            return 1
    if not TABLE.is_file():
        print(f"check_unit_families: FAILED\n  {TABLE} is missing.")
        return 1

    #  The engine's own answer: name -> class it constructs, from ALL THREE
    #  registries.  Per-registry counts are kept so the claim line can name
    #  them and an EMPTY one can fail instead of narrowing the domain.
    engine = {}
    per_registry = {}
    empty = []
    for name, path, rx in REGISTRIES:
        rows = re.findall(rx, path.read_text(), re.S)
        if not rows:
            empty.append(name)
        per_registry[name] = len(rows)
        for t, c in rows:
            engine[t] = c
    src = TABLE.read_text()

    m = re.search(r"export const UNIT_CLASS[^{]*\{(.*?)\n\};", src, re.S)
    table = dict(re.findall(r'\n  ([A-Za-z0-9_]+): "([A-Za-z0-9_]+)",',
                            m.group(1))) if m else {}

    #  SHARED GEOMETRY LIVES IN CONSTANTS, and the first version of this
    #  harvest could not see through them.  A path is written
    #  `VESSEL + SIDE_NOZZLES + " M15 30h18"`, so reading only the quoted
    #  chunks yields the literal remainder and TWO CLASSES SHARING ONE
    #  CONSTANT LOOK DIFFERENT.  The gate reported "0 shapes shared" on a
    #  module with four sharing groups -- blind exactly where the rule it
    #  enforces lives, which is the project's standing trap (a pattern
    #  anchored where its subject does not live is a check that cannot
    #  fire).  Top-level string constants are resolved first.
    consts = {}
    for cm2 in re.finditer(r"^const ([A-Z_][A-Z0-9_]*) =\s*((?:[^;]|\n)*?);",
                           src, re.M):
        chunks = re.findall(r'"((?:[^"\\]|\\.)*)"',
                            re.sub(r"//[^\n]*", "", cm2.group(2)))
        consts[cm2.group(1)] = "".join(chunks)
    if not consts:
        fails_early = ("harvested NO shared geometry constants from "
                       f"{TABLE.relative_to(ROOT)} -- the module's shape "
                       "changed, so the sharing rule cannot be checked")
    else:
        fails_early = None

    unresolved = []

    def resolve(expr: str) -> str:
        """Concatenate a `path:` expression: string literals + constants.

        An identifier this cannot resolve is COLLECTED, never skipped.  A
        skipped one silently shortens the path, and two classes sharing that
        constant then look different -- which is the blind spot that made
        this gate report "0 shapes shared" on a module with four sharing
        groups.  Half a resolution is the same failure, quieter.
        """
        expr = re.sub(r"//[^\n]*", "", expr)
        out = []
        for tok in re.finditer(r'"((?:[^"\\]|\\.)*)"|\b([A-Z_][A-Z0-9_]*)\b',
                               expr):
            if tok.group(1) is not None:
                out.append(tok.group(1))
            elif tok.group(2) in consts:
                out.append(consts[tok.group(2)])
            else:
                unresolved.append(tok.group(2))
        return "".join(out)

    #  The drawings.  A class is DRAWN only when its entry carries a path, so
    #  the two are harvested together and an entry with an empty path is not
    #  counted as a drawing at all.
    drawn = {}
    tags = {}
    for e in re.split(r"\n  \{ cls: ", src[src.find("export const SYMBOLS"):]):
        cm = re.match(r'"([A-Za-z0-9_]+)"', e)
        if not cm:
            continue
        pm = re.search(r"path:\s*((?:[^,]|\n)*?)(?:,\s*\n\s*tag:|\s*\},|,\s*tag:)",
                       e, re.S)
        path = resolve(pm.group(1)) if pm else ""
        if path.strip():
            drawn[cm.group(1)] = re.sub(r"\s+", " ", path).strip()
        tm = re.search(r'tag:\s*"([^"]*)"', e)
        tags[cm.group(1)] = tm.group(1) if tm else ""

    fails = []
    if unresolved:
        fails.append(
            "path expression(s) name geometry this gate cannot resolve: "
            + ", ".join(sorted(set(unresolved)))
            + " -- the resolved path would be SHORT, so two classes sharing "
              "that piece would look different and the sharing rule would "
              "pass over them in silence")
    if fails_early:
        fails.append(fails_early)

    if empty:
        fails.append(
            "harvested NO types from registr(ies) " + ", ".join(empty)
            + " -- their call shape changed, so this gate is blind THERE "
              "rather than satisfied, and a narrowed domain is exactly how "
              "every batch and dynamic unit went unsymbolled while the claim "
              "line said the engine was covered")
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

    #  (e) shape is the equipment, tag is the calculation model.
    by_path = {}
    for cls, path in sorted(drawn.items()):
        by_path.setdefault(path, []).append(cls)
    shared_shape = {p: v for p, v in by_path.items() if len(v) > 1}

    identical = []
    for p, group in shared_shape.items():
        by_tag = {}
        for cls in group:
            by_tag.setdefault(tags.get(cls, ""), []).append(cls)
        identical += [v for v in by_tag.values() if len(v) > 1]
    if identical:
        fails.append(
            "two or more CLASSES are drawn IDENTICALLY (same shape, same "
            "tag): " + "; ".join(" = ".join(v) for v in identical)
            + " -- two classes are two operations, and this is exactly the "
              "defect that put one bow-tie on a mixer and a splitter.")

    untagged = sorted(cls for group in shared_shape.values() for cls in group
                      if not tags.get(cls, "").strip())
    if untagged:
        fails.append(
            "class(es) sharing a shape with another and carrying NO tag: "
            + ", ".join(untagged)
            + " -- a shape may be shared only where the hardware is the "
              "same, and then the CALCULATION MODEL is what tells them "
              "apart; an untagged share is indistinguishable on the sheet")

    if fails:
        print("check_unit_families: FAILED")
        for f in fails:
            print("  -", f)
        return 1

    shared = {c: [t for t in sorted(table) if table[t] == c]
              for c in sorted(used)}
    multi = {c: ts for c, ts in shared.items() if len(ts) > 1}
    print(f"check_unit_families: OK -- all {len(engine)} unit type(s) the "
          f"engine registers across its THREE registries ("
          + ", ".join(f"{k} {v}" for k, v in per_registry.items())
          + f") carry a symbol; they construct {len(used)} "
          f"distinct class(es) and each is drawn exactly once, with no two "
          f"classes sharing a path.  {len(multi)} class(es) are reached by "
          f"more than one name and therefore share a drawing, which the "
          f"ENGINE sanctions by constructing one object for both: "
          + "; ".join(f"{c} <- {', '.join(ts)}" for c, ts in multi.items())
          + f".  {len(shared_shape)} SHAPE(S) are shared by classes the "
            f"engine keeps apart, every one of them tagged with its "
            f"calculation model ("
          + "; ".join(f"{'/'.join(v)}" for v in shared_shape.values())
          + ").  NOT CHECKED: whether a symbol resembles its subject or "
            "whether two DISTINCT paths look distinct (no script sees a "
            "picture -- arm (e) catches an identical path, not a nearly "
            "identical one), and the labels, which are prose.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
