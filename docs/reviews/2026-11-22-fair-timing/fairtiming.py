#!/usr/bin/env python3
"""Choupo against Cantera 3.2, two timings that are LIKE WITH LIKE.  Run from the repo root after `make all`:

    docs/reviews/2026-11-22-fair-timing/fairtiming.py CASE integrator rtol [reps]
    CASE = nox03 | nox02 | ignition01

(a) INTEGRATION ONLY.  Cantera: ReactorNet already built, state set, then advance through the write
    times (the timer holds advance() and the read of X, T at each time; no load, no setState of the
    mechanism).  Choupo: the engine's own timer "integrate" of CHOUPO_ODE_STATS=1 (AdaptiveTimeStep.H:
    the call integ_->integrate() summed over the write intervals, nothing before or after it).
(b) END TO END.  `choupoBatch CASE` as a process (parse, records, Jacobian audit, integration, writing of
    trajectory.csv and the state directories) against a fresh `python3 -I helper` that imports cantera,
    loads the YAML, sets the state, integrates, writes the same trajectory columns.
All numbers: best of `reps` (default 5).  The machine load is printed first.
The Cantera mechanism of nox03 / nox02 is built from the case's own records by
docs/reviews/2026-11-22-miller-bowman/cantera_mech.py (same reactions, same NASA-9 Cp).  ignition01 has no
tracked Cantera mechanism: Cantera's bundled h2o2.yaml is the STAND-IN (same species, same charge, a
comparable size, NOT the same rate constants) -- its timing is informative, its trajectory is not compared.
"""
import csv, os, re, shutil, subprocess, sys, time, warnings
warnings.simplefilter('ignore')
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
CASES = {'nox03': ('nox03_millerbowman_large', 'A'), 'nox02': ('nox02_millerbowman_denox', 'B'),
         'ignition01': ('ignition01_h2o2', None)}
case_key, integ, rtol = sys.argv[1], sys.argv[2], float(sys.argv[3])
reps = int(sys.argv[4]) if len(sys.argv) > 4 else 5
name, app = CASES[case_key]
src = os.path.join(ROOT, 'tutorials/batch/combustion', name)
scr = os.environ.get('FAIR_SCRATCH', os.path.join(ROOT, 'build/scratch/fairtiming'))
os.makedirs(scr, exist_ok=True)
B = os.path.join(ROOT, 'build/linux64Gcc/choupoBatch')
atol = {1e-6: 1e-12, 1e-8: 1e-15, 1e-10: 1e-18}.get(rtol, 1e-15)     # Choupo kmol and Cantera (mass fraction) alike
atol_ct = atol
d = os.path.join(scr, name)
shutil.rmtree(d, ignore_errors=True)
shutil.copytree(src, d, ignore=shutil.ignore_patterns('expected', 'log.*', 'trajectory.csv'))
f = open(d + '/system/flowsheetDict').read()
f = re.sub(r'integrator\s+(Rosenbrock23|Rodas4|seulex);', 'integrator %s;' % integ, f)
if case_key == 'ignition01':          # the fixed-step path: the unit's own timer (BatchReactor.cpp, verbosity 4)
    f = re.sub(r'verbosity\s+3;', 'verbosity 4;', f, count=1)
    rtol = 1e-7                       # hard-wired in BatchReactor.cpp (ctrl.rtol), not a case input
open(d + '/system/flowsheetDict', 'w').write(f)
c = open(d + '/system/controlDict').read()
c = re.sub(r'rtol\s+[0-9.eE+-]+;', 'rtol %g;' % rtol, c)
c = re.sub(r'atol\s+[0-9.eE+-]+;', 'atol %g;' % atol, c)
open(d + '/system/controlDict', 'w').write(c)
if case_key == 'ignition01': rtol, atol, atol_ct = 1e-7, 1e-15, 1e-15
print('load average:', open('/proc/loadavg').read().split()[:3], ' case', name, ' integrator', integ,
      ' rtol', rtol, ' atol', atol)


