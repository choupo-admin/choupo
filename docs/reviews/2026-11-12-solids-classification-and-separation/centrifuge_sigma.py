#!/usr/bin/env python3
"""Independent recomputation of centrifuge01 (tubular bowl, Geankoplis 5th ed. Example
30.2-2) and centrifuge02 (disc stack, Sigma formula of de Haan et al. eq. 9.52 /
Ambler 1959 eq. 46 with C = 1).

Run:  python3 centrifuge_sigma.py [centrifuge01_result.json centrifuge02_result.json]

Tubular bowl, from the particle trajectory (Stokes, dr/dt = d^2 drho w^2 r/(18 mu)):
  a particle starting at r reaches r2 in tau = V/Q when ln(r2/r) <= k(d) = d^2 drho w^2 tau/(18 mu);
  Geankoplis's critical diameter (eq. 30.2-12): starting HALFWAY, r = (r1+r2)/2;
  with the feed spread uniformly over the annulus, E(d) = (r2^2 - r*^2)/(r2^2 - r1^2),
  r* = max(r1, r2 e^-k); d50 where E = 1/2.  Sigma = Q / (2 v_g(d50)), v_g = d^2 drho g/(18 mu).
  The cut sizes are found here by bisection on the trajectory, not from a Sigma formula.
Disc stack: Sigma = 2 pi n w^2 (r2^3 - r1^3) / (3 g tan theta);  d50 from Q = 2 v_g Sigma;
  E(d) = min(1, v_g(d) Sigma / Q).
"""
import json, math, sys

g = 9.80665

def bisect(f, lo, hi):
    for _ in range(200):
        mid = math.sqrt(lo * hi)
        if f(mid) > 0: hi = mid
        else: lo = mid
    return math.sqrt(lo * hi)

# ---- centrifuge01
rhoS, rhoL, mu = 1461.0, 801.0, 0.100
r2, r1, b, N = 0.02225, 0.00716, 0.1970, 23000 / 60.0
w = 2 * math.pi * N
V = math.pi * b * (r2 ** 2 - r1 ** 2)
Q = 0.02266163568 * 100 / 3600 / rhoL + 4.137552e-5 * 100 / 3600 / rhoS
tau = V / Q
k = lambda d: d * d * (rhoS - rhoL) * w * w * tau / (18 * mu)
E = lambda d: (r2 ** 2 - max(r1, r2 * math.exp(-k(d))) ** 2) / (r2 ** 2 - r1 ** 2)
rm = 0.5 * (r1 + r2)
Dpc = bisect(lambda d: k(d) - math.log(r2 / rm), 1e-9, 1e-4)
d50 = bisect(lambda d: E(d) - 0.5, 1e-9, 1e-4)
vg = lambda d: d * d * (rhoS - rhoL) * g / (18 * mu)
Sigma = Q / (2 * vg(d50))
Sigma_formula = w * w * V / (g * math.log(2 * r2 ** 2 / (r1 ** 2 + r2 ** 2)))
vwall = d50 * d50 * (rhoS - rhoL) * w * w * r2 / (18 * mu)
Re = d50 * vwall * rhoL / mu
print("centrifuge01: omega %.4f rad/s (book 2410)  V %.6e m3 (book 2.747e-4)  Q %.6e m3/s  tau %.3f s"
      % (w, V, Q, tau))
print("   Geankoplis D_pc (start at mid-layer) %.5f um (book 0.746, %+.2f %%);  E(D_pc) %.4f"
      % (Dpc * 1e6, 100 * (Dpc * 1e6 / 0.746 - 1), E(Dpc)))
print("   uniform-feed d50 %.5f um; Sigma from the trajectory %.4f m2 vs Ambler's closed form %.4f m2 (rel %.1e)"
      % (d50 * 1e6, Sigma, Sigma_formula, Sigma / Sigma_formula - 1))
print("   Re at d50 at the wall %.3e" % Re)
grid1 = [0.0] + [4e-6 / 1.41421356 ** (9 - j) for j in range(10)]
res1 = dict(omega_rad_s=w, bowlVolume_m3=V, cutSizeHalfLayer_Dpc_um=Dpc * 1e6, cutSize_d50_um=d50 * 1e6,
            sigma_m2=Sigma, Re_cut=Re, gradeEfficiency_at_Dpc=E(Dpc))

# ---- centrifuge02 (CaCO3 in water; densities and viscosity as the engine publishes them,
#      read from the JSON when given, else the catalogue values below)
def disc(rhoS, rhoL, mu, Q):
    n, R2, R1, th, N = 100, 0.10, 0.04, math.radians(40), 6000 / 60.0
    w = 2 * math.pi * N
    S = 2 * math.pi * n * w * w * (R2 ** 3 - R1 ** 3) / (3 * g * math.tan(th))
    d = math.sqrt(9 * mu * Q / ((rhoS - rhoL) * g * S))
    return S, d

if len(sys.argv) > 2:
    J1 = json.load(open(sys.argv[1]))
    k1 = J1["kpis"]["bowl"]
    for key, mine in res1.items():
        ev = k1.get(key)
        print("  bowl  %-26s engine %-14.9g mine %-14.9g rel %.2e" % (key, ev, mine, ev / mine - 1))
    J2 = json.load(open(sys.argv[2]))
    k2 = J2["kpis"]["stack"]
    S, d = disc(k2["rho_solid"], k2["rho_liquid"], k2["mu_liquid_Pa_s"], k2["feed_m3_s"])
    for key, mine in (("sigma_m2", S), ("cutSize_d50_um", d * 1e6)):
        ev = k2.get(key)
        print("  stack %-26s engine %-14.9g mine %-14.9g rel %.2e" % (key, ev, mine, ev / mine - 1))
    print("  stack E at the cut %.4f (engine gradeEfficiency_at_d50 %s)" % (0.5, k2.get("gradeEfficiency_at_d50")))
else:
    S, d = disc(2710.0, 997.0, 8.9e-4, (1.3538 * 100.0869 / 2710 + 551.2073 * 18.01528 / 997) / 3600)
    print("centrifuge02: Sigma %.3f m2;  d50 %.5f um (approximate properties; pass the JSONs for the exact ones)" % (S, d * 1e6))
