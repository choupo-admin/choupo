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
     re.compile(r"\b(aspen|hysys|dwsim|gproms|chemcad|prosim|unisim|promax)\b",
                re.I), False),
]

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
    if violations:
        print("check_doctrine: FORBIDDEN teaching in user-facing surfaces "
              f"({len(violations)}):")
        for v in violations:
            print(f"  {v}")
        print("\nThe stream-state doctrine (#91) and the propertyDict filename "
              "(0da8bcba) are constitutional; mark a genuine historical mention "
              "with 'legacy'/'retired' context, or allowlist the file WITH a "
              "reason in this script.")
        return 1
    if read_surfaces < SURFACE_FLOOR:
        print(f"check_doctrine: FAILED -- only {read_surfaces} teaching "
              f"surfaces read against a floor of {SURFACE_FLOOR}; the scan "
              "surface has collapsed and a verdict over it would describe "
              "nothing.")
        return 1
    print(f"check_doctrine: {read_surfaces} teaching surfaces clean "
          "(streams{}/thermoPackage/propertyPackage/fitBinaryPair/competitors;"
          " an absent or collapsed scan root REFUSES)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
