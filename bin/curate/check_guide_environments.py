#!/usr/bin/env python3
"""check_guide_environments -- a manual must still COMPILE.

WHY.  `docs/theoryGuide.tex` used `\\begin{warning}` in three places.  No such
environment is defined anywhere in the tree, so `make -C docs all` died with
"LaTeX Error: Environment warning undefined" -- and it had been dying since
the commit that introduced them.  Nobody noticed, because nothing in the
suite builds the guides: `bin/buildSite` refuses to publish a stale PDF, but
only when someone runs it, and the guides' own build is not part of any gate.

Running LaTeX here is not the answer -- `theoryGuide.pdf` alone takes minutes,
and a gate nobody will wait for is a gate that gets skipped.  This is the
static half: every environment a manual OPENS must be one the tree defines or
one the loaded packages provide.  It catches the defect above in under a
second, and it catches it at the moment it is written rather than at the
moment someone tries to publish.

WHAT IT CHECKS.  Every `\\begin{X}` across `docs/*.tex` resolves to either
  * an environment DEFINED in the tree (`\\newenvironment`, `\\newtcolorbox`,
    `\\lstnewenvironment`, `\\newtheorem` in any `docs/*.tex`), or
  * a name on the STANDARD list below -- LaTeX built-ins and the environments
    the loaded packages (amsmath, tikz/pgfplots, listings, tabularx,
    longtable) provide.
Every `\\begin{X}` must also have a matching `\\end{X}` in the same file: an
unbalanced pair is the other way a guide stops compiling.

WHAT IT DOES *NOT* CHECK, and the first one is the honest limit:
  * IT IS NOT A COMPILE.  An undefined MACRO (`\\code{...}` vs `\\kode{...}`),
    a bad math expression, a missing brace or a broken reference all still
    kill the build and none of them is visible here.  `make -C docs all`
    remains the only real answer; this is the cheap check that runs always.
  * environments used only inside a `\\newcommand` body, or built by string
    concatenation.
  * whether the STANDARD list below is right for the packages a future
    preamble loads.  A new package's environment must be added to it, and the
    failure mode is a false alarm, which is the safe direction.

SABOTAGE-VERIFIED 2026-08-14, observed output:
  S1  the original defect restored (one `pitfall` back to `warning`) ->
      "docs/theoryGuide.tex:3174: \\begin{warning} -- no such environment is
      defined in the tree", exit 1.  That is the build failure, caught
      statically in under a second.
  S2  one `\\end{pitfall}` deleted -> "appears 22 time(s) and \\end{pitfall}
      21 -- an unbalanced environment stops the build", exit 1.
Its own first run raised a FALSE alarm on `\\begin{footnotesize}` in a guide
that builds: LaTeX size and style declarations are legal environments and the
list omitted them.  Recorded because the fix was to the instrument, and a
whitelist gate's failure mode is exactly that.

Exit 0 = every environment opened is defined and balanced.
"""

import re
import sys
from glob import glob
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

#  LaTeX built-ins plus what the guides' packages provide.  Kept explicit
#  rather than "anything the gate has seen before": a list that grows itself
#  from the tree cannot fail.
STANDARD = {
    # core
    "document", "abstract", "center", "flushleft", "flushright", "quote",
    "quotation", "verse", "verbatim", "itemize", "enumerate", "description",
    "figure", "figure*", "table", "table*", "tabular", "tabular*", "minipage",
    "list", "thebibliography", "titlepage", "picture", "sloppypar",
    # amsmath & friends
    "equation", "equation*", "align", "align*", "alignat", "alignat*",
    "gather", "gather*", "multline", "multline*", "split", "aligned",
    "gathered", "cases", "array", "pmatrix", "bmatrix", "vmatrix", "matrix",
    "smallmatrix", "subequations", "displaymath", "math", "eqnarray",
    # packages the guides load
    "tikzpicture", "scope", "axis", "semilogyaxis", "semilogxaxis",
    "loglogaxis", "groupplot", "lstlisting", "longtable", "tabularx",
    "tcolorbox", "adjustbox", "wrapfigure", "multicols",
    #  Font-size and font-style DECLARATIONS are legal environments
    #  (`\\begin{footnotesize} ... \\end{footnotesize}`).  Missing them
    #  was this gate's own first false alarm, on a guide that builds.
    "tiny", "scriptsize", "footnotesize", "small", "normalsize", "large",
    "Large", "LARGE", "huge", "Huge", "itshape", "bfseries", "ttfamily",
    "sffamily", "rmfamily", "slshape", "scshape", "em",
}

DEFINE = re.compile(
    r"\\(?:newenvironment|renewenvironment|newtcolorbox|lstnewenvironment"
    r"|newtheorem|DeclareTColorBox)\s*\{([A-Za-z*]+)\}")
BEGIN = re.compile(r"\\begin\{([A-Za-z*]+)\}")
END = re.compile(r"\\end\{([A-Za-z*]+)\}")


def main() -> int:
    tex = sorted(glob(str(ROOT / "docs" / "*.tex")))
    if not tex:
        print("check_guide_environments: FAILED -- no docs/*.tex found; a "
              "clean report over zero manuals is not a check")
        return 1

    defined = set()
    for f in tex:
        defined |= set(DEFINE.findall(Path(f).read_text(errors="replace")))

    problems, opened = [], 0
    for f in tex:
        rel = Path(f).relative_to(ROOT).as_posix()
        text = Path(f).read_text(errors="replace")
        begins, ends = [], []
        for lineno, line in enumerate(text.splitlines(), 1):
            #  A commented-out line is not a use.
            if line.lstrip().startswith("%"):
                continue
            for m in BEGIN.finditer(line):
                begins.append((m.group(1), lineno))
            for m in END.finditer(line):
                ends.append(m.group(1))
        opened += len(begins)
        for name, lineno in begins:
            if name not in defined and name not in STANDARD:
                problems.append(f"{rel}:{lineno}: \\begin{{{name}}} -- no such "
                                f"environment is defined in the tree and it is "
                                f"not a standard/package one, so `make -C docs "
                                f"all` dies here with \"Environment {name} "
                                f"undefined\"")
        from collections import Counter
        cb, ce = Counter(n for n, _ in begins), Counter(ends)
        for name in set(cb) | set(ce):
            if cb[name] != ce[name]:
                problems.append(f"{rel}: \\begin{{{name}}} appears {cb[name]} "
                                f"time(s) and \\end{{{name}}} {ce[name]} -- an "
                                f"unbalanced environment stops the build")

    if problems:
        print("check_guide_environments: FAIL")
        for p in problems[:30]:
            print("  " + p)
        if len(problems) > 30:
            print(f"  ... and {len(problems) - 30} more")
        return 1

    print(f"check_guide_environments: OK -- {opened} environment openings "
          f"across {len(tex)} manual(s) all resolve ({len(defined)} defined in "
          f"the tree, the rest standard or package-provided) and every one is "
          f"balanced.  NOT checked: this is not a compile -- an undefined "
          f"MACRO, bad math, a stray brace or a broken reference still kill "
          f"`make -C docs all` and none is visible here.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
