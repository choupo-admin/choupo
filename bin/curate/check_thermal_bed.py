#!/usr/bin/env python3
"""Thermal-bed gate (A5-T1 + T1.5 + T2): the one-temperature bed announces
its anchors, and every scope decision of the design refuses out loud
(docs/design/fixed-bed-thermal-a5.md sections 1-6).

All probes are 60 s variants of the three thermal witnesses --
batch20_thermal_breakthrough (T1), batch21_tsa_hot_purge (T1.5) and
batch22_wall_cooled (T2):

  POSITIVES (3)
    T1    the adiabatic run completes (exit 0) and announces the A5-T1
          header, the adiabatic LIMIT wording (a BOUND, never a promised
          plateau) and the thermal-wave velocity u_th.
    T1.5  the hot-purge switch fires, announces itself, and re-declares
          the WHOLE commitment as two ledgered packages (retire + declare).
    T2    the wall-cooled run announces the T2 header, the wall NTU and
          the Q_wall STATE row.
  REFUSALS (9)  each fired through the real initialise or recipe path,
                asserted on exit != 0 AND the named reason:
               thermal + constantVelocity   (A3 pins c_tot by declaration)
               thermal + timeStepping fixed (Gershgorin covers isothermal
                                             rows only)
               missing solidHeatCapacity    (declared case data, kLDF)
               solidHeatCapacity w/o scope  (a value states its origin)
               adiabatic + wallHeatTransfer (a contradiction -- NOT the
                                             retired "T2 not built")
               energyBalance <junk>         (isothermal|adiabatic|wallCooled)
               wallCooled w/o its block     (incomplete declaration)
               wallHeatTransfer.h <= 0      (adiabatic is how to say zero)
               feed.T on an isothermal bed  (points at the declaration
                                             that unlocks it)

T2 division of labour: this gate fires the DECLARATION refusals and the
announcements; the PHYSICS instrument is the witness golden -- the
wall/ledger desync sabotage (cooling the T rows while dy[Q_wall] stays
silent) shifts batch22's dH_vessels/energy_closure far past the golden
tolerance, verified 2026-08-01.

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
BASE21 = (ROOT / "tutorials" / "batch" / "adsorber"
          / "batch21_tsa_hot_purge")

failures = []


def make_case(tmp: Path, tag: str, fs_edit=None, ctrl_edit=None,
              base: Path = BASE) -> Path:
    case = tmp / f"probe_{tag}"
    shutil.copytree(base, case, ignore=shutil.ignore_patterns(
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
                   ctrl_edit=None, base: Path = BASE):
    rc, out = run(make_case(tmp, tag, fs_edit, ctrl_edit, base))
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
        expect_refusal(tmp, "wallContradiction",
                       ["adiabatic CONTRADICTS a wallHeatTransfer block"],
                       fs_edit=sub("energyBalance adiabatic;",
                                   "energyBalance adiabatic;\n"
                                   "            wallHeatTransfer { }"))
        expect_refusal(tmp, "junkWord",
                       ["must be isothermal, adiabatic or wallCooled"],
                       fs_edit=sub("energyBalance adiabatic;",
                                   "energyBalance jacket;"))

        # ---- T2: the wall-cooled bed -----------------------------------
        BASE22 = BASE21.parent / "batch22_wall_cooled"
        rc, out = run(make_case(tmp, "t2_positive", base=BASE22))
        if rc != 0:
            failures.append(f"T2 POSITIVE: expected exit 0, got {rc}\n"
                            + out[-1200:])
        else:
            for n in ("T2 WALL-COOLED energy balance",
                      "wall NTU",
                      "Q_wall STATE row"):
                if n not in out:
                    failures.append(f"T2 POSITIVE: output lacks '{n}'")
        expect_refusal(tmp, "t2_noBlock",
                       ["wallCooled needs",
                        "wallHeatTransfer { h; T_wall; dBed; }"],
                       fs_edit=lambda t: t.replace(
                           "wallHeatTransfer", "retiredWall"),
                       base=BASE22)
        expect_refusal(tmp, "t2_zeroH",
                       ["h must be > 0",
                        "a zero wall is spelled `energyBalance adiabatic;`"],
                       fs_edit=sub("h      [1 0 -3 -1 0] 5;",
                                   "h      [1 0 -3 -1 0] 0;"),
                       base=BASE22)

        # ---- T1.5: the hot-purge control -------------------------------
        def t15(t: str) -> str:
            assert t.count("time     3600;") == 2, "batch21 probe rewrite"
            return t.replace("time     3600;", "time     10;")
        # POSITIVE: the switch fires, announces itself, and the whole
        # commitment is re-declared as TWO ledgered packages (out+in).
        rc, out = run(make_case(tmp, "t15_positive", fs_edit=t15,
                                base=BASE21))
        if rc != 0:
            failures.append("T1.5 POSITIVE: expected exit 0, got"
                            f" {rc}\n--- tail:\n" + out[-1200:])
        else:
            for n in ("T1.5 HOT-PURGE feed switch",
                      "old commitment retired",
                      "new commitment declared",
                      "datum amendments (A5 feed switching)"):
                if n not in out:
                    failures.append(f"T1.5 POSITIVE: output lacks '{n}'")
        # REFUSAL: the same recipe on an ISOTHERMAL ergun bed -- feed.T
        # stays refused, pointing at the declaration that unlocks it.
        expect_refusal(tmp, "t15_isothermal",
                       ["DECLARED CONSTANT",
                        "non-isothermal bed energy balance",
                        "declare `energyBalance adiabatic;`"],
                       fs_edit=lambda t: t15(t).replace(
                           "energyBalance adiabatic;", ""),
                       base=BASE21)

    if failures:
        print("check_thermal_bed: FAIL")
        for f in failures:
            print("  -", f)
        return 1
    print("check_thermal_bed: OK -- 3 positives (T1 anchors u_th/DT_ad"
          " bound, T1.5 hot-purge retire+declare, T2 wall NTU + Q_wall"
          " state row) and 9 refusals fire named (A3 pin, fixed stepping,"
          " missing/undocumented cp_s, adiabatic+wall contradiction,"
          " unknown word, wallCooled w/o block, zero h, feed.T while"
          " isothermal)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
