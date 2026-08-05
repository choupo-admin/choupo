#!/usr/bin/env python3
"""Gate: the deprecated vocabulary of the domain glossary stays out of live text.

    bin/curate/check_glossary_bans.py

WHY THIS EXISTS, AND WHY IT COULD NOT BE WRITTEN UNTIL 2026-08-05.

docs/architecture/domain-glossary.md 3 lists the wordings this project has
decided against.  Exactly ONE of them -- "optimal", in the pinch table -- was
enforced by a gate.  The rest relied on a reader remembering, and remembering
is the mechanism this project has watched fail repeatedly.

The blocker was not effort.  The doctrine said

    "the older 'apparent/true' wording is banned"

-- one sentence over two words that fail differently.  And CLAUDE.md itself
used *apparent* four sections later ("the apparent basis is NEVER disturbed"),
as did the level-1 architecture and IsothermalFlash.cpp / ReactiveVLE.H /
ThermoPackageBuilder.cpp.  A gate written against that rule would have had to
decide whether *apparent* was a violation or the vocabulary, and no honest
check can be built on a rule its own constitution breaks.

Vitor ruled on 2026-08-05 (glossary 3a), and the ruling is what made this
file possible:

    apparent is an accepted architectural term.  true is deprecated in
    user-facing architecture and documentation.  Use species -- or the
    concrete category: aqueous species, gas species, solid species.

The halves are not symmetric.  *apparent* has a precise established meaning in
electrolyte thermodynamics and claims nothing about reality: it says AS IT
APPEARS IN THE FLOWSHEET.  *true* means, internally, "the species the
equilibrium solver works in", but what a reader takes from it is "these are
the real chemicals" -- and that gap lands on students first.

THE DISTINCTION THIS GATE ENFORCES, and it is the same shape as
check_source_licence's `via` rule: a document that STATES a ban must be able
to QUOTE the banned word.  The glossary that defines the rule, the developer
guide that teaches it, and the architecture note that records the debate all
contain "true species" -- correctly.  So a mention is judged by its ROLE, and
the exemptions are listed by name WITH a reason, never by a wildcard.

Three classes are exempt as a CLASS, and each for a stated reason:

  * docs/architecture/archive/    superseded documents; a record of what was
                                  believed is not a claim about what is.
  * a superseded doc whose own header says the new document wins.
  * a dated deliberation (docs/design/*-2026-*.md).  A forum keeps its own
    words for the same reason git history does -- the rule binds what is
    authored from here on, not the record of what was.

Everything else needs an explicit entry.  A stale exemption -- one whose file
no longer contains the wording -- FAILS the gate, so the list cannot outlive
its reason and quietly become a wildcard.

WHAT IS NOT CHECKED.  This gate does not judge whether a replacement is the
RIGHT one (species vs aqueous species vs solid species is a judgement about
the sentence).  It checks only that the deprecated form is absent, which is
the weakest claim that is certainly true -- the same posture as
check_validity_windows.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#  The deprecated forms.  `apparent` is deliberately ABSENT: it is correct.
BANNED = [
    (re.compile(r'\btrue\s+species\b', re.I),
     'species (or: aqueous species / gas species / solid species)'),
    (re.compile(r'\btrue\s+bas[ei]s\b', re.I),
     'aqueous-species basis'),
    (re.compile(r'\btrueSpecies\w*'),
     'ionSpecies / speciesId'),
    (re.compile(r'components/true/'),
     'components/ (that home was deleted 2026-07-01)'),
]

SCAN_SUFFIX = {".md", ".tex", ".H", ".cpp", ".py", ".dat", ".sh", ""}
SCAN_ROOTS = ["CLAUDE.md", "docs", "src", "bin", "data", "tutorials"]

#  Exempt as a CLASS, with the reason.  Checked by path substring.
CLASS_EXEMPT = [
    ("docs/architecture/archive/",
     "superseded documents -- a record of what was believed is not a claim"),
    ("docs/architecture/final-property-architecture.md",
     "superseded 2026-07-14; its own header says the newer document wins"),
]
DELIBERATION = re.compile(r'docs/design/.*-20\d\d-\d\d-\d\d\.md$')

#  Exempt BY NAME, each with the reason it must quote the deprecated word.
#  A file listed here that no longer contains one FAILS as a stale exemption.
NAMED_EXEMPT = {
    "docs/architecture/domain-glossary.md":
        "defines the ban; it must quote what it bans",
    "docs/developerGuide.tex":
        "teaches the ban to a contributor, quoting the deprecated form",
    "docs/architecture/electrolyte-data-architecture.md":
        "records the ratification debate that produced the rule, and says so",
    "CLAUDE.md":
        "states the rule in the data-tree section, quoting the deprecated form",
    "bin/curate/check_glossary_bans.py":
        "this gate -- the patterns ARE the deprecated forms",
    "bin/curate/check_doc_references.py":
        "carries the retired components/true/ path in its own historical note",
    "bin/curate/check_ion_pins.py":
        "same: names the retired home it was written against",
    "bin/curate/enrtl_ref/enrtl.py":
        "vendored reference implementation -- third-party wording, not ours",
    "data/standards/parameters/electrolyte/PROVENANCE.md":
        "provenance record of where the values were imported FROM",
    "data/standards/parameters/electrolyte/VALIDATION.md":
        "validation record written against the retired layout",
}


def main() -> int:
    hits, exempt_seen, nfiles = [], set(), 0

    for root in SCAN_ROOTS:
        base = ROOT / root
        paths = [base] if base.is_file() else sorted(base.rglob("*"))
        for p in paths:
            if not p.is_file() or p.suffix not in SCAN_SUFFIX:
                continue
            rel = p.relative_to(ROOT).as_posix()
            if any(c in rel for c, _ in CLASS_EXEMPT) or DELIBERATION.match(rel):
                continue
            try:
                text = p.read_text()
            except (UnicodeDecodeError, OSError):
                continue
            nfiles += 1
            found = [(n, line, remedy)
                     for n, line in enumerate(text.splitlines(), 1)
                     for pat, remedy in BANNED if pat.search(line)]
            if not found:
                continue
            if rel in NAMED_EXEMPT:
                exempt_seen.add(rel)
                continue
            for n, line, remedy in found:
                hits.append(f"{rel}:{n}  -> use {remedy}\n        "
                            + line.strip()[:110])

    stale = sorted(set(NAMED_EXEMPT) - exempt_seen)

    if hits or stale:
        print("check_glossary_bans: FAILED")
        for h in hits:
            print("  deprecated wording: " + h)
        for s in stale:
            print(f"  STALE EXEMPTION: {s} no longer contains a deprecated "
                  f"wording -- remove it from NAMED_EXEMPT ({NAMED_EXEMPT[s]})")
        if hits:
            print("\n  domain-glossary.md 3a (ruled 2026-08-05): `apparent` is "
                  "ACCEPTED;\n  `true` is deprecated as a substance or basis "
                  "name.  Say what the thing IS\n  -- a species, and where "
                  "possible which kind of species.")
        return 1

    print(f"check_glossary_bans: OK -- {nfiles} file(s) scanned; no deprecated "
          f"glossary wording in live text.  {len(NAMED_EXEMPT)} file(s) are "
          "exempt BY NAME because they state, teach or record the ban (a "
          "document that defines a ban must be able to quote it); superseded "
          "documents and dated deliberations are exempt as a class -- a forum "
          "keeps its own words, as git history does.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
