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

    evaporator04_orange_juice_simple reproduces textbook Example 10.2 "without BPE".
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

    # ---- K_f: PROMOTED 2026-08-07, and this gate hands it over ------------
    #
    #  K_f used to be REFERENCE-ONLY here, and this arm enforced that status:
    #  it failed the day anything consumed K_f, so the note would be rewritten
    #  rather than quietly outlived.  The condition Component.H set for
    #  promoting it -- "a record declaring Hfus with a primary citation, and a
    #  unit operation that needs freezing-point depression" -- was met when
    #  water.dat gained an IAPWS `sublimation { Hfus }` and SolidPhase gained
    #  its pure-crystal fugacity.  K_f is now DERIVED, exactly like K_b.
    #
    #  THE TRIP-WIRE DID NOT FIRE, AND THAT IS THE LESSON WORTH KEEPING.
    #  It was keyed on the ACCESSOR `K_f()`, and the promotion arrived through
    #  the INPUTS -- SolidPhase reads subHfus()/subTripleT() directly and never
    #  touches K_f().  So this gate went on printing "K_f is REFERENCE-ONLY and
    #  verified unconsumed: it cannot be derived (no record declares a heat of
    #  fusion)" while a record declared one, the engine derived from it, and a
    #  phase consumed it.  Every clause false, exit 0.  A status trip-wire
    #  keyed on ONE of two routes is a trip-wire that can be walked around
    #  without touching it -- the same shape as check_true_ions, which reported
    #  PASS on every run after both its inputs were deleted.
    #
    #  So K_f leaves this gate rather than being re-armed here.  Its home is
    #  check_ice_freezing, beside the phase that consumes it, where the
    #  derivation, its anchor and BOTH negatives are checked against
    #  arithmetic recomputed from the record.  What stays here is the HANDOVER
    #  itself: if that gate disappears or drops out of the suite, K_f silently
    #  becomes unchecked by anybody, and this arm says so.
    owner = ROOT / "bin/curate/check_ice_freezing.py"
    if not owner.exists():
        fail.append(
            "check_ice_freezing.py is gone.  K_f's derivation, its declared "
            "anchor and its two negatives moved there when K_f was promoted "
            "on 2026-08-07; with that gate absent, nothing checks the "
            "cryoscopic constant at all and this gate no longer covers it.")
    else:
        #  THE INVOCATION, not the name.  A bare substring search matched the
        #  gate's own FAIL-branch message and its explanatory comment, so a
        #  sabotage that renamed only the `if` line left this arm green -- the
        #  gate was unwired and the check still said it was in the suite.
        suite = (ROOT / "bin/runTests").read_text(errors="ignore")
        if not re.search(r'if\s+"\$ROOT/bin/curate/check_ice_freezing\.py"',
                         suite):
            fail.append(
                "check_ice_freezing.py exists but is NOT wired into "
                "bin/runTests.  A gate nobody runs is not coverage, and K_f's "
                "derivation is unchecked in every place that matters.")

    #  PROSE STALENESS IS NOT GATED, and that is a decision rather than an
    #  oversight.  Three attempts, each unsound in a different way:
    #
    #    1. Search "reference-only" ONCE.  water.dat's first mention of K_f is
    #       in its sources header, twelve lines above the note that mattered,
    #       so the arm read a clean window and passed over the stale claim.
    #    2. Search EVERY occurrence and fail on any.  That fires on the
    #       CORRECTED notes too: both recount the old status in order to
    #       explain the promotion, and deleting that history to satisfy a grep
    #       would be the gate rewriting the record rather than checking it.
    #    3. Require the word "derived" near the phrase.  A sabotage -- replace
    #       water.dat's whole paragraph with a bare "K_f IS REFERENCE-ONLY" --
    #       SURVIVED, because K_b's own paragraph sits immediately above and
    #       says "the engine DERIVES it".  Word proximity measures layout.
    #
    #  A text search cannot tell a LIVE claim from a RECORDED one.  Rather
    #  than ship a fourth tuning of a window size and call it coverage, this
    #  gate says plainly that it does not check the notes.  The notes WERE
    #  rewritten in the same commit as the promotion; nothing here guarantees
    #  the next one will be.  The guard belongs where the coverage is, not
    #  where the prose is.
    if re.search(r'\bhasEbulioscopic\b', "".join(
            q.read_text(errors="ignore") for q in ROOT.joinpath("src").rglob("*.H"))):
        fail.append("hasEbulioscopic() is back.  It returned true when ONLY "
                    "K_f was declared, so a caller asking 'does this solvent "
                    "have ebullioscopic data?' would take the BPE path with "
                    "K_b = 0.  Two constants, two questions.")

    if fail:
        print("check_ebullioscopic: FAILED")
        for f in fail:
            print("  " + f)
        return 1

    print(f"check_ebullioscopic: OK -- K_b is derived from water.dat's own "
          f"Tb/MW/HvapTb ({Kb:.6f} K.kg/mol, recomputed here, not pinned), the "
          f"derivation and its declared anchor {anchor} are both announced and "
          f"agree to {abs(Kb - anchor) / anchor * 100:.3f} %, and a case that "
          "declares no K_b still gets no BPE.  K_f is NO LONGER THIS GATE'S "
          "SUBJECT: it was promoted from reference-only to derived on "
          "2026-08-07 (water.dat gained an IAPWS heat of fusion and "
          "SolidPhase became its consumer), and its derivation, anchor and "
          "negatives are checked by check_ice_freezing, which this gate "
          "verifies exists and is in the suite.  All that is asserted here is "
          "the HANDOVER.  NOT CHECKED: whether Component.H's and water.dat's "
          "K_f notes are still accurate -- they were rewritten with the "
          "promotion, but a text search cannot tell a live claim from a "
          "recorded one, and three attempts to gate it failed in three "
          "different directions (missed a stale note; fired on a corrected "
          "one; survived a sabotage by reading the K_b paragraph above).  "
          "Worth recording: the old trip-wire did NOT fire on the promotion "
          "-- it watched the accessor K_f(), and the consumer reads "
          "subHfus()/subTripleT() instead, so this gate printed four false "
          "clauses and exited 0.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
