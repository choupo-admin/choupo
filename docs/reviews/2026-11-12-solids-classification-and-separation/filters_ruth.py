#!/usr/bin/env python3
"""Independent recomputation of filter01 (rotary drum) and filter02 (batch press with
through-washing): Ruth's constant-pressure law as Geankoplis, Hersel & Lepek 5th ed.
section 24.2 prints it.

Run:  python3 filters_ruth.py [filter01_result.json filter02_result.json]

filter01 (G Example 24.2-4): alpha = 4.37e9 (-dp)^0.3; c_S = rho c_x/(1 - m c_x)
  (eq. 24.2-10); V/(A t_c) = [2 f (-dp) / (t_c mu alpha c_S)]^0.5 (eq. 24.2-24, R_m = 0);
  A = Q_f / (V/(A t_c)), Q_f = solids rate / c_S.
filter02 (G Examples 24.2-1..3): K_p = mu alpha c_S/(A^2 (-dp)), B = mu R_m/(A (-dp))
  (eqs. 24.2-14,-15); t_f = K_p V^2/2 + B V (eq. 24.2-17); through-washing rate
  1/(4 (K_p V_f + B)) (eq. 24.2-20); t_w = V_w / rate; t_c = t_f + t_w + t_clean.
Each is done twice: with Geankoplis's own water (mu 8.937e-4 Pa s, rho 997 kg/m3) and
with the property values the engine publishes (its package's water), so the book's
rounding and the property difference are separated.
"""
import json, math, sys

MW_CaCO3, MW_W = 100.0869, 18.01528

def drum(mu, rho, ws=5.3448833 * MW_CaCO3 / 3600, wl=125.7755870 * MW_W / 3600):
    dp, f, tc, m = 67.0e3, 0.33, 250.0, 2.0
    alpha = 4.37e9 * dp ** 0.3
    cx = ws / (ws + wl)
    cS = rho * cx / (1 - m * cx)
    Qf = (wl - (m - 1) * ws) / rho
    flux = math.sqrt(2 * f * dp / (tc * mu * alpha * cS))
    return dict(alpha=alpha, cS=cS, Qf=Qf, A=Qf / flux, cx=cx, slurry=ws + wl)

def press(mu, rho):
    dp, alpha, Rm, A, Vf, tclean = 338e3, 1.863e11, 10.63e10, 17.46, 3.37, 1200.0
    ws, wl, ww = 1.7098859 * MW_CaCO3 / 3600, 413.0044172 * MW_W / 3600, 40.3504713 * MW_W / 3600
    m = 2.0
    cx = ws / (ws + wl)
    cS = rho * cx / (1 - m * cx)
    Kp = mu * alpha * cS / (A * A * dp)
    B = mu * Rm / (A * dp)
    tf = 0.5 * Kp * Vf ** 2 + B * Vf
    Qf = (wl - (m - 1) * ws) / rho
    Vw = (ww / rho) * Vf / Qf
    rate = 1.0 / (4 * (Kp * Vf + B))
    tw = Vw / rate
    tc = tf + tw + tclean
    return dict(cS=cS, Kp=Kp, B=B, tf=tf, Vw=Vw, tw=tw, tc=tc, presses=Qf * tc / Vf)

book1 = dict(alpha=1.225e11, cS=308.1, Qf=4.823e-4, A=6.60)
book2 = dict(Kp=37.93, B=16.10, tf=269.7, tw=194.0, tc=1663.8)
for lab, mu, rho in (("Geankoplis water", 8.937e-4, 997.0), ("engine water", 8.8885596324e-4, 996.910236552)):
    d = drum(mu, rho)
    print("filter01 [%s]: alpha %.6g  c_S %.5f  Q_f %.6g m3/s  A %.5f m2 (book 6.60: %+.2f %%)"
          % (lab, d["alpha"], d["cS"], d["Qf"], d["A"], 100 * (d["A"] / 6.60 - 1)))
for lab, mu, rho in (("Geankoplis water", 8.937e-4, 997.0), ("engine water", 8.8885596324e-4, 996.910236552)):
    p = press(mu, rho)
    print("filter02 [%s]: c_S %.4f  K_p %.4f  B %.4f  t_f %.3f  V_w %.4f  t_w %.3f  t_c %.3f  presses %.4f"
          % (lab, p["cS"], p["Kp"], p["B"], p["tf"], p["Vw"], p["tw"], p["tc"], p["presses"]))
    print("      vs book: K_p %+.2f %%  B %+.2f %%  t_f %+.2f %%  t_w %+.2f %%  t_c %+.2f %%"
          % tuple(100 * (p[k] / book2[k] - 1) for k in ("Kp", "B", "tf", "tw", "tc")))

if len(sys.argv) > 2:
    eng_mu = {}
    for path, unit in ((sys.argv[1], "drum"), (sys.argv[2], "press")):
        J = json.load(open(path))
        k = J["kpis"][unit]
        mu, rho = k["mu_liquid_Pa_s"], k["rho_liquid"]
        if unit == "drum":
            d = drum(mu, rho)
            pairs = (("alpha_m_kg", d["alpha"]), ("cS_kg_m3", d["cS"]), ("filtrate_m3_s", d["Qf"]), ("area_m2", d["A"]))
        else:
            p = press(mu, rho)
            pairs = (("Kp_s_m6", p["Kp"]), ("B_s_m3", p["B"]), ("filtrationTime_s", p["tf"]),
                     ("washTime_s", p["tw"]), ("cycleTime_s", p["tc"]), ("pressesRequired", p["presses"]))
        for key, mine in pairs:
            ev = k[key]
            print("  %s %-18s engine %-14.9g mine %-14.9g rel %.2e" % (unit, key, ev, mine, ev / mine - 1))
