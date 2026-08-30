#!/usr/bin/env python3
"""Gate: an exergy is two engine differences against a DECLARED environment.

    bin/curate/check_exergy.py

WHY THIS EXISTS.  The `exergy` props op computes b = (h-h0) - T0*(s-s0)
from the engine's own H_real/S_real at two states.  Its claims are small
and exact, which is precisely what makes them cheap to fake: a sign slip
in the T0*(s-s0) leg still returns a plausible positive number, and a
silently defaulted dead state hands a plant the wrong environment with
nothing to see.  Every arm here recomputes or refuses INDEPENDENTLY of
the op's own arithmetic.

WHAT IS CHECKED, on scratch copies of the witness
(tutorials/props/molecular/exergy01_air_dead_state), never the shipped dir:

  (a) THE INDEPENDENT RECOMPUTE.  A propertyPoint probe evaluates
      H_real/S_real at the stream state and at the dead state through the
      bench's OTHER op; b recomputed here from those four numbers must
      match the witness's published b_physical within printed precision.
      This is the arm a sign slip cannot survive.

  (b) THE STRUCTURAL ZERO.  b at the dead state itself is 0 identically
      (dh = 0 and T0ds = 0, not merely b small).

  (c) THE LEGS RE-ADD.  The published dh - T0ds equals the published
      b_physical -- the reader's-desk identity.

  (d) NO DEAD STATE REFUSES BY NAME.  An engine that silently assumed
      25 degC / 1 atm would be choosing the plant's environment.

  (e) CHEMICAL EXERGY REFUSES BY NAME, citing the standard-environment
      model it would need -- a curation decision, not a formula.

SABOTAGE-VERIFIED (performed, gate observed failing, reverted, rebuild
between rounds):

  S1  b = dh + T0ds (sign flipped)         -> (a) and (c)
  S2  the deadState refusal replaced by a silent 298.15/1e5 default -> (d)
  S3  h0/s0 evaluated at (T,P) instead of (T0,P0) -> b_state collapses to
      0 and (a) catches it; (b) stays green because at the dead state the
      two coincide -- which is why (b) alone would not be a gate.

NOT CHECKED, deliberately: whether b is RIGHT against any published table
(no exergy tables are in the tree); the datum-independence claim (it is
an algebraic property of differencing, not an observable this gate can
probe); chemical exergy content of any kind.

Exit 1 naming the arm that failed.
"""
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BIN = ROOT / "build" / "linux64Gcc" / "choupoProps"
WITNESS = ROOT / "tutorials" / "props" / "molecular" / "exergy01_air_dead_state"

T, P = 400.0, 2.0e5
T0, P0 = 298.15, 1.0e5

POINT_OPS = """
operations
(
    {
        name  atState;
        type  propertyPoint;
        state { T 400 K;  P 2 bar;  composition { N2 0.79;  O2 0.21; } }
    }
    {
        name  atDead;
        type  propertyPoint;
        state { T 298.15 K;  P 1 bar;  composition { N2 0.79;  O2 0.21; } }
    }
);
"""

NO_DEAD_OPS = """
operations
(
    {
        name  bMissing;
        type  exergy;
        state { T 400 K;  P 2 bar;  composition { N2 0.79;  O2 0.21; } }
    }
);
"""

CHEMICAL_OPS = """
operations
(
    {
        name      bChem;
        type      exergy;
        chemical  true;
        state     { T 400 K;  P 2 bar;  composition { N2 0.79;  O2 0.21; } }
        deadState { T0 298.15 K;  P0 1 bar; }
    }
);
"""


def run_case(case: Path):
    return subprocess.run([str(BIN), str(case)], capture_output=True,
                          text=True, timeout=300)


def result_json(stdout: str):
    m = re.search(r"<<<Choupo:result-begin>>>\n(.*?)<<<Choupo:result-end>>>",
                  stdout, re.S)
    return json.loads(m.group(1)) if m else None


def diag_of(js, name):
    for orr in js.get("operationResults", []):
        if orr.get("name") == name:
            return orr.get("diagnostics", {})
    return {}


