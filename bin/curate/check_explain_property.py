#!/usr/bin/env python3
"""Gate: an explanation the engine does not agree with must not be published.

    bin/curate/check_explain_property.py

WHY THIS EXISTS.  `explainProperty` publishes the derivation LEDGER of a
mixture property -- every term with the record field it came from, re-added
against the engine's own assembled value.  The op carries its own identity
check and refuses on a gap; but a gate that trusts the auditee's self-check
checks nothing (the model-boundary ledger rule).  So this gate re-adds the
ledger INDEPENDENTLY in Python from the published per-component rows, reads
the datum rows back against the catalogue records they claim to quote, and
fires the refusals the op promises.

WHAT IS CHECKED, each arm on a scratch copy of the entropy witness
(tutorials/props/molecular/entropy01_air_ledger -- the case the EduTool page
runs), never on the shipped case directory:

  (a) THE INDEPENDENT RE-ADD.  pure + mixing + pressure recomputed here from
      the published s_ig_<c> rows and the probe's own composition must equal
      the published S_ig, and S_ig + S_R the published S_real, within the
      printed precision.  This is the arm that survives a sabotaged self-check
      inside the op.

  (b) THE GAP ROWS ARE MACHINE-LEVEL.  gap_ideal and gap_total as published
      must be zero at the printed precision -- a tolerance-sized gap would
      mean the "explanation" and the engine merely resemble each other.

  (c) THE DATUM ROWS QUOTE THE RECORDS.  s298_N2 / s298_O2 are read back
      against data/standards/components/{N2,O2}.dat's own s_298, parsed here
      independently.  A ledger whose provenance column lies is worse than no
      ledger.

  (d) THE H ASYMMETRY IS STRUCTURAL.  explainH publishes NO mixing_line and
      NO pressure_line key -- ideal-gas enthalpy has neither, and publishing
      a zero row would teach that the term exists and vanishes, which is a
      different claim.

  (e) AN UNKNOWN PROPERTY REFUSES BY NAME, pointing at propertyPoint.

  (f) A pureFluids{} STATE REFUSES BY NAME: the fundamental-equation route's
      entropy is the release's own surface, and a datum-plus-integral ledger
      would mislabel it.

SABOTAGE-VERIFIED (each performed, gate observed to fail, reverted, rebuild
between rounds):

  S1  mixing-line sign flipped in the op -> the op's own identity refuses,
      the probe run dies, arm (a) reports the run failure (not "moved").
  S2  mixing-line sign flipped AND the op's tooBig() neutered -> the run
      SUCCEEDS and publishes a wrong ledger; arm (a)'s independent re-add is
      what catches it.  This is the round that proves the gate does not lean
      on the auditee's self-check.
  S3  s298_ rows published as 0.0 -> arm (c).
  S4  the unknown-property refusal removed -> arm (e).

WHAT IS NOT CHECKED, deliberately:
  * the VALUES of s_298 against any published table -- that is curation
    (verify_against_poling.py's territory), not this gate's;
  * the op under an electrolyte/manifest package -- no such probe here; the
    rung refusals belong to check_reference_rung;
  * the console table's wording (the golden pins the numbers; words rot).

Exit 1 naming the arm that failed.
"""
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BIN = ROOT / "build" / "linux64Gcc" / "choupoProps"
WITNESS = ROOT / "tutorials" / "props" / "molecular" / "entropy01_air_ledger"
R_GAS = 8.314462618          # src/core/Constants.H -- the engine's own R

Z = {"N2": 0.79, "O2": 0.21}
T_K, P_PA = 400.0, 2.0e5

EXPLAIN_OPS = """
operations
(
    {
        name        explainS;
        type        explainProperty;
        property    S_real;
        state
        {
            T            400 K;
            P            2 bar;
            composition  { N2 0.79;  O2 0.21; }
        }
    }
    {
        name        explainH;
        type        explainProperty;
        property    H_real;
        state
        {
            T            400 K;
            P            2 bar;
            composition  { N2 0.79;  O2 0.21; }
        }
    }
);
"""

REFUSE_OPS = """
operations
(
    {
        name        explainGamma;
        type        explainProperty;
        property    gamma;
        state
        {
            T            400 K;
            P            2 bar;
            composition  { N2 0.79;  O2 0.21; }
        }
    }
);
"""

PUREFLUID_THERMO = """
recordType    thermophysicalPropertySystem;
schemaVersion 2;
components    ( water );
equilibrium
{
    formulation gammaPhi;
    liquid  { activityModel ideal;  standardState pureLiquid; }
    vapour  { fugacityModel idealGas; }
}
pureFluids
{
    water { method IF97; }
}
"""

PUREFLUID_OPS = """
operations
(
    {
        name        explainSteam;
        type        explainProperty;
        property    S_real;
        state
        {
            T            500 K;
            P            2 bar;
            composition  { water 1.0; }
        }
    }
);
"""


def run_case(case: Path):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    return subprocess.run([str(BIN), str(case)],
                          capture_output=True, text=True, timeout=300,
                          env=env)


def result_json(stdout: str):
    m = re.search(r"<<<Choupo:result-begin>>>\n(.*?)<<<Choupo:result-end>>>",
                  stdout, re.S)
    return json.loads(m.group(1)) if m else None


def diag_of(js, name):
    for orr in js.get("operationResults", []):
        if orr.get("name") == name:
            return orr.get("diagnostics", {})
    return {}


def record_s298(comp: str) -> float:
    txt = (ROOT / "data" / "standards" / "components" / f"{comp}.dat"
           ).read_text()
    m = re.search(r"^\s*s_298\s+([-0-9.eE+]+)\s*;", txt, re.M)
    if not m:
        raise RuntimeError(f"{comp}.dat carries no s_298 this gate can read")
    return float(m.group(1))


