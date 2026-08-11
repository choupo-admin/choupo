#!/usr/bin/env python3
"""Gate: the evidence vocabulary has ONE home, and the GUI never strengthens it.

    bin/curate/check_verdict_parity.py

WHY THIS EXISTS.  On 2026-08-11 the Component Inspector began drawing the
curation dossier's verdict in its coverage table, and to do that it declared
the five verdicts a SECOND time, in TypeScript:

    src/propertyOps/CurationDossier.cpp   verdictOf() -- the authority
    gui/src/case/componentRecord.ts       type CurationVerdict -- the copy
    gui/src/ui/explore/ComponentInspector.tsx   VERDICT{} -- the rendering

That is a scientific vocabulary with three homes, and the GUI tests could not
catch a divergence because they check TypeScript against TypeScript.  Vitor
asked the right question -- is the correspondence gated, or are we now
maintaining the same five-value vocabulary independently? -- and the answer was
that it was not.  This gate is the answer, and it is deliberately the smallest
one available: the project's own remedy for a fact with two homes is a gate
that RECOUNTS, never a generator.  No code is emitted; the three files stay
hand-written, and they may not disagree.

THE DOCTRINE IT PROTECTS (Vitor, 2026-08-11):

    The GUI may display scientific claims made by the evidence machinery;
    it may not infer stronger claims from apparently good data.

A sixth value invented in TypeScript would be exactly that inference: a
classification the engine never made, rendered as though it had.  Equally, a
verdict RETIRED in C++ and left standing in the GUI would render a claim the
engine can no longer produce.  Both directions fail here.

WHAT THIS GATE CHECKS.

  (a) SET PARITY, three ways.  The literals returned by verdictOf(), the
      members of the TS union, and the keys of the renderer's table must be
      the SAME set.  Checked in both directions, because the two failures are
      different lies: a value only in C++ is a verdict the GUI cannot draw
      (it would fall through to undefined); a value only in TS is a verdict
      the GUI can claim and the engine cannot make.

  (b) THE CENSUS -- ZERO EXCEPTIONS (ruled by Vitor, 2026-08-11):

          No human-visible scientific output may use the bare term
          "validation" unless the claim is backed by an EvidencePartition
          establishing held-out evidence.

      A `validation {}` surface compares curated parameters against a dataset
      and nothing there proves the dataset was excluded from the fit being
      assessed.  That comparison is scientifically useful and the BLOCK is not
      renamed -- but the four console messages that called it "validation"
      were, to COMPARISON, in the commit that installed this arm.  Nothing was
      left to grandfather, which is why this is a census and not a pinned list:
      freezing exceptions we had just removed would pin a past that no longer
      exists.

      Scope is stated in the code beside each regex.  Out of scope, each for a
      structural reason rather than by naming a file: comments and docstrings
      (not claims), dictionary keys like `dict->found("validation")` (grammar),
      and the result-JSON key (a machine key with a typed GUI consumer, whose
      rename is a cross-surface contract change).

      A file that CONSUMES a partition may use the word freely -- there the
      claim is backed, and `VALIDATION REFUSED`, which DENIES the claim, lives
      in exactly such a file, so it needs no exception either.

WHAT THIS GATE DOES NOT CHECK.  It does not read the JSON the dossier writes,
so a verdict correctly spelled in all three files but written to the dossier
under a fourth name would pass here.  It also says nothing about whether a
verdict is CORRECT for a given fit -- that is check_evidence_partition's arm.
Stated because a gate that implies more coverage than it has is worse than one
that reports less.

Exit 1 listing the disagreements."""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CPP = ROOT / "src" / "propertyOps" / "CurationDossier.cpp"
TS_UNION = ROOT / "gui" / "src" / "case" / "componentRecord.ts"
TS_RENDER = ROOT / "gui" / "src" / "ui" / "explore" / "ComponentInspector.tsx"

#  A file may make a held-out claim only if it CONSUMES a partition -- reads
#  one, or asks it for its fit / held-out subsets.  Mentioning the class is not
#  enough, and that distinction is not pedantry: R5 (2026-08-11) put
#  `EvidencePartition::refuseOnNonFittingOp` into pitzerActivity, freezingPoint
#  and estimateComponent -- the three ops that provably fit NOTHING -- and a
#  reach test keyed on the class NAME therefore started licensing the claim in
#  exactly the files that may never make it.  Measured, not feared: with the
#  old marker, pitzerActivity printing "HELD-OUT VALIDATION" passed the gate.
#
#  So the marker is the CONSUMING surface, and the refusal call is stripped
#  before the search -- it is the marker of the opposite.
CONSUMES_PARTITION = re.compile(
    r"EvidencePartition::read"
    r"|\bpart\.(fit|validation|engaged|validationRefused|hasAcceptance)"
    r"|\bpartition\.(fit|validation)")
