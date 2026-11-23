"""H1d: how wrong is the dense-output grid against the true state at the same times, for EACH solver?
Reference = fresh run to E (a step end; 30 times at 1 ms, rtol 1e-8; and a tight rtol 1e-11 Rodas4 for the truth).
If the grid error against truth is as large as the dense-vs-sparse gap, the gap is the interpolant, not the solver.
usage: h1d.py integ"""
import sys
from common import *
integ = sys.argv[1]
ga, _ = run('nox03', integ, 'dense', end=3e-2, write=1e-3, atol=1e-15, tag='ga')
gb, _ = run('nox03', integ, 'sparse', end=3e-2, write=1e-3, atol=1e-15, tag='gb')
ref = []
for k in range(1, 31):
    r, _ = run('nox03', 'Rodas4', 'sparse', rtol=1e-11, atol=1e-18, end=k * 1e-3, tag='ref')
    ref.append(r[-1])
ref = [ref[0]] + ref          # row 0 = t0 placeholder (replaced below)
r0, _ = run('nox03', 'Rodas4', 'sparse', rtol=1e-11, atol=1e-18, end=1e-9, tag='ref')
ref[0] = r0[0]
ka, REF = mat(ref)
_, A = mat(ga); _, Bm = mat(gb)
cm = np.abs(REF).max(0); cm[cm == 0] = 1
for nm, M in (('dense', A), ('sparse', Bm)):
    D = np.abs(M - REF) / cm
    print('grid(%s) vs tight reference: max dev/colmax %.2e (%s), rows>1e-4: %d of %d'
          % (nm, D.max(), ka[int(np.unravel_index(D.argmax(), D.shape)[1])], (D.max(1) > 1e-4).sum(), len(D)))
D = np.abs(A - Bm) / cm
print('grid(dense) vs grid(sparse): %.2e' % D.max())
