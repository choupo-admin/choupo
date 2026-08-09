#!/usr/bin/env python3
"""Model-boundary ledger gate (ruling 2026-08-09; record
docs/design/model-boundary-energy-ledger.md).

WHAT WAS WRONG.  `tutorials/steady/thermo/basis01_two_unit_chain` runs a
heater carrying a per-unit `thermo {}` override.  It solves its outlet in
its own declared world; the energy report prices both its streams in the
case's world, and read them 37.0149 kW apart against 40.0000 kW of declared
duty.  The 2.985 kW difference was charged to the unit and announced as "an
UNEXPLAINED first-law residual" under the RED conservation alarm.  It is the
enthalpy STEP at a model boundary -- the settled architecture's own
consequence of holding (T, P, z) and letting H step.

THE FIVE ARMS, each probed through the real binary.

  A1  THREE QUANTITIES, DISTINCT AND ALL PRESENT.  The raw imbalance, the
      declared step and the remaining residual appear as three separate
      fields in BOTH surfaces (the CSV and the result JSON), they agree
      with each other (raw - step == remaining), and they are demonstrably
      not one field wearing three names: on basis01 raw != remaining and
      step != 0.  The RAW figures the ruling named (37.0149 / 40.0000) are
      still on the surface that carried them.

  A2  THE ENTRY IDENTIFIES THE TRANSITION.  Both sides by their DECLARED
      model names -- checked against the names actually written in the
      case's own dicts, not against the ledger's own output -- plus the
      rule, the sign (agreeing with the step it describes), the units and
      the magnitude.

  A3  THE REMAINING RESIDUAL DECIDES, UNDER THE DECLARED CRITERIA.  With
      the step accounted, basis01's transporter closes at 100 % and raises
      no alarm, while its RAW closure of 92.54 % is still printed.  Declare
      `modelBoundaryClosure { tolerance 1e-30; }` in the case's solverDict
      and the same step is REFUSED: nothing is credited, the remaining
      residual goes back to the raw one, and the alarm returns.  The
      criterion is therefore doing the deciding, not decoration.

  A4  A FABRICATED BOUNDARY BUYS NOTHING.  `perUnitThermo01_srk_nrtl` with
      its turbine's `thermo {}` block deleted has a 536.54 kW imbalance and
      no declared override: the boundary reads `none`, the step is exactly
      0, the remaining equals the raw, and the RED alarm fires.  A boundary
      is a DECLARATION; the size of an imbalance is never evidence of its
      cause.

  A5  AN UNREPRODUCED STEP BUYS NOTHING.  `perUnitThermo01_srk_nrtl` as
      shipped: the turbine declares a real SRK world, the auditor prices a
      7.5 kW step across it, and 536 kW remains.  The status is
      `unconfirmed`, the step is printed but NOT credited, the remaining
      residual equals the raw one, and the alarm stays.

WHAT THIS GATE DOES NOT CLAIM.  It does not check that the step is
PHYSICALLY the right number -- that is the reproduction test's own job and
this gate only checks that the test is wired to the verdict.  It does not
cover the doctrine's refusal branches (speciation / datum / reading flips):
no case in the corpus crosses one, and a probe that had to synthesise the
whole case would be testing its own fixture.  Those branches are named in
the design record as untested by any witness.

SABOTAGE-VERIFIED (2026-08-09), three sabotages, and the OBSERVED output is
transcribed below rather than predicted -- today a gate shipped with an arm
that compared two numbers which AGREED under the defect it was written for,
so an arm is only worth what it has been seen to catch.  Between them the
three cover the crediting decision, the three-quantity separation, and the
alarm on every one of A3 / A4 / A5.

  S1  Credit the step whatever the audit concluded
      (`const bool credited = le;` in EnergyBalanceReport.cpp):
        check_model_boundary_ledger: FAIL
          - A3: no ENERGY alarm for 'transporter' under an unmeetable
            declared tolerance
      ONE arm, and that is worth knowing: this sabotage does not touch the
      LEDGER record, so the status and the remaining residual stay honest
      and only the VERDICT the report takes from them goes wrong.  A4 and
      A5 keep their alarms because their imbalances are far larger than the
      steps wrongly credited to them -- which is exactly why S3 exists.

  S2  Collapse the three quantities into one
      (`e.raw_kW = e.remaining_kW;` in ModelBoundaryLedger.cpp):
        check_model_boundary_ledger: FAIL
          - A1: raw - step != remaining (9.37961885938e-09 -
            -2.98508731741 != 9.37961885938e-09)
          - A1: raw and remaining are the same field -- both
            9.37961885938e-09 on a unit whose step is -2.98508731741 kW
          - A1: the raw imbalance moved: 9.37961885938e-09 kW, expected
            -2.9851 kW

  S3  Suppress the alarm wherever a ledger entry exists, credited or not
      (`if (!le && r.declares && ...)` in EnergyBalanceReport.cpp):
        check_model_boundary_ledger: FAIL
          - A3: no ENERGY alarm for 'transporter' under an unmeetable
            declared tolerance
          - A5: no ENERGY alarm for the turbine whose step was not
            reproduced
          - A4: no ENERGY alarm on a genuine imbalance with no declared
            override

Exit 1 listing failures."""
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
BASIS = ROOT / "tutorials" / "steady" / "thermo" / "basis01_two_unit_chain"
PERUNIT = ROOT / "tutorials" / "steady" / "thermo" / "perUnitThermo01_srk_nrtl"

