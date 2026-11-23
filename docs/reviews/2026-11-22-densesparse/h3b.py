"""H3b: compare the printed adaptive step histories (t, h; 5 digits) of the dense and the sparse run, and the
step-end states at EACH accepted step end of the free-step run (fresh run to that t).  usage: h3b.py integ"""
import sys, re
from common import *
integ = sys.argv[1]
hist = {}
for ls in ('dense', 'sparse'):
    R, o = run('nox03', integ, ls, tag='h3' + ls, atol=1e-15, end=3e-3, write=1e-4)
    hist[ls] = [(float(a), float(b)) for a, b in re.findall(r'^\s+(\d\.\d+e[+-]\d+)\s+(\d\.\d+e[+-]\d+)\s*$', o, re.M)]
hd, hs = hist['dense'], hist['sparse']
print('steps printed: dense %d sparse %d; identical (t,h) to 5 digits: %s' % (len(hd), len(hs), hd == hs))
worst = 0.0; wk = None
for tk, hk in hd[:70]:
    a, _ = run('nox03', integ, 'dense', end=tk, atol=1e-15, tag='ea')
    b, _ = run('nox03', integ, 'sparse', end=tk, atol=1e-15, tag='eb')
    ka, A = mat(a[-1:]); _, Bm = mat(b[-1:])
    sc = np.maximum(np.abs(A), np.abs(Bm)); sc[sc == 0] = 1
    rel = (np.abs(A - Bm) / sc)[0]
    big = sc[0] > 1e-12                                # species above 1e-12 kmol
    i = int(np.argmax(np.where(big, rel, 0)))
    if rel[big].max() > worst: worst = rel[big].max(); wk = (tk, ka[i], A[0, i], Bm[0, i])
print('worst relative difference at a step end over species above 1e-12 kmol: %.2e at t=%.4e (%s dense %.9e sparse %.9e)' % ((worst,) + wk))
