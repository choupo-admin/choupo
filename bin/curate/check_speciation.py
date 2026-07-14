#!/usr/bin/env python3
"""Guard for the aqueousSpeciation kind (cross-name chains -> bit-exact mandatory).
logK25/z/dH bit-exact + masters present + 1:1 bijection. Flips to ABSENT after."""
import re, sys
from pathlib import Path
repo = Path(__file__).resolve().parents[2]
sf = repo / "data/standards/electrolyte/speciation.dat"
sdir = repo / "data/standards/chemistry/aqueousSpeciation"
if not sf.exists():
    print("electrolyte/speciation.dat ABSENT -- aqueousSpeciation consolidated. OK."); sys.exit(0)
body = re.search(r'reactions\s*\((.*)\)', sf.read_text(), re.S).group(1)
def recs(s):
    out=[];i=0
    while True:
        j=s.find("{",i)
        if j<0:break
        depth=0;k=j
        while k<len(s):
            if s[k]=="{":depth+=1
            elif s[k]=="}":
                depth-=1
                if depth==0:break
            k+=1
        out.append(s[j+1:k]);i=k+1
    return out
def tok(b,k): m=re.search(rf'\b{k}\b\s+(-?[\d.eE+-]+)\s*;',b); return m.group(1) if m else None
fails, seen=[],set()
for rec in recs(body):
    sm=re.search(r'\bspecies\s+(\w+)',rec)
    if not sm: continue
    sp=sm.group(1); seen.add(sp); f=sdir/f"{sp}.dat"
    if not f.exists(): fails.append(f"MISSING {sp}.dat"); continue
    txt=f.read_text()
    for k in ("logK25","z","dH","nuWater"):
        sv=tok(rec,k)
        if sv is None: continue
        fv=tok(txt,k)
        if fv is None or abs(float(fv)-float(sv))>1e-12+1e-12*abs(float(sv)):
            fails.append(f"{sp}.{k}: file={fv} src={sv}")
    if "masters" in rec and "masters" not in txt: fails.append(f"{sp}: masters dropped")
orph={p.stem for p in sdir.glob('*.dat')}-seen
if orph: fails.append(f"ORPHAN {sorted(orph)}")
print(f"checked {len(seen)} speciation reactions vs speciation.dat")
if fails:
    for x in fails[:30]: print("  FAIL",x); sys.exit(1)
print("all aqueousSpeciation faithful + 1:1 bijection.")
