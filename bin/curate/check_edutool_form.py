#!/usr/bin/env python3
"""check_edutool_form -- an EduTool is a lesson; the Explorer is for choices.

THE RULE, ruled by Vitor on 2026-08-28 and enforced here rather than
remembered:

  * An EDUTOOL is a page you SCROLL.  It carries the explanation and the
    equations, and the interactive is EARNED by the paragraphs above it.
  * The EXPLORER is the other surface, and a study belongs there only when it
    needs you to CHOOSE compounds and compositions first.  That is why the
    catalyst pellet has no business in it: there is nothing to choose.
  * A tool may live in BOTH.  The flash is a study of a chosen pair in the
    Explorer and a lesson about the operating line in EduTools; those are two
    different questions about one piece of physics.  What a tool may not be is
    an instrument PANEL inside EduTools -- a panel shows a reader who already
    knows the method what it does, and teaches a reader who does not exactly
    nothing.

WHAT THIS CHECKS, and it is deliberately structural rather than editorial:

  (a) every method tool file is either a scrolling lesson or NAMED in the debt
      registry as a panel still to convert;
  (b) no name in that registry has already been converted -- a pin outliving
      its violation is a licence, and this project has retired a gate for
      being permanently green;
  (c) every CONVERTED tool actually carries the two things the form is for: a
      scrolling container, and at least one equation block;
  (d) every Explorer view is reachable only through a component SELECTION, so
      the Explorer cannot quietly acquire a study that needs no choosing;
  (e) the pellet is not in the Explorer.

WHAT IT CANNOT CHECK, said plainly: whether the prose is any GOOD, whether
the equations are the right ones, and whether the steps are in a sensible
order.  Those are teaching judgements and no gate can make them.  What this
gate buys is that the SHAPE cannot regress and the debt cannot be forgotten.
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from debt_registry import EDUTOOL_STILL_A_PANEL          # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
METHODS = ROOT / "gui/src/ui/methods"
EXPLORE_VIEWS = ROOT / "gui/src/case/exploreViews.ts"

#  The marker of the old form.  MethodSetupRail pins the drawing into whatever
#  height is left over, which is exactly what makes a long explanation
#  impossible -- the panel and the lesson cannot both fit a fixed viewport.
PANEL_MARKER = "MethodSetupRail"
#  The two marks of the new one.
SCROLL_MARKER = 'overflowY: "auto"'
EQUATION_MARKERS = ("ff=\"monospace\"", "ff='monospace'")


def fail(msg):
    print(f"check_edutool_form: FAILED\n  {msg}")
    sys.exit(1)


def main():
    tools = sorted(p.name for p in METHODS.glob("*Tool.tsx"))
    if not tools:
        fail(f"no method tools found under {METHODS} -- this gate cannot run, "
             "and a check that cannot run must not pass.")

    panels, lessons = [], []
    for name in tools:
        src = (METHODS / name).read_text(encoding="utf-8")
        (panels if PANEL_MARKER in src else lessons).append(name)

    #  (a) every panel is declared
    undeclared = [n for n in panels if n not in EDUTOOL_STILL_A_PANEL]
    if undeclared:
        fail("built as instrument panel(s) and NOT named in "
             f"debt_registry.EDUTOOL_STILL_A_PANEL: {', '.join(undeclared)}.\n"
             "  An EduTool is a page you scroll, carrying the explanation and "
             "the equations.\n"
             "  Convert it, or add it to the registry with its why/remedy so "
             "the debt is visible.")

    #  (b) no pin outlives its violation
    stale = [n for n in EDUTOOL_STILL_A_PANEL if n in lessons]
    if stale:
        fail(f"already converted, but still pinned as a panel: "
             f"{', '.join(sorted(stale))}.\n"
             "  Remove them from debt_registry.EDUTOOL_STILL_A_PANEL -- a pin "
             "that no longer fires is a licence.")
    missing = [n for n in EDUTOOL_STILL_A_PANEL if n not in tools]
    if missing:
        fail(f"pinned as panels but no such tool exists: "
             f"{', '.join(sorted(missing))} -- the registry names a file that "
             "is gone.")

    #  (c) a converted tool really carries the form
    for name in lessons:
        src = (METHODS / name).read_text(encoding="utf-8")
        if SCROLL_MARKER not in src:
            fail(f"{name} is not a panel and does not scroll either "
                 f"({SCROLL_MARKER!r} absent) -- it is neither form.")
        if not any(m in src for m in EQUATION_MARKERS):
            fail(f"{name} scrolls but carries no equation block "
                 "(no monospace Text) -- the form exists to hold the "
                 "equations, so a lesson without one has kept the layout and "
                 "dropped the point.")

    #  (d) + (e) the Explorer side
    ev_raw = EXPLORE_VIEWS.read_text(encoding="utf-8")
    #  COMMENTS ARE NOT CODE, and the first version of this arm forgot it: a
    #  substring search for "thiele" matched a comment recording that
    #  McCabe-Thiele LEFT the Explorer in 2026-08-15 -- the gate reported the
    #  pellet present on the strength of a note saying something else had
    #  gone.  Read the views the module actually registers instead.
    ev = re.sub(r"/\*.*?\*/", " ", ev_raw, flags=re.S)
    ev = re.sub(r"//[^\n]*", " ", ev)
    views = set(re.findall(r'out\.add\("([A-Za-z0-9_]+)"\)', ev))
    if not views:
        fail("no Explorer views found in exploreViews.ts -- this arm cannot "
             "run, and a check that cannot run must not pass.")
    PELLET = {"thiele", "pellet", "thielePellet"}
    if views & PELLET:
        fail("the catalyst pellet is a registered Explorer view "
             f"({', '.join(sorted(views & PELLET))}).  The Explorer is for "
             "studies that need compounds and compositions CHOSEN first, and "
             "a pellet has nothing to choose.")
    m = re.search(r"export function viewsFor\(([^)]*)\)", ev, re.S)
    if not m or "sel" not in m.group(1):
        fail("viewsFor() in exploreViews.ts no longer takes a component "
             "selection.  Every Explorer view must be gated on one -- that is "
             "what makes the Explorer the surface for CHOOSING.")

    conv = len(lessons)
    print(
        f"check_edutool_form: OK -- {conv} of {len(tools)} method tool(s) are "
        f"scrolling lessons, each with a scroll container and at least one "
        f"equation block; the remaining {len(panels)} are instrument panels, "
        f"every one NAMED in debt_registry.EDUTOOL_STILL_A_PANEL with its "
        f"remedy, and none of the pins has outlived its violation.  On the "
        f"Explorer side, viewsFor() is still gated on a component SELECTION "
        f"and the catalyst pellet is not among its {len(views)} registered "
        f"view(s).  "
        f"NOT CHECKED, and it is the half that matters most: whether the "
        f"prose is any good, whether the equations are the right ones, or "
        f"whether the steps are in a sensible order -- those are teaching "
        f"judgements and no gate can make them.  This buys only that the "
        f"SHAPE cannot regress and the debt cannot be forgotten.")


if __name__ == "__main__":
    main()
