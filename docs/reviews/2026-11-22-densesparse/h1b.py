"""H1b: the same comparison with the step cap removed (free stepping, dense output) and with a write grid so FINE
that every write point lies at or near a step end; and the dense-output sensitivity: write interval w -> dev.
usage: h1b.py integ"""
import sys, re
from common import *
integ = sys.argv[1]
for w in (3e-3, 1e-3, 3e-4, 1e-4, 3e-5, 1e-5):
    a, oa = run('nox03', integ, 'dense', end=3e-2 if w >= 1e-4 else 3e-3, write=w, atol=1e-15, tag='ga', env={'CHOUPO_ODE_STATS': '1'})
    b, ob = run('nox03', integ, 'sparse', end=3e-2 if w >= 1e-4 else 3e-3, write=w, atol=1e-15, tag='gb', env={'CHOUPO_ODE_STATS': '1'})
    d, k = devs(a, b)
    st = lambda o: re.search(r'steps=(\d+) accepted=(\d+) rejected=(\d+)', o).groups()
    print('write %.0e rows %d: dense vs sparse max dev/colmax %.2e (%s);  steps(dense)=%s steps(sparse)=%s' % (w, len(a), d, k, st(oa), st(ob)))
