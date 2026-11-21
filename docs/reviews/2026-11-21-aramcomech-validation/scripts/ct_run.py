#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""ct_run -- Cantera's adiabatic ignition sampled on a uniform grid (the Choupo run's grid).

    ct_run.py MECH.yaml OUT.csv --T 1400 --P 1 --mix "CH4:1,O2:2,N2:7.52" \\
              --mode V|P --endTime 3e-3 --deltaT 1e-6 [--rtol 1e-10 --atol 1e-20]

P in atm.  --mode V: IdealGasReactor at fixed volume; --mode P: IdealGasConstPressureReactor.
The state is written at t = k * deltaT (ReactorNet.advance to each instant: the
integrator's own solution there).  Columns: t, T, P, then every species' mole fraction.
"""
import argparse
import csv
import sys
import time

import cantera as ct


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("mech")
    ap.add_argument("out")
    ap.add_argument("--T", type=float, required=True)
    ap.add_argument("--P", type=float, required=True, help="atm")
    ap.add_argument("--mix", required=True)
    ap.add_argument("--mode", choices=("V", "P"), default="V")
    ap.add_argument("--endTime", type=float, required=True)
    ap.add_argument("--deltaT", type=float, required=True)
    ap.add_argument("--rtol", type=float, default=1e-10)
    ap.add_argument("--atol", type=float, default=1e-20)
    a = ap.parse_args()
    gas = ct.Solution(a.mech)
    gas.TPX = a.T, a.P * ct.one_atm, a.mix
    r = ct.IdealGasReactor(gas, energy="on") if a.mode == "V" else \
        ct.IdealGasConstPressureReactor(gas, energy="on")
    net = ct.ReactorNet([r])
    net.rtol, net.atol = a.rtol, a.atol
    n = int(round(a.endTime / a.deltaT))
    names = gas.species_names
    w0 = time.perf_counter()
    rows = [(0.0, r.T, r.thermo.P, *r.thermo.X)]
    for k in range(1, n + 1):
        net.advance(k * a.deltaT)
        rows.append((k * a.deltaT, r.T, r.thermo.P, *r.thermo.X))
    wall = time.perf_counter() - w0
    with open(a.out, "w") as f:
        w = csv.writer(f)
        w.writerow(["t", "T", "P"] + names)
        for row in rows:
            w.writerow(["%.17g" % x for x in row])
    print("cantera %s  %d species  %d reactions  wall %.2f s" % (ct.__version__, gas.n_species, gas.n_reactions, wall))


if __name__ == "__main__":
    sys.exit(main())
