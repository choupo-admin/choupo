#!/usr/bin/env python3
"""Item 1, the plan's section 3 consequences (a) and (b): water's anchored
Rackett leaf (from data/standards/components/water.dat) against the reference
equation IAPWS95 (today's engine, pure-fluid route), and IAPWS95 at the
pressures of the three 25 C pump cases.

usage (repository root):
  python3 -I docs/reviews/2026-11-13-density-pilot-plan/item1_consequences.py <scratch_dir>
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import propscase as pc
scratch = os.path.abspath(sys.argv[1])
t = open('data/standards/components/water.dat').read()
g = lambda k: float(re.search(r'^' + k + r'\s+([-+0-9.eE]+)', t, re.M).group(1))
V0, Tc, Pc, w, MW = g('Vliq'), g('Tc'), g('Pc') * 1e5, g('omega'), g('MW')
R = 8.314462618
rk = lambda T: (R * Tc / Pc) * (0.29056 - 0.08775 * w) ** (1 + (1 - T / Tc) ** (2 / 7))
anch = lambda T: MW / 1000 / (V0 * rk(T) / rk(298.15))
d = pc.make_case(scratch, 'i1c', ['water'], pc.ROUTES['IAPWS95'])
Ts = [284.30, 293.15, 298.15, 314.94, 348.15, 355.96]
o, _ = pc.scan(d, [(1e5, Ts)], {'water': 1.0}, ['rho_liquid_water'])
print('(a) T_K\tanchoredRackett\tIAPWS95_1bar\tanchored/ref-1_pct   (plan: -0.99 % at 284.3 K, +1.04 % at 314.9 K, +2.99 % at 356 K; -2.6 % at 348 K quoted as the generic route)')
for T in Ts:
    r = o[0][T]['rho_liquid_water']
    print(f'{T}\t{anch(T):.4f}\t{r:.4f}\t{(anch(T)/r-1)*100:+.3f}')
P = [1.0, 2.0, 3.0, 53.36539, 56.14637]
o2, _ = pc.scan(d, [(p * 1e5, [298.15]) for p in P], {'water': 1.0}, ['rho_liquid_water'])
print('(b) P_bar\tIAPWS95_298.15K\tvs_flat_996.9563_pct   (plan: 997.092 / 999.398 / 999.518 / 997.137; +0.0088 % at 1 bar)')
for p, r in zip(P, o2):
    v = r[298.15]['rho_liquid_water']
    print(f'{p}\t{v:.4f}\t{(v/996.9563-1)*100:+.4f}')
