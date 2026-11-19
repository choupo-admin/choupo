#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""C390: an independent hand calculation of pump01_water's delta h.

    python3 docs/audits/c390_pump_handcheck.py <P_out_Pa> <engine_T_out_K>

The engine's pump solves  H(T_out, P_out) = H(T_in, P_in) + w_real  on the generic
liquid surface (which now carries v (1 - alpha T) dP).  Here the same balance is
solved on water's REFERENCE equation (IAPWS-95, the independent Python implementation
of bin/curate/check_reference_eos.py, no engine code), and compared with the engine's
outlet temperature; the first-order hand formula is printed beside it.

    case: F = 36 kmol/h = 10 mol/s, W_shaft = 2 kW, T_in = 298.15 K, P_in = 1 bar
    w_real = W_shaft / F = 200 J/mol
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "bin", "curate"))
import check_reference_eos as C   # noqa: E402

M = 18.015268e-3                  # kg/mol (IAPWS-95's own M)
P_out = float(sys.argv[1]); T_engine = float(sys.argv[2])
T_in, P_in, w_real = 298.15, 1.0e5, 200.0

rec = C.read_record(os.path.join(C.RECDIR, "IAPWS95.dat"))
eq = C.Equation(rec)


def h_molar(T, p):                # J/mol, the reference equation's own datum
    s = eq.state(T, eq.density(T, p))
    return s["h"] * M


h_in = h_molar(T_in, P_in)
target = h_in + w_real
lo, hi = T_in, T_in + 5.0
for _ in range(80):
    mid = 0.5 * (lo + hi)
    if h_molar(mid, P_out) < target: lo = mid
    else: hi = mid
T_ref = 0.5 * (lo + hi)

# first-order hand formula: dh = cp dT + v (1 - alpha T) dP
rho = eq.density(T_in, P_in)
v = M / rho
d = 0.01
alpha = (1.0 / v) * (M / eq.density(T_in + d, P_in) - M / eq.density(T_in - d, P_in)) / (2 * d)
cp = eq.state(T_in, rho)["cp"] * M
dP = P_out - P_in
h_hand = v * (1 - alpha * T_in) * dP
dT_hand = (w_real - h_hand) / cp
print(f"w_real                         {w_real:.6f} J/mol")
print(f"v (1 - alpha T) dP (hand)      {h_hand:.4f} J/mol   (v {v:.6e} m3/mol, alpha {alpha:.4e} 1/K, dP {dP:.1f} Pa)")
print(f"dT first order (hand)          {dT_hand:.6f} K   (cp {cp:.4f} J/mol/K)")
print(f"dT on IAPWS-95 balance         {T_ref - T_in:.6f} K")
print(f"dT engine                      {T_engine - T_in:.6f} K   (deviation from IAPWS-95: "
      f"{100 * ((T_engine - T_in) / (T_ref - T_in) - 1):+.3f} %)")
