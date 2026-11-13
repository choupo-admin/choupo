#!/usr/bin/env python3
"""Evaluate the NaOH-water solution law from the record's coefficients (own arithmetic),
and recompute liquidDensity03/04 residence times and the point's box span.
usage: olsson_law.py <repo-root> <scratch-dir>"""
import re, sys
root, scratch = sys.argv[1], sys.argv[2]
t = open(root + '/data/standards/parameters/solution/NaOH-water.dat').read()
B = [[float(v) for v in re.search(r'\b' + k + r'\s*\(([^)]*)\)', t).group(1).split()] for k in ('b1', 'b2', 'b3')]
def rho(T, xw):
    tc = T - 273.15
    b = [sum(c * xw ** (i / 2) for i, c in enumerate(row)) for row in B]
    return b[0] + b[1] * tc + b[2] * tc * tc
out = []
out.append(('x=1, 20 C', rho(293.15, 1.0)))
out.append(('x=0.5, 20 C', rho(293.15, 0.5)))
out.append(('x=0.8, 303.15 K', rho(303.15, 0.8)))
out.append(('x=0.8, 333.15 K', rho(333.15, 0.8)))
# liquidDensity03: 720 kg/h NaOH + 2880 kg/h water = 1 kg/s, V = 1 m3 -> tau = rho
out.append(('tau liquidDensity03 [s] = rho', rho(303.15, 2880 / 3600)))
# box span of the measured point: T 301.65..304.65, w_NaOH 0.199..0.201
vals = [rho(T, 1 - w) for T in (301.65, 303.15, 304.65) for w in (0.199, 0.2, 0.201)]
out.append(('box min', min(vals))); out.append(('box max', max(vals)))
out.append(('box half-span', (max(vals) - min(vals)) / 2))
out.append(('max |law - law(centre)| over box', max(abs(v - rho(303.15, 0.8)) for v in vals)))
with open(scratch + '/olsson_law.txt', 'w') as f:
    for k, v in out: print(k, v); f.write(f'{k} {v}\n')
# derivatives at the D3b point (central differences)
dT = (rho(303.15 + 0.01, 0.8) - rho(303.15 - 0.01, 0.8)) / 0.02
dw = (rho(303.15, 0.8 - 1e-5) - rho(303.15, 0.8 + 1e-5)) / 2e-5   # d rho / d w[NaOH]
with open(scratch + '/olsson_law.txt', 'a') as f:
    for k, v in (('drho/dT at 303.15 K, w_NaOH 0.2', dT), ('drho/dw_NaOH', dw),
                 ('law(333.15) - law(303.15) at w 0.2', rho(333.15, 0.8) - rho(303.15, 0.8))):
        print(k, v); f.write(f'{k} {v}\n')
