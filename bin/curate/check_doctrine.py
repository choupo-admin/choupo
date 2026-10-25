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

#  A WHOLE TREE MAY BE EXEMPT, by name and with its reason, when the name IS
#  the evidence across every file in it (Vitor, 2026-10-20, DEV.md 4c C123,
#  option (a): "Usa a)").  `benchmarks/` reproduces hard cases from other
#  simulators' published sample libraries and compares against their
#  numbers; a benchmark that does not say whom it is compared with has lost
#  half its value.  It is DEVELOPER-FACING: nothing under it is shipped to the
#  site, bundled by the GUI or \input by a manual -- arm (t) below holds that,
#  because an exempt tree that leaks into a user-facing surface is the ban
#  undone through the back door.  Like a file exemption, a tree with no
#  tracked file FAILS: an exemption nothing reads is a waiver for nothing.
COMPETITOR_EXEMPT_TREES = {
    "benchmarks/":
        "reproductions of other simulators' published sample cases, compared "
        "against the numbers each publishes; developer-facing only "
        "(DEV.md 4c C123)",
}

#  A TREE MAY BE EXEMPT FOR NAMED WORDS ONLY (Vitor, 2026-10-21, DEV.md 4c
#  C126).  The white paper compares Choupo with ONE open reference simulator
#  (GPL-3.0, its licence read before it was named) and may name it; the
#  closed commercial simulators are not named there at all ("nem sequer
#  sabemos que porcaria anda la dentro").  So the exemption is narrower than
#  the benchmarks/ one: it lifts the ban for the words listed and NO OTHER --
#  any other word on the ban list inside the tree still fails, line by line,
#  exactly as it does anywhere else.  Like the whole-tree exemption it must
#  hold a tracked file, and arm (t) keeps it off every user-facing surface.
COMPETITOR_NAMED_TREES = {
    "paper/whitepaper/": (
        {"dwsim"},
        "the white paper's comparison with the open (GPL-3.0) reference "
        "simulator of benchmarks/, named by Vitor's decision; every closed "
        "simulator stays banned there (DEV.md 4c C126)"),
    "paper/joss/": (
        {"dwsim"},
        "the JOSS paper's State of the field names the same open (GPL-3.0) "
        "reference simulator the white paper compares with, by Vitor's "
        "decision for the papers; every closed simulator stays banned there "
        "(DEV.md 4c C126)"),
    "paper/cace/": (
        {"dwsim"},
        "the Computers & Chemical Engineering article reports the white "
        "paper's comparison with the same open (GPL-3.0) reference simulator, "
        "by Vitor's decision for the papers; every closed simulator stays "
        "banned there (DEV.md 4c C126)"),
    #  A PATH PREFIX, not a directory: the C131 phase-2 review records
    #  (docs/design/review-c131-<family>.md), one per family.
    "docs/design/review-c131-": (
        {"dwsim"},
        "the C131 phase-2 review records, which compare each family with the "
        "same open (GPL-3.0) reference simulator 'cited by commit, nothing "
        "copied' (Vitor's commission, DEV.md 4c C131) -- the name and the "
        "file paths are the evidence; every closed simulator stays banned "
        "there"),
}

#  Binary and generated files are skipped: `generated/` is rebuilt from the
#  tree by its own producers (gateManifest carries this gate's own claim line,
#  which quotes the ban), and a non-UTF-8 blob has no prose to scan.
COMPETITOR_SKIP_PREFIX = ("generated/", "thirdParty/", "data/local/")

#  A MARKED COMPARISON BLOCK (Vítor, 2026-10-07, DEV.md 4c C45: "isto é
#  guerra e eu posso fazer comparação desde que não viole regras básicas").
#  The ruling narrows C7 for ONE page: the landing may compare Choupo with
#  named simulators on facts each publishes about itself.  The exemption is
#  the BLOCK between the two markers, never the file -- a name anywhere else
#  on the page still fails, and a marker pair that goes missing fails too (an
#  exemption nothing reads is a ban nobody enforces).
COMPARISON_BLOCKS = {
    "site/index.html": ("<!-- COMPARISON:BEGIN", "<!-- COMPARISON:END -->"),
}


def blank_comparison(rel: str, lines: list) -> list:
    """The lines with the declared comparison block blanked (numbering kept)."""
    marks = COMPARISON_BLOCKS.get(rel)
    if not marks:
        return lines
    begin = [i for i, l in enumerate(lines) if marks[0] in l]
    end = [i for i, l in enumerate(lines) if marks[1] in l]
    if len(begin) != 1 or len(end) != 1 or end[0] < begin[0]:
        raise SystemExit(f"check_doctrine: FAILED -- {rel} must carry exactly "
                         f"one '{marks[0]}' ... '{marks[1]}' pair (found "
                         f"{len(begin)} / {len(end)}); the competitor "
                         "exemption is that block and nothing else.")
    return [("" if begin[0] <= i <= end[0] else l) for i, l in enumerate(lines)]