failures = []


def fresh(tmp: Path, tag: str, src: Path) -> Path:
    d = tmp / tag
    shutil.copytree(src, d, ignore=shutil.ignore_patterns(
        "converged", "reports", "log.*", "resultJson*"))
    return d


def run(case: Path):
    p = subprocess.run([str(SOLVE), "."], cwd=case, capture_output=True,
                       text=True, timeout=1200)
    return p.returncode, p.stdout + p.stderr


def result_json(out: str) -> dict:
    m = re.search(r"<<<Choupo:result-begin>>>(.*?)<<<Choupo:result-end>>>",
                  out, re.S)
    if not m:
        return {}
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return {}


def csv_rows(case: Path):
    """The per-unit table of reports/balances/energyBalance_byUnit.csv,
    as {unit: {column: text}} -- the leading section only."""
    path = case / "reports" / "balances" / "energyBalance_byUnit.csv"
    if not path.exists():
        return {}
    lines = path.read_text().splitlines()
    if not lines:
        return {}
    head = lines[0].split(",")
    out = {}
    for ln in lines[1:]:
        if not ln.strip() or ln.startswith("#"):
            break
        cells = ln.split(",")
        if len(cells) != len(head):
            continue
        out[cells[0]] = dict(zip(head, cells))
    return out


def alarmed(out: str, unit: str) -> bool:
    return f"ENERGY BALANCE FAILED -- unit '{unit}'" in out


def closures(out: str) -> dict:
    return {e["unit"]: e for e in result_json(out).get("energyClosures", [])}


def near(a, b, tol=1.0e-4):
    return abs(a - b) <= tol