REFUSAL_CALL = re.compile(r"EvidencePartition::refuseOnNonFittingOp\s*\([^;]*;", re.S)

#  THE CENSUS (ruled by Vitor, 2026-08-11).  ZERO exceptions, not a pinned
#  list: the four historical `validation` messages were renamed to COMPARISON
#  in the same commit, so there is nothing left to grandfather, and freezing
#  four exceptions we had just removed would have been a pin list describing a
#  past that no longer exists.
#
#      No human-visible scientific output may use the bare term "validation"
#      unless the claim is backed by an EvidencePartition establishing
#      held-out evidence.
#
#  Scope, stated because a census that cannot say what it covers is a census
#  nobody can trust:
#    * OUTPUT STRING LITERALS in src/ only -- what a student reads.  Comments,
#      docstrings, identifiers (`validation()`, `validationSets`) and the
#      result-JSON key are NOT scientific claims presented to a user.  The JSON
#      key is deliberately out: it is a machine key with a typed GUI consumer
#      (SolverAdapter's ValidationBlock), and renaming it is a cross-surface
#      contract change, not a wording fix.
#    * a file that CONSUMES a partition may use the word freely -- there the
#      claim is backed, and `VALIDATION REFUSED` (which DENIES the claim) lives
#      in exactly such a file, so no exception is needed for it either.
#  WHY THIS IS NARROWER THAN "the word appears in a string".  The first
#  version of this census fired on SEVEN files and five were false positives,
#  which is the failure mode that gets a gate weakened rather than obeyed:
#    * `dict->found("validation")` -- a GRAMMAR KEY, not a sentence;
#    * comments and docstrings explaining the distinction (AadCompare.H's
#      "the validation weapon", this very file's own prose).
#  A claim is something a user is SHOWN, so the census reads only literals
#  inside a streaming or advisory statement, with comments stripped first.
BARE_WORD = re.compile(r"\bvalidation\b", re.I)
STRING_LITERAL = re.compile(r'"((?:[^"\\]|\\.)*)"')
COMMENTS = re.compile(r"//[^\n]*|/\*.*?\*/", re.S)
#  A JSON KEY IS NOT A SENTENCE (Vitor, 2026-08-11).  The result JSON is
#  emitted through the same std::cout as prose, so `,\n  \"validation\": [` looks
#  like output -- but it is a machine key with a typed GUI consumer
#  (SolverAdapter's ValidationBlock), and renaming it is a cross-surface
#  contract change rather than a wording fix.  Excluded STRUCTURALLY, by the
#  shape a JSON key has inside a C++ literal (escaped quotes, then a colon),
#  never by naming a file: a file-name exemption would also excuse the prose
#  that file prints.
JSON_KEY = re.compile(r'\\"[A-Za-z_][A-Za-z_0-9]*\\"\s*:')
#  A statement that puts text in front of a human: std::cout/cerr <<, or an
#  AdvisoryLog entry.  Scanned from the marker to the terminating `;`.
#  A REFUSAL IS OUTPUT TOO.  Narrowing this to cout/cerr dropped the census
#  from 7 hits to 1 and briefly looked like progress -- but a `throw` prints as
#  "*** choupoProps fatal error: ..." and is the most-read text the tool
#  produces.  R5's own refusal is a throw.  Excluding them would have made the
#  census blind to a false claim in exactly the messages written to be precise.
OUTPUT_MARKER = re.compile(
    r"std::c(?:out|err)\s*<<|AdvisoryLog[^;]*?\.add\s*\(|throw\s+std::\w+\s*\(")

#  WHY THE LITERALS ARE BLANKED BEFORE STATEMENTS ARE SPLIT.  The first working
#  version scanned from an output marker to the next `;` -- and Exchange.cpp's
#  refusal contains a semicolon INSIDE its own message
#  ("`equilibrate { minerals ( ... ); }`"), which ended the scan early and hid
#  the very sentence the census was looking for.  A silent under-report is the
#  dangerous direction for a census: it reads exactly like compliance.  So each
#  literal is replaced by a placeholder first, and only THEN is the text split
#  on `;` -- after which every remaining semicolon really is a terminator.
def human_visible_literals(text: str):
    """String literals this file SHOWS a user: streamed, logged or thrown.

    Comments and grammar keys are deliberately out of scope -- `dict->found(
    "validation")` is a dictionary key, not a sentence, and a docstring
    explaining the distinction is not a claim about a result."""
    body = COMMENTS.sub("", text)
    lits, blanked, last = [], [], 0
    for m in STRING_LITERAL.finditer(body):
        lits.append(m.group(1))
        blanked.append(body[last:m.start()])
        blanked.append(f"\x00{len(lits) - 1}\x00")
        last = m.end()
    blanked.append(body[last:])
    out = []
    for stmt in "".join(blanked).split(";"):
        if not OUTPUT_MARKER.search(stmt):
            continue
        for i in re.findall(r"\x00(\d+)\x00", stmt):
            #  Drop JSON keys, then keep whatever prose is left in the literal.
            out.append(JSON_KEY.sub("", lits[int(i)]))
    return out


