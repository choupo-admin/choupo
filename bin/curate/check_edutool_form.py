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
    Explorer and a lesson about the operating line in EduTools; two different
    questions about one piece of physics.  What a tool may not be is an
    instrument PANEL inside EduTools -- a panel shows a reader who already
    knows the method what it does, and teaches a reader who does not exactly
    nothing.

THE GATE IS DRIVEN BY THE REGISTRY, and the first version was not.  It
globbed `methods/*Tool.tsx` and reported "16 method tools" while the registry
declared 18: McCabeTool and PsychroTool are defined INLINE in
MethodsWorkspace.tsx and matched no glob, so the two oldest constructions in
the list were invisible to the check written to cover them.  A gate that
builds its own list of what exists is a second home for a fact the registry
owns -- the arity sin, inside the machinery meant to enforce a rule.  Every
live id is now resolved from the registry, through the workspace's dispatch,
to the source that renders it, and an id that cannot be resolved REFUSES.

WHAT THIS CHECKS, deliberately structural rather than editorial:

  (a) every live registry id resolves to a component and a source;
  (b) each is a scrolling lesson, or NAMED in the debt registry as a panel
      still to convert;
  (c) no name in that registry has already been converted -- a pin outliving
      its violation is a licence, and this project has retired a gate for
      being permanently green;
  (d) every CONVERTED tool carries the two things the form is for: a scroll
      container and at least one equation block;
  (e) every Explorer view is reachable only through a component SELECTION;
  (f) the pellet is not an Explorer view.

WHAT IT CANNOT CHECK, said plainly: whether the prose is any GOOD, whether
the equations are the right ones, whether the steps are in a sensible order.
Those are teaching judgements and no gate can make them.  This buys only that
the SHAPE cannot regress and the debt cannot be forgotten.
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from debt_registry import EDUTOOL_STILL_A_PANEL          # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / "gui/src/ui"
REGISTRY = UI / "methods/registry.ts"
WORKSPACE = UI / "MethodsWorkspace.tsx"
EXPLORE_VIEWS = ROOT / "gui/src/case/exploreViews.ts"

PANEL_MARKER = "MethodSetupRail"
SCROLL_MARKER = 'overflowY: "auto"'
EQUATION_MARKERS = ('ff="monospace"', "ff='monospace'")


def fail(msg):
    print(f"check_edutool_form: FAILED\n  {msg}")
    sys.exit(1)


def strip_comments(src):
    """Comments are not code.  An earlier arm of this gate matched the word
    'thiele' inside a comment recording that McCabe-Thiele LEFT the Explorer,
    and reported the pellet present on the strength of it."""
    src = re.sub(r"/\*.*?\*/", " ", src, flags=re.S)
    return re.sub(r"//[^\n]*", " ", src)


def live_ids(src):
    """Every id whose entry declares status live, read entry by entry so a
    `live` belonging to a neighbour cannot be attributed to it."""
    out = []
    for block in src.split("\n  {\n")[1:]:
        block = block.split("\n  },")[0]
        m = re.search(r'id:\s*"([a-z0-9-]+)"', block)
        if m and 'status: "live"' in block:
            out.append(m.group(1))
    return out


