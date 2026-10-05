#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_evaporative_dryer -- the free-moisture dryer's three limits, and the
wet-bulb floor it shares with the solid dryer (2026-10-05, DEV.md C26 and
C35 items 7 and 11).

`evaporativeDryer` (src/unitOperations/heatTransfer/EvaporativeDryer.{H,cpp})
dries a NON-sorbing crystal of its free surface water into a hot gas until the
first of three limits binds: the water runs out, the exhaust reaches its cap
(`maxExhaustHumidity`, default 0.95), or the gas cannot pay for the heat --
and then the solid leaves at the model's FLOOR, having evaporated ONLY what the
gas can pay for there,

    water_pay = [F_gas cp_gas (T_gas - T_floor)
                 - (n_s cp_s + n_w cp_w)(T_floor - T_w)] / lambda(T_floor).

THE FLOOR IS THE GAS'S WET BULB (C35 item 7, Vitor's ruling, 2026-10-05), in
this unit AND in `solidDryer`
(src/unitOperations/heatTransfer/SolidDryer.cpp): the solid and the exhaust
leave at one temperature, and a wet solid in a gas cools toward the gas's
wet-bulb (adiabatic-saturation) temperature, not toward its own feed
temperature, which was the floor until then.  Both read it from
`psychrometry::gasWetBulb` (Psychrometry.H) and publish it as the KPI
`T_wetbulb`.  This gate has no separate solid-dryer twin; the solid dryer's
floor is held here, arm (f).

