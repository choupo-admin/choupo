#!/usr/bin/env python3
"""Order the Theory Guide's bibliography BY FIRST CITATION, derived from the
body -- never hand-maintained.

    bin/curate/gen_theory_bibliography.py          # rewrite the block in place
    bin/curate/gen_theory_bibliography.py --check  # report drift, write nothing

WHY THIS EXISTS.  `docs/theoryGuide.tex` carries a manual
`\\begin{thebibliography}` with one `\\bibitem` per work, and LaTeX numbers
those IN SOURCE ORDER.  Nothing tied that order to the order a reader meets
them, so the first two citations in the manual rendered as [79] and [82] and
the third as [65] -- reported by Pedro Mendes against the Choupo-2608 Theory
Guide, where the same three read [73], [76] and [60] on its printed page 3.

THE ORDER IS A DERIVED FACT: it is a function of the body text, and the moment
anyone adds a citation every number after it moves.  Storing it by hand is the
second home this project forbids, so it is computed here and checked by
`bin/runTests`.

WHAT IS DERIVED, AND WHAT IS NOT.  Only the ORDER of the `\\bibitem` blocks.
Their text is hand-written curation and is moved verbatim, byte for byte --
this script never edits an entry, never invents one, and never deletes one.
The file stays the entries' one home; this is a normaliser over it, not a
generated view of something else.

THE RULE.  An entry's position is its FIRST citation in the BODY -- every
`\\cite{...}` outside the `thebibliography` environment, scanned from the top
of the file, multi-key `\\cite{a,b}` counted left to right.  A `\\cite` INSIDE
a bibliography entry (one entry pointing at another) is a cross-reference, not
a reading-order event, and is deliberately ignored: it would otherwise let the
bibliography decide its own order.

AN UNCITED ENTRY IS KEPT, MOVED LAST, AND NAMED.  Deleting a curated reference
is a curation act and belongs to the guide's authors, so uncited entries are
placed after the cited ones in their existing relative order, under a marker
comment, and reported on the claim line.  Under a BibTeX `unsrt` style they
would simply vanish from the rendered manual, which is why that route was not
taken -- see docs/design/the-order-a-reader-meets-a-reference.md.

REFUSALS (exit 1, nothing written):
  * a `\\cite` key with no `\\bibitem` -- LaTeX would render a bare `[?]`;
  * a duplicate `\\bibitem` key -- one of the two is unreachable;
  * no `thebibliography` environment where one is expected.
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GUIDE = ROOT / "docs" / "theoryGuide.tex"

BEGIN = "\\begin{thebibliography}"
END = "\\end{thebibliography}"
MARKER = ("%  --- the entries below are in the tree but cited nowhere in this "
          "manual ---\n"
          "%  Kept, not deleted: removing a curated reference is the authors' "
          "act.  Their\n"
          "%  order among themselves is whatever it was; everything above is "
          "ordered by\n"
          "%  first citation (bin/curate/gen_theory_bibliography.py).\n")


def fail(msg: str) -> None:
    print("gen_theory_bibliography: REFUSED -- " + msg)
    sys.exit(1)


SENTINEL = "cited nowhere in this manual"


def strip_marker(bib_body: str) -> str:
    """Remove a marker this script wrote on an earlier run.  Without this the
    marker is swept into the preceding entry's block and re-appended every
    time, so the generator would never reach a fixed point -- and a `--check`
    that can never pass is a gate that only ever cries wolf."""
    lines = bib_body.split('\n')
    out, i = [], 0
    while i < len(lines):
        if lines[i].startswith('%'):
            j = i
            while j < len(lines) and lines[j].startswith('%'):
                j += 1
            if any(SENTINEL in ln for ln in lines[i:j]):
                i = j
                continue
        out.append(lines[i])
        i += 1
    return '\n'.join(out)


def split_blocks(bib_body: str):
    """-> (lead, [(key, block_text)]).  A block runs from its `\\bibitem` to
    the character before the next one; `lead` is whatever precedes the first.
    Every block is normalised to end in exactly one blank line, so the order is
    the only thing this script can change."""
    starts = [m.start() for m in re.finditer(r'\\bibitem\{', bib_body)]
    if not starts:
        fail("the thebibliography environment holds no \\bibitem.")
    lead = bib_body[:starts[0]]
    blocks = []
    for i, s in enumerate(starts):
        e = starts[i + 1] if i + 1 < len(starts) else len(bib_body)
        text = bib_body[s:e].rstrip() + '\n\n'
        key = re.match(r'\\bibitem\{([^}]*)\}', text).group(1)
        blocks.append((key, text))
    return lead, blocks


def citation_order(body: str) -> list[str]:
    order: list[str] = []
    for m in re.finditer(r'\\cite\{([^}]*)\}', body, re.S):
        for k in (x.strip() for x in m.group(1).split(',')):
            if k and k not in order:
                order.append(k)
    return order


def build(src: str) -> tuple[str, dict]:
    i0 = src.find(BEGIN)
    if i0 < 0:
        fail(f"no {BEGIN} in {GUIDE.relative_to(ROOT)}.")
    i1 = src.find(END, i0)
    if i1 < 0:
        fail(f"no {END} after {BEGIN}.")
    head_end = src.index('\n', i0) + 1          # keep `\begin{thebibliography}{99}`
    bib_body = strip_marker(src[head_end:i1])
    body = src[:i0] + src[i1:]                  # the manual, bibliography removed

    lead, blocks = split_blocks(bib_body)
    seen: dict[str, int] = {}
    for key, _ in blocks:
        if key in seen:
            fail(f"duplicate \\bibitem key `{key}` -- one of the two can never "
                 "be reached by a citation.")
        seen[key] = 1
    by_key = dict(blocks)

    order = citation_order(body)
    missing = [k for k in order if k not in by_key]
    if missing:
        fail("cited with no \\bibitem: " + ", ".join(missing)
             + " -- LaTeX renders each as a bare [?].")

    cited = [by_key[k] for k in order]
    uncited = [t for k, t in blocks if k not in order]

    parts = [lead] + cited
    if uncited:
        parts.append(MARKER)
        parts.extend(uncited)
    new_bib = "".join(parts)
    #  One blank line before \end{thebibliography}, as the hand-written block had.
    new_bib = new_bib.rstrip('\n') + '\n\n'
    out = src[:head_end] + new_bib + src[i1:]
    return out, {"total": len(blocks), "cited": len(cited),
                 "uncited": [k for k, _ in blocks if k not in order],
                 "first": order[0] if order else None}


def main() -> int:
    check = "--check" in sys.argv[1:]
    src = GUIDE.read_text(encoding="utf-8")
    out, stats = build(src)
    rel = GUIDE.relative_to(ROOT)
    if check:
        if out != src:
            print(f"gen_theory_bibliography: DRIFT -- {rel}'s bibliography is "
                  "not in first-citation order.\n  Run "
                  "bin/curate/gen_theory_bibliography.py, rebuild "
                  "(make -C docs theory), and commit both.")
            return 1
    elif out != src:
        GUIDE.write_text(out, encoding="utf-8")
        print(f"gen_theory_bibliography: rewrote {rel}")
    unc = stats["uncited"]
    tail = ("; " + str(len(unc)) + " uncited kept last (" + ", ".join(unc) + ")") if unc else \
           "; every entry is cited"
    print(f"gen_theory_bibliography: OK -- {rel}'s {stats['total']} entries are "
          f"in first-citation order, {stats['cited']} of them cited, first is "
          f"[1] {stats['first']}{tail}.  Scanned: that one file's "
          "thebibliography block; nothing else in docs/ carries a bibliography.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
