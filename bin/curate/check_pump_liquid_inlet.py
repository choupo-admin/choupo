#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_pump_liquid_inlet -- a pump refuses, by name, an inlet that is not a
liquid (DEV.md 4c C188 defect 2).

THE DEFECT.  `rotating/Pump.cpp` is the incompressible pump, W = v dP / eta on
the LIQUID molar volume, and publishes its outlet as a liquid (`vf = 0`).  It
never read its inlet's phase, so a vapour was "pumped" on a liquid volume and
came out liquid, at exit 0.  The inlet is now read as it MEANS
(`flashState::resolvedInletVaporFraction`, the one home every unit that reads
its inlet during the solve uses) and any vapour refuses, naming the
compressor.

  (a) A VAPOUR INLET IS REFUSED.  pump01 (water) fed at 400 K and 1 bar --
      above water's boiling point, so the authored inlet resolves to vapour:
      the run must exit non-zero saying it is not a liquid and naming
      `compressor`.
  (b) THE LIQUID CASE STILL RUNS.  pump01 itself exits 0.

WHAT IS NOT CHECKED.  A produced two-phase inlet (a unit's outlet carrying
vapour): the same code path, reached through the carried vf; no corpus case
feeds a pump that way (measured 2026-10-31, the 7 pump cases all run).

Exit 1 naming the arm that failed.
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BIN = ROOT / "build" / "linux64Gcc" / "choupoSolve"
BASE = ROOT / "tutorials" / "steady" / "rotating" / "pump01_water"


def run(case):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(BIN), str(case)], capture_output=True, text=True,
                       timeout=600, env=env)
    return r.returncode, r.stdout + r.stderr


def main() -> int:
    if not BIN.exists():
        print(f"check_pump_liquid_inlet: FAILED\n  no {BIN} -- build the tree "
              "first.  A check that cannot run must not pass.")
        return 1
    fail, ok = [], []
    with tempfile.TemporaryDirectory(prefix="pumpInlet_") as tmp:
        w = Path(tmp) / "pumpVapourInlet"
        shutil.copytree(BASE, w)
        for sub in ("constant/propertyManifest", "expected"):
            p = w / sub
            if p.exists():
                p.unlink()
        feed = w / "0" / "feed"
        t = feed.read_text()
        t2 = re.sub(r"^T\s+298\.15 K;", "T               400 K;", t, flags=re.M)
        if t2 == t:
            fail.append("(a) could not set the witness feed to 400 K -- "
                        "pump01's 0/feed moved")
        else:
            feed.write_text(t2)
            rc, out = run(w)
            missing = [n for n in ("is not a liquid", "compressor") if n not in out]
            if rc == 0:
                fail.append("(a) water fed at 400 K and 1 bar was pumped to exit "
                            "0 -- the pump read a vapour as a liquid")
            elif missing:
                fail.append(f"(a) the run refused (exit {rc}) but does not name "
                            f"{missing}:\n      " + out[-500:])
            else:
                ok.append("a vapour inlet (water, 400 K, 1 bar) is refused, "
                          "naming the compressor")
    rc, out = run(BASE)
    if rc != 0:
        fail.append(f"(b) pump01 itself exited {rc}:\n      " + out[-400:])
    else:
        ok.append("pump01 (liquid water) runs as before")

    if fail:
        print("check_pump_liquid_inlet: FAILED")
        for f in fail:
            print("  " + f)
        return 1
    print("check_pump_liquid_inlet: OK -- " + "; ".join(ok) + ".  NOT checked: "
          "a produced two-phase inlet (no corpus case feeds a pump one)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
