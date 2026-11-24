#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""rrho_abinitio_constants -- molecular constants for rrho_thermo.py where no
measurement is tabulated: B3LYP/def2-TZVP equilibrium geometry, rotational
constants and harmonic frequencies (PySCF), printed as JSON.

    python3.13 bin/curate/rrho_abinitio_constants.py NAME   # NAME from MOLECULES below

THIS IS A CURATION AID, NOT PART OF THE RUNTIME OR OF ANY GATE: it needs
PySCF (pip install pyscf pyberny), which the repository does not depend on.
Its printed numbers are copied into bin/curate/rrho_species.json with the
method named, the scale factor and its uncertainty; the gate holds the records
equal to rrho_thermo.py's output from THOSE numbers, never re-running this.

The harmonic frequencies are SCALED by a single factor fitted here on the
species whose fundamentals are measured (the validation set of rrho_thermo.py,
`--calibrate`), so the correction of a DFT method for anharmonicity and
for its own error is read off the data, not borrowed; the spread of that fit
is the stated uncertainty of the unmeasured modes.  Low-frequency bends and
torsions (< 400 cm-1) are the weak point of any scaled harmonic treatment and
are flagged in the input file.
"""
import json
import os
import sys
import numpy as np
from pyscf import gto, dft, scf
from pyscf.geomopt.berny_solver import optimize
from pyscf.hessian import thermo

BASIS = os.environ.get("RRHO_BASIS", "def2-tzvp")
METHOD = "B3LYP/%s, density fitted (def2-universal-jkfit auxiliary basis), DFT grid level 3" % BASIS
AMU = 1.0

# zmatrix strings / Cartesian guesses, spin = 2S
MOLECULES = {
    "H2O":   dict(atom="O; H 1 0.96; H 1 0.96 2 104.5", spin=0),
    "NH2":   dict(atom="N; H 1 1.02; H 1 1.02 2 103.4", spin=1),
    "HCO":   dict(atom="C; O 1 1.18; H 1 1.1 2 120", spin=1),
    "CH2t":  dict(atom="C; H 1 1.08; H 1 1.08 2 134", spin=2),
    "HNCO":  dict(atom="H; N 1 1.0; C 2 1.21 1 123; O 3 1.17 2 172 1 180", spin=0),
    "NCO":   dict(atom="N 0 0 0; C 0 0 1.22; O 0 0 2.40", spin=1),
    "CH2CO": dict(atom="C 0 0 0; C 0 0 1.31; O 0 0 2.47; H 0 0.94 -0.54; H 0 -0.94 -0.54", spin=0),
    "NNH":   dict(atom="N; N 1 1.24; H 2 1.04 1 120", spin=1),
    "CH2s":  dict(atom="C; H 1 1.107; H 1 1.107 2 102.4", spin=0),
    "H2CN":  dict(atom="N; C 1 1.27; H 2 1.1 1 121.5; H 2 1.1 1 121.5 3 180", spin=1),
    "HOCN":  dict(atom="H; O 1 0.96; C 2 1.28 1 118; N 3 1.17 2 175 1 180", spin=0),
    "HCNO":  dict(atom="H 0 0 -1.03; C 0 0 0; N 0 0 1.17; O 0 0 2.37", spin=0),
    "HCCOH": dict(atom="H; C 1 1.06; C 2 1.21 1 179; O 3 1.32 2 175 1 0; H 4 0.97 3 108 2 180", spin=0),
    "HCCCH": dict(atom="C; C 1 1.31; C 2 1.31 1 150; H 1 1.08 2 130 3 180; H 3 1.08 2 130 1 180", spin=2),
    "C4H4":  dict(atom="C 0 0 0; C 1.434 0 0; C 2.649 0 0; H 3.739 0 0; C -0.7316 1.1275 0; H -0.5 -0.95 0; H 0.2 2.0 0; H -1.65 1.65 0", spin=0),
    "C4H3":  dict(atom="H -4.0 0 0; C -2.95 0 0; C -1.75 0 0; C -0.33 0 0; H 0.05 -1.00 0; C 0.38 1.17 0; H 1.45 1.00 0", spin=1),
}


def run(name):
    d = MOLECULES[name]
    mol = gto.M(atom=d["atom"], basis=BASIS, spin=d["spin"], charge=0, verbose=0,
                max_memory=6000)
    mf = (dft.RKS if d["spin"] == 0 else dft.UKS)(mol)
    mf.xc = "b3lyp"
    mf.grids.level = 3
    mf.conv_tol = 1e-10
    mf = mf.density_fit()
    mol_eq = optimize(mf, maxsteps=100)
    mf = (dft.RKS if d["spin"] == 0 else dft.UKS)(mol_eq)
    mf.xc = "b3lyp"
    mf.grids.level = 3
    mf.conv_tol = 1e-11
    mf = mf.density_fit()
    mf.kernel()
    hess = mf.Hessian().kernel()
    res = thermo.harmonic_analysis(mol_eq, hess)
    freqs = [float(f) for f in res["freq_wavenumber"]]
    # rotational constants from the principal moments (amu A^2 -> cm-1)
    coords = mol_eq.atom_coords() * 0.52917721067     # A
    mass = mol_eq.atom_mass_list()
    com = (mass[:, None] * coords).sum(0) / mass.sum()
    x = coords - com
    I = np.zeros((3, 3))
    for m, r in zip(mass, x):
        I += m * (np.dot(r, r) * np.eye(3) - np.outer(r, r))
    ev = np.sort(np.linalg.eigvalsh(I))                # amu A^2
    const = 16.857629e0                                # B[cm-1] = const / I[amu A^2]
    B = [float(const / v) if v > 1e-6 else None for v in ev]
    return dict(name=name, method=METHOD, energy_Eh=float(mf.e_tot), freqs_cm1=freqs,
                rot_const_cm1_descending=sorted([b for b in B if b], reverse=True),
                geometry_A=[[mol_eq.atom_symbol(i)] + [float(c) for c in coords[i]]
                            for i in range(mol_eq.natm)])


if __name__ == "__main__":
    print(json.dumps(run(sys.argv[1]), indent=1))