def main() -> int:
    if not SOLVE.exists():
        print(f"check_model_boundary_ledger: {SOLVE} missing -- build first")
        return 1

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        # ---- basis01, as shipped ---------------------------------------
        b = fresh(tmp, "basis", BASIS)
        rc, out = run(b)
        if rc != 0:
            failures.append("basis01 did not run (exit %d)" % rc)
            print_failures()
            return 1
        rows = csv_rows(b)
        cl = closures(out)
        t = rows.get("transporter", {})
        e = cl.get("transporter")

        # -- A1: three quantities, distinct, present on BOTH surfaces
        for col in ("raw_imbalance_kW", "boundary_step_kW", "remaining_kW"):
            if col not in t:
                failures.append(f"A1: CSV column '{col}' is missing")
        if e is None:
            failures.append("A1: the result JSON carries no energyClosures"
                            " entry for 'transporter'")
        else:
            raw, step, rem = e["raw_kW"], e["step_kW"], e["remaining_kW"]
            if not near(raw - step, rem, 1.0e-6):
                failures.append("A1: raw - step != remaining (%s - %s != %s)"
                                % (raw, step, rem))
            if near(raw, rem, 1.0e-6):
                failures.append("A1: raw and remaining are the same field --"
                                " both %s on a unit whose step is %s kW"
                                % (raw, step))
            if near(step, 0.0, 1.0e-6):
                failures.append("A1: the step is zero on the case the ruling"
                                " was measured from -- nothing is being"
                                " accounted")
            if not near(raw, -2.9851, 1.0e-3):
                failures.append("A1: the raw imbalance moved: %s kW, expected"
                                " -2.9851 kW" % raw)
            # the same three, in the CSV, agreeing with the JSON
            try:
                if not near(float(t["raw_imbalance_kW"]), raw, 1.0e-3) \
                   or not near(float(t["boundary_step_kW"]), step, 1.0e-3) \
                   or not near(float(t["remaining_kW"]), rem, 1.0e-3):
                    failures.append("A1: the CSV and the result JSON disagree"
                                    " about the three quantities")
            except (KeyError, ValueError):
                failures.append("A1: the CSV three quantities are not numbers")

        # -- A2: the entry identifies the transition
        if e is not None:
            #  The DECLARED names, read from the case's own dicts -- a gate
            #  that compared the ledger with itself would check nothing.
            pkg = (b / "constant" / "thermoPhysPropDict").read_text()
            fsd = (b / "system" / "flowsheetDict").read_text()
            case_formulation = re.search(r"formulation\s+(\w+)\s*;", pkg)
            up, dn = e["upstreamWorld"], e["downstreamWorld"]
            if not case_formulation or case_formulation.group(1) not in up:
                failures.append("A2: the upstream world '%s' does not name the"
                                " formulation the case declares" % up)
            #  The unit's own fragment declares gammaPhi + an ideal liquid.
            if "gammaPhi" not in dn or "ideal" not in dn:
                failures.append("A2: the downstream world '%s' does not name"
                                " the models the unit's thermo{} block"
                                " declares" % dn)
            if "gammaPhi" not in fsd or "ideal" not in fsd:
                failures.append("A2: the fixture drifted -- the unit no longer"
                                " declares gammaPhi/ideal in flowsheetDict")
            if up == dn:
                failures.append("A2: both sides of the boundary are named the"
                                " same world")
            if not e.get("rule"):
                failures.append("A2: the entry names no rule authorising the"
                                " transition")
            want_sign = "+" if e["step_kW"] > 0 else ("-" if e["step_kW"] < 0
                                                      else "0")
            if e.get("sign") != want_sign:
                failures.append("A2: the declared sign '%s' contradicts the"
                                " step %s" % (e.get("sign"), e["step_kW"]))
            if e.get("units") != "kW":
                failures.append("A2: the entry declares units '%s', not kW"
                                % e.get("units"))
            if not near(e.get("magnitude", -1), abs(e["step_kW"]), 1.0e-6):
                failures.append("A2: the magnitude is not |step|")

        # -- A3a: the verdict is taken on the REMAINING residual
        if alarmed(out, "transporter"):
            failures.append("A3: the RED alarm still fires on a residual the"
                            " ledger accounted for")
        if e is not None and e.get("status") != "accounted":
            failures.append("A3: basis01's step was not accounted (status"
                            " '%s')" % e.get("status"))
        try:
            if not near(float(t["adjusted_closure_pct"]), 100.0, 0.5):
                failures.append("A3: the adjusted closure is %s %%, not 100"
                                % t["adjusted_closure_pct"])
        except (KeyError, ValueError):
            failures.append("A3: no adjusted_closure_pct on the transporter")
        #  The RAW numbers the ruling named must still be visible.
        try:
            if not near(float(t["dH_kW"]), 37.0149, 1.0e-3) \
               or not near(float(t["energy_items_kW"]), 40.0, 1.0e-3) \
               or not near(float(t["energy_closure_pct"]), 92.54, 0.05):
                failures.append("A3: the RAW closure figures the ruling named"
                                " are gone: expected dH 37.0149 and items"
                                " 40.0000 on the transporter row")
        except (KeyError, ValueError):
            failures.append("A3: the RAW closure columns are unreadable")

        # -- A3b: an unmeetable DECLARED tolerance refuses the same step
        strict = fresh(tmp, "strict", BASIS)
        sd = strict / "system" / "solverDict"
        sd.write_text((sd.read_text() if sd.exists() else "")
                      + "\nmodelBoundaryClosure { tolerance 1e-30; relTol 0; }\n")
        rc2, out2 = run(strict)
        if rc2 != 0:
            failures.append("A3: the strict-tolerance variant did not run")
        else:
            e2 = closures(out2).get("transporter")
            if e2 is None:
                failures.append("A3: no ledger entry under a declared"
                                " tolerance")
            else:
                if e2.get("status") == "accounted":
                    failures.append("A3: a tolerance of 1e-30 still credited"
                                    " the step -- remaining %s kW where the"
                                    " raw imbalance is %s kW"
                                    % (e2["remaining_kW"], e2["raw_kW"]))
                if not near(e2["remaining_kW"], e2["raw_kW"], 1.0e-6):
                    failures.append("A3: an uncredited step still moved the"
                                    " remaining residual")
            if not alarmed(out2, "transporter"):
                failures.append("A3: no ENERGY alarm for 'transporter' under"
                                " an unmeetable declared tolerance")
            if "1e-30" not in out2:
                failures.append("A3: the declared controls were not announced")

        # ---- A5: perUnitThermo01 as shipped -- a step that does not
        #          reproduce the imbalance buys nothing.
        pu = fresh(tmp, "perunit", PERUNIT)
        rc3, out3 = run(pu)
        if rc3 != 0:
            failures.append("A5: perUnitThermo01 did not run")
        else:
            e3 = closures(out3).get("turbine")
            if e3 is None:
                failures.append("A5: no ledger entry for the turbine, which"
                                " declares a thermo{} world")
            else:
                if e3.get("status") != "unconfirmed":
                    failures.append("A5: perUnitThermo01's turbine step was"
                                    " credited although the audit reports"
                                    " status '%s'" % e3.get("status"))
                if near(e3["step_kW"], 0.0, 1.0e-6):
                    failures.append("A5: no step was priced across a declared"
                                    " boundary -- the arm cannot fail")
                if not near(e3["remaining_kW"], e3["raw_kW"], 1.0e-6):
                    failures.append("A5: an unreproduced step was credited"
                                    " against the remaining residual")
            if not alarmed(out3, "turbine"):
                failures.append("A5: no ENERGY alarm for the turbine whose"
                                " step was not reproduced")

        # ---- A4: the same case with the DECLARATION removed --------------
        fab = fresh(tmp, "fabricated", PERUNIT)
        fd = fab / "system" / "flowsheetDict"
        txt = fd.read_text()
        m = re.search(r"^.*thermo\s*\{ equilibrium \{ vapour \{ fugacityModel"
                      r" SRK; \} \} \}.*$\n", txt, re.M)
        if not m:
            failures.append("A4: the fixture drifted -- the turbine's SRK"
                            " thermo{} block is no longer where the probe"
                            " expects it")
        else:
            fd.write_text(txt.replace(m.group(0), ""))
            rc4, out4 = run(fab)
            if rc4 != 0:
                failures.append("A4: the declaration-free variant did not run")
            else:
                r4 = csv_rows(fab).get("turbine", {})
                e4 = closures(out4).get("turbine")
                #  The entry EXISTS -- a unit whose closure is reconciled is
                #  always accounted for, and an absent row would be silence
                #  where a verdict is owed.  What it must say is `none`.
                if e4 is None:
                    failures.append("A4: no ledger entry at all for a unit"
                                    " whose closure is being reconciled")
                elif e4.get("status") != "none":
                    failures.append("A4: a unit declaring no thermo world got"
                                    " status '%s'" % e4.get("status"))
                elif e4.get("downstreamWorld") != "<none declared>":
                    failures.append("A4: a downstream world was named for a"
                                    " unit that declares none: '%s'"
                                    % e4.get("downstreamWorld"))
                if r4.get("boundary") != "none":
                    failures.append("A4: boundary reads '%s' where no world is"
                                    " declared" % r4.get("boundary"))
                try:
                    if not near(float(r4["boundary_step_kW"]), 0.0, 1.0e-9):
                        failures.append("A4: a step was priced with no"
                                        " declaration -- a boundary inferred"
                                        " from coincident numbers")
                    if not near(float(r4["remaining_kW"]),
                                float(r4["raw_imbalance_kW"]), 1.0e-6):
                        failures.append("A4: the remaining residual differs"
                                        " from the raw one with no step")
                    if abs(float(r4["raw_imbalance_kW"])) < 1.0:
                        failures.append("A4: the probe has no imbalance to"
                                        " alarm about -- the arm cannot fail")
                except (KeyError, ValueError):
                    failures.append("A4: the three quantities are unreadable"
                                    " on the declaration-free turbine")
                if not alarmed(out4, "turbine"):
                    failures.append("A4: no ENERGY alarm on a genuine"
                                    " imbalance with no declared override")

    if failures:
        print_failures()
        return 1
    print("check_model_boundary_ledger: OK -- the raw imbalance, the declared"
          " model-boundary step and the remaining residual are three distinct"
          " fields in both the CSV and the result JSON and they agree; the"
          " entry names both worlds by their declared models plus the rule,"
          " sign, units and magnitude; the verdict is taken on the REMAINING"
          " residual under the declared normalized criteria (an unmeetable"
          " tolerance refuses the same step and the alarm returns); an"
          " imbalance with no declared override is credited nothing and still"
          " alarms; and a step that does not reproduce its imbalance is"
          " printed but not credited.  NOT claimed: that any step is"
          " physically correct, nor any coverage of the speciation / datum /"
          " reading refusals, which no corpus case exercises.")
    return 0


def print_failures():
    print("check_model_boundary_ledger: FAIL")
    for m in failures:
        print("  -", m)


if __name__ == "__main__":
    sys.exit(main())
