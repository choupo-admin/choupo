"""Deviation of Choupo trajectories from the Cantera rtol 1e-12 reference (timing.py's metric).
usage: devcmp.py yaml T0 dir1 dir2 ...   (each dir has trajectory.csv)"""
import sys, os, csv, warnings
warnings.simplefilter('ignore')
import numpy as np, cantera as ct
yaml, T0, dirs = sys.argv[1], float(sys.argv[2]), sys.argv[3:]
FLOOR = 1e-6
rows0 = list(csv.DictReader(open(os.path.join(dirs[0], 'trajectory.csv'))))
t = np.array([float(r['t']) for r in rows0])
names = [k[len('vessel.n_'):] for k in rows0[0] if k.startswith('vessel.n_')]
cn = lambda s: {'1CH2': 'SCH2'}.get(s, s)
g = ct.Solution(yaml)
X0 = np.array([float(rows0[0]['vessel.n_' + s]) for s in names]); X0 /= X0.sum()
vol = float(sys.argv[0] and os.environ.get('VOL', '1e-3')); P0 = float(os.environ.get('P0', '101325'))
g.TPX = T0, P0, {cn(s): X0[i] for i, s in enumerate(names)}
r = ct.IdealGasReactor(g, clone=False); r.volume = vol
net = ct.ReactorNet([r]); net.rtol = 1e-12; net.atol = 1e-20
Xr, Tr = [], []
for tt in t:
    if tt > 0: net.advance(tt)
    Xr.append(r.phase.X[[g.species_index(cn(s)) for s in names]]); Tr.append(r.T)
Xr, Tr = np.array(Xr), np.array(Tr)
for d in dirs:
    R = list(csv.DictReader(open(os.path.join(d, 'trajectory.csv'))))
    N = np.array([[float(x['vessel.n_' + s]) for s in names] for x in R]); X = N / N.sum(1, keepdims=True)
    T = np.array([float(x['vessel.T']) for x in R])
    dd = np.abs(X - Xr) / np.maximum(Xr, 1e-9)
    print('%-40s max rel dev (x>1e-6) %.2e   max dT %.2e K' % (d, dd[Xr > FLOOR].max(), np.abs(T - Tr).max()))
    for k in range(len(t)):
        m = dd[k][Xr[k] > FLOOR].max() if (Xr[k] > FLOOR).any() else 0
        if m > 2e-5: print('   t=%.4f  maxdev %.2e  dT %.2e' % (t[k], m, abs(T[k]-Tr[k])))
