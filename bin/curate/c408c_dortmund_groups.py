#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Write the `unifacDortmund` group assignments into the component records.

    bin/curate/c408c_dortmund_groups.py            # apply (idempotent)
    bin/curate/c408c_dortmund_groups.py --check    # verify only, exit 1 on any defect

DEV.md 4c C408 (c).  The Dortmund subgroups are NOT the original UNIFAC's
(OH is split into OH_p/OH_s/OH_t, ring carbons are c-CH2/c-CH/c-C, ...), so a
component carries its own `groups { unifacDortmund ( ... ) }` block, and the
original `unifac` block is never reused.  This is the ONE home of the
assignments entered so far: each is either a molecule whose decomposition
Gmehling, Li & Schiller, Ind. Eng. Chem. Res. 32 (1993) 178, Table III
(pp. 182-183) PRINTS in its "sample group assignment" column (marked P), or a
molecule that follows the same pattern from a printed sample (marked S, the
sample it follows named).  Every assignment is checked to reproduce the
record's own molecular formula from the subgroup atom counts (the guard
against a wrong-but-plausible decomposition), and every group name must exist
in data/standards/parameters/UNIFACDortmund/groups.dat.
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
COMP = os.path.join(ROOT, "data/standards/components")
GROUPS = os.path.join(ROOT, "data/standards/parameters/UNIFACDortmund/groups.dat")

ATOMS = {
    "CH3": "C1H3", "CH2": "C1H2", "CH": "C1H1", "C": "C1",
    "CH2=CH": "C2H3", "OH_p": "O1H1", "OH_s": "O1H1", "OH_t": "O1H1",
    "CH3OH": "C1H4O1", "H2O": "H2O1", "ACH": "C1H1", "AC": "C1",
    "ACCH3": "C2H3", "ACCH2": "C2H2", "ACCH": "C2H1", "ACOH": "C1O1H1",
    "CH3CO": "C2H3O1", "CH3COO": "C2H3O2", "CH3O": "C1H3O1", "CH2O": "C1H2O1",
    "COOH": "C1H1O2", "DOH": "C2H6O2", "CHCl3": "C1H1Cl3", "CCl4": "C1Cl4",
    "CH2Cl2": "C1H2Cl2", "c-CH2": "C1H2", "c-CH": "C1H1", "c-CH2OCH2": "C2H4O1",
    "DMSO": "C2H6O1S1", "C5H5N": "C5H5N1",
}

# name: (basis, [(group, count), ...])   basis: P = printed sample, S = follows <sample>
SPEC = {
    "water": ("P water", [("H2O", 1)]),
    "methanol": ("P methanol", [("CH3OH", 1)]),
    "ethanol": ("S 1-propanol", [("CH3", 1), ("CH2", 1), ("OH_p", 1)]),
    "1Propanol": ("P 1-propanol", [("CH3", 1), ("CH2", 2), ("OH_p", 1)]),
    "isopropanol": ("P 2-propanol", [("CH3", 2), ("CH", 1), ("OH_s", 1)]),
    "nButanol": ("S 1-propanol", [("CH3", 1), ("CH2", 3), ("OH_p", 1)]),
    "2Methyl1Propanol": ("S 1-propanol, 2-methylpropane", [("CH3", 2), ("CH", 1), ("CH2", 1), ("OH_p", 1)]),
    "2Butanol": ("S 2-propanol", [("CH3", 2), ("CH2", 1), ("CH", 1), ("OH_s", 1)]),
    "2Methyl2Propanol": ("P tert-butanol", [("CH3", 3), ("C", 1), ("OH_t", 1)]),
    "1Pentanol": ("S 1-propanol", [("CH3", 1), ("CH2", 4), ("OH_p", 1)]),
    "1Hexanol": ("S 1-propanol", [("CH3", 1), ("CH2", 5), ("OH_p", 1)]),
    "nPentane": ("S hexane", [("CH3", 2), ("CH2", 3)]),
    "nHexane": ("P hexane", [("CH3", 2), ("CH2", 4)]),
    "nHeptane": ("S hexane", [("CH3", 2), ("CH2", 5)]),
    "nOctane": ("P octane", [("CH3", 2), ("CH2", 6)]),
    "nNonane": ("S octane", [("CH3", 2), ("CH2", 7)]),
    "nDecane": ("S octane", [("CH3", 2), ("CH2", 8)]),
    "cyclopentane": ("S cyclohexane", [("c-CH2", 5)]),
    "cyclohexane": ("P cyclohexane", [("c-CH2", 6)]),
    "methylcyclohexane": ("P methylcyclohexane", [("CH3", 1), ("c-CH2", 5), ("c-CH", 1)]),
    "benzene": ("S naphthalene/toluene", [("ACH", 6)]),
    "toluene": ("P toluene", [("ACH", 5), ("ACCH3", 1)]),
    "ethylBenzene": ("P ethylbenzene", [("CH3", 1), ("ACH", 5), ("ACCH2", 1)]),
    "oXylene": ("S toluene", [("ACH", 4), ("ACCH3", 2)]),
    "mXylene": ("S toluene", [("ACH", 4), ("ACCH3", 2)]),
    "pXylene": ("S toluene", [("ACH", 4), ("ACCH3", 2)]),
    "phenol": ("P phenol", [("ACH", 5), ("ACOH", 1)]),
    "acetone": ("S 2-butanone", [("CH3", 1), ("CH3CO", 1)]),
    "methylEthylKetone": ("P 2-butanone", [("CH3", 1), ("CH2", 1), ("CH3CO", 1)]),
    "methylAcetate": ("S butyl acetate", [("CH3", 1), ("CH3COO", 1)]),
    "ethylAcetate": ("S butyl acetate", [("CH3", 1), ("CH2", 1), ("CH3COO", 1)]),
    "nButylAcetate": ("P butyl acetate", [("CH3", 1), ("CH2", 3), ("CH3COO", 1)]),
    "diethylEther": ("P diethyl ether", [("CH3", 2), ("CH2", 1), ("CH2O", 1)]),
    "methylTertButylEther": ("S dimethyl ether, neopentane", [("CH3", 3), ("C", 1), ("CH3O", 1)]),
    "aceticAcid": ("P acetic acid", [("CH3", 1), ("COOH", 1)]),
    "ethyleneGlycol": ("P 1,2-ethanediol", [("DOH", 1)]),
    "chloroform": ("P chloroform", [("CHCl3", 1)]),
    "carbonTetrachloride": ("P tetrachloromethane", [("CCl4", 1)]),
    "dichloromethane": ("P dichloromethane", [("CH2Cl2", 1)]),
    "tetrahydrofuran": ("P tetrahydrofuran", [("c-CH2", 2), ("c-CH2OCH2", 1)]),
    "dimethylSulfoxide": ("P dimethyl sulfoxide", [("DMSO", 1)]),
    "pyridine": ("P pyridine", [("C5H5N", 1)]),
    "1Hexene": ("P 1-hexene", [("CH3", 1), ("CH2", 3), ("CH2=CH", 1)]),
    "1Butene": ("S 1-hexene", [("CH3", 1), ("CH2", 1), ("CH2=CH", 1)]),
}


