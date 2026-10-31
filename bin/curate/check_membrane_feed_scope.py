#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_membrane_feed_scope -- a spiral-wound module refuses, by name, a
present component it does not model (DEV.md 4c C188 defect 1).

THE DEFECT.  `SpiralWoundModule` carries the solvent (water) and the solutes
the case declares `role nonvolatile;`.  Its outlets close their volume on the
solvent, c_water = (rho - SUM c_s MW_s) / MW_water, so any OTHER present
component was given z = 0 in both outlets and its mass re-counted as water:
an ethanol feed came out with no ethanol, the kg balance closing and the
carbon gone, at exit 0.  A feed carrying no water at all ran as if it did.

The witnesses are built in a temporary directory from membrane01 (seawater
RO, water + NaCl), its seal removed so the copy may change its component
set:

  (a) A VOLATILE SOLUTE IS REFUSED BY NAME.  Ethanol added to the feed
      (its record's own role, not declared nonvolatile): the run must exit
      non-zero naming 'ethanol', saying the module does not model it, and
      naming the remedy (`role nonvolatile;` with a `B_s`, or remove it).
  (b) A FEED WITHOUT WATER IS REFUSED.  water 0 kmol/h: the run must exit
      non-zero saying the feed carries no water.
  (c) THE MODULE STILL RUNS WHAT IT MODELS.  membrane01 itself exits 0.

WHAT IS NOT CHECKED.  The ethanol-as-solute route (`role nonvolatile;` and a
`B_s`): it is the existing solute path, held by the membrane goldens.  The
declared pass-through approximation of C188 does not exist yet.

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
BASE = ROOT / "tutorials" / "steady" / "membranes" / "membrane01_RO_NaCl_seawater"


def run(case):
    env = dict(os.environ, CHOUPO_HOME=str(ROOT))
    r = subprocess.run([str(BIN), str(case)], capture_output=True, text=True,
                       timeout=600, env=env)
    return r.returncode, r.stdout + r.stderr


def witness(tmp, tag, feed_edit, add_ethanol):
    w = Path(tmp) / f"membraneScope_{tag}"
    shutil.copytree(BASE, w)
    for sub in ("constant/propertyManifest", "expected"):
        p = w / sub
        if p.exists():
            p.unlink()
    if add_ethanol:
        tp = w / "constant" / "thermoPhysPropDict"
        tp.write_text(tp.read_text().replace("( water  NaCl )",
                                             "( water  NaCl  ethanol )"))
    feed = w / "0" / "feed"
    feed.write_text(feed_edit(feed.read_text()))
    return w


def main() -> int:
    if not BIN.exists():
        print(f"check_membrane_feed_scope: FAILED\n  no {BIN} -- build the "
              "tree first.  A check that cannot run must not pass.")
        return 1
    fail, ok = [], []
    with tempfile.TemporaryDirectory(prefix="membraneScope_") as tmp:
        # ---- (a) ethanol in the feed --------------------------------------
        w = witness(tmp, "ethanol", lambda t: t.replace(
            "NaCl    5.98 kmol/h;", "NaCl    5.98 kmol/h;\n    ethanol  5.0 kmol/h;"),
            True)
        if "ethanol  5.0" not in (w / "0" / "feed").read_text():
            fail.append("(a) could not add ethanol to the witness feed -- "
                        "membrane01's 0/feed moved")
        else:
            rc, out = run(w)
            need = ["'ethanol'", "does not model", "role nonvolatile",
                    "B_s"]
            missing = [n for n in need if n not in out]
            if rc == 0:
                fail.append("(a) a feed carrying ethanol ran to exit 0 -- the "
                            "module swallowed a component it does not model")
            elif missing:
                fail.append(f"(a) the run refused (exit {rc}) but does not "
                            f"name {missing}:\n      " + out[-500:])
            else:
                ok.append("an ethanol feed is refused naming the component "
                          "and the remedy")

        # ---- (b) no water ---------------------------------------------------
        w = witness(tmp, "nowater", lambda t: re.sub(
            r"water\s+569\.02 kmol/h;", "water    0 kmol/h;", t), False)
        rc, out = run(w)
        if rc == 0:
            fail.append("(b) a feed with no water ran to exit 0")
        elif "carries no water" not in out:
            fail.append(f"(b) the water-free feed refused (exit {rc}) but not "
                        "for the missing solvent:\n      " + out[-400:])
        else:
            ok.append("a water-free feed is refused for its missing solvent")

    # ---- (c) the modelled case runs -----------------------------------------
    rc, out = run(BASE)
    if rc != 0:
        fail.append(f"(c) membrane01 itself exited {rc}:\n      " + out[-400:])
    else:
        ok.append("membrane01 (water + NaCl) runs as before")

    if fail:
        print("check_membrane_feed_scope: FAILED")
        for f in fail:
            print("  " + f)
        return 1
    print("check_membrane_feed_scope: OK -- " + "; ".join(ok) + ".  NOT "
          "checked: the declared pass-through approximation (C188, not built)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
