#!/usr/bin/env python3
"""Migration-time guard (runs while electrolyte/ions.dat still exists): every
data/standards/components/true/aqueous/<ion>.dat must equal its ions.dat source row
(value-faithful) AND carry a non-empty `source` whenever the ions.dat row had
provenance (// or [...]).  A drift is the arity-1 sin; a dropped source is a
CLAUDE.md S10 (cite-primary) loss.  Exits 1 on any mismatch / missing ion /
dropped provenance."""
import re, sys
from pathlib import Path
repo = Path(__file__).resolve().parents[2]
ions = repo / "data/standards/electrolyte/ions.dat"
if not ions.exists():
    print("electrolyte/ions.dat is ABSENT -- ion kind consolidated (single store). OK.")
    sys.exit(0)
src = ions.read_text()
iondir = repo / "data/standards/components/true/aqueous"
def sval(body, key):
    m = re.search(rf'\b{key}\b\s+(-?[\d.eE+]+)\s*;', body); return m.group(1) if m else None
def fval(txt, key):
    m = re.search(rf'\b{key}\b\s*\{{[^}}]*?value\s+(-?[\d.eE+]+)', txt, re.S)
    if m: return m.group(1)
    m = re.search(rf'\b{key}\b\s+(-?[\d.eE+]+)\s*;', txt); return m.group(1) if m else None
fails, n = [], 0
for m in re.finditer(r'\{([^{}]*)\}\s*(?://\s*([^\n]*)|\[([^\]]*)\])?', src):
    body = m.group(1); prov = (m.group(2) or m.group(3) or "").strip()
    sp = re.search(r'\bspecies\s+(\w+)\s*;', body)
    if not sp: continue
    species = sp.group(1)
    if species == "ions": continue
    f = iondir / f"{species}.dat"
    if not f.exists(): fails.append(f"MISSING true/aqueous/{species}.dat"); continue
    txt = f.read_text(); n += 1
    for k, fk in [("z","charge"),("MW","MW"),("hfAq","hfAq"),("sAq","sAq"),
                  ("cpAq","cpAq"),("radius","radius"),("D0","D0")]:
        sv = sval(body, k)
        if sv is None: continue
        fv = fval(txt, fk)
        if fv is None or abs(float(fv)-float(sv)) > 1e-9 + 1e-9*abs(float(sv)):
            fails.append(f"{species}.{fk}: file={fv} source={sv}")
    if prov and not re.search(r'(?m)^\s*source\s+"', txt):
        fails.append(f"{species}: ions.dat had provenance but true/aqueous file has NO source line")
print(f"checked {n} true ions vs ions.dat (value + provenance)")
if fails:
    for x in fails[:40]: print("  FAIL", x)
    sys.exit(1)
print("all true/aqueous faithful + provenance-complete.")
