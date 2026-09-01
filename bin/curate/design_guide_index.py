#!/usr/bin/env python3
"""Derive the Rules-of-Thumb index from docs/designGuide.tex.

    bin/curate/design_guide_index.py [--check]

WHY THIS IS AN INDEX AND NOT A PAGE OF RULES.  The obvious way to put process
heuristics in the EduTools is to write them into a TypeScript page.  That is
the arity sin with the worst possible subject: `docs/designGuide.tex` is 2400
lines of curated heuristics with named standards beside the safety-critical
ones, and a second copy in the GUI would drift -- silently, on exactly the
values a student would act on.  Three prose drifts were found in this tree in
one week for smaller stakes.

So the page carries NO rule text.  It carries the guide's own structure, and
every row deep-links into the PDF at that section's named destination
(`guide.html?g=designGuide#nameddest=<label>`, which works because
docs/preamble.tex sets `destlabel=true`).  The rules have one home; the page
is a way in.

WHAT IS DERIVED: each `\\section`/`\\subsection` title and its `\\label`.  Titles
wrap across lines in the pandoc output (`\\section{Heat exchangers --- type
selection &\\nsizing}\\label{...}`), so the reader joins lines before matching
rather than reading the first line and truncating -- which is what the first
version did, and it silently produced titles ending in "type selection &".

WHAT IS NOT DERIVED, deliberately: the rules themselves, any number, and any
judgement about which rule matters.  This file knows the shape of the guide
and nothing about its content.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TEX = ROOT / "docs" / "designGuide.tex"
OUT = ROOT / "generated" / "designGuideIndex.json"

#  Pandoc emits `\section{Title}\label{id}}` -- note the stray closing brace
#  on some rows.  Titles may wrap over several source lines.
PAT = re.compile(r'\\(section|subsection)\{(.+?)\}\s*\\label\{([^}]+)\}', re.S)


def clean(title: str) -> str:
    """The title as a reader sees it, not as LaTeX spells it."""
    t = re.sub(r'\s+', ' ', title).strip()
    t = t.replace(r'\&', '&').replace(r'\%', '%').replace(r'\_', '_')
    t = t.replace('---', '—').replace(r'\textsection{}', '§')
    t = re.sub(r'\\\(([^\\]*?)\\\)', r'\1', t)      # inline math -> its body
    t = re.sub(r'\\[a-zA-Z]+\{([^}]*)\}', r'\1', t)  # \emph{x} -> x
    t = re.sub(r'\\[a-zA-Z]+\s*', '', t)             # bare macros
    return re.sub(r'\s+', ' ', t).strip(' {}')


def build():
    if not TEX.exists():
        sys.exit("design_guide_index: %s does not exist -- the index would "
                 "describe nothing." % TEX.relative_to(ROOT))
    text = TEX.read_text()
    sections, current = [], None
    for kind, title, label in PAT.findall(text):
        row = {"title": clean(title), "label": label}
        if kind == "section":
            current = dict(row, subsections=[])
            sections.append(current)
        elif current is not None:
            current["subsections"].append(row)
    if len(sections) < 5:
        sys.exit("design_guide_index: only %d section(s) parsed from a 2400-"
                 "line guide.  The parse has collapsed and an index over it "
                 "would describe nothing." % len(sections))
    return {
        "note": "DERIVED by bin/curate/design_guide_index.py from "
                "docs/designGuide.tex.  Titles and labels only -- NO rule "
                "text, deliberately: the guide is the one home for the "
                "heuristics and a copy in the GUI would drift on exactly "
                "the numbers a student would act on.",
        "guide": "designGuide",
        "sections": sections,
    }


def main() -> int:
    doc = build()
    if "--check" in sys.argv:
        if not OUT.exists():
            print("design_guide_index: FAILED -- %s does not exist; run "
                  "bin/curate/design_guide_index.py"
                  % OUT.relative_to(ROOT))
            return 1
        if json.loads(OUT.read_text()) != doc:
            print("design_guide_index: FAILED -- %s is STALE against "
                  "docs/designGuide.tex.  Regenerate with "
                  "bin/curate/design_guide_index.py."
                  % OUT.relative_to(ROOT))
            return 1
        n = sum(1 + len(s["subsections"]) for s in doc["sections"])
        print("design_guide_index: OK -- %d entr(ies) over %d section(s) "
              "match docs/designGuide.tex.  NOT CHECKED: whether any rule in "
              "the guide is right, or whether the page renders."
              % (n, len(doc["sections"])))
        return 0
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    print("design_guide_index: wrote %s -- %d section(s), %d subsection(s)"
          % (OUT.relative_to(ROOT), len(doc["sections"]),
             sum(len(s["subsections"]) for s in doc["sections"])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
