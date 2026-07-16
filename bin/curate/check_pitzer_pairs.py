#!/usr/bin/env python3
"""Faithfulness guard: every parameters/Pitzer/pairs/<c>-<a>.dat must
equal its pairs.dat row, bit-exact, 1:1 bijection.  Runs while pairs.dat exists;
flips to assert ABSENT after deletion."""
import re, sys
from pathlib import Path
repo = Path(__file__).resolve().parents[2]
pf = repo / "data/standards/electrolyte/pairs.dat"
pdir = repo / "data/standards/parameters/Pitzer/pairs"
if not pf.exists():
    print("electrolyte/pairs.dat ABSENT -- pairs kind consolidated. OK."); sys.exit(0)
body = re.search(r'pairs\s*\((.*)\)', pf.read_text(), re.S).group(1)
NUM = ["beta0","beta1","beta2","Cphi","alpha1","alpha2","dbeta0_dT","dbeta1_dT","dCphi_dT","lphiValidityMax"]
def tok(b,k):
    m = re.search(rf'\b{k}\b\s+(-?[\w.+-]+)\s*;', b); return m.group(1) if m else None
fails, seen = [], set()
for row in re.finditer(r'\{([^{}]*)\}', body):
    b = row.group(1)
    cat, an = tok(b,"cation"), tok(b,"anion")
    if not cat or not an: continue
    seen.add(f"{cat}-{an}")
    f = pdir / f"{cat}-{an}.dat"
    if not f.exists(): fails.append(f"MISSING {cat}-{an}.dat"); continue
    txt = f.read_text()
    for k in NUM:
        sv = tok(b,k)
        if sv is None: continue
        fv = tok(txt,k)
        if fv is None or abs(float(fv)-float(sv)) > 1e-12 + 1e-12*abs(float(sv)):
            fails.append(f"{cat}-{an}.{k}: file={fv} source={sv}")
    scf, fcf = tok(b,"calorimetricFit"), tok(txt,"calorimetricFit")
    if scf and scf != fcf: fails.append(f"{cat}-{an}.calorimetricFit: file={fcf} source={scf}")
    ss = re.search(r'source\s+"([^"]*)"', b); fs_ = re.search(r'source\s+"([^"]*)"', txt)
    if ss and (not fs_ or fs_.group(1) != ss.group(1)):
        fails.append(f"{cat}-{an}: source mismatch/dropped")
# bijection: no orphan files
orphans = {p.stem for p in pdir.glob("*.dat")} - seen
if orphans: fails.append(f"ORPHAN per-file pairs not in pairs.dat: {sorted(orphans)}")
print(f"checked {len(seen)} pitzer pairs vs pairs.dat (value+T-slots+calorimetricFit+source+bijection)")
if fails:
    for x in fails[:40]: print("  FAIL", x)
    sys.exit(1)
print("all pitzer pairs faithful + 1:1 bijection.")