def run_choupo():
    p = os.path.join(d, 'trajectory.csv')
    if os.path.exists(p):
        os.remove(p)
    t0 = time.perf_counter()
    out = subprocess.run([B, d], capture_output=True, text=True, cwd=d,
                         env=dict(os.environ, CHOUPO_ODE_STATS='1', CHOUPO_HOME=ROOT)).stdout
    wall = time.perf_counter() - t0
    ms = [float(x) for x in re.findall(r'integrate ([0-9.eE+-]+)', out)]
    if case_key == 'ignition01':
        w = re.findall(r'; wall ([0-9.]+) s = right-hand', out)
        return wall, (float(w[-1]) * 1000.0 if w else 0.0), out
    return wall, sum(ms), out


w_all, w_int = [], []
for _ in range(reps):
    w, i, out = run_choupo()
    w_all.append(w)
    w_int.append(i / 1000.0)
if not w_int[0]:
    print(out[-600:])
rows = list(csv.DictReader(open(d + '/trajectory.csv')))
tgrid = [float(r['t']) for r in rows]
units = sorted({k.split('.')[0] for k in rows[0] if '.n_' in k})
spec = {u: [k[len(u) + 3:] for k in rows[0] if k.startswith(u + '.n_')] for u in units}
init = {}
for u in units:
    init[u] = (float(rows[0][u + '.T']), [float(rows[0][u + '.n_' + s]) for s in spec[u]])
import cantera as ct


def mech():
    if app is None:
        return 'h2o2.yaml'
    y = os.path.join(scr, 'mb%s.yaml' % app)
    if not os.path.exists(y):
        cdir = 'nox03_millerbowman_large' if app == 'A' else 'nox02_millerbowman_denox'
        subprocess.run([sys.executable, os.path.join(ROOT, 'docs/reviews/2026-11-22-miller-bowman/cantera_mech.py'),
                        app, os.path.join(ROOT, 'tutorials/batch/combustion', cdir), y], check=True)
    return y


Y = mech()
t_imp = time.perf_counter()
g = ct.Solution(Y)
t_load = time.perf_counter() - t_imp


def csp(s):
    if case_key == 'ignition01':
        return s.lower() if s.lower() in g.species_names else s
    return {'1CH2': 'SCH2'}.get(s, s)


def cantera_once(rt=None, at=None):
    rt = rtol if rt is None else rt
    at = atol_ct if at is None else at
    tot_int = 0.0; traj = {}
    for u in units:
        T0, n = init[u]
        tot = sum(n)
        X = {csp(s): n[i] / tot for i, s in enumerate(spec[u]) if csp(s) in g.species_names}
        if case_key == 'nox02':
            g.TPX = T0, 1.1 * 101325.0, X
            r = ct.IdealGasConstPressureReactor(g, energy='off', clone=False)
        elif case_key == 'nox03':
            g.TPX = T0, 101325.0, X
            r = ct.IdealGasReactor(g, clone=False)
            r.volume = 1e-3
        else:
            g.TPX = T0, 5e5, X
            r = ct.IdealGasReactor(g, clone=False)
            r.volume = 1e-3
        net = ct.ReactorNet([r])
        net.rtol = rt
        net.atol = at
        t0 = time.perf_counter()
        res = []
        for tt in tgrid:
            if tt > 0:
                net.advance(tt)
            res.append((r.T, r.phase.X.copy()))
        tot_int += time.perf_counter() - t0
        traj[u] = res
    return tot_int, traj


runs = [cantera_once() for _ in range(reps)]
ct_int = [r[0] for r in runs]
import numpy as np
def deviation(traj):
    # traj[u] = list of (T, X over g.species); Choupo's own trajectory.csv from the LAST run is compared the same way
    d = 0.0; dT = 0.0
    for u in units:
        for k, (T, X) in enumerate(traj[u]):
            Xr = REF[u][k][1]; sel = Xr > 1e-6
            d = max(d, float(np.max(np.abs(X[sel] - Xr[sel]) / Xr[sel]))); dT = max(dT, abs(T - REF[u][k][0]))
    return d, dT
