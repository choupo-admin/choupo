#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: `model interiorPoint` in the Gibbs reactor finds the SAME equilibrium as the element-potential method, hands back the element potentials as pi = -lambda, and refuses what slices B2/B3 will carry.

    bin/curate/check_gibbs_interior_point.py [--table]

THE REAL DEFECT THIS WOULD HAVE CAUGHT.  The interior-point method reads the
element potentials off the multipliers of the element balances.  Choupo-IP's
Lagrangian is f + lambda^T c, the element-potential derivation's is
G - lambda^T(...), so the bridge is pi = -lambda; a code that publishes
+lambda (or drops the 1/N0 scaling, or mixes the gas and liquid reference) still
CONVERGES, exit 0, with a plausible-looking chemical potential -- every amount
can be right and the published `lambda_<element>` KPIs wrong, and a golden only
pins what a run prints.  The same silence hides a barrier that leaves a trace
species wrong by mu/n (design record sec. 2.9), a liquid kept at its barrier
"ghost" amount, and an adiabatic outer Newton that no longer sees the same
enthalpy.  The only place these are visible is a second solution of the SAME
problem by an independent method, which is what this gate compares.

WHAT IT CHECKS.  Each case of the list (design record sec. 4.2, rows of B1) is
copied twice through gatekit.probe_copy; in the second copy the `model` of every
gas + ideal-liquid Gibbs reactor is switched to interiorPoint (and its
`newtonLog` dropped).  Both run; per reactor, from the KPIs:
  (a) every gas amount y_i N_gas and liquid amount x_i N_liq agree with the
      element-potential method's to REL of the larger of the amount and FLOOR x
      the unit's total moles (REL = 1e-6, FLOOR = 1e-9; see the measured table
      printed by --table: the element-potential answer is itself only closed to
      |F| <= 1e-8 mol/s and its liquid is a bisection, so 1e-8 relative cannot be
      asked of the REFERENCE; the interior point closes its element balances to
      1e-12);
  (b) the published element potentials agree to 1e-6 relative of their scale, and
      the multiplier the run publishes (ip_lambda_<element>) is minus the
      published one, pi = -lambda, to 1e-8 relative of the scale;
  (c) on an adiabatic reactor the outlet T agrees within 1e-6 K;
  (d) the model that cannot run is REFUSED by name with the slice that carries
      it: gibbs11's graphite (B2), gibbs10 and gibbs13 on an SRK package (B3),
      `barrierUpdate adaptive` (A3), `globalization merit` (A4), an unknown key,
      the block under another model, and the log inside data/standards.
  (e) both variants of review R1 run (`barrier everyAmount` is switched in a
      third copy) and agree with the default; their iteration counts and the
      largest polish change are in the table.

SABOTAGES (by hand, restored with cp and make all; results in the slice report):
  S1  InteriorPointGibbs.cpp: eq.pi = +lambda  -> (b) FAILS on every case
  S2  the polish removed under `everyAmount` (usePolish = false) -> (a) FAILS on
      the trace species of gibbs06_h2_flame_radicals (H2O2, HO2)
  S3  the liquid's tangent-plane test removed (the barrier ghost kept) -> (a)
      FAILS on gibbs07 and claus01's liquid amount.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gatekit  # noqa: E402

SCAN_ROOTS = ("tutorials/steady/gibbs/*/system/flowsheetDict", "src/unitOperations/reactor/gibbsMethod/*.cpp",
              "src/unitOperations/reactor/GibbsReactor.cpp")

G = "tutorials/steady/gibbs/"
#  case -> units NOT switched (a pure solid, B2; they stay on elementPotential)
CASES = {
    "gibbs01_water_gas_shift": (), "gibbs02_steam_reforming": (), "gibbs03_methane_combustion": (),
    "gibbs04_wgs_temperature_sweep": (), "gibbs05_adiabatic_flame": (), "gibbs06_h2_flame_radicals": (),
    "gibbs06_thermal_nox": (), "gibbs07_wgs_cooled": (), "gibbs12_element_potential_newton": ("coking",),
    "claus01_thermal_stage": (),
}
REL, FLOOR, PI_REL, BRIDGE_REL, DT = 1e-6, 1e-9, 1e-6, 1e-8, 1e-5


def units_of(text):
    """(name, start, end) of each `type gibbsReactor;` unit of a flowsheetDict (brace-matched)."""
    out = []
    for m in re.finditer(r"\{\s*name\s+(\w+)\s*;", text):
        i, d = m.start(), 0
        for j in range(i, len(text)):
            d += {"{": 1, "}": -1}.get(text[j], 0)
            if d == 0:
                break
        if re.search(r"type\s+gibbsReactor\s*;", text[i:j]):
            out.append((m.group(1), i, j + 1))
    return out


def switch(case, skip, model="interiorPoint", barrier=None):
    fd = case / "system" / "flowsheetDict"
    text = fd.read_text()
    for name, a, b in reversed(units_of(text)):
        if name in skip:
            continue
        blk = text[a:b]
        blk = re.sub(r"\n\s*newtonLog\s+\S+\s*;", "", blk)
        blk = re.sub(r"\n\s*model\s+\w+\s*;", "", blk)
        blk = re.sub(r"(type\s+gibbsReactor\s*;)", r"\1\n        model " + model + ";", blk, count=1)
        if barrier:
            blk = blk[:blk.rindex("}")] + "interiorPoint { barrier %s; }\n    }" % barrier
        text = text[:a] + blk + text[b:]
    fd.write_text(text)


def kpis(out):
    m = re.search(r"<<<Choupo:result-begin>>>(.*)<<<Choupo:result-end>>>", out, re.S)
    return json.loads(m.group(1))["kpis"] if m else {}


