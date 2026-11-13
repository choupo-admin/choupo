#!/usr/bin/env python3
"""Where water.dat's Antoine line crosses IAPWS-95's saturation line (both own evaluations).
usage: psat_cross.py <repo-root> <scratch-dir>"""
import sys, importlib.util, os
here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('pc', here + '/psat_compare.py')
src = open(here + '/psat_compare.py').read().split('rows = []')[0]
g = {'__file__': here + '/psat_compare.py'}
sys.argv = [sys.argv[0], sys.argv[1], sys.argv[2]]
exec(src, g)
out = []
g['_state'].clear()
T = 273.16
while T <= 330:
    p, rl = g['psat95'](T); pa = g['antoine'](T)
    out.append('T %.2f  Antoine/95-1 %+.6f' % (T, pa / p - 1))
    T += 2.0
open(sys.argv[2] + '/psat_cross.txt', 'w').write('\n'.join(out) + '\n')
print('\n'.join(out))
