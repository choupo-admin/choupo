"""H4: nox02 (17 vessels), dense vs sparse: the grid deviation, its worst columns with their size against atol,
the step ends (fresh runs to E), and the step counts.   usage: h4.py integ [rtol]"""
import sys, re
from common import *
integ = sys.argv[1]; rt = float(sys.argv[2]) if len(sys.argv) > 2 else 1e-8
env = {'CHOUPO_ODE_STATS': '1'}
a, oa = run('nox02', integ, 'dense', rtol=rt, tag='n2a', env=env)
b, ob = run('nox02', integ, 'sparse', rtol=rt, tag='n2b', env=env)
for nm, o in (('dense', oa), ('sparse', ob)):
    for l in o.split('\n'):
        if l.startswith('[ode-stats]'):
            print(nm, re.sub(r' \| time.*', '', l))
d, k = devs(a, b)
ka, A = mat(a); _, Bm = mat(b)
cm = np.maximum(np.abs(A).max(0), np.abs(Bm).max(0)); cm[cm == 0] = 1
D = np.abs(A - Bm) / cm
print('%s rtol %g grid: max dev/colmax %.2e (%s)' % (integ, rt, d, k))
top = np.argsort(-D.max(0))[:6]
print('  worst columns: ' + '; '.join('%s dev %.1e colmax %.1e' % (ka[c], D[:, c].max(), cm[c]) for c in top))
big = cm > 1e-9
print('  worst dev among columns with colmax > 1e-9 kmol: %.2e (%s);  columns with colmax <= 1e-9: %.2e'
      % (D[:, big].max(), ka[int(np.argmax(np.where(big, D.max(0), 0)))], D[:, ~big].max() if (~big).any() else 0))
# step ends: fresh runs to E, no cap
for E in (5e-3, 2e-2, 5e-2, 1e-1):
    ra, _ = run('nox02', integ, 'dense', rtol=rt, end=E, tag='n2e1')
    rb, _ = run('nox02', integ, 'sparse', rtol=rt, end=E, tag='n2e2')
    _, X = mat(ra[-1:]); kk, Y = mat(rb[-1:])
    sc = np.maximum(np.abs(X), np.abs(Y)); sc[sc == 0] = 1
    rel = (np.abs(X - Y) / sc)[0]
    m = sc[0] > 1e-9
    print('  step end E=%.0e: max rel dev, entries > 1e-9 kmol: %.1e;  all entries: %.1e (%s, value %.1e)' % (E, rel[m].max(), rel.max(), kk[int(rel.argmax())], sc[0, int(rel.argmax())]))
