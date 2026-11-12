#!/usr/bin/env python3
"""Independent hand check of the two-solids adiabatic mixer probe
(probe_two_solids_mixer.sh): mechanical mixture -> SUM n_i h_i(T_in,i) = SUM n_i h_i(T_out).
Data copied from data/standards/components/{silica,CaCO3}.dat (Robie-Hemingway Cp polynomials,
CODATA dHf_298).  Run: python3 -I hand_check_two_solids.py"""
def H(c, T, T0=298.15):
    a0, a1, a2 = c
    f = lambda t: a0*t + a1*t**2/2 + a2*t**3/3
    return f(T) - f(T0)
sil = (-910700.0, (8.24309, 0.149929, -9.34656e-05))
cal = (-1207600.0, (29.8993, 0.224617, -1.49637e-04))
n = 1.0/3600  # kmol/s each
hA = sil[0] + H(sil[1], 300.0); hB = cal[0] + H(cal[1], 400.0)
Hin = n*(hA + hB)  # kW
lo, hi = 300.0, 400.0
for _ in range(200):
    m = 0.5*(lo+hi)
    Hm = n*(sil[0]+H(sil[1], m) + cal[0]+H(cal[1], m))
    lo, hi = (m, hi) if Hm < Hin else (lo, m)
print("h_A J/mol", round(hA, 6), " engine H(A)=-910617.262508")
print("h_B J/mol", round(hB, 6), " engine H(B)=-1198439.16747")
print("H_in kW", round(Hin, 9), " engine -585.849008328")
print("T_out K", round(0.5*(lo+hi), 6), " engine 366.293259541")
mA, mB = n*60.08, n*100.0869
print("mass out kg/s", mA+mB, " engine F_solid_mass 0.0444908055556")
rhoA, rhoB = 2650.0, 2710.0
w = mA/(mA+mB)
print("mixture density, volumes additive (harmonic):", 1/(w/rhoA+(1-w)/rhoB))
print("mixture density, mass-weighted arithmetic   :", w*rhoA+(1-w)*rhoB)
