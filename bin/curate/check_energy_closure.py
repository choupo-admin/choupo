#!/usr/bin/env python3
"""Gate: no steady case ships a plant whose first law is violated in silence.

    bin/curate/check_energy_closure.py

WHY THIS EXISTS, and it is not a happy story.  `check_mass_closure` was built
on 2026-09-04 because a spray dryer created 2948 kg/h of water at exit 0, and
its own "WHAT THIS DOES NOT CHECK" section named ENERGY closure as the gap it
was leaving open.  The gap stayed open.  On 2026-09-08 Vitor asked the
question that follows from it -- *how was it possible to keep saying the suite
runs fine while energy balances are violated?* -- and the answer was
structural: NOTHING FAILED ON AN ENERGY RESIDUAL, ANYWHERE.

  * a golden pins what a run PRINTS, so a stable wrong residual passes by
    construction (the dryer lesson, written in CLAUDE.md, unapplied here);
  * `check_energy_boundary_pinned` requires the residual to be PUBLISHED and
    PINNED -- never that it be SMALL.  A 16 % violation satisfies it, gets
    written into the golden, and satisfies it forever after;
  * the per-unit closure alarm prints to stderr and returns exit 0.

So `PASS 58 / FAIL 0` meant "the answer has not moved", which is what the
suite's own verdict line says in those words, and it was read as "the plant
conserves energy".  This gate is the instrument that makes the second claim
mean something.

WHAT THIS CHECKS.  For every steady case that publishes one, the GLOBAL
first-law residual the engine's own report computes -- on the `[report]
globalEnergyBoundary` line -- must be within BAND, OR the case must be PINNED
with the residual it is known to carry.  The number is read from the engine
and never recomputed here: the balance has one home (CLAUDE.md: engine-owned,
the GUI only draws) and a gate that re-derived it would be a second one, free
to drift from the report a student reads.

THE REPORT SPEAKS IN TWO SHAPES, AND UNTIL 2026-09-12 THIS GATE READ ONE.
`EnergyBalanceReport.cpp` prints the residual as a PERCENTAGE only when the
plant has an exchanged-energy SCALE to divide by:

    (|in-out|/in = 0.163 %)                                   <- hasScale
    (residual -6162.5019 kW; NO EXCHANGED-ENERGY SCALE
     -- percentage unavailable)                               <- no scale

The second shape is the 2026-09-08 rule THE NUMERICAL FLOOR IS NOT A SCALE
working exactly as intended: a plant that declares no duty and carries no
boundary heat -- it receives its energy as MATERIAL steam -- has no
denominator, so the engine publishes the kW and marks the ratio unavailable
rather than dividing by a 1e-9 floor and printing -6.16e14 %.  That rule was
right.  It also closed no loop: this gate's `LINE` regex matched only the
percentage shape, so every case printing the second one fell through into
`noReport`, a bucket whose own claim line called them "no external heat, no
boundary streams" -- FALSE of all 74 of them, which have feeds, products and a
real residual.  MEASURED 2026-09-12: 23 of those 74 carry |residual| above
1 kW, the worst being `evaporator02_triple_effect_sugar` at -6162.5019 kW --
the very number CLAUDE.md quotes when it states the rule.  A gate built to
refuse an unpinned first-law violation was reading only the channel the rule
had removed, and said OK.

THE ABSOLUTE BAND IS A DECLARED CHOICE, NOT A DERIVATION, AND IT HAS NO
PHYSICAL BASIS.  For these cases there IS no denominator -- that is the whole
content of the second shape -- so no relative band is available and any number
put here is a convention.  `BAND_KW` is 1.0 kW.  What makes it defensible is
only this: it is three orders of magnitude above the 1e-3 kW floor
`bin/runTests` already uses to decide whether a `boundary ... residual_kW`
golden row is a number at all rather than cancellation round-off (the column13
nanowatt lesson, whose threshold lives in that one place).  So a residual this
gate judges is a residual the suite already considers real.  It is NOT a
statement about any plant: 1 kW is nothing in a 132 MW evaporator and would be
the whole duty of a laboratory rig, and the gate cannot tell them apart
because the engine could not either.  The consequence is visible in the seeded
list -- `extract01_ethanol_water_benzene` at -0.8814 kW sits just under the
band and `extract02_declared_interior` at -1.0263 kW just over, on what is the
same plant with a declared interior.  A conventional cut through a continuum
looks exactly like that, and saying so is better than pretending the 1.0 was
measured from something.

WHY THESE 23 ARE SEEDED WHEN combined02's 21 % WAS REFUSED, on the same day.
The architect declined to pin `combined02` that morning because that case
ASSERTED physics it could not support and was fixable: pinning it would have
converted a defect with a known remedy into a line in a ledger.  These 23 are
a different thing -- they are UNEXAMINED.  Nobody has looked at one of them,
because until this commit nothing could see them at all.  Seeding is how they
become visible; invisible is strictly worse than pinned.  A pin here is a debt
with a name and a number, not an absolution, and the ratchet is what stops it
from turning into one.

WHY A PIN LIST AND NOT A CLEAN BAND.  Because the corpus does not close today,
and pretending otherwise by loosening the band until everything passes is how
this defect survived in the first place.  A pin is the project's own idiom for
a real gap that is not yet fixed (the NEVER-list records, `debt_registry`, the
NC_COMPILATION pins): *a visible gap is strictly better than an invisible
falsehood.*  Each entry carries the residual MEASURED when it was pinned, and

  * a pinned case that gets WORSE than its pin by more than RATCHET FAILS --
    a debt may not grow quietly;
  * a pinned case that now CLOSES fails too, naming the pin to remove --
    a stale pin is a claim about the engine that is no longer true;
  * a case that is neither closing nor pinned FAILS, and says how to pin it.

WHAT THIS DOES NOT CHECK, said plainly:
  * WHETHER A PINNED RESIDUAL IS ACCEPTABLE.  It is not.  Every entry in
    KNOWN_OPEN is a plant that violates the first law, and the list is a
    ledger of work owed, not a set of exemptions.
  * PER-UNIT closure.  A plant can close globally with two units cancelling.
    `energyBalance_byUnit.csv` localises it and ammonia02 is the proof that
    the localisation itself can be wrong; named as the next slice.
  * A CASE THE REPORT NEVER RUNS FOR (under an outerDict the chain does not
    run).  Those are LISTED, never silently skipped.
  * A CASE WHOSE ENERGY BALANCE THE ENGINE REFUSED for want of an enthalpy
    datum on a boundary stream (`energyBalance UNAVAILABLE` / `->  REFUSED`).
    There is no residual to judge, so this gate judges none -- but it COUNTS
    them under their own name, because they used to sit in `noReport` too and
    that bucket's sentence was false of them as well: they have boundary
    streams, they are missing a curated datum.
  * WHETHER A CASE THAT PUBLISHES NOTHING SHOULD.  `noReport` now holds only
    cases that printed no `globalEnergyBoundary` line of ANY shape and no
    refusal, and its sentence says that and nothing more.
  * ANY CASE OUTSIDE THE SCOPE IT WAS RUN IN.  Under `--fast` the scope is one
    case per family; the claim says so and names the count.
  * A `code/` CASE, WHEN THIS GATE IS RUN STANDALONE.  `output()` invokes
    `choupoSolve`, and a case carrying a `code/` directory is built by
    `bin/buildCode` and run through its own `choupoCase` binary (see
    `binary_for` in bin/runTests), so standalone it exits non-zero here and
    lands in `unrun`.  Under the suite it is CACHED and fully judged -- which
    is why `userOp01_yield_reactor` (-3.7126 kW) is in KNOWN_OPEN_KW although
    a standalone `--seed` cannot see it.  That pin was measured by building
    the case and running its own binary, and a standalone seed will silently
    omit it: check the ledger against a suite-cached run before pasting.  The
    gate does NOT reimplement `binary_for` -- a second home for how a case is
    launched is worse than a named blind spot.

SABOTAGE-VERIFIED 2026-09-08, all three, each failing with its own message:

  S1  lower a pin below the measured residual (ammonia02 pinned at 15.0 while
      it measures 16.137) -> "first-law residual grew from the pinned
      15.0000 % to 16.1370 % (> 0.20 pp).  A declared debt may not grow
      quietly."
  S2  delete a pin from a case that does not close (column01) -> "global
      first-law residual 24.6820 % ... outside the 1.0 % band, and NOT pinned."
  S3  pin a case that closes -> "combined01_brayton_rankine now closes at
      0.0000 % ... but is still PINNED at 11.8660 %.  Remove it from
      KNOWN_OPEN: a stale pin is a claim about the engine that stopped being
      true."

S3 returned a real finding as well as its verdict: the exchanger
enthalpy-inversion of the same day CLOSED `combined01_brayton_rankine`, pinned
at 11.87 %.  A stale-pin arm earns its keep the first time the engine
improves.

THE PIN LIST WAS STALE WHEN THIS LANDED, and the two stale entries were
CLEARED on 2026-09-08 -- ammonia02 (pinned 15.00 %, measured 0.0020 %) and
combined01_brayton_rankine (pinned 11.87 %, measured 0.0000 %) -- because a
stale pin is a claim about the engine that stopped being true and it HIDES the
next regression on that case.  Clearing one is not re-recording a golden: it
removes a debt entry, moves no number, and the arm that measured 0.0020 % is
the same arm that will fail the day either case regresses.  The GOLDEN rows
those two cases carry are a separate question and remain Vitor's.

SEEDING.  `--seed` prints BOTH blocks for the cases in scope, so each list is
MEASURED and never typed from memory.  `KNOWN_OPEN` was seeded from
`bin/runTests --fast` (one case per tutorial family); `KNOWN_OPEN_KW` was
seeded on 2026-09-12 from the FULL steady corpus (233 cases, 227 of which run
clean).  A narrower sweep will meet cases a list does not name; that is the
gate working, and the remedy is one `--seed` run against the full scope,
reviewed before it is pasted.

SABOTAGE-VERIFIED 2026-09-12, the kW arm, five more, each read back off disk
before the gate was run so that a sabotage that did not LAND could not be
mistaken for one the gate survived:

  S4  raise a kW pin above the measured residual (sprayDryer01 pinned at
      -1.5000 kW while it measures -2.6584) -> "first-law residual grew from
      the pinned -1.5000 kW to -2.6584 kW (> 0.2000 kW, the ratchet for a pin
      that size).  A declared debt may not grow quietly."
  S5  pin a case that closes (adiabaticFlash01, 0.0001 kW) -> "now closes at
      +0.0001 kW (within the 1.0 kW band) but is still PINNED at +900.0000 kW.
      Remove it from KNOWN_OPEN_KW."
  S6  delete a kW pin from a case that does not close (evaporator02) ->
      "global first-law residual -6162.5019 kW at the plant boundary, outside
      the 1.0 kW band, and NOT pinned."
  S7  restore the old one-shape reader (drop LINE_KW) -> **THIS SABOTAGE
      SURVIVED ITS FIRST RUN, exit 0**, and it is the one that earned its
      keep.  With the reader back to one shape the 72 no-scale cases fall
      into `noReport` (13 -> 85) and the gate PASSES while its own claim
      announces 22 plants PINNED in KNOWN_OPEN_KW that it never read -- a
      ledger describing subjects the gate does not reach, the
      `check_true_ions` shape, green for ever.  The UNANSWERED-PIN arm was
      added for it and applied to BOTH ledgers, because the blind spot is
      symmetric -- it then failed with "tutorials/steady/evaporation/
      evaporator02_triple_effect_sugar is PINNED in KNOWN_OPEN_KW, which is a
      claim that this run would read an ABSOLUTE kW residual from it -- and it
      did not".  Re-running S7 against the FINISHED gate now fails through the
      `RAN` self-audit of S9 instead, which intercepts the same cases one
      branch earlier and says the truer thing (the fault is the gate's, not
      the plant's).  Both arms are kept: the pin arm answers "a ledger entry
      nothing answered to", the self-audit answers "a shape nobody read", and
      a gate can lose either without losing the other -- a pin can go
      unanswered with every shape parsed (the case was renamed), and a shape
      can go unread with no pin naming it (a new case, or an emptied ledger,
      which is S9).
  S8  flip the SIGN of a kW pin within the ratchet (sprayDryer01 pinned at
      +2.6584 while it measures -2.6584) -> "first-law residual CHANGED SIGN
      ...  The magnitude is within the ratchet, so the growth arm cannot see
      it, but the plant stopped leaking energy and started creating it."
      S8 is why the sign arm exists: the growth arm alone is blind to it.
  S9  the same blinding as S7 but with KNOWN_OPEN_KW EMPTIED, so the
      unanswered-pin arm has nothing to fire on and only the self-audit can
      speak -> 72 failures, each quoting the engine's own unparsed line:
      "published a globalEnergyBoundary line this gate could not parse, so it
      would have been filed as publishing nothing.  THIS IS A DEFECT IN THE
      GATE, not in the case."  That arm is `RAN`, a regex this file had
      DEFINED SINCE THE DAY IT WAS WRITTEN AND READ NOWHERE -- a probe nobody
      consults cannot catch anything, and had it been consulted it would have
      caught this defect on 2026-09-08, the day the second shape landed.
      It is also the only arm that keeps `noReport` honest STRUCTURALLY
      rather than by prose: a bucket whose sentence is checked by a human is
      a bucket that goes false the next time the engine learns a new shape.
  S10 pin a case IN THE WRONG LEDGER (column01, which publishes a percentage,
      added to KNOWN_OPEN_KW) -> the unanswered-pin arm, fired on its own
      without the self-audit in the way: "... is a claim that this run would
      read an ABSOLUTE kW residual from it -- and it did not: the case
      published a PERCENTAGE residual."
  S11 pin a case that does not exist -> "is PINNED in KNOWN_OPEN_KW but is not
      a steady case in this tree at all ...  a pin that names nothing is a
      debt nobody can pay."  (Unscoped runs only: under --fast an absent case
      is out of reach, not absent, and is never accused.)

VERIFIED NOT TO ACCUSE THE INNOCENT, three ways, because a gate that accuses
the innocent teaches the reader to ignore it: (a) every one of the 23 seeded
cases was read back from the engine's own JSON before it was pinned -- feeds,
products, `noBoundary` false, `n_gap` 0, and the printed residual reproducing
H_feeds + Q_boundary - H_products to the digit; (b) the scoped (--fast) run
passes with 205 cases out of reach and accuses none of their pins; (c) the
standalone run, which cannot build a `code/` case, files userOp01 under
`unrun` and does not accuse its pin either.

A FINDING THE FULL-CORPUS SEED RETURNED, recorded and NOT acted on:
`proxy01_gas_loop` is pinned at 118.1200 % and now measures 51.9550 %.  The
percentage ratchet is one-directional -- it catches a debt that GROWS and the
stale-pin arm catches one that reaches the band -- so a debt that HALVES moves
in silence.  The pin is a claim about the engine that is half true.  Whether a
two-sided ratchet is wanted is the architect's call; re-pinning it is not this
commit's business.
"""
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from suite_cache import SCOPED, scope_sentence, stdout_of   # noqa: E402

