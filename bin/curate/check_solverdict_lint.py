#!/usr/bin/env python3
"""solverDict-lint gate: a system/solverDict in a batch or ctrl case is a
FILE nobody reads -- the unread-key defect one level up -- and the binary
must SAY so (announce, never refuse: the unread-keys posture, DEV.md 4b).

Scoping record: docs/design/solverdict-consolidation-scope.md (option A's
non-contentious half; the A/B/C grammar decision stays with Vitor).

  POSITIVE-batch  recipe02 + a solverDict carrying `rtol 1e-9;` runs to
                  completion (exit 0 -- announce, not refuse) AND prints
                  the [dict] announcement naming the file and the real
                  homes of batch numerics.
  NEGATIVE-batch  unmodified recipe02 prints NO such announcement (the
                  lint must not cry wolf).
  POSITIVE-ctrl   ctrl01 + solverDict -> same, with choupoCtrl's wording.
  NEGATIVE-ctrl   unmodified ctrl01 -> silent.

Exit 1 listing failures."""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "build" / "linux64Gcc"
CASES = {
    "batch": (ROOT / "tutorials" / "batch" / "recipes"
              / "recipe02_setpoint_ramp", BUILD / "choupoBatch"),
    "ctrl": (ROOT / "tutorials" / "ctrl" / "ctrl01_cstr_temp_control",
             BUILD / "choupoCtrl"),
}

failures = []


def run(binary: Path, case: Path):
    p = subprocess.run([str(binary), "."], cwd=case,
                       capture_output=True, text=True, timeout=600)
    return p.returncode, p.stdout + p.stderr


def main() -> int:
    for kind, (base, binary) in CASES.items():
        if not binary.exists():
            print(f"check_solverdict_lint: {binary} missing -- build first")
            return 1
    with tempfile.TemporaryDirectory() as td:
        for kind, (base, binary) in CASES.items():
            needle = (f"[dict] system/solverDict is present but"
                      f" {binary.name} does not read it")
            #  0/ carries the initial state and MUST travel with the probe;
            #  only the golden and run artefacts stay behind.
            case = Path(td) / f"probe_{kind}"
            shutil.copytree(base, case, ignore=shutil.ignore_patterns(
                "expected", "*.csv", "resultJson*"))
            (case / "system" / "solverDict").write_text(
                "// gate probe: a file this binary never reads\n"
                "rtol 1e-9;\n")
            rc, out = run(binary, case)
            if rc != 0:
                failures.append(f"POSITIVE-{kind}: expected exit 0"
                                f" (announce, not refuse), got {rc}\n"
                                + out[-600:])
            elif needle not in out:
                failures.append(f"POSITIVE-{kind}: announcement missing"
                                f" ('{needle}')")
            elif "NO effect" not in out:
                failures.append(f"POSITIVE-{kind}: the cost is not stated"
                                " ('NO effect')")

            clean = Path(td) / f"clean_{kind}"
            shutil.copytree(base, clean, ignore=shutil.ignore_patterns(
                "expected", "*.csv", "resultJson*"))
            rc, out = run(binary, clean)
            if rc == 0 and "system/solverDict is present" in out:
                failures.append(f"NEGATIVE-{kind}: announcement fired with"
                                " no solverDict present (crying wolf)")

    if failures:
        print("check_solverdict_lint: FAIL")
        for f in failures:
            print("  -", f)
        return 1
    print("check_solverdict_lint: OK -- an ignored system/solverDict is"
          " announced by name in batch AND ctrl (run continues; cost"
          " stated), and the clean cases stay silent")
    return 0


if __name__ == "__main__":
    sys.exit(main())
