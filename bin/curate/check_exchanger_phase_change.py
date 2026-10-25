#!/usr/bin/env python3
"""check_exchanger_phase_change -- an eps-NTU exchanger whose side changes
phase says that its DUTY, not only its outlet, rests on a sensible model;
and the U.A.LMTD line says what it is a check of (2026-10-25, DEV.md 4c
C150 R14).

WHY.  `heatExchanger` forms its duty from sensible capacity rates and then
inverts each outlet STATE from the package's enthalpy, so an outlet that
crosses saturation is a consistent state and the unit's own closure gap
reads ~0: the crossing was INVISIBLE.  The duty of such a run is not that of
a condenser or an evaporator, and the terminal log-mean is no driving force
across a phase change.  Separately, the console printed `check: U.A.LMTD`
beside Q for every arrangement, and the eps-NTU EduTool told the student "if
they disagree, one of them is wrong" -- false for a 1-shell / 2N-tube-pass
exchanger, where Q = U.A.F.LMTD with F < 1.

CLAIM, through the real choupoSolve binary, on copies of
tutorials/steady/heat/heatExchanger01_water_water:
  (a) BOILING  the cold side at 0.5 bar (Tsat 354 K) against a 390 K hot
               inlet leaves two-phase: the run announces it (stderr AND the
               result's advisories, category `validity`), names the side,
               says the duty is the SENSIBLE eps-NTU's, and the U.A.LMTD
               line says it is NOT a check.
  (b) SHIPPED  the witness as shipped (both sides liquid) announces nothing
               of the kind and prints no qualifier.
  (c) PASSES   `passes 2;` prints the F the two numbers imply, F < 1, and
               it equals Q / (U.A.LMTD) from the printed numbers.

NOT COVERED: the phase-change physics itself (no condensing or boiling
transfer model exists in this unit -- that is new physics), the geometry
mode's own U, and whether F is RIGHT for any shell (it is implied, not
computed from a correlation).

SABOTAGE RECORD: all three were run against the parent build
(2026-10-25): the boiling copy ran to exit 0 with no announcement and no
qualifier, so (a) failed on all four of its checks, and (c) failed (no
implied F printed); (b) passed.

Exit 1 listing failures."""
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
CASE = ROOT / "tutorials" / "steady" / "heat" / "heatExchanger01_water_water"

failures = []


def run(case: Path):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(SOLVE), "."], cwd=case, env=env,
                       capture_output=True, text=True, timeout=600)
    return p.returncode, p.stdout, p.stderr


def copy(tmp: Path, tag: str) -> Path:
    case = tmp / tag
    shutil.copytree(CASE, case, ignore=shutil.ignore_patterns(
        "expected", "log.*", "reports", "converged"))
    return case


def edit(path: Path, old: str, new: str):
    s = path.read_text()
    if s.count(old) != 1:
        raise SystemExit(f"check_exchanger_phase_change: fixture text not"
                         f" found once in {path}: {old!r} -- fix the GATE")
    path.write_text(s.replace(old, new))


def main() -> int:
    if not SOLVE.exists():
        print(f"check_exchanger_phase_change: {SOLVE} missing -- build first")
        return 1
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        b = copy(tmp, "boil")
        edit(b / "0" / "cold", "P               200000 Pa;",
             "P               50000 Pa;")
        edit(b / "0" / "hot", "T               360 K;", "T               390 K;")
        rc, out, err = run(b)
        if rc != 0:
            failures.append(f"(a) boiling copy: exit {rc}")
        if not re.search(r"\[hx\] \(hot \+ cold\) a side changed phase: 'cold'"
                         r" entered liquid", err):
            failures.append("(a) no stderr announcement naming the side that"
                            " changed phase")
        if not re.search(r'"category": "validity"[^}]*heatExchanger[^}]*'
                         r"a side changed phase", out):
            failures.append("(a) the announcement is not in the result's"
                            " advisories")
        if "is the SENSIBLE eps-NTU's" not in err:
            failures.append("(a) the announcement does not say the DUTY is"
                            " the sensible eps-NTU's")
        if "U.A.LMTD is NOT a check here" not in out:
            failures.append("(a) the U.A.LMTD line is not qualified")

        rc, out, err = run(copy(tmp, "shipped"))
        if rc != 0:
            failures.append(f"(b) shipped witness: exit {rc}")
        if "changed phase" in out + err or "NOT a check" in out:
            failures.append("(b) the shipped (single-phase) witness announced"
                            " a phase change")

        p = copy(tmp, "passes")
        edit(p / "system" / "flowsheetDict", "area     10.0 m2;",
             "area     10.0 m2;\n            passes   2;")
        rc, out, err = run(p)
        m = re.search(r"Q = ([0-9.]+) kW,  LMTD = [0-9.]+ K   \(check:"
                      r" U\.A\.LMTD = ([0-9.]+) kW\)", out)
        f = re.search(r"2 tube passes: Q = U\.A\.F\.LMTD.*implied F = Q /"
                      r" \(U\.A\.LMTD\) = ([0-9.]+)\)", out)
        if rc != 0 or not m or not f:
            failures.append(f"(c) passes 2: exit {rc}; Q/LMTD line"
                            f" {'found' if m else 'MISSING'}, implied-F line"
                            f" {'found' if f else 'MISSING'}")
        else:
            F = float(f.group(1))
            ratio = float(m.group(1)) / float(m.group(2))
            if not (0.0 < F < 1.0):
                failures.append(f"(c) implied F = {F}, expected 0 < F < 1")
            if abs(F - ratio) > 5e-3:
                failures.append(f"(c) implied F {F} != Q/(U.A.LMTD) {ratio}"
                                " from the printed numbers")
    if failures:
        for x in failures:
            print("  FAIL " + x)
        print("check_exchanger_phase_change: FAIL")
        return 1
    print("check_exchanger_phase_change: OK -- heatExchanger01 with its cold"
          " side boiling announces (stderr + result advisories) that the duty"
          " is the sensible eps-NTU's and qualifies U.A.LMTD as no check; the"
          " shipped single-phase witness announces nothing; with 2 tube"
          " passes the implied F < 1 is printed and equals Q/(U.A.LMTD)"
          " (no phase-change transfer model exists; F is implied, not"
          " correlated)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
