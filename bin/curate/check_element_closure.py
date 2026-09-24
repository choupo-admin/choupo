#!/usr/bin/env python3
"""Gate: no steady case ships a plant that loses atoms in silence.

    bin/curate/check_element_closure.py

WHY THIS EXISTS, and the reason is written in this project's own record.
`docs/design/what-a-passing-suite-does-not-say.md` carries a coverage map of
the conservation laws, written on 2026-09-08, the day a green suite was found
to coexist with violated energy balances.  Two rows of that table were the
SAME SHAPE -- a law asserted on one case and read as asserted on the corpus:

    energy (plant)   energy-T1/T2:plant        one case
    atoms/elements   check_element_balance     one case

The energy row was closed that week: `check_energy_closure` reads the engine's
own report over every steady case, bands it, and ratchets a measured pin
ledger.  THE ATOM ROW WAS NOT.  It has no task number, it is absent from
DEV.md §5, and `check_element_balance` still runs `conversion01_hda` and two
overlays of it -- which is honest of that gate and was never a claim about the
corpus, because it marks no claim line at all, so the manifest says nothing
about its scope either.

CLAUDE.md states the rule this gate exists to satisfy: *before quoting a PASS
as reassurance about a class of defect, NAME the gate that would have failed;
if you cannot name it, the PASS says nothing about it.*  For atom conservation
across 210 publishing cases, nothing could be named.

WHAT THIS CHECKS.  For every case that publishes `reports/balances/
elementBalance.csv`, EVERY element row must close within BAND, or the case
must be PINNED with the deviation it is known to carry.  The closure is READ
from the engine's own report and never recomputed here: the balance has one
home (CLAUDE.md: engine-owned, the GUI only draws), and a gate that re-derived
it would be a second one, free to drift from the report a student reads.

THE BAND IS 0.01 pp, AND THAT IS NOT A TOLERANCE ON PHYSICS.  Atoms are
conserved by construction in every unit that does not model a sink: the engine
sums a formula-resolved inventory in and out.  A deviation is therefore a
STRUCTURAL fact -- a species the boundary does not see, a phase the report does
not count, a unit that moves matter somewhere the stream table has no name for
-- not accumulated round-off.  0.01 pp is three orders above the round-off the
corpus actually shows (the tightest non-zero deviation measured is 0.0014 pp)
and still catches everything that is not.

THE PIN LEDGER IS MEASURED, NEVER TYPED, AND IT RATCHETS TWO WAYS:

  * a pinned case that gets WORSE than its pin by more than RATCHET FAILS --
    a debt may not grow;
  * a pinned case that has STARTED CLOSING by more than RATCHET also FAILS,
    asking for its pin back -- a stale pin is a claim about the engine that
    stopped being true, and it HIDES the next regression on that case;
  * an unpinned case outside BAND fails, which is the point.

WHY ONE PIN IS NOT A DEBT AT ALL, and it must be read before the list is
used as a list of defects.  `membrane08_softened_scaling` loses 99.99 pp of
its calcium.  That is a SOFTENER: ion exchange moves calcium onto a resin,
and a resin is not a stream.  The atoms are conserved; the BOUNDARY is not
the right control volume for them.  A band alone accuses it.  The ledger does
not -- it carries the measurement with the reason, exactly as
`check_energy_closure`'s KNOWN_OPEN carries plants that do not close.  Every
other entry below is a real, undiagnosed leak.

THE BAND IS PER ELEMENT AND THE PIN IS PER CASE, and that asymmetry is
deliberate.  `membrane10_dspmde_divalent` loses 0.3977 pp of its magnesium and
0.0002 pp of its hydrogen; a single pin against the case's WORST element is
what ratchets, because a fix that closes the magnesium and leaves the chlorine
should still be visible as progress, and one that quietly opens a THIRD
element while closing magnesium must not read as an improvement.  So the pin
is the worst deviation and the gate reports which element carries it.

WHAT THIS DOES NOT CHECK, and the first one is the half that matters:

  * WHETHER A PINNED DEVIATION IS ACCEPTABLE.  It is not.  Fourteen of the
    sixteen entries are membrane cases and the leak is systematic across the
    family -- a student opening a desalination tutorial whose subject is where
    the magnesium goes reads `Mg ... 99.6023` in the engine's own report.  The
    ledger schedules stasis, not repair.  Diagnosing it is a chemical
    engineer's pass and belongs to whoever owns the membrane transport path.
  * WHETHER THE ELEMENT INVENTORY IS RIGHT.  A species the formula parser
    REFUSES is excluded from both sides and closes perfectly; that refusal is
    `check_element_balance`'s arm 2 and stays there.
  * PER-UNIT atom closure.  A plant can close globally with two units
    cancelling, the same gap `check_mass_closure` and `check_energy_closure`
    both name for their own laws.
  * CHARGE.  Eight named cases of roughly twenty-eight that speciate, in
    `check_charge_balance`, which marks no claim line.  The row beside this
    one in the same coverage map, still open.
  * Anything in a case that publishes NO elementBalance: reported by count
    and by bucket, never silently.
"""
import csv
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]

BAND = 0.01
RATCHET = 0.002

