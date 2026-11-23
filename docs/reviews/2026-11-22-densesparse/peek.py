"""peek: one short run per linear solver, stats lines and a few state values.  usage: peek.py integ E"""
import sys
from common import *
integ = sys.argv[1]; E = float(sys.argv[2])
for ls in ('dense', 'sparse'):
    R, o = run('nox03', integ, ls, end=E, atol=1e-15, tag='x' + ls, env={'CHOUPO_ODE_STATS': '1'})
    print(ls, len(R), R[-1]['vessel.T'], R[-1]['vessel.n_NO2'], R[-1]['vessel.n_NO'])
    print([l.strip() for l in o.split('\n') if 'accepted' in l or 'free step' in l or 'ODE]' in l][:6])
