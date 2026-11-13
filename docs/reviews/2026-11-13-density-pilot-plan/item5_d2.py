#!/usr/bin/env python3
"""Item 5, D2 (water + ethanol at 0.1 MPa, 298.15 and 323.15 K): the
intended method against plausible WRONG implementations.

The per-point measured files are NOT in git (the batch README: regenerated
from the user's ThermoML mirror, absent here), so no implementation can be
scored against the measurements in this review.  What is computed:

 (1) delta: each wrong implementation's density relative to the INTENDED
     one (volume additivity, water leaf = the reference equation IAPWS95 at
     T through today's engine, ethanol leaf = anchored Rackett at T from
     data/standards/components/ethanol.dat), on 53 compositions
     x_ethanol 0.003..0.95 per isotherm.
 (2) a PROXY for the measurements, to say which side of the thresholds each
     variant falls: measured = M / (V_ideal + V^E), V^E a two-term
     Redlich-Kister curve whose minimum is the -1.078 cm3/mol at
     x_ethanol = 0.40, 298.15 K that baseline/d2_summary.txt (on main)
     reports, the same curve at 323.15 K, and pure leaves taken as exact.
     Its own AAD (the 'excess alone' floor) is printed to compare with the
     summary's 1.751 % / max 3.415 %.  The proxy is an ESTIMATE; the sign
     argument in the report does not depend on it.

usage (repository root):
  python3 -I docs/reviews/2026-11-13-density-pilot-plan/item5_d2.py <scratch_dir> > item5_d2.tsv
"""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import propscase as pc
scratch = os.path.abspath(sys.argv[1])
R = 8.314462618
Mw, Me = 18.015, 46.069

def rec(name):
    t = open(f'data/standards/components/{name}.dat').read()
    g = lambda k: float(re.search(r'^' + k + r'\s+([-+0-9.eE]+)', t, re.M).group(1))
    return g('Vliq'), g('Tc'), g('Pc') * 1e5, g('omega')

def rackett(T, Tc, Pc, w):
    return (R * Tc / Pc) * (0.29056 - 0.08775 * w) ** (1 + (1 - T / Tc) ** (2 / 7))

Ve0, Tce, Pce, we = rec('ethanol')
Vw0, Tcw, Pcw, ww = rec('water')
def v_eth(T): return Ve0 * rackett(T, Tce, Pce, we) / rackett(298.15, Tce, Pce, we)
def v_wat_anch(T): return Vw0 * rackett(T, Tcw, Pcw, ww) / rackett(298.15, Tcw, Pcw, ww)
d = pc.make_case(scratch, 'd2_water', ['water'], pc.ROUTES['IAPWS95'])
o, _ = pc.scan(d, [(1e5, [298.15, 323.15])], {'water': 1.0}, ['rho_liquid_water'])
rho_w = {T: o[0][T]['rho_liquid_water'] for T in (298.15, 323.15)}
def v_wat(T): return Mw / 1000.0 / rho_w[T]

# Redlich-Kister V^E = x(1-x)(A0 + A1(1-2x)), x = x_ethanol; minimum -1.078e-6 m3/mol at x = 0.40
def VE(x, A0, A1): return x * (1 - x) * (A0 + A1 * (1 - 2 * x))
def solve_rk():
    # dVE/dx = 0 at 0.4 and VE(0.4) = -1.078e-6: linear in (A0, A1)
    x = 0.4
    # VE = a0*A0 + a1*A1 ; dVE = b0*A0 + b1*A1
    a0 = x * (1 - x); a1 = x * (1 - x) * (1 - 2 * x)
    b0 = 1 - 2 * x; b1 = (1 - 2 * x) * (1 - 2 * x) - 2 * x * (1 - x)
    det = a0 * b1 - a1 * b0
    A0 = (-1.078e-6 * b1) / det; A1 = (1.078e-6 * b0) / det
    return A0, A1
A0, A1 = solve_rk()
# Calibrate the proxy's amplitude so that the INTENDED method's AAD at
# 298.15 K equals the measured baseline there (baseline/d2_summary.txt:
# Pecar 0.1 MPa, 298.15 K, AAD 1.762 %; at 298.15 K the intended method and
# today's differ by < 0.01 %, column vii below).
def _aad298(scale):
    e = []
    for i in range(53):
        x = 0.003 + (0.95 - 0.003) * i / 52
        Vi = x * Ve0 + (1 - x) * (Mw / 1000.0 / 997.047)
        e.append(abs(Vi / (Vi + scale * x * (1 - x) * (A0 + A1 * (1 - 2 * x))) - 1) * 100)
    return sum(e) / len(e)
lo, hi = 0.1, 2.0
for _ in range(60):
    mid = 0.5 * (lo + hi)
    lo, hi = (mid, hi) if _aad298(mid) < 1.762 else (lo, mid)
SCALE = 0.5 * (lo + hi)
A0 *= SCALE; A1 *= SCALE

xs = [0.003 + (0.95 - 0.003) * i / 52 for i in range(53)]

def rho_intended(T, x, ve=v_eth, vw=v_wat):
    M = (x * Me + (1 - x) * Mw) / 1000
    return M / (x * ve(T) + (1 - x) * vw(T))

