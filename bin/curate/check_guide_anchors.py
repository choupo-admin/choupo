#!/usr/bin/env python3
"""Gate: every guide anchor the GUI links to EXISTS in that guide.

    bin/curate/check_guide_anchors.py

WHY THIS EXISTS.  `gui/src/case/modelDocs.ts` deep-links the app to the
guides: a unit's "Theory -- the section deriving this unit", a props item's
"Properties Guide" link, a per-operation help target.  Each is a LaTeX
`\\label` name, turned into a PDF named destination by `destlabel=true`
(docs/preamble.tex).

A LABEL RENAMED IN A GUIDE BREAKS EVERY LINK TO IT IN SILENCE.  Nothing
errors: the PDF simply opens at page one, and a student who clicked "the
section deriving this unit" gets the cover.  The map is TypeScript, the
labels are LaTeX, and no compiler, test or gate saw across that seam.

WHAT THIS CHECKS.  Every destination named in modelDocs.ts resolves to a
`\\label{...}` in the guide that entry names.  Nothing more.

WHAT THIS DOES NOT CHECK, and the omission is deliberate rather than an
oversight.  **WHETHER A LIVE ANCHOR IS THE RIGHT ONE.**  That is exactly the
defect this file was written after: `adiabaticFlash` pointed at `ch:flash`,
a label that EXISTS -- on a section titled "Isothermal flash,
vapour-liquid".  The anchor was alive and the destination was wrong, so this
gate would have passed it, and it says so rather than implying otherwise.

The rule a human applies instead: A SHARED DESTINATION IS HONEST ONLY WHEN
ITS HEADING COVERS EVERY TYPE THAT LANDS ON IT.  Measured 2026-09-22 across
the whole table -- 54 mapped types, 28 destinations, 17 shared -- every
other share passed that test by its own heading ("Rotating equipment:
compressors, turbines, pumps"; "cyclone, bag filter, ideal splitter";
"boiler / condenser"), or was an umbrella naming none of them on purpose
("The simple unit operations").

IT IS NOT GATED BECAUSE EVERY MECHANICAL FORM OF IT ACCUSES THE INNOCENT.
"The heading must mention the type" fails `mixer` on "The simple unit
operations" and `spiralWoundModule` on "Spiral-wound membrane", both of
which are right.  A gate that accuses the innocent teaches the reader to
ignore it (2026-09-04), so the judgement is left where a reader can see it:
written beside the entry in modelDocs.ts.

Exit 1 naming the entry, its destination and the guide it is missing from.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MAP = ROOT / "gui" / "src" / "case" / "modelDocs.ts"
GUIDES = {
    "theoryGuide": ROOT / "docs" / "theoryGuide.tex",
    "propsGuide": ROOT / "docs" / "propsGuide.tex",
    "userGuide": ROOT / "docs" / "userGuide.tex",
    "eduToolsGuide": ROOT / "docs" / "eduToolsGuide.tex",
    "designGuide": ROOT / "docs" / "designGuide.tex",
    "developerGuide": ROOT / "docs" / "developerGuide.tex",
}

#  Which guide each destination table targets.  Read from the table's own
#  `guideUrl("<guide>", dest)` call rather than guessed.
TABLES = [
    ("THEORY_DEST", "theoryGuide"),
    ("PROPS_DEST", "propsGuide"),
]


def labels_of(path: Path) -> set:
    if not path.is_file():
        return set()
    #  `\input`-ed chapters count too: the guide is one document.
    text = path.read_text()
    out = set(re.findall(r"\\label\{([^}]+)\}", text))
    for inc in re.findall(r"\\input\{([^}]+)\}", text):
        sub = (path.parent / inc)
        for cand in (sub, sub.with_suffix(".tex")):
            if cand.is_file():
                out |= set(re.findall(r"\\label\{([^}]+)\}", cand.read_text()))
    return out


def main() -> int:
    if not MAP.is_file():
        print(f"check_guide_anchors: FAILED\n  {MAP} is missing -- the map "
              "this gate reads does not exist, so nothing was checked.")
        return 1
    src = MAP.read_text()

    cache = {}
    fails = []
    checked = 0
    per_table = {}
    for table, guide in TABLES:
        #  `\b` is load-bearing: without it `const THEORY_DEST[^{]*{` also
        #  matches `const THEORY_DESTS`, because the name is a PREFIX and the
        #  wildcard swallows the rest of the declaration.  A sabotage that
        #  renamed the table survived on exactly that, and a gate blind to a
        #  renamed table reports agreement about a table it never read.
        m = re.search(r"const " + table + r"\b[^{]*\{(.*?)\n\};", src, re.S)
        if not m:
            fails.append(f"harvested NO entries from {table} -- its shape "
                         "changed, so this gate is blind there rather than "
                         "satisfied")
            continue
        body = re.sub(r"//[^\n]*", "", m.group(1))
        entries = re.findall(r'^\s*([A-Za-z0-9_]+):\s*"([^"]+)"', body, re.M)
        if not entries:
            fails.append(f"harvested NO entries from {table} -- its shape "
                         "changed, so this gate is blind there rather than "
                         "satisfied")
            continue
        per_table[table] = (len(entries), guide)
        if guide not in cache:
            cache[guide] = labels_of(GUIDES[guide])
        if not cache[guide]:
            fails.append(f"harvested NO \\label from {guide} -- the guide is "
                         "missing or its shape changed, so every anchor into "
                         "it is unchecked rather than checked")
            continue
        for key, dest in entries:
            checked += 1
            if dest not in cache[guide]:
                fails.append(
                    f"{table}[{key}] -> \"{dest}\", which is NOT a \\label in "
                    f"{guide}.tex -- the PDF has no such named destination, "
                    f"so the link opens the guide at page one and the reader "
                    f"is told nothing")

    if fails:
        print("check_guide_anchors: FAILED")
        for f in fails:
            print("  -", f)
        return 1

    shape = ", ".join(f"{t} {n} into {g}" for t, (n, g) in sorted(per_table.items()))
    print(f"check_guide_anchors: OK -- all {checked} guide anchor(s) the GUI "
          f"links to resolve to a real \\label ({shape}).  NOT CHECKED, and "
          f"deliberately: whether a LIVE anchor is the RIGHT one.  That is "
          f"the defect this gate was written after -- `adiabaticFlash` "
          f"pointed at `ch:flash`, a label that exists, on a section titled "
          f"\"Isothermal flash\" -- and every mechanical form of the check "
          f"accuses innocent umbrella sections, so the judgement is written "
          f"beside the entries instead.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
