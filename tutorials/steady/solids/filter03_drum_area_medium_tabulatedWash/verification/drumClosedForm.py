#!/usr/bin/env python3
"""Independent recomputation of filter03_drum_area_medium_tabulatedWash.

Run:  python3 drumClosedForm.py [result.json]

Written from Geankoplis, Hersel & Lepek (5th ed.) section 24.2, not from the
C++.  The water's viscosity and density are the ones the case's package
publishes (mu_liquid_Pa_s, rho_liquid): they are INPUTS here, not checked.

  alpha = alpha0 dp^s                          (eq. 24.2-11)
  c_S   = rho c_x / (1 - m c_x)                (eq. 24.2-10)
  Q_f   = (liquid - (m - 1) solids) / rho      (the cake keeps (m - 1) kg of
                                                liquor per kg of dry solids)
  drum, area declared: f t_c = K_p V^2/2 + B V with V = Q_f t_c,
        K_p = mu alpha c_S/(A^2 dp), B = mu R_m/(A dp)  (eqs. 24.2-14,-15,-17,
        -23), so t_c = (f - B Q_f) 2 / (K_p Q_f^2)
  wash at the final filtration rate 1/(K_p V + B)        (eq. 24.2-19)
        t_w = V_w (K_p V + B), V_w = Q_w V / Q_f (the wash per revolution)
  wash ratio N = Q_w / (cake liquor volume flow); R(N) interpolated linearly
        in (N, ln R) on the declared wash test (Perry eq. 18-71 coordinates).

The values printed are the hand-written rows at the top of ../expected.
"""
import json, math, sys

MW_CaCO3, MW_W = 100.0869, 18.015          # the case's records (constant/components)
mu, rho = 8.8885596324e-4, 996.910236552        # the package's water, as published
ws = 5.3448833 * MW_CaCO3 / 3600                 # 0/slurry
wl = 125.7755870 * MW_W / 3600
ww = 39.9660732 * MW_W / 3600                    # 0/washWater
dp, f, A, Rm, m = 67.0e3, 0.33, 6.0, 1.0e10, 2.0
alpha = 4.37e9 * dp ** 0.3
cx = ws / (ws + wl)
cS = rho * cx / (1 - m * cx)
Qf = (wl - (m - 1) * ws) / rho
Kp = mu * alpha * cS / (A * A * dp)
B = mu * Rm / (A * dp)
tc = (f - B * Qf) * 2.0 / (Kp * Qf * Qf)
V = Qf * tc
tf = 0.5 * Kp * V * V + B * V
Qw = ww / rho
tw = (Qw * V / Qf) * (Kp * V + B)
N = Qw / ((m - 1) * ws / rho)
Ntab = [0.0, 0.5, 1.0, 1.5, 2.0, 3.0]
Rtab = [1.0, 0.60, 0.30, 0.14, 0.07, 0.02]
for j in range(len(Ntab) - 1):
    if N <= Ntab[j + 1]:
        t = (N - Ntab[j]) / (Ntab[j + 1] - Ntab[j])
        Rrem = math.exp((1 - t) * math.log(Rtab[j]) + t * math.log(Rtab[j + 1]))
        break
rows = {"cycleTime_s": tc, "filtrationTime_s": tf, "Kp_s_m6": Kp, "B_s_m3": B,
        "washTime_s": tw, "washRatio": N, "soluteRemaining": Rrem}
print("f t_c = %.10g s against t_f = %.10g s (the formation-time identity)" % (f * tc, tf))
print("without the B V term t_c would be %.10g s" % (2.0 * f / (Kp * Qf * Qf)))
for k, v in rows.items():
    print("  %-18s %.12g" % (k, v))
if len(sys.argv) > 1:
    J = json.load(open(sys.argv[1]))
    k = J["kpis"]["drum"]
    for key, mine in rows.items():
        print("  engine %-18s %.12g  rel %.2e" % (key, k[key], k[key] / mine - 1))
