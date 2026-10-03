#!/usr/bin/env python3
"""Re-compute the REFERENCE molar enthalpy of normal hydrogen that the
`standard-state` EduTool draws beside the engine's SRK points.

    bin/curate/reference_h2_enthalpy.py            # writes the CSV
    bin/curate/reference_h2_enthalpy.py --check    # re-computes, compares

WHAT THIS IS.  The witness tutorials/props/thermo/standardState01_hydrogen_
enthalpy_TP prices h(T, P) of H2 on the engine's SRK; the page shows beside
it a REFERENCE from a fundamental equation of state fitted to measurements:
Leachman, Jacobsen, Penoncello & Lemmon, "Fundamental Equations of State
for Parahydrogen, Normal Hydrogen, and Orthohydrogen", J. Phys. Chem. Ref.
Data 38 (2009) 721-748, as implemented by CoolProp (Bell, Wronski, Quoilin &
Lemort, Ind. Eng. Chem. Res. 53 (2014) 2498-2508; MIT licence), fluid
"Hydrogen" (normal hydrogen), HEOS backend.

WHY A SCRIPT AND NOT A PASTED TABLE.  The brief that commissioned the page
(DEV.md 4c, C32) arrived with a table "already calculated with CoolProp
8.0.0".  A number nobody here ran is a number nobody here can defend, so
the table is RE-COMPUTED by this script, the CoolProp version it ran on is
written into the file, and `--check` re-derives every row.  The values are
OUTPUTS of an open-licensed implementation of a published equation, not a
copied table from a restricted compilation (CLAUDE.md §10, licence policy).

WHAT THE COLUMNS ARE.  `Hmolar_J_mol` is CoolProp's molar enthalpy on
CoolProp's own DEFAULT reference state for this fluid -- it is NOT on
Choupo's elements datum, and the page never compares the two absolutely:
both sets are shifted to h(300 K, 1 bar) = 0 before they are drawn, which
is the zero-of-enthalpy lesson itself.  `Hmolar_residual_J_mol` is the
departure from the ideal gas at the same (T, P), which needs no datum.

WHERE IT LIVES, and why the folder is called `experimental` when this is a
MODEL's output: `constant/experimental/*.csv` is the ONE location the
tutorial bundle (gui/src/cases/tutorials.ts) and `.gitignore` admit for a
CSV that is a case INPUT rather than a run output; every other `*.csv`
under a case is harvested as the run's own answer.  Widening that rule
means teaching eleven readers a second word, and a reference equation of
state is evidence of the same KIND as a measurement on this page (a value
the engine did not produce, drawn beside the one it did), so the file goes
where the rule puts such evidence and its header says what it is.

THE GRID is the page's: T = 300..1000 K by 100 K, P = 1, 100, 300, 600,
1000 bar, plus the green-ammonia converter's point (733.15 K, 150 bar) and
its 1 bar twin.  The engine's witness evaluates the SAME nodes.
"""

import csv
import io
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CASE = os.path.join(ROOT, "tutorials", "props", "thermo",
                    "standardState01_hydrogen_enthalpy_TP")
OUT = os.path.join(CASE, "constant", "experimental", "hydrogen_Hmolar_leachman2009_coolprop.csv")

T_K = [300, 400, 500, 600, 700, 800, 900, 1000]
P_BAR = [1, 100, 300, 600, 1000]
EXTRA = [(733.15, 150.0), (733.15, 1.0)]     # the green-ammonia converter
FLUID = "Hydrogen"                            # normal hydrogen in CoolProp


def rows():
    from CoolProp.CoolProp import PropsSI
    out = []
    nodes = [(float(T), float(P)) for T in T_K for P in P_BAR] + EXTRA
    for T, P in nodes:
        h = PropsSI("Hmolar", "T", T, "P", P * 1e5, FLUID)
        hr = PropsSI("Hmolar_residual", "T", T, "P", P * 1e5, FLUID)
        out.append((T, P, h, hr))
    return out


def render(version):
    buf = io.StringIO()
    buf.write("# Reference molar enthalpy of NORMAL HYDROGEN, re-computed by\n")
    buf.write("# bin/curate/reference_h2_enthalpy.py (never edited by hand).\n")
    buf.write("# Model: Leachman, Jacobsen, Penoncello & Lemmon, J. Phys. Chem. Ref. Data\n")
    buf.write("#   38 (2009) 721-748, as implemented in CoolProp (Bell et al., Ind. Eng.\n")
    buf.write("#   Chem. Res. 53 (2014) 2498; MIT), fluid 'Hydrogen', HEOS backend.\n")
    buf.write(f"# CoolProp version: {version}\n")
    buf.write("# Hmolar is on CoolProp's DEFAULT reference state for this fluid (not\n")
    buf.write("#   Choupo's elements datum); the page shifts both to h(300 K, 1 bar) = 0.\n")
    buf.write("# Hmolar_residual is the departure from the ideal gas at the same (T, P).\n")
    buf.write("T_K,P_bar,Hmolar_J_mol,Hmolar_residual_J_mol\n")
    for T, P, h, hr in rows():
        buf.write(f"{T:g},{P:g},{h:.6f},{hr:.6f}\n")
    return buf.getvalue()


def main(argv):
    try:
        import CoolProp
    except ImportError:
        print("reference_h2_enthalpy: CoolProp is not installed; "
              "`pip install CoolProp` (this script refuses rather than guesses)")
        return 2
    text = render(CoolProp.__version__)
    if "--check" in argv:
        with open(OUT) as f:
            old = f.read()
        same = [l for l in old.splitlines() if not l.startswith("# CoolProp version")] == \
               [l for l in text.splitlines() if not l.startswith("# CoolProp version")]
        print(("reference_h2_enthalpy: OK " if same else "reference_h2_enthalpy: FAIL ")
              + f"{OUT} {'reproduces' if same else 'differs from'} CoolProp "
              + f"{CoolProp.__version__} (version line excluded from the comparison)")
        return 0 if same else 1
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        f.write(text)
    print(f"reference_h2_enthalpy: wrote {os.path.relpath(OUT, ROOT)} "
          f"({len(rows())} rows, CoolProp {CoolProp.__version__})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
