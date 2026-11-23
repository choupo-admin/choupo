"""H1f: the sensitivity of the grid to a round-off-sized PERTURBATION of the initial state (T0 = 1300 K + d), same
solver (sparse), same step sequence: step-end deviation and grid deviation vs the unperturbed run.  If a perturbation of
1e-13 relative moves the grid by about what dense-vs-sparse does, the grid is just amplifying round-off.
usage: h1f.py integ"""
import sys, re
from common import *
integ = sys.argv[1]
ref, o0 = run('nox03', integ, 'sparse', tag='p0', env={'CHOUPO_ODE_STATS': '1'})
st = lambda o: re.search(r'steps=(\d+) accepted=(\d+) rejected=(\d+)', o).groups()
print('reference steps', st(o0))
for d in (1e-12, 1e-11, 1e-10, 1e-9):
    R, o = run('nox03', integ, 'sparse', tag='p1', T0=1300.0 + d, env={'CHOUPO_ODE_STATS': '1'})
    g, k = devs(ref, R)
    ends = 0.0
    for kk in (1, 5, 15, 30):
        a, _ = run('nox03', integ, 'sparse', end=kk * 1e-3, atol=1e-15, tag='e0')
        b, _ = run('nox03', integ, 'sparse', end=kk * 1e-3, atol=1e-15, tag='e1', T0=1300.0 + d)
        ka, A = mat(a[-1:]); _, Bm = mat(b[-1:])
        sc = np.maximum(np.abs(A), np.abs(Bm)); m = sc[0] > 1e-6 * sc.max()
        ends = max(ends, (np.abs(A - Bm) / np.where(sc == 0, 1, sc))[0][m].max())
    print('T0 + %.0e K (%.1e relative): steps %s, grid dev/colmax %.2e (%s), step-end rel dev %.1e' % (d, d / 1300, st(o), g, k, ends))
