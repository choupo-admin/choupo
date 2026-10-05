#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_evaporative_dryer -- the free-moisture dryer's three limits
(2026-10-05, DEV.md C26).

`evaporativeDryer` (src/unitOperations/heatTransfer/EvaporativeDryer.{H,cpp})
dries a NON-sorbing crystal of its free surface water into a hot gas until the
first of three limits binds: the water runs out, the exhaust reaches its cap
(`maxExhaustHumidity`, default 0.95), or the gas cannot pay for the heat --
and then the solid leaves at its feed temperature, the model's floor, having
evaporated ONLY what the gas can pay for there,

    water_pay = F_air cp_air (T_air - T_w) / lambda(T_w).

Until 2026-10-05 the unit decided the limit from a HYPOTHETICAL -- whether
removing ALL the water hit the floor -- and two defects followed: on the
lithium brine plant's FINISHING.dryer it evaporated 0.2887 kg/s of water no
heat paid for (the report could not see it: that plant's energy balance is
UNAVAILABLE, its salts carrying no formation datum), and on evapDryer02 it
labelled a saturation-bound answer energy-limited beside a T_out 12.6 K above
the floor it claimed.  This gate holds, from the runs themselves:

  (a) each corpus case announces the limit its OWN ANSWER satisfies:
      evapDryer01 complete (X_final 0, exhaust below its cap, no limit line);
      evapDryer02 saturation (exhaust at the cap, T_out above the floor, the
      NOTE naming the heat the gas could have paid for, no energy WARNING);
      lithiumBrinePlant energy (T_out AT the floor, exhaust below its cap,
      water left on the cake, the WARNING replayed in the caveat block);
  (b) THE HEAT THE GAS PAYS FOR, independently of any property value: on a
      fixture where the floor binds (evapDryer02 with the wet solid at
      340 K), doubling the gas -- same composition, same T -- must double
      the water removed to 1e-9, because at the floor the balance is linear
      in the gas and has no sensible term.  The pre-2026-10-05 unit removed
      ALL the water at both rates (ratio 1);
  (c) the heat-capacity DEFAULT the corpus uses (NaCl carries no
      `solidHeatCapacity`, so the crystal's warm-up is priced at zero) is
      announced at its site and in the caveat block.

NOT CHECKED: this unit's energy balance against the energy REPORT -- it is a
hand surface (constant gas Cp, a Watson latent heat), not the formation
surface, and the report refuses its corpus cases outright; whether the floor
itself is right (a real solid can cool below its feed temperature toward the
gas's wet bulb -- a change to the model's domain, Vitor's); any measured dryer.
"""
import json
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
LITHIUM = ROOT / "tutorials/plant/lithiumBrinePlant"
WARN = "[EvaporativeDryer] WARNING: the hot air cannot pay"
NOTE = "[EvaporativeDryer] NOTE: air-capacity limited"
DEFAULT = "carries no `solidHeatCapacity {}`"


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
        fail(f"{name}: no KPI row for evaporativeDryer '{unit}'")
    return json.loads(m.group(1))


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


def t_of(case, stream):
    m = re.search(r"^T\s+([0-9.]+)\s+K;", (case / "0" / stream).read_text(),
                  re.M)
    if not m:
        fail(f"cannot read T from {case.name}/0/{stream}")
    return float(m.group(1))


def main():
    if not BIN.exists():
        fail(f"{BIN} is missing -- build first; a check that cannot run must"
             " not pass")
    with tempfile.TemporaryDirectory() as tmp:
        # ---- (a) + (c): the corpus announces what its answers satisfy ------
        o1 = run(EVAP01, tmp, "evap01")
        k1 = kpis(o1, "dryer", "evapDryer01")
        if k1["X_final"] != 0.0 or k1["exhaust_humidity"] >= 0.95:
            fail(f"(a) evapDryer01 should dry completely below the cap: {k1}")
        if WARN in o1 or NOTE in o1:
            fail("(a) evapDryer01 dries completely but announces a limit")
        if DEFAULT not in o1 or not replayed(o1, DEFAULT):
            fail("(c) evapDryer01 prices NaCl's warm-up at a DEFAULT zero"
                 " heat capacity and must say so at its site AND in the"
                 " caveat block")

        o2 = run(EVAP02, tmp, "evap02")
        k2 = kpis(o2, "dryer", "evapDryer02")
        tw2 = t_of(EVAP02, "wetSolid")
        if abs(k2["exhaust_humidity"] - 0.95) > 1e-4 or k2["T_out"] < tw2 + 1.0:
            fail(f"(a) evapDryer02 should be saturation-bound above the"
                 f" floor {tw2} K: {k2}")
        if WARN in o2:
            fail("(a) evapDryer02 is bound by the exhaust cap at T_out"
                 f" {k2['T_out']:.3f} K, above the floor, yet announces the"
                 " ENERGY limit -- the limit must be judged on the answer, not"
                 " on removing all the water")
        m = re.search(re.escape(NOTE) + r".*having carried ([0-9.]+) kg/h.*"
                      r"could pay for ([0-9.]+) kg/h", o2)
        if not m:
            fail("(a) evapDryer02's saturation NOTE must name what the gas"
                 " carried and what its heat could have paid for")
        carried, pay = float(m.group(1)), float(m.group(2))
        if abs(carried - k2["water_removed"] * 3600.0) > 0.1 or pay <= carried:
            fail(f"(a) evapDryer02's NOTE: carried {carried} kg/h against"
                 f" water_removed {k2['water_removed'] * 3600.0:.3f} kg/h,"
                 f" payable {pay} kg/h (must exceed what saturation allowed)")

        # ---- (b) the heat the gas pays for scales with the gas -------------
        gas = (EVAP02 / "0/hotGas").read_text()
        if "N2       40 kmol/h;" not in gas or "water    0.5 kmol/h;" not in gas:
            fail("(b) evapDryer02's 0/hotGas no longer reads as the fixture"
                 " expects -- re-anchor the fixture rather than let it pass")

        def warm(work, scale):
            ws = (work / "0/wetSolid").read_text()
            hot = re.sub(r"^T\s+298\.15 K;", "T               340 K;", ws,
                         flags=re.M)
            if hot == ws:
                fail("(b) could not warm the fixture's wet solid")
            (work / "0/wetSolid").write_text(hot)
            g = gas.replace("N2       40 kmol/h;", f"N2       {40 * scale} kmol/h;")
            g = g.replace("water    0.5 kmol/h;", f"water    {0.5 * scale} kmol/h;")
            (work / "0/hotGas").write_text(g)

        rem = {}
        for scale in (1, 2):
            o = run(EVAP02, tmp, f"warm{scale}", lambda w, s=scale: warm(w, s))
            k = kpis(o, "dryer", f"fixture x{scale}")
            if WARN not in o or abs(k["T_out"] - 340.0) > 1e-9:
                fail(f"(b) the warm fixture x{scale} must be heat-bound at its"
                     f" 340 K floor: {k}")
            if k["X_final"] <= 0.0 or k["exhaust_humidity"] >= 0.95:
                fail(f"(b) the warm fixture x{scale} must leave water on the"
                     f" cake with the exhaust below its cap: {k}")
            rem[scale] = k["water_removed"]
        ratio = rem[2] / rem[1]
        if abs(ratio - 2.0) > 2e-9:
            fail(f"(b) doubling the gas at the floor removed {ratio:.12g} times"
                 " the water, not 2: the evaporation is not what the gas pays"
                 " for (a ratio of 1 is the pre-2026-10-05 unit evaporating"
                 " ALL the water at both rates)")


        ol = run(LITHIUM, tmp, "lithium")
        kl = kpis(ol, "FINISHING.dryer", "lithiumBrinePlant")
        if WARN not in ol or not replayed(ol, "cannot pay for evaporating"):
            fail("(a) the lithium plant's FINISHING.dryer is heat-bound and"
                 " must WARN at its site and in the caveat block")
        if (abs(kl["T_out"] - 363.15) > 1e-9 or kl["exhaust_humidity"] >= 0.95
                or kl["X_final"] <= 0.0):
            fail(f"(a) the lithium dryer at its energy limit must leave AT the"
                 f" floor (363.15 K), below the exhaust cap, with water on the"
                 f" cake: {kl}")

    print("check_evaporative_dryer: OK -- the free-moisture dryer announces"
          " the limit its own answer satisfies (evapDryer01 complete,"
          " evapDryer02 saturation-bound above its floor with the payable"
          " heat named, the lithium plant's FINISHING.dryer heat-bound AT its"
          " floor below the exhaust cap, warned at the site and in the caveat"
          " block), evaporates at the floor exactly what the gas pays for"
          " (doubling the gas doubles the water removed, to 2e-9), and"
          " announces the zero heat capacity it defaults for NaCl.  NOT"
          " checked: its hand energy surface against the energy report (the"
          " report refuses these cases -- their salts carry no formation"
          " datum), whether the feed-temperature floor is right, or any"
          " measured dryer.")


if __name__ == "__main__":
    main()