ROOT = Path(__file__).resolve().parents[2]

#  Per cent of the boundary input.  Chosen as the loosest number that is still
#  a physical statement about a plant: a recycle tear converges to a declared
#  tolerance, so a real case closes to a residual and not to zero.  It is NOT
#  derived from anything, and it is deliberately the same order as the mass
#  gate's 0.5 % rather than a looser one chosen to make the corpus pass.
BAND = 1.0

#  How much worse a PINNED residual may get before it is a regression, in
#  percentage points.  Small: a pin records a measurement, and a measurement
#  that moves is either a fix or a new defect, both of which want a human.
RATCHET = 0.2

#  ABSOLUTE kW, for the cases the engine can give no percentage.  A DECLARED
#  CONVENTION with no physical basis -- see the docstring.  Its one defence is
#  that it is three orders above the 1e-3 kW floor `bin/runTests` uses to
#  decide a `boundary residual_kW` row is a number and not round-off.
BAND_KW = 1.0

#  The kW ratchet, in TWO parts, because one number cannot serve a list
#  spanning 1.03 kW to 6162.50 kW -- a flat 0.2 kW is 19.5 % of the smallest
#  pin and 0.0032 % of the largest.  MEASURED against the arm that already
#  exists: across KNOWN_OPEN the 0.2 pp ratchet is between 18 % (tsa01, pinned
#  1.112 %) and 0.117 % (esterification2sector, pinned 170.979 %) of the pin it
#  guards.  So the relative floor here is 0.1 % -- the tightest relative grip
#  the percentage arm is already known to accept -- and below it the flat
#  0.2 kW takes over, which is the same fifth-of-band proportion the
#  percentage arm uses (0.2 pp against a 1.0 % band).  Both numbers are
#  conventions; what is measured is the parity they were chosen to keep.
RATCHET_KW_ABS = 0.2
RATCHET_KW_REL = 0.001


