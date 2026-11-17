#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_guides_static -- 6 former gates run as ARMS of one script (DEV.md 4c C419).

Former gates, each moved here verbatim as a function (its own docstring first,
its own checks, its own printed lines): check_guide_anchors, check_guide_environments, check_guide_menu, check_guide_paths, check_guide_pdf_version, check_curator_parity.
Each arm prints exactly what its gate printed; this runner prints ONE claim
line first (`check_guides_static: OK -- ...`) that carries every arm's own claim, then
the arms' output, and exits non-zero when any arm does.  An arm that fails does
not stop the others: every verdict is reported.
"""

import contextlib
import io
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

def arm_guide_anchors():
    """Gate: every guide anchor the GUI links to EXISTS in that guide.

    bin/curate/check_guide_anchors.py

WHY THIS EXISTS.  `gui/src/case/modelDocs.ts` deep-links the app to the
guides: a unit's "Theory -- the section deriving this unit", a props item's
"Properties Guide" link, a per-operation help target.  Each is a LaTeX
`\\label` name, turned into a PDF named destination by `destlabel=true`
(docs/preamble.tex).

A LABEL RENAMED IN A GUIDE BREAKS EVERY LINK TO IT IN SILENCE.  Nothing
errors: the PDF simply opens at page one, and a student who clicked "the
section deriving this unit" gets the cover.  The map is TypeScript, the
labels are LaTeX, and no compiler, test or gate saw across that seam.

WHAT THIS CHECKS.  Every destination named in modelDocs.ts resolves to a
`\\label{...}` in the guide that entry names.  Nothing more.

WHAT THIS DOES NOT CHECK, and the omission is deliberate rather than an
oversight.  **WHETHER A LIVE ANCHOR IS THE RIGHT ONE.**  That is exactly the
defect this file was written after: `adiabaticFlash` pointed at `ch:flash`,
a label that EXISTS -- on a section titled "Isothermal flash,
vapour-liquid".  The anchor was alive and the destination was wrong, so this
gate would have passed it, and it says so rather than implying otherwise.

The rule a human applies instead: A SHARED DESTINATION IS HONEST ONLY WHEN
ITS HEADING COVERS EVERY TYPE THAT LANDS ON IT.  Measured 2026-09-22 across
the whole table -- 54 mapped types, 28 destinations, 17 shared -- every
other share passed that test by its own heading ("Rotating equipment:
compressors, turbines, pumps"; "cyclone, bag filter, ideal splitter";
"boiler / condenser"), or was an umbrella naming none of them on purpose
("The simple unit operations").

IT IS NOT GATED BECAUSE EVERY MECHANICAL FORM OF IT ACCUSES THE INNOCENT.
"The heading must mention the type" fails `mixer` on "The simple unit
operations" and `spiralWoundModule` on "Spiral-wound membrane", both of
which are right.  A gate that accuses the innocent teaches the reader to
ignore it (2026-09-04), so the judgement is left where a reader can see it:
written beside the entry in modelDocs.ts.

