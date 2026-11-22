"""Cantera 3.2 per-call cost at the committed mid-ignition state of nox03 (state_mid.txt, species in
the case's own order): net_production_rates with the state reset, and the state set alone.
usage: ctbench.py        (needs `make all`, cantera, ruamel.yaml; builds the mechanism with
docs/reviews/2026-11-22-miller-bowman/cantera_mech.py and takes the species order from a run of the case)"""
import csv, os, shutil, subprocess, sys, tempfile, time, warnings
import numpy as np
warnings.simplefilter('ignore')
import cantera as ct

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
CASE = os.path.join(ROOT, 'tutorials/batch/combustion/nox03_millerbowman_large')
W = tempfile.mkdtemp()
try:
    c = os.path.join(W, 'case'); shutil.copytree(CASE, c, ignore=shutil.ignore_patterns('expected'))
    subprocess.run([os.path.join(ROOT, 'choupoBatch'), c], capture_output=True, env=dict(os.environ, CHOUPO_HOME=ROOT), check=True)
    names = [k[len('vessel.n_'):] for k in next(csv.DictReader(open(os.path.join(c, 'trajectory.csv')))) if k.startswith('vessel.n_')]
    yaml = os.path.join(W, 'mbA.yaml')
    subprocess.run([sys.executable, os.path.join(ROOT, 'docs/reviews/2026-11-22-miller-bowman/cantera_mech.py'), 'A', CASE, yaml], check=True, capture_output=True)
    v = np.array([float(x) for x in open(os.path.join(HERE, 'state_mid.txt')).read().split()])
    n, T = v[:-1], v[-1]; X = n / n.sum()
    cn = lambda s: {'1CH2': 'SCH2'}.get(s, s)
    g = ct.Solution(yaml)
    g.TPX = T, 101325.0, {cn(s): X[i] for i, s in enumerate(names)}
    D0, Y0 = g.density, g.Y.copy()

    def timeit(fn, N=20000):
        fn(); t0 = time.perf_counter()
        for _ in range(N): fn()
        return (time.perf_counter() - t0) / N * 1e6

    def setstate(): g.TDY = T, D0, Y0
    def setrop(): g.TDY = T, D0, Y0; return g.net_production_rates
    a, b = timeit(setstate), timeit(setrop)
    print('T = %.1f K' % T)
    print('set state only                   %.2f us' % a)
    print('set state + net_production_rates %.2f us  (kinetics alone %.2f us)' % (b, b - a))
finally:
    shutil.rmtree(W, ignore_errors=True)
