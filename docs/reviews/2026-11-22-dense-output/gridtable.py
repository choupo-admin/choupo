"""The grid error of the free-stepping write grid against a tight reference (C473 h).

usage: gridtable.py [case=nox03] [integrators=seulex,Rodas4] [rtols=1e-6,1e-8,1e-10] [label]

Reference: one fresh run per write time to that time (a single write = a step end, no dense output) with Rodas4 at
rtol 1e-12, atol 1e-20 (cached in build/scratch_densesparse/ref_<case>.npy).  For each integrator and rtol the case is
run with `linearSolver dense` and `sparse`, free stepping, written every 1 ms (nox03, 30 rows) or 1 ms (nox02, to 10 ms),
and the worst |value - reference| / column max over the grid is printed for each, with the dense-vs-sparse gap -- the
numbers of docs/reviews/2026-11-22-densesparse/README.md, retaken.
"""
import os, sys
from common import *

case = sys.argv[1] if len(sys.argv) > 1 else 'nox03'
integs = (sys.argv[2] if len(sys.argv) > 2 else 'seulex,Rodas4').split(',')
rtols = [float(x) for x in (sys.argv[3] if len(sys.argv) > 3 else '1e-6,1e-8,1e-10').split(',')]
label = sys.argv[4] if len(sys.argv) > 4 else ''
if case == 'nox03':
    END, W = 3e-2, 1e-3
else:
    END, W = 1e-2, 1e-3
N = int(round(END / W))
cache = os.path.join(SCR, 'ref_%s.npy' % case)
os.makedirs(SCR, exist_ok=True)
if os.path.exists(cache):
    REF = np.load(cache)
else:
    rows = []
    r0, _ = run(case, 'Rodas4', 'sparse', rtol=1e-12, atol=1e-20, end=1e-12, tag='ref')
    _, M0 = mat(r0[:1])
    rows.append(M0[0])
    for k in range(1, N + 1):
        r, _ = run(case, 'Rodas4', 'sparse', rtol=1e-12, atol=1e-20, end=k * W, tag='ref')
        _, Mk = mat(r[-1:])
        rows.append(Mk[0])
        print('ref', k, flush=True)
    REF = np.array(rows)
    np.save(cache, REF)
cm = np.abs(REF).max(0)
cm[cm == 0] = 1
for integ in integs:
    for rt in rtols:
        out = []
        G = {}
        for ls in ('dense', 'sparse'):
            R, _ = run(case, integ, ls, rtol=rt, atol=float(os.environ.get('GT_ATOL', 1e-15)) if case == 'nox03' else None, end=END, write=W, tag='gt_' + ls)
            k, A = mat(R)
            assert A.shape == REF.shape, (A.shape, REF.shape)
            D = np.abs(A - REF) / cm
            j = int(D.max(0).argmax())
            out.append('%s grid err %.2e (%s)' % (ls, D.max(), k[j]))
            G[ls] = A
        gap = (np.abs(G['dense'] - G['sparse']) / cm).max()
        print('%s%s %s rtol %.0e: %s; dense-vs-sparse gap %.2e' % (label, case, integ, rt, '; '.join(out), gap), flush=True)