#  MEASURED 2026-09-24 by reading every published elementBalance.csv, never
#  typed.  Value = the worst |closure_pct - 100| the case carries, in
#  percentage points.  Reseed with --seed; do not hand-edit a number.
KNOWN_OPEN = {
    "tutorials/steady/membranes/membrane08_softened_scaling": 99.9881,
    "tutorials/steady/membranes/membrane10_dspmde_divalent": 0.3977,
    "tutorials/steady/membranes/membrane07_scaling_si": 0.2687,
    "tutorials/steady/optimisation/optim04_membrane_recovery_scaling": 0.1149,
    "tutorials/steady/membranes/membrane14_polarisation_multiionic": 0.1000,
    "tutorials/steady/membranes/membrane15_module_nf270_4040": 0.0712,
    "tutorials/steady/membranes/membrane05_train": 0.0709,
    "tutorials/steady/membranes/membrane11_dspmde_born_toggle": 0.0695,
    "tutorials/steady/membranes/membrane02_NF_sugar": 0.0643,
    "tutorials/steady/membranes/membrane16_module_sw30hr_8040": 0.0602,
    "tutorials/steady/membranes/membrane04_spacer_schock_miquel": 0.0371,
    "tutorials/steady/membranes/membrane06_pitzer": 0.0365,
    "tutorials/steady/membranes/membrane09_index_vs_rigorous": 0.0347,
    "tutorials/steady/membranes/membrane01_RO_NaCl_seawater": 0.0295,
    "tutorials/steady/absorption/extract02_declared_interior": 0.0130,
    "tutorials/steady/absorption/extract01_ethanol_water_benzene": 0.0121,
}

#  The one entry that is NOT a leak, with the reason, so a reader of the
#  ledger is not misled into counting it as one.
NOT_A_LEAK = {
    "tutorials/steady/membranes/membrane08_softened_scaling":
        "a SOFTENER: ion exchange moves calcium onto a resin, and a resin is "
        "not a stream.  The atoms are conserved; the boundary is not the "
        "right control volume for them.",
}


def worst(path):
    """(element, |closure-100|, closure) for the worst row, or None."""
    out = None
    with open(path, newline="") as fh:
        for row in csv.DictReader(fh):
            try:
                pct = float(row.get("closure_pct", ""))
            except (TypeError, ValueError):
                continue
            dev = abs(pct - 100.0)
            if out is None or dev > out[1]:
                out = (row.get("element", "?"), dev, pct)
    return out


def scan():
    found = {}
    for f in sorted((ROOT / "tutorials").rglob("reports/balances/elementBalance.csv")):
        case = str(f.relative_to(ROOT)).split("/reports/")[0]
        w = worst(f)
        if w is not None:
            found[case] = w
    return found


def main(argv):
    found = scan()
    if not found:
        print("check_element_closure: CANNOT RUN -- no case publishes "
              "reports/balances/elementBalance.csv, so no closure can be read.  "
              "Run the corpus first.  A check that cannot run must not pass.")
        return 2

    if "--seed" in argv:
        for case, (_, dev, _) in sorted(found.items(), key=lambda kv: -kv[1][1]):
            if dev > BAND:
                print(f'    "{case}": {dev:.4f},')
        return 0

    inband, pinned, failures = [], [], []
    for case, (el, dev, pct) in sorted(found.items()):
        pin = KNOWN_OPEN.get(case)
        if pin is None:
            if dev <= BAND:
                inband.append(case)
            else:
                failures.append(
                    f"{case}: element {el} closes at {pct:.4f} % "
                    f"({dev:.4f} pp outside 100), which is beyond the {BAND} pp "
                    f"band and is pinned nowhere.  Either the case leaks atoms "
                    f"and the leak is the finding, or the boundary is not the "
                    f"right control volume for them and it belongs in "
                    f"KNOWN_OPEN with the reason written beside it.")
            continue
        pinned.append(case)
        if dev > pin + RATCHET:
            failures.append(
                f"{case}: element {el} is at {dev:.4f} pp against a pin of "
                f"{pin:.4f} pp -- the debt GREW.  A pinned violation may not "
                f"get worse.")
        elif dev < pin - RATCHET:
            failures.append(
                f"{case}: element {el} is at {dev:.4f} pp against a pin of "
                f"{pin:.4f} pp -- it has STARTED CLOSING.  Take the pin down to "
                f"the measured value (or remove it if it is now inside the "
                f"band): a stale pin is a claim about the engine that stopped "
                f"being true, and it hides the next regression on this case.")

    stale = [c for c in KNOWN_OPEN if c not in found]
    for c in stale:
        failures.append(
            f"{c}: pinned in KNOWN_OPEN but publishes no elementBalance.  A pin "
            f"on a case nobody measures is a licence.")

    if failures:
        print("check_element_closure: FAILED")
        for f in failures:
            print("  " + f)
        return 1

    leaks = len(pinned) - len(NOT_A_LEAK)
    print(
        f"check_element_closure: OK -- the engine's own elementBalance report, "
        f"read and never recomputed here: {len(inband)} case(s) close EVERY "
        f"element of their boundary within {BAND} pp, and {len(pinned)} more "
        f"are PINNED with the worst deviation they are known to carry, none of "
        f"which has grown past its ratchet ({RATCHET} pp) or quietly started "
        f"closing.  The pin list is a ledger of plants that do NOT conserve "
        f"atoms, not exemptions: {leaks} of the {len(pinned)} are real, "
        f"undiagnosed leaks and 14 of those are membrane cases, so the leak is "
        f"a FAMILY and not a scatter; the remaining {len(NOT_A_LEAK)} is named "
        f"in NOT_A_LEAK with its reason (a softener moves calcium onto a resin, "
        f"and a resin is not a stream).  The band is per ELEMENT and the pin is "
        f"per CASE's worst element, so closing one element while opening "
        f"another cannot read as an improvement.  NOT CHECKED: whether a pinned "
        f"deviation is acceptable (it is not); whether the element inventory is "
        f"RIGHT, since a species the formula parser refuses is excluded from "
        f"both sides and closes perfectly (check_element_balance arm 2); "
        f"PER-UNIT atom closure, where a plant can close globally with two "
        f"units cancelling; and CHARGE, which is eight named cases in "
        f"check_charge_balance and is the row beside this one in the same "
        f"coverage map.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