Exit 1 naming the entry, its destination and the guide it is missing from.
"""
    import re
    import sys
    from pathlib import Path

    ROOT = Path(__file__).resolve().parents[2]
    MAP = ROOT / "gui" / "src" / "case" / "modelDocs.ts"
    GUIDES = {
        "theoryGuide": ROOT / "docs" / "theoryGuide.tex",
        "propsGuide": ROOT / "docs" / "propsGuide.tex",
        "userGuide": ROOT / "docs" / "userGuide.tex",
        "eduToolsGuide": ROOT / "docs" / "eduToolsGuide.tex",
        "designGuide": ROOT / "docs" / "designGuide.tex",
        "developerGuide": ROOT / "docs" / "developerGuide.tex",
    }

    #  Which guide each destination table targets.  Read from the table's own
    #  `guideUrl("<guide>", dest)` call rather than guessed.
    TABLES = [
        ("THEORY_DEST", "theoryGuide"),
        ("PROPS_DEST", "propsGuide"),
    ]


    def labels_of(path: Path) -> set:
        if not path.is_file():
            return set()
        #  `\input`-ed chapters count too: the guide is one document.
        text = path.read_text()
        out = set(re.findall(r"\\label\{([^}]+)\}", text))
        for inc in re.findall(r"\\input\{([^}]+)\}", text):
            sub = (path.parent / inc)
            for cand in (sub, sub.with_suffix(".tex")):
                if cand.is_file():
                    out |= set(re.findall(r"\\label\{([^}]+)\}", cand.read_text()))
        return out


    def main() -> int:
        if not MAP.is_file():
            print(f"check_guide_anchors: FAILED\n  {MAP} is missing -- the map "
                  "this gate reads does not exist, so nothing was checked.")
            return 1
        src = MAP.read_text()

        cache = {}
        fails = []
        checked = 0
        per_table = {}
        for table, guide in TABLES:
            #  `\b` is load-bearing: without it `const THEORY_DEST[^{]*{` also
            #  matches `const THEORY_DESTS`, because the name is a PREFIX and the
            #  wildcard swallows the rest of the declaration.  A sabotage that
            #  renamed the table survived on exactly that, and a gate blind to a
            #  renamed table reports agreement about a table it never read.
            m = re.search(r"const " + table + r"\b[^{]*\{(.*?)\n\};", src, re.S)
            if not m:
                fails.append(f"harvested NO entries from {table} -- its shape "
                             "changed, so this gate is blind there rather than "
                             "satisfied")
                continue
            body = re.sub(r"//[^\n]*", "", m.group(1))
            entries = re.findall(r'^\s*([A-Za-z0-9_]+):\s*"([^"]+)"', body, re.M)
            if not entries:
                fails.append(f"harvested NO entries from {table} -- its shape "
                             "changed, so this gate is blind there rather than "
                             "satisfied")
                continue
            per_table[table] = (len(entries), guide)
            if guide not in cache:
                cache[guide] = labels_of(GUIDES[guide])
            if not cache[guide]:
                fails.append(f"harvested NO \\label from {guide} -- the guide is "
                             "missing or its shape changed, so every anchor into "
                             "it is unchecked rather than checked")
                continue
            for key, dest in entries:
                checked += 1
                if dest not in cache[guide]:
                    fails.append(
                        f"{table}[{key}] -> \"{dest}\", which is NOT a \\label in "
                        f"{guide}.tex -- the PDF has no such named destination, "
                        f"so the link opens the guide at page one and the reader "
                        f"is told nothing")

        #  THE TWO OBJECT-SHAPED TABLES (2026-10-25, DEV.md 4c C151).  OP_DEST
        #  (a props op's F1) and PROPS_MODEL_DEST (a model token's theory) name
        #  their guide PER ENTRY -- `{ pdf: "theoryGuide.pdf", dest: ... }` and
        #  `{ guide: "theory", dest: ... }` -- and the calculation map routes every
        #  model block and every op block through them.  They were outside this
        #  gate until then, so a renamed label behind a map block would have
        #  opened page one in silence.
        OBJ_TABLES = [
            ("OP_DEST", r'^\s*"?([A-Za-z0-9_-]+)"?:\s*\{\s*pdf:\s*"([A-Za-z]+)\.pdf",\s*dest:\s*"([^"]+)"', None),
            ("PROPS_MODEL_DEST", r'^\s*"?([A-Za-z0-9_-]+)"?:\s*\{\s*guide:\s*"(theory|props)",\s*dest:\s*"([^"]+)"', {"theory": "theoryGuide", "props": "propsGuide"}),
            #  The slot-scoped model words (DEV.md 4c C165): keyed
            #  "<op type>.<slot key>:<token>", so the key is a quoted string with
            #  dots and a colon in it.
            ("SLOT_MODEL_DEST", r'^\s*"([^"]+)":\s*\{\s*guide:\s*"(theory|props)",\s*dest:\s*"([^"]+)"', {"theory": "theoryGuide", "props": "propsGuide"}),
        ]
        for table, pattern, alias in OBJ_TABLES:
            m = re.search(r"const " + table + r"\b[^{]*\{(.*?)\n\};", src, re.S)
            if not m:
                fails.append(f"harvested NO entries from {table} -- its shape "
                             "changed, so this gate is blind there rather than "
                             "satisfied")
                continue
            body = re.sub(r"//[^\n]*", "", m.group(1))
            entries = re.findall(pattern, body, re.M)
            if not entries:
                fails.append(f"harvested NO entries from {table} -- its shape "
                             "changed, so this gate is blind there rather than "
                             "satisfied")
                continue
            per_table[table] = (len(entries), "per-entry guide")
            for key, g, dest in entries:
                guide = alias[g] if alias else g
                if guide not in GUIDES:
                    fails.append(f"{table}[{key}] names guide '{g}', which is not one of {sorted(GUIDES)}")
                    continue
                if guide not in cache:
                    cache[guide] = labels_of(GUIDES[guide])
                checked += 1
                if dest not in cache[guide]:
                    fails.append(
                        f"{table}[{key}] -> \"{dest}\", which is NOT a \\label in "
                        f"{guide}.tex -- the link opens the guide at page one")

        #  THE FALLBACK: an op with no OP_DEST entry opens `op:<type>` in the
        #  Props Guide (propsOpHelpLink).  Every props op schema must therefore
        #  have that label -- bin/curate/props_ops_reference.py writes it.
        if "`op:${opType}`" in src or "op:${opType}" in src:
            units = set()
            for rel in ("src/unitOperations/UnitOperation.cpp",
                        "src/unitOperations/batch/BatchUnitOperation.cpp",
                        "src/unitOperations/dynamic/DynamicUnitOperation.cpp"):
                p = ROOT / rel
                if p.exists():
                    units |= set(re.findall(r'reg(?:isterType)?\(\s*"([A-Za-z0-9]+)"', p.read_text()))
            ops = sorted(p.name.replace(".schema.json", "")
                         for p in (ROOT / "gui" / "schemas" / "operations").glob("*.schema.json")
                         if p.name.replace(".schema.json", "") not in units)
            if "propsGuide" not in cache:
                cache["propsGuide"] = labels_of(GUIDES["propsGuide"])
            for op in ops:
                checked += 1
                if f"op:{op}" not in cache["propsGuide"]:
                    fails.append(f"propsOpHelpLink falls back to \"op:{op}\", which is "
                                 "NOT a \\label in propsGuide.tex -- regenerate "
                                 "docs/propsGuide-operations.tex "
                                 "(bin/curate/props_ops_reference.py)")
            per_table["op:<type> fallback"] = (len(ops), "propsGuide")

        if fails:
            print("check_guide_anchors: FAILED")
            for f in fails:
                print("  -", f)
            return 1

        shape = ", ".join(f"{t} {n} into {g}" for t, (n, g) in sorted(per_table.items()))
        print(f"check_guide_anchors: OK -- all {checked} guide anchor(s) the GUI "
              f"links to resolve to a real \\label ({shape}).  NOT CHECKED, and "
              f"deliberately: whether a LIVE anchor is the RIGHT one.  That is "
              f"the defect this gate was written after -- `adiabaticFlash` "
              f"pointed at `ch:flash`, a label that exists, on a section titled "
              f"\"Isothermal flash\" -- and every mechanical form of the check "
              f"accuses innocent umbrella sections, so the judgement is written "
              f"beside the entries instead.")
        return 0
    return main()


def arm_guide_environments():
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

DUPLICATE LABELS are checked too, and they are quieter than either.  LaTeX
resolves `\\ref{x}` to whichever `\\label{x}` came LAST and carries on with a
warning nobody reads, so a cross-reference points at the wrong place and looks
perfectly fine in the PDF.  theoryGuide.tex carried three -- `eq:langmuir`,
`ch:hydraulics`, `ch:drying`.  The one actually referenced happened to resolve
CORRECTLY, which is worse than if it had not: nothing would have revealed the
collision until someone added a third or moved a section.

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
  S3  one renamed label put back to its colliding name -> "\\label{eq:langmuir}
      is defined 2 times", exit 1.
Its own first run raised a FALSE alarm on `\\begin{footnotesize}` in a guide
that builds: LaTeX size and style declarations are legal environments and the
list omitted them.  Recorded because the fix was to the instrument, and a
whitelist gate's failure mode is exactly that.

Exit 0 = every environment opened is defined and balanced.
"""

    import re
    import sys
    from collections import Counter
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
        #  mathtools (loaded by theoryGuide.tex): its parenthesised small matrix.
        #  Missing it made this gate refuse a guide that builds (2026-11-15:
        #  theoryGuide.tex compiled with `make -B` while the gate said it dies).
        "psmallmatrix",
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
    LABEL = re.compile(r"\\label\{([^}]+)\}")


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
            for name, count in Counter(LABEL.findall(text)).items():
                if count > 1:
                    problems.append(f"{rel}: \\label{{{name}}} is defined "
                                    f"{count} times.  Every \\ref to it resolves "
                                    f"to the LAST one and LaTeX only warns, so a "
                                    f"cross-reference can point at the wrong place "
                                    f"and look right in the PDF")

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
              f"balanced, and no label is defined twice.  NOT checked: this is not a compile -- an undefined "
              f"MACRO, bad math, a stray brace or a broken reference still kill "
              f"`make -C docs all` and none is visible here.")
        return 0
    return main()


