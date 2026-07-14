#!/usr/bin/env python3
"""
migrate_minerals_to_components.py -- roadmap Phase D, batch 1 (PURE minerals).

Convert each data/standards/chemistry/mineralSolubility/<name>.dat (the flat
`mineral; formula; masters; nuWater; logK25; dH; analytic; source` form) into the
UNIFIED substance file data/standards/components/<name>.dat carrying a
`solidPhases { <name> { dissolutionReaction; equilibrium } }` block.

VALUES ARE PRESERVED VERBATIM -- this is a format conversion of already-curated
records, not a re-derivation.

FOLD-CASES ARE SKIPPED (handled by hand in a later batch): a mineral whose formula
matches an EXISTING component is a polymorph/salt of that component (calcite/
aragonite -> CaCO3, quartz/chalcedony/SiO2a -> silica, sylvite -> KCl) and must
fold into that component's solidPhases, not become a second competing record.

Usage:  python3 bin/curate/migrate_minerals_to_components.py [--emit]
Without --emit it is a dry run (reports migrate vs fold-skip).
"""
import re, os, sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
COMP = os.path.join(REPO, "data/standards/components")
MIN  = os.path.join(REPO, "data/standards/chemistry/mineralSolubility")

def norm_formula(f):
    return f.strip().strip('"').replace(" ", "")

def component_formulas():
    """map normalised formula -> component filename (for fold-case detection)."""
    out = {}
    for fn in os.listdir(COMP):
        if not fn.endswith(".dat"): continue
        txt = open(os.path.join(COMP, fn)).read()
        m = re.search(r'\bformula\s+"?([^";\n]+)"?\s*;', txt)
        if m: out[norm_formula(m.group(1))] = fn
    return out

def parse_mineral(txt):
    d = {}
    d["mineral"] = re.search(r'\bmineral\s+(\w+)', txt).group(1)
    fm = re.search(r'\bformula\s+"([^"]+)"', txt)
    d["formula"] = fm.group(1) if fm else ""
    d["masters"] = re.search(r'masters\s*\(([^)]*)\)', txt).group(1).strip()
    nw = re.search(r'\bnuWater\s+(-?[0-9.]+)', txt)
    d["nuWater"] = nw.group(1) if nw else None
    d["logK25"] = re.search(r'\blogK25\s+(-?[0-9.eE+]+)', txt).group(1)
    dh = re.search(r'\bdH\s+(-?[0-9.eE+]+)', txt)
    d["dH"] = dh.group(1) if dh else None
    an = re.search(r'analytic\s*\(([^)]*)\)', txt)
    d["analytic"] = an.group(1).strip() if an else None
    vc = re.search(r'validC\s*\(([^)]*)\)', txt)
    d["validC"] = vc.group(1).strip() if vc else None
    sm = re.search(r'\bsource\s+"([^"]*)"', txt)
    d["source"] = sm.group(1) if sm else ""
    return d

def emit(d):
    rxn = f'masters ( {d["masters"]} );'
    if d["nuWater"]: rxn += f' nuWater {d["nuWater"]};'
    eq = f'logK25 {d["logK25"]};'
    if d["dH"]: eq += f' dH {d["dH"]};'
    if d["analytic"]: eq += f' analytic ( {d["analytic"]} );'
    if d["validC"]: eq += f' validC ( {d["validC"]} );'
    if d["source"]: eq += f' source "{d["source"]}";'
    return (
        "/*--------------------------------*- Choupo -*-----------------------*\\\n"
        f"  Mineral: {d['mineral']} ({d['formula']}) -- unified substance file.\n"
        "  One canonical record per chemical identity; the solid-phase dissolution\n"
        "  equilibrium (Ksp) lives here as a typed solidPhase (roadmap Phase D).\n"
        "  Migrated from chemistry/mineralSolubility/ with values preserved verbatim.\n"
        "\\*---------------------------------------------------------------------------*/\n"
        f"name {d['mineral']};\n"
        f'formula "{d["formula"]}";\n\n'
        "solidPhases\n{\n"
        f"    {d['mineral']}\n    {{\n"
        f"        dissolutionReaction {{ {rxn} }}\n"
        f"        equilibrium {{ {eq} }}\n"
        "    }\n}\n")

def main():
    emit_flag = "--emit" in sys.argv
    comp_forms = component_formulas()
    migrate, fold = [], []
    for fn in sorted(os.listdir(MIN)):
        if not fn.endswith(".dat"): continue
        d = parse_mineral(open(os.path.join(MIN, fn)).read())
        nf = norm_formula(d["formula"])
        if nf in comp_forms:
            fold.append((d["mineral"], d["formula"], comp_forms[nf]))
            continue
        migrate.append(d)
        if emit_flag:
            open(os.path.join(COMP, d["mineral"] + ".dat"), "w").write(emit(d))
            os.remove(os.path.join(MIN, fn))
    print(f"{'MIGRATED' if emit_flag else 'would migrate'} {len(migrate)} pure minerals -> components/")
    print(f"FOLD-CASES skipped ({len(fold)}) -- handle by hand into the parent component:")
    for nm, f, parent in fold:
        print(f"    {nm:16s} {f:16s} -> {parent}")

if __name__ == "__main__":
    main()
