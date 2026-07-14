#!/usr/bin/env python3
"""Faithfulness guard for the mineralSolubility kind (golden coverage THIN -- 14
case-local minerals.dat eclipse the standard).  Bit-exact logK25/dH/nuWater +
masters present + 1:1 bijection.  Flips to ABSENT after delete."""
import re, sys
from pathlib import Path
repo = Path(__file__).resolve().parents[2]
mf = repo / "data/standards/electrolyte/minerals.dat"
mdir = repo / "data/standards/chemistry/mineralSolubility"
if not mf.exists():
    print("electrolyte/minerals.dat ABSENT -- mineralSolubility consolidated. OK."); sys.exit(0)
body = re.search(r'minerals\s*\((.*)\)', mf.read_text(), re.S).group(1)
def recs(s):
    out=[]; i=0
    while True:
        j=s.find("{",i)
        if j<0: break
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
fails, seen = [], set()
for rec in recs(body):
    mm=re.search(r'\bmineral\s+(\w+)', rec)
    if not mm: continue
    mn=mm.group(1); seen.add(mn); f=mdir/f"{mn}.dat"
    if not f.exists(): fails.append(f"MISSING {mn}.dat"); continue
    txt=f.read_text()
    for k in ("logK25","dH","nuWater"):
        sv=tok(rec,k)
        if sv is None: continue
        fv=tok(txt,k)
        if fv is None or abs(float(fv)-float(sv))>1e-12+1e-12*abs(float(sv)):
            fails.append(f"{mn}.{k}: file={fv} src={sv}")
    if "masters" in rec and "masters" not in txt: fails.append(f"{mn}: masters dropped")
orph={p.stem for p in mdir.glob('*.dat')}-seen
if orph: fails.append(f"ORPHAN {sorted(orph)}")
print(f"checked {len(seen)} minerals vs minerals.dat")
if fails:
    for x in fails[:30]: print("  FAIL",x); sys.exit(1)
print("all mineralSolubility faithful + 1:1 bijection.")