def ratchet_kW(pin: float) -> float:
    """How much a pinned kW debt may grow before it is a regression."""
    return max(RATCHET_KW_ABS, RATCHET_KW_REL * abs(pin))


#  MEASURED, never typed.  case -> residual % at the moment of pinning.
#  Regenerate with `--seed`.  EVERY ENTRY IS A PLANT THAT DOES NOT CONSERVE
#  ENERGY -- this is a ledger of work owed, not a list of exemptions.
KNOWN_OPEN = {
    "tutorials/plant/ChemicalPlantTutorial": 3.1710,
    "tutorials/plant/esterification2sector": 170.9790,
    "tutorials/plant/hda": 4.2460,
    "tutorials/plant/polycaprolactonePlant": 20.0100,
    "tutorials/steady/distillation/column01_benzene_toluene": 24.6820,
    "tutorials/steady/distillation/column09_tray_hydraulics": 24.6820,
    "tutorials/steady/distillation/column10_flooding": 24.6820,
    "tutorials/steady/distillation/column11_murphree": 24.6570,
    "tutorials/steady/distillation/column16_declared_interior": 24.6820,
    "tutorials/steady/distillation/stripper01_sour_water": 10.3730,
    "tutorials/steady/distillation/stripper02_sour_water_h2s": 13.5730,
    "tutorials/steady/flowsheets/acetone03_luyben_reaction_section": 33.3080,
    "tutorials/steady/flowsheets/cavett01_recycle_train": 88.0220,
    "tutorials/steady/flowsheets/credo01_valve_heater_drum": 2.0940,
    "tutorials/steady/flowsheets/proxy01_gas_loop": 118.1200,
    "tutorials/steady/gibbs/gibbs07_wgs_cooled": 150.7280,
    "tutorials/steady/gibbs/gibbs08_wgs_cooled_reactiveflash": 150.7280,
    "tutorials/steady/gibbs/gibbs09_wgs_cooled_directmin": 150.6790,
    "tutorials/steady/heat/heatlink01_condenser_to_heater": 16.4510,
    "tutorials/steady/heat/phasechange01_partial_condenser": 142.5260,
    "tutorials/steady/optimisation/designSpec01_triple_equal_areas": 118.0420,
    "tutorials/steady/optimisation/optim01_column_reflux": 18.5010,
    "tutorials/steady/reactors/acetone02_luyben_reactor": 25.1790,
    "tutorials/steady/reactors/cstr07_lhhw_methylAcetate": 37.9820,
    "tutorials/steady/reactors/pfr_polyesterification": 18.3420,
    "tutorials/steady/rotating/pump01_water": 65.0000,
    "tutorials/steady/rotating/pump02_pressure_spec": 65.0000,
    "tutorials/steady/separation/tsa01_co2_twin_bed": 1.1120,
    "tutorials/steady/thermo/basis01_two_unit_chain": 7.4630,
    "tutorials/steady/thermo/perUnitThermo01_srk_nrtl": 128.8000,
}