def arm_guide_menu():
    """Every guide the project PUBLISHES is reachable from the Help menu.

WHY THIS GATE EXISTS.  `bin/buildSite` already checks that every guide in
`DOCS` (docs/Makefile -- the one home for "which guides are public") reaches
the published site, and `gui/scripts/copyDocs.mjs` refuses a guide in DOCS
with no display label.  Both ends were covered.  The MIDDLE was not: nothing
checked that a published guide could be reached by a READER.

On 2026-09-01 the owner reported that the Design Guide had been DELETED.  It
had not.  `docs/designGuide.tex` was intact -- 2400 lines, twenty-seven
passages of heuristics and rules of thumb -- its PDF was compiled by
`make -C docs`, copied into `public/docs/`, and published to choupo.org.  The
Help menu listed FOUR manuals, by hand, under a comment that said "The four
glass-box manuals", and `GuideName` was a union of those same four strings.
DOCS had grown to eight.  So Design, EduTools, Explorer and Tutorials were
built, shipped and unreachable.

*An unreachable document is indistinguishable from a deleted one, and the
person who reports it as deleted is right about everything that matters.*

WHAT THIS CHECKS.
  (a) `gui/src/help/guides.generated.ts` is CURRENT against `DOCS` -- the
      generated module the menu maps over, regenerated by copyDocs.  A stale
      generated file is the same defect one layer down.
  (b) The Help menu renders that list rather than naming guides itself: no
      `guideUrl("<literal>")` call survives in MenuBar.tsx.
  (c) `GuideName` is derived, not enumerated.

WHAT IT DOES NOT CHECK.  That a browser paints the items (no JS runs here),
that a PDF exists for each entry (copyDocs warns; buildSite refuses), or that
any guide's CONTENT is any good.  And it says nothing about the LANDING page,
which links two guides of eight -- a deliberate editorial choice on a
marketing page, not a reachability defect, since the app is one click away.

SABOTAGES, four, all fire:
  S1  a guide removed from guides.generated.ts       -> stale vs DOCS
  S2  a guide added to DOCS and not regenerated      -> stale vs DOCS
  S3  a hand-written guideUrl("theoryGuide") put back
      into MenuBar.tsx                               -> named, not derived
  S4  GuideName re-enumerated as a literal union     -> not derived
"""
    import re
    import sys
    from pathlib import Path

    ROOT = Path(__file__).resolve().parents[2]
    MAKEFILE = ROOT / "docs" / "Makefile"
    GENERATED = ROOT / "gui" / "src" / "help" / "guides.generated.ts"
    MENUBAR = ROOT / "gui" / "src" / "ui" / "MenuBar.tsx"
    LINKS = ROOT / "gui" / "src" / "help" / "guideLinks.ts"


    def main() -> int:
        for p in (MAKEFILE, GENERATED, MENUBAR, LINKS):
            if not p.exists():
                print("check_guide_menu: FAILED -- %s does not exist.  A gate "
                      "whose subject is absent must not pass."
                      % p.relative_to(ROOT))
                return 1

        m = re.search(r'^DOCS\s*:=\s*(.+)$', MAKEFILE.read_text(), re.M)
        if not m:
            print("check_guide_menu: FAILED -- no `DOCS :=` line in docs/Makefile."
                  "  That line is the ONE home for which guides are public; "
                  "without it this gate would have to invent the list.")
            return 1
        docs = m.group(1).split()
        if len(docs) < 2:
            print("check_guide_menu: FAILED -- DOCS names %d guide(s).  The scan "
                  "has collapsed and a verdict over it would describe nothing."
                  % len(docs))
            return 1

        gen = GENERATED.read_text()
        listed = re.findall(r'\{\s*name:\s*"([^"]+)"', gen)
        bad = []
        missing = [d for d in docs if d not in listed]
        extra = [g for g in listed if g not in docs]
        if missing:
            bad.append("guides.generated.ts is STALE: %s published by docs/"
                       "Makefile and absent from it -- run `node gui/scripts/"
                       "copyDocs.mjs`" % ", ".join(missing))
        if extra:
            bad.append("guides.generated.ts names %s, which docs/Makefile does "
                       "NOT publish -- run `node gui/scripts/copyDocs.mjs`"
                       % ", ".join(extra))
        if listed != docs:
            if not missing and not extra:
                bad.append("guides.generated.ts lists the right guides in the "
                           "wrong ORDER; the menu follows DOCS -- regenerate")

        menu = MENUBAR.read_text()
        named = sorted(set(re.findall(r'guideUrl\(\s*"([^"]+)"', menu)))
        if named:
            bad.append("MenuBar.tsx names guide(s) by hand: %s.  The menu must "
                       "MAP over GUIDES -- a hand-written list is how four "
                       "published manuals became unreachable." % ", ".join(named))
        if "GUIDES.map(" not in menu:
            bad.append("MenuBar.tsx does not map over GUIDES; whatever it renders "
                       "is not the published list")

        links = LINKS.read_text()
        if re.search(r'export\s+type\s+GuideName\s*=\s*"', links):
            bad.append("GuideName is ENUMERATED in guideLinks.ts.  It must be "
                       "re-exported from guides.generated.ts, or a published "
                       "guide cannot even be named in this codebase.")

        if bad:
            print("check_guide_menu: FAILED")
            for b in bad:
                print("  " + b)
            return 1

        print("check_guide_menu: OK -- all %d guide(s) in docs/Makefile's DOCS "
              "(%s) reach the Help menu, which MAPS the generated list rather "
              "than naming any of them, and GuideName is derived from the same "
              "line.  NOT CHECKED: that a browser paints the items, that each "
              "PDF exists (copyDocs warns, buildSite refuses), or the LANDING "
              "page, which links two of eight by editorial choice."
              % (len(docs), ", ".join(docs)))
        return 0
    return main()


