#!/usr/bin/env python3
# check_doctrine.py -- the DOCTRINE GATE (design forum #91/#95).
#
# The stream-state doctrine (#91, arbiter-ratified) and the property-package
# filename (0da8bcba: constant/propertyDict ONLY, no backward compat) are
# CONSTITUTIONAL; teaching the retired grammars in user-facing content is a
# P0 documentation bug.  This gate greps the TEACHING SURFACES and fails on
# any occurrence that is not (a) an explicitly-tolerated historical/negative
# mention or (b) on the allowlist below.  It exists because the cleanup was
# twice declared done while `rg` still found live teaching (#91, #95) --
# a doctrine without an executable gate regresses.
#
# Style precedent: the check_*.py family (check_ion_pins, check_estimates).
# Usage:  bin/curate/check_doctrine.py     (exit 1 on violations)

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# ---- Vacuity guard (2026-08-15 fleet census): this gate shared the
#      check_true_ions death shape -- rename a scanned root and the globs
#      below return nothing, zero violations are found over zero surfaces,
#      and the gate goes permanently green.  An absent scan root refuses by
#      name; a collapsed surface count refuses against a floor (352 surfaces
#      observed at the census; the floor sits well below it).
SCAN_ROOTS = ("docs/ai", "docs", "tutorials", "site")
SURFACE_FLOOR = 50
#  The repo-wide pass has its own floor: `git ls-files` returning a short
#  list means the scan is blind, not that the tree is clean.
TRACKED_FLOOR = 500

# ---- The teaching surfaces (user-facing; architecture/history docs exempt) --
SURFACES = (
    list((ROOT / "docs/ai").glob("*.md"))
    + [ROOT / "docs" / f for f in (
        "userGuide.tex", "theoryGuide.tex", "tutorialsGuide.tex",
        "propsGuide.tex", "explorerGuide.tex", "designGuide.tex",
        #  engine-capabilities.md is the capabilities NARRATIVE a user reads
        #  to learn what the engine does -- as much a teaching surface as the
        #  guides, and it was outside this list until 2026-08-02, which is how
        #  it kept describing the retired `children` composite grammar long
        #  after the reader stopped accepting it.
        "engine-capabilities.md",
        "tutorials-catalogue.md")]
    + sorted((ROOT / "docs").glob("tutorialsGuide-*.tex"))
    + sorted((ROOT / "tutorials").rglob("system/flowsheetDict"))
    + sorted((ROOT / "site").glob("*.html"))
)

# ---- Tolerance: a line (or its +-2 neighbours) that explicitly marks the
#      mention as historical / negative is NOT teaching the grammar.
TOLERANT = re.compile(r"legacy|LEGACY|retired|RETIRED|throws|no `?streams|"
                      r"never|removed|historical|migration", re.I)

# ---- Explicit allowlist: file -> reason (arbiter #91: allowlist, not fuzz) --
ALLOW = {
    # (currently empty: the 2026-07-10 cleanup reached zero live teaching.
    #  Add entries ONLY with a reason, e.g.
    #  "docs/ai/foo.md": "sec 9 documents the migration itself", )
}

#  The ban list.  Eight product names; this is the ONE home for them, which
#  is why this file is itself exempt from the rule below.
COMPETITOR = re.compile(
    r"\b(aspen|hysys|dwsim|gproms|chemcad|prosim|unisim|promax)\b", re.I)

RULES = [
    # (name, pattern, needs-tolerance-context to pass)
    ("streams{} teaching",
     re.compile(r"streams\s*\{"), True),
    ("retired filename constant/thermoPackage",
     re.compile(r"constant/thermoPackage"), True),
    ("retired filename constant/propertyPackage",
     re.compile(r"constant/propertyPackage"), True),
    ("retired driver fitBinaryPair",
     re.compile(r"fitBinaryPair", re.I), True),
    ("competitor name in user-facing content",
     COMPETITOR, False),
]