#  ---- THE PINNED REMAINDER, MEASURED 2026-09-24, AND IT RATCHETS ----------
#  The ruling was executed over everything a rewrite could reach without
#  destroying evidence: ~20 files redacted in place and two studies of a named
#  product removed.  What is pinned here is what a rewrite could NOT reach in
#  one slice, and each class has a different reason -- so the ledger carries a
#  reason per file rather than one blanket waiver.
#
#  THREE CLASSES, and they need different remedies:
#    (A) ARCHIVED / SUPERSEDED architecture records whose own FILENAME carried
#        the word or whose thesis was an explicit conceptual comparison.
#        CLOSED 2026-10-05 (DEV.md C7): 60 sites in 20 files.  The two
#        archive records named after a product were renamed
#        (`archive/conceptual-data-architecture.md`,
#        `archive/conceptual-migration-map.md`) -- the zero-site stubs left at
#        the old paths were DELETED 2026-10-05 (DEV.md C35 item 15; this gate
#        reads content, never file names) -- every in-tree link moved, and the
#        prose of all 20 records rewritten to describe the product by what it
#        is -- every decision, date and argument unchanged, and a dated note
#        at the top of each saying where the original wording is kept.
#        The letter stays in this comment so a reader of the ledger can tell
#        the class was retired, not forgotten; no file is pinned under it.
#    (B) VÍTOR'S OWN SLIDE DECK, which recounts the HISTORY OF THE FIELD (the
#        1976 project at MIT, the 1981 company, the proprietary era).  CLOSED
#        2026-10-05 (DEV.md C38 item 3, Vitor: "Faz tu!"): 3 sites in 1 file.
#        Each product name became a neutral description of what it was; the
#        history, the dates and the argument are unchanged.  The letter stays
#        here, as (A)'s does, so the class reads as retired, not forgotten.
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
    "bin/curate/chemsep_to_choupo.py": (2, "C"),
}
PIN_CLASS = {
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
        lines = blank_comparison(rel, path.read_text(errors="replace").splitlines())
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
    all_trees = tuple(COMPETITOR_EXEMPT_TREES) + tuple(COMPETITOR_NAMED_TREES)
    for tree in all_trees:
        if not any(r.startswith(tree) for r in rels):
            print(f"check_doctrine: FAILED -- exempt tree '{tree}' holds no "
                  "tracked file.  An exemption nothing reads is a waiver for "
                  "nothing.")
            return 1
    #  (t) the exempt tree must not reach a user-facing surface: no manual
    #  \inputs it, the GUI bundle does not glob it, buildSite does not copy
    #  it.  Checked by name in the files that decide each surface -- and,
    #  since the white paper's tree joined (C126), in docs/ai/*.md too: the
    #  GUI bundle inlines those files (gui/src/agent/authoringGuide.ts) and
    #  bin/llmctx hands them to an assistant authoring a student's case, so a
    #  pointer there is a pointer from a user-facing surface.  BOTH kinds of
    #  exempt tree are held: a name-limited exemption leaking is still the
    #  ban undone through the back door.
    leaks = []
    for rel in rels:
        if rel.startswith(all_trees):
            continue
        if not (rel.startswith("docs/") and rel.endswith(".tex")
                or rel.startswith("docs/ai/") and rel.endswith(".md")
                or rel in ("bin/buildSite", "gui/vite.config.ts")
                or rel.startswith("gui/src/") and rel.endswith((".ts", ".tsx"))):
            continue
        try:
            body = (ROOT / rel).read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for tree in all_trees:
            if re.search(r"\b" + re.escape(tree), body):
                leaks.append(f"{rel} reaches the exempt tree '{tree}'")
    if leaks:
        print("check_doctrine: FAILED -- (t) a user-facing surface reaches a "
              "competitor-exempt tree: " + "; ".join(leaks[:5]))
        return 1
    scanned = 0
    pinned_seen = set()
    for rel in rels:
        if rel in COMPETITOR_EXEMPT:
            continue
        if rel.startswith(tuple(COMPETITOR_EXEMPT_TREES)):
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
        allowed = next((words for tree, (words, _) in
                        COMPETITOR_NAMED_TREES.items()
                        if rel.startswith(tree)), set())
        #  In a name-limited tree a line fails if ANY banned word on it is
        #  outside that tree's allowed set; elsewhere the set is empty and
        #  this is the plain search it always was.
        hits = [(i + 1, line)
                for i, line in enumerate(blank_comparison(rel, text.splitlines()))
                if any(m.lower() not in allowed
                       for m in COMPETITOR.findall(line))]
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
          f"repo-wide -- {len(COMPETITOR_EXEMPT)} named exemptions and "
          f"{len(COMPETITOR_EXEMPT_TREES)} exempt developer-facing tree(s) "
          f"({', '.join(COMPETITOR_EXEMPT_TREES)}) and "
          f"{len(COMPETITOR_NAMED_TREES)} tree(s) exempt for NAMED words only ("
          + ", ".join(f"{t} -> {'/'.join(sorted(w))}"
                      for t, (w, _) in COMPETITOR_NAMED_TREES.items())
          + ", every other banned word still failing inside it) that no "
          "manual, docs/ai/ file, GUI source or site build reaches, "
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