#  MEASURED, never typed.  case -> SIGNED residual in kW at the moment of
#  pinning.  Regenerate with `--seed`.  The sign is kept because it says which
#  way the plant leaks and costs nothing to carry; the band and the ratchet
#  read the MAGNITUDE.  EVERY ENTRY IS A PLANT THAT DOES NOT CONSERVE ENERGY
#  AND THAT NOBODY HAS YET LOOKED AT -- a ledger of work owed, not exemptions.
KNOWN_OPEN_KW = {
    "tutorials/steady/absorption/absorber01_NH3_water": -27.9838,
    "tutorials/steady/absorption/acetone05_luyben_absorber": -40.5770,
    "tutorials/steady/absorption/extract02_declared_interior": -1.0263,
    "tutorials/steady/absorption/stripper01_NH3_water": 19.8710,
    "tutorials/steady/distillation/column04_multifeed_sidedraw": -78.6939,
    "tutorials/steady/distillation/column08_radfrac_multidraw": -891.9801,
    "tutorials/steady/distillation/shortcut01_benzene_toluene": -1.0804,
    "tutorials/steady/drying/solidDryer01_sugar": 372.6562,
    "tutorials/steady/drying/sprayDryer01_sugar": -2.6584,
    "tutorials/steady/drying/sprayDryer03_pressure_nozzle": -2.6584,
    "tutorials/steady/drying/sprayDryer04_profiles": -2.6584,
    "tutorials/steady/drying/sprayDryer05_whey": -18.3191,
    "tutorials/steady/drying/sprayDryer06_rea": -2.6584,
    "tutorials/steady/drying/sprayDryer07_design": -2.6584,
    "tutorials/steady/evaporation/evaporator02_triple_effect_sugar": -6162.5019,
    "tutorials/steady/evaporation/evaporator06_nacl_pitzer": -485.6942,
    "tutorials/steady/evaporation/evaporator07_nacl_enrtl": -485.9664,
    "tutorials/steady/evaporation/evaporator08_naoh_dilution_heat": -821.3462,
    "tutorials/steady/evaporation/evaporator09_nacl_sucrose_brine": -485.1832,
    "tutorials/steady/flash/flash20_ethanol_water_pcsaft": 42.8610,
    "tutorials/steady/heat/coolingTower01_merkel": -14.5302,
    "tutorials/steady/thermoTest/model2_pitzer_evaporator": -485.6942,
    "tutorials/steady/userops/userOp01_yield_reactor": -3.7126,
}


