#!/usr/bin/env python3
"""Gate: every `origin <word>;` written as a DICT FORM in PROSE uses a word the
vocabulary's one home knows.

    bin/curate/check_origin_vocabulary.py

WHY THIS EXISTS.  On 2026-09-19 the engine's word was `estimated` -- the
`Origin::estimated` enum, `originToWord`, and all 150 records under data/ that
declare the rung (`grep -rho "origin *estimated *;" data/` = 150; the same
grep for `estimate` = 0).  Every PROSE home disagreed, and all of them the same
way: `origin estimate;` in the property-architecture record (the source the
others copied), the case-authoring guide `bin/llmctx` ships to an assistant,
the generator behind docs/ai/components.md, the Theory Guide twice, three
design records, the decision index's quotation of a ruling, two engine
comments sitting a screen above refusal messages that said `estimated`, and
CLAUDE.md -- 21 sites in 15 files.  The records were right; the documents
that teach how to write one were wrong.

WHY NOTHING CAUGHT IT, in two halves, and both halves are DELIBERATE and
untouched here:

  * `originFromWord` (core/Origin.H) is TOLERANT -- `"estimated" ||
    "estimate"` -- so a record copied from any of those documents RUNS,
    resolves the right Origin, prints the right word back, and at run time
    there is nothing to see.
  * `check_origin_census` KNOWS `estimated` and would refuse a record saying
    `estimate` -- but it reads data/standards/ only.  A case-local record
    written from the manual is judged by nothing, and no gate read prose.

So this gate reads the prose.  A document that TEACHES a grammar is a
copy-source, and a copy-source with the wrong word is a defect that propagates
by the most reliable channel there is: people doing what the manual says.

WHAT THIS GATE CHECKS

  (a) Every match of the DICT FORM -- `origin`, whitespace, a word, optional
      whitespace, `;` -- in every text file under SCAN_DIRS plus the root
      `*.md` files, read as ONE STRING (the EDStack.H and CLAUDE.md sites both
      wrapped `origin` / `estimate;` across two lines, and a line-anchored
      grep walked past them), uses a word in `check_origin_census.KNOWN`.
      KNOWN is IMPORTED, never copied: a copied set is a second home, and
      this whole gate exists because of second homes.

  (b) The exemption lists are STILL TRUE.  A word pinned in
      `debt_registry.ORIGIN_WORDS_OUTSIDE_VOCABULARY` that no longer occurs
      anywhere in the scan FAILS asking for its pin back; a (file, word) in
      NAMED_QUOTED or NAMED_ENGLISH whose file no longer carries that word
      FAILS the same way.  A pin outliving its subject is a licence.

  (c) It REFUSES rather than passes when it cannot judge: an EMPTY imported
      vocabulary (the import disarmed, the census rewritten) or a scan that
      finds ZERO dict forms in a tree that carries dozens are both states in
      which "nothing wrong found" would be a claim about nothing.

A HEURISTIC WAS TRIED, MEASURED, AND REMOVED -- recorded because the
measurement is the useful half.  The first version set aside any match whose
nearest preceding non-blank character was a letter, reasoning that a dict form
in prose is quoted or bracketed while an English sentence runs into the word
before it (`seven origin announcements` followed by a semicolon, in
transport-correlations-as-objects.md, is such a sentence and matches the
regex).  Predicted: one sentence set aside, no true site lost.  Measured: FIVE
set aside, and two of them were TRUE dict forms -- `carries origin measured;
reviewStatus ...` (tutorialsGuide-electrochem.tex) and `marked origin
estimated; reviewStatus ...` (tutorialsGuide-steady.tex), both correct today,
both bare forms a sentence runs straight into, both exactly the shape whose
drift this gate exists to see.  Two true sites lost to save one false one is
the wrong trade, so every form is JUDGED and the English sentence is exempt BY
NAME with its stale arm.  A named exemption is a claim a reader can check; a
heuristic is a claim about the shape of sentences nobody has read.

TWO KINDS OF EXEMPTION, kept apart because they answer different questions:

  * NAMED_QUOTED / NAMED_ENGLISH (in this file) -- a document or gate that
    writes a WRONG word ON PURPOSE (a design record quoting a typo to make its
    point, a census docstring recording its own sabotage, a gate building the
    probe record it expects to be REFUSED, this gate's own record of the
    drift), or an English sentence the regex cannot tell from a dict form.  A
    document that defines a ban must be able to quote it (the
    `check_glossary_bans` posture).  Not violations, so not in the registry;
    they parameterise the search.
  * `debt_registry.ORIGIN_WORDS_OUTSIDE_VOCABULARY` -- a word somebody CHOSE
    and registered nowhere the vocabulary lives.  `teachingSurrogate` is LIVE
    (the engine dispatches on it by string, two case-local records declare
    it, Origin.H resolves it to `unattributed`); `citedHeuristic` is a
    proposal in a design record.  Each is an accepted violation with a stated
    exit, and the registry is the one home for those.

WHAT THIS GATE DOES **NOT** DO, so its OK line cannot imply it:

  * It does not read RECORDS.  data/standards/ is the census's domain;
    data/local/ is private; case-local records under tutorials/ are read by
    NEITHER gate -- that gap is named here and not closed.
  * It does not touch the engine's tolerance in Origin.H, and does not ask
    whether the tolerance should exist.
  * It does not judge whether a word is TRUE of the value beside it.
  * It does not see the BACKTICK PROSE FORM without a semicolon (`origin
    estimate` in running text; three gui/schemas descriptions carried it).

SABOTAGE-VERIFIED 2026-09-19, by hand, tree restored byte-identical after
each.  PREDICTED / HAPPENED:

  S1  `origin estimate;` written into a docs/ comment.
      Predicted: FAIL naming file:line.  Happened: as predicted; gate_claim
      then reports no claim line, as a FAIL should.
  S2  The LINE-WRAPPED form -- `origin` at the end of one comment line,
      `estimate;` at the start of the next -- in a .H header.  The
      load-bearing one: the shape a line-anchored scan misses.
      Predicted: FAIL naming the file and the line `origin` starts on.
      Happened: NOT AT FIRST.  The probe was written inside a `//` comment,
      so the marker `//` sat between the two halves and a gap defined as
      whitespace alone could not cross it -- the first sweep had only ever
      seen this shape inside a BLOCK comment (EDStack.H's Description) and
      the gap was written for that.  The gap now admits a comment
      continuation marker AT THE START OF A LINE -- the first widening
      admitted it anywhere in the gap and accused four Python format
      strings (`origin %s;` with `s` taken as the word), which is a gate accusing
      the innocent and was measured before it was wired.  Both shapes
      (block-comment wrap and `//` wrap) were then run and both FAIL naming
      the line `origin` starts on.
  S3  English prose.  The brief's probe, "the estimate; and", cannot match a
      pattern that requires the word `origin` and proves nothing, so the
      sabotage run was the LIVE sentence: its NAMED_ENGLISH exemption
      removed.  Predicted: exactly ONE finding, at
      transport-correlations-as-objects.md:414, and none with the exemption
      in place.  Happened: as predicted both ways.
  S4  The KNOWN import disarmed (bound to an empty set).
      Predicted: FAIL, never a PASS over an empty domain, with the count
      visible.  Happened: as predicted -- arm (c) fires before any word is
      judged, printing `0 words` and naming the census as the home.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
from check_origin_census import KNOWN                               # noqa: E402
from debt_registry import ORIGIN_WORDS_OUTSIDE_VOCABULARY           # noqa: E402

#  Where prose lives.  data/ and tutorials/ are RECORDS and are the census's
#  (or nobody's) domain; gui/dist is a build; thirdParty is not ours.
SCAN_DIRS = ("docs", "src", "bin", "gui/src", "gui/schemas")
SKIP_DIRS = {".git", "node_modules", "build", "dist", "__pycache__",
             "thirdParty", "local"}

#  The DICT FORM: `origin`, a GAP, a word, optional whitespace, `;`.  The gap
#  is whitespace -- a newline counts -- and a line it opens may begin with a
#  COMMENT CONTINUATION MARKER: `//` (a C++ line comment wrapped onto its next
#  line), `*` (a starred block comment), `#` (shell, Python), `%` (TeX).  S2
#  found the need: a form wrapped inside a `//` comment has the marker between
#  its two halves, and a gap that is whitespace alone walks past it exactly
#  as a line-anchored grep did.  The marker is admitted ONLY at the start of
#  a line, because the first attempt admitted it anywhere in the gap and
#  read `origin %s;` in four Python format strings with `s` taken as the word -- a
#  marker mid-line is an operator, not a comment.  Case-sensitive: `Origin
#  origin;` in C++ has no word between and never matches.
FORM = re.compile(r"\borigin(?=\s)[ \t]*"
                  r"(?:\r?\n[ \t]*(?:(?://|\*|#|%)[ \t]*)?)*"
                  r"([A-Za-z_][A-Za-z0-9_]*)\s*;")

#  A wrong word written ON PURPOSE, exempt BY NAME with the reason.  Each
#  (path, word) must still occur or arm (b) fails.
NAMED_QUOTED = {
    ("docs/design/origin-vocabulary-conflict.md", "definitoin"):
        "quotes a typo to show a typo and a chosen word are indistinguishable",
    ("bin/curate/check_origin_census.py", "plausible"):
        "its own S3 sabotage record: the word it wrote to make arm (c) fire",
    ("bin/curate/check_element_composition.py", "literatre"):
        "a probe record the gate builds and expects to be refused",
    ("bin/curate/check_thiele_pellet.py", "gateProbe"):
        "a probe record the gate builds; the word says it is one",
    ("bin/curate/check_origin_vocabulary.py", "estimate"):
        "this gate's own record of the drift it exists to catch",
}

#  An English sentence the regex cannot tell from a dict form.  Measured on
#  the clean tree of 2026-09-19: this is the ONLY one.
NAMED_ENGLISH = {
    ("docs/design/transport-correlations-as-objects.md", "announcements"):
        "the sentence 'seven origin announcements' running into a semicolon "
        "-- a list of what a gate's arms hold",
}


def is_text(b: bytes) -> bool:
    return b"\0" not in b[:8192]


def files_to_scan():
    for d in SCAN_DIRS:
        base = ROOT / d
        if not base.is_dir():
            continue
        for p in sorted(base.rglob("*")):
            if not p.is_file():
                continue
            if any(part in SKIP_DIRS for part in p.relative_to(ROOT).parts):
                continue
            yield p
    for p in sorted(ROOT.glob("*.md")):
        yield p


def main() -> int:
    fails = []

    # ---- (c) can this gate judge at all? -----------------------------------
    if not KNOWN:
        print("check_origin_vocabulary: FAIL")
        print("  - the imported vocabulary `check_origin_census.KNOWN` is "
              "EMPTY (0 words): the gate cannot judge a single form and must "
              "not pass over an empty domain.  Read bin/curate/"
              "check_origin_census.py -- KNOWN is the one home, and this gate "
              "never carries a copy.")
        return 1

    n_forms, n_files = 0, 0
    seen_words = {}            # word -> count, over every form
    exempt_seen = set()        # (relpath, word) pairs that occurred
    for p in files_to_scan():
        try:
            b = p.read_bytes()
        except OSError:
            continue
        if not is_text(b):
            continue
        text = b.decode("utf-8", "ignore")
        rel = p.relative_to(ROOT).as_posix()
        hit_here = False
        for m in FORM.finditer(text):
            word = m.group(1)
            n_forms += 1
            hit_here = True
            seen_words[word] = seen_words.get(word, 0) + 1
            if word in KNOWN:
                continue
            if (rel, word) in NAMED_QUOTED or (rel, word) in NAMED_ENGLISH:
                exempt_seen.add((rel, word))
                continue
            if word in ORIGIN_WORDS_OUTSIDE_VOCABULARY:
                continue
            line = text.count("\n", 0, m.start()) + 1
            fails.append("%s:%d writes `origin %s;` -- not a word the "
                         "vocabulary knows (check_origin_census.KNOWN).  The "
                         "engine's originFromWord may tolerate it and print a "
                         "plausible word back, which is exactly why nothing at "
                         "run time will say so; a document that teaches a "
                         "grammar is a copy-source.  Use the word the records "
                         "use, or register the new one where the vocabulary "
                         "lives -- a decision, written down."
                         % (rel, line, word))
        if hit_here:
            n_files += 1

    if n_forms == 0:
        print("check_origin_vocabulary: FAIL")
        print("  - 0 `origin <word>;` forms found under %s -- a tree that "
              "teaches the grammar carries dozens, so a scan that finds none "
              "is not looking, and must not pass." % ", ".join(SCAN_DIRS))
        return 1

    # ---- (b) the exemptions are still true ---------------------------------
    for table, label in ((NAMED_QUOTED, "NAMED_QUOTED"),
                         (NAMED_ENGLISH, "NAMED_ENGLISH")):
        for key, why in sorted(table.items()):
            if key not in exempt_seen:
                fails.append("%s pins (%s, `%s`) -- \"%s\" -- and that file "
                             "no longer writes the word.  Remove the pin: an "
                             "exemption outliving its subject is a licence."
                             % (label, key[0], key[1], why))
    for w in sorted(ORIGIN_WORDS_OUTSIDE_VOCABULARY):
        if w not in seen_words:
            fails.append("debt_registry.ORIGIN_WORDS_OUTSIDE_VOCABULARY pins "
                         "`%s` and no prose site writes `origin %s;` any more."
                         "  Either the word was registered (delete the pin) or "
                         "the sites were renamed (delete the pin) -- a debt "
                         "that closes must leave the ledger." % (w, w))

    if fails:
        print("check_origin_vocabulary: FAIL -- %d finding(s)" % len(fails))
        for f in fails:
            print("  - " + f)
        return 1

    pinned = sorted(w for w in ORIGIN_WORDS_OUTSIDE_VOCABULARY if w in seen_words)
    print("check_origin_vocabulary: OK -- %d `origin <word>;` forms in %d "
          "prose files all use a KNOWN word (%d words imported from "
          "check_origin_census, never copied), or one of %d word(s) pinned "
          "in debt_registry with a stated exit (%s), or one of %d sites "
          "exempt BY NAME (%d deliberate quotations, %d English sentence).  "
          "SCANNED: %s and the root *.md, every text file, read as one "
          "string so a line-wrapped form is seen.  NOT CHECKED: records under "
          "data/ (the census's domain) and case-local records under "
          "tutorials/ (nobody's); the engine's tolerance in core/Origin.H; "
          "whether a word is TRUE of its value; the backtick prose form with "
          "no semicolon."
          % (n_forms, n_files, len(KNOWN), len(pinned), ", ".join(pinned),
             len(NAMED_QUOTED) + len(NAMED_ENGLISH), len(NAMED_QUOTED),
             len(NAMED_ENGLISH), ", ".join(SCAN_DIRS)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