def main() -> int:
    fail = []
    if not BIN.exists():
        print("check_explain_property: FAILED\n  no choupoProps binary -- "
              "a check that cannot run must not pass.  Run `make all`.")
        return 1

    with tempfile.TemporaryDirectory(prefix="explainProbe.") as td:
        probe = Path(td) / "probe"
        shutil.copytree(WITNESS, probe)
        for junk in ("log.choupoProps", "entropy_vs_T.csv",
                     "entropy_vs_P.csv"):
            (probe / junk).unlink(missing_ok=True)

        # ---- arms (a)-(d): the witness state, explain ops only ------------
        (probe / "system" / "propsDict").write_text(EXPLAIN_OPS)
        r = run_case(probe)
        js = result_json(r.stdout) if r.returncode == 0 else None
        if r.returncode != 0 or js is None:
            fail.append("(a) the explain probe did not run (exit "
                        f"{r.returncode}) -- the op refused or crashed on the"
                        " witness state; that is a run failure, not a moved"
                        " answer:\n" + (r.stdout + r.stderr)[-600:])
        else:
            dS = diag_of(js, "explainS")
            dH = diag_of(js, "explainH")

            # (a) the independent re-add, from the published rows alone
            try:
                pure = sum(Z[c] * dS[f"s_ig_{c}"] for c in Z)
                mixing = -R_GAS * sum(z * math.log(z) for z in Z.values())
                pressure = -R_GAS * math.log(P_PA / 1.0e5)
                rebuilt = pure + mixing + pressure
                # the JSON carries the ambient printed precision (~4 dp);
                # three truncated terms accumulate < 1e-3 absolute.
                if abs(rebuilt - dS["S_ig"]) > 1.0e-3:
                    fail.append(f"(a) independent re-add {rebuilt:.4f} does"
                                f" not reproduce the published S_ig"
                                f" {dS['S_ig']:.4f} -- the ledger and the"
                                " engine disagree")
                if abs(dS["S_ig"] + dS["S_R"] - dS["S_real"]) > 1.0e-3:
                    fail.append("(a) S_ig + S_R does not reproduce the"
                                " published S_real")
                # the PUBLISHED lines must re-add too -- this is the arm
                # that catches a corrupted line row when the op's own gap
                # computation has been neutered alongside it.
                rows = (dS["pure_line"] + dS["mixing_line"]
                        + dS["pressure_line"])
                if abs(rows - dS["S_ig"]) > 1.0e-3:
                    fail.append(f"(a) the published lines re-add to"
                                f" {rows:.4f}, not the published S_ig"
                                f" {dS['S_ig']:.4f}")
            except KeyError as e:
                fail.append(f"(a) explainS stopped publishing {e}")

            # (b) the gap rows are machine-level (printed as 0 at 4 dp)
            for k in ("gap_ideal", "gap_total"):
                for d, nm in ((dS, "explainS"), (dH, "explainH")):
                    if abs(d.get(k, 1.0)) > 1.0e-9:
                        fail.append(f"(b) {nm}.{k} = {d.get(k)} -- the op's"
                                    " identity no longer closes at round-off")

            # (c) the datum rows quote the records
            for c in Z:
                want = record_s298(c)
                got = dS.get(f"s298_{c}")
                if got is None or abs(got - want) > 5.0e-4:
                    fail.append(f"(c) s298_{c} published as {got} but"
                                f" {c}.dat declares {want} -- the provenance"
                                " column lies")

            # (d) the H asymmetry is structural
            for k in ("mixing_line", "pressure_line"):
                if k in dH:
                    fail.append(f"(d) explainH publishes '{k}' -- ideal-gas"
                                " enthalpy has no such line, and a zero row"
                                " claims the term exists and vanishes")
                if k not in dS:
                    fail.append(f"(d) explainS lost its '{k}' row")

        # ---- arm (e): unknown property refuses by name ---------------------
        (probe / "system" / "propsDict").write_text(REFUSE_OPS)
        r = run_case(probe)
        out = r.stdout + r.stderr
        if r.returncode == 0:
            fail.append("(e) `property gamma;` ran to exit 0 -- an unknown"
                        " property must refuse, never be dropped")
        elif "cannot explain" not in out or "propertyPoint" not in out:
            fail.append("(e) the unknown-property refusal no longer names"
                        " the property and the propertyPoint remedy")

        # ---- arm (f): the pureFluids route refuses by name -----------------
        (probe / "constant" / "thermoPhysPropDict").write_text(
            PUREFLUID_THERMO)
        (probe / "system" / "propsDict").write_text(PUREFLUID_OPS)
        r = run_case(probe)
        out = r.stdout + r.stderr
        if r.returncode == 0:
            fail.append("(f) S_real on an IF97-routed pure-water state ran to"
                        " exit 0 -- the fundamental-equation route must refuse"
                        " the datum-plus-integral ledger")
        elif "pureFluids" not in out:
            fail.append("(f) the pure-fluid refusal no longer names the"
                        " pureFluids route")

    if fail:
        print("check_explain_property: FAILED")
        for f in fail:
            print("  " + f)
        return 1

    print("check_explain_property: OK -- the witness ledger re-adds"
          " independently (pure+mixing+pressure -> S_ig, +S_R -> S_real),"
          " the gap rows close at round-off, the s_298 rows quote the"
          " records, explainH carries no mixing/pressure line, and both"
          " refusals (unknown property; pureFluids route) fire by name."
          "  NOT checked: the datum values against any published table"
          " (curation), electrolyte/manifest packages (no probe), the"
          " console wording.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
