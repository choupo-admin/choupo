#!/usr/bin/env python3
"""C295 step 3: rewrite every `tutorials/props/curation/<moved>` reference to
`data/curation/<origin>/<moved>`.  Mode `std`: data/standards + named prose
files + AUTHORED (unclaimed) case copies.  Prints counts."""
import re, subprocess, sys
from pathlib import Path

ROOT = Path(sys.argv[1])
MAP = dict(l.split() for l in Path(sys.argv[2]).read_text().splitlines() if l.strip())
mode = sys.argv[3]
pat = re.compile(r"tutorials/props/curation/(curate[0-9]+_[A-Za-z0-9_]+)")

def sub(text):
    n = 0
    def f(m):
        nonlocal n
        name = m.group(1)
        if name in MAP:
            n += 1
            return f"data/curation/{MAP[name]}/{name}"
        return m.group(0)
    return pat.sub(f, text), n

def files_naming():
    out = subprocess.run(["git", "grep", "-l", "tutorials/props/curation/curate"],
                         cwd=ROOT, capture_output=True, text=True).stdout.split()
    return out

total = 0; changed = []
for rel in files_naming():
    p = ROOT / rel
    if mode == "std":
        if rel.startswith("data/curation/"):
            # a case copy: only AUTHORED (unclaimed) records; imported copies are
            # the importer's to refresh
            parts = rel.split("/")
            case = ROOT / "/".join(parts[:4])
            crel = "/".join(parts[5:])
            man = case / "constant" / "propertyManifest"
            if man.exists() and f'"{crel}"' in man.read_text():
                continue
    t = p.read_text()
    nt, n = sub(t)
    if n:
        p.write_text(nt); total += n; changed.append(rel)
print(total, "references in", len(changed), "files")
for c in changed:
    print(" ", c)
