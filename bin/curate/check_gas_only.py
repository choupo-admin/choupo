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

SLICE 2 (2026-11-21, the review of e537d5766; each arm names the defect it would
have caught, measured on the engine of e537d5766 unless said otherwise):
  (c) THE TAG ONLY WHERE TRUE (point 1).  The importer tagged EVERY record of the
      894 `role radical;` -- S8, AlCl3, Kr, SiF4 and AL2O3(g) included -- so a
      closed-shell molecule was a "non-condensable" with K = 1e12 in a flash that
      could have condensed it.  The role is now decided from the formula
      (bin/curate/nasa_tp2002_to_choupo.py `role_of`: odd electron count, free
      atom, a listed set of biradicals -> `gasOnly`; the rest -> `gasData`) and
      `retag --check` must find every record on disk equal to that decision.
  (d) NO LIQUID MODEL (point 1).  A `gasData` species (ALCL3) in the flash23 feed:
      a 330 K flash must be REFUSED naming `Component 'ALCL3'`, `role gasData`
      and the unit; before, the missing vapour pressure fell into a 1 Pa
      reference (LiquidPhase) or a generic "no vapour-pressure correlation"
      message naming no unit.  The same species in a gas-phase Gibbs reactor
      (claus01_thermal_stage, which takes SO, S from the table) must NOT refuse.
  (e) VLLE (point 2).  vlle03_audit_artificial plus OH (a gas-only species of the
      table): the three-phase flash must converge with OH wholly in the vapour
      (liquids at exactly 0, vapour OH = the feed's).  Before, the VLLE branch
      asked OH for its vapour pressure and refused the flash with a message about
      a record a radical cannot have (the Nelder-Mead variant that kept OH as a
      variable left 3.5e-4 of it in a liquid and never converged).
  (f) THE TRACE LEVEL (point 6).  A bubble point of water carrying OH at mole
      fraction 5e-7 (below ThermoPackage::kGasOnlyTrace = 1e-6) must run and
      equal the pure-water bubble point to 1e-4 K (the printed digits), announcing the trace; the
      same at 2e-6 must be refused.  Before, the edge was 1e-12, so a 1e-10 trace
      a mechanism leaves was refused.
  (g) AN OVERLAY OF A TABLE SPECIES (point 4).  `overlayOf OH;` in a case-local
      record of OH (which lives only in the table) must be refused by name; before
      the record was read alone, its `overlayOf` key and all, and the table's data
      silently never merged.
  (i) A HARD REFUSAL (2026-11-21 fix round, S1-a).  The reviewer's probe: elementary02a's
      PFR fed nButane 1 + water 0.5 + 0.01 kmol/h of HNO (a closed-shell table species,
      gasData) at 330 K, 3 bar.  Before the fix the no-liquid-model refusal was a plain
      runtime_error, the outlet resolution's catch-all swallowed it, the stream was priced
      "on the state it CARRIES" and the run exited 0 with vf 1.000 (the same run with OH
      resolves vf 0.374 and warns of the dew point).  It must now be refused by name.
  (j) AN ABSENT gasData SPECIES NEVER REFUSES.  claus01_thermal_stage with SiF4 (gasData, in the
      table) added to its components at zero flow everywhere: the run's streams (SiF4's own
      zero entry apart) and kpis must equal the shipped run's exactly -- a zero flow must
      not switch streams to "carried" (it did, five of them, with a zero-flow SO retagged).
  (h) AN SRI THAT CROSSES ZERO (point 5).  ignition01_h2o2_jac with R9's Troe
      replaced by `sri ( -0.5 100 979 )`: W = a exp(-b/T) + exp(-T/c) is +0.38 at
      300 K (where the load-time check looks) and negative from about 900 K, where
      the run starts at 1100 K.  The run must be refused naming the reaction, T
      and W; before, ln W was NaN inside the rate.