#  ---- THE COMPETITOR RULE RUNS OVER THE WHOLE TRACKED TREE (2026-09-24) ----
#  Vitor ruled that no competing simulator is named anywhere in this
#  repository -- "Aqui nao se menciona nada, por uma questao de boa educacao e
#  evitar problemas legais" -- which TIGHTENS the 2026-07-03 rule that bound
#  only the user-facing manuals.  The rule above had always been true of every
#  surface SURFACES scans, and silent about docs/design/, docs/architecture/,
#  src/, gui/, bin/, data/ and .claude/ -- which is the whole of where the
#  mentions actually lived (33 tracked files on the day this was measured,
#  two of them studies of a named product).  A rule not enforced is a
#  sentence, so the competitor rule gets a SECOND pass, over every tracked
#  file, keyed on `git ls-files` rather than on a hand-kept root list: a root
#  list here would be a second home for "what is in this repository" and would
#  go silent the day a directory is added, which is exactly how the first
#  version stayed green over the files that mattered.
#
#  THE EXEMPTIONS ARE NAMED INDIVIDUALLY, WITH A REASON EACH.  The test is
#  narrow and stated in docs/design/no-competitor-is-named-here.md: a name
#  survives only where the NAME IS THE EVIDENCE and removing it would destroy
#  the record rather than tidy it.  A value-provenance caution does NOT
#  qualify (the name adds nothing a curator can act on, and reads as an
#  accusation); a LICENCE statement does (it must be attributable to the party
#  who made it, or it is not a licence record).
COMPETITOR_EXEMPT = {
    "bin/curate/check_doctrine.py":
        "this gate must name the words it bans",
    "docs/legal/data-licensing-review-2026-08-11.md":
        "quotes a project's own published licence statement about a database "
        "it redistributes; a licence permission must be attributable to whoever"
        " granted it or it is not a licence record",
    ".gitignore":
        "one ignored path for a private, local-only interop directory that is "
        "never uploaded",
    "docs/design/no-competitor-is-named-here.md":
        "the ruling record itself: it names the two removed files so a reader "
        "can retrieve them from git history",
}

#  Binary and generated files are skipped: `generated/` is rebuilt from the
#  tree by its own producers (gateManifest carries this gate's own claim line,
#  which quotes the ban), and a non-UTF-8 blob has no prose to scan.
COMPETITOR_SKIP_PREFIX = ("generated/", "thirdParty/", "data/local/")

#  ---- THE PINNED REMAINDER, MEASURED 2026-09-24, AND IT RATCHETS ----------
#  The ruling was executed over everything a rewrite could reach without
#  destroying evidence: ~20 files redacted in place and two studies of a named
#  product removed.  What is pinned here is what a rewrite could NOT reach in
#  one slice, and each class has a different reason -- so the ledger carries a
#  reason per file rather than one blanket waiver.
#
#  THREE CLASSES, and they need different remedies:
#    (A) ARCHIVED / SUPERSEDED architecture records whose own FILENAME carries
#        the word (`archive/aspen-like-*.md`) or whose thesis was an explicit
#        conceptual comparison.  Renaming them breaks every cross-link in the
#        tree and rewriting superseded history is not a redaction but a
#        forgery of the record of how this project decided things.  The
#        remedy is a rename-with-redirect migration, measured first.
#    (B) VÍTOR'S OWN SLIDE DECK, which recounts the HISTORY OF THE FIELD (the
#        1976 project at MIT, the 1981 company, the proprietary era).  That is
#        history, not comparison, and it is his deck: RESERVED for him.
#    (C) `chemsep_to_choupo.py`'s EXCLUDED list, where the names are
#        FUNCTIONAL CODE -- source words the importer refuses to import from,
#        a licence duty this project states in CLAUDE.md §10.  The name IS the
#        evidence, which is the §4 test of the ruling record.
#
#  IT RATCHETS, two-sided, on the `check_energy_closure` precedent: a file
#  with MORE sites than its pin FAILS (the debt grew), a file with FEWER FAILS
#  asking for its pin back (the debt closed and the ledger did not notice), a
#  pinned file that has left the tree FAILS.  A file not in this ledger may
#  carry ZERO sites.  So the live claim is NO NEW SITE, which is what the
#  ruling binds: it governs what the tree carries from here on.
#
#  MEASURED with the gate's own output, never typed.
COMPETITOR_PINNED = {
    "docs/architecture/archive/aspen-like-data-architecture.md": (7, "A"),
    "docs/architecture/archive/data-ontology.md": (6, "A"),
    "docs/architecture/archive/data-migration-map.md": (6, "A"),
    "docs/property-consolidation-proposal.md": (5, "A"),
    "docs/architecture/final-property-architecture.md": (5, "A"),
    "docs/whatif-tinkering-promote.md": (4, "A"),
    "docs/architecture/archive/aspen-like-migration-map.md": (4, "A"),
    "docs/slides/farelo_choupo.tex": (3, "B"),
    "docs/design/process-safety-audit.md": (3, "A"),
    "docs/architecture/archive/aqueousNaCl-pitzer-spike.md": (3, "A"),
    "docs/whatif-kpi-instrument.md": (2, "A"),
    "docs/property-architecture.md": (2, "A"),
    "docs/design/the-order-a-reader-meets-a-reference.md": (2, "A"),
    "docs/design/solution-directories-forum-2026-07-03.md": (2, "A"),
    "docs/design/acetone-ipa-reference-case.md": (2, "A"),
    "docs/architecture/property-dictionary-variants.md": (2, "A"),
    "bin/curate/chemsep_to_choupo.py": (2, "C"),
    "docs/thermo-hierarchy.md": (1, "A"),
    "docs/electrolyte-enthalpy-spec.md": (1, "A"),
    "docs/design/gibbs-map-forum-2026-07-02.md": (1, "A"),
    "docs/design/comfort-loop-2026-07-04.md": (1, "A"),
    "docs/design/acetone-plant-closure-state.md": (1, "A"),
}
PIN_CLASS = {
    "A": "archived or superseded architecture record; the remedy is a "
         "rename-with-redirect migration, not a rewrite of decided history",
    "B": "V\u00edtor's own slide deck, recounting the history of the field rather "
         "than comparing products -- RESERVED for him",
    "C": "functional code: an importer's source-exclusion list, where the "
         "name IS the licence evidence",
}

