#!/usr/bin/env python3
"""Independent recomputation of filter04_leafFilter_sameAsFiltrateWash.

Run:  python3 leafClosedForm.py [result.json]

Written from Geankoplis, Hersel & Lepek (5th ed.) section 24.2, not from the
C++.  The water's viscosity and density are the ones the case's package
publishes (mu_liquid_Pa_s, rho_liquid): they are INPUTS here, not checked.

  c_S = rho c_x / (1 - m c_x)                         (eq. 24.2-10)
  K_p = mu alpha c_S / (A^2 dp),  B = mu R_m / (A dp) (eqs. 24.2-14, -15)
  t_f = K_p V_f^2 / 2 + B V_f                         (eq. 24.2-17)
  wash along the filtrate's path at the final rate 1/(K_p V_f + B)
                                                      (eq. 24.2-19)
  t_w = V_w (K_p V_f + B),  V_w = Q_w V_f / Q_f (the wash per cycle)
  t_c = t_f + t_w + t_clean;  presses = Q_f t_c / V_f

The values printed are the hand-written rows at the top of ../expected.
"""
import json, sys

MW_CaCO3, MW_W = 100.0869, 18.015          # the case's records (constant/components)
mu, rho = 8.8885596324e-4, 996.910236552    # the package's water, as published
ws = 1.7098859 * MW_CaCO3 / 3600            # 0/slurry
wl = 413.0044172 * MW_W / 3600
ww = 40.3504713 * MW_W / 3600               # 0/washWater
dp, alpha, Rm, A, Vf, tclean, m = 338e3, 1.863e11, 10.63e10, 17.46, 3.37, 1200.0, 2.0
cx = ws / (ws + wl)
cS = rho * cx / (1 - m * cx)
Kp = mu * alpha * cS / (A * A * dp)
B = mu * Rm / (A * dp)
tf = 0.5 * Kp * Vf ** 2 + B * Vf
Qf = (wl - (m - 1) * ws) / rho
Vw = (ww / rho) * Vf / Qf
tw = Vw * (Kp * Vf + B)
tc = tf + tw + tclean
rows = {"Kp_s_m6": Kp, "B_s_m3": B, "filtrationTime_s": tf, "washTime_s": tw,
        "cycleTime_s": tc, "pressesRequired": Qf * tc / Vf}
print("through-washing (filter02's path) on the same inputs: t_w = %.10g s, "
      "four times this case's" % (4 * tw))
for k, v in rows.items():
    print("  %-18s %.12g" % (k, v))
if len(sys.argv) > 1:
    J = json.load(open(sys.argv[1]))
    k = J["kpis"]["leaf"]
    for key, mine in rows.items():
        print("  engine %-18s %.12g  rel %.2e" % (key, k[key], k[key] / mine - 1))
