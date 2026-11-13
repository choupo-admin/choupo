#!/usr/bin/env python3
"""rankine02 feedPump: recompute W_hyd, W_shaft and T_out from IAPWS-95 (own implementation).
usage: rankine_pump.py <repo-root> <scratch-dir>"""
import sys, importlib.util
root, scratch = sys.argv[1], sys.argv[2]
spec = importlib.util.spec_from_file_location('i95', __file__.rsplit('/',1)[0] + '/iapws95.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
C = m.load(root); MW = 0.018015
Tin, Pin, Pout, F, eta = 446.515894355, 858590.397228, 8.0e6, 1.0, 0.8   # F mol/s (0.001 kmol/s)
rin = m.rho_liquid(C, Tin, Pin, 900); v = MW / rin
Whyd = F * v * (Pout - Pin); Wsh = Whyd / eta
hin = m.props(C, rin, Tin)['h']
# isentropic-ish check: integral of v dP along T=Tin (upper bound) and the average v
import math
N = 200; Wint = 0
for k in range(N):
    P = Pin + (k + .5) * (Pout - Pin) / N
    Wint += MW / m.rho_liquid(C, Tin, P, 900) * (Pout - Pin) / N
hout_target = hin + Wsh / MW / F
lo, hi = Tin, Tin + 5
for _ in range(80):
    T = .5 * (lo + hi); r = m.rho_liquid(C, T, Pout, 900)
    if m.props(C, r, T)['h'] < hout_target: lo = T
    else: hi = T
res = dict(rho_in=rin, v=v, W_hyd=Whyd, W_shaft=Wsh, W_isothermal_integral=Wint, T_out=T, dT=T - Tin)
open(scratch + '/rankine_pump.txt', 'w').write(repr(res) + '\n')
for k, val in res.items(): print(k, val)
