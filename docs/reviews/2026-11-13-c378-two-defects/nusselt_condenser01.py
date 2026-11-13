#!/usr/bin/env python3
"""Independent recomputation of condenser01_film_nusselt's Nusselt film.

The formula is the one src/unitOperations/heatTransfer/htc/NusseltFilm.H
evalCore states:  h = C [k^3 rho_l (rho_l - rho_v) g h_fg' / (mu L dT)]^(1/4),
C = 0.729 (horizontal tube), h_fg' = h_fg + 0.68 cp_l dT, L = tube OD.

Inputs, and where each was read (all from runs on the branch build):
  T_sat, T_wall, dT_film      condenser01 run, result JSON kpis (Tsat, T_wall, dT_film)
  T_f = (T_sat + T_wall)/2    PhaseChanger.cpp filmProps
  k_l, mu_l at (T_f, 1 bar)   choupoProps propertyPoint thermal_conductivity_liquid /
                              viscosity_liquid (the same package functions the unit calls)
  rho_l at (T_f, 1 bar)       choupoProps steamTables point (IF97 region 1)
  rho_v'' , rho_l' at T_sat   choupoProps steamTables points at p = 1 bar (1 -/+ 1e-9)
  h_fg = h'' - h'             the same two steamTables points
  cp_l = 75.5 J/(mol K) / M   the case's constant/components/water.dat liquidHeatCapacity
                              (the unit reads the record's cpLiquid, not IF97)
  geometry                    the case's system/flowsheetDict
"""
import math

# --- from the condenser01 run (kpis) ---------------------------------------
Tsat = 372.755918611
T_wall = 347.360656523
dT = 25.3952620879
h_engine = 9693.14598788
Q_engine_kW = -928.001272355
# --- from choupoProps (review props case) ----------------------------------
k_l = 0.671137800228
mu_l = 0.000325628141898
rho_l = 967.3752            # steamTables r1 at T_f, 1 bar
rho_v_sat = 0.590310923     # steamTables region 2, T_sat, p = 1 bar (1 - 1e-9)
rho_l_sat = 958.63689       # steamTables region 1, T_sat, p = 1 bar (1 + 1e-9)
h_fg = (2674.94964 - 417.436486) * 1e3   # J/kg
cp_l = 75.5 / 0.018015      # J/(kg K)
# --- geometry and coolant ----------------------------------------------------
D_o, D_i, L, N = 0.025, 0.021, 2.0, 24
k_wall, h_cool, T_cool = 50.0, 8000.0, 300.0
g = 9.81


def nusselt(rho_v, dT_):
    hfgp = h_fg + 0.68 * cp_l * dT_
    return 0.729 * (k_l**3 * rho_l * (rho_l - rho_v) * g * hfgp / (mu_l * D_o * dT_)) ** 0.25


A = N * math.pi * D_o * L
r_o, r_i = D_o / 2, D_i / 2
R_wall = r_o * math.log(r_o / r_i) / k_wall
R_cool = (1.0 / h_cool) * r_o / r_i
U_rest = 1.0 / (R_cool + R_wall)

h_new = nusselt(rho_v_sat, dT)
h_old_rho = nusselt(rho_l_sat, dT)
print(f"T_f = {(Tsat + T_wall) / 2:.6f} K")
print(f"h (rho_v = saturated vapour {rho_v_sat}) at the engine's dT_film = {h_new:.2f} W/m2K "
      f"(engine {h_engine:.2f}; rel diff {(h_new - h_engine) / h_engine:+.2e})")
print(f"h (rho_v = 958.637, the liquid root, same dT) = {h_old_rho:.2f} W/m2K; ratio {h_new / h_old_rho:.3f}")
q_cond = h_new * dT
q_cool = U_rest * (T_wall - T_cool)
print(f"wall balance at the engine's T_wall: q_cond = {q_cond:.2f}, q_cool = {q_cool:.2f} W/m2 "
      f"(rel diff {(q_cond - q_cool) / q_cool:+.2e})")
print(f"duty h A dT = {h_new * A * dT / 1e3:.4f} kW (engine {abs(Q_engine_kW):.4f} kW)")
# Re_film = 4 h L dT / (mu h_fg')
hfgp = h_fg + 0.68 * cp_l * dT
print(f"Re_film = {4 * h_new * D_o * dT / (mu_l * hfgp):.3f} (horizontal-tube laminar bound in NusseltFilm.H: 30)")
# independent wall iteration, properties held at the final film temperature
lo, hi = T_cool + 1e-6, Tsat - 1e-6
for _ in range(200):
    mid = 0.5 * (lo + hi)
    f = nusselt(rho_v_sat, Tsat - mid) * (Tsat - mid) - U_rest * (mid - T_cool)
    lo, hi = (mid, hi) if f > 0 else (lo, mid)
print(f"bisection T_wall (props frozen at T_f) = {mid:.4f} K (engine {T_wall:.4f} K)")
# the same iteration with the old rho_v, to see what the old film would give at fixed properties
lo, hi = T_cool + 1e-6, Tsat - 1e-6
for _ in range(200):
    mid2 = 0.5 * (lo + hi)
    f = nusselt(rho_l_sat, Tsat - mid2) * (Tsat - mid2) - U_rest * (mid2 - T_cool)
    lo, hi = (mid2, hi) if f > 0 else (lo, mid2)
dT2 = Tsat - mid2
print(f"old rho_v, props frozen: T_wall = {mid2:.3f} K, dT = {dT2:.3f} K, h = {nusselt(rho_l_sat, dT2):.1f}, "
      f"Q = {nusselt(rho_l_sat, dT2) * A * dT2 / 1e3:.1f} kW (golden before the branch: 2865.3, 506.6 kW)")
# ideal-gas bound on the vapour density, computed (not quoted)
print(f"ideal-gas rho_v at (T_sat, 1 bar) = {1e5 * 0.018015 / (8.314462618 * Tsat):.4f} kg/m3")
