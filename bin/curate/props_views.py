"""A propsDict's `references` and `views`, read or taken out -- one home for the gates.

    from props_views import strip_views

WHY (2026-10-24, DEV.md 4c C149).  A case's views live IN its propsDict, beside the
operations they draw (src/postProcessing/views/Views.H).  A gate that copies a case
and edits or removes operations must take the case's `views` and `references` with
them, or the engine refuses -- rightly -- a view naming an operation the copy no
longer has.  This is the one place that knows how they are written: two top-level
lists, `references ( ... );` and `views ( ... );`, each on its own line, never a
regex per gate.
"""
import re


def _strip_comment(line):
    i = line.find("//")
    return line if i < 0 else line[:i]


def strip_views(text):
    """The propsDict text with its top-level `references` and `views` lists removed
    (the operations, and every comment outside the two lists, untouched)."""
    out, lines, i = [], text.splitlines(keepends=True), 0
    while i < len(lines):
        word = _strip_comment(lines[i]).strip()
        nxt = _strip_comment(lines[i + 1]).strip() if i + 1 < len(lines) else ""
        if word in ("references", "views") and nxt == "(":
            depth, j = 0, i + 1
            while j < len(lines):
                code = _strip_comment(lines[j])
                depth += code.count("(") - code.count(")")
                j += 1
                if depth == 0:
                    break
            i = j
            continue
        out.append(lines[i])
        i += 1
    stripped = "".join(out)
    if re.search(r"^\s*(references|views)\s*$", stripped, re.M):
        raise SystemExit("props_views.strip_views: a `references`/`views` list is not"
                         " written as `<name>` then `(` on the next line")
    return stripped
