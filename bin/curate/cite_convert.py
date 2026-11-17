#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""cite_convert -- rewrite record citations `{ file, line, contains }` to
`{ file, symbol, contains }` (DEV.md 4c C415 (1)).

Usage: cite_convert.py ROOT FILE.ts [FILE.ts ...]

Reads each `file: <path or CONST>, line: N,` record, resolves the enclosing
function of line N in the engine file with `cite_symbol`, and writes
`symbol: "name"` in place of the number.  A citation whose enclosing function
cannot be named is written without a symbol (whole-file scope) and listed.
The gui tests re-resolve everything, so this tool is allowed to guess.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cite_symbol import enclosing_symbol  # noqa: E402


def convert(root, path):
    t = open(path, encoding="utf-8").read()
    consts = dict(re.findall(r'const\s+(\w+)\s*=\s*"([^"]+)"\s*;', t))
    rec = re.compile(r'(file:\s*)("([^"]+)"|(\w+))(,\s*)line:\s*(\d+)(,)(\s*contains:\s*(?:"((?:[^"\\]|\\.)*)"|\'((?:[^\'\\]|\\.)*)\'))?')
    whole = []

    def sub(m):
        f = m.group(3) or consts.get(m.group(4))
        if f is None:
            return m.group(0)
        p = os.path.join(root, f)
        sym = None
        frag = m.group(9) if m.group(9) is not None else m.group(10)
        frag = frag.encode().decode('unicode_escape') if frag else None
        if f.endswith((".cpp", ".cc")) and os.path.exists(p):
            sym = enclosing_symbol(open(p, encoding="utf-8").read(), int(m.group(6)), frag)
        if sym is None:
            whole.append((f, m.group(6)))
            return m.group(1) + m.group(2) + "," + (m.group(8) or "")
        return f'{m.group(1)}{m.group(2)}{m.group(5)}symbol: "{sym}",' + (m.group(8) or "")

    out = rec.sub(sub, t)
    open(path, "w", encoding="utf-8").write(out)
    return whole


if __name__ == "__main__":
    root = sys.argv[1]
    for p in sys.argv[2:]:
        w = convert(root, p)
        print(f"{p}: whole-file scope for {len(w)}: {w}")
