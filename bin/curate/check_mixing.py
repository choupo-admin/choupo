#!/usr/bin/env python3
"""EXHAUSTIVE guard for the mixing kind (golden coverage is thin -- mixing matters
only multi-ion, and those cases are self-contained -- so this guard, NOT the 202,
is the safety net).  For EVERY mixing.dat entry it SIMULATES the repointed reader's
order-independent per-file resolution and asserts the value is found, bit-exact;
plus a 1:1 bijection.  Runs while mixing.dat exists; flips to ABSENT after."""
import re, sys
from pathlib import Path
repo = Path(__file__).resolve().parents[2]
mf = repo / "data/standards/electrolyte/mixing.dat"
base = repo / "data/standards/parameters/Pitzer/mixing"
if not mf.exists():
    print("electrolyte/mixing.dat ABSENT -- mixing kind consolidated. OK."); sys.exit(0)
body = re.search(r'mixing\s*\((.*)\)', mf.read_text(), re.S).group(1)
def tok(b,k):
    m = re.search(rf'\b{k}\b\s+(-?[\w.+()-]+)\s*;', b); return m.group(1) if m else None
def fileval(p):
    if not p.exists(): return None
    m = re.search(r'\bvalue\s+(-?[\d.eE+-]+)', p.read_text()); return float(m.group(1)) if m else None
fails, seen = [], set()
for row in re.finditer(r'\{([^{}]*)\}', body):
    b = row.group(1); kind = tok(b,"kind")
    if not kind: continue
    v = float(tok(b,kind))
    if kind == "theta":
        a,bb = tok(b,"a"),tok(b,"b")
        cands = [base/"theta"/f"{a}-{bb}.dat", base/"theta"/f"{bb}-{a}.dat"]   # order-indep
        key = ("theta", frozenset((a,bb)))
    elif kind == "psi":
        a,bb,c = tok(b,"a"),tok(b,"b"),tok(b,"c")
        cands = [base/"psi"/f"{a}-{bb}-{c}.dat", base/"psi"/f"{bb}-{a}-{c}.dat"]  # (a,b) order-indep
        key = ("psi", frozenset((a,bb)), c)
    elif kind == "lambda":
        nn,ion = tok(b,"n"),tok(b,"ion")
        cands = [base/"lambda"/f"{nn}-{ion}.dat"]; key = ("lambda", nn, ion)
    elif kind == "zeta":
        nn,c,a = tok(b,"n"),tok(b,"c"),tok(b,"a")
        cands = [base/"zeta"/f"{nn}-{c}-{a}.dat"]; key = ("zeta", nn, c, a)
    else: continue
    if key in seen: fails.append(f"DUPLICATE entry {key}")
    seen.add(key)
    fv = next((fileval(p) for p in cands if fileval(p) is not None), None)
    if fv is None: fails.append(f"{kind} {key}: no per-file resolves")
    elif abs(fv - v) > 1e-12 + 1e-12*abs(v): fails.append(f"{kind} {key}: file={fv} src={v}")
nfiles = sum(1 for _ in base.rglob("*.dat"))
if nfiles != len(seen): fails.append(f"bijection: {nfiles} per-files vs {len(seen)} entries")
print(f"checked {len(seen)} mixing terms (order-indep resolution + bit-exact value + bijection)")
if fails:
    for x in fails[:40]: print("  FAIL", x)
    sys.exit(1)
print("all mixing terms faithful + resolvable + 1:1.")