# Patterns whose significant tokens may be split over adjacent lines.  The
# line-by-line pass above cannot detect, for example, `streams` followed by `{`
# on the next line.  A filename shown in an ASCII tree often lacks the
# `constant/` prefix, so recognise that presentation too.
MULTILINE_RULES = [
    ("streams{} teaching", re.compile(r"streams\s*\{", re.I | re.S)),
]

BARE_FILENAME = re.compile(
    r"(?:[├└][─│ ]*|^\s*(?:file|filename)\b.*)"
    r"\b(?:thermoPackage|propertyPackage)\b",
    re.I,
)



def main() -> int:
    for r in SCAN_ROOTS:
        if not (ROOT / r).is_dir():
            print(f"check_doctrine: FAILED -- scan root '{r}' does not "
                  "exist; this gate cannot see what it audits, and a green "
                  "verdict over an absent tree would be the check_true_ions "
                  "failure again.")
            return 1
    violations = []
    read_surfaces = 0
    for path in SURFACES:
        if not path.exists():
            continue
        rel = path.relative_to(ROOT).as_posix()
        if rel in ALLOW:
            continue
        lines = path.read_text(errors="replace").splitlines()
        read_surfaces += 1
        for i, line in enumerate(lines):
            for name, pat, tolerable in RULES:
                if not pat.search(line):
                    continue
                if tolerable:
                    ctx = "\n".join(lines[max(0, i - 2):i + 3])
                    if TOLERANT.search(ctx):
                        continue
                violations.append(f"{rel}:{i + 1}: [{name}] {line.strip()[:90]}")

        text = "\n".join(lines)
        for name, pat in MULTILINE_RULES:
            for match in pat.finditer(text):
                line_no = text.count("\n", 0, match.start()) + 1
                i = line_no - 1
                ctx = "\n".join(lines[max(0, i - 2):i + 4])
                if TOLERANT.search(ctx):
                    continue
                marker = f"{rel}:{line_no}: [{name}]"
                if not any(v.startswith(marker) for v in violations):
                    excerpt = " ".join(match.group(0).split())[:90]
                    violations.append(f"{marker} {excerpt}")

        for i, line in enumerate(lines):
            if not BARE_FILENAME.search(line):
                continue
            ctx = "\n".join(lines[max(0, i - 2):i + 3])
            if TOLERANT.search(ctx):
                continue
            violations.append(
                f"{rel}:{i + 1}: [retired bare property filename] "
                f"{line.strip()[:90]}"
            )
    #  ---- the repo-wide competitor pass ----------------------------------
    tracked = subprocess.run(
        ["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, text=True)
    if tracked.returncode != 0:
        print("check_doctrine: FAILED -- `git ls-files` did not run here, so "
              "the repo-wide competitor pass cannot see what it audits.  A "
              "check that cannot run must REFUSE, never pass.")
        return 1
    rels = [r for r in tracked.stdout.split("\0") if r]
    if len(rels) < TRACKED_FLOOR:
        print(f"check_doctrine: FAILED -- only {len(rels)} tracked files "
              f"listed against a floor of {TRACKED_FLOOR}; the repo-wide scan "
              "surface has collapsed.")
        return 1
    for name, reason in COMPETITOR_EXEMPT.items():
        if name not in rels:
            print(f"check_doctrine: FAILED -- exemption '{name}' names a file "
                  "that is not tracked.  An exemption nothing reads is a "
                  "waiver for a file that no longer exists, and it hides the "
                  "day the real one stops being exempt.")
            return 1
    scanned = 0
    pinned_seen = set()
    for rel in rels:
        if rel in COMPETITOR_EXEMPT:
            continue
        if rel.startswith(COMPETITOR_SKIP_PREFIX):
            continue
        path = ROOT / rel
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        scanned += 1
        hits = [(i + 1, line) for i, line in enumerate(text.splitlines())
                if COMPETITOR.search(line)]
        pin = COMPETITOR_PINNED.get(rel)
        if pin is None:
            for line_no, line in hits:
                violations.append(
                    f"{rel}:{line_no}: [competitor named in the repository] "
                    f"{line.strip()[:90]}")
            continue
        want, cls = pin
        if len(hits) > want:
            violations.append(
                f"{rel}: [the pinned debt GREW] {len(hits)} sites against a "
                f"pin of {want} ({PIN_CLASS[cls]}).  The ruling binds what "
                "the tree carries from here on: a NEW site is exactly what "
                "this pin does not cover.")
        elif len(hits) < want:
            violations.append(
                f"{rel}: [the pinned debt SHRANK] {len(hits)} sites against a "
                f"pin of {want}.  Lower the pin in this file (or remove it at "
                "zero) in the same commit -- a ledger that does not notice a "
                "debt closing cannot tell the next one from a regression.")
        pinned_seen.add(rel)
    gone = sorted(set(COMPETITOR_PINNED) - pinned_seen)
    if gone:
        for rel in gone:
            violations.append(
                f"{rel}: [a PINNED file is not in the scan] it is untracked, "
                "unreadable, or excluded by a skip prefix.  A pin over a file "
                "nobody reads is a permanently-green waiver; remove the pin "
                "in the same commit that removed the file.")
    if scanned < TRACKED_FLOOR // 2:
        print(f"check_doctrine: FAILED -- the repo-wide competitor pass read "
              f"only {scanned} files; the scan has collapsed and a green "
              "verdict over it would describe nothing.")
        return 1

    if violations:
        print("check_doctrine: FORBIDDEN teaching in user-facing surfaces "
              f"({len(violations)}):")
        for v in violations:
            print(f"  {v}")
        print("\nThe stream-state doctrine (#91) and the propertyDict filename "
              "(0da8bcba) are constitutional; mark a genuine historical mention "
              "with 'legacy'/'retired' context, or allowlist the file WITH a "
              "reason in this script.  A competitor name is NOT tolerable in "
              "context: describe the product by what it is (`a large "
              "open-source process simulator`).  Ruling and the three "
              "exemptions: docs/design/no-competitor-is-named-here.md.")
        return 1
    if read_surfaces < SURFACE_FLOOR:
        print(f"check_doctrine: FAILED -- only {read_surfaces} teaching "
              f"surfaces read against a floor of {SURFACE_FLOOR}; the scan "
              "surface has collapsed and a verdict over it would describe "
              "nothing.")
        return 1
    print(f"check_doctrine: {read_surfaces} teaching surfaces clean "
          "(streams{}/thermoPackage/propertyPackage/fitBinaryPair), and the "
          f"competitor ban holds over {scanned} of {len(rels)} TRACKED files "
          f"repo-wide -- {len(COMPETITOR_EXEMPT)} named exemptions, "
          f"{sum(n for n, _ in COMPETITOR_PINNED.values())} sites in "
          f"{len(COMPETITOR_PINNED)} files PINNED with a class each and "
          "RATCHETING two-sided (a debt that grows fails; one that shrinks "
          "fails asking for its pin back), so the live claim is NO NEW SITE.  "
          "It says NOTHING about "
          "git history (deliberately unrewritten) and nothing about a product "
          "whose name is not on the eight-word ban list.  An absent scan "
          "root, an absent exemption target, an unavailable `git ls-files` "
          "or a collapsed surface count all REFUSE.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