def variants(T, x):
    M = (x * Me + (1 - x) * Mw) / 1000
    rw, re_ = Mw / 1000 / v_wat(T), Me / 1000 / v_eth(T)
    w = x * Me / (x * Me + (1 - x) * Mw)
    return {
        'i_intended': rho_intended(T, x),
        'ii_massFractionAverage': w * re_ + (1 - w) * rw,
        'iii_moleFractionAverage': x * re_ + (1 - x) * rw,
        'iv_leavesFrozenAt298': rho_intended(298.15, x) * 0 + M / (x * v_eth(298.15) + (1 - x) * v_wat(298.15)),
        'v_componentsSwapped': M / (x * v_wat(T) + (1 - x) * v_eth(T)),
        'vi_moleReadAsMass': 1.0 / (x / re_ + (1 - x) / rw),
        'vii_waterLeafAnchoredRackett(today)': M / (x * v_eth(T) + (1 - x) * v_wat_anch(T)),
    }

print('# rho_water IAPWS95 (engine): ' + ', '.join(f'{T} K {v:.4f}' for T, v in rho_w.items())
      + f'; ethanol anchored Rackett: 298.15 K {Me/1000/v_eth(298.15):.3f}, 323.15 K {Me/1000/v_eth(323.15):.3f} kg/m3'
      + f'; RK proxy A0={A0:.4e} A1={A1:.4e} m3/mol (amplitude x{SCALE:.4f} to give the intended AAD 1.762 % at 298.15 K)')
names = list(variants(298.15, 0.5).keys())
print('T_K\tvariant\tdelta_vs_intended_mean_pct\tdelta_min_pct\tdelta_max_pct\tproxyAAD_pct\tproxyMax_pct\t'
      'PASS_Pecar(AAD<=2.0,max<=3.6)\tPASS_Rehman(AAD<=2.3,max<=3.7)')
pool = {n: [] for n in names}
for T in (298.15, 323.15):
    for n in names:
        dl, er = [], []
        for x in xs:
            v = variants(T, x)
            M = (x * Me + (1 - x) * Mw) / 1000
            meas = M / (x * v_eth(T) + (1 - x) * v_wat(T) + VE(x, A0, A1))
            dl.append((v[n] / v['i_intended'] - 1) * 100)
            er.append((v[n] / meas - 1) * 100)
        pool[n] += er
        aad = sum(abs(e) for e in er) / len(er); mx = max(abs(e) for e in er)
        print(f'{T}\t{n}\t{sum(dl)/len(dl):+.3f}\t{min(dl):+.3f}\t{max(dl):+.3f}\t{aad:.3f}\t{mx:.3f}\t'
              f'{"pass" if aad <= 2.0 and mx <= 3.6 else "FAIL"}\t{"pass" if aad <= 2.3 and mx <= 3.7 else "FAIL"}')
for n in names:
    er = pool[n]
    aad = sum(abs(e) for e in er) / len(er); mx = max(abs(e) for e in er)
    print(f'both\t{n}\t-\t-\t-\t{aad:.3f}\t{mx:.3f}\t{"pass" if aad <= 2.0 and mx <= 3.6 else "FAIL"}\t'
          f'{"pass" if aad <= 2.3 and mx <= 3.7 else "FAIL"}')

# ---- From the MEASURED baseline on main to the intended method -------------
# baseline/d2_summary.txt gives today's AAD per isotherm at 0.1 MPa (Pecar:
# 1.762 % at 298.15 K, 2.943 % at 323.15 K; bias = -AAD, so EVERY point is
# low).  Today differs from the intended method only in the water leaf
# (anchored Rackett vs IAPWS95; the ethanol leaf is the same anchored
# Rackett), and that difference (vii) is negative at every composition.  So
# pointwise |e_intended| = |e_today| - |delta_vii| while e_intended stays <= 0,
# and AAD_intended = AAD_today - mean|delta_vii| over the SAME points.
# Pecar's 53 compositions are not on main: uniform 0.003..0.95 is used, and
# the extremes of delta_vii bound the answer whatever the grid.
print('# measured-baseline transfer (today -> intended, water leaf only):')
for T, aad_today in ((298.15, 1.762), (323.15, 2.943)):
    dv = [abs(variants(T, x)['vii_waterLeafAnchoredRackett(today)'] / variants(T, x)['i_intended'] - 1) * 100 for x in xs]
    print(f'#  Pecar {T} K: today AAD {aad_today} % -> intended ~ {aad_today - sum(dv)/len(dv):.3f} % '
          f'(bounds {aad_today - max(dv):.3f} .. {aad_today - min(dv):.3f} over any grid)')
xr = [0.1 * i for i in range(1, 10)]
dv = []
for T in (298.15, 323.15):
    dv += [abs(variants(T, x)['vii_waterLeafAnchoredRackett(today)'] / variants(T, x)['i_intended'] - 1) * 100 for x in xr]
print(f'#  Rehman 298.15-323.15 K (today AAD 2.52 %, thresholds note 3.2): intended ~ {2.52 - sum(dv)/len(dv):.3f} % '
      f'if its 54 points split evenly over the two isotherms at x 0.1..0.9 (threshold 2.3 %)')
