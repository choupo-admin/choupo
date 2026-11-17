#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""cite_symbol -- find the function that encloses a line of an engine file.

DEV.md 4c C415 (1).  A lesson cites the engine by SYMBOL (`file` + `symbol`
+ a quoted fragment), never by line number.  This is the converter's helper:
given `file:line` it names the enclosing function so the citation can be
written `{ file, symbol, contains }`.  The tests (gui/tests/support/
engineCite.ts) are the judge: they re-resolve every symbol and require the
fragment inside its body, so a wrong guess here fails loudly, never silently.

Heuristic (Allman C++): the nearest column-0 `{` above the line with no
column-0 `}` between names the function; its header is the lines above `{`.
Returns None for a file with no such structure (a shell script, a header of
inline members, a TS file) -- the citation then scopes to the whole file.
"""
import re

NOT_FN = re.compile(r"\b(namespace|class|struct|enum|union)\b")


KEYWORDS = {"if", "for", "while", "switch", "catch", "else", "return", "sizeof"}


def _mask(src):
    """Blank comments and string/char literals, keeping every newline."""
    out, i, n = [], 0, len(src)
    while i < n:
        c, d = src[i], src[i + 1:i + 2]
        if c == "/" and d == "/":
            while i < n and src[i] != "\n":
                out.append(" "); i += 1
        elif c == "/" and d == "*":
            out.append("  "); i += 2
            while i < n and src[i:i + 2] != "*/":
                out.append("\n" if src[i] == "\n" else " "); i += 1
            out.append("  "); i += 2
        elif c in "\"'":
            out.append(c); i += 1
            while i < n and src[i] != c and src[i] != "\n":
                if src[i] == "\\":
                    out.append("  "); i += 2; continue
                out.append(" "); i += 1
            if i < n and src[i] == c:
                out.append(c); i += 1
        else:
            out.append(c); i += 1
    return "".join(out)


def symbol_scope(src, symbol):
    """(first, last) 1-based lines of the body of `symbol`'s definition; the
    same rule as gui/tests/support/engineCite.ts symbolScope."""
    m = _mask(src)
    for hit in re.finditer(r"(^|[\s*&])" + re.escape(symbol) + r"\s*\(", m, re.M):
        i, paren = hit.end(), 1
        while i < len(m) and paren > 0:
            paren += (m[i] == "(") - (m[i] == ")")
            i += 1
        while i < len(m) and m[i] not in "{;":
            i += 1
        if i >= len(m) or m[i] != "{":
            continue
        depth = 0
        while i < len(m):
            depth += (m[i] == "{") - (m[i] == "}")
            if depth == 0:
                break
            i += 1
        start = m.count("\n", 0, hit.start() + len(hit.group(1))) + 1
        return start, m.count("\n", 0, i) + 1
    return None


def _name_above(lines, i):
    hdr, j = [], i - 1
    while (j >= 0 and lines[j].strip() and not lines[j].startswith("}")
           and not lines[j].rstrip().endswith(";")
           and not lines[j].startswith("#")):
        hdr.insert(0, lines[j])
        j -= 1
    h = " ".join(x.strip() for x in hdr)
    if not h or NOT_FN.search(h.split("(")[0]):
        return None
    m = re.search(r"((?:~?[A-Za-z_]\w*::)*~?[A-Za-z_]\w*)\s*\(", h)
    if not m or m.group(1) in KEYWORDS:
        return None
    return m.group(1)


def enclosing_symbol(text, line, fragment=None):
    """Innermost column-0-`{` function around `line` whose resolved body
    contains `line` (and `fragment`, when given); None if no candidate does."""
    lines = text.split("\n")
    for i in range(min(line, len(lines)) - 1, -1, -1):
        if lines[i].rstrip() != "{":
            continue
        name = _name_above(lines, i)
        if name is None:
            continue
        sc = symbol_scope(text, name)
        if sc and sc[0] <= line <= sc[1] and (
                fragment is None or fragment in "\n".join(lines[sc[0] - 1:sc[1]])):
            return name
    return None