def main():
    reg = strip_comments(REGISTRY.read_text(encoding="utf-8"))
    ids = live_ids(reg)
    if not ids:
        fail("no live tool ids found in registry.ts -- this gate cannot run, "
             "and a check that cannot run must not pass.")

    ws_raw = WORKSPACE.read_text(encoding="utf-8")
    ws = strip_comments(ws_raw)

    #  id -> the component the workspace renders for it
    rendered = dict(re.findall(r'tool === "([a-z0-9-]+)"\s*\?\s*\(?\s*<(\w+)',
                               ws))
    #  component -> source text.  Either a lazy import naming a module, or a
    #  function defined inline in the workspace itself.
    lazy = dict(re.findall(
        r'const (\w+) = lazy\(\(\) =>\s*import\("\./([^"]+)"', ws))

    def source_of(comp):
        if comp in lazy:
            path = UI / lazy[comp].replace(".js", ".tsx")
            if not path.exists():
                fail(f"{comp} lazily imports {lazy[comp]}, which does not "
                     f"resolve to a file ({path}).")
            return path.name, path.read_text(encoding="utf-8")
        m = re.search(rf"^function {comp}\(", ws_raw, re.M)
        if not m:
            fail(f"the workspace renders <{comp}/> but it is neither a lazy "
                 f"import nor a function defined there -- this gate cannot "
                 f"see its source, and what it cannot see it cannot check.")
        rest = ws_raw[m.start():]
        nxt = re.search(r"\n(?:function |const \w+ = lazy|export )", rest[1:])
        body = rest[: nxt.start() + 1] if nxt else rest
        return f"MethodsWorkspace.tsx::{comp}", body

    panels, lessons, seen = [], [], {}
    for tid in ids:
        comp = rendered.get(tid)
        if not comp:
            fail(f"live tool '{tid}' is in the registry but the workspace "
                 f"renders nothing for it -- an unmounted id is a menu entry "
                 f"that opens nothing.")
        label, src = source_of(comp)
        seen[tid] = label
        (panels if PANEL_MARKER in src else lessons).append((tid, label, src))

    declared = set(EDUTOOL_STILL_A_PANEL)
    panel_labels = {label for _, label, _ in panels}
    lesson_labels = {label for _, label, _ in lessons}

    undeclared = sorted(panel_labels - declared)
    if undeclared:
        fail("built as instrument panel(s) and NOT named in "
             f"debt_registry.EDUTOOL_STILL_A_PANEL: {', '.join(undeclared)}.\n"
             "  An EduTool is a page you scroll, carrying the explanation and "
             "the equations.\n  Convert it, or declare the debt with its "
             "why/remedy so it stays visible.")

    stale = sorted(declared & lesson_labels)
    if stale:
        fail(f"already converted, but still pinned as panels: "
             f"{', '.join(stale)}.\n  Remove them from "
             "debt_registry.EDUTOOL_STILL_A_PANEL -- a pin that no longer "
             "fires is a licence.")

    ghosts = sorted(declared - panel_labels - lesson_labels)
    if ghosts:
        fail(f"pinned as panels but no live tool renders them: "
             f"{', '.join(ghosts)} -- the registry names something gone.")

    for tid, label, src in lessons:
        if SCROLL_MARKER not in src:
            fail(f"{label} ({tid}) is not a panel and does not scroll either "
                 f"({SCROLL_MARKER!r} absent) -- it is neither form.")
        if not any(m in src for m in EQUATION_MARKERS):
            fail(f"{label} ({tid}) scrolls but carries no equation block "
                 "(no monospace Text).  The form exists to hold the "
                 "equations, so a lesson without one kept the layout and "
                 "dropped the point.")

    ev = strip_comments(EXPLORE_VIEWS.read_text(encoding="utf-8"))
    views = set(re.findall(r'out\.add\("([A-Za-z0-9_]+)"\)', ev))
    if not views:
        fail("no Explorer views found in exploreViews.ts -- this arm cannot "
             "run, and a check that cannot run must not pass.")
    pellet = views & {"thiele", "pellet", "thielePellet"}
    if pellet:
        fail(f"the catalyst pellet is a registered Explorer view "
             f"({', '.join(sorted(pellet))}).  The Explorer is for studies "
             "that need compounds and compositions CHOSEN first, and a pellet "
             "has nothing to choose.")
    m = re.search(r"export function viewsFor\(([^)]*)\)", ev, re.S)
    if not m or "sel" not in m.group(1):
        fail("viewsFor() no longer takes a component selection.  Every "
             "Explorer view must be gated on one -- that is what makes the "
             "Explorer the surface for CHOOSING.")

    inline = sum(1 for _, label, _ in panels + lessons if "::" in label)
    print(
        f"check_edutool_form: OK -- all {len(ids)} LIVE registry id(s) "
        f"resolve through the workspace to a source ({inline} defined inline "
        f"in MethodsWorkspace.tsx, which the file-glob this gate replaced "
        f"could not see at all).  {len(lessons)} are scrolling lessons, each "
        f"with a scroll container and at least one equation block; "
        f"{len(panels)} are instrument panels, every one NAMED in "
        f"debt_registry.EDUTOOL_STILL_A_PANEL with its remedy, and no pin has "
        f"outlived its violation.  On the Explorer side, viewsFor() is still "
        f"gated on a component SELECTION and the pellet is not among its "
        f"{len(views)} registered view(s).  "
        f"NOT CHECKED, and it is the half that matters most: whether the "
        f"prose is any good, whether the equations are the right ones, or "
        f"whether the steps are in a sensible order -- teaching judgements no "
        f"gate can make.  This buys only that the SHAPE cannot regress and "
        f"the debt cannot be forgotten.")


if __name__ == "__main__":
    main()
