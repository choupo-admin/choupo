#!/usr/bin/env python3
"""Faithfulness guard for the gasLiquid kind (gases.dat is UNREAD by the engine,
so this guard is the SOLE net -- zero golden coverage).  Bit-exact key fields +
1:1 bijection.  Flips to ABSENT after delete."""
import re, sys
from pathlib import Path
repo = Path(__file__).resolve().parents[2]
gf = repo / "data/standards/electrolyte/gases.dat"
gdir = repo / "data/standards/chemistry"
if not gf.exists():
    print("electrolyte/gases.dat ABSENT -- gasLiquid kind consolidated. OK."); sys.exit(0)
body = re.search(r'gases\s*\((.*)\)', gf.read_text(), re.S).group(1)
def tok(b,k):
    m=re.search(rf'\b{k}\b\s+(-?[\d.eE+-]+)\s*;',b); return m.group(1) if m else None
fails, seen = [], set()
for row in re.finditer(r'\{([^{}]*)\}', body):
    b=row.group(1); gm=re.search(r'\bgas\s+(\w+)', b)
    if not gm: continue
    gas=gm.group(1); seen.add(gas); f=gdir/f"{gas}.dat"
    if not f.exists(): fails.append(f"MISSING {gas}.dat"); continue
    txt=f.read_text()
    for k in ("logK25","dH","Tc","Pc","Omega"):
        sv=tok(b,k)
        if sv is None: continue
        fv=tok(txt,k)
        if fv is None or abs(float(fv)-float(sv))>1e-12+1e-12*abs(float(sv)):
            fails.append(f"{gas}.{k}: file={fv} src={sv}")
orph={p.stem for p in gdir.glob('*.dat') if 'recordType gasLiquidEquilibrium;' in p.read_text()}-seen
if orph: fails.append(f"ORPHAN {sorted(orph)}")
print(f"checked {len(seen)} gases vs gases.dat")
if fails:
    for x in fails[:20]: print("  FAIL",x); sys.exit(1)
print("all gasLiquid faithful + 1:1 bijection.")
