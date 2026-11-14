# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""A minimal reader of the record dictionary grammar, for the record gates.

Shared by check_provenance_home, check_record_primitives and
check_record_law_values (DEV.md 4c C398 slice (b)).  It reads the SHAPE of a
record -- which keys, which blocks, at which line -- and nothing about
values: a gate that needs what a law ANSWERS asks the engine
(`choupoProps --record-law-checks`), never a second implementation of a law.

parse(text) -> Block; a Block holds `entries`, a list of (key, value, line)
where value is a Block (a sub-dictionary) or a list of tokens (a scalar
entry or a list, parentheses included, lists of dictionaries flattened).
"""
import re

TOKEN = re.compile(r'"(?:[^"\\]|\\.)*"|[{}();]|[^\s{}();"]+')


def strip_comments(s):
    out, i, n = [], 0, len(s)
    while i < n:
        if s.startswith("//", i):
            j = s.find("\n", i)
            i = n if j < 0 else j
        elif s.startswith("/*", i):
            j = s.find("*/", i + 2)
            seg = s[i:(n if j < 0 else j + 2)]
            out.append("\n" * seg.count("\n"))
            i = n if j < 0 else j + 2
        elif s[i] == '"':
            j = i + 1
            while j < n and s[j] != '"':
                j += 2 if s[j] == "\\" else 1
            out.append(s[i:j + 1])
            i = j + 1
        else:
            out.append(s[i])
            i += 1
    return "".join(out)


class Block:
    def __init__(self, line=0):
        self.entries = []
        self.line = line

    def keys(self):
        return [k for k, _, _ in self.entries]

    def get(self, key):
        for k, v, _ in self.entries:
            if k == key:
                return v
        return None

    def blocks(self):
        return [(k, v, l) for k, v, l in self.entries if isinstance(v, Block)]

    def word(self, key):
        v = self.get(key)
        return v[0] if isinstance(v, list) and v else None


def parse(text):
    toks = []
    line, pos = 1, 0
    s = strip_comments(text)
    for m in TOKEN.finditer(s):
        line += s.count("\n", pos, m.start())
        pos = m.start()
        toks.append((m.group(0), line))
    i = 0

    def block(line0):
        nonlocal i
        b = Block(line0)
        pending = []
        depth = 0
        while i < len(toks):
            t, l = toks[i]
            if t == "}" and depth == 0:
                i += 1
                if pending:
                    b.entries.append((pending[0][0], [p for p, _ in pending[1:]], pending[0][1]))
                return b
            if depth > 0 or t in "()":
                depth += 1 if t == "(" else (-1 if t == ")" else 0)
                pending.append((t, l))
                i += 1
                continue
            if t == "{":
                i += 1
                if pending:
                    name, nl = pending[0]
                    b.entries.append((name, block(nl), nl))
                    pending = []
                else:
                    block(l)
                continue
            if t == ";":
                if pending:
                    b.entries.append((pending[0][0], [p for p, _ in pending[1:]], pending[0][1]))
                pending = []
                i += 1
                continue
            pending.append((t, l))
            i += 1
        if pending:
            b.entries.append((pending[0][0], [p for p, _ in pending[1:]], pending[0][1]))
        return b

    return block(0)


def parse_file(path):
    with open(path, encoding="utf-8") as fh:
        return parse(fh.read())


#  The seven pure-component property blocks a component record may hold, and
#  the shapes their laws take (src/thermo/RecordLaws.H).
PROPERTY_BLOCKS = ("vaporPressure", "idealGasHeatCapacity", "liquidHeatCapacity",
                   "solidHeatCapacity", "liquidViscosity", "liquidThermalConductivity",
                   "surfaceTension")


def laws_of(prop, blk):
    """The laws of one property block, as (name, body) -- name "" for the one
    unnamed law of the one-law and bare shapes.  Mirrors recordLaws::parse."""
    named = prop in ("liquidViscosity", "liquidThermalConductivity")
    if not named and blk.get("model") is not None:
        return [("", blk)]
    subs = blk.blocks()
    if prop == "surfaceTension" and not subs:
        return [("", blk)]
    return [(k, v) for k, v, _ in subs]