NOT CHECKED (see SLICE 2 above for what is): the refusal of a liquid-liquid or
liquid-solid flash and of a property system with no vapour phase (the same one function,
ThermoPackage::refuseGasOnlyWithoutVapour, is called there; no corpus case
reaches those shapes with a gas-only species); the phi-phi K branch; any unit
that prices a stream as liquid without a phase split (a pump fed a radical is
not refused: the refusal sits at the phase-split seams).
"""
import importlib.util
import json
import re
import subprocess
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

NASA = "bin/curate/nasa_tp2002_to_choupo.py"
VLLE = "tutorials/steady/flash/vlle03_audit_artificial"
GAS_REACTOR = "tutorials/steady/gibbs/claus01_thermal_stage"
JAC = "tutorials/batch/combustion/ignition01_h2o2_jac"


def retarget_species(c, old, new):
    """flash23's probe copy with `new` (a table species) in OH's place."""
    gatekit.edit(c / "constant/thermoPhysPropDict", "components       ( N2 water OH );",
                 f"components       ( N2 water {new} );")
    for st in ("feed", "hotLiquid", "hotVapour", "condensate", "offGas"):
        f = c / "0" / st
        f.write_text(re.sub(r"\b%s\b" % old, new, f.read_text()))


def vlle_with_oh(c):
    """vlle03 plus 1 kmol/h of OH, with its three ideal NRTL pairs written as the
    case's own records (a pair is found by name)."""
    d = c / "constant/thermoPhysPropDict"
    gatekit.edit(d, "components       ( compA  compB  compC );",
                 "components       ( compA  compB  compC  OH );\nspeciesTables ( NASA-TP-2002-211556 );")
    gatekit.edit(d, "                compB-compC { }",
                 "                compB-compC { }\n                OH-compA { }\n"
                 "                OH-compB { }\n                OH-compC { }")
    gatekit.edit(c / "0/feed", "    compC    33.33 kmol/h;", "    compC    33.33 kmol/h;\n    OH       1.0 kmol/h;")
    tpl = (c / "constant/parameters/NRTL/compA-compB.dat").read_text()
    for x in ("compA", "compB", "compC"):
        t = tpl.replace("compB", "OH").replace("compA", x)
        t = t.replace("1750.0", "0.0")
        t = t.replace(f"components  ( {x}  OH )", f"components  ( OH  {x} )")
        t = t.replace(f"pair {{ i {x}; j OH; }}", f"pair {{ i OH; j {x}; }}")
        t = re.sub(r"(?m)^    i          %s;" % x, "    i          OH;", t)
        t = re.sub(r"(?m)^    j          OH;", f"    j          {x};", t)
        (c / f"constant/parameters/NRTL/OH-{x}.dat").write_text(t)


def bubble_probe(c, oh_kmol_h):
    """flash23's feed reduced to water + a trace of OH, handed to a bubble point."""
    (c / "system" / "flowsheetDict").write_text(BUBBLE)
    for st in ("hotLiquid", "hotVapour", "condensate", "offGas"):
        (c / "0" / st).unlink()
    f = c / "0/feed"
    t = f.read_text()
    t = re.sub(r"N2\s+80\s+kmol/h;", "N2 0.0 kmol/h;", t)
    t = re.sub(r"water\s+19.9\s+kmol/h;", "water 100 kmol/h;", t)
    t = re.sub(r"OH\s+0.1\s+kmol/h;", f"OH {oh_kmol_h} kmol/h;", t)
    f.write_text(t)


PFR = "tutorials/steady/reactors/elementary02a_thirdBody_chemkin"


def hno_pfr(c):
    """elementary02a with water and 0.01 kmol/h of HNO (table, gasData) in a 330 K feed."""
    gatekit.edit(c / "constant/thermoPhysPropDict", "components       ( nButane isoButane );",
                 "components       ( nButane isoButane water HNO );\nspeciesTables ( NASA-TP-2002-211556 );")
    gatekit.edit(c / "0/feed", "    nButane    1.0 kmol/h;",
                 "    nButane    1.0 kmol/h;\n    water      0.5 kmol/h;\n    HNO        0.01 kmol/h;")
    gatekit.edit(c / "0/feed", r"T\s+900 K;", "T 330 K;", regex=True)