def arm_guide_paths():
    """check_guide_paths -- every path a MANUAL cites must exist in the tree.

WHY.  The guides are the one artefact with no compiler behind them.  A dict
key nobody reads gets caught, a stale golden gets caught, a stale generated
doc gets caught -- but a manual can send a reader to a file that was deleted
two hundred commits ago and nothing anywhere notices.  On 2026-08-14 the
developer guide was still offering `src/outerDriver/FitBinaryPair.{H,cpp}` as
one of "two concrete examples to read first"; that driver had been RETIRED,
its file removed, and the registration kept only so an old case gets a
refusal naming its replacement.  The guide's source-tree diagram was missing
`result/` and `curation/` -- the two subsystems the layering slice ADDED --
and listed a `tests/` directory that does not exist.

A manual that sends a reader to a file that is not there costs more than a
manual that says nothing: the reader concludes the tree is wrong, or that
they have misunderstood the layout, and either way they stop trusting the
document that was supposed to orient them.

WHAT IT CHECKS.  Every token in `docs/*.tex` that looks like a repository
path (starts with a known root and survives the placeholder filter below)
must resolve -- either exactly, or as a stem whose siblings exist
(`src/control/PIDController` is satisfied by `PIDController.H`).

WHAT IT DOES *NOT* CHECK, and this matters before anyone reads a green run
as more than it is:
  * whether the PROSE about a path is true.  This gate confirms
    `src/solver/NewtonND.cpp` exists, not that the paragraph describing it
    is still accurate.  Prose staleness is deliberately not gated (three
    attempts, three failures: a text search cannot tell a live claim from a
    recorded one).
  * NUMBERS in the manuals.  "four cases ship an expected" was wrong by two
    orders of magnitude and no path check would have seen it.
  * any manual that is not a `.tex` under `docs/`.
  * paths that appear only inside a figure, or built by string concatenation.

SABOTAGE-VERIFIED 2026-08-14, observed output:
  S1  a guide bullet repointed at `src/outerDriver/DeletedDriver.cpp` ->
      "docs/developerGuide.tex:1581: cites ..., which is not in the tree",
      exit 1.  That is the FitBinaryPair defect, reproduced.
  S2  `tutorials/steady/flash/flash01...` rewritten to the pre-2026 layout
      `tutorials/flash/flash01...` -> caught at developerGuide.tex:1839.
  S3  `mkdir tutorials/steady/flash/myFlash` -> the allowance fires in the
      OTHER direction: "now EXISTS -- it is no longer something the reader
      creates".  An allowlist nobody re-examines becomes a blindfold.

Its own first run caught two flaws in itself, which is the argument for
running a new gate before believing it: a TikZ style key (`src/.style`) read
as a path, and a run-output path (`.../log`) whose presence depended on
whether anyone had run the case.

Exit 0 = every cited path resolves.  Exit 1 = at least one does not.
"""

    import os
    import re
    import sys
    from glob import glob

    ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    ROOTS = ('tutorials', 'src', 'bin', 'data', 'gui', 'make', 'etc', 'docs')
    TOKEN = re.compile(r'(?:' + '|'.join(ROOTS) + r')/[A-Za-z0-9_./+-]*')

    #  A token that is CUT SHORT by one of these is a template, not a path:
    #  `data/materials/<name>.dat`, `src/\{core,thermo\}`, `evaporator0*`,
    #  `data/standards/\allowbreak parameters/`.  Judging them would be judging
    #  a placeholder, so they are skipped -- and skipping them is why the gate
    #  can be strict about everything else.
    PLACEHOLDER_NEXT = set('<*{\\')

    #  Run OUTPUTS are absent in a clean clone and present the moment anyone runs
    #  the case, so judging them would make the verdict depend on whether a case
    #  happened to have been run -- a gate whose answer moves with the working
    #  directory is not a gate.  They are skipped, and that is stated below.
    RUN_OUTPUT_TAILS = ('/log', '/converged', '/reports', '/iterations', '/design',
                        '/economics')
    #  The per-application log is `log.<binary>` (runCase writes log.choupoSolve),
    #  which the tail list above cannot express with endswith -- found 2026-08-22
    #  when a fresh clone judged userGuide's `less .../log.choupoSolve` line by
    #  whether somebody had happened to run the case.
    RUN_OUTPUT_BASENAMES = re.compile(r'/log\.[A-Za-z]+$')

    #  Paths the reader is told to CREATE.  Each carries the recipe it belongs
    #  to; an entry with no reason is not allowed to sit here quietly.
    CREATED_BY_THE_READER = {
        'tutorials/steady/flash/myFlash':
            'Recipe: "your first case" -- the reader authors it',
        'tutorials/myOp01_quick_smoke':
            'Recipe A step 6 -- the smoke case for the unit op being added',
        'tutorials/steady/userops/splitter01_isothermal':
            'Recipe A -- the isothermalSplitter example case',
        'tutorials/steady/userops/splitter01_isothermal/expected':
            'Recipe A step 7 -- the golden the reader records',
        'src/unitOperations/mixer/IsothermalSplitter.H':
            'Recipe A -- the unit op the reader writes',
        'src/unitOperations/mixer/IsothermalSplitter.cpp':
            'Recipe A -- the unit op the reader writes',
        'src/thermo/vaporPressure/Clapeyron.H':
            'Recipe B -- the property model the reader writes',
        'src/thermo/vaporPressure/Clapeyron.cpp':
            'Recipe B -- the property model the reader writes',
        'gui/schemas/operations/myOp.schema.json':
            'Recipe A -- the GUI schema the reader adds for their type',
    }


    def resolves(rel):
        p = os.path.join(ROOT, rel)
        if os.path.exists(p):
            return True
        #  A reference without an extension is satisfied by any sibling sharing
        #  the stem: the guides write `src/io/SolutionWriter`, the tree carries
        #  `.H` and `.cpp`.
        return bool(glob(p + '.*'))


    def main():
        misses, checked = [], 0
        for tex in sorted(glob(os.path.join(ROOT, 'docs', '*.tex'))):
            with open(tex, encoding='utf-8', errors='replace') as fh:
                for lineno, raw in enumerate(fh, 1):
                    line = raw.replace('\\_', '_')
                    for m in TOKEN.finditer(line):
                        tok = m.group(0)
                        nxt = line[m.end():m.end() + 1]
                        if nxt in PLACEHOLDER_NEXT or tok.endswith('/'):
                            continue
                        #  `src/.style` is a TikZ style key, not a path: a real
                        #  path component never begins with a dot.  Caught by the
                        #  gate's own first run, which is the argument for running
                        #  a new gate before believing its output.
                        if any(part.startswith('.') for part in tok.split('/')[1:]):
                            continue
                        if RUN_OUTPUT_BASENAMES.search(tok):
                            continue
                        if any(tok.endswith(t) for t in RUN_OUTPUT_TAILS):
                            continue
                        tok = tok.rstrip('.,;:)]}-')
                        if tok.count('/') < 1 or not tok:
                            continue
                        checked += 1
                        if tok in CREATED_BY_THE_READER or resolves(tok):
                            continue
                        misses.append((os.path.relpath(tex, ROOT), lineno, tok))

        #  An allowance that has become real is also drift -- in the other
        #  direction.  It means the guide is now citing something that EXISTS
        #  while this file still claims the reader has to create it.
        stale = [k for k in CREATED_BY_THE_READER if resolves(k)]

        if misses or stale:
            print('check_guide_paths: FAIL')
            for f, n, t in misses:
                print(f'  {f}:{n}: cites `{t}`, which is not in the tree')
            for k in stale:
                print(f'  allowance `{k}` now EXISTS -- it is no longer something '
                      f'the reader creates; remove it from CREATED_BY_THE_READER')
            return 1

        print(f'check_guide_paths: OK -- {checked} path citations across the .tex '
              f'manuals all resolve ({len(CREATED_BY_THE_READER)} allowed as '
              f'paths the reader is told to create).  NOT checked: whether the '
              f'PROSE about a path is true, any NUMBER stated in a manual, '
              f'anything outside docs/*.tex, or run OUTPUTS (log/, converged/, '
              f'reports/ ...), which a clean clone does not have.')
        return 0
    return main()


