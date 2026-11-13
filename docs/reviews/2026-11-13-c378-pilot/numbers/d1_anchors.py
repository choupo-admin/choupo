#!/usr/bin/env python3
"""The 12 printed IAPWS-95 anchors of d1_anchors.tsv against my own IAPWS-95 evaluation
(sat rows at p_sat(T) by Maxwell, iso rows at the printed P).
usage: d1_anchors.py <repo-root> <scratch-dir>"""
import sys, os
root, scratch = sys.argv[1], sys.argv[2]
here = os.path.dirname(os.path.abspath(__file__))
g = {'__file__': here + '/psat_compare.py'}
exec(open(here + '/psat_compare.py').read().split('rows = []')[0], g)
m, C = g['m'], g['C']
out = []
for line in open(root + '/data/curation/batches/density_pilot/d1_anchors.tsv'):
    if line.startswith('#') or line.startswith('kind'): continue
    k, T, p, rho = line.split('\t')[:4]
    T, p, rho = float(T), float(p) * 1e6, float(rho)
    if k == 'sat':
        g['_state'].clear(); mine = g['psat95'](T)[1]
    else:
        mine = m.rho_liquid(C, T, p, 1000)
    out.append(f'{k} T {T} p {p:.6g}  printed {rho}  mine {mine:.4f}  rel {mine/rho-1:+.2e}')
open(scratch + '/d1_anchors.txt', 'w').write('\n'.join(out) + '\n'); print('\n'.join(out))
