"""H3: step counts / rejections of dense vs sparse on the case's grid run, and the first time the trajectories separate.
usage: h3.py integ [case]"""
import sys, re
from common import *
integ = sys.argv[1]; case = sys.argv[2] if len(sys.argv) > 2 else 'nox03'
res = {}
for ls in ('dense', 'sparse'):
    R, o = run(case, integ, ls, tag='h3' + ls, env={'CHOUPO_ODE_STATS': '1'})
    res[ls] = R
    for l in o.split('\n'):
        if l.startswith('[ode-stats]'):
            print(ls, re.sub(r' \| time.*', '', l))
ka, A = mat(res['dense']); _, Bm = mat(res['sparse'])
cm = np.maximum(np.abs(A).max(0), np.abs(Bm).max(0)); cm[cm == 0] = 1
perrow = (np.abs(A - Bm) / cm).max(1)
t = [float(r['t']) if 't' in r else i for i, r in enumerate(res['dense'])]
for thr in (1e-8, 1e-6, 1e-4, 1e-3):
    i = int(np.argmax(perrow > thr)) if (perrow > thr).any() else -1
    print('first row beyond %.0e: row %d t=%s' % (thr, i, t[i] if i >= 0 else '-'))
