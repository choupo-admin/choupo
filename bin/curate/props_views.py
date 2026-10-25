"""A propsDict's `studies`, `references` and `views`, taken out -- one home for the gates.

    from props_views import strip_views

WHY (2026-10-24, DEV.md 4c C149).  A case's views live IN its propsDict, beside the
operations they draw (src/postProcessing/views/Views.H).  A gate that copies a case
and edits or removes operations must take the case's `views` and `references` with
them, or the engine refuses -- rightly -- a view naming an operation the copy no
longer has.  This is the one place that knows how they are written: top-level
lists, `<name> ( ... );`, never a regex per gate.

AND THE `studies` (2026-10-25).  C154 (4c2f3db7d) added a third top-level list that
names operations, `studies ( { ... ops ( ... ); } );`, and the engine refuses a
study naming an operation the propsDict does not declare exactly as it refuses a
view.  It was not taken out here, and the NanoFiltran paper case's part copies --
which had a SECOND home for this rule, `paper_case.subset_case` cutting the file by
position ("everything after the operations list") -- kept a `studies` written ABOVE
the list: three gates died on study B's `dye4_p1` before comparing a number.  Every
list that names operations is taken out here, by NAME, wherever it stands, and
paper_case calls this.

The closing parenthesis is found by COUNTING outside `//` and `/* */` comments and
outside "strings": a study's `summary` carries parentheses of its own, so a count
that read prose would close the list in the middle of a sentence.
"""
import re

#  The top-level propsDict lists that name operations.  A new one goes HERE.
LISTS = ("studies", "references", "views")


def _close(text, i):
    """Index just past the `)` matching the `(` at text[i]."""
    depth, n = 0, len(text)
    while i < n:
        if text.startswith("//", i):
            j = text.find("\n", i)
            i = n if j < 0 else j
            continue
        if text.startswith("/*", i):
            j = text.find("*/", i + 2)
            i = n if j < 0 else j + 2
            continue
        c = text[i]
        if c == '"':
            j = i + 1
            while j < n and text[j] != '"':
                j += 2 if text[j] == "\\" else 1
            i = j + 1
            continue
        if c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    raise SystemExit("props_views.strip_views: a top-level list is never closed")


def strip_views(text):
    """The propsDict text with its top-level `studies`, `references` and `views`
    lists removed (the operations, and every comment outside the lists, untouched)."""
    for word in LISTS:
        pat = re.compile(r"^[ \t]*%s[ \t]*\n?[ \t]*\(" % word, re.M)
        while True:
            m = pat.search(text)
            if m is None:
                break
            end = _close(text, m.end() - 1)
            if text.startswith(";", end):
                end += 1
            if text.startswith("\n", end):
                end += 1
            text = text[:m.start()] + text[end:]
    if re.search(r"^\s*(%s)\s*$" % "|".join(LISTS), text, re.M):
        raise SystemExit("props_views.strip_views: a `%s` list is not written as"
                         " `<name> (` or `<name>` then `(` on the next line"
                         % "`/`".join(LISTS))
    return text
