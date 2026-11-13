#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""The adaptive integrator's positivity guard is a per-ROW mask that covers
every packed unit (DEV.md 4c C185 item 8).

THE DEFECT THIS GATE EXISTS FOR.  `AdaptiveTimeStepper::advance` packs the
ODE-form units of a run into ONE state vector, each unit at its own offset,
and until 2026-10-31 handed the integrator a positivity guard that could only
mark a CONTIGUOUS PREFIX of that vector:

    ctrl.nPositive = (units.size() == 1) ? units[0].nPositive : 0;

so with two or more ODE units the guard was OFF.  A trial step that drove a
mole number negative was ACCEPTED (its local error can be exactly zero: a
zeroth-order rate is linear in t), committed, and then CLIPPED to zero by the
unit's `setOdeState` -- the reviewer's A -> B from A = 1 beside an idle second
unit integrated A = -1, B = 2 and published A = 0, B = 2 at exit 0: the
inventory doubled, and no golden could see it (a golden pins what a run
PRINTS).  Now `ODEControls::positiveRows` is a mask over the whole vector, the
driver marks every unit's leading rows at that unit's offset, the integrator
REJECTS a trial that drives a masked row negative (the step halves, as the
single-unit case always did) and the commit clips nothing: a negative masked
row reaching `setOdeState` is an engine defect and is REFUSED by name.

