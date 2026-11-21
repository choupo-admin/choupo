#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gate: a gas-only species stays in the vapour, and a state with no vapour to
hold it is refused by name (DEV.md 4c C458).

    bin/curate/check_gas_only.py

THE REAL DEFECT THIS WOULD HAVE CAUGHT.  Until 2026-11-21 every radical in the
catalogue carried `role nonvolatile;` and the role word `radical` did the same
thing: K = 0, so a phase split sent the radical to the LIQUID.  Measured on this
gate's own witness with the engine of e52a6ce06: the 330 K flash of a combustion
gas put all 0.1 kmol/h of OH into the water condensate (2.6 mol % of it) and the
offgas carried none; the energy balance then refused, but the mass balance and
every golden were green -- a golden pins what a run prints, and the run printed
the wrong split.  Nothing in the suite asked where a radical goes.

WHAT THIS GATE CHECKS (choupoSolve, tutorials/steady/flash/flash23_gas_only_oh_quench).
  (a) THE PHASE RULE.  N2 + water + OH (a gas-only species of the NASA table,
      `role radical;`) through a 1500 K flash (one vapour, V/F = 1) and a 330 K
      flash (water condenses, 0 < V/F < 1): every OH molecule leaves in the
      offgas (relative difference to the feed's OH <= 1e-9) and the condensate
      carries at most the cap's own trace (mole fraction <= 1e-12, i.e. at or
      below 1/ThermoPackage::kNoLiquidK).
  (b) THE REFUSAL.  The same feed handed to a bubble point (`bubbleT`, the
      liquid that holds the whole feed: a state with no vapour) must exit
      non-zero naming `gas-only species 'OH'` and `no vapour phase to hold it`.
  SABOTAGE ARM.  The witness rerun with a case-local OH record that says
  `role nonvolatile;` (the pre-C458 record, read alone: case > components >
  table) must FAIL arm (a): OH then lands in the condensate, so the comparison
  has teeth.

NOT CHECKED: the refusal of a liquid-liquid or liquid-solid flash and of a
property system with no vapour phase (the same one function,
ThermoPackage::refuseGasOnlyWithoutVapour, is called there; no corpus case
reaches those shapes with a gas-only species); the phi-phi K branch; any unit
that prices a stream as liquid without a phase split (a pump fed a radical is
not refused: the refusal sits at the phase-split seams).
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gatekit  # noqa: E402

CASE = "tutorials/steady/flash/flash23_gas_only_oh_quench"
STRIP = ("expected", "converged", "reports", "constant/propertyManifest")
FEED_OH = 0.1 / 3600.0 * 1000.0      # kmol/h -> mol/s
TRACE = 1.0e-12
BUBBLE = """units
(
    {
        name        sat;
        type        bubbleT;
        in          feed;
        outputs     ( );
        operation   { P 1.0 bar; }
    }
);
"""


def result(out):
    m = re.search(r"<<<Choupo:result-begin>>>\s*(\{.*?\})\s*<<<Choupo:result-end>>>", out, re.S)
    return json.loads(m.group(1)) if m else None


def phase_rule(j):
    """The arm (a) findings for one result (empty = the rule holds)."""
    bad = []
    try:
        s, k = j["streams"], j["kpis"]
        off, cond = s["offGas"], s["condensate"]
        oh_off = off["F"] * off["composition"]["OH"] * 1000.0     # kmol/s -> mol/s
        z_cond = cond["composition"].get("OH", 0.0)
        vf_hot, vf_cold = k["hot"]["V_over_F"], k["cold"]["V_over_F"]
    except (TypeError, KeyError) as e:
        return [f"result lacks {e}"]
    if abs(oh_off / FEED_OH - 1.0) > 1.0e-9:
        bad.append(f"offGas carries {oh_off / FEED_OH:.6g} of the feed's OH (want 1 to 1e-9)")
    if z_cond > TRACE:
        bad.append(f"the condensate holds OH at mole fraction {z_cond:.3g} (> {TRACE:g}, the cap's trace)")
    if vf_hot != 1:
        bad.append(f"the 1500 K flash is not all vapour (V/F = {vf_hot})")
    if not 0.0 < vf_cold < 1.0:
        bad.append(f"the 330 K flash condensed nothing (V/F = {vf_cold}): the witness lost its point")
    return bad


def main():
    failures = []
    solve = gatekit.binary("choupoSolve")

    with gatekit.probe_copy(CASE, strip=STRIP) as c:
        rc, out = gatekit.run(solve, c)
    j = result(out) if rc == 0 else None
    zc = None
    if j is None:
        failures.append(f"(a) the witness did not run (exit {rc}): " + " | ".join(out.strip().splitlines()[-2:]))
    else:
        failures += ["(a) " + b for b in phase_rule(j)]
        zc = j["streams"]["condensate"]["composition"].get("OH", 0.0)

    with gatekit.probe_copy(CASE, strip=STRIP) as c:
        (c / "system" / "flowsheetDict").write_text(BUBBLE)
        for s in ("hotLiquid", "hotVapour", "condensate", "offGas"):
            (c / "0" / s).unlink()
        rc, out = gatekit.run(solve, c)
    if rc == 0:
        failures.append("(b) the bubble point of a feed holding OH exited 0: a liquid was handed a gas-only species")
    elif "gas-only species 'OH'" not in out or "no vapour phase to hold it" not in out:
        failures.append("(b) the bubble point failed, but not by the named refusal: "
                        + " | ".join(l for l in out.splitlines() if "ERROR" in l)[:300])

    with gatekit.probe_copy(CASE, strip=STRIP) as c:
        rec = (gatekit.repo / "data/standards/thermoTables/NASA-TP-2002-211556/OH.dat").read_text()
        rec, n = re.subn(r"(?m)^role\s+radical;.*$", "role           nonvolatile;   // SABOTAGE: the pre-C458 record", rec)
        (c / "constant" / "components").mkdir(parents=True, exist_ok=True)
        (c / "constant" / "components" / "OH.dat").write_text(rec)
        rc, out = gatekit.run(solve, c)
    js = result(out)
    if n != 1:
        failures.append("sabotage arm: the table's OH record no longer says `role radical;` -- the probe is stale")
    elif js is None:
        failures.append(f"sabotage arm: the sabotaged witness gave no result (exit {rc})")
    elif not phase_rule(js):
        failures.append("sabotage arm: with OH `role nonvolatile` arm (a) still holds -- it cannot see the defect")

    return gatekit.verdict(
        "check_gas_only", failures,
        "a gas-only species stays in the vapour: flash23's OH leaves whole in the offgas, the 330 K condensate "
        f"holds it at {zc:.1e} (cap trace <= {TRACE:g}); a bubble point of the feed is refused by name; "
        "a `role nonvolatile` OH (the pre-C458 record) is seen",
    )


if __name__ == "__main__":
    sys.exit(main())
