"""H1: dense vs sparse on the write GRID (dense output) against at STEP ENDS (endTime = writeInterval = E).
usage: python3 h1.py [integrator=seulex] [case=nox03]"""
import sys
from common import *

integ = sys.argv[1] if len(sys.argv) > 1 else 'seulex'
case = sys.argv[2] if len(sys.argv) > 2 else 'nox03'

Rd, od = run(case, integ, 'dense', tag='gd')
Rs, os_ = run(case, integ, 'sparse', tag='gs')
d, k = devs(Rd, Rs)
print('%s %s  GRID (case grid, dense output): dense vs sparse max dev/colmax = %.2e (%s), rows %d' % (case, integ, d, k, len(Rd)))
# per-row deviation, to see where on the grid it lives
ka, A = mat(Rd); _, Bm = mat(Rs)
cm = np.maximum(np.abs(A).max(0), np.abs(Bm).max(0)); cm[cm == 0] = 1
perrow = (np.abs(A - Bm) / cm).max(1)
print('   per-row max dev (first 12 rows): ' + ' '.join('%.1e' % v for v in perrow[:12]))
print('   last row (t_end, a step end): %.2e' % perrow[-1])

Es = [1e-3, 2e-3, 3e-3] if case == 'nox03' else [1e-4, 2e-4, 3e-4]
for E in Es:
    a, _ = run(case, integ, 'dense', end=E, atol=1e-15, tag='ed')
    b, _ = run(case, integ, 'sparse', end=E, atol=1e-15, tag='es')
    # the single written state is the last row (a step end: no dense output)
    ka, A = mat(a[-1:]); _, Bm = mat(b[-1:])
    sc = np.maximum(np.abs(A), np.abs(Bm)); sc[sc == 0] = 1
    rel = np.abs(A - Bm) / sc
    j = int(rel.argmax())
    floor = np.abs(A) > 1e-6 * np.abs(A).max()          # species above the trace floor
    print('   E=%.0e step end: max rel dev (all) %.2e (%s);  above 1e-6 of max: %.2e;  vs colmax %.2e'
          % (E, rel.max(), ka[j], rel[floor].max(), (np.abs(A - Bm) / np.maximum(np.abs(A), 1e-300).max()).max()))