if case_key != 'ignition01':
    REF = cantera_once(1e-12, 1e-24 if case_key == 'nox02' else 1e-20)[1]
    dct = deviation(runs[-1][1])
    ch = {}
    for u in units:
        idx = [g.species_index(csp(s)) for s in spec[u]]; res = []
        for r_ in rows:
            n = np.array([float(r_[u + '.n_' + s]) for s in spec[u]]); X = np.zeros(g.n_species); X[idx] = n / n.sum()
            res.append((float(r_[u + '.T']), X))
        ch[u] = res
    dch = deviation(ch)
    print('    accuracy vs Cantera rtol 1e-12 (species above x=1e-6, all write times): Choupo max rel dev %.1e, dT %.1e K;  '
          'Cantera at the same rtol %.1e, dT %.1e K' % (dch[0], dch[1], dct[0], dct[1]))
print('(a) INTEGRATION ONLY  (best of %d)   Choupo integrate-timer %.3f s   Cantera advance %.3f s   ratio %.2f' %
      (reps, min(w_int), min(ct_int), min(w_int) / min(ct_int)))
helper = os.path.join(scr, 'helper_%s.py' % case_key)
open(helper, 'w').write('''import sys, time, csv, warnings
warnings.simplefilter('ignore')
t00 = time.perf_counter()
import cantera as ct
t_imp = time.perf_counter() - t00
g = ct.Solution(%r); t_load = time.perf_counter() - t00
init = %r; units = %r; spec = %r; tgrid = %r; kind = %r; rtol = %r; atol = %r
def csp(s):
    if kind == 'ignition01': return s.lower() if s.lower() in g.species_names else s
    return {'1CH2': 'SCH2'}.get(s, s)
out = []
for u in units:
    T0, n = init[u]; tot = sum(n); X = {csp(s): n[i]/tot for i, s in enumerate(spec[u]) if csp(s) in g.species_names}
    if kind == 'nox02': g.TPX = T0, 1.1*101325.0, X; r = ct.IdealGasConstPressureReactor(g, energy='off', clone=False)
    elif kind == 'nox03': g.TPX = T0, 101325.0, X; r = ct.IdealGasReactor(g, clone=False); r.volume = 1e-3
    else: g.TPX = T0, 5e5, X; r = ct.IdealGasReactor(g, clone=False); r.volume = 1e-3
    net = ct.ReactorNet([r]); net.rtol = rtol; net.atol = atol
    res = []
    for tt in tgrid:
        if tt > 0: net.advance(tt)
        res.append((r.T, r.mass * r.phase.Y / g.molecular_weights))
    out.append(res)
with open(sys.argv[1], 'w', newline='') as fh:
    w = csv.writer(fh); w.writerow(['t'] + [u + '.T' for u in units] + [u + '.n_' + s for u in units for s in spec[u]])
    for k, tt in enumerate(tgrid):
        row = [tt] + [out[ui][k][0] for ui, u in enumerate(units)]
        for ui, u in enumerate(units):
            row += [out[ui][k][1][g.species_index(csp(s))] if csp(s) in g.species_names else 0.0 for s in spec[u]]
        w.writerow(['%%.10g' %% x for x in row])
print('PHASES import %%.4f load_done %%.4f total %%.4f' %% (t_imp, t_load, time.perf_counter() - t00))
''' % (Y, init, units, spec, tgrid, case_key, rtol, atol))
w_ct = []
phases = ''
for _ in range(reps):
    t0 = time.perf_counter()
    o = subprocess.run([sys.executable, '-I', helper, os.path.join(scr, 'ct_%s.csv' % case_key)],
                       capture_output=True, text=True)
    w_ct.append(time.perf_counter() - t0)
    phases = (o.stdout.strip() + ' ' + o.stderr.strip()[-200:]).strip()
print('(b) END TO END        (best of %d)   `choupoBatch` process %.3f s   `python3 -I` (interpreter, import, load, '
      'integrate, write) %.3f s   ratio %.2f' % (reps, min(w_all), min(w_ct), min(w_all) / min(w_ct)))
print('    Cantera process phases (last run): ' + phases)
print('    Choupo outside the integrator: %.3f s (= process %.3f - integrate %.3f)' %
      (min(w_all) - min(w_int), min(w_all), min(w_int)))
