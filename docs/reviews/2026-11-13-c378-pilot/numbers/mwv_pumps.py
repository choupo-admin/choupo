#!/usr/bin/env python3
"""massWithoutVolume pumps: v_mix = x_water * M_water / rho_water(T,P) (IAPWS-95, own code);
x_water recovered from the OLD golden's flat v = x_water * Vliq_water (1.807e-5).
usage: mwv_pumps.py <repo-root> <scratch-dir>"""
import sys, importlib.util, os
root, scratch = sys.argv[1], sys.argv[2]
here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('i95', here + '/iapws95.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
C = m.load(root); MW = 0.018015; Vliq = 1.807e-5
cases = [  # name, T, P_in, old v, new engine v, F kmol/s, dP
    ('membrane27 HPpump', 298.15, 200000, 1.78820715915e-05, 1.78796349436e-05, 0.12522195, 5300000),
    ('membrane27 Booster', 298.15, 5336539.43143, 1.78766221171e-05, 1.78329752286e-05, 0.127146157408, 163460.568565),
]
out = []
for name, T, P, vold, veng, F, dP in cases:
    xw = vold / Vliq
    v = xw * MW / m.rho_liquid(C, T, P)
    out.append(f'{name}: x_water {xw:.6f}  v_mine {v:.10e}  v_engine {veng:.10e}  rel {v/veng-1:+.2e}  W_hyd_mine {F*1000*v*dP:.4f} W')
open(scratch + '/mwv_pumps.txt', 'w').write('\n'.join(out) + '\n'); print('\n'.join(out))