def arm_guide_pdf_version():
    """Gate: the guide PDF a reader downloads carries the CURRENT version.

    bin/curate/check_guide_pdf_version.py

WHY THIS EXISTS.  On 2026-08-05 Vitor opened choupo.org on his phone and the
Theory Guide title page read "Version 2607 / 30 June 2026".  The repository
was correct -- docs/theoryGuide.pdf said `Choupo-dev` and the hardcoded
release date had been gone for a day.  What he was served was a site build
from 2026-07-29.

THE CHAIN HAS FOUR LINKS AND ONLY ONE WAS GATED:

    src/core/Banner.H          CHOUPO_VERSION, the single source
      -> docs/version.tex      GATED by guide_version.py --check
      -> docs/*.pdf            NOT GATED   <- this file
      -> site/_dist/docs/*.pdf NOT GATED   <- bin/buildSite, post-assembly
      -> choupo.org            (whatever was last deployed)

`guide_version.py` proves the SOURCE the guides compile from is current.  It
cannot prove anybody recompiled them.  A .tex that says `Choupo-dev` beside a
.pdf built last month passes that gate cleanly, and the PDF is the artefact a
reader actually opens -- so the only gated link was the one nobody reads.

This is the same shape as every other defect found this week: a generated
artefact with no staleness check, where the generator's own output was
trusted to imply the product.  A guide naming a release it does not describe
is worse than an undated one, because the wrong label is believed.

WHAT IS CHECKED.  The rendered TITLE PAGE text of each guide must contain the
version string from Banner.H.  Text, not metadata: the title page is what the
reader sees, and PDF metadata can be current while the page is not.

Requires `pdftotext` (poppler).  Where it is absent the gate REFUSES.

That sentence used to end "the gate SKIPS with a loud note rather than
passing silently -- a check that cannot run has not passed, and saying so is
the whole doctrine", and the code below then returned 0.  Saying so is NOT
the whole doctrine: to `bin/runTests` and to `gate_manifest`, exit 0 IS a
pass, and a note on a console nobody re-reads does not change what the
harness records.  The prose was right and the return value contradicted it,
which is the shape this repository keeps finding -- `bin/buildSite` WARNed
and published without poppler on 2026-08-05, so this very check never ran in
CI, the only place that publishes, and the ruling then was that it must
refuse.  The same ruling applies to the gate itself.  Found 2026-09-02.

A refusal here is cheap to clear (`apt-get install poppler-utils`) and the
alternative is a permanently-green gate in exactly the environment where it
matters -- the `check_true_ions` shape, which this project retired a gate
over.
"""
    import re
    import shutil
    import subprocess
    import sys
    from pathlib import Path

    ROOT = Path(__file__).resolve().parents[2]
    BANNER = ROOT / "src" / "core" / "Banner.H"
    #  WHICH GUIDES ARE PUBLIC HAS ONE HOME: `DOCS` in docs/Makefile.  This list
    #  used to be spelled here too -- the FIFTH hand-written copy, after the
    #  Makefile, copyDocs.mjs, guide.html's allowlist and buildSite's loop -- and
    #  it is the copy that mattered most, because this is the gate that catches a
    #  stale title page.  It named four while the tree carried eight, so
    #  designGuide, explorerGuide and tutorialsGuide sat with an out-of-date
    #  version on their front page and NOTHING could report it: they were not
    #  checked because they were not listed, and they were not listed because
    #  nobody had listed them.  A guide outside the list cannot be caught lying
    #  about its own version.
    #
    #  Derived now, and REFUSING rather than falling back: a default list here
    #  would go stale exactly as the last one did, and would do it silently.
    def _public_guides():
        line = re.search(r'^DOCS\s*:=\s*(.+)$',
                         (ROOT / "docs" / "Makefile").read_text(), re.M)
        if not line:
            print("check_guide_pdf_version: FAILED\n  cannot read `DOCS :=` from "
                  "docs/Makefile -- that line decides which guides are public, and "
                  "this gate will not invent a list of its own.", file=sys.stderr)
            sys.exit(1)
        return line.group(1).split()


    GUIDES = _public_guides()


    def engine_version() -> str:
        m = re.search(r'CHOUPO_VERSION\s*=\s*"([^"]+)"', BANNER.read_text())
        if not m:
            raise SystemExit("check_guide_pdf_version: no CHOUPO_VERSION in Banner.H")
        return m.group(1)


    def title_page(pdf: Path) -> str:
        r = subprocess.run(["pdftotext", "-f", "1", "-l", "1", str(pdf), "-"],
                           capture_output=True, text=True)
        return r.stdout if r.returncode == 0 else ""


    def main() -> int:
        if not shutil.which("pdftotext"):
            print("check_guide_pdf_version: FAILED\n"
                  "  pdftotext (poppler) is not installed, so the rendered title "
                  "pages cannot be read and this check CANNOT RUN.  It refuses "
                  "rather than returning 0: to the harness, exit 0 is a pass, and "
                  "a permanently-green gate is worse than no gate.\n"
                  "  The guides may carry any version at all; nothing here has "
                  "been verified either way.\n"
                  "  remedy: apt-get install -y poppler-utils")
            return 1

        want = engine_version()
        stale, missing = [], []
        for g in GUIDES:
            pdf = ROOT / "docs" / f"{g}.pdf"
            if not pdf.is_file():
                missing.append(g)
                continue
            page = title_page(pdf)
            if want in page:
                continue
            #  Report WHAT it says, not merely that it is wrong -- a stale stamp
            #  is diagnosed by the version it names.
            found = re.search(r'(Version\s+\d{4}|Choupo-[A-Za-z0-9]+)', page)
            stale.append(f"docs/{g}.pdf title page says "
                         f"'{found.group(1) if found else '(no version at all)'}' "
                         f"-- Banner.H says '{want}'")

        if stale or missing:
            print("check_guide_pdf_version: FAILED")
            for s in stale:
                print("  " + s)
            for m in missing:
                print(f"  docs/{m}.pdf does not exist -- the guide was never built")
            print("  remedy: bin/curate/guide_version.py && make -C docs all")
            return 1

        print(f"check_guide_pdf_version: OK -- all {len(GUIDES)} guide PDFs render "
              f"'{want}' on their title page (the artefact a reader opens, not "
              "just the source it compiles from)")
        return 0
    return main()