def tbubble(out):
    m = re.search(r"T_bubble:\s+([0-9.]+)\s+K", out)
    return float(m.group(1)) if m else None


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
        rec, n = re.subn(r"(?m)^role\s+gasOnly;.*$", "role           nonvolatile;   // SABOTAGE: the pre-C458 record", rec)
        (c / "constant" / "components").mkdir(parents=True, exist_ok=True)
        (c / "constant" / "components" / "OH.dat").write_text(rec)
        rc, out = gatekit.run(solve, c)
    js = result(out)
    if n != 1:
        failures.append("sabotage arm: the table's OH record no longer says `role gasOnly;` -- the probe is stale")
    elif js is None:
        failures.append(f"sabotage arm: the sabotaged witness gave no result (exit {rc})")
    elif not phase_rule(js):
        failures.append("sabotage arm: with OH `role nonvolatile` arm (a) still holds -- it cannot see the defect")


    # ---- (c) the tag only where true --------------------------------------------
    r = subprocess.run([sys.executable, str(gatekit.repo / NASA), "retag", "--check"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        failures.append("(c) the records on disk disagree with the formula's role decision: "
                        + " | ".join(r.stdout.strip().splitlines()[:3]))
    spec = importlib.util.spec_from_file_location("nasa_roles", gatekit.repo / NASA)
    nasa = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(nasa)
    for f, want in (("OH", "gasOnly"), ("H", "gasOnly"), ("O", "gasOnly"), ("CH3", "gasOnly"),
                    ("CH2", "gasOnly"), ("S8", "gasData"), ("AlCl3", "gasData"),
                    ("SiF4", "gasData"), ("Kr", "gasData"), ("ClO2", "gasData"), ("S2", "gasData"), ("SO", "gasOnly"),
                    ("Al", "gasData"), ("Hg", "gasData"), ("Na", "gasData"), ("FeCl3", "gasData"), ("TiCl3", "gasData"),
                    ("UF5", "gasData"), ("VO2", "gasData"), ("AlO", "gasOnly"), ("B", "gasOnly"), ("Si", "gasOnly")):
        if nasa.role_of(f)[0] != want:
            failures.append(f"(c) role_of({f}) = {nasa.role_of(f)[0]}, want {want}")
    for f, why in nasa.BIRADICALS.items():
        if not why.strip():
            failures.append(f"(c) biradical {f} is listed without a reason")
    n_gas = sum(1 for _ in (gatekit.repo / "data/standards/thermoTables/NASA-TP-2002-211556").glob("*.dat")
                if re.search(r"(?m)^role\s+gasOnly;", _.read_text()))
    n_all = len(list((gatekit.repo / "data/standards/thermoTables/NASA-TP-2002-211556").glob("*.dat")))
    if not 0 < n_gas < n_all:
        failures.append(f"(c) {n_gas} gasOnly of {n_all} records: the tag is on all or none")

    # ---- (d) no liquid model --------------------------------------------------
    with gatekit.probe_copy(CASE, strip=STRIP) as c:
        retarget_species(c, "OH", "ALCL3")
        rc, out = gatekit.run(solve, c)
    if rc == 0:
        failures.append("(d) a flash of a feed holding a closed-shell table species (ALCL3, role gasData) exited 0")
    elif not all(w in out for w in ("Component 'ALCL3'", "role gasData", "unit 'hot'", "NO liquid model")):
        failures.append("(d) the flash was refused, but not naming species, role and unit: "
                        + " | ".join(l for l in out.splitlines() if "ERROR" in l)[:300])
    with gatekit.probe_copy(GAS_REACTOR, strip=STRIP) as c:
        rc, out = gatekit.run(solve, c)
    if rc != 0:
        failures.append("(d) the gas-phase Gibbs reactor claus01_thermal_stage (table species, no liquid asked) "
                        "was refused: " + " | ".join(out.strip().splitlines()[-2:])[:300])

    # ---- (e) VLLE with a gas-only species ---------------------------------------
    with gatekit.probe_copy(VLLE, strip=STRIP + ("constant/propertyManifest",)) as c:
        vlle_with_oh(c)
        rc, out = gatekit.run(solve, c)
    jv = result(out) if rc == 0 else None
    if jv is None:
        failures.append(f"(e) VLLE with OH did not run (exit {rc}): "
                        + " | ".join(l for l in out.splitlines() if "ERROR" in l)[:300])
    else:
        try:
            st = jv["streams"]
            vap, la, lb = st["vapor"], st["liquidA"], st["liquidB"]
            oh_v = vap["F"] * vap["composition"]["OH"] * 1000.0
            feed_oh = 1.0 / 3600.0 * 1000.0
            if abs(oh_v / feed_oh - 1.0) > 1e-9:
                failures.append(f"(e) the vapour carries {oh_v / feed_oh:.9g} of the feed's OH (want 1)")
            for nm, x in (("liquidA", la), ("liquidB", lb)):
                if x["composition"].get("OH", 0.0) > TRACE:
                    failures.append(f"(e) {nm} holds OH at {x['composition']['OH']:.3g} (> {TRACE:g})")
            if not (vap["F"] > 0 and la["F"] > 0 and lb["F"] > 0):
                failures.append("(e) the witness lost its three phases")
        except (KeyError, TypeError) as e:
            failures.append(f"(e) result lacks {e}")

    # ---- (f) the trace level -----------------------------------------------------
    Tb = {}
    for tag, oh in (("none", "0.0"), ("below", "5e-5"), ("above", "2e-4")):
        with gatekit.probe_copy(CASE, strip=STRIP) as c:
            bubble_probe(c, oh)
            rc, out = gatekit.run(solve, c)
        Tb[tag] = (rc, out)
    rc0, o0 = Tb["none"]
    rcb, ob = Tb["below"]
    rca, oa = Tb["above"]
    if rc0 != 0 or tbubble(o0) is None:
        failures.append("(f) the pure-water bubble point did not run: " + " | ".join(o0.strip().splitlines()[-2:])[:200])
    elif rcb != 0 or tbubble(ob) is None:
        failures.append("(f) a bubble point carrying OH at 5e-7 (below the trace level) was refused: "
                        + " | ".join(l for l in ob.splitlines() if "ERROR" in l)[:300])
    else:
        if abs(tbubble(ob) - tbubble(o0)) > 1e-4:   # printed to 1e-4 K
            failures.append(f"(f) the OH trace moved the bubble point: {tbubble(ob)} against {tbubble(o0)} K")
        if "gas-only trace 'OH'" not in ob:
            failures.append("(f) the trace was carried without being announced")
    if rca == 0:
        failures.append("(f) a bubble point carrying OH at 2e-6 (above the trace level) exited 0")
    elif "gas-only species 'OH'" not in oa:
        failures.append("(f) the 2e-6 bubble point failed, but not by the named refusal")

    # ---- (g) an overlay of a table species ---------------------------------------
    with gatekit.probe_copy(CASE, strip=STRIP) as c:
        (c / "constant" / "components").mkdir(parents=True, exist_ok=True)
        (c / "constant/components/OH.dat").write_text("overlayOf OH;\nMW 17.5;\n")
        rc, out = gatekit.run(solve, c)
    if rc == 0:
        failures.append("(g) `overlayOf OH;` on a table-only species exited 0 (the overlay was ignored)")
    elif "overlay of a table species is not supported" not in out:
        failures.append("(g) the overlay was refused, but not by the named message: "
                        + " | ".join(l for l in out.splitlines() if "ERROR" in l)[:300])

    # ---- (i) the hard refusal ---------------------------------------------------
    with gatekit.probe_copy(PFR, strip=STRIP + ("constant/propertyManifest", "converged", "reports")) as c:
        hno_pfr(c)
        rc, out = gatekit.run(solve, c)
    if rc == 0:
        failures.append("(i) a PFR fed a closed-shell table species (HNO, gasData) exited 0: the refusal "
                        "was swallowed and the stream priced on the state it carries")
    elif not all(w in out for w in ("Component 'HNO'", "role gasData", "unit 'reactor'")):
        failures.append("(i) the PFR was refused, but not naming species, role and unit: "
                        + " | ".join(l for l in out.splitlines() if "ERROR" in l)[:300])

    # ---- (j) an absent gasData species never refuses ----------------------------------
    with gatekit.probe_copy(GAS_REACTOR, strip=STRIP) as c:
        rc0, out0 = gatekit.run(solve, c)
    with gatekit.probe_copy(GAS_REACTOR, strip=STRIP + ("constant/propertyManifest",)) as c:
        gatekit.edit(c / "constant/thermoPhysPropDict",
                     "components ( H2S SO2 water CO2 CO N2 O2 H2 S2 S8 S SO carbonylSulfide CS2 );",
                     "components ( H2S SO2 water CO2 CO N2 O2 H2 S2 S8 S SO carbonylSulfide CS2 SiF4 );")
        rc1, out1 = gatekit.run(solve, c)
    j0, j1 = result(out0) if rc0 == 0 else None, result(out1) if rc1 == 0 else None
    if j0 is None or j1 is None:
        failures.append(f"(j) the claus01 runs did not both complete (exit {rc0}, {rc1}): "
                        + " | ".join(l for l in out1.splitlines() if "ERROR" in l)[:300])
    else:
        def strip_sif4(streams):
            return {k: {f: (({a: b for a, b in v.items() if a != "SiF4"}) if f == "composition" else v)
                        for f, v in d.items()} for k, d in streams.items()}
        if strip_sif4(j0["streams"]) != strip_sif4(j1["streams"]):
            failures.append("(j) claus01 with SiF4 (gasData, zero flow) in its components differs from the "
                            "shipped run in its streams: a zero-flow gasData species refused something")
        if j0.get("kpis") != j1.get("kpis"):
            failures.append("(j) claus01 with a zero-flow gasData species differs from the shipped run in its kpis")
        if "priced on the state it CARRIES" in out1 and "priced on the state it CARRIES" not in out0:
            failures.append("(j) a zero-flow gasData species switched a stream to the carried state")

    # ---- (h) an SRI that crosses zero ----------------------------------------------
    with gatekit.probe_copy(JAC, strip=("expected", "latest", "solution.log", "trajectory.csv")) as c:
        gatekit.edit(c / "constant/reactions", "troe ( 0.5 1e-30 1e+30 1e+100 );", "sri ( -0.5 100 979 );")
        rc, out = gatekit.run(gatekit.binary("choupoBatch"), c)
    if rc == 0:
        failures.append("(h) a run whose SRI W goes negative exited 0 (NaN walked through the rate)")
    elif not all(w in out for w in ("not positive at T =", "R9_")):
        failures.append("(h) the SRI run failed, but not naming the reaction, T and W: "
                        + " | ".join(l for l in out.splitlines() if "ERROR" in l)[:300])

    return gatekit.verdict(
        "check_gas_only", failures,
        "a gas-only species stays in the vapour: flash23's OH leaves whole in the offgas, the 330 K condensate "
        f"holds it at {zc:.1e} (cap trace <= {TRACE:g}); a bubble point of the feed is refused by name; "
        "a `role nonvolatile` OH (the pre-C458 record) is seen; the roles on disk are the formula's "
        f"({n_gas} gasOnly of {n_all}); a gasData species is refused where a liquid is asked, by name; VLLE keeps "
        "OH wholly in the vapour; a 5e-7 trace is carried, 2e-6 refused; an overlay of a table species and a "
        "non-positive SRI W are refused by name",
    )


if __name__ == "__main__":
    sys.exit(main())
