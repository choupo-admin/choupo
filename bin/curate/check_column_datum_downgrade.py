#!/usr/bin/env python3
"""Gate: a column that loses the formation datum SAYS SO -- both solver paths.

    bin/curate/check_column_datum_downgrade.py

WHY THIS EXISTS.  `DistillationColumn.cpp` computed its energy items on the
elements/formation datum and, when a species could not be placed on it, fell
back to the SENSIBLE datum through an EMPTY catch:

    catch (const std::exception&) { elem = false; }

On a REACTIVE column that is not a lost decimal.  The elements datum is what
CARRIES the heat of reaction, so the downgrade DELETES it from the reboiler
duty.  The column converged, printed a duty, and exited 0 -- the shape
invariant I5 treats most seriously.

`Flowsheet.cpp` answers the identical question correctly, announcing through
`AdvisoryLog` with the degradation and its remedy named.  One decision, two
places, and the copies had diverged -- AS9's pattern exactly.

TWO SITES, NOT ONE.  The audit named the simultaneous-MESH path.  The
Wang-Henke path carries the SAME empty catch.  A fix applied to the named one
would have left the other silent and looked complete, so this gate exercises
BOTH -- each through a case that natively uses it.

WHY A GATE AND NOT A TUTORIAL.  No case in the corpus lacks formation data --
the announcement is correct but LATENT, which by this project's own criterion
makes it *described, not consolidated*.  The honest fix is a witness that can
fire, and the honest witness is a case built by DAMAGING a good one: this gate
copies a real column case into a temp dir, removes `standardThermochemistry`
from one species, and requires the run to announce.  Shipping a deliberately
incomplete tutorial would teach the wrong thing to anyone who opened it.

THE NEGATIVE MATTERS AS MUCH: the UNDAMAGED case must announce NOTHING.  A
gate that only checked the damaged run would pass an engine that warned on
every column ever solved, and a warning that always fires is not read.
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"

#  ONE CASE PER SOLVER PATH, EACH ON ITS NATIVE PATH.  The first draft took
#  the reactive case and FORCED it onto Wang-Henke to exercise both -- and
#  Wang-Henke cannot converge a reactive azeotropic column (CLAUDE.md 9 says
#  so in as many words).  The probe failed, the engine was fine, and I nearly
#  read that as a defect in the fix.  A probe must put each path on work it
#  can actually do; forcing it elsewhere measures the forcing.
CASES = [
    ("tutorials/steady/distillation/column05_reactive_methylacetate",
     "simultaneous"),           # REACTIVE: the warned-of consequence is real
    ("tutorials/steady/distillation/column01_benzene_toluene",
     "WangHenke"),              # the default bubble-point path
]

BLOCK = re.compile(r'\n\s*standardThermochemistry\s*\{[^{}]*\}\s*;?', re.S)

#  What the COLUMN must add.  `enthalpy GAP` alone is NOT enough: Flowsheet
#  emits that for the stream enthalpies regardless, so requiring only it would
#  pass with the column's own catch still empty -- a witness that cannot fail.
MUST_SAY = ["the column's energy items fall back",
            "heat of reaction is NOT in the reboiler duty"]


def run(case):
    p = subprocess.run([str(SOLVE), str(case)],
                       capture_output=True, text=True, timeout=600)
    return p.returncode, p.stdout + p.stderr



def main() -> int:
    fail, checked = [], []
    if not SOLVE.exists():
        print("check_column_datum_downgrade: FAILED\n  choupoSolve not built")
        return 1

    for case, path in CASES:
        src = ROOT / case
        if not src.is_dir():
            fail.append(f"{case} is missing -- the probe is stale, not the engine")
            continue

        #  (a) THE NEGATIVE, FIRST.  An intact case must be silent.
        rc, out = run(src)
        if rc != 0:
            fail.append(f"{src.name} does not run intact (exit {rc})")
            continue
        if "the column's energy items fall back" in out:
            fail.append(f"{src.name} has complete formation data yet announces "
                        "the downgrade.  A warning that fires on a healthy case "
                        "is not read on a sick one.")

        #  (b) DAMAGED: the column must announce, on its OWN path.
        with tempfile.TemporaryDirectory() as td:
            dst = Path(td) / src.name
            shutil.copytree(src, dst)
            damaged = None
            for c in sorted((dst / "constant" / "components").glob("*.dat")):
                s = c.read_text()
                if BLOCK.search(s):
                    c.write_text(BLOCK.sub("\n", s, count=1))
                    damaged = c.stem
                    break
            if damaged is None:
                fail.append(f"{src.name}: no mirrored component declares "
                            "`standardThermochemistry` -- nothing to remove, so "
                            "this probe proves nothing")
                continue
            rc, out = run(dst)
            missing = [s for s in MUST_SAY if s not in out]
            if missing:
                fail.append(
                    f"{src.name} ({path}): removing `standardThermochemistry` "
                    f"from '{damaged}' produced no COLUMN announcement; missing "
                    f"{missing}.  Note that Flowsheet's stream-level "
                    "`enthalpy GAP` may still appear -- that is not the "
                    "column's catch, and accepting it would be a witness that "
                    "cannot fail.")
            else:
                checked.append(f"{path} via {src.name}/{damaged}")

    if fail:
        print("check_column_datum_downgrade: FAILED")
        for f in fail:
            print("  " + f)
        return 1

    print("check_column_datum_downgrade: OK -- both column solver paths "
          "announce the formation-datum downgrade with its consequence named "
          f"({'; '.join(checked)}), and an intact case stays silent")
    return 0


if __name__ == "__main__":
    sys.exit(main())
