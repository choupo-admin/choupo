#!/usr/bin/env python3
"""The Rules-of-Thumb page indexes the guide, and quotes none of it.

WHY THIS GATE EXISTS.  Process heuristics are exactly the material a student
acts on without re-deriving, and several of the guide's numbers sit beside
named safety standards.  The obvious build -- writing rules into the EduTool
page -- would put a second, drifting home under them.  Prose copies of golden
values drifted three times in this tree in one week for smaller stakes.

So the contract is structural and this gate enforces it:

  (a) generated/designGuideIndex.json is CURRENT against docs/designGuide.tex
      (delegated to design_guide_index.py --check, which is the one home for
      the parse -- a second parse here would be the sin again);
  (b) every label in the index is a REAL `\\label{...}` in the .tex, so no
      row deep-links a reader into nothing.  **This arm is LATENT, not live,
      and saying so is better than crediting it**: the index is DERIVED from
      those same labels, so it cannot disagree with them by drifting -- arm
      (a) catches any edit to the file first.  What (b) guards is the PARSER
      one day emitting a label the guide does not define (a changed regex, a
      new pandoc output).  It pins reachability, it does not currently
      exercise it;
  (c) the page CONTAINS NO RULE TEXT: no number beside a physical unit, which
      is what a transcribed heuristic looks like;
  (d) the page reads the index rather than listing chapters itself.

WHAT IT CANNOT CHECK, and (c) is the arm to be honest about: it is a SHAPE
test, not comprehension.  A rule written without a number ("countercurrent
beats cocurrent") passes, and a legitimate number in running prose ("80 % of
the answer for 20 % of the effort") must not fail -- so percentages are exempt
and it looks for physical units.  A tripwire against transcription, never a
proof of its absence.

SABOTAGES, four, all fire:
  S1  a section renamed in the .tex, index not regenerated  -> STALE
  S2  a label in the index the .tex does not define         -> dead deep link
  S3  a heuristic transcribed into the page
      ("size liquid lines at 1-3 m/s")                      -> rule text
  S4  the page stops reading the index         -> SURVIVED the first
      implementation (the file name was still in the page's footer) and
      fires now that the arm matches the fetch itself
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TEX = ROOT / "docs" / "designGuide.tex"
INDEX = ROOT / "generated" / "designGuideIndex.json"
PAGE = ROOT / "gui" / "src" / "ui" / "methods" / "RulesOfThumbTool.tsx"

#  A number followed by a physical unit is what a transcribed heuristic looks
#  like.  Percentages are deliberately absent: the page quotes the guide's own
#  "80 % of the answer for 20 % of the effort", which is framing, not a rule.
UNITS = (r'm/s|m\^?2|m\^?3|kPa|MPa|bar|barg|psi|degC|kW|MW|kJ|kg/h|'
         r'kmol|mm|cm|s\^?-1|W/m')
RULE_TEXT = re.compile(r'\d+(?:\.\d+)?\s*(?:-|–|to)?\s*\d*(?:\.\d+)?\s*(?:%s)\b'
                       % UNITS)


def main() -> int:
    for p in (TEX, INDEX, PAGE):
        if not p.exists():
            print("check_rules_of_thumb: FAILED -- %s does not exist.  A gate "
                  "whose subject is absent must not pass."
                  % p.relative_to(ROOT))
            return 1

    #  (a) freshness, through the tool that OWNS the parse.  A second parse
    #  here would be the arity sin inside the gate built to prevent it.
    r = subprocess.run([sys.executable,
                        str(ROOT / "bin/curate/design_guide_index.py"),
                        "--check"], capture_output=True, text=True)
    if r.returncode != 0:
        print("check_rules_of_thumb: FAILED")
        print("  " + (r.stdout or r.stderr).strip())
        return 1

    doc = json.loads(INDEX.read_text())
    rows = [(s["title"], s["label"]) for s in doc["sections"]]
    rows += [(x["title"], x["label"])
             for s in doc["sections"] for x in s["subsections"]]

    bad = []
    #  (b) every deep link lands somewhere.
    labels = set(re.findall(r'\\label\{([^}]+)\}', TEX.read_text()))
    for title, label in rows:
        if label not in labels:
            bad.append("index row %r links to \\label{%s}, which "
                       "docs/designGuide.tex does not define -- the reader "
                       "would land at the top of a 2400-line PDF"
                       % (title, label))

    page = PAGE.read_text()
    #  (c) no transcribed rules.  The header comment legitimately DISCUSSES
    #  what a rule looks like, so read the code below it.
    marker = "export function RulesOfThumbTool"
    body = page[page.index(marker):] if marker in page else page
    hits = sorted(set(RULE_TEXT.findall(body)))
    if hits:
        ctx = []
        for h in hits:
            m = re.search(r'.{0,50}%s.{0,25}' % re.escape(h), body)
            if m:
                ctx.append(m.group(0).strip())
        bad.append("the page appears to QUOTE a rule (%s).  The guide is the "
                   "one home for heuristics; this page indexes it.  Context: %s"
                   % (", ".join(repr(h) for h in hits),
                      " | ".join(repr(c) for c in ctx[:3])))

    #  (d) derived, not listed.  MATCH THE FETCH, not the file name: the
    #  first version tested for the string "designGuideIndex.json" anywhere
    #  in the page, and sabotage S4 -- which repoints the fetch at another
    #  file -- SURVIVED it, because the name also appears in the page's own
    #  provenance footer.  A check satisfied by a caption is not a check.
    if not re.search(r'new URL\(\s*"docs/designGuideIndex\.json"', page):
        bad.append("the page does not FETCH docs/designGuideIndex.json; "
                   "whatever it lists is not the guide's own structure "
                   "(the name appearing elsewhere in the file is not the "
                   "same thing as reading it)")
    if "shown.map(" not in page:
        bad.append("the page does not render the fetched index")

    if bad:
        print("check_rules_of_thumb: FAILED")
        for b in bad:
            print("  " + b)
        return 1

    print("check_rules_of_thumb: OK -- %d indexed entr(ies) over %d chapter(s) "
          "are current against docs/designGuide.tex, every one deep-links to a "
          "label the guide defines, and the page quotes no rule.  NOT CHECKED: "
          "whether any heuristic in the guide is RIGHT, whether a browser "
          "renders the page, or a rule transcribed WITHOUT a number -- arm (c) "
          "is a tripwire against transcription, not a proof of its absence."
          % (len(rows), len(doc["sections"])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