THE OUTLET IS THE FIRST ROOT ABOVE THE FLOOR, BELOW THE MOISTURE'S CRITICAL
TEMPERATURE (C35 item 11's engine finding).  This unit's hand balance has a
Watson latent heat, which vanishes at water's Tc (647 K), and the free water
warmed as a liquid at a constant cp, so above ~Tc - 60 K it has a second,
spurious root, and above Tc a third.  The old bisection on [floor, T_gas]
took its first midpoint there whenever the gas was hot: the lithium plant's
950 K flue gas with a 20 % design margin returned T_out = 672.28 K.  The root
is now the first sign change above the floor, and the bracket stops at Tc.

The gate holds, from the runs themselves:

  (a) each corpus case announces the limit its OWN ANSWER satisfies:
      evapDryer01 complete (X_final 0, exhaust below its cap, no limit line,
      T_out above its floor); evapDryer02 -- its wet solid fed at 298.15 K,
      BELOW the gas's 311.68 K wet bulb -- HEAT-bound at the floor since
      C35 item 7 (T_out = T_wetbulb, the WARNING naming the wet bulb, the
      exhaust below its cap; until then it left at 310.73 K, below the
      gas's own wet bulb, saturation-bound -- the case's NAME predates the
      ruling, see DEV.md C35 item 7); the lithium plant complete, T_out
      above its floor and below both the gas inlet T and water's critical
      temperature;
  (a') the SATURATION wall on a fixture: evapDryer02 with its wet solid
      warmed to 330 K (above the wet bulb) is saturation-bound -- exhaust
      at the cap, T_out above the floor, the NOTE naming what the gas's heat
      could have paid for (more than it carried), no energy WARNING;
  (b) THE HEAT THE GAS PAYS FOR, independently of any property value: on
      evapDryer02 (heat-bound at its floor) at 1, 1.25 and 1.5 times the
      gas -- same composition, same T, so the same wet bulb -- the water
      removed is AFFINE in the gas flow (the balance at the floor is linear
      in it, with a sensible term that does not depend on it), so its second
      difference vanishes to 1e-9 relative; each run is heat-bound with
      T_out exactly its floor, and the energy WARNING is replayed in the
      caveat block;
  (c) the heat-capacity DEFAULT the corpus uses (NaCl carries no
      `solidHeatCapacity`, so the crystal's warm-up is priced at zero) is
      announced at its site and in the caveat block;
  (d) THE FLOOR IS THE GAS'S WET BULB, recomputed here from the CASE'S OWN
      RECORDS (Antoine, Watson from Tc/Tb/HvapTb, the ideal-gas Cp
      polynomials, the molar masses) by an independent bisection of the
      adiabatic-saturation equation at Lewis = 1, to 1e-6 K -- on
      evapDryer02 and on the solid-dryer fixture of (f); and it does NOT
      depend on the solid's feed temperature (298.15 K and 330 K give the
      same floor to 1e-9 K);
  (e) A HIGH-GAS FIXTURE: the lithium plant with its burner feed scaled by
      1.20/1.05 (a 20 % margin on the minimum gas instead of 5 %) must
      return T_out below the gas inlet T and below water's 647.096 K, and
      above the design case's T_out (more gas, a hotter exhaust) -- the
      pre-fix unit returned 672.28 K there;
  (f) THE SOLID DRYER'S FLOOR: solidDryer01 with its wet solid fed at 300 K
      (below the air's wet bulb) and its air cut to 100 kmol/h is
      energy-limited at T_out = T_wetbulb, the WARNING naming the air's
      wet-bulb temperature and replayed in the caveat block; solidDryer01
      itself (fed at 330 K, above the wet bulb) keeps its isotherm answer
      with T_out above its floor.
  (g) THE SOLID DRYER'S EXHAUST MAY NOT BE SUPERSATURATED (2026-10-05,
      DEV.md C37 item 3): the witness solidDryer02_starved_air
      (solidDryer01 with its air cut from 800 to 100 kmol/h) is
      SATURATION-bound -- its result block says `[saturation-bound]`, the
      exhaust's water activity RECOMPUTED HERE from the published exhaust
      stream (y_w P / p_sat(T_out), p_sat from the case's own Antoine) lies
      in [1 - 1e-6, 1], the powder leaves wetter than its isotherm, the
      WARNING names what the isotherm would have removed and is replayed in
      the caveat block, the water balance closes (exhaust water - air water
      = water_removed), and the unit closes against the energy report to
      1e-4 kW (its `energyClosures` row) with the plant residual below
      1e-4 kW; solidDryer01 says `[isotherm-reached]` with its exhaust below
      saturation and X_final = X_eq; the heat-bound fixture of (f) says
      `[heat-bound]` with its exhaust at or below saturation.  Until then
      the starved witness evaporated the isotherm's whole 680.8 kg/h into
      100 kmol/h of air at 318.6 K and the exhaust, priced at its condensed
      equilibrium, was published as vf = 1 -- a fog.

BY-HAND SABOTAGES (2026-10-05, each restored with `git checkout` + `make
all`):
  S1  EvaporativeDryer.cpp: `T_floor = T_w` (the feed-T floor back) ->
      caught by (a): evapDryer02 saturation-bound again at T_out 310.73 K
      with its floor published as 298.15 K;
  S2  EvaporativeDryer.cpp: Tout_for back to the plain bisection on
      [T_floor, T_air] -> caught by (a), BEFORE (e) is reached, and that is
      the finding: with the floor at the 346.30 K wet bulb the first
      midpoint on the 950 K gas is 648 K, above water's Tc, so even the
      DESIGNED lithium dryer (5 % margin) lands on the spurious root
      (652.68 K).  The floor ruling could not have shipped without the root
      fix; (e) stays as the over-gassed witness the finding was made on;
  S3  SolidDryer.cpp: `T_floor = T_w` -> caught by (f): the fixture
      reaches its isotherm at T_out 311.95 K with its floor published as
      300 K, below the air's 315.70 K wet bulb.
  S4  SolidDryer.cpp: the saturation test disabled (`aw_exhaust(...) <=
      1.0` -> `true`) -> caught by (g): the starved witness says
      `[isotherm-reached]` with its exhaust recomputed at a_w > 1;
  S5  SolidDryer.cpp: the saturation bisection reads the exhaust's a_w at
      the ISOTHERM answer's T instead of at each trial's own T_out
      (`aw_exhaust(m, T_cap)`) -> caught by (g): the label is right and the
      exhaust, recomputed from the published stream, sits at a_w =
      1.000247 -- the arm's upper bound is what catches it.
      A first S5 SURVIVED, and is recorded because it proves nothing: the
      bisection keeping its supersaturated end (`water_rem = hi`) moves the
      answer by the bisection's last step, 1e-13 relative, below the twelve
      digits the result JSON carries -- a sabotage that changes no
      observable is not a test of the arm.

NOT CHECKED: this unit's energy balance against the energy REPORT -- it is a
hand surface (constant gas Cp, a Watson latent heat), not the formation
surface, and the report refuses its corpus cases outright (their salts carry
no formation datum); whether the PACKAGE resolves the solid dryer's
saturated exhaust as a single vapour (the limit is the psychrometric
saturation of the water alone; an ideal-solution package with Raoult's law on
the extrapolated permanent-gas vapour pressures resolves a whisker of liquid
at it -- 0.015 % of the starved witness's exhaust, priced identically by the
unit and the report); any measured dryer.
"""
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BIN = ROOT / "choupoSolve"
EVAP01 = ROOT / "tutorials/steady/drying/evapDryer01_nacl"
EVAP02 = ROOT / "tutorials/steady/drying/evapDryer02_energy_limited"
SOLID01 = ROOT / "tutorials/steady/drying/solidDryer01_sugar"
SOLID02 = ROOT / "tutorials/steady/drying/solidDryer02_starved_air"
LITHIUM = ROOT / "tutorials/plant/lithiumBrinePlant"
WARN = "[EvaporativeDryer] WARNING: the hot air cannot pay"
NOTE = "[EvaporativeDryer] NOTE: air-capacity limited"
SWARN = "[SolidDryer] WARNING: the hot air cannot pay"
SSAT = "[SolidDryer] WARNING: the exhaust saturates"
DEFAULT = "carries no `solidHeatCapacity {}`"
TC_WATER = 647.096


def fail(msg):
    print(f"check_evaporative_dryer: FAILED\n  {msg}")
    sys.exit(1)


def run(src, tmp, name, edit=None):
    work = Path(tmp) / name
    shutil.copytree(src, work)
    if edit:
        edit(work)
    p = subprocess.run([str(BIN), "."], cwd=work, capture_output=True,
                       text=True, timeout=900,
                       env={"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"})
    out = p.stdout + p.stderr
    if p.returncode != 0:
        fail(f"{name} did not run (exit {p.returncode}):\n{out[-800:]}")
    return out


def kpis(out, unit, name):
    m = re.search(r'"' + re.escape(unit) + r'": (\{ "T_out"[^{}]*\})', out)
    if not m:
        fail(f"{name}: no KPI row for '{unit}'")
    k = json.loads(m.group(1))
    if "T_wetbulb" not in k:
        fail(f"{name}: '{unit}' publishes no T_wetbulb (its floor)")
    return k


def stream_T(out, stream, name):
    m = re.search(r'"' + re.escape(stream) + r'": \{ "F": [^,]+, "T": ([^,]+),',
                  out)
    if not m:
        fail(f"{name}: no result row for stream '{stream}'")
    return float(m.group(1))


def stream_json(out, stream, name):
    """One stream's entry in the result JSON, parsed by the JSON parser."""
    key = '"' + stream + '": { "F"'
    at = out.find(key)
    if at < 0:
        fail(f"{name}: no result row for stream '{stream}'")
    return json.JSONDecoder().raw_decode(out, at + len(stream) + 4)[0]


def unit_closure(out, unit, name):
    """The unit's `energyClosures` row: what remains of H_out - H_in once any
    declared model-boundary step is credited, read from the engine."""
    at = out.find('"energyClosures": ')
    if at < 0:
        fail(f"{name}: the run published no energyClosures")
    rows = json.JSONDecoder().raw_decode(out, at + len('"energyClosures": '))[0]
    for r in rows:
        if r.get("unit") == unit:
            return r["remaining_kW"]
    fail(f"{name}: no energyClosures row for '{unit}'")


def advisories(out):
    """The caveat block's machine half: every advisory entry the run's result
    JSON carries, parsed by the JSON parser rather than by a pattern."""
    at = out.find('"advisories": ')
    if at < 0:
        return []
    try:
        return json.JSONDecoder().raw_decode(out, at + len('"advisories": '))[0]
    except ValueError:
        return []


def replayed(out, needle):
    return any(isinstance(a, dict) and needle in a.get("message", "")
               for a in advisories(out))


def set_T(path, old, new):
    s = path.read_text()
    t = re.sub(r"^T\s+" + re.escape(old) + r" K;", f"T               {new} K;",
               s, flags=re.M)
    if t == s:
        fail(f"could not set T {old} -> {new} K in {path}")
    path.write_text(t)


# ---- (d) an independent wet bulb, from the case's own records --------------
def record(case, comp):
    p = case / "constant/components" / f"{comp}.dat"
    if not p.exists():
        fail(f"(d) {case.name} carries no constant/components/{comp}.dat")
    return p.read_text()


def scalar_key(text, key, where):
    m = re.search(r"^\s*" + key + r"\s+([-0-9.eE+]+)", text, re.M)
    if not m:
        fail(f"(d) {where}: no '{key}'")
    return float(m.group(1))


def block_coeffs(text, block, model, where):
    m = re.search(block + r"\s*\{([^{}]*)\}", text)
    if not m or not re.search(r"model\s+" + model + r"\s*;", m.group(1)):
        fail(f"(d) {where}: no '{block} {{ model {model}; }}' block -- the"
             " gate's recomputation reads that model only; re-anchor it")
    c = re.search(r"coefficients\s*\(([^)]*)\)", m.group(1))
    return [float(x) for x in c.group(1).split()]


def wet_bulb(case, gas, T, P):
    """Adiabatic saturation at Lewis = 1, the humid heat at the gas's own T:
       Ysat(Twb) - Y = (cpc + Y cpv)(T - Twb) / lambda(Twb),
    solved by bisection on [273.65 K, T'] where T' is where p_sat = 0.95 P."""
    w = record(case, "water")
    A, B, C = block_coeffs(w, "vaporPressure", "Antoine", "water")
    Mv = scalar_key(w, "MW", "water")
    Tc, Tb, Hb = (scalar_key(w, k, "water") for k in ("Tc", "Tb", "HvapTb"))
    cpw = block_coeffs(w, "idealGasHeatCapacity", "polynomial", "water")

    def poly(a, t):
        return sum(c * t ** i for i, c in enumerate(a))

    def psat(t):
        return 1e5 * 10 ** (A - B / (t + C))

    def lam(t):
        return Hb * ((Tc - t) / (Tc - Tb)) ** 0.38 / Mv * 1000.0   # J/kg

    n = sum(v for k, v in gas.items() if k != "water")
    mdry = cp = 0.0
    for comp, v in gas.items():
        if comp == "water":
            continue
        r = record(case, comp)
        mdry += v * scalar_key(r, "MW", comp)
        cp += v * poly(block_coeffs(r, "idealGasHeatCapacity", "polynomial",
                                    comp), T)
    Mc = mdry / n
    cpc = cp / n / Mc * 1000.0
    cpv = poly(cpw, T) / Mv * 1000.0
    Y = gas.get("water", 0.0) * Mv / mdry

    def f(t):
        ps = psat(t)
        return (Mv / Mc) * ps / (P - ps) - Y - (cpc + Y * cpv) * (T - t) / lam(t)

    lo, hi = 273.65, min(T, Tc - 1e-9)
    if psat(hi) >= 0.95 * P:
        a, b = lo, hi
        while b - a > 1e-10:
            m = 0.5 * (a + b)
            a, b = (a, m) if psat(m) >= 0.95 * P else (m, b)
        hi = a
    while hi - lo > 1e-10:
        m = 0.5 * (lo + hi)
        lo, hi = (lo, m) if f(m) >= 0.0 else (m, hi)
    return 0.5 * (lo + hi)


def gas_of(case, stream):
    s = (case / "0" / stream).read_text()
    flows = dict((k, float(v)) for k, v in
                 re.findall(r"^\s*(\w+)\s+([0-9.eE+-]+)\s+kmol/h;", s, re.M))
    tot = sum(flows.values())
    T = float(re.search(r"^T\s+([0-9.]+)\s+K;", s, re.M).group(1))
    m = re.search(r"^P\s+([0-9.]+)\s+(Pa|bar);", s, re.M)
    P = float(m.group(1)) * (1e5 if m.group(2) == "bar" else 1.0)
    return {k: v / tot for k, v in flows.items()}, T, P


def main():
    if not BIN.exists():
        fail(f"{BIN} is missing -- build first; a check that cannot run must"
             " not pass")
    with tempfile.TemporaryDirectory() as tmp:
        # ---- (a) + (c): the corpus announces what its answers satisfy ------
        o1 = run(EVAP01, tmp, "evap01")
        k1 = kpis(o1, "dryer", "evapDryer01")
        if (k1["X_final"] != 0.0 or k1["exhaust_humidity"] >= 0.95
                or not k1["T_out"] > k1["T_wetbulb"]):
            fail(f"(a) evapDryer01 should dry completely below the cap,"
                 f" above its floor: {k1}")
        if WARN in o1 or NOTE in o1:
            fail("(a) evapDryer01 dries completely but announces a limit")
        if DEFAULT not in o1 or not replayed(o1, DEFAULT):
            fail("(c) evapDryer01 prices NaCl's warm-up at a DEFAULT zero"
                 " heat capacity and must say so at its site AND in the"
                 " caveat block")

        o2 = run(EVAP02, tmp, "evap02")
        k2 = kpis(o2, "dryer", "evapDryer02")
        if (WARN not in o2 or k2["T_out"] != k2["T_wetbulb"]
                or k2["exhaust_humidity"] >= 0.95 or k2["X_final"] <= 0.0):
            fail("(a) evapDryer02's wet solid is fed below the gas's wet bulb"
                 " and the gas cannot pay to warm it there AND evaporate up to"
                 f" the cap: it must be heat-bound AT its floor: {k2}")
        if f"wet-bulb temperature ({k2['T_wetbulb']:.4f} K" not in o2:
            fail("(a) evapDryer02's energy WARNING must name the gas's"
                 " wet-bulb temperature as the floor that binds")
        if NOTE in o2:
            fail("(a) evapDryer02 is heat-bound but announces saturation")

        # ---- (a') the saturation wall on a warm-solid fixture ---------------
        o3 = run(EVAP02, tmp, "evap02warm",
                 lambda w: set_T(w / "0/wetSolid", "298.15", "330"))
        k3 = kpis(o3, "dryer", "evapDryer02 warm")
        if abs(k3["exhaust_humidity"] - 0.95) > 1e-4 or not k3["T_out"] > k3["T_wetbulb"] + 1.0:
            fail(f"(a') evapDryer02 with its solid at 330 K should be"
                 f" saturation-bound above its floor: {k3}")
        if WARN in o3:
            fail("(a') the warm fixture is bound by the exhaust cap above the"
                 " floor, yet announces the ENERGY limit")
        m = re.search(re.escape(NOTE) + r".*having carried ([0-9.]+) kg/h.*"
                      r"could pay for ([0-9.]+) kg/h", o3)
        if not m:
            fail("(a') the saturation NOTE must name what the gas carried and"
                 " what its heat could have paid for")
        carried, pay = float(m.group(1)), float(m.group(2))
        if abs(carried - k3["water_removed"] * 3600.0) > 0.1 or pay <= carried:
            fail(f"(a') NOTE: carried {carried} kg/h against water_removed"
                 f" {k3['water_removed'] * 3600.0:.3f} kg/h, payable {pay}"
                 " kg/h (must exceed what saturation allowed)")

        # ---- (d) the floor is the gas's wet bulb, not the feed T ------------
        gas2, Tg2, Pg2 = gas_of(EVAP02, "hotGas")
        twb2 = wet_bulb(EVAP02, gas2, Tg2, Pg2)
        if abs(k2["T_wetbulb"] - twb2) > 1e-6:
            fail(f"(d) evapDryer02's floor {k2['T_wetbulb']!r} K is not the"
                 f" gas's wet bulb {twb2!r} K recomputed from its records")
        if abs(k3["T_wetbulb"] - k2["T_wetbulb"]) > 1e-9:
            fail("(d) the floor moved with the solid's feed temperature"
                 f" ({k2['T_wetbulb']} K at 298.15 K, {k3['T_wetbulb']} K at"
                 " 330 K): it is the gas's wet bulb, a property of the gas")

        # ---- (b) the heat the gas pays for is affine in the gas -------------
        gas = (EVAP02 / "0/hotGas").read_text()
        if "N2       40 kmol/h;" not in gas or "water    0.5 kmol/h;" not in gas:
            fail("(b) evapDryer02's 0/hotGas no longer reads as the fixture"
                 " expects -- re-anchor the fixture rather than let it pass")

        def scaled(work, scale):
            g = gas.replace("N2       40 kmol/h;", f"N2       {40 * scale} kmol/h;")
            g = g.replace("water    0.5 kmol/h;", f"water    {0.5 * scale} kmol/h;")
            (work / "0/hotGas").write_text(g)

        rem = {}
        for scale in (1.0, 1.25, 1.5):
            o = o2 if scale == 1.0 else run(
                EVAP02, tmp, f"gas{scale}", lambda w, s=scale: scaled(w, s))
            k = kpis(o, "dryer", f"evapDryer02 x{scale}")
            if WARN not in o or k["T_out"] != k["T_wetbulb"]:
                fail(f"(b) evapDryer02 x{scale} must be heat-bound at its"
                     f" floor: {k}")
            if abs(k["T_wetbulb"] - k2["T_wetbulb"]) > 1e-9:
                fail(f"(b) x{scale}: the floor moved with the AMOUNT of gas")
            if not replayed(o, "cannot pay for evaporating"):
                fail(f"(b) x{scale}: the heat-bound WARNING must be replayed in"
                     " the caveat block too, not only at its site")
            if k["X_final"] <= 0.0 or k["exhaust_humidity"] >= 0.95:
                fail(f"(b) x{scale} must leave water on the cake with the"
                     f" exhaust below its cap: {k}")
            rem[scale] = k["water_removed"]
        d2 = rem[1.5] - 2.0 * rem[1.25] + rem[1.0]
        if abs(d2) > 1e-9 * rem[1.0]:
            fail(f"(b) the water removed at the floor is not affine in the gas"
                 f" (second difference {d2:.3e} kg/s on {rem[1.0]:.6e}): the"
                 " evaporation is not what the gas pays for")

        # ---- (a) + (e) the lithium plant, designed and over-gassed ----------
        ol = run(LITHIUM, tmp, "lithium")
        kl = kpis(ol, "FINISHING.dryer", "lithiumBrinePlant")
        tgas = stream_T(ol, "HOTAIR.hotAir", "lithiumBrinePlant")
        if WARN in ol or NOTE in ol:
            fail("(a) the lithium plant's FINISHING.dryer is designed to dry"
                 " completely, yet announces a limit")
        if (kl["X_final"] != 0.0 or kl["exhaust_humidity"] >= 0.95
                or not (kl["T_wetbulb"] < kl["T_out"] < min(tgas, TC_WATER))):
            fail(f"(a) the lithium dryer must leave dry, below the exhaust"
                 f" cap, with T_out above its floor and below both the gas"
                 f" inlet ({tgas} K) and water's {TC_WATER} K: {kl}")

        def overgas(work):
            p = work / "0/MAIN/fuelAir"
            s = p.read_text()
            t = re.sub(r"^(\s*(CH4|O2|N2)\s+)([0-9.]+)( kmol/h;)",
                       lambda m: f"{m.group(1)}{float(m.group(3)) * 1.20 / 1.05:.6f}{m.group(4)}",
                       s, flags=re.M)
            if t.count("kmol/h;") != 3 or t == s:
                fail("(e) could not scale the lithium plant's 0/MAIN/fuelAir")
            p.write_text(t)

        oh = run(LITHIUM, tmp, "lithium20", overgas)
        kh = kpis(oh, "FINISHING.dryer", "lithium +20 %")
        th = stream_T(oh, "HOTAIR.hotAir", "lithium +20 %")
        if not (kl["T_out"] < kh["T_out"] < min(th, TC_WATER)):
            fail(f"(e) with a 20 % gas margin the dryer must return T_out above"
                 f" the design case's {kl['T_out']:.3f} K and below both the"
                 f" gas inlet ({th:.2f} K) and water's critical {TC_WATER} K"
                 f" (the pre-fix unit returned 672.28 K, a spurious root): {kh}")

        # ---- (f) the solid dryer's floor ------------------------------------
        os1 = run(SOLID01, tmp, "solid01")
        ks1 = kpis(os1, "solidDryer", "solidDryer01")
        if SWARN in os1 or not ks1["T_out"] > ks1["T_wetbulb"]:
            fail(f"(f) solidDryer01 reaches its isotherm above its floor: {ks1}")

        def starve(work):
            set_T(work / "0/wetSolid", "330", "300")
            p = work / "0/hotAir"
            s = p.read_text()
            for a, b in (("N2    612.404962", "N2    76.55"),
                         ("O2    164.3057223", "O2    20.54"),
                         ("Ar    7.282913165", "Ar    0.91"),
                         ("water    16.00640256", "water    2.0")):
                if a not in s:
                    fail("(f) solidDryer01's 0/hotAir no longer reads as the"
                         " fixture expects -- re-anchor it")
                s = s.replace(a, b)
            p.write_text(s)

        os2 = run(SOLID01, tmp, "solid01cold", starve)
        ks2 = kpis(os2, "solidDryer", "solidDryer01 cold/starved")
        if (SWARN not in os2 or ks2["T_out"] != ks2["T_wetbulb"]
                or ks2["X_final"] <= ks2["X_equilibrium"]):
            fail("(f) the cold, starved solid-dryer fixture must be"
                 f" energy-limited AT its floor, the air's wet bulb: {ks2}")
        if f"wet-bulb temperature ({ks2['T_wetbulb']:.4f} K" not in os2:
            fail("(f) the solid dryer's WARNING must name the air's wet-bulb"
                 " temperature as the floor that binds")
        if not replayed(os2, "cannot pay for drying"):
            fail("(f) the solid dryer's WARNING must be replayed in the caveat"
                 " block")
        work = Path(tmp) / "solid01cold"
        gasS, TgS, PgS = gas_of(work, "hotAir")
        twbS = wet_bulb(work, gasS, TgS, PgS)
        if abs(ks2["T_wetbulb"] - twbS) > 1e-6:
            fail(f"(d) the solid dryer's floor {ks2['T_wetbulb']!r} K is not"
                 f" the air's wet bulb {twbS!r} K recomputed from its records")

        # ---- (g) the solid dryer's exhaust may not be supersaturated -------
        if "[heat-bound]" not in os2 or ks2["exhaust_humidity"] > 1.0:
            fail("(g) the cold, starved fixture of (f) must say `[heat-bound]`"
                 f" with its exhaust at or below saturation: {ks2}")
        if ("[isotherm-reached]" not in os1 or SSAT in os1
                or not ks1["exhaust_humidity"] < 1.0
                or ks1["X_final"] != ks1["X_equilibrium"]):
            fail("(g) solidDryer01 reaches its isotherm with an unsaturated"
                 f" exhaust and must say `[isotherm-reached]`: {ks1}")
        os3 = run(SOLID02, tmp, "solid02")
        ks3 = kpis(os3, "solidDryer", "solidDryer02_starved_air")
        if "[saturation-bound]" not in os3 or SSAT not in os3:
            fail("(g) solidDryer02_starved_air (100 kmol/h of air) must be"
                 " saturation-bound and say so, in its result block and in a"
                 " WARNING")
        if not replayed(os3, "the exhaust saturates"):
            fail("(g) the saturation WARNING must be replayed in the caveat"
                 " block")
        if (not ks3["X_final"] > ks3["X_equilibrium"]
                or not ks3["T_out"] > ks3["T_wetbulb"]):
            fail("(g) the saturation-bound powder must leave wetter than its"
                 f" isotherm, above its floor: {ks3}")
        ex = stream_json(os3, "humidExhaust", "solidDryer02")
        air = stream_json(os3, "hotAir", "solidDryer02")
        w = record(SOLID02, "water")
        A, B, C = block_coeffs(w, "vaporPressure", "Antoine", "water")
        aw = (ex["composition"]["water"] * ex["P"]
              / (1e5 * 10 ** (A - B / (ex["T"] + C))))
        if not (1.0 - 1e-6 <= aw <= 1.0):
            fail(f"(g) the starved witness's exhaust, recomputed from the"
                 f" published stream, has a_w = {aw!r} at {ex['T']} K: it must"
                 " be saturated and NOT supersaturated (in [1 - 1e-6, 1])")
        if abs(ks3["exhaust_humidity"] - aw) > 1e-9:
            fail(f"(g) the published exhaust_humidity"
                 f" {ks3['exhaust_humidity']!r} is not the exhaust's own a_w"
                 f" {aw!r}")
        Mw = scalar_key(w, "MW", "water")
        picked = (ex["F"] * ex["composition"]["water"]
                  - air["F"] * air["composition"]["water"]) * Mw
        if abs(picked - ks3["water_removed"]) > 1e-9 * ks3["water_removed"]:
            fail(f"(g) the exhaust picked up {picked!r} kg/s of water but the"
                 f" unit says it removed {ks3['water_removed']!r} kg/s")
        m = re.search(re.escape(SSAT) + r".*carries ([0-9.]+) kg/h.*of the"
                      r" ([0-9.]+) kg/h the isotherm would remove", os3)
        if not m or not float(m.group(2)) > float(m.group(1)):
            fail("(g) the saturation WARNING must name what the exhaust carried"
                 " and the larger amount the isotherm would have removed")
        rem = unit_closure(os3, "solidDryer", "solidDryer02")
        mg = re.search(r'"globalEnergyBoundary": \{[^{}]*"residual_kW": '
                       r"([-0-9.eE+]+)", os3)
        if abs(rem) > 1e-4 or not mg or abs(float(mg.group(1))) > 1e-4:
            fail(f"(g) the saturation-bound dryer must close against the energy"
                 f" report to 1e-4 kW: unit remaining {rem!r} kW, plant"
                 f" {mg.group(1) if mg else 'unpublished'} kW")

    print("check_evaporative_dryer: OK -- the free-moisture dryer announces"
          " the limit its own answer satisfies (evapDryer01 complete,"
          " evapDryer02 heat-bound AT the gas's wet bulb since its solid is fed"
          " below it, a warm-solid twin saturation-bound with the payable heat"
          " named, the lithium plant complete), evaporates at the floor what"
          " the gas pays for (affine in the gas to 1e-9, the WARNING replayed),"
          " announces the zero heat capacity it defaults for NaCl; the floor"
          " of BOTH this unit and the solid dryer is the gas's wet bulb,"
          " recomputed from each case's own records to 1e-6 K and independent"
          " of the feed T; a 20 % over-gassed lithium dryer stays below its"
          " gas inlet T and water's critical point; the solid dryer announces"
          " its limit (solidDryer01 isotherm-reached, the cold fixture"
          " heat-bound, solidDryer02_starved_air saturation-bound with its"
          " exhaust recomputed at a_w in [1 - 1e-6, 1], wetter than its"
          " isotherm, the water it picked up equal to water_removed, closing"
          " against the energy report to 1e-4 kW).  NOT checked: the hand"
          " energy surface against the energy report (the report refuses these"
          " cases), whether the package resolves the solid dryer's saturated"
          " exhaust as one vapour, or any measured dryer.")


if __name__ == "__main__":
    main()
