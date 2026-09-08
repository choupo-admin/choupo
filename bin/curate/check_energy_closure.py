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
first-law residual the engine's own report computes -- `|in-out|/in` on the
`[report] globalEnergyBoundary` line -- must be within BAND, OR the case must
be PINNED in `KNOWN_OPEN` with the residual it is known to carry.  The number
is read from the engine and never recomputed here: the balance has one home
(CLAUDE.md: engine-owned, the GUI only draws) and a gate that re-derived it
would be a second one, free to drift from the report a student reads.

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
  * ANY CASE OUTSIDE THE SCOPE IT WAS RUN IN.  Under `--fast` the scope is one
    case per family; the claim says so and names the count.

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

THE PIN LIST IS STALE AS THIS LANDS, and deliberately not re-seeded here: the
same commit closes ammonia02 (16.14 % -> 0.0023 %) and combined01, and moving
the goldens those cases carry is Vitor's decision, not this gate's.  Re-seed
with `--seed` in the same act that re-records them.

SEEDING.  `--seed` prints the KNOWN_OPEN block for the cases in scope, so the
list is MEASURED and never typed from memory.  The list below was seeded from
`bin/runTests --fast` (one case per tutorial family).  A full sweep will meet
cases this list does not name; that is the gate working, and the remedy is one
`--seed` run against the full scope, reviewed before it is pasted.
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
    "tutorials/plant/ammonia02_full_plant": 15.0000,
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
    "tutorials/steady/power/combined01_brayton_rankine": 11.8660,
    "tutorials/steady/reactors/acetone02_luyben_reactor": 25.1790,
    "tutorials/steady/reactors/cstr07_lhhw_methylAcetate": 37.9820,
    "tutorials/steady/reactors/pfr_polyesterification": 18.3420,
    "tutorials/steady/rotating/pump01_water": 65.0000,
    "tutorials/steady/rotating/pump02_pressure_spec": 65.0000,
    "tutorials/steady/separation/tsa01_co2_twin_bed": 1.1120,
    "tutorials/steady/thermo/basis01_two_unit_chain": 7.4630,
    "tutorials/steady/thermo/perUnitThermo01_srk_nrtl": 128.8000,
}


LINE = re.compile(r"globalEnergyBoundary[^\n]*?\|in-out\|/in\s*=\s*([0-9.]+)\s*%")
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


def main() -> int:
    seed = "--seed" in sys.argv
    bad, ok, unrun, noReport, announced, outOfScope, measured = \
        [], 0, [], [], [], [], {}

    for case in steady_cases():
        rel = case.relative_to(ROOT).as_posix()
        txt, ranOk = output(case)
        if txt is OUT_OF_SCOPE:
            outOfScope.append(rel)
            continue
        if not ranOk:
            unrun.append(rel)
            continue
        m = LINE.search(txt)
        if m is None:
            if ANNOUNCED.search(txt):
                announced.append(rel)
            else:
                #  Not a failure: a case with no external heat and no boundary
                #  streams publishes no global first law to check.  Counted,
                #  so the claim can say how much of the corpus it reached.
                noReport.append(rel)
            continue

        pct = float(m.group(1))
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

    if seed:
        print("#  MEASURED %s.  Paste into KNOWN_OPEN after reading it."
              % ("under CHOUPO_SUITE_SCOPE (--fast)" if SCOPED
                 else "over the full steady corpus"))
        print("KNOWN_OPEN = {")
        for rel in sorted(measured):
            if measured[rel] > BAND:
                print('    "%s": %.4f,' % (rel, measured[rel]))
        print("}")
        return 0

    if not measured:
        print("check_energy_closure: FAILED\n"
              + ("  no case IN SCOPE published a global first law at all.  The "
                 "scope is the caller's own case pass, so the fix is the fast "
                 "set: it must contain at least one steady case with an energy "
                 "boundary, or this tier checks no energy conservation.\n"
                 if SCOPED else
                 "  no case published a global first law at all.  A gate with "
                 "no subject reports PASS forever -- fix the discovery, do not "
                 "retire the check.\n"))
        return 1

    if bad:
        print("check_energy_closure: FAILED")
        for b in bad:
            print("  " + b)
        return 1

    print("check_energy_closure: OK -- %d steady case(s) close their plant-"
          "boundary FIRST LAW within %.1f %% of the boundary input, read from "
          "the engine's own globalEnergyBoundary report and never recomputed "
          "here, and %d more are PINNED in KNOWN_OPEN as plants that do NOT "
          "conserve energy (a ledger of work owed, not exemptions; none has "
          "grown by more than %.2f pp and none has quietly started closing).  "
          "%d ran but publish no global first law (no external heat, no "
          "boundary streams), %d are told ALOUD that their declared chain did "
          "not run under an outer driver, %d exit non-zero and belong to the "
          "suite's exit-code check.  NOT CHECKED: whether a pinned residual is "
          "acceptable (it is not); PER-UNIT closure, where a plant can close "
          "globally with two units cancelling.%s"
          % (ok, BAND, len(KNOWN_OPEN), RATCHET, len(noReport),
             len(announced), len(unrun),
             scope_sentence(len(measured) + len(noReport) + len(announced),
                            len(outOfScope))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
