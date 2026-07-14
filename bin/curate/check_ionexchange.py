#!/usr/bin/env python3
"""Guard for the ionExchange kind: bit-exact logK25 + reference flag + masters
present + 1:1 bijection.  Flips to ABSENT after delete."""
import re, sys
from pathlib import Path
repo = Path(__file__).resolve().parents[2]
ef = repo / "data/standards/electrolyte/exchange.dat"
edir = repo / "data/standards/chemistry/ionExchange"
if not ef.exists():
    print("electrolyte/exchange.dat ABSENT -- ionExchange consolidated. OK."); sys.exit(0)
body = re.search(r'exchange\s*\((.*)\)', ef.read_text(), re.S).group(1)
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
    sp=sm.group(1); seen.add(sp); f=edir/f"{sp}.dat"
    if not f.exists(): fails.append(f"MISSING {sp}.dat"); continue
    txt=f.read_text()
    sv,fv=tok(rec,"logK25"),tok(txt,"logK25")
    if sv is not None and (fv is None or abs(float(fv)-float(sv))>1e-12+1e-12*abs(float(sv))):
        fails.append(f"{sp}.logK25: file={fv} src={sv}")
    if ("reference true" in rec) != ("reference true" in txt): fails.append(f"{sp}: reference flag mismatch")
    if "masters" in rec and "masters" not in txt: fails.append(f"{sp}: masters dropped")
orph={p.stem for p in edir.glob('*.dat')}-seen
if orph: fails.append(f"ORPHAN {sorted(orph)}")
print(f"checked {len(seen)} ionExchange species vs exchange.dat")
if fails:
    for x in fails[:20]: print("  FAIL",x); sys.exit(1)
print("all ionExchange faithful + reference + 1:1 bijection.")
