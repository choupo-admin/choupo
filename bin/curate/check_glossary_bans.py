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

THE SECOND RULING, 2026-10-09 (Vítor, verbatim: "não chames 'fractais'
porque já vimos que esse nome foi má escolha. Nós só temos dois níveis").  A
sectored case is A PLANT AND ITS SECTORS -- two levels, plus each unit's own
folder -- and the old name for that layout promised a recursion no case uses.
The word was swept out of every live surface on 2026-10-10 (DEV.md C56), and
this second pass keeps it out.  It differs from the first in three ways, each
for a stated reason:

  * It reads EVERY TRACKED FILE (`git ls-files`), as check_doctrine's
    competitor pass does, not a hand-kept root list: the word lived in the
    GUI sources, the guides, the tutorial dicts and .gitignore alike, and a
    root list is a second home for "what is in this repository".  Tracked,
    because a run output on disk (an old instant header) is not authored
    text.  If `git ls-files` cannot run, the pass REFUSES -- a check that
    cannot see what it audits must not pass.
  * Its exemptions are its OWN.  A file exempt from the `true` ban (CLAUDE.md,
    the Developer Guide) is not thereby exempt from this one.
  * A sentence that EXPLAINS the old name is not a use of it: a line saying
    the layout was "formerly called" by it is accepted, so a reader of an
    older record can connect the two names, and that is the only way the
    word may appear in live text.

Identifiers that EMBED the old name are not matched -- the pattern is a
whole word.  The one there was, the witness class, was renamed
`sealedSectoredPlant` on 2026-10-10 (DEV.md C56, after C52 merged).
"""
import re
import subprocess
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


#  ---- the plant-and-sectors pass (2026-10-09 ruling) -----------------------
SECTOR_WORD = re.compile(r'\bfractal\b', re.I)
SECTOR_REMEDY = ('a plant and its sectors / a sectored case / the sectored '
                 'layout (the folder cascade, for the constant/ walk-up)')
#  A line that EXPLAINS the retired name is not a use of it.
EXPLAINS_OLD_NAME = re.compile(r'(formerly|then)\s+called\W+fractal', re.I)
#  `git ls-files` returning a short list means the pass is blind, not clean.
TRACKED_FLOOR = 500
#  Exempt as a CLASS, with the reason.  Checked by path prefix.
SECTOR_CLASS_EXEMPT = [
    ("DEV.md",
     "the dated log of what was asked and done; an entry records what was "
     "said at the time, and the C56 entry records this very sweep"),
    ("docs/design/",
     "design records of past decisions -- a record keeps its own words, as "
     "git history does"),
    ("docs/architecture/archive/",
     "superseded documents -- a record of what was believed"),
    ("docs/TUTORIAL-QA-",
     "dated QA audits -- a record of what a reviewer saw on that day"),
]
#  Exempt BY NAME, each with its reason.  A file listed here that no longer
#  contains the word FAILS as a stale exemption.
SECTOR_NAMED_EXEMPT = {
    "bin/curate/check_glossary_bans.py":
        "this gate -- it must name what it bans",
    "gui/tests/runLog.test.ts":
        "asserts that the run-log lesson never uses the word, so it quotes it",
    "docs/architecture/decision-records.md":
        "an index quoting the dated summaries of shipped records",
    "docs/architecture/adsorption-a4-a6-handoff.md":
        "a dated forum handoff (#123) -- a record of what was closed then",
    "tutorials/plant/ChemicalPlantTutorial/constant/components/sucrose.dat":
        "a SEALED record: editing its comment moves its sha256 against "
        "constant/propertyManifest, and a re-seal is a curation act",
    "tutorials/plant/sugarPlantEconomicsSweep/constant/components/sucrose.dat":
        "same: a SEALED record, re-sealing is a curation act",
}


def sector_word_pass():
    """Return (hits, stale, nfiles), or None when `git ls-files` is blind."""
    tracked = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT,
                             capture_output=True, text=True)
    rels = [r for r in tracked.stdout.split("\0") if r]
    if tracked.returncode != 0 or len(rels) < TRACKED_FLOOR:
        return None
    hits, seen, nfiles = [], set(), 0
    for rel in rels:
        if any(rel.startswith(c) for c, _ in SECTOR_CLASS_EXEMPT):
            continue
        p = ROOT / rel
        if not p.is_file():
            continue
        try:
            text = p.read_text()
        except (UnicodeDecodeError, OSError):
            continue
        nfiles += 1
        found = [(n, line) for n, line in enumerate(text.splitlines(), 1)
                 if SECTOR_WORD.search(line)
                 and not EXPLAINS_OLD_NAME.search(line)]
        if not found:
            continue
        if rel in SECTOR_NAMED_EXEMPT:
            seen.add(rel)
            continue
        for n, line in found:
            hits.append(f"{rel}:{n}  -> use {SECTOR_REMEDY}\n        "
                        + line.strip()[:110])
    stale = sorted(set(SECTOR_NAMED_EXEMPT) - seen)
    return hits, stale, nfiles


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

    sector = sector_word_pass()
    if sector is None:
        print("check_glossary_bans: FAILED -- `git ls-files` did not run here "
              "(or listed fewer than %d files), so the plant-and-sectors pass "
              "cannot see what it audits.  A check that cannot run must "
              "REFUSE, never pass." % TRACKED_FLOOR)
        return 1
    s_hits, s_stale, s_nfiles = sector

    if hits or stale or s_hits or s_stale:
        print("check_glossary_bans: FAILED")
        for h in hits:
            print("  deprecated wording: " + h)
        for s in stale:
            print(f"  STALE EXEMPTION: {s} no longer contains a deprecated "
                  f"wording -- remove it from NAMED_EXEMPT ({NAMED_EXEMPT[s]})")
        for h in s_hits:
            print("  retired layout name: " + h)
        for s in s_stale:
            print(f"  STALE EXEMPTION: {s} no longer contains the retired "
                  f"layout name -- remove it from SECTOR_NAMED_EXEMPT "
                  f"({SECTOR_NAMED_EXEMPT[s]})")
        if s_hits:
            print("\n  The naming ruling of 2026-10-09: a sectored case is A "
                  "PLANT AND ITS SECTORS --\n  two levels, plus each unit's "
                  "own folder.  Say that; a line explaining that the\n  layout "
                  "was 'formerly called' by the old name is the one accepted "
                  "mention.")
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
          "keeps its own words, as git history does.  And the retired name of "
          f"the plant-and-sectors layout is absent from {s_nfiles} tracked "
          "text file(s) outside the dated records, save a line explaining the "
          f"old name; {len(SECTOR_NAMED_EXEMPT)} file(s) are exempt by name, "
          f"{sum(1 for v in SECTOR_NAMED_EXEMPT.values() if v.startswith('PENDING'))}"
          " of them PENDING a sweep that fails as stale once done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
