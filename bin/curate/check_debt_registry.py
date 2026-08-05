#!/usr/bin/env python3
"""Gate: waivers live in the registry, and every waiver still fires.

    bin/curate/check_debt_registry.py

WHY THIS EXISTS.  `debt_registry.py` is the one home for the project's accepted
violations.  A single home only stays single if something enforces it -- and
the pressure to add "just one more pin, right here where I need it" is exactly
how the eight scattered lists came to exist in the first place.

WHAT IS CHECKED.

  (a) NO GATE DEFINES ITS OWN WAIVER TABLE.  A module-level constant named
      `PINNED`/`PINS`/`PINNED_*` in a `check_*.py` must be an ASSIGNMENT FROM
      the registry, never a literal.  A literal is a second home.

  (b) EVERY REGISTRY ENTRY IS READ BY SOMETHING.  A waiver nobody consults is
      not a waiver; it is a note.  If no gate imports it, the violation it
      excuses is either gone (delete it) or unchecked (worse).

WHAT IS DELIBERATELY NOT CHECKED, and this is the important half: **whether a
waiver is still TRUE.**  That is each owning gate's job, through its stale-pin
arm -- `check_species_citation` fails if a pinned record gains a citation,
`check_layering` fails if a pinned cycle disappears.  Duplicating that here
would put the staleness logic in two places, which is the defect this whole
file exists to remove.  So this gate proves the registry is the only HOME; the
gates prove its contents are still TRUE.

Saying that plainly matters, because a reader could otherwise take a green
`check_debt_registry` as meaning "the waivers are all justified".  It means
nothing of the kind.  It means they are all in one place and all consulted.

CONFIGURATION IS NOT A WAIVER.  A constant that tells a gate where to look
(`SCAN`, `ALLOWED_PATHS`, a superscript table) stays with its gate.  The test
is whether the entry EXCUSES A KNOWN VIOLATION or merely parameterises a
search -- so this gate matches on waiver-shaped NAMES, and the list of those
names is short and explicit rather than heuristic.
"""
import ast
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
REGISTRY = HERE / "debt_registry.py"

#  Names that mean "this excuses a known violation".  Explicit, not heuristic:
#  a gate that invents a new waiver name is a hole, and the fix is to add the
#  name here deliberately -- the same posture as `check_layering`'s refusal to
#  default an unplaced subsystem into a safe band.
WAIVER_NAMES = re.compile(r'^(PINNED|PINS|PINNED_[A-Z_]+|KNOWN_VIOLATIONS)$')


def main() -> int:
    fail = []
    if not REGISTRY.exists():
        print("check_debt_registry: FAILED\n  debt_registry.py is missing -- "
              "the waivers have no home")
        return 1

    reg = ast.parse(REGISTRY.read_text())
    registry_names = {t.id for n in reg.body if isinstance(n, ast.Assign)
                      for t in n.targets if isinstance(t, ast.Name)}
    used = set()
    ngates, nwaivers = 0, 0

    for p in sorted(HERE.glob("check_*.py")):
        if p.name == Path(__file__).name:
            continue
        ngates += 1
        text = p.read_text()
        try:
            tree = ast.parse(text)
        except SyntaxError as e:
            fail.append(f"{p.name}: does not parse ({e})")
            continue

        for node in tree.body:
            if isinstance(node, ast.ImportFrom) and node.module == "debt_registry":
                for a in node.names:
                    used.add(a.name)
            if not isinstance(node, ast.Assign):
                continue
            for t in node.targets:
                if not isinstance(t, ast.Name) or not WAIVER_NAMES.match(t.id):
                    continue
                nwaivers += 1
                #  Legal: PINNED = SOME_REGISTRY_NAME, or a call/set() over one.
                src = ast.get_source_segment(text, node.value) or ""
                if any(n in src for n in registry_names):
                    continue
                if isinstance(node.value, (ast.Set, ast.Dict, ast.List)) \
                        and (node.value.elts if hasattr(node.value, "elts")
                             else node.value.keys):
                    fail.append(
                        f"{p.name}: `{t.id}` is a LITERAL waiver table.  A pin "
                        "is a decision to tolerate a known violation, and "
                        "\"what are we tolerating?\" has exactly one home -- "
                        "move it into debt_registry.py and import it.")

    orphans = sorted(n for n in registry_names
                     if n.isupper() and n not in used
                     and not n.endswith("_DEBT"))
    for o in orphans:
        fail.append(f"debt_registry.{o} is read by no gate.  A waiver nobody "
                    "consults is not a waiver, it is a note: either the "
                    "violation is gone (delete the entry) or nothing is "
                    "checking it (worse).")

    if fail:
        print("check_debt_registry: FAILED")
        for f in fail:
            print("  " + f)
        return 1

    print(f"check_debt_registry: OK -- {ngates} gate script(s) scanned; "
          f"{nwaivers} waiver table(s) all resolve to debt_registry.py, and "
          f"all {len(used)} registry entr(ies) are read by a gate.  "
          "THIS GATE DOES NOT CHECK WHETHER A WAIVER IS STILL TRUE -- that is "
          "each owning gate's stale-pin arm, and duplicating it here would "
          "recreate the second home this registry exists to remove.  Green "
          "here means the waivers are in one place and consulted, never that "
          "they are justified.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
