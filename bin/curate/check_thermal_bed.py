#!/usr/bin/env python3
"""A5-T1 thermal-bed gate: the adiabatic one-temperature bed announces its
anchors, and every scope decision of the design refuses out loud
(docs/design/fixed-bed-thermal-a5.md).

All probes are 60 s variants of batch20_thermal_breakthrough:

  POSITIVE   the short adiabatic run completes (exit 0) and announces the
             A5-T1 header, the adiabatic LIMIT wording (a BOUND, never a
             promised plateau) and the thermal-wave velocity u_th.
  REFUSALS   each fired through the real initialise, asserted on exit != 0
             AND the named reason:
               thermal + constantVelocity   (A3 pins c_tot by declaration)
               thermal + timeStepping fixed (Gershgorin covers isothermal
                                             rows only)
               missing solidHeatCapacity    (declared case data, kLDF)
               solidHeatCapacity w/o scope  (a value states its origin)
               wallHeatTransfer present     (T2, not built)
               energyBalance <junk>         (isothermal|adiabatic only)

Exit 1 listing failures."""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BATCH = ROOT / "build" / "linux64Gcc" / "choupoBatch"
BASE = (ROOT / "tutorials" / "batch" / "adsorber"
        / "batch20_thermal_breakthrough")

failures = []


def make_case(tmp: Path, tag: str, fs_edit=None, ctrl_edit=None) -> Path:
    case = tmp / f"probe_{tag}"
    shutil.copytree(BASE, case, ignore=shutil.ignore_patterns(
        "expected", "*.csv", "[0-9]*", "resultJson*"))
    ctrl = case / "system" / "controlDict"
    txt = ctrl.read_text()
    txt = txt.replace("endTime         12000;", "endTime         60;")
    txt = txt.replace("writeInterval   100;", "writeInterval   30;")
    assert "endTime         60;" in txt, "controlDict shortening failed"
    if ctrl_edit:
        txt = ctrl_edit(txt)
    ctrl.write_text(txt)
    if fs_edit:
        fs = case / "system" / "flowsheetDict"
        fs.write_text(fs_edit(fs.read_text()))
    return case


def run(case: Path):
    p = subprocess.run([str(BATCH), "."], cwd=case,
                       capture_output=True, text=True, timeout=600)
    return p.returncode, p.stdout + p.stderr


def sub(old: str, new: str):
    def f(t: str) -> str:
        assert old in t, f"probe rewrite failed: '{old}' not found"
        return t.replace(old, new)
    return f


def expect_refusal(tmp: Path, tag: str, needles, fs_edit=None,
                   ctrl_edit=None):
    rc, out = run(make_case(tmp, tag, fs_edit, ctrl_edit))
    if rc == 0:
        failures.append(f"REFUSAL {tag}: expected nonzero exit, got 0"
                        " (the refusal is gone)")
        return
    for n in needles:
        if n not in out:
            failures.append(f"REFUSAL {tag}: message lacks '{n}'\n--- got:\n"
                            + out[-700:])


def main() -> int:
    if not BATCH.exists():
        print(f"check_thermal_bed: {BATCH} missing -- build first")
        return 1
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        # ---- POSITIVE ---------------------------------------------------
        rc, out = run(make_case(tmp, "positive"))
        if rc != 0:
            failures.append(f"POSITIVE: expected exit 0, got {rc}\n--- tail:\n"
                            + out[-1200:])
        else:
            for n in ("A5-T1 ADIABATIC energy balance",
                      "adiabatic LIMIT",
                      "all-heat-retained BOUND",
                      "Pure thermal-wave velocity u_th"):
                if n not in out:
                    failures.append(f"POSITIVE: output lacks '{n}'")

        # ---- REFUSALS ---------------------------------------------------
        expect_refusal(tmp, "constantVelocity",
                       ["requires flowModel ergun",
                        "pins c_tot = P/(RT) BY DECLARATION"],
                       fs_edit=sub("flowModel ergun;",
                                   "flowModel constantVelocity;"))
        expect_refusal(tmp, "fixedStepping",
                       ["requires timeStepping adaptive",
                        "ISOTHERMAL rows only"],
                       ctrl_edit=sub("timeStepping    adaptive;",
                                     "timeStepping    fixed;"))
        expect_refusal(tmp, "noCp",
                       ["needs"
                        " operation.solidHeatCapacity"],
                       fs_edit=sub("solidHeatCapacity", "retiredBlock"))
        expect_refusal(tmp, "noScope",
                       ["scope and source"],
                       fs_edit=sub('scope  "packed 13X teaching bed,'
                                   ' RUN-A5-T1";', ""))
        expect_refusal(tmp, "wallHeat",
                       ["wallHeatTransfer is the T2 step"],
                       fs_edit=sub("energyBalance adiabatic;",
                                   "energyBalance adiabatic;\n"
                                   "            wallHeatTransfer { }"))
        expect_refusal(tmp, "junkWord",
                       ["must be isothermal or adiabatic"],
                       fs_edit=sub("energyBalance adiabatic;",
                                   "energyBalance jacket;"))

    if failures:
        print("check_thermal_bed: FAIL")
        for f in failures:
            print("  -", f)
        return 1
    print("check_thermal_bed: OK -- adiabatic bed announces its anchors"
          " (u_th + the DT_ad BOUND) and 6 scope refusals fire named"
          " (A3 pin, fixed stepping, missing/undocumented cp_s, T2 wall,"
          " unknown word)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
