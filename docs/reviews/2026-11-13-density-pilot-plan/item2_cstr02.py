#!/usr/bin/env python3
"""Item 2(b): cstr02_reversible_wgs feeds a vapour that the CSTR prices on
liquid volumes.  Today's volumetric flow is V_R / tau_s (the CSTR's own KPIs,
scratch run); the ideal-gas volumetric flow at the feed state is F R T / P;
the feed's vapour fraction is the stream's own vf.

usage (repository root):
  python3 -I docs/reviews/2026-11-13-density-pilot-plan/item2_cstr02.py <scratch_dir>
"""
import json, os, sys
scratch = os.path.abspath(sys.argv[1])
d = json.loads(open(os.path.join(scratch, 'cases/cstr02_reversible_wgs/result.json')).read().split('<<<Choupo:result-end>>>')[0])
k = d['kpis']['wgs']; s = d['streams']['feed']
F = k['F_in_kmol_h'] / 3600 * 1000            # mol/s
Q_today = k['V_R'] / k['tau_s']
Q_ig = F * 8.314462618 * s['T'] / s['P']
mw = sum(s['composition'][c] * d['componentMolarMass'][c] for c in s['composition'])
print(f"feed: T={s['T']} K P={s['P']} Pa vf={s['vf']} F={F:.6g} mol/s composition={s['composition']}")
print(f"today: Q = V_R/tau = {Q_today:.6g} m3/s, rho = {mw/1000*F/Q_today:.4f} kg/m3, tau = {k['tau_s']:.6g} s")
print(f"ideal gas at the feed state: Q = {Q_ig:.6g} m3/s, rho = {mw/1000*F/Q_ig:.4f} kg/m3")
print(f"factor Q_ig / Q_today = {Q_ig/Q_today:.2f}")
