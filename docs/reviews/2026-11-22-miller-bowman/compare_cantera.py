#!/usr/bin/env python3
"""Choupo trajectory.csv against Cantera 3.2, same mechanism, same thermo, same conditions.

    compare_cantera.py denox   CASEDIR     (nox02: isothermal, constant P, 13 temperatures, Appendix B)
    compare_cantera.py large   CASEDIR     (nox03: adiabatic constant V, Appendix A)

Prints, per vessel, the largest deviation of T and of every mole fraction x_i over all write
times, in the form  max |x_i - x_i^Cantera| / max(x_i^Cantera, FLOOR)  with FLOOR = 1e-9 (species
below a nanomole fraction are compared absolutely), and the deviations of the headline KPIs.
Cantera: CVODES, rtol 1e-10, atol 1e-20 (tighter than Choupo's 1e-8 / 1e-15 kmol).
"""
import csv, sys, os, warnings, time
import numpy as np
warnings.simplefilter('ignore')
import cantera as ct
HERE = os.path.dirname(os.path.abspath(__file__))
FLOOR = 1e-9
def load(case):
    r = list(csv.DictReader(open(os.path.join(case, 'trajectory.csv'))))
    return r
def species_names(row, unit):
    return [k[len(unit) + 3:] for k in row if k.startswith(unit + '.n_')]
def compare(kind, case):
    rows = load(case)
    t = np.array([float(r['t']) for r in rows])
    if kind == 'denox':
        g = ct.Solution(os.path.join('/tmp/mb89', 'mbB.yaml')); units = sorted({k.split('.')[0] for k in load(case)[0] if k.startswith('T') and '.n_' in k}, key=lambda u: int(u[1:]))
    else:
        g = ct.Solution(os.path.join('/tmp/mb89', 'mbA.yaml')); units = ['vessel']
    out = []
    for u in units:
        names = species_names(rows[0], u)
        N = np.array([[float(r[u + '.n_' + s]) for s in names] for r in rows])
        X = N / N.sum(axis=1, keepdims=True)
        T0 = float(rows[0][u + '.T']) if (u + '.T') in rows[0] else float(u[1:])
        cn = lambda s: {'1CH2': 'SCH2'}.get(s, s)
        g.TPX = T0, (1.1 if kind == 'denox' else 1.0) * 101325.0, {cn(s): X[0, i] for i, s in enumerate(names)}
        if kind == 'denox':
            r = ct.IdealGasConstPressureReactor(g, energy='off', clone=False)
        else:
            r = ct.IdealGasReactor(g, clone=False); r.volume = 1e-3
        net = ct.ReactorNet([r]); net.rtol = 1e-10; net.atol = 1e-20
        t0 = time.time()
        Xc = []; Tc = []
        for tt in t:
            if tt > 0: net.advance(tt)
            Xc.append(r.phase.X.copy()); Tc.append(r.T)
        wall = time.time() - t0
        Xc = np.array(Xc); idx = [g.species_index(cn(s)) for s in names]; Xc = Xc[:, idx]
        d = np.abs(X - Xc) / np.maximum(Xc, FLOOR)
        worst = np.unravel_index(np.argmax(d), d.shape)
        dT = None
        if (u + '.T') in rows[0]:
            Tch = np.array([float(r_[u + '.T']) for r_ in rows]); dT = np.max(np.abs(Tch - np.array(Tc)))
        iNO = names.index('NO'); iNO2 = names.index('NO2')
        nox_ch = (X[-1, iNO] + X[-1, iNO2]) * 1e6; nox_c = (Xc[-1, iNO] + Xc[-1, iNO2]) * 1e6
        major = (Xc > 1e-6)
        dm = d[major].max() if major.any() else 0.0
        out.append((u, d.max(), names[worst[1]], t[worst[0]], dT, nox_ch, nox_c, wall))
        print('%-8s max rel dev %.2e (%s at t=%.4g); species above x=1e-6: %.2e   dT %s  NOx_end Choupo %.4f Cantera %.4f ppm  [Cantera wall %.2f s]' % (
            u, d.max(), names[worst[1]], t[worst[0]], dm, ('%.2e K' % dT) if dT is not None else '-', nox_ch, nox_c, wall))
    print('WORST over vessels: %.2e' % max(o[1] for o in out))
if __name__ == '__main__': compare(sys.argv[1], sys.argv[2])
