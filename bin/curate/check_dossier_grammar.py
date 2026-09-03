#!/usr/bin/env python3
"""Gate: the curation dossier is written in a grammar Choupo can read back.

    bin/curate/check_dossier_grammar.py

WHY THIS EXISTS.  A `<case>/curation/<component>.dossier` is the scientific
work record of a curation act: what evidence was declared, which half was
frozen as held-out BEFORE the fit, what the held-out residual was, and the
verdict that follows from the pre-declared band.  Nothing in the solver reads
it, by construction -- but tools do, and a student's Explorer should.

Until 2026-09-03 nothing could.  Two separate grammar violations, both found by
pointing the project's own parser at its own file:

  1. `property <name>` + `{ ... }` -- a keyword-prefixed named block, which is
     not a form the dict grammar has.  The parser stops at
     "expected ';' after word value of 'property'".

  2. `min 0.05 x1;` -- the domain's COORDINATE LABEL written in the unit slot.
     `x1` is a mole fraction: dimensionless, and a name for which coordinate
     the interval is on.  The parser stops at "unknown unit suffix 'x1'".

The consequences were measured, not supposed.  `bin/curate/promote-from-dossier`
hand-rolls regexes under a comment reading *"a parser here would be a second
implementation of one Choupo already has"* -- the principle stated, and not
followed, because it could not be.  And the Explorer's component inspector told
every reader that "no curation dossier is attached to this component" while
three dossiers in the corpus named `ethanol` and one named `water`.  **An
absence nobody checked is not a finding.**

The fix is in the WRITER: the property block opens with its name alone, and the
coordinate is declared under its own key.  Indentation inside is unchanged on
purpose -- nesting under a `properties {}` would have shifted every line and
broken exact-spacing substrings two other gates check for, for no gain.

WHAT THIS GATE CHECKS, over every `.dossier` the corpus carries:

  (a) IT PARSES.  A dict tokenizer/parser replica walks the file and refuses
      exactly where the real one would: an unknown unit suffix on a scalar, and
      a word value followed by `{`.  The two forms this file used to be written
      in are the two named refusals, so a regression is reported as itself
      rather than as "something went wrong".

  (b) EVERY PROPERTY BLOCK IS FOUND BY THE STRUCTURAL RULE -- a top-level
      sub-dict that DECLARES `verdict` -- which is the rule the GUI reader and
      `promote-from-dossier` both apply.  A dossier with no property block at
      all is reported: it would read as a component nobody has curated.

  (c) EACH VERDICT IS ONE OF THE ENGINE'S FIVE.  The GUI mirrors that union
      exactly; a sixth word would be a classification `CurationDossier::
      verdictOf` never made, and the reader drops it silently.

  (d) A VERDICT FOLLOWS FROM ITS OWN NUMBERS.  Where a `validated` block
      carries both a held-out AAD and a pre-declared band, the AAD must be
      inside the band.  A panel drawing `validated` beside an AAD above its own
      limit would be showing a claim the arithmetic contradicts.

SABOTAGE-VERIFIED 2026-09-03, three times.

S1 -- the writer's `property ` keyword prefix restored.  Arm (a), naming the
      word-then-brace form.

S2 -- the coordinate written back into the unit slot (`min 0.05 x1;`).  Arm
      (a), naming the unit suffix.  These two are separate arms because they
      are separate defects that happened to live in one file.

      **IT SURVIVED ITS FIRST RUN, and twice over.**  The first attempt
      regenerated only ONE witness, whose domain coordinate is `K` -- a real
      unit -- so the sabotage produced a legal file and proved nothing: a
      sabotage that never reaches its subject has tested nothing.  With every
      dossier regenerated it survived AGAIN, and that one was the gate's fault:
      the pattern was anchored with `^\s*`, while the domain writes its
      intervals INLINE (`fit  { min 0.05 x1; max 0.95 x1; n 8; }`), so the key
      it had to match never begins a line.  The gate reported OK over a file
      the real parser refuses.  A pattern anchored where its subject does not
      live is a check that cannot fire.

S3 -- a `validated` verdict left on a block whose AAD exceeds its band.  Arm
      (d).

WHAT THIS GATE DOES **NOT** COVER:

  * It is a REPLICA of the dict reader, not the reader itself -- there is no
    Python dict parser in this repository to call, and writing a full one here
    would be the second implementation this gate's own subject warns about.  It
    checks the two constructs that actually broke, plus balance and structure;
    a third grammar violation of a kind nobody has hit would pass.
  * It does not check that any NUMBER is right, only that a verdict is
    consistent with the two numbers printed beside it.
  * It reads the dossiers as committed.  Whether re-running the corpus would
    produce the same ones is `bin/runTests`.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VERDICTS = {"validated", "notValidated", "heldOutPerformed",
            "validationRefused", "notClaimed"}
#  The unit words a dossier legitimately uses today.  A scalar followed by any
#  other bare word is the `x1` defect: a label wearing a unit's slot.
KNOWN_UNITS = {"K", "bar", "Pa", "J", "mol", "kg", "m", "s", "kW", "W", "%"}


def strip_comments(t):
    t = re.sub(r"/\*.*?\*/", " ", t, flags=re.S)
    return re.sub(r"//[^\n]*", "", t)


def grammar_refusals(text):
    """The two constructs the real parser refuses, reported by name."""
    out = []
    #  A word VALUE followed by `{` -- `property binaryVLE.T_bubble\n{`.
    for m in re.finditer(r"^\s*([A-Za-z_][\w.]*)[ \t]+([A-Za-z_][\w.\-]*)\s*\n\s*\{",
                         text, re.M):
        out.append("`%s %s` then `{` -- a keyword-prefixed named block is not "
                   "dict grammar; the parser stops at \"expected ';' after "
                   "word value of '%s'\"" % (m.group(1), m.group(2), m.group(1)))
    #  A scalar followed by a bare word that is not a unit -- `min 0.05 x1;`.
    #
    #  NOT ANCHORED TO THE LINE START, and that is the whole point: the first
    #  version was, and sabotage S2 SURVIVED because the domain writes its
    #  intervals inline -- `fit  { min 0.05 x1; max 0.95 x1; n 8; }` -- so the
    #  key it had to match never begins a line.  The gate reported OK over a
    #  file the real parser refuses.  A pattern anchored where its subject does
    #  not live is a check that cannot fire.
    for m in re.finditer(r"(?<![\w.])([A-Za-z_][\w.]*)\s+(-?[\d.][\deE.+-]*)\s+([A-Za-z_]\w*)\s*;",
                         text):
        if m.group(3) not in KNOWN_UNITS:
            out.append("`%s %s %s;` -- `%s` sits in the UNIT slot and is not a "
                       "unit; the parser stops at \"unknown unit suffix '%s'\""
                       % (m.group(1), m.group(2), m.group(3), m.group(3),
                          m.group(3)))
    return out


def property_entries(text):
    """(name, body) per entry in the top-level `properties ( ... )` list.

    A LIST and not a dict, deliberately: curate01 curates `vapourPressure`
    twice with opposite verdicts, and the first version of this gate returned
    a dict keyed by name -- so it counted 4 property blocks where the corpus
    declares 5, silently dropping the `validationRefused` half, which is the
    one a reader most needs to see.  A collection keyed by a name that repeats
    is a collection that loses data.
    """
    out, i = [], 0
    while i < len(text):
        m = re.compile(r"^\{", re.M).search(text, i)
        if not m:
            break
        depth, j = 0, m.start()
        while j < len(text):
            if text[j] == "{":
                depth += 1
            elif text[j] == "}":
                depth -= 1
                if depth == 0:
                    break
            j += 1
        body = text[m.end():j]
        nm = re.search(r"^\s*property\s+(\S+)\s*;", body, re.M)
        out.append((nm.group(1) if nm else "", body))
        i = j + 1
    return out


def scalar(body, key):
    m = re.search(rf"^\s*{re.escape(key)}\s+(-?[\d.][\deE.+-]*)\s*;", body, re.M)
    return float(m.group(1)) if m else None


def main():
    files = sorted(ROOT.glob("tutorials/**/curation/*.dossier"))
    fails = []
    if not files:
        print("check_dossier_grammar: FAIL")
        print("  - no .dossier found under tutorials/ -- the gate has no "
              "subject, so it must not pass")
        return 1

    n_props = 0
    for f in files:
        rel = f.relative_to(ROOT)
        text = strip_comments(f.read_text())

        # ---- (a) it parses ------------------------------------------------
        for why in grammar_refusals(text):
            fails.append("%s: %s" % (rel, why))

        # ---- (b) property entries found by the structural rule ------------
        blocks = [(n, v) for n, v in property_entries(text)
                  if re.search(r"^\s*verdict\s+\S+\s*;", v, re.M)]
        if not blocks:
            fails.append("%s: no entry declares a `verdict` -- the readers' "
                         "structural rule finds nothing, so this component "
                         "would read as one nobody has curated" % rel)
        for n, _ in blocks:
            if not n:
                fails.append("%s: an entry declares a verdict but no "
                             "`property` -- a verdict about nothing named"
                             % rel)
        #  A COUNT THE ENGINE CAN BE HELD TO.  Every `verdict` line in the file
        #  must belong to an entry this walker found; a walker that quietly
        #  sees fewer is exactly the defect the list form was adopted to fix.
        n_verdicts = len(re.findall(r"^\s*verdict\s+\S+\s*;", text, re.M))
        if n_verdicts != len(blocks):
            fails.append("%s: the file declares %d verdict(s) and the entry "
                         "walker found %d -- entries are being lost"
                         % (rel, n_verdicts, len(blocks)))
        n_props += len(blocks)

        for name, body in sorted(blocks):
            # ---- (c) the verdict is one of the engine's -------------------
            m = re.search(r"^\s*verdict\s+(\S+)\s*;", body, re.M)
            word = m.group(1) if m else ""
            if word not in VERDICTS:
                fails.append("%s: property `%s` carries verdict `%s`, which is "
                             "not one of CurationDossier::verdictOf's five -- "
                             "a reader mirroring that union drops it silently"
                             % (rel, name, word))

            # ---- (d) the verdict follows from its own numbers -------------
            aad = scalar(body, "aadHeldOutPct")
            band = scalar(body, "acceptanceMaxAADPct")
            if word == "validated" and aad is not None and band is not None \
                    and aad > band:
                fails.append("%s: property `%s` says `validated` with a "
                             "held-out AAD of %g %% against a declared band of "
                             "%g %% -- the verdict contradicts the two numbers "
                             "printed beside it" % (rel, name, aad, band))

    if fails:
        print("check_dossier_grammar: FAIL")
        for x in fails:
            print("  - " + x)
        return 1

    print("check_dossier_grammar: OK -- %d dossier(s) carrying %d property "
          "block(s) are written in grammar the project's own dict parser reads "
          "back: no keyword-prefixed named block, no coordinate label wearing a "
          "unit's slot.  Every block is found by the structural rule both "
          "readers apply (a top-level sub-dict declaring `verdict`), every "
          "verdict is one of the engine's five, and no `validated` sits beside "
          "a held-out AAD outside its own pre-declared band.  NOT COVERED: this "
          "is a REPLICA of the dict reader (there is no Python dict parser here "
          "to call, and writing one would be the second implementation this "
          "gate's own subject warns about), so a third kind of grammar "
          "violation nobody has hit would pass; and no NUMBER is checked, only "
          "that a verdict agrees with the two printed next to it."
          % (len(files), n_props))
    return 0


if __name__ == "__main__":
    sys.exit(main())