def cpp_verdicts(text: str) -> set:
    """Every string literal verdictOf() can return.

    Scoped to the function body -- the header's prose lists the same five
    names in a comment, and harvesting THAT would make the gate compare a
    docstring with itself.  Inside the body EVERY literal is a verdict (the
    only other text is a comment, which is stripped), so the harvest is
    literal-based rather than shaped around today's control flow: the first
    version keyed on `return "..."` and silently lost `validated`, which is
    returned from a ternary.  A harvest that depends on how the branches are
    written breaks the day someone rewrites them, which is precisely when a
    parity gate is most needed."""
    m = re.search(r"verdictOf\s*\([^)]*\)[^{]*\{(.*?)\n\}", text, re.S)
    if not m:
        return set()
    body = re.sub(r"//[^\n]*", "", m.group(1))
    return set(re.findall(r'"([A-Za-z]+)"', body))


def ts_union(text: str) -> set:
    m = re.search(r"export type CurationVerdict\s*=(.*?);", text, re.S)
    return set(re.findall(r'"([A-Za-z]+)"', m.group(1))) if m else set()


def ts_render_keys(text: str) -> set:
    m = re.search(r"const VERDICT\s*:[^=]*=\s*\{(.*?)\n\};", text, re.S)
    return set(re.findall(r"^\s*([A-Za-z]+)\s*:\s*\{", m.group(1), re.M)) if m else set()


def main() -> int:
    failures = []

    cpp = cpp_verdicts(CPP.read_text())
    union = ts_union(TS_UNION.read_text())
    render = ts_render_keys(TS_RENDER.read_text())

    #  An empty harvest is a gate that cannot run, and a check that cannot run
    #  must not pass (the check_true_ions lesson, 2026-08-05).
    for label, got, path in (("verdictOf()", cpp, CPP),
                             ("CurationVerdict union", union, TS_UNION),
                             ("VERDICT renderer table", render, TS_RENDER)):
        if not got:
            failures.append(
                f"harvested NOTHING from {label} ({path.relative_to(ROOT)}) -- "
                f"the shape it is parsed from has changed, so this gate is "
                f"blind rather than satisfied")

    if not failures:
        if cpp != union:
            failures.append(
                f"verdictOf() and the TS union disagree: "
                f"only in C++ {sorted(cpp - union) or '-'}, "
                f"only in TS {sorted(union - cpp) or '-'}.  A verdict only in "
                f"C++ cannot be drawn; a verdict only in TS is a claim the "
                f"engine cannot make.")
        if union != render:
            failures.append(
                f"the TS union and the renderer table disagree: "
                f"only in the union {sorted(union - render) or '-'}, "
                f"only in the table {sorted(render - union) or '-'}.  A union "
                f"member with no row renders as undefined.")

    #  (b) THE CENSUS -- zero exceptions.  Any output string in src/ carrying
    #  the bare word must live in a file that CONSUMES a partition.
    scanned = 0
    for path in sorted((ROOT / "src").rglob("*.cpp")) + sorted((ROOT / "src").rglob("*.H")):
        text = path.read_text(errors="ignore")
        if not BARE_WORD.search(text):
            continue
        offenders = [l for l in human_visible_literals(text) if BARE_WORD.search(l)]
        if not offenders:
            continue          # comments / grammar keys / identifiers only
        scanned += 1
        if CONSUMES_PARTITION.search(REFUSAL_CALL.sub("", text)):
            continue          # the claim is backed where it is made
        failures.append(
            f"{path.relative_to(ROOT)} prints the word \"validation\" to a user "
            f"({offenders[0][:70]!r}) but never CONSUMES an EvidencePartition. "
            f"Comparison asks whether a model agrees with data; held-out "
            f"validation additionally establishes those data were excluded "
            f"from the fit being assessed -- so without a partition the word "
            f"claims more than the code did.  Say COMPARISON, or carry the "
            f"partition.  (Declaring refuseOnNonFittingOp does NOT count: it "
            f"is the marker of an operation that fits nothing.)")

    if failures:
        print("check_verdict_parity: FAILED")
        for f in failures:
            print("  " + f)
        return 1

    print(f"check_verdict_parity: OK -- the {len(cpp)} curation verdicts "
          f"({', '.join(sorted(cpp))}) are spelled identically in "
          f"CurationDossier.cpp, the TS union and the renderer table; every "
          f"human-visible \"validation\" in src/ ({scanned} file(s) carry the "
          f"word in an output string) sits where a partition is CONSUMED.  Does NOT check the dossier's written JSON, nor whether "
          f"a verdict is correct for a given fit.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
