#!/usr/bin/env python3
"""check_reactor_limits R2: autocatalytic CSTR (cstr04 edited: isothermal 350 K, r = k c_EtOH c_EtAc,
A = 1e5, Ea = 70 kJ/mol), nontrivial root X = 1 - Q^2/(V k F_A0), Q = F v_mix(350 K).
v_mix from rackett_mix.py's arithmetic (ideal mixing of anchored-Rackett volumes) and, for the
old basis, the 25 C volumes.  usage: autocat_root.py <repo-root> <scratch-dir>"""
import sys, math, importlib.util, os
root, scratch = sys.argv[1], sys.argv[2]
here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('rm', here + '/rackett_mix.py')
rm = importlib.util.module_from_spec(spec); spec.loader.exec_module(rm)
e, a = rm.rec(root, 'ethanol'), rm.rec(root, 'aceticAcid')
F = 1.0 / 3.6; FA0 = F / 2; V = 0.005
out = []
for R in (8.314462618, 8.314):
    k = 1e5 * math.exp(-7.0e4 / (R * 350.0))
    for label, v in (('kernel 350 K', 0.5 * rm.vliq(e, 350) + 0.5 * rm.vliq(a, 350)),
                     ('old 25 C volumes', 0.5 * e['Vliq'] + 0.5 * a['Vliq'])):
        Q = F * v
        X = 1 - Q * Q / (V * k * FA0)
        out.append(f'R={R} k={k:.6e} m3/mol/s  {label}: v={v:.6e} Q={Q:.6e} X={X:.6f}')
open(scratch + '/autocat_root.txt', 'w').write('\n'.join(out) + '\n'); print('\n'.join(out))