def main() -> int:
    fail = []
    if not BIN.exists():
        print("check_exergy: FAILED\n  no choupoProps binary -- a check that"
              " cannot run must not pass.  Run `make all`.")
        return 1

    # ---- the witness's own published rows --------------------------------
    r = run_case(WITNESS)
    js = result_json(r.stdout) if r.returncode == 0 else None
    if js is None:
        print("check_exergy: FAILED\n  the witness did not run (exit "
              f"{r.returncode})\n" + (r.stdout + r.stderr)[-500:])
        return 1
    dS = diag_of(js, "b_state")
    dD = diag_of(js, "b_dead")

    # (c) the legs re-add
    try:
        #  the JSON carries ~6 printed significant figures, so the re-add of
        #  two truncated numbers is good to ~1e-2 on a 2e3 total.
        if abs(dS["dh"] - dS["T0ds"] - dS["b_physical"]) > 5e-2:
            fail.append("(c) published dh - T0ds does not equal the published"
                        f" b_physical ({dS['dh']} - {dS['T0ds']} vs"
                        f" {dS['b_physical']})")
    except KeyError as e:
        fail.append(f"(c) b_state stopped publishing {e}")

    # (b) the structural zero, on BOTH legs, not merely the total
    for k in ("dh", "T0ds", "b_physical"):
        if abs(dD.get(k, 1.0)) > 1e-9:
            fail.append(f"(b) b_dead.{k} = {dD.get(k)} -- the dead state's"
                        " own exergy must be zero identically")

    with tempfile.TemporaryDirectory(prefix="exergyProbe.") as td:
        probe = Path(td) / "probe"
        shutil.copytree(WITNESS, probe)
        for junk in probe.glob("log.*"):
            junk.unlink()

        # ---- (a) the independent recompute through propertyPoint ---------
        (probe / "system" / "propsDict").write_text(POINT_OPS)
        r = run_case(probe)
        js = result_json(r.stdout) if r.returncode == 0 else None
        if js is None:
            fail.append("(a) the propertyPoint probe did not run (exit "
                        f"{r.returncode})")
        else:
            a = diag_of(js, "atState")
            d = diag_of(js, "atDead")
            try:
                b = (a["H_real"] - d["H_real"]) - T0 * (a["S_real"]
                                                        - d["S_real"])
                # both channels carry the ambient printed precision; the
                # difference of four ~4-decimal numbers is good to ~1e-2.
                if abs(b - dS.get("b_physical", 1e9)) > 5e-2:
                    fail.append(f"(a) b recomputed through propertyPoint is"
                                f" {b:.4f}, the exergy op published"
                                f" {dS.get('b_physical')} -- the two benches"
                                " disagree about the same differences")
            except KeyError as e:
                fail.append(f"(a) the propertyPoint probe lost {e}")

        # ---- (d) no deadState refuses by name ----------------------------
        (probe / "system" / "propsDict").write_text(NO_DEAD_OPS)
        r = run_case(probe)
        out = r.stdout + r.stderr
        if r.returncode == 0:
            fail.append("(d) an exergy with NO deadState ran to exit 0 --"
                        " the engine chose the plant's environment")
        elif "deadState" not in out:
            fail.append("(d) the missing-deadState refusal no longer names"
                        " the block to declare")

        # ---- (e) chemical exergy refuses by name -------------------------
        (probe / "system" / "propsDict").write_text(CHEMICAL_OPS)
        r = run_case(probe)
        out = r.stdout + r.stderr
        if r.returncode == 0:
            fail.append("(e) `chemical true;` ran to exit 0 -- chemical"
                        " exergy needs a standard-environment model nobody"
                        " curated")
        elif "Szargut" not in out and "standard-environment" not in out:
            fail.append("(e) the chemical-exergy refusal no longer names"
                        " what it would need")

    if fail:
        print("check_exergy: FAILED")
        for f in fail:
            print("  " + f)
        return 1

    print("check_exergy: OK -- the witness's b_physical is reproduced"
          " independently through propertyPoint's own H_real/S_real at both"
          " states, the published legs re-add, the dead state's exergy is"
          " zero on both legs, and both refusals (missing deadState;"
          " chemical exergy) fire by name.  NOT checked: b against any"
          " published exergy table (none in the tree), the"
          " datum-independence claim (algebraic, not observable here), and"
          " chemical exergy of any kind.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