THE FIXTURE.  Built in a temp dir from unsteady02_tanks_in_series' own
components: tank1 holds 1 kmol of compA in 1 m3 and runs a ZEROTH-order
compA -> compB at k = 0.02 kmol/(m3 s) (A = 0.02, Ea = 0: a rate the holdup
cannot stop, so n_A crosses zero at t = 50 s and the exact solution at
t = 100 s is A = -1, B = 2 -- the review's numbers); tank2 is an idle vessel
fed by tank1's outlet; the feed is 1e-9 kmol/s of compA so the holdup total
is invariant (F_out = F_in).  Adaptive stepping with deltaTmax = 100 s, so
the integrator's first grown step reaches past the crossing in ONE step whose
local error is exactly zero.

  (a) TWO UNITS, past the crossing (endTime 100): the run REFUSES, naming
      the cause (`a positive row driven negative`), the unit ('tank1') and
      the row (compA), with exit != 0 and NO `100/` directory written; the
      refusal is the C178 one (the state is not advanced).  The same fixture
      stopped BEFORE the crossing (endTime 40) runs to exit 0 and publishes
      n_compA = 0.2, n_compB = 1.8, total 1.0 to 1e-9 -- the mask rejects
      nothing a positivity-preserving integration would accept.
  (b) ONE UNIT (tank2 removed), past the crossing: refuses with the same
      cause, the same unit and the same row -- the mask over the two-unit
      vector is the prefix guard the single-unit case always had.  (The
      single-unit CORPUS case, ctrl03_adaptive_disturbance, was measured by
      hand against the parent build: its trajectory.csv is BYTE-IDENTICAL
      -- see the record below.)
  (c) choupoBatch packs its vessels through the SAME `advance`: two
      batchReactors (reactor1 zeroth-order, reactor2 idle at A = 0) past the
      crossing REFUSE naming the cause, the unit and the row.
  (d) SOURCE: AdaptiveTimeStep.H holds no `units.size() == 1` prefix logic;
      `nPositive` is no longer a member of ODEControls, and Rosenbrock23.cpp
      and EulerSI.cpp read `positiveRows`; the `setOdeState` bodies of
      DynamicCSTR.cpp and BatchReactor.cpp contain no `std::max<scalar>(y[i],
      0.0)` clip (the integrator path commits nothing negative; a negative
      row there refuses).

Scope: the Rosenbrock23 path both time loops run under `timeStepping
adaptive`.  NOT checked: the FIXED-step paths (each unit's own RK4 `step()`,
which cannot reject a step -- their clips are now ANNOUNCED, not silent, and
are named in the record); the EulerSI mask (read, but no corpus case reaches
it through `advance`); the RK4 integrator class, which reads no positivity
control at all.

BY-HAND SABOTAGES (2026-10-31), each rebuilt with `make -j1 all`, the gate
run, the file restored and rebuilt:

  S0  the PARENT build (e41af35f8, before the fix) -- the REPRODUCTION:
        check_positivity_mask: FAIL
          - (a) two units past the crossing: the run did NOT refuse (exit 0)
            -- published tank1 n_compA_final = 0, n_compB_final = 2
          - (a) two units past the crossing: the refusal does not name the
            cause 'a positive row driven negative'
          - (a) two units past the crossing: a `100/` directory was written
            for a state that overshot
          - (c) batch, two vessels past the crossing: the refusal does not
            name the cause ... / the unit 'reactor1' and its row 'n_ethanol'
          - (c) batch, two vessels past the crossing: a `2000/` directory
            was written for a state that overshot
          - (d) AdaptiveTimeStep.H still carries the single-unit prefix
            logic `units.size() == 1`  (and the four other source arms)
      The batch run on the parent published reactor1 n_ethanol = 0,
      n_ethylAcetate = 0.02 from 0.00925 kmol (total 0.04 from 0.0185) and
      exited 1 -- not a refusal of the step, but the CAMPAIGN element
      balance finding 36.75 % of the atoms unaccounted for, after the
      `2000/` directory was written.  The dynamic driver has no such
      ledger verdict on exit, hence its exit 0.  Arm (b) PASSES on the
      parent, as it must: one unit is the case the prefix always guarded
      (it refused at t = 50 s, 23 accepted / 175 rejected sub-steps).
  S1  the prefix logic restored in AdaptiveTimeStep.H
      (`ctrl.positiveRows.assign(units.size() == 1 ? units[0].nPositive : 0,
      true);` in place of the mask) -- rebuilt:
        check_positivity_mask: FAIL
          - (a) two units past the crossing: the refusal does not name the
            cause 'a positive row driven negative'
          - (a) two units past the crossing: the refusal does not name the
            unit 'tank1' and its row 'n_compA'
          - (c) batch, two vessels past the crossing: the refusal does not
            name the cause ... / the unit 'reactor1' and its row 'n_ethanol'
          - (d) AdaptiveTimeStep.H still carries the single-unit prefix
            logic `units.size() == 1`
      Arm (b) PASSES under S1, as it must (one unit IS the prefix).  Note
      what S1 did NOT reproduce: the parent's exit 0 and its `100/`
      directory.  With the mask off, the overshoot now reaches
      DynamicCSTR::setOdeState, which REFUSES it as an engine defect -- the
      second layer holding where the first was removed -- so the run ends
      with a refusal of the wrong NAME, and only the cause/row arms and the
      source arm can tell the two refusals apart.  That is why the gate
      checks the cause by its words and not by the exit code alone.
  S2  the integrator ignores the mask (`if (ctrl.positiveRows[i] && ynew[i]
      < 0.0)` made `if (false)` in Rosenbrock23.cpp) -- rebuilt:
        check_positivity_mask: FAIL
          - (a) two units past the crossing: the refusal does not name the
            cause ... / the unit 'tank1' and its row 'n_compA'
          - (b) one unit past the crossing: the refusal does not name the
            cause ... / the unit 'tank1' and its row 'n_compA'
          - (c) batch, two vessels past the crossing: the refusal does not
            name the cause ... / the unit 'reactor1' and its row 'n_ethanol'
      All three fixture arms, because now the one-unit case is unguarded
      too; again the setOdeState refusal ("committed a NEGATIVE mole
      number ... an engine defect") is what ends each run.  Arm (d) passes
      under S2: the source still READS `positiveRows` -- a source arm sees
      a name, never whether the read decides anything.

Exit 1 listing failures."""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BIN = ROOT / "build" / "linux64Gcc"
SEMI = BIN / "choupoSemiContinuous"
BATCH = BIN / "choupoBatch"
DONOR = ROOT / "tutorials" / "unsteady" / "unsteady02_tanks_in_series"
BATCH_DONOR = ROOT / "tutorials" / "batch" / "reactor" / "batch01_first_order"

K = 0.02          # kmol/(m3 s), zeroth order; V = 1 m3 -> dn_A/dt = -0.02 kmol/s
NA0 = 1.0         # kmol in tank1
CAUSE = "a positive row driven negative"

failures = []
HEADER = """/*--------------------------------*- Choupo -*--------------------------------*\\
  check_positivity_mask fixture -- built in a temp dir by the gate, never
  shipped.  See bin/curate/check_positivity_mask.py.
\\*---------------------------------------------------------------------------*/
"""


def run(binary, case):
    e = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(binary), str(case)], capture_output=True,
                       text=True, timeout=600, env=e)
    out = r.stdout + r.stderr
    j = None
    if "<<<Choupo:result-begin>>>" in out:
        try:
            j = json.loads(out.split("<<<Choupo:result-begin>>>")[1]
                              .split("<<<Choupo:result-end>>>")[0])
        except json.JSONDecodeError:
            j = None
    return r.returncode, j, out


# ------------------------------------------------ the semiContinuous fixture
def build_semi(tmp, name, end_time, two_units):
    case = Path(tmp) / name
    (case / "system").mkdir(parents=True)
    (case / "constant").mkdir()
    (case / "0" / "internalStates").mkdir(parents=True)
    (case / f"{name}.cho").write_text("")
    # the donor's thermo and components, verbatim; its reactions replaced
    shutil.copy(DONOR / "constant" / "thermoPhysPropDict", case / "constant")
    shutil.copytree(DONOR / "constant" / "components",
                    case / "constant" / "components")
    (case / "constant" / "reactions").write_text(HEADER + f"""
zeroOrder_A_to_B
{{
    limitingReactant   compA;
    stoichiometry
    (
        {{ component compA;  nu -1;  order 0; }}
        {{ component compB;  nu  1;  order 0; }}
    );
    kinetics
    {{
        type   Arrhenius;
        A      {K};
        Ea     0.0;
    }}
    dH_rxn  0.0;
}}
""")
    tank2 = """
    {
        name        tank2;
        type        dynamicCSTR;
        in          s12;
        outputs     ( product );
        operation   { UA 0.0; T_jacket 330.0 K; }
    }
""" if two_units else ""
    (case / "system" / "flowsheetDict").write_text(HEADER + f"""
units
(
    {{
        name        tank1;
        type        dynamicCSTR;
        in          feed;
        outputs     ( {"s12" if two_units else "product"} );
        operation   {{ UA 0.0; T_jacket 330.0 K; }}
        reaction    zeroOrder_A_to_B;
    }}{tank2}
);
""")
    (case / "system" / "controlDict").write_text(HEADER + f"""
application   choupoSemiContinuous;
description   "positivity-mask fixture: zeroth-order A -> B past the zero crossing";
verbosity     1;
startTime       0;
endTime         {end_time};
deltaT          {end_time};
writeInterval   {end_time};
timeStepping    adaptive;
timeSteppingControl
{{
    rtol        1.0e-6;
    atol        1.0e-12;
    deltaT0     1.0;
    deltaTmax   {end_time};
    maxGrowth   {end_time};
}}
""")
    for s in (["feed", "s12"] if two_units else ["feed"]):
        (case / "0" / s).write_text(HEADER + """
componentMolarFlows
{
    compA  1.0e-09 kmol/s;
    compB  0.0 kmol/s;
}
T               330.0 K;
P               101325.0 Pa;
""")
    (case / "0" / "internalStates" / "tank1").write_text(HEADER + f"""
recordType  internalState;
unit        "tank1";
equipment   dynamicCSTR;
holdup
{{
    T           330.0;
    P           101325.0;
    V           1.0;
    holdupMolar {{ compA {NA0}; compB 0.0; }}
}}
""")
    if two_units:
        (case / "0" / "internalStates" / "tank2").write_text(HEADER + """
recordType  internalState;
unit        "tank2";
equipment   dynamicCSTR;
holdup
{
    T           330.0;
    P           101325.0;
    V           0.001;
    holdupMolar { compA 0.004; compB 0.0; }
}
""")
    return case


# -------------------------------------------------------- the batch fixture
def build_batch(tmp, end_time):
    case = Path(tmp) / "batch_two_vessels"
    shutil.copytree(BATCH_DONOR, case, ignore=shutil.ignore_patterns(
        "expected", "propertyManifest", "converged", "log.*", "reports",
        "trajectory.csv", "[1-9]*", "0.*"))
    # ethanol 0.00925 kmol in 1 litre; a zeroth-order rate of 1e-2 kmol/(m3 s)
    # x 1e-3 m3 = 1e-5 kmol/s crosses zero at 925 s (the gate runs to 2000 s,
    # where the exact solution is ethanol = -0.01075, ethylAcetate = 0.02).
    (case / "constant" / "reactions").write_text(HEADER + """
zeroOrder_ester
{
    limitingReactant   ethanol;
    stoichiometry
    (
        { component aceticAcid;    nu -1;  order 0; }
        { component ethanol;       nu -1;  order 0; }
        { component ethylAcetate;  nu  1;  order 0; }
        { component water;         nu  1;  order 0; }
    );
    kinetics { type Arrhenius;  A 1.0e-2;  Ea 0.0; }
}
idle_ester
{
    limitingReactant   ethanol;
    stoichiometry
    (
        { component aceticAcid;    nu -1;  order 0; }
        { component ethanol;       nu -1;  order 0; }
        { component ethylAcetate;  nu  1;  order 0; }
        { component water;         nu  1;  order 0; }
    );
    kinetics { type Arrhenius;  A 0.0;  Ea 0.0; }
}
""")
    fs = case / "system" / "flowsheetDict"
    txt = fs.read_text()
    txt = re.sub(r"units\s*\(.*\);", """units
(
    {
        name        reactor1;
        type        batchReactor;
        operation   { mode isothermal;  T_setpoint 350.0 K; }
        reaction    zeroOrder_ester;
    }
    {
        name        reactor2;
        type        batchReactor;
        operation   { mode isothermal;  T_setpoint 350.0 K; }
        reaction    idle_ester;
    }
);""", txt, flags=re.S)
    assert "reactor2" in txt
    fs.write_text(txt)
    cd = case / "system" / "controlDict"
    txt = cd.read_text()
    txt = re.sub(r"(?m)^endTime\s+[^;]+;", f"endTime         {end_time};", txt)
    txt = re.sub(r"(?m)^deltaT\s+[^;]+;", f"deltaT          {end_time};", txt)
    txt = re.sub(r"(?m)^writeInterval\s+[^;]+;",
                 f"writeInterval   {end_time};", txt)
    txt = re.sub(r"(?m)^verbosity\s+\d+;", "verbosity     1;", txt)
    txt += f"""
timeStepping    adaptive;
timeSteppingControl
{{
    rtol 1.0e-6;  atol 1.0e-12;  deltaT0 1.0;  deltaTmax {end_time};
    maxGrowth {end_time};
}}
"""
    cd.write_text(txt)
    hold = (case / "0" / "internalStates" / "reactor").read_text()
    (case / "0" / "internalStates" / "reactor").unlink()
    for u in ("reactor1", "reactor2"):
        (case / "0" / "internalStates" / u).write_text(
            hold.replace('unit        "reactor";', f'unit        "{u}";'))
    return case


def expect_refusal(tag, rc, j, out, unit, row, case, t_dir):
    ok = True
    if rc == 0:
        ok = False
        pub = ""
        if j is not None:
            k = j.get("kpis", {}).get(unit, {})
            pub = ", ".join(f"{kk} = {k[kk]:.6g}" for kk in sorted(k)
                            if kk.startswith("n_") and kk.endswith("_final"))
        failures.append(f"{tag}: the run did NOT refuse (exit 0) -- published"
                        f" {unit} {pub}")
    if CAUSE not in out:
        ok = False
        failures.append(f"{tag}: the refusal does not name the cause"
                        f" '{CAUSE}'\n--- tail:\n" + out[-800:])
    if f"of unit '{unit}' (n_{row})" not in out:
        ok = False
        failures.append(f"{tag}: the refusal does not name the unit '{unit}'"
                        f" and its row 'n_{row}'\n--- tail:\n" + out[-800:])
    if (case / t_dir).exists():
        ok = False
        failures.append(f"{tag}: a `{t_dir}/` directory was written for a"
                        " state that overshot")
    return ok


def main():
    for b in (SEMI, BATCH):
        if not b.exists():
            print(f"check_positivity_mask: {b} missing -- build first")
            return 1
    with tempfile.TemporaryDirectory() as tmp:
        # (a) two units, past the crossing
        case = build_semi(tmp, "two_units_past", 100, True)
        rc, j, out = run(SEMI, case)
        expect_refusal("(a) two units past the crossing", rc, j, out,
                       "tank1", "compA", case, "100")
        # (a) two units, before the crossing
        case = build_semi(tmp, "two_units_before", 40, True)
        rc, j, out = run(SEMI, case)
        a_before = None
        if rc != 0 or j is None:
            failures.append("(a) two units before the crossing: the run did"
                            " not finish\n--- tail:\n" + out[-800:])
        else:
            k = j["kpis"]["tank1"]
            na, nb = k["n_compA_final"], k["n_compB_final"]
            a_before = (na, nb)
            # the 1e-9 kmol/s feed adds F (1 - x_A) dt ~ 1.6e-8 kmol of A over
            # the 40 s; the TOTAL is exactly invariant (F_out = F_in).
            if abs(na - (NA0 - K * 40)) > 5e-8 or abs(nb - K * 40) > 5e-8:
                failures.append(f"(a) two units before the crossing: tank1"
                                f" n_compA = {na:.9g}, n_compB = {nb:.9g};"
                                f" expected {NA0 - K*40}, {K*40} (to 5e-8)")
            if abs(na + nb - NA0) > 1e-9:
                failures.append(f"(a) two units before the crossing: holdup"
                                f" total {na + nb:.12g} != {NA0}")
            if (case / "40").exists() is False:
                failures.append("(a) two units before the crossing: no `40/`"
                                " directory written for a finished run")
        # (b) one unit, past the crossing
        case = build_semi(tmp, "one_unit_past", 100, False)
        rc, j, out = run(SEMI, case)
        expect_refusal("(b) one unit past the crossing", rc, j, out,
                       "tank1", "compA", case, "100")
        # (c) choupoBatch, two vessels, past the crossing
        case = build_batch(tmp, 2000)
        rc, j, out = run(BATCH, case)
        expect_refusal("(c) batch, two vessels past the crossing", rc, j, out,
                       "reactor1", "ethanol", case, "2000")
    # (d) source -- CODE only: the records of what the guard used to be live
    # in comments, and a comment naming `nPositive` is history, not a reader.
    def code(path):
        s = (ROOT / path).read_text()
        s = re.sub(r"/\*.*?\*/", "", s, flags=re.S)
        return re.sub(r"//[^\n]*", "", s)
    ats = code("src/solver/ODE/AdaptiveTimeStep.H")
    if "units.size() == 1" in ats:
        failures.append("(d) AdaptiveTimeStep.H still carries the single-unit"
                        " prefix logic `units.size() == 1`")
    if "positiveRows" not in ats:
        failures.append("(d) AdaptiveTimeStep.H does not build `positiveRows`")
    ctrl = code("src/solver/ODE/ODEIntegrator.H")
    if re.search(r"\bnPositive\b", ctrl):
        failures.append("(d) ODEControls still declares `nPositive` (a prefix"
                        " count) -- the guard is the per-row mask `positiveRows`")
    for f in ("Rosenbrock23.cpp", "EulerSI.cpp"):
        s = code("src/solver/ODE/" + f)
        if "positiveRows" not in s or re.search(r"\bnPositive\b", s):
            failures.append(f"(d) {f} does not read the per-row mask"
                            " `positiveRows`")
    for f, fn in (("src/unitOperations/dynamic/DynamicCSTR.cpp", "DynamicCSTR"),
                  ("src/unitOperations/batch/BatchReactor.cpp", "BatchReactor")):
        s = code(f)
        m = re.search(fn + r"::setOdeState\(.*?\n\}", s, re.S)
        if m is None:
            failures.append(f"(d) {f}: setOdeState not found")
        elif re.search(r"std::max<scalar>\(y\[i\],\s*0\.0\)", m.group(0)):
            failures.append(f"(d) {f}: setOdeState still CLIPS a negative row"
                            " to zero -- a negative masked row reaching the"
                            " commit is a defect to refuse, never a clip")
    if failures:
        print("check_positivity_mask: FAIL")
        for f in failures:
            print("  -", f)
        return 1
    print("check_positivity_mask: OK -- the adaptive integrator's positivity"
          " guard is a per-row mask over every packed unit: a zeroth-order"
          " A -> B beside an idle second vessel (choupoSemiContinuous) and"
          " beside an idle second batchReactor (choupoBatch) REFUSES at the"
          " zero crossing naming the cause, the unit and the row, as the"
          " one-unit case does; stopped before the crossing it publishes"
          f" n_compA = {a_before[0]:.3f}, n_compB = {a_before[1]:.3f}, total"
          " 1.000; no prefix logic, no clip in the two setOdeState bodies."
          "  Scope: the Rosenbrock23 path under `timeStepping adaptive`;"
          " NOT checked: the fixed-step own-RK4 paths (announced clips),"
          " EulerSI through advance(), the RK4 class")
    return 0


if __name__ == "__main__":
    sys.exit(main())