LINE = re.compile(r"globalEnergyBoundary[^\n]*?\|in-out\|/in\s*=\s*([0-9.]+)\s*%")
#  The no-scale shape of the SAME print statement.  Anchored on the engine's
#  own words rather than on "kW" alone, so it cannot match some other report
#  that happens to print a kW in parentheses.
LINE_KW = re.compile(r"globalEnergyBoundary[^\n]*?\(residual\s+"
                     r"(-?[0-9.]+(?:[eE][-+]?[0-9]+)?)\s*kW;\s*"
                     r"NO EXCHANGED-ENERGY SCALE")
#  The report ran and REFUSED: a boundary stream carries no enthalpy datum.
#  Two spellings, because a DECLARED reports block gets the hard refusal and
#  the default chain gets the UNAVAILABLE diagnostic (CLAUDE.md 2026-08-02).
REFUSED = re.compile(r"\[report\] globalEnergyBoundary -> REFUSED"
                     r"|\[report\] energyBalance UNAVAILABLE")
APP = re.compile(r"^\s*application\s+(\w+)\s*;", re.M)
RAN = re.compile(r"\[report\] globalEnergyBoundary ->")
ANNOUNCED = re.compile(r"\[reports\] this case declares reports \{[^}]*\}"
                       r" and an outer driver")
