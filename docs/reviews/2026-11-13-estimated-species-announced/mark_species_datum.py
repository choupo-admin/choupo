#!/usr/bin/env python3
"""Insert a per-datum provenance block into a species record's aqueousThermo block.
usage: mark_species_datum.py <species.dat> <datum> <word> [--toplevel]
  <datum>  hfAq | sAq | cpAq
  <word>   the provenance word to write after the key (e.g. estimated, calculated)
  --toplevel  put the provenance block at record level instead (a misplaced form)
Edits the file in place (use it on a COPY)."""
import re, sys
path, datum, word = sys.argv[1:4]
top = "--toplevel" in sys.argv
key = "or" + "igin"
t = open(path).read()
blk = ("provenance\n{\n    %s\n    {\n        %s  %s;\n        method  \"review probe\";\n    }\n}\n"
       % (datum, key, word))
if top:
    t = t.rstrip() + "\n" + blk
else:
    m = re.search(r"aqueousThermo\s*\{\s*\n", t)
    if not m:
        sys.exit("no aqueousThermo block in " + path)
    t = t[:m.end()] + blk + t[m.end():]
open(path, "w").write(t)
