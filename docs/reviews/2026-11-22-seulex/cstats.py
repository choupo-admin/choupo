import sys, os, csv, time, warnings
warnings.simplefilter('ignore')
import numpy as np, cantera as ct
case = sys.argv[1]
rows = list(csv.DictReader(open(os.path.join(case, 'trajectory.csv'))))
t = np.array([float(r['t']) for r in rows])
names = [k[len('vessel.n_'):] for k in rows[0] if k.startswith('vessel.n_')]
cn = lambda s: {'1CH2': 'SCH2'}.get(s, s)
g = ct.Solution(sys.argv[2])
T0 = float(sys.argv[3]) if len(sys.argv) > 3 else 1300.0
X0 = np.array([float(rows[0]['vessel.n_' + s]) for s in names]); X0 /= X0.sum()
for rt, at in ((1e-6, 1e-12), (1e-8, 1e-15), (1e-10, 1e-18)):
    g.TPX = T0, 101325.0, {cn(s): X0[i] for i, s in enumerate(names)}
    r = ct.IdealGasReactor(g, clone=False); r.volume = 1e-3
    net = ct.ReactorNet([r]); net.rtol = rt; net.atol = at
    t0 = time.perf_counter()
    for tt in t:
        if tt > 0: net.advance(tt)
    w = time.perf_counter() - t0
    print(rt, at, 'wall %.3f' % w, dict(net.solver_stats))
