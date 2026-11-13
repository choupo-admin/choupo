#!/usr/bin/env python3
"""What the PUMP computes today (the density its volume flow rests on), against
the measured sets of D3, D4 and D5.  The pump sums mole-fraction-weighted
record `Vliq` constants, flat in T and P, and leaves a dissolved ion out of the
sum with an announcement (Pump.cpp:88-128; confirmed on a scratch flowsheet:
water 30 + ethanol 5 + NaCl 1 kmol/h gives v_molar 2.3183e-5 m3/mol, exactly
the formula below; water + CO2 at 293 and 313 K gives 1.8649e-5 both times).

usage: baseline_consumers.py > baseline/consumers_pump_route.txt
"""
import os, re, sys, statistics
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import engine_rho as E
from baseline_d2 import read, HERE


def vliq(name):
    txt = open(os.path.join(E.HOME, "data/standards/components", name + ".dat")).read()
    m = re.search(r"^\s*Vliq\s+([0-9.eE+-]+)\s*;", txt, re.M)
    return float(m.group(1)) if m else None


MW = {c: E.mw_of(c) for c in ("water", "ethanol", "CO2", "NaOH", "NaCl")}
V = {c: vliq(c) for c in ("water", "ethanol", "CO2")}      # NaOH, NaCl: none, the pump leaves them out


def pump_rho(moles):
    """moles: {component: amount}; returns kg/m3 as the pump's volume flow implies."""
    n = sum(moles.values())
    Mbar = sum(moles[c] * MW[c] for c in moles) / n * 1e-3
    v = sum(moles[c] / n * V[c] for c in moles if V.get(c))
    return Mbar / v


def from_mass(w):
    return {c: w[c] / MW[c] for c in w}


def block(title, rows, fn, key):
    d = []
    for r in rows:
        rm = float(r["rho_kg_m3"])
        d.append(100 * (fn(r) - rm) / rm)
    i = max(range(len(d)), key=lambda k: abs(d[k]))
    return (f"{title}: n={len(d)} AAD {statistics.mean(abs(v) for v in d):.3f} % bias {statistics.mean(d):+.3f} % "
            f"max {abs(d[i]):.3f} % at {key(rows[i])}")


L = []
d3a = read("d3a_naoh_galindoLuna2019.tsv")
L.append(block("D3 NaOH, Galindo-Luna 2019 (0.1 MPa), pump route (NaOH volume left out)", d3a,
               lambda r: pump_rho(from_mass({"NaOH": float(r["w_NaOH"]), "water": 1 - float(r["w_NaOH"])})),
               lambda r: f"T={r['T_K']} K w={r['w_NaOH']}"))
d3b = read("d3b_naoh_hnedkovsky2007.tsv")
L.append(block("D3 NaOH, Hnedkovsky 2007 (323-573 K, 2-10 MPa), pump route", d3b,
               lambda r: pump_rho(from_mass({"NaOH": float(r["w_NaOH"]), "water": 1 - float(r["w_NaOH"])})),
               lambda r: f"T={r['T_K']} K P={r['P_kPa']} kPa w={float(r['w_NaOH']):.3f}"))
d4b = read("d4b_co2water_mcbrideWright2015.tsv")
L.append(block("D4 CO2 + water, McBride-Wright 2015, pump route (CO2 at its flat 25 C Vliq)", d4b,
               lambda r: pump_rho({"CO2": float(r["x_CO2"]), "water": 1 - float(r["x_CO2"])}),
               lambda r: f"T={r['T_K']} K P={r['P_kPa']} kPa x={r['x_CO2']}"))
for tag, name in (("d5a", "d5a_naclEthanolWater_saturated_galleguillos2003.tsv"), ("d5b", "d5b_naclEthanolWater_unsaturated_galleguillos2003.tsv")):
    rows = [r for r in read(name) if r["w_NaCl"]]
    L.append(block(f"D5 {tag} NaCl + ethanol + water, 298-313 K, pump route (NaCl volume left out)", rows,
                   lambda r: pump_rho(from_mass({"NaCl": float(r["w_NaCl"]), "ethanol": float(r["w_ethanol"]),
                                                 "water": 1 - float(r["w_NaCl"]) - float(r["w_ethanol"])})),
                   lambda r: f"T={r['T_K']} K w_EtOH={r['w_ethanol']} w_NaCl={r['w_NaCl']}"))
# the demonstration point of D3b
pt = [r for r in d3a if r["T_K"] == "303.15" and r["w_NaOH"] == "0.2"][0]
L.append(f"D3b point (303.15 K, w = 0.20): measured {pt['rho_kg_m3']} kg/m3; pump route "
         f"{pump_rho(from_mass({'NaOH': 0.2, 'water': 0.8})):.1f} kg/m3; a flat 1000 kg/m3 would give 1000")
print("\n".join(L))
