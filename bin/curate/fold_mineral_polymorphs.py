#!/usr/bin/env python3
"""
fold_mineral_polymorphs.py -- roadmap Phase D, batch 2 (FOLD-CASES).

A mineral whose formula matches an existing component is a polymorph/salt of that
component (calcite/aragonite -> CaCO3, quartz/chalcedony/SiO2a -> silica,
sylvite -> KCl, ...).  It must fold into the PARENT component's solidPhases -- a
polymorph is not a second competing record.

This reads each such mineralSolubility/<name>.dat, appends a solidPhases.<name>
block (dissolutionReaction + equilibrium, values preserved verbatim) to the parent
component .dat, and removes the mineralSolubility file.

Usage:  python3 bin/curate/fold_mineral_polymorphs.py [--emit]
"""
import re, os, sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
COMP = os.path.join(REPO, "data/standards/components")
MIN  = os.path.join(REPO, "data/standards/chemistry/mineralSolubility")

# mineral -> parent component filename (from the migration dry-run's fold list)
FOLD = {
    "SiO2a": "silica.dat", "chalcedony": "silica.dat", "quartz": "silica.dat",
    "anhydrite": "CaSO4.dat",
    "aragonite": "CaCO3.dat", "calcite": "CaCO3.dat",
    "arcanite": "K2SO4.dat",
    "brucite": "magnesiumHydroxide.dat",
    "nahcolite": "NaHCO3.dat",
    "portlandite": "calciumHydroxide.dat",
    "salammoniac": "NH4Cl.dat",
    "sylvite": "KCl.dat",
    "thenardite": "Na2SO4.dat",
}

def parse_mineral(txt):
    d = {}
    d["masters"] = re.search(r'masters\s*\(([^)]*)\)', txt).group(1).strip()
    nw = re.search(r'\bnuWater\s+(-?[0-9.]+)', txt); d["nuWater"] = nw.group(1) if nw else None
    d["logK25"] = re.search(r'\blogK25\s+(-?[0-9.eE+]+)', txt).group(1)
    dh = re.search(r'\bdH\s+(-?[0-9.eE+]+)', txt); d["dH"] = dh.group(1) if dh else None
    an = re.search(r'analytic\s*\(([^)]*)\)', txt); d["analytic"] = an.group(1).strip() if an else None
    vc = re.search(r'validC\s*\(([^)]*)\)', txt); d["validC"] = vc.group(1).strip() if vc else None
    sm = re.search(r'\bsource\s+"([^"]*)"', txt); d["source"] = sm.group(1) if sm else ""
    return d

def phase_block(name, d):
    rxn = f'masters ( {d["masters"]} );'
    if d["nuWater"]: rxn += f' nuWater {d["nuWater"]};'
    eq = f'logK25 {d["logK25"]};'
    if d["dH"]: eq += f' dH {d["dH"]};'
    if d["analytic"]: eq += f' analytic ( {d["analytic"]} );'
    if d["validC"]: eq += f' validC ( {d["validC"]} );'
    if d["source"]: eq += f' source "{d["source"]}";'
    return (f"    {name}\n    {{\n"
            f"        dissolutionReaction {{ {rxn} }}\n"
            f"        equilibrium {{ {eq} }}\n    }}\n")

def main():
    emit = "--emit" in sys.argv
    # group by parent
    byparent = {}
    for m, parent in FOLD.items():
        f = os.path.join(MIN, m + ".dat")
        if not os.path.exists(f):
            print(f"  (missing mineralSolubility/{m}.dat -- skip)"); continue
        byparent.setdefault(parent, []).append((m, parse_mineral(open(f).read())))
    for parent, phases in sorted(byparent.items()):
        pf = os.path.join(COMP, parent)
        if not os.path.exists(pf):
            print(f"  !! parent {parent} MISSING -- cannot fold {[p[0] for p in phases]}"); continue
        block = "\n// Solid phase(s) of this component (roadmap Phase D fold-in):\n"
        block += "solidPhases\n{\n"
        for name, d in phases: block += phase_block(name, d)
        block += "}\n"
        names = ", ".join(p[0] for p in phases)
        print(f"  fold -> {parent}: {names}")
        if emit:
            with open(pf, "a") as fh: fh.write(block)
            for name, _ in phases: os.remove(os.path.join(MIN, name + ".dat"))

if __name__ == "__main__":
    main()
