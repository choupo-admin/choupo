#!/usr/bin/env python3
"""Faithfulness guard: every parameters/eNRTL/<c>-<a>.dat == its
enrtl.dat row.  Runs while enrtl.dat exists; flips to assert ABSENT after."""
import re, sys
from pathlib import Path
repo = Path(__file__).resolve().parents[2]
ef = repo / "data/standards/electrolyte/enrtl.dat"
edir = repo / "data/standards/parameters/eNRTL"
if not ef.exists():
    print("electrolyte/enrtl.dat ABSENT -- eNRTL kind consolidated. OK."); sys.exit(0)
body = re.search(r'enrtl\s*\((.*)\)', ef.read_text(), re.S).group(1)
def tok(b,k):
    m = re.search(rf'\b{k}\b\s+(-?[\w.+-]+)\s*;', b); return m.group(1) if m else None
fails, seen = [], set()
for row in re.finditer(r'\{([^{}]*)\}', body):
    b = row.group(1); cat, an = tok(b,"cation"), tok(b,"anion")
    if not cat or not an: continue
    seen.add(f"{cat}-{an}"); f = edir / f"{cat}-{an}.dat"
    if not f.exists(): fails.append(f"MISSING {cat}-{an}.dat"); continue
    txt = f.read_text()
    for k in ("tau_m_ca","tau_ca_m","alpha"):
        sv = tok(b,k)
        if sv is None: continue
        fv = tok(txt,k)
        if fv is None or abs(float(fv)-float(sv)) > 1e-12+1e-12*abs(float(sv)):
            fails.append(f"{cat}-{an}.{k}: file={fv} source={sv}")
orphans = {p.stem for p in edir.glob("*.dat")} - seen
if orphans: fails.append(f"ORPHAN: {sorted(orphans)}")
print(f"checked {len(seen)} eNRTL records vs enrtl.dat")
if fails:
    for x in fails[:20]: print("  FAIL", x); sys.exit(1)
print("all eNRTL faithful + 1:1 bijection.")