OUT_OF_SCOPE = object()


def steady_cases():
    """Cases whose controlDict DECLARES `application choupoSolve` -- read from
    the FIELD, never by grepping for the word (check_mass_closure paid for
    that: a batch case naming the steady binary in a COMMENT was swept in)."""
    for cd in sorted(ROOT.glob("tutorials/**/system/controlDict")):
        try:
            txt = cd.read_text(errors="ignore")
        except OSError:
            continue
        m = APP.search(txt)
        if m and m.group(1) == "choupoSolve":
            yield cd.parent.parent


def output(case: Path):
    txt = stdout_of(case)
    if txt is not None:
        return txt, True
    if SCOPED:
        return OUT_OF_SCOPE, False
    p = subprocess.run([str(ROOT / "choupoSolve"), str(case)],
                       capture_output=True, text=True, timeout=900)
    return p.stdout + p.stderr, p.returncode == 0


def whole_line(txt: str, at: int) -> str:
    """The full source line containing offset `at` -- so a refusal quotes the
    engine's own sentence rather than a fragment of it."""
    start = txt.rfind("\n", 0, at) + 1
    end = txt.find("\n", at)
    return txt[start:end if end != -1 else len(txt)].strip()


def judge_kW(rel: str, kW: float, measuredKW: dict, bad: list) -> int:
    """The kW arm: the same three verdicts the percentage arm gives, taken on
    the MAGNITUDE of an absolute residual, plus a fourth for a residual that
    changed SIGN without changing size.  Returns 1 when the case closes and is
    not pinned, so the caller can count it exactly as it counts the other arm.
    """
    measuredKW[rel] = kW
    pin = KNOWN_OPEN_KW.get(rel)
    a = abs(kW)

    if a <= BAND_KW:
        if pin is not None:
            bad.append(
                "%s now closes at %+.4f kW (within the %.1f kW band) but is "
                "still PINNED at %+.4f kW.  Remove it from KNOWN_OPEN_KW: a "
                "stale pin is a claim about the engine that stopped being "
                "true, and it hides the next regression on this case."
                % (rel, kW, BAND_KW, pin))
            return 0
        return 1

    if pin is None:
        bad.append(
            "%s: global first-law residual %+.4f kW at the plant boundary, "
            "outside the %.1f kW band, and NOT pinned.  This plant publishes "
            "NO exchanged-energy scale (it declares no duty and carries no "
            "boundary heat), so the engine reports the residual in kW and no "
            "percentage exists to compare -- the band here is an absolute "
            "convention, not a physical statement.  The plant does not "
            "conserve energy.  Read reports/balances/energyBalance_byUnit.csv "
            "-- it names the unit -- and either fix it or pin it here with "
            "`bin/curate/check_energy_closure.py --seed`, which measures the "
            "number instead of taking one on trust."
            % (rel, kW, BAND_KW))
    elif a > abs(pin) + ratchet_kW(pin):
        bad.append(
            "%s: first-law residual grew from the pinned %+.4f kW to %+.4f kW "
            "(> %.4f kW, the ratchet for a pin that size).  A declared debt "
            "may not grow quietly."
            % (rel, pin, kW, ratchet_kW(pin)))
    elif (kW < 0) != (pin < 0):
        bad.append(
            "%s: first-law residual CHANGED SIGN, from the pinned %+.4f kW to "
            "%+.4f kW.  The magnitude is within the ratchet, so the growth arm "
            "cannot see it, but the plant stopped leaking energy and started "
            "creating it (or the reverse).  That is a different defect from "
            "the one pinned: re-measure it with --seed and re-pin."
            % (rel, pin, kW))
    return 0