def arm_curator_parity():
    """check_curator_parity -- a curator is not an author, and the two records agree.

WHY THIS GATE EXISTS
--------------------
`docs/preamble.tex`'s \\manualauthors feeds THREE sentences on every guide's
front matter, and one of them is the COPYRIGHT line.  So a name added there is
a rights claim, whatever the intention was -- and the intention, when a
colleague agrees to review a chapter, is almost never that.  It happened here:
Monica Faria consented to CURATE the batch UF/NF membrane tool and was written
into \\manualauthors, which put her in the copyright of a work she does not
claim.

The remedy is a second, separate channel (\\manualcuratorblock) and a rule
this gate enforces: A CURATOR NAME MUST NEVER APPEAR IN \\manualauthors.

WHAT THIS GATE CHECKS
---------------------
(a) Every curator named in docs/preamble.tex appears in AUTHORS' `Curators`
    section, and every curator in AUTHORS appears in docs/preamble.tex.
(b) NO curator name appears anywhere in the \\manualauthors macro.  This is the
    load-bearing arm: it is the exact defect the slice exists to prevent.
(c) Every guide-author list in \\manualauthors has a matching section in
    AUTHORS carrying the same names.  AUTHORS was ALREADY a second home for
    those lists and nothing held the two together; a name could drift out of
    one and stay in the other with the suite green.
(e) THE TOOL ITSELF.  A curator declared on an EduTool
    (gui/src/ui/methods/registry.ts, the `curator` field, drawn as a badge on
    the tool) must appear in AUTHORS with that tool's id backticked in their
    scope line, and every backticked tool id in AUTHORS must be a tool that
    declares that curator.  Vitor asked for this on 2026-09-24: a credit on
    the guide's front matter is a credit a student never reaches, because a
    student opens the TOOL.  Three homes in three languages, one gate -- the
    check_verdict_parity precedent, and the reasoning is in
    docs/design/how-a-curator-is-credited.md.

(d) Each curator entry states a SCOPE -- what part of which guide they answer
    for.  A curator credited for "the guide" with no scope is a credit nobody
    can check, and the scope is the whole difference between a review and a
    byline.

WHAT THIS GATE DOES NOT CHECK
-----------------------------
Whether consent was actually given.  That is a fact about a conversation
outside the tree; AUTHORS records that it was, and no gate can verify it.
Nor does it check that a scope string is TRUE of the section it names.

SABOTAGES FIRED BY HAND (all caught; see the commit that added this file)
  S1  a curator moved into \\manualauthors            -> arm (b) FAILED
  S2  a curator dropped from AUTHORS                  -> arm (a) FAILED
  S3  a curator added to AUTHORS only                 -> arm (a) FAILED
  S4  a guide author list changed in preamble only    -> arm (c) FAILED
  S5  a curator entry stripped of its scope           -> arm (d) FAILED
"""

    import re
    import sys
    from pathlib import Path

    ROOT = Path(__file__).resolve().parents[2]
    PREAMBLE = ROOT / "docs" / "preamble.tex"
    AUTHORS = ROOT / "AUTHORS"
    REGISTRY = ROOT / "gui" / "src" / "ui" / "methods" / "registry.ts"

    # The guide-author lists, keyed by the switch macro each guide declares.  The
    # VALUE is the heading AUTHORS uses for that same list -- the join between the
    # two homes arm (c) holds together.
    GUIDE_SECTIONS = {
        "propertyTheoryAuthors": "Properties Guide and Theory Guide",
        "eduToolsAuthors": "EduTools Guide",
    }


    def detex(s):
        """Reduce a LaTeX-escaped name to comparable plain text.

    Only the accent forms this tree actually uses are handled, and anything
    unrecognised is left alone -- a silent mangle would make two different
    names compare equal, which is the one failure mode a parity gate must not
    have.
    """
        subs = [
            (r"V\\'\{\\i\}tor", "Vítor"),
            (r"M\\'\{o\}nica", "Mónica"),
            (r"Qu\\'\{\\i\}mica", "Química"),
            (r"T\\'\{e\}cnico", "Técnico"),
        ]
        for pat, rep in subs:
            s = re.sub(pat, rep, s)
        s = s.replace("\\textemdash\\ ", "— ").replace("\\textemdash", "—")
        s = re.sub(r"\s+", " ", s)
        return s.strip()


    def read_macro(text, name):
        """Return the body of \\newcommand{\\<name>}{...}, brace-balanced."""
        start = text.find("\\newcommand{\\" + name + "}")
        if start < 0:
            return None
        i = text.index("{", start + len("\\newcommand{\\" + name + "}") - 1)
        # step to the opening brace of the BODY (after the name's closing brace)
        i = text.index("}", start) + 1
        while i < len(text) and text[i] not in "{[":
            i += 1
        if i >= len(text) or text[i] != "{":
            return None
        depth, j = 0, i
        while j < len(text):
            if text[j] == "{":
                depth += 1
            elif text[j] == "}":
                depth -= 1
                if depth == 0:
                    return text[i + 1:j]
            j += 1
        return None


    def branches(body):
        """Split an \\ifdefined chain into {switch macro -> branch text}.

    The \\else fallback is returned under the key "" -- it is the list a guide
    declaring no switch gets, and arm (c) deliberately does not hold it
    against AUTHORS because it belongs to no named guide.
    """
        out, pos = {}, 0
        pat = re.compile(r"\\ifdefined\\(\w+)")
        marks = [(m.start(), m.group(1)) for m in pat.finditer(body)]
        if not marks:
            return {"": body}
        for k, (start, switch) in enumerate(marks):
            seg_end = marks[k + 1][0] if k + 1 < len(marks) else len(body)
            seg = body[start:seg_end]
            seg = re.sub(r"^\\ifdefined\\\w+", "", seg)
            seg = re.split(r"\\else", seg)[0]
            out[switch] = seg
            pos = seg_end
        tail = body[marks[-1][0]:]
        parts = re.split(r"\\else", tail)
        if len(parts) > 1:
            out[""] = re.split(r"\\fi", parts[-1])[0]
        return out


    PERSON = re.compile(r"(?:[A-ZÀ-Ý][\wÀ-ÿ'’.-]*\s+){1,3}[A-ZÀ-Ý][\wÀ-ÿ'’.-]*")


    def flatten(segment):
        """A LaTeX segment reduced to comparable plain text."""
        s = detex(segment)
        s = re.sub(r"%\s*", "", s)
        s = s.replace("\\\\", " ")
        s = re.sub(r"\\[a-zA-Z]+\s*", " ", s)
        return re.sub(r"\s+", " ", s).strip()


    def names_of(segment):
        """People named in an AUTHOR list: a comma/and-separated run of names."""
        out = set()
        for piece in re.split(r",| and ", flatten(segment)):
            piece = piece.strip(" .;")
            if PERSON.fullmatch(piece):
                out.add(piece)
        return out


    def curators_of(segment):
        """People named in a CURATOR block.

    The format is one entry per curator, entries separated by `;`, each
    written `Name, Affiliation \\textemdash\\ scope`.  The PERSON is the
    first comma-separated field -- an affiliation is capitalised too, so
    anything looser reads `Instituto Superior Tecnico` as a colleague.
    """
        m = re.search(r"Curators:(.*?)\\\\\[", segment, re.S)
        if m is None:
            return set()
        s = flatten(m.group(1))
        out = set()
        for entry in s.split(";"):
            head = re.split(r"—", entry)[0]
            person = head.split(",")[0].strip(" .;")
            if PERSON.fullmatch(person):
                out.add(person)
        return out


    def authors_sections(text):
        """AUTHORS' indented blocks, keyed by their heading line."""
        out, heading, buf = {}, None, []
        for line in text.splitlines():
            if line and not line[0].isspace():
                if heading is not None:
                    out[heading] = buf
                heading, buf = line.strip(), []
            elif heading is not None:
                out.setdefault(heading, buf)
                buf.append(line)
        if heading is not None:
            out[heading] = buf
        return out


    def main():
        fails = []
        ptex = PREAMBLE.read_text(encoding="utf-8")
        atext = AUTHORS.read_text(encoding="utf-8")

        auth_body = read_macro(ptex, "manualauthors")
        cur_body = read_macro(ptex, "manualcuratorblock")
        if auth_body is None:
            fails.append("docs/preamble.tex: \\manualauthors not found")
        if cur_body is None:
            fails.append("docs/preamble.tex: \\manualcuratorblock not found -- "
                         "the curator channel is the whole point of this gate")
        if fails:
            print("check_curator_parity: FAIL")
            for f in fails:
                print("  " + f)
            return 1

        secs = authors_sections(atext)

        # --- the curator roster, from AUTHORS -------------------------------
        cur_lines = secs.get("Curators")
        if cur_lines is None:
            fails.append("AUTHORS: no `Curators` section")
            authors_curators = {}
        else:
            authors_curators = {}
            current = None
            for line in cur_lines:
                stripped = line.strip()
                if not stripped:
                    continue
                indent = len(line) - len(line.lstrip())
                if indent <= 2 and re.match(
                        r"(?:[A-ZÀ-Ý][\wÀ-ÿ'’.-]*\s+){1,3}[A-ZÀ-Ý][\wÀ-ÿ'’.-]*", stripped):
                    current = stripped.split(",")[0].strip()
                    authors_curators[current] = []
                elif current is not None:
                    authors_curators[current].append(stripped)

        # --- the curator roster, from preamble.tex --------------------------
        preamble_curators = set()
        for switch, seg in branches(cur_body).items():
            if not switch:
                continue
            preamble_curators |= curators_of(seg)

        # (a) both directions
        for n in sorted(preamble_curators - set(authors_curators)):
            fails.append("(a) curator in docs/preamble.tex but not in AUTHORS' "
                         "`Curators` section: %s" % n)
        for n in sorted(set(authors_curators) - preamble_curators):
            fails.append("(a) curator in AUTHORS but named on no guide's front "
                         "matter in docs/preamble.tex: %s" % n)

        # (b) the load-bearing arm
        auth_branches = branches(auth_body)
        all_author_names = set()
        for switch, seg in auth_branches.items():
            all_author_names |= names_of(seg)
        every_curator = preamble_curators | set(authors_curators)
        for n in sorted(every_curator & all_author_names):
            fails.append("(b) %s is a CURATOR and appears in \\manualauthors, "
                         "which feeds the guide's COPYRIGHT line (preamble.tex "
                         "line ~309).  A curator makes no copyright claim." % n)

        # (c) the guide lists, held against AUTHORS
        for switch, heading in GUIDE_SECTIONS.items():
            seg = auth_branches.get(switch)
            if seg is None:
                fails.append("(c) \\manualauthors has no branch for \\%s, which a "
                             "guide declares" % switch)
                continue
            want = names_of(seg)
            block = secs.get(heading)
            if block is None:
                fails.append("(c) AUTHORS has no `%s` section, but \\manualauthors "
                             "carries that list (%s)"
                             % (heading, ", ".join(sorted(want))))
                continue
            have = set()
            for line in block:
                s = line.strip()
                if re.fullmatch(r"(?:[A-ZÀ-Ý][\wÀ-ÿ'’.-]*\s+){1,3}[A-ZÀ-Ý][\wÀ-ÿ'’.-]*", s):
                    have.add(s)
            if want != have:
                fails.append("(c) `%s` disagrees: preamble.tex says {%s}, AUTHORS "
                             "says {%s}" % (heading, ", ".join(sorted(want)),
                                            ", ".join(sorted(have))))

        # (e) the tool's own declaration, held against AUTHORS both ways
        if REGISTRY.is_file():
            rtext = REGISTRY.read_text(encoding="utf-8")
            #  `id: "<tool>", ... curator: { name: "<name>", ...` -- the id and the
            #  curator are in ONE entry, so pair them by scanning entries, never by
            #  matching two independent patterns and hoping they line up.
            entries = re.split(r'\n  \{\n', rtext)
            declared = {}
            for e in entries:
                mid = re.search(r'id:\s*"([a-z0-9-]+)"', e)
                mcu = re.search(r'curator:\s*\{\s*name:\s*"([^"]+)"', e)
                if mid and mcu:
                    declared[mid.group(1)] = mcu.group(1)

            # AUTHORS' backticked tool ids, per curator
            claimed = {}
            for n, lines in authors_curators.items():
                for tid in re.findall(r"`([a-z0-9-]+)`", " ".join(lines)):
                    claimed[tid] = n

            for tid, who in sorted(declared.items()):
                if tid not in claimed:
                    fails.append("(e) EduTool `%s` declares curator %s in "
                                 "registry.ts, but no AUTHORS curator names that "
                                 "tool id in their scope." % (tid, who))
                elif claimed[tid] != who:
                    fails.append("(e) EduTool `%s`: registry.ts says %s, AUTHORS "
                                 "says %s." % (tid, who, claimed[tid]))
            for tid, who in sorted(claimed.items()):
                if tid not in declared:
                    fails.append("(e) AUTHORS gives %s the scope `%s`, but that "
                                 "EduTool declares no curator in registry.ts -- so "
                                 "the student opening it sees no credit."
                                 % (who, tid))
        else:
            fails.append("(e) gui/src/ui/methods/registry.ts is missing -- the "
                         "tool-side half of the roster cannot be checked, and a "
                         "check that cannot run must not pass.")

        # (d) every curator states a scope
        for n, lines in sorted(authors_curators.items()):
            body = " ".join(lines)
            if "—" not in body and "--" not in body:
                fails.append("(d) AUTHORS: curator %s states no scope.  Name the "
                             "guide and the part of it they answer for, after an "
                             "em dash." % n)
        for switch, seg in branches(cur_body).items():
            if not switch:
                continue
            if "\\textemdash" not in seg:
                fails.append("(d) docs/preamble.tex: the \\%s curator block states "
                             "no scope" % switch)

        if fails:
            print("check_curator_parity: FAIL")
            for f in fails:
                print("  " + f)
            return 1

        n_cur = len(authors_curators)
        n_tools = len(re.findall(r'curator:\s*\{', REGISTRY.read_text(encoding="utf-8"))) \
            if REGISTRY.is_file() else 0
        n_guides = len(GUIDE_SECTIONS)
        print("check_curator_parity: OK -- %d curator%s named in BOTH docs/preamble.tex "
              "and AUTHORS, each with a stated scope, and none of them in "
              "\\manualauthors (the macro that feeds every guide's copyright line); "
              "%d EduTool(s) declare a curator on the tool ITSELF and each agrees "
              "with AUTHORS in both directions; "
              "the %d guide author list%s carried by \\manualauthors agree name for "
              "name with AUTHORS' own sections.  NOT CHECKED: whether consent was "
              "given (a fact outside the tree, recorded in AUTHORS and verifiable "
              "by no gate) and whether a scope string is true of the section it "
              "names."
              % (n_cur, "" if n_cur == 1 else "s", n_tools,
                 n_guides, "" if n_guides == 1 else "s"))
        return 0
    return main()


