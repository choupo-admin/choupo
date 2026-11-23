"""H1e: dense-vs-sparse deviation (a) on the case's write grid and (b) at 30 fresh step ends, against rtol, per integrator.
If the grid gap is the interpolant's, it should shrink with the STEP (rtol) as the interpolant error does, while the
step-end gap stays at the level of the solvers' round-off.   usage: h1e.py integ [case]"""
import sys
from common import *
integ = sys.argv[1]; case = sys.argv[2] if len(sys.argv) > 2 else 'nox03'
Ks = range(1, 31) if case == 'nox03' else range(1, 11)
unit = 1e-3 if case == 'nox03' else 1e-3
for rt in (1e-6, 1e-8, 1e-10, 1e-12):
    at = rt * 1e-7
    a, _ = run(case, integ, 'dense', rtol=rt, atol=at, tag='ga')
    b, _ = run(case, integ, 'sparse', rtol=rt, atol=at, tag='gb')
    dg, kg = devs(a, b)
    ends = 0.0
    for k in Ks:
        ra, _ = run(case, integ, 'dense', rtol=rt, atol=at, end=k * unit, tag='ea')
        rb, _ = run(case, integ, 'sparse', rtol=rt, atol=at, end=k * unit, tag='eb')
        ka, A = mat(ra[-1:]); _, Bm = mat(rb[-1:])
        sc = np.maximum(np.abs(A), np.abs(Bm)); m = sc[0] > 1e-6 * sc.max()
        ends = max(ends, (np.abs(A - Bm) / np.where(sc == 0, 1, sc))[0][m].max())
    print('%s %s rtol %.0e: grid dev/colmax %.2e (%s);  step-end rel dev (species > 1e-6 of max) %.1e' % (case, integ, rt, dg, kg, ends), flush=True)
