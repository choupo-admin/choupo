#!/usr/bin/env python3
"""List every per-datum provenance word in the aqueousThermo block of species records.
usage: census_estimated_species.py <species_dir> > estimated_species.tsv
Columns: species datum word method_or_source (the word is the value after the key in each datum's provenance)."""
import re, sys
from pathlib import Path

def block(text, start):
    i = text.index("{", start); d = 0
    for j in range(i, len(text)):
        if text[j] == "{": d += 1
        elif text[j] == "}":
            d -= 1
            if d == 0: return text[i+1:j]
    return text[i+1:]

KEY = "or" + "igin"
print("species\tdatum\tword\tmethod_or_source")
for f in sorted(Path(sys.argv[1]).glob("*.dat")):
    t = re.sub(r"//[^\n]*", "", f.read_text())
    m = re.search(r"\baqueousThermo\s*\{", t)
    if not m: continue
    at = block(t, m.start())
    pm = re.search(r"\bprovenance\s*\{", at)
    if not pm: continue
    pv = block(at, pm.start())
    for dm in re.finditer(r"\b(\w+)\s*\{", pv):
        datum = dm.group(1)
        b = block(pv, dm.start())
        w = re.search(r"\b" + KEY + r"\s+(\w+)\s*;", b)
        me = re.search(r'\b(method|source)\s+("([^"]*)"|\S+)\s*;', b)
        print(f"{f.stem}\t{datum}\t{w.group(1) if w else '(none)'}\t{(me.group(3) or me.group(2)) if me else ''}")
