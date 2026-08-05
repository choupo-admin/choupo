#!/usr/bin/env python3
"""Gate: K_b is DERIVED where declared, and INVENTED nowhere.

    bin/curate/check_ebullioscopic.py

WHY THIS EXISTS.  The molal boiling-point elevation constant is not an
independent measurement.  For a dilute ideal solution it is DEFINED by

        K_b = R * Tb^2 * M / dHvap(Tb)

and water.dat already declares all three inputs.  Storing K_b beside them was
the arity sin in its textbook form -- and the copies HAD drifted: the record
carried the rounded 0.512 against 0.512942 implied by its own Tb/MW/HvapTb,
0.18 % apart, feeding straight into every evaporator's BPE.  The `anchors{}`
block had said so in a comment ("K_b is a stored derivative ... not written in
new files") and nothing ever acted on it.  A described contract is not a
consolidated one.

Ruled by Vitor 2026-08-05: derive it, document the change, re-record the
goldens once.

THE SECOND CLAIM IS THE ONE THAT COST SOMETHING, and it is why this gate has
a negative.  The first implementation derived K_b for ANY component carrying
Tb/MW/Hvap -- which is every solvent in the corpus.  That gave a
boiling-point elevation to cases that deliberately model WITHOUT one:

    evaporator04_orange_juice_simple reproduces MCFT Ex. 10.2 "without BPE".
    Its own component record says, in words, "no K_b (BPE neglected)".
    It acquired BPE = 0.41 K and its heat-transfer area moved 4.75 %.

That is not a refined constant.  It is a different model, arrived at
silently, in a case whose title says otherwise.  An absent `K_b` is the
author declaring "no BPE here", and AN ABSENCE MUST KEEP MEANING WHAT IT
MEANT.  So the derivation is OPT-IN: it replaces a DECLARED K_b, and invents
nothing where none was declared.

WHAT THIS GATE CHECKS.

  (a) THE DERIVATION IS RIGHT.  K_b is recomputed here, independently, from
      water.dat's own declared Tb / MW / HvapTb, and the run must print that
      number.  Recomputing rather than pinning a literal is deliberate: a
      literal would be a second home for the very value this slice removed.

  (b) THE ANCHOR IS SHOWN, NOT SILENTLY DISCARDED.  A declared K_b becomes a
      cross-check, and the run announces the comparison.  A derivation whose
      disagreement with the measured anchor is invisible is a derivation
      nobody can audit.

  (c) THE ANCHOR STILL AGREES.  If the derived and declared values ever part
      by more than 1 %, something is wrong with the record, not with the
      arithmetic -- and the gate says so instead of shrugging.

  (d) THE NEGATIVE: a case with NO declared K_b gets NO BPE.  This is the
      exact failure above, and it is the reason to trust (a): a gate that
      only checked the derivation would have passed the broken version.
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOLVE = ROOT / "build" / "linux64Gcc" / "choupoSolve"
R_GAS = 8.314462618

#  DERIVED here, from the record, exactly as the engine must.
WATER = ROOT / "data/standards/components/water.dat"

#  (a)-(c) ride on a case whose solvent DECLARES K_b; (d) on one that does not.
POSITIVE = "tutorials/steady/evaporation/evaporator01_brine"
NEGATIVE = "tutorials/steady/evaporation/evaporator04_orange_juice_simple"


def scalar(text, key):
    m = re.search(rf'^\s*{key}\s+(-?[\d.]+(?:[eE][-+]?\d+)?)\s*;', text, re.M)
    return float(m.group(1)) if m else None


def run(case):
    p = subprocess.run([str(SOLVE), str(ROOT / case)],
                       capture_output=True, text=True, timeout=300)
    return p.returncode, p.stdout + p.stderr


def main() -> int:
    fail = []

    if not SOLVE.exists():
        print("check_ebullioscopic: FAILED\n  choupoSolve not built")
        return 1

    wt = WATER.read_text()
    Tb, MW, Hv = scalar(wt, "Tb"), scalar(wt, "MW"), scalar(wt, "HvapTb")
    anchor = scalar(wt, "K_b")
    if None in (Tb, MW, Hv):
        fail.append("water.dat no longer declares Tb / MW / HvapTb -- K_b "
                    "cannot be derived, and the probe is stale, not the engine")
        Kb = None
    else:
        Kb = R_GAS * Tb * Tb * (MW / 1000.0) / Hv

    rc, out = run(POSITIVE)
    if rc != 0:
        fail.append(f"{POSITIVE} did not run (exit {rc})")
    elif Kb is not None:
        #  (a) the printed K_b is the derived one, to 6 significant figures.
        if f"{Kb:.6f}" not in out:
            fail.append(f"the run does not print the derived K_b {Kb:.6f} "
                        f"(from water.dat's own Tb={Tb} MW={MW} HvapTb={Hv})")
        #  (b) the derivation and the anchor are both announced.
        for phrase in ("K_b = R·Tb²·M/ΔHvap(Tb)", "derived from", "declared anchor"):
            if phrase not in out:
                fail.append(f"the run does not announce '{phrase}' -- a "
                            "derivation nobody can see is not glass-box")
        #  (c) derived and measured still agree.
        if anchor:
            gap = abs(Kb - anchor) / anchor * 100.0
            if gap > 1.0:
                fail.append(f"derived K_b {Kb:.6f} and the declared anchor "
                            f"{anchor} differ by {gap:.2f} % (> 1 %) -- the "
                            "record disagrees with itself; curate it")

    #  (d) THE NEGATIVE.  No declared K_b -> no BPE, and no invented one.
    rc, out = run(NEGATIVE)
    if rc != 0:
        fail.append(f"{NEGATIVE} did not run (exit {rc})")
    else:
        m = re.search(r'BPE\s*=\s*K_b.*?=\s*([\d.]+)\s*K', out)
        if m and float(m.group(1)) > 1e-12:
            fail.append(
                f"{Path(NEGATIVE).name} declares NO K_b -- its own record says "
                f"'no K_b (BPE neglected)' -- yet the run reports BPE = "
                f"{m.group(1)} K.  The derivation is inventing a boiling-point "
                "elevation where the author declared none, which changes the "
                "MODEL, not a constant.")

    if fail:
        print("check_ebullioscopic: FAILED")
        for f in fail:
            print("  " + f)
        return 1

    print(f"check_ebullioscopic: OK -- K_b is derived from water.dat's own "
          f"Tb/MW/HvapTb ({Kb:.6f} K.kg/mol, recomputed here, not pinned), the "
          f"derivation and its declared anchor {anchor} are both announced and "
          f"agree to {abs(Kb - anchor) / anchor * 100:.3f} %, and a case that "
          "declares no K_b still gets no BPE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