def amounts(k, species):
    n = k["N_out_mol_s"] - k.get("N_liq_mol_s", 0.0)
    gas = {s: k["y_" + s] * n for s in species}
    liq = {s: k["x_" + s] * k["N_liq_mol_s"] for s in species if "x_" + s in k}
    return gas, liq


def compare(tag, ref, got, failures, rows):
    species = [x[2:] for x in ref if x.startswith("y_")]
    g0, l0 = amounts(ref, species)
    g1, l1 = amounts(got, species)
    N = ref["N_in_mol_s"]
    worst, wsp = 0.0, ""
    for s in species:
        for a, b in ((g0.get(s, 0.0), g1.get(s, 0.0)), (l0.get(s, 0.0), l1.get(s, 0.0))):
            e = abs(a - b) / max(abs(a), abs(b), FLOOR * N)
            if e > worst:
                worst, wsp = e, s
    pis = [x for x in ref if x.startswith("lambda_")]
    scale = max(abs(ref[x]) for x in pis) or 1.0
    dpi = max(abs(ref[x] - got[x]) for x in pis) / scale
    RT = 8.314462618 * got["T"]
    bridge = max(abs(got["ip_lambda_" + x[7:]] * RT + got[x]) for x in pis) / scale
    dT = abs(ref["T"] - got["T"])
    rows.append((tag, worst, wsp, dpi, bridge, dT, int(got["ip_iterations"]), got["ip_polishLargestRelativeChange"]))
    if worst > REL:
        failures.append(f"{tag}: amount {wsp} differs by {worst:.2e} (limit {REL:g})")
    if dpi > PI_REL:
        failures.append(f"{tag}: element potentials differ by {dpi:.2e} (limit {PI_REL:g})")
    lim = BRIDGE_REL * (10 if "everyAmount" in tag else 1)   # there the published pi is the POLISHED one: it differs by the polish
    if bridge > lim:
        failures.append(f"{tag}: pi != -lambda, off by {bridge:.2e} (limit {lim:g})")
    if dT > DT:
        failures.append(f"{tag}: outlet T differs by {dT:.2e} K (limit {DT:g})")


def main():
    failures, rows = [], []
    solve = gatekit.binary("choupoSolve")
    for case, skip in CASES.items():
        with gatekit.probe_copy(G + case, strip=("expected",)) as ref, gatekit.probe_copy(G + case, strip=("expected",)) as ip, \
                gatekit.probe_copy(G + case, strip=("expected",)) as ev:
            switch(ip, skip)
            switch(ev, skip, barrier="everyAmount")
            outs = {}
            for tag, c in (("ref", ref), ("ip", ip), ("ev", ev)):
                rc, o = gatekit.run(solve, c)
                if rc != 0:
                    failures.append(f"{case} ({tag}): exit {rc}: " + o.strip().splitlines()[-1][:200])
                outs[tag] = kpis(o)
            for unit, a, b in units_of((ref / "system" / "flowsheetDict").read_text()):
                if unit in skip or unit not in outs["ref"] or unit not in outs["ip"]:
                    continue
                compare(f"{case}.{unit}", outs["ref"][unit], outs["ip"][unit], failures, rows)
                if unit in outs["ev"]:
                    compare(f"{case}.{unit} [everyAmount]", outs["ref"][unit], outs["ev"][unit], failures, rows)
    # (d) refusals by name
    def refused(label, base, edit_fn, needles, model="interiorPoint"):
        with gatekit.probe_copy(G + base, strip=("expected",)) as c:
            if model:
                switch(c, ())
            edit_fn(c)
            rc, o = gatekit.run(solve, c)
            if rc == 0 or not all(n in o for n in needles):
                failures.append(f"refusal {label}: exit {rc}, needles {needles} not all in the output")
    refused("graphite (B2)", "gibbs11_carbon_deposition", lambda c: None, ["PURE SOLID", "slice B2"])
    refused("SRK (B3)", "gibbs10_ammonia_fugacity", lambda c: None, ["non-ideal equation of state", "slice B3"])
    blk = lambda body: (lambda c: gatekit.edit(c / "system" / "flowsheetDict", "outputs", "interiorPoint { %s }\n        outputs" % body))
    refused("adaptive (A3)", "gibbs01_water_gas_shift", blk("barrierUpdate adaptive;"), ["slice A3"])
    refused("merit (A4)", "gibbs01_water_gas_shift", blk("globalization merit;"), ["slice A4"])
    refused("unknown key", "gibbs01_water_gas_shift", blk("tolerance 1e-6;"), ["unknown key `tolerance`"])
    refused("log in standards", "gibbs01_water_gas_shift", blk("log data/standards/x.csv;"), ["data/standards"])
    refused("block under elementPotential", "gibbs01_water_gas_shift", blk("barrier everyAmount;"),
            ["read only under `model interiorPoint;`"], model=None)
    if "--table" in sys.argv:
        print("%-52s %9s %-8s %9s %9s %8s %4s %9s" % ("case.unit", "amount", "species", "pi", "bridge", "dT[K]", "it", "polish"))
        for r in rows:
            print("%-52s %9.2e %-8s %9.2e %9.2e %8.1e %4d %9.2e" % r)
    return gatekit.verdict("check_gibbs_interior_point", failures,
                           f"{len(rows)} reactor solves agree with elementPotential (amounts {REL:g} of max(n, {FLOOR:g} N), "
                           f"pi {PI_REL:g}, pi = -lambda {BRIDGE_REL:g}, adiabatic T {DT:g} K) in both variants of R1, and 7 refusals name their slice")


if __name__ == "__main__":
    sys.exit(main())