def atoms(s):
    out = {}
    for el, n in re.findall(r"([A-Z][a-z]?)(\d*)", s):
        out[el] = out.get(el, 0) + (int(n) if n else 1)
    return out


def vocabulary():
    txt = open(GROUPS).read()
    return set(re.findall(r"\{ name (\S+); number", txt))


def block(groups):
    return "unifacDortmund ( " + " ".join(
        "{ group %s; count %d; }" % (g, n) for g, n in groups) + " );"


def main():
    check = "--check" in sys.argv
    vocab = vocabulary()
    bad = 0
    for name, (basis, groups) in SPEC.items():
        path = os.path.join(COMP, name + ".dat")
        if not os.path.exists(path):
            print("MISSING component record", name); bad += 1; continue
        txt = open(path).read()
        m = re.search(r"^formula\s+(\S+?);", txt, re.M)
        want = atoms(m.group(1))
        have = {}
        for g, n in groups:
            if g not in vocab:
                print("%s: group %s is not in the Dortmund vocabulary" % (name, g)); bad += 1
            for el, k in atoms(ATOMS[g]).items():
                have[el] = have.get(el, 0) + k * n
        if have != want:
            print("%s: groups give %s, the record's formula %s" % (name, have, want)); bad += 1
            continue
        line = block(groups)
        if "unifacDortmund" in txt:
            cur = re.search(r"unifacDortmund \(.*?\);", txt, re.S).group(0)
            if cur != line:
                print("%s: record carries a different block" % name); bad += 1
            continue
        if check:
            print("%s: no unifacDortmund block yet" % name); bad += 1; continue
        mm = re.search(r"(unifac \([^;]*?(?:\{[^}]*\}\s*)+\);[^\n]*\n)", txt)
        if not mm:
            # no original `unifac` block (a ChemSep import that carries no
            # decomposition): a `groups {}` block of its own, at the end.
            if re.search(r"^groups\b", txt, re.M):
                print("%s: has a groups block without a unifac entry -- edit by hand" % name); bad += 1; continue
            txt = txt.rstrip("\n") + "\n\ngroups\n{\n    " + line + "   // C408 (c): " + basis + ", Table III p. 182-183\n}\n"
            open(path, "w").write(txt)
            print("wrote", name, "(new groups block)")
            continue
        # same indentation as the unifac line
        ls = txt.rfind("\n", 0, mm.start()) + 1
        indent = re.match(r"\s*", txt[ls:mm.start()]).group(0)
        if txt[ls:mm.start()].strip():     # inline `groups { unifac (...); ...`
            ins = mm.group(1).rstrip("\n") if False else None
            # put the new block on its own line right after the unifac entry
            new = mm.group(1) + "    " + line + "   // C408 (c): " + basis + ", Table III p. 182-183\n"
            txt = txt[:mm.start()] + new + txt[mm.end():]
        else:
            new = mm.group(1) + indent + line + "   // C408 (c): " + basis + ", Table III p. 182-183\n"
            txt = txt[:mm.start()] + new + txt[mm.end():]
        open(path, "w").write(txt)
        print("wrote", name)
    if bad:
        print("c408c_dortmund_groups: %d defect(s)" % bad)
        sys.exit(1)
    print("c408c_dortmund_groups: OK -- %d assignments, every one reproduces its record's formula" % len(SPEC))


if __name__ == "__main__":
    main()
