#!/usr/bin/env python3
"""The three balances are DEFAULT diagnostics of every converged steady run.

Design record: DEV.md roadmap #7 (default-on wave, 2026-08-02); the
elementBalance precedent is 2026-07-19.

Conservation is the curriculum, so a converged steady case must state its
material, energy and atom balances WITHOUT discovering an opt-in block.  The
contract this gate keeps true, probed through the real binary on a corpus
case that declares NO reports{}:

  DEFAULTS    a no-reports case writes massBalance + elementBalance artefacts
              and produces an energy verdict OR an honest UNAVAILABLE.
  POSTURE     the DEFAULT energyBalance reports a missing enthalpy datum as
              UNAVAILABLE on stdout -- same facts, no ERROR/WARNING register
              (absence of curated data is not an error of a case that never
              claimed an energy closure); a DECLARED energyBalance keeps the
              hard ERROR, because its author asked for a verdict.
  OPT-OUT     `massBalance { enabled false; }` suppresses that default and
              only that one.

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
#  A molecular case with full enthalpy data and NO reports{} block.
CLEAN = ROOT / "tutorials" / "steady" / "absorption" / "absorption01_CO2_water"
#  A case whose NaCl carries no standardThermochemistry -> the energy gap.
GAP = ROOT / "tutorials" / "steady" / "crystallisation" / "crystalliser06_nacl_antisolvent"

failures = []


def run(case: Path):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    p = subprocess.run([str(SOLVE), "."], cwd=case, env=env,
                       capture_output=True, text=True, timeout=900)
    return p.returncode, p.stdout + p.stderr


def copy(tmp: Path, src: Path, tag: str) -> Path:
    case = tmp / tag
    shutil.copytree(src, case, ignore=shutil.ignore_patterns(
        "expected", "reports", "converged", "log.*", "*.csv"))
    return case


def main() -> int:
    if not SOLVE.exists():
        print(f"check_default_reports: {SOLVE} missing -- build first")
        return 1
    for c in (CLEAN, GAP):
        if re.search(r"^\s*reports\s*\{", (c / "system" / "controlDict")
                     .read_text(), re.M):
            print(f"check_default_reports: {c.name} now declares reports{{}} --"
                  " pick another no-reports probe case")
            return 1

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)

        # ---- DEFAULTS on a clean case ---------------------------------------
        case = copy(tmp, CLEAN, "clean")
        rc, out = run(case)
        if rc != 0:
            failures.append(f"DEFAULTS: {CLEAN.name} exited {rc}")
        else:
            for rel in ("reports/balances/massBalance.csv",
                        "reports/balances/globalEnergyBoundary.csv",
                        "reports/balances/elementBalance.csv"):
                if not (case / rel).exists():
                    failures.append(f"DEFAULTS: {rel} not written by a"
                                    " no-reports case")
            if "ERROR" in out or "WARNING" in out:
                failures.append("DEFAULTS: the clean case's default reports"
                                " raised ERROR/WARNING lines")

        # ---- POSTURE: default = UNAVAILABLE, declared = hard ERROR ----------
        case = copy(tmp, GAP, "gap_default")
        rc, out = run(case)
        if rc != 0:
            failures.append(f"POSTURE/default: {GAP.name} exited {rc}")
        else:
            if "energyBalance UNAVAILABLE" not in out:
                failures.append("POSTURE/default: the missing datum is not"
                                " reported as UNAVAILABLE")
            if "standardThermochemistry" not in out:
                failures.append("POSTURE/default: the UNAVAILABLE line lost"
                                " its curation remedy")
            if re.search(r"ERROR|WARNING", out):
                failures.append("POSTURE/default: the DEFAULT diagnostic used"
                                " the ERROR/WARNING register on a case that"
                                " never claimed an energy closure")
            g = case / "reports/balances/globalEnergyBoundary.csv"
            if not g.exists() or "status,REFUSED" not in g.read_text():
                failures.append("POSTURE/default: the REFUSED artefact (the"
                                " machine-readable half) is missing")

        case = copy(tmp, GAP, "gap_declared")
        cd = case / "system" / "controlDict"
        cd.write_text(cd.read_text()
                      + "\nreports\n{\n    energyBalance {}\n}\n")
        rc, out = run(case)
        if rc != 0:
            failures.append(f"POSTURE/declared: {GAP.name} exited {rc}")
        elif "ERROR: energyBalance" not in out:
            failures.append("POSTURE/declared: a DECLARED energyBalance on a"
                            " datum gap must keep the hard ERROR -- the"
                            " author asked for a verdict and cannot have one")

        # ---- OPT-OUT --------------------------------------------------------
        case = copy(tmp, CLEAN, "optout")
        cd = case / "system" / "controlDict"
        cd.write_text(cd.read_text()
                      + "\nreports\n{\n    massBalance { enabled false; }\n}\n")
        rc, out = run(case)
        if rc != 0:
            failures.append(f"OPT-OUT: exited {rc}")
        else:
            if (case / "reports/balances/massBalance.csv").exists():
                failures.append("OPT-OUT: `massBalance { enabled false; }` did"
                                " not suppress the default")
            if not (case / "reports/balances/elementBalance.csv").exists():
                failures.append("OPT-OUT: opting out of massBalance also"
                                " killed elementBalance -- the opt-outs must"
                                " be independent")

    if failures:
        print("check_default_reports: FAIL")
        for f in failures:
            print("  -", f)
        return 1
    print("check_default_reports: OK -- a no-reports steady case writes the"
          " three balances by default with no ERROR/WARNING noise; a missing"
          " enthalpy datum is UNAVAILABLE (with its curation remedy and the"
          " REFUSED artefact) under the default and a hard ERROR when"
          " declared; `enabled false;` opts out per report, independently")
    return 0


if __name__ == "__main__":
    sys.exit(main())