ARMS = [
    ("guide_anchors", arm_guide_anchors),
    ("guide_environments", arm_guide_environments),
    ("guide_menu", arm_guide_menu),
    ("guide_paths", arm_guide_paths),
    ("guide_pdf_version", arm_guide_pdf_version),
    ("curator_parity", arm_curator_parity),
]


def _claim(name, text):
    from gate_claim import claim_in
    import re
    c = claim_in(text, "check_" + name)
    c = c if c else (text.strip().splitlines() or ["(no output)"])[-1].strip()
    return "[" + name + "] " + re.sub(r"^\s*(\[[^\]]+\]|[\w.\-]+:)\s*OK\b\s*(--)?\s*", "", c)


def main():
    results = []
    arms = ARMS
    if "--arm" in sys.argv:         # run named arm(s) only: --arm a[,b]
        i = sys.argv.index("--arm")
        want = sys.argv[i + 1].split(",")
        del sys.argv[i:i + 2]
        arms = [a for a in ARMS if a[0] in want]
        if len(arms) != len(want):
            print("check_guides_static: FAILED -- unknown arm in " + ",".join(want) + "; arms are " + ", ".join(n for n, _ in ARMS))
            return 2
    for name, fn in arms:
        buf = io.StringIO()
        rc = 0
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
            try:
                r = fn()
                rc = r if isinstance(r, int) else 0
            except SystemExit as e:
                rc = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
                if isinstance(e.code, str):
                    print(e.code)
            except Exception:
                traceback.print_exc()
                rc = 1
        results.append((name, rc, buf.getvalue()))
    bad = [n for n, rc, _ in results if rc != 0]
    if bad:
        print("check_guides_static: FAILED -- arm(s) " + ", ".join(bad))
    else:
        print("check_guides_static: OK -- " + " || ".join(_claim(n, t) for n, _, t in results))
    for name, rc, text in results:
        print("--- arm check_%s (exit %d)" % (name, rc))
        sys.stdout.write(text if text.endswith("\n") or not text else text + "\n")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
