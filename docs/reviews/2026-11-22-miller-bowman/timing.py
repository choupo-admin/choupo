#!/usr/bin/env python3
"""Choupo against Cantera on nox03: wall time at equal accuracy, same mechanism, thermo and charge.

    /usr/bin/python3 timing.py CASEDIR          (needs choupoBatch on PATH: source etc/bashrc)

Reference: Cantera 3.2.0 CVODES at rtol 1e-12, atol 1e-20 (constant volume, adiabatic) read at the 31
write times of the case.  For each tolerance set of either code the wall time (best of 3, solution
construction and process start excluded for Cantera, the whole process for Choupo; its start costs
about 0.09 s of it) and the largest relative deviation from the reference over the species above
x = 1e-6 and all times (also the deviation of T).
"""
import csv, os, re, shutil, subprocess, sys, tempfile, time, warnings
import numpy as np
warnings.simplefilter('ignore')
import cantera as ct
case = os.path.abspath(sys.argv[1]); FLOOR = 1e-6
rows = list(csv.DictReader(open(os.path.join(case, 'trajectory.csv'))))
t = np.array([float(r['t']) for r in rows]); names = [k[len('vessel.n_'):] for k in rows[0] if k.startswith('vessel.n_')]
cn = lambda s: {'1CH2': 'SCH2'}.get(s, s)
g = ct.Solution('/tmp/mb89/mbA.yaml')
X0 = np.array([float(rows[0]['vessel.n_' + s]) for s in names]); X0 /= X0.sum()
def run_cantera(rtol, atol):
    g.TPX = 1300.0, 101325.0, {cn(s): X0[i] for i, s in enumerate(names)}
    r = ct.IdealGasReactor(g, clone=False); r.volume = 1e-3; net = ct.ReactorNet([r]); net.rtol = rtol; net.atol = atol
    X = []; T = []; t0 = time.perf_counter()
    for tt in t:
        if tt > 0: net.advance(tt)
        X.append(r.phase.X[[g.species_index(cn(s)) for s in names]]); T.append(r.T)
    return time.perf_counter() - t0, np.array(X), np.array(T)
def dev(X, T, Xr, Tr):
    d = np.abs(X - Xr) / np.maximum(Xr, 1e-9); return d[Xr > FLOOR].max(), np.abs(T - Tr).max()
ref = run_cantera(1e-12, 1e-20); Xr, Tr = ref[1], ref[2]
print('reference: Cantera rtol 1e-12 atol 1e-20 (%.2f s)' % ref[0])
print('%-34s %9s %12s %10s' % ('run', 'wall / s', 'max rel dev', 'max dT / K'))
for rt, at in ((1e-6, 1e-12), (1e-8, 1e-15), (1e-10, 1e-18)):
    w = min(run_cantera(rt, at)[0] for _ in range(3)); _, X, T = run_cantera(rt, at)
    d, dT = dev(X, T, Xr, Tr); print('%-34s %9.3f %12.2e %10.2e' % ('Cantera rtol %g atol %g' % (rt, at), w, d, dT))
src = open(os.path.join(case, 'system/controlDict')).read()
for rt, at in ((1e-6, 1e-12), (1e-8, 1e-15), (1e-10, 1e-18), (1e-11, 1e-20)):
    d_ = tempfile.mkdtemp(); shutil.copytree(case, d_ + '/c', ignore=shutil.ignore_patterns('log.*', 'trajectory.csv', '0.*', 'latest', 'solution.log'))
    cd = re.sub(r'rtol\s+[0-9.e+-]+;', 'rtol        %g;' % rt, src); cd = re.sub(r'atol\s+[0-9.e+-]+;', 'atol        %g;' % at, cd)
    open(d_ + '/c/system/controlDict', 'w').write(cd)
    ws = []
    for _ in range(3):
        if os.path.exists(d_ + '/c/log.choupoBatch'): os.remove(d_ + '/c/log.choupoBatch')
        t0 = time.perf_counter(); subprocess.run(['choupoBatch', d_ + '/c'], capture_output=True); ws.append(time.perf_counter() - t0)
    R = list(csv.DictReader(open(d_ + '/c/trajectory.csv')))
    N = np.array([[float(r['vessel.n_' + s]) for s in names] for r in R]); X = N / N.sum(1, keepdims=True); T = np.array([float(r['vessel.T']) for r in R])
    dd, dT = dev(X, T, Xr, Tr); print('%-34s %9.3f %12.2e %10.2e' % ('Choupo rtol %g atol %g kmol' % (rt, at), min(ws), dd, dT))
