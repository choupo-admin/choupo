#!/usr/bin/env python3
"""Remove one top-level named block `<name> { ... }` from a Choupo dict file, in place.
Used ONLY on scratch copies of a case (never on tracked files):
    python3 -I probe_remove_block.py <file> <blockName>
Prints the number of characters removed; exits 1 if the block is absent."""
import re, sys
path, name = sys.argv[1], sys.argv[2]
t = open(path, encoding="utf-8").read()
m = re.search(r"(?m)^\s*" + re.escape(name) + r"\s*\{", t)
if not m:
    sys.exit("block %s not found" % name)
i = t.index("{", m.start()); depth = 0
for j in range(i, len(t)):
    if t[j] == "{": depth += 1
    elif t[j] == "}":
        depth -= 1
        if depth == 0: break
open(path, "w", encoding="utf-8").write(t[:m.start()] + "\n" + t[j + 1:])
print("removed", j + 1 - m.start(), "chars of", name)
