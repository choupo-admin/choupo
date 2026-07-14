#!/usr/bin/env python3
"""
import_solid_thermochemistry.py -- add solid-phase thermochemistry (Hf298, S298,
Cp298) to minerals from the CHNOSZ OBIGT compilation (open, GPL-as-data), which
digitised the primary literature with a per-species citation (ref1) -- Robie &
Hemingway 1995 (USGS Bulletin 2131, in Literature/report.pdf), Helgeson 1978,
Wagman 1982, etc.

Only the minerals OBIGT `inorganic_cr.csv` covers with real (non-NA) H are enriched
(the Berman-model species -- calcite/quartz/brucite/dolomite -- carry NA in the
standard columns and are left for a later, harder pass).  Values are converted
cal -> J.  Cp298 is evaluated from the Maier-Kelley coefficients (a + b.T + c/T^2).

Source csv: bin/curate/refs/obigt_inorganic_cr.csv (fetched from CHNOSZ, public).
Usage:  python3 bin/curate/import_solid_thermochemistry.py [--emit]
"""
import csv, os, re, sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
COMP = os.path.join(REPO, "data/standards/components")
CSV  = os.path.join(os.path.dirname(os.path.abspath(__file__)), "refs", "obigt_inorganic_cr.csv")
CAL  = 4.184
T    = 298.15

REFMAP = {
    "RH95":  "Robie & Hemingway 1995, USGS Bulletin 2131 (public domain; Literature/report.pdf)",
    "HDNB78":"Helgeson, Delany, Nesbitt & Bird 1978, Am. J. Sci. 278-A",
    "WEP+82":"Wagman et al. 1982, NBS Tables of Chemical Thermodynamic Properties",
    "Kel60": "Kelley 1960, USBM Bulletin 584",
    "GM09":  "Grevel & Majzlan 2009, Geochim. Cosmochim. Acta 73",
    "PK95":  "Parkhurst 1995 (USGS PHREEQC compilation)",
    "RA87":  "Robie & Hemingway (celestite), USGS 1987 compilation",
    "WEP+82.1":"Wagman et al. 1982, NBS Tables",
}
def cite(code):
    return REFMAP.get(code, code) + " -- via CHNOSZ OBIGT (open compilation)"

def load_obigt():
    m = {}
    with open(CSV) as f:
        for r in csv.DictReader(f):
            if r["state"] != "cr" or r["H"] in ("NA", ""): continue
            form = r["formula"].replace("*", ":").replace(" ", "")
            m[form] = r
    return m

def cp298(r):
    a = float(r.get("a1.a") or 0); b = float(r.get("a2.b") or 0); c = float(r.get("a3.c") or 0)
    return (a + b * T + (c / (T * T) if c else 0.0)) * CAL

def block(r):
    hf = float(r["H"]) * CAL
    s  = float(r["S"]) * CAL if r["S"] not in ("NA", "") else None
    cp = cp298(r)
    lines = [f'        thermochemistry',
             f'        {{',
             f'            Hf298 {hf:.6g};   // J/mol   (formation enthalpy of the solid)',
             f'            S298  {s:.6g};   // J/(mol.K)' if s is not None else None,
             f'            Cp298 {cp:.6g};   // J/(mol.K) at 298.15 K (Maier-Kelley a+bT+c/T^2)',
             f'            source "{cite(r["ref1"])}";',
             f'        }}']
    return "\n".join(l for l in lines if l is not None) + "\n"

def main():
    emit = "--emit" in sys.argv
    obigt = load_obigt()
    n = 0
    for fn in sorted(os.listdir(COMP)):
        if not fn.endswith(".dat"): continue
        path = os.path.join(COMP, fn)
        txt = open(path).read()
        if "solidPhases" not in txt: continue
        fm = re.search(r'formula\s+"([^"]+)"', txt)
        if not fm: continue
        form = fm.group(1).replace("*", ":").replace(" ", "")
        r = obigt.get(form)
        if not r: continue
        if "thermochemistry" in txt:  # idempotent
            continue
        # insert the thermochemistry block right after the phase's equilibrium{...} line
        m = re.search(r'(equilibrium\s*\{[^\n]*\}\s*\n)', txt)
        if not m:
            print(f"  ! {fn}: no equilibrium line to anchor -- skip"); continue
        newtxt = txt[:m.end()] + block(r) + txt[m.end():]
        print(f"  {'WROTE' if emit else 'would add'} {fn[:-4]:16s} Hf={float(r['H'])*CAL:.0f} J  S={r['S']}  ref={r['ref1']}")
        if emit: open(path, "w").write(newtxt)
        n += 1
    print(f"\n{'ENRICHED' if emit else 'WOULD ENRICH'} {n} minerals with solid thermochemistry.")

if __name__ == "__main__":
    main()