def main() -> int:
    seed = "--seed" in sys.argv
    bad, ok, unrun, noReport, announced, outOfScope, measured = \
        [], 0, [], [], [], [], {}
    okKW, refused, measuredKW, noReportOuter = 0, [], {}, 0
    #  Where each clean-running case in scope ENDED UP.  Without it a pin can
    #  name a case the gate never read and nothing notices -- see the
    #  unanswered-pin arm below, which sabotage S7 exists to prove.
    discovered, bucket = set(), {}

    for case in steady_cases():
        rel = case.relative_to(ROOT).as_posix()
        discovered.add(rel)
        txt, ranOk = output(case)
        if txt is OUT_OF_SCOPE:
            outOfScope.append(rel)
            continue
        if not ranOk:
            unrun.append(rel)
            continue
        m = LINE.search(txt)
        if m is None:
            mk = LINE_KW.search(txt)
            if mk is not None:
                bucket[rel] = "an ABSOLUTE kW residual"
                okKW += judge_kW(rel, float(mk.group(1)), measuredKW, bad)
            elif ANNOUNCED.search(txt):
                bucket[rel] = ("no report at all -- its declared chain did not "
                               "run under an outer driver")
                announced.append(rel)
            elif REFUSED.search(txt):
                bucket[rel] = ("a REFUSED energy balance -- a boundary stream "
                               "carries no enthalpy datum")
                #  The report RAN and refused: there are boundary streams, one
                #  of them has no enthalpy datum, so there is no residual to
                #  judge.  Its own bucket -- it used to sit in `noReport`,
                #  whose sentence claimed the opposite about it.
                refused.append(rel)
            elif RAN.search(txt):
                #  THE BUCKET AUDITS ITSELF.  `RAN` is the bare prefix of the
                #  engine's print, independent of every tail this gate parses,
                #  so a case reaching here published a globalEnergyBoundary
                #  line in a SHAPE THIS GATE DOES NOT READ.  That is exactly
                #  what happened between 2026-09-08 and 2026-09-12 and nothing
                #  said a word -- the cases dropped quietly into `noReport`
                #  and its sentence spoke for them.  It is a gate defect, not
                #  a case defect, and it fails as one.  (`RAN` was defined in
                #  this file from the day it was written and read by nothing:
                #  a probe nobody consults cannot catch anything.)
                bad.append(
                    "%s published a globalEnergyBoundary line this gate could "
                    "not parse, so it would have been filed as publishing "
                    "nothing.  THIS IS A DEFECT IN THE GATE, not in the case: "
                    "the engine printed a shape no reader here knows.  The "
                    "line was:\n      %s\n    Add the shape to LINE / LINE_KW "
                    "/ REFUSED in the same commit that taught the engine to "
                    "print it -- an unparsed shape is an unjudged plant."
                    % (rel, whole_line(txt, RAN.search(txt).start())))
            else:
                #  Not judged: this case printed no `globalEnergyBoundary`
                #  line of any shape and no refusal, so the engine published
                #  no global first law at all.  Counted, and the outerDict
                #  count beside it, so the claim states what the bucket holds
                #  instead of guessing why.
                bucket[rel] = ("no globalEnergyBoundary line of any shape "
                               "and no refusal")
                noReport.append(rel)
                if (case / "system" / "outerDict").is_file():
                    noReportOuter += 1
            continue

        pct = float(m.group(1))
        bucket[rel] = "a PERCENTAGE residual"
        measured[rel] = pct
        pin = KNOWN_OPEN.get(rel)
        if pct <= BAND:
            if pin is not None:
                bad.append(
                    "%s now closes at %.4f %% (within the %.1f %% band) but is "
                    "still PINNED at %.4f %%.  Remove it from KNOWN_OPEN: a "
                    "stale pin is a claim about the engine that stopped being "
                    "true, and it hides the next regression on this case."
                    % (rel, pct, BAND, pin))
            else:
                ok += 1
        elif pin is None:
            bad.append(
                "%s: global first-law residual %.4f %% of the boundary input, "
                "outside the %.1f %% band, and NOT pinned.  The plant does not "
                "conserve energy.  Read reports/balances/energyBalance_byUnit."
                "csv -- it names the unit -- and either fix it or pin it here "
                "with `bin/curate/check_energy_closure.py --seed`, which "
                "measures the number instead of taking one on trust."
                % (rel, pct, BAND))
        elif pct > pin + RATCHET:
            bad.append(
                "%s: first-law residual grew from the pinned %.4f %% to %.4f %% "
                "(> %.2f pp).  A declared debt may not grow quietly."
                % (rel, pin, pct, RATCHET))

    #  A PIN NOTHING ANSWERS TO.  Found by sabotage S7, which restored the
    #  one-shape reader this commit exists to replace and the gate PASSED: the
    #  72 no-scale cases fell back into `noReport` and the claim went on
    #  announcing 22 pinned plants that had not been read at all.  That is the
    #  `check_true_ions` shape -- a ledger describing subjects the gate never
    #  reaches, green forever.  So a pin whose case RAN CLEAN IN SCOPE and
    #  produced no reading of its own kind FAILS, naming where the case
    #  actually went.  Out-of-scope, non-zero-exit and (under a scoped run)
    #  undiscovered cases are NOT accused: the gate did not reach them, which
    #  is a different fact and one the claim already states.
    for ledger, pins, got, kind in (
            ("KNOWN_OPEN", KNOWN_OPEN, measured, "a PERCENTAGE residual"),
            ("KNOWN_OPEN_KW", KNOWN_OPEN_KW, measuredKW,
             "an ABSOLUTE kW residual")):
        for rel in sorted(pins):
            if rel in got or rel in outOfScope or rel in unrun:
                continue
            if rel in bucket:
                bad.append(
                    "%s is PINNED in %s, which is a claim that this run would "
                    "read %s from it -- and it did not: the case published %s. "
                    " Either the pin belongs in the other ledger, or the gate "
                    "stopped reading the channel the pin was measured on.  A "
                    "ledger entry no case answers to is a gate reporting on "
                    "subjects it never reached."
                    % (rel, ledger, kind, bucket[rel]))
            elif not SCOPED and rel not in discovered:
                bad.append(
                    "%s is PINNED in %s but is not a steady case in this tree "
                    "at all (no system/controlDict declaring choupoSolve).  "
                    "Remove the pin or restore the case: a pin that names "
                    "nothing is a debt nobody can pay."
                    % (rel, ledger))

    if seed:
        where = ("under CHOUPO_SUITE_SCOPE (--fast)" if SCOPED
                 else "over the full steady corpus")
        print("#  MEASURED %s.  Paste into KNOWN_OPEN after reading it." % where)
        print("KNOWN_OPEN = {")
        for rel in sorted(measured):
            if measured[rel] > BAND:
                print('    "%s": %.4f,' % (rel, measured[rel]))
        print("}")
        print()
        print("#  MEASURED %s.  Paste into KNOWN_OPEN_KW after reading it."
              % where)
        print("#  Cases whose plant publishes NO exchanged-energy scale: the "
              "residual is")
        print("#  absolute, in kW, SIGNED, and judged against BAND_KW.")
        print("KNOWN_OPEN_KW = {")
        for rel in sorted(measuredKW):
            if abs(measuredKW[rel]) > BAND_KW:
                print('    "%s": %.4f,' % (rel, measuredKW[rel]))
        print("}")
        return 0

    if not measured and not measuredKW:
        print("check_energy_closure: FAILED\n"
              + ("  no case IN SCOPE published a global first law in EITHER "
                 "shape -- neither a percentage nor an absolute kW residual.  "
                 "The scope is the caller's own case pass, so the fix is the "
                 "fast set: it must contain at least one steady case with an "
                 "energy boundary, or this tier checks no energy "
                 "conservation.\n"
                 if SCOPED else
                 "  no case published a global first law in EITHER shape -- "
                 "neither a percentage nor an absolute kW residual.  A gate "
                 "with no subject reports PASS forever -- fix the discovery, "
                 "do not retire the check.\n"))
        return 1

    if bad:
        print("check_energy_closure: FAILED")
        for b in bad:
            print("  " + b)
        return 1

    print("check_energy_closure: OK -- the engine's own globalEnergyBoundary "
          "report, read in BOTH of the shapes it prints and never recomputed "
          "here: %d steady case(s) close their plant-boundary FIRST LAW within "
          "%.1f %% of the energy the plant exchanges and %d more are PINNED in "
          "KNOWN_OPEN; %d close within %.1f kW ABSOLUTE -- the shape the "
          "engine prints when a plant declares no duty and carries no boundary "
          "heat, so it has no scale to divide by and no percentage exists -- "
          "and %d more are PINNED in KNOWN_OPEN_KW.  Both lists are ledgers of "
          "plants that do NOT conserve energy, not exemptions: none has grown "
          "past its ratchet (%.2f pp; in kW the larger of %.1f kW and %.1f %% "
          "of the pin), none has changed sign, and none has quietly started "
          "closing.  The kW band is a DECLARED CONVENTION with no physical "
          "basis -- there is no denominator for these cases -- chosen three "
          "orders above the 1e-3 kW floor bin/runTests uses to call a boundary "
          "residual a number at all.  Beside them: %d case(s) whose energy "
          "balance the engine REFUSED for want of an enthalpy datum on a "
          "boundary stream (no residual exists to judge), %d told ALOUD that "
          "their declared chain did not run under an outer driver, %d that "
          "printed no globalEnergyBoundary line of any shape and no refusal "
          "(%d of those declare a system/outerDict, whose report chain does "
          "not run), %d that exit non-zero and belong to the suite's exit-code "
          "check.  NOT CHECKED: whether a pinned residual is acceptable (it is "
          "not); PER-UNIT closure, where a plant can close globally with two "
          "units cancelling.%s"
          % (ok, BAND, len(KNOWN_OPEN), okKW, BAND_KW, len(KNOWN_OPEN_KW),
             RATCHET, RATCHET_KW_ABS, 100.0 * RATCHET_KW_REL,
             len(refused), len(announced), len(noReport), noReportOuter,
             len(unrun),
             scope_sentence(len(measured) + len(measuredKW) + len(refused)
                            + len(noReport) + len(announced),
                            len(outOfScope))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
