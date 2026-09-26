#!/usr/bin/env python3
"""TOOL (not a gate, wired nowhere): every NUMBERED display-math environment
of the Theory Guide, one row each, with the chapter it sits in.

    bin/curate/theory_equation_inventory.py            # the table + the claim
    bin/curate/theory_equation_inventory.py --tsv      # tab-separated, no header

WHY THIS EXISTS.  `check_theory_citations` is CHAPTER-granular and says so on
its own claim line -- *"NOT CHECKED: ... the numbered equation environments
individually"*.  Vitor asked (2026-09-22) which EQUATIONS carry no source,
and that is a READING job nothing mechanical can do: no scan can tell a
correlation from a definition.  What a tool CAN do is fix the DENOMINATOR --
enumerate every numbered equation environment, deterministically, so that
the reading list (`docs/design/theory-guide-equation-citations-2026-09-26.md`)
and this inventory agree row for row, and a reader can check that nothing
was skipped.  The verdicts live in the design record; this file carries
none.

WHAT COUNTS.  A `\\begin{<env>}` where <env> is one of `equation`, `align`,
`gather`, `multline`, `eqnarray`, `flalign` -- the forms LaTeX numbers.  ONE
ROW PER ENVIRONMENT: an `align` with three numbered lines is one row (the
per-chapter gate counts the same way, so the two totals are comparable).
A `\\begin{equation}` inside a body the tool skips (below) does not count.

WHAT IS EXCLUDED, and each is stated on the claim line:
  * the starred forms (`equation*`, `align*`, ...) -- unnumbered by
    construction;
  * `\\[ ... \\]`, `$$ ... $$` and inline `$ ... $` -- unnumbered;
  * inner alignment environments (`aligned`, `split`, `cases`, `pmatrix`,
    ...) -- they live INSIDE a numbered environment and are not one;
  * anything after an unescaped `%` on a line (a LaTeX comment), and the
    bodies of `verbatim`, `lstlisting` and `comment` environments -- text
    LaTeX does not typeset as mathematics;
  * the `thebibliography` environment (it holds no equations, but the scan
    is stated in full so a reader can see the domain).

WHAT IT DOES NOT SEE.  An environment whose every line carries `\\nonumber`
or `\\notag` renders WITHOUT a number and is still counted here (the guide
carries none today -- the tool prints the count of such environments so a
reader can check that sentence rather than trust it).  A `\\tag{...}` that
renames a number is a number.  Macros that EXPAND to an equation
environment would be invisible; the guide's preamble defines none.

DOMAIN.  `docs/theoryGuide.tex` and its `\\input` / `\\include` closure,
followed recursively from the file's own directory (today: `preamble.tex`,
`version.tex`).  Read-only; stdlib only; deterministic (rows in file order,
files in closure order).
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GUIDE = ROOT / "docs" / "theoryGuide.tex"

NUMBERED = ("equation", "align", "gather", "multline", "eqnarray", "flalign")
SKIP_BODIES = ("verbatim", "lstlisting", "comment")

BEGIN = re.compile(r'\\begin\{(' + '|'.join(NUMBERED) + r')\}')
INPUT = re.compile(r'\\(?:input|include)\{([^}]+)\}')
SECTION = re.compile(r'\\section(\*?)\{')
SUBSECTION = re.compile(r'\\subsection\*?\{')
LABEL = re.compile(r'\\label\{([^}]*)\}')
NOTAG = re.compile(r'\\(?:nonumber|notag)\b')

MATH_WIDTH = 80


def strip_comment(line: str) -> str:
    """Drop everything after the first unescaped `%`."""
    out = []
    i = 0
    while i < len(line):
        c = line[i]
        if c == '\\' and i + 1 < len(line):
            out.append(line[i:i + 2])
            i += 2
            continue
        if c == '%':
            break
        out.append(c)
        i += 1
    return ''.join(out)


def brace_arg(text: str, start: int) -> str:
    """The brace-balanced argument that opens at text[start] == '{'."""
    depth = 0
    for j in range(start, len(text)):
        if text[j] == '{':
            depth += 1
        elif text[j] == '}':
            depth -= 1
            if depth == 0:
                return text[start + 1:j]
    return text[start + 1:]


def clean_title(raw: str) -> str:
    """`\\texorpdfstring{$K$}{K}-values` -> `K-values`; collapse whitespace."""
    t = re.sub(r'\\texorpdfstring\{[^{}]*\}\{([^{}]*)\}', r'\1', raw)
    t = re.sub(r'\\label\{[^}]*\}', '', t)
    t = re.sub(r'\\o\b\s?', 'o', t)                    # M\o ller -> Moller
    # Inside math, keep a command's NAME (\varepsilon-NTU -> varepsilon-NTU)
    t = re.sub(r'\$([^$]*)\$', lambda m: m.group(1).replace('\\', ''), t)
    t = re.sub(r'\\[a-zA-Z]+\s*', '', t)
    t = t.replace('{', '').replace('}', '').replace('$', '')
    return re.sub(r'\s+', ' ', t).strip()


def slug(title: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')


def closure(path: Path, seen=None) -> list:
    """The file and every file it \\input s, recursively, in order."""
    if seen is None:
        seen = []
    if path in seen:
        return seen
    seen.append(path)
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return seen
    for line in text.split("\n"):
        for m in INPUT.finditer(strip_comment(line)):
            name = m.group(1)
            child = (path.parent / name)
            if child.suffix == "":
                child = child.with_suffix(".tex")
            closure(child, seen)
    return seen


def scan_file(path: Path) -> list:
    """-> rows for one file.  Each row is a dict; see `inventory`."""
    lines = path.read_text(encoding="utf-8").split("\n")
    rows = []
    chapter_key, chapter_title, chapter_line = "", "", 0
    in_starred_section = True          # nothing numbered before the first
    subsection = ""
    skipping = None                    # name of the body being skipped
    pending_chapter = None             # a numbered \section seen, label not yet
    n = len(lines)
    i = 0
    while i < n:
        raw = lines[i]
        line = strip_comment(raw)
        if skipping:
            if re.search(r'\\end\{' + re.escape(skipping) + r'\}', line):
                skipping = None
            i += 1
            continue
        m = re.search(r'\\begin\{(' + '|'.join(SKIP_BODIES) + r')\}', line)
        if m:
            skipping = m.group(1)
            # A same-line \end closes it at once.
            if re.search(r'\\end\{' + re.escape(skipping) + r'\}',
                         line[m.end():]):
                skipping = None
            i += 1
            continue
        # A \section: numbered ones define the chapter; starred ones (a
        # Part header, the preface) END the previous chapter's span.
        ms = SECTION.search(line)
        if ms:
            starred = ms.group(1) == '*'
            arg_start = line.index('{', ms.end() - 1)
            title = clean_title(brace_arg(line, arg_start))
            if starred:
                in_starred_section = True
                chapter_key, chapter_title, chapter_line = "", title, i + 1
                pending_chapter = None
            else:
                in_starred_section = False
                chapter_title, chapter_line = title, i + 1
                # The label may sit on this line or one of the next few
                # (a title broken over two lines).  Look ahead up to 4.
                lab = None
                for k in range(i, min(n, i + 5)):
                    mm = LABEL.search(strip_comment(lines[k]))
                    if mm:
                        lab = mm.group(1)
                        break
                    if k > i and SECTION.search(strip_comment(lines[k])):
                        break
                if lab is None and not chapter_title:
                    # a title broken over lines: gather until the brace closes
                    pass
                chapter_key = lab if lab else "title:" + slug(title)
            subsection = ""
        msub = SUBSECTION.search(line)
        if msub:
            arg_start = line.index('{', msub.end() - 1)
            subsection = clean_title(brace_arg(line, arg_start))
        mb = BEGIN.search(line)
        if mb:
            env = mb.group(1)
            # Collect the body up to the matching \end.
            body_lines = [line[mb.end():]]
            j = i
            end_pat = re.compile(r'\\end\{' + env + r'\}')
            if not end_pat.search(body_lines[0]):
                j = i + 1
                while j < n:
                    lj = strip_comment(lines[j])
                    body_lines.append(lj)
                    if end_pat.search(lj):
                        break
                    j += 1
            body = "\n".join(body_lines)
            body = end_pat.split(body)[0]
            labels = LABEL.findall(body)
            math = LABEL.sub('', body)
            math = re.sub(r'\s+', ' ', math).strip()
            # Every alignment row tagged \notag / \nonumber => unnumbered
            # in the render.  Counted, and reported, never dropped.
            if env in ("align", "gather", "flalign", "eqnarray", "multline"):
                rows_of_env = [r for r in re.split(r'\\\\', body) if r.strip()]
                all_notag = bool(rows_of_env) and all(
                    NOTAG.search(r) for r in rows_of_env)
            else:
                all_notag = bool(NOTAG.search(body))
            rows.append(dict(
                file=str(path.relative_to(ROOT)),
                line=i + 1,
                env=env,
                chapter=chapter_key if not in_starred_section else "",
                chapter_title=chapter_title,
                subsection=subsection,
                label=labels[0] if labels else "",
                labels=labels,
                math=math[:MATH_WIDTH],
                all_notag=all_notag,
            ))
            i = j + 1
            continue
        i += 1
    return rows


def inventory() -> dict:
    files = closure(GUIDE)
    rows = []
    for f in files:
        if f.exists():
            rows.extend(scan_file(f))
    return dict(files=[str(f.relative_to(ROOT)) for f in files], rows=rows)


def main() -> int:
    inv = inventory()
    rows = inv["rows"]
    tsv = "--tsv" in sys.argv[1:]
    if not tsv:
        print("%-28s %-9s %-26s %-40s %s" % (
            "file:line", "env", "chapter", "label", "math (first %d chars)"
            % MATH_WIDTH))
    for r in rows:
        loc = "%s:%d" % (r["file"], r["line"])
        if tsv:
            print("\t".join([loc, r["env"], r["chapter"], r["chapter_title"],
                             r["subsection"], r["label"], r["math"]]))
        else:
            print("%-28s %-9s %-26s %-40s %s" % (
                loc, r["env"], r["chapter"] or "(unnumbered part)",
                r["label"], r["math"]))
    by_env = {}
    for r in rows:
        by_env[r["env"]] = by_env.get(r["env"], 0) + 1
    chapters = sorted({r["chapter"] for r in rows if r["chapter"]})
    notag = sum(1 for r in rows if r["all_notag"])
    outside = sum(1 for r in rows if not r["chapter"])
    if tsv:
        return 0
    print()
    print("TOTAL: %d numbered display-math environments (%s)."
          % (len(rows), ", ".join("%s %d" % (k, by_env[k])
                                  for k in NUMBERED if k in by_env)))
    print("theory_equation_inventory: OK -- %d numbered equation "
          "environments in %d chapters.  SCANNED: %s (docs/theoryGuide.tex "
          "and its \\input/\\include closure, comments after an unescaped %% "
          "dropped, %s bodies skipped).  COUNTED: \\begin{%s}, one row per "
          "environment (an align with several numbered lines is ONE row).  "
          "EXCLUDED: the starred forms, \\[..\\], $$..$$, inline math, inner "
          "aligned/split/cases blocks.  NOT SEEN: whether a citation stands "
          "beside any row -- that is the reading job in "
          "docs/design/theory-guide-equation-citations-2026-09-26.md, and "
          "this tool is its denominator.  %d environment(s) render "
          "unnumbered through \\notag/\\nonumber on every line (counted, "
          "flagged); %d environment(s) sit outside any numbered chapter."
          % (len(rows), len(chapters), ", ".join(inv["files"]),
             "/".join(SKIP_BODIES), "|".join(NUMBERED), notag, outside))
    return 0


if __name__ == "__main__":
    sys.exit(main())
