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
the very number CLAUDE.md quotes when it states the rule.  (LATER THE SAME
DAY that -6162.5019 kW was diagnosed and fixed -- the case's chest steam
declared no phase, so the plant's whole energy input was priced as liquid
water; see `docs/design/the-word-that-was-not-there.md`.  It reads +134.1741
kW now and the worst entry in the kW ledger is `column08_radfrac_multidraw`
at -891.9801.  The paragraph above is the measurement that JUSTIFIED this
gate and is left as it was taken; read KNOWN_OPEN_KW for today's numbers.)  A gate built to
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
  * PER-UNIT closure IN GENERAL.  A plant can close globally with two units
    cancelling.  `energyBalance_byUnit.csv` localises it and ammonia02 is the
    proof that the localisation itself can be wrong.  ONE per-unit arm exists
    since 2026-09-27 (below): the units whose energy balance is H_out = H_in
    BY CONSTRUCTION -- an adiabatic sprayDryer/solidDryer/convectiveDryer, an
    evaporator (its heat crosses as its own chest/condensate streams; joined
    2026-10-05), a distillationColumn (its reboiler and condenser cross the
    boundary whatever its feed count; joined 2026-10-05, C35), a
    cstr/conversionReactor/gibbsReactor (since 2026-10-20, C112)/
    equilibriumReactor (since 2026-10-25, the C131 reactors review)
    that published Q_kW, and (2026-10-17, DEV.md 4c
    C74) a mixer at a DECLARED outlet temperature that published Q_kW, and
    (2026-10-24) an ADIABATIC mixer, whose outlet is the state of equal
    enthalpy resolved at its own equilibrium --
    must leave nothing unattributed.  Every other unit is judged only
    through the plant sum.
  * A MIXER (declared-T or, since 2026-10-24, adiabatic) WHOSE PUBLISHED
    STREAMS DO NOT CLOSE ITS MATERIAL.
    A mixer conserves moles exactly, so its published outlet F must equal
    the sum of its published inlets -- except where an inlet is a recycle
    TEAR: the report prices the tear as PUBLISHED after the final pass, the
    mixer consumed the value that pass started from, and the two differ by
    the recycle's own convergence gap (inside its declared `recycleTol`).
    aceticAcid02's M1 consumed coRecycle at 0.0227132153 kmol/s against a
    published 0.0227122898 (dF 9.255e-7 kmol/s, its recycleTol is 1e-6), so
    its row leaves -0.1025 kW = dF x h(coRecycle) and its MATERIAL row the
    same gap (100.0011 %).  That is the recycle's gap, not the mixer's
    surface, and no tolerance here may be widened to hide it.  So a
    declared-T mixer whose published sum of inlet F departs from its outlet
    F by more than MATERIAL_GAP_REL is NOT judged: it is COUNTED and NAMED
    on the claim line with its gap.  The test reads the material fact
    itself, never the tear list: hda's, acetonePlant's and
    polycaprolactonePlant's mixers are tear-fed too, their recycles close
    to 1e-9, and they ARE judged.

THE UNIT ARM, SABOTAGE-VERIFIED 2026-09-27 by hand on a SCOPED run (a cache
of seven cases: the flagship, sprayDryer01/05, solidDryer01, cstr07, cstr01,
acetone02), each sabotage restored with `cp` and `make all` after any src/
restore:

  U1  put the spray dryer back on the hand balance (publish the seed T_out
      instead of the root) -> "unit 'DRYING.SD' (sprayDryer) leaves -37.3116
      kW of its energy balance unattributed", and the same on sprayDryer01
      (+2.5965) and sprayDryer05 (+18.2299).
  U2  restore the pre-2026-09-27 SolidDryer.cpp whole -> solidDryer01 +6.8764
      kW, the flagship's DRYING.BD +0.4128 kW.  AND THE PLANT ARM ALONE WOULD
      HAVE CALLED IT AN IMPROVEMENT: with the old solid dryer the flagship
      reads 0.9900 % -- inside the 1 % band, `energy-T2:plant` GREEN -- because
      BD's error cancels part of the evaporators'.  Only this arm sees that
      the green would be a cancellation.
  U3  restore the pre-2026-09-27 CSTR.cpp (the blend) -> the Fermentor
      +36.9987 kW and cstr07 +0.7958 kW.
  U4  break the gate's own header pattern (`>>>  UNIT`) -> five "the unit arm
      did not READ its witness" failures: an arm that reads nothing does not
      pass.
  U6  (2026-10-05, C35: the distillationColumn joins the arm) restore the
      structural-only internal-exchanger test in EnergyBalanceReport.cpp
      (`isProcessToProcessExchanger(u.type)` -> `true`) -> "unit
      'radfracLite' (distillationColumn) leaves +78.6939 kW" and "unit
      'radfrac' ... +891.9801 kW", and the plant arm re-fails both cases as
      unpinned (-78.6939 / -891.9801 kW); column01 (single feed) passes.
      Restored with git + `make all`.
  U7  (2026-10-17, DEV.md 4c C74: the declared-T mixer joins the arm) drop
      the duty publication -- run as the origin/main build of the same
      tree, which publishes none -> "the unit arm did not READ its witness"
      for hda's Mixer, acetonePlant's M1 and M2 and polycaprolactonePlant's
      Mixer; the plant arm re-fails aceticAcid02_plant (1.3610 %, unpinned
      once its pin is out) and polycaprolactonePlant (grew from the pinned
      15.3450 % to 20.0100 %).  hda (0.825 %) is inside the band: only the
      unit arm sees it.
  U8  price the outlet on another surface (`F_out * H_stream_formation(T,
      P, vf, z)` -- the quality blend at the dominant label -- instead of
      `flashState::priceState`) -> "unit 'Mixer' (mixer) leaves -1360.0039
      kW" on hda and "+4.1803 kW" on polycaprolactonePlant, and the plant
      arm re-fails hda (3.1520 %), polycaprolactonePlant (22.9680 %) and
      aceticAcid02_plant (14.5060 %; its M1 is not judged by this arm -- see
      the material-gap blind spot -- so the plant arm is what sees it there).
      acetonePlant's M1 and M2 are NOT caught: their outlets resolve single
      phase, where the blend IS the resolved price -- a sabotage that changes
      no number there proves nothing there.  Restored from the saved file
      (md5-identical) + one `make all`.
  U9  (2026-10-20, DEV.md 4c C112 point 6: the isothermal gibbsReactor
      joins the arm) three by-hand sabotages on a SCOPED cache, each
      restored md5-identical + `make all`:
        S1  price the feed as a VAPOUR again in `feedEnthalpy_W` -> "unit
            'wgs' (gibbsReactor) leaves +6.6942 kW" on gibbs07, gibbs08 and
            gibbs09, and the plant arm re-fails all three as unpinned
            (150.69 %, 150.69 %, 150.68 %).
        S2  price the OUTLETS on the carried label (`H_stream_formation(T,
            P, vf, z)`) instead of `pricedOrAsPublished` -> "leaves -0.0031
            kW" on gibbs07/08 and -0.0002 kW on gibbs09: the report's
            re-flash of a gas leaving exactly at its dew point.  The plant
            arm does NOT see it (0.14 % of 2.25 kW, inside the band); only
            this arm does.
        S3  price the isothermal feed at the REACTOR's pressure instead of
            its own -> "unit 'Converter' (gibbsReactor) leaves -7.2393 kW"
            on greenAmmoniaPEQ_baseCase (SRK, feed 150.93 bar, reactor 150
            bar).  The plant arm does not see it (0.011 %).  gibbs07 is
            untouched by S3 (its feed and reactor share 1 bar) -- a
            sabotage that changes no number there proves nothing there.
  U10 (2026-10-24, the ADIABATIC mixer joins the arm) the published-surface
      balance disabled (the dominant-phase rung forced on every adiabatic
      mixer, rebuilt) on a SCOPED run of cavett01 and ammonia03 -> "unit
      'mixer' (mixer) leaves -6.6844 kW", "'quench1Mix' ... +0.5741 kW" and
      "'quench2Mix' ... +3.3711 kW" on ammonia03; cavett01 does not even
      run (its two-phase inlets, now read as they mean, give the old
      dominant-phase Newton no root -- the failure the 2026-10-04 stated
      default existed to avoid).  Restored from the saved file + `make all`.
  U5  (2026-10-05, the evaporator joins the arm) restore the evaporator's
      Watson duty -> "unit 'CONCENTRATION.Evap1' (evaporator) leaves -21.0456
      kW", Evap2 -10.3209, evaporator02's effect1/2/3 -152.9702 / -62.7408 /
      -46.5438, evaporator06/07/09 and model2 -16.1038, evaporator08
      -26.8397 kW; the plant arm then re-fails on the eight pins this commit
      removed (the flagship 2.9810 %).  Restored byte-identical (md5) +
      `make all`.
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
    is why `userOp01_yield_reactor` (+2.1701 kW) is in KNOWN_OPEN_KW although
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

THE RATCHET IS TWO-SIDED (2026-09-12), AND THE ARGUMENT IS NOT A POLICY --
IT IS THAT THIS GATE ALREADY HELD THE RULE AND APPLIED IT ONLY IN THE LIMIT.
The stale-pin arm fails a pinned case the moment its residual reaches the
band: a debt that shrank all the way to nothing must be re-measured, and
saying so was never controversial.  But the growth arm was one-directional,
so a debt that shrank PART of the way passed in silence.  The two together
gave the gate a discontinuous rule -- a case falling from 1.2 % to 0.9 %
FAILED while one falling from 118 % to 52 % did not -- and that is not a
judgement anybody took, it is the shape two arms happened to leave between
them.  A pin is a MEASUREMENT, and a measurement that moved in either
direction is a claim about the engine that stopped being true.  So the shrink
arm now fails with the same words as the growth arm and a different reason
attached: this is GOOD NEWS, re-measure and re-pin.  The band arm is its
limiting case, and the rule is continuous again.

The second reason is not sentiment about ledger hygiene.  A pin left high
after the engine improved is HEADROOM: a later regression can climb all the
way back to the stale number without any arm seeing it.  Silence about an
improvement buys silence about the regression that undoes it.

MEASURED THE SAME DAY, over the full steady corpus: exactly ONE pin had
drifted, and it had drifted DOWNWARD -- `proxy01_gas_loop`, pinned at
118.1200 % and measuring 51.9550 %.  It is re-pinned here at the measured
value.  Every other entry in both ledgers reproduced its pin, which is what
makes this arm safe to arm today rather than a corpus-wide re-pinning.

WHAT THIS GATE STILL CANNOT DO, and it is the next slice rather than a
blind spot to leave unnamed: it cannot rank its own ledger.  The percentage
arm judges a ratio whose DENOMINATOR is the plant's own exchanged energy, so
`pump01_water` at 65.0000 % (a residual of order 1 kW -- the unit alarm on
that case reads dH = 0.700 kW against declared items 2.000 kW) sorts above
`column01_benzene_toluene` at 24.6820 %, which CLAUDE.md records as 631.96 kW.
A reader of this ledger cannot tell a defect that matters from one that does
not.  The remedy is in the ENGINE, not here -- the boundary report's console
line prints the ratio without its scale -- and a gate that recomputed the kW
for itself would be the second home the balance was taken out of on
2026-09-05.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from suite_cache import SCOPED, scope_sentence, stdout_of, no_subject   # noqa: E402

ROOT = Path(__file__).resolve().parents[2]

#  Per cent of the boundary input.  Chosen as the loosest number that is still
#  a physical statement about a plant: a recycle tear converges to a declared
#  tolerance, so a real case closes to a residual and not to zero.  It is NOT
#  derived from anything, and it is deliberately the same order as the mass
#  gate's 0.5 % rather than a looser one chosen to make the corpus pass.
BAND = 1.0

#  How far a PINNED residual may MOVE -- in EITHER direction -- before the pin
#  stops describing the engine, in percentage points.  Small: a pin records a
#  measurement, and a measurement that moves is either a fix or a new defect,
#  both of which want a human.
RATCHET = 0.2

#  ABSOLUTE kW, for the cases the engine can give no percentage.  A DECLARED
#  CONVENTION with no physical basis -- see the docstring.  Its one defence is
#  that it is three orders above the 1e-3 kW floor `bin/runTests` uses to
#  decide a `boundary residual_kW` row is a number and not round-off.
BAND_KW = 1.0

#  The kW ratchet, in TWO parts, because one number cannot serve a list
#  spanning 1.03 kW to 891.98 kW -- a flat 0.2 kW is 19.5 % of the smallest
#  pin and 0.022 % of the largest.  (The span was 1.03 to 6162.50 kW until
#  2026-09-12, when the evaporator family's chest steam stopped being priced
#  as liquid water: evaporator02 went from -6162.5019 to +134.1741 kW and the
#  five single-effect cases from ~-485/-821 to ~+18.  The two-part shape is
#  unchanged and so are both constants -- the ARGUMENT for them is the parity
#  with the percentage arm below, not the width of the list.)  MEASURED against the arm that already
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
#  NINE ENTRIES LEFT THIS LIST ON 2026-09-12 AND THAT IS THE POINT OF IT.
#  column01/09/10/11/16, stripper01/02, heatlink01 and optim01 were all one
#  family -- the feed's thermal state had a second home in `operation.feedQuality`
#  and the column's duty priced states its own streams did not carry.  They now
#  close at 0.0000 %.  The debt is PAID, not waived; the record is
#  docs/design/the-state-a-unit-computes-with.md.
#  RE-MEASURED 2026-10-03 (`--seed`), after the flowsheet started resolving
#  every UNPINNED domain inlet at its own (T, P, z) before the report reads
#  it (docs/design/a-stream-is-fixed-by-two-variables.md).  The report had
#  priced such an inlet on the carried default -- vf = 0, liquid -- which
#  DEV.md section 5 names as V2 and which this closes for the
#  SURFACE and the report.  Seven pins moved and every one is the same
#  mechanism, the first law now priced on the inlet the case has rather than
#  the liquid the default supplied:
#    tsa01_co2_twin_bed            1.1120 %  -> closes (0.0000 %)   LEFT
#    perUnitThermo01_srk_nrtl    128.8000 %  -> closes (0.1210 %)   LEFT
#    acetone05_luyben_absorber   -40.5770 kW -> +3.1179 kW          re-pinned
#    coolingTower01_merkel       -14.5302 kW -> +1.5666 kW          re-pinned
#    userOp01_yield_reactor       -3.7126 kW -> +2.1701 kW          re-pinned
#  (userOp01 is a `code/` case: measured from the suite's cached run, which a
#  standalone `--seed` cannot reproduce -- see the blind spot above).  A
#  first draft listed esterification2sector here, 170.979 % -> 44.927 %, and
#  it was WRONG: the pass re-resolved the plant's bare product LABEL `vapor`
#  in the global ideal world, so the NRTL flash's vapour was priced as a
#  liquid, ~596 kW low.  Labels now take their source's answer and the pin
#  stands at 170.979 % unmoved -- a residual that shrinks is not a fix until
#  the mechanism that shrank it is named.
#  and TWO JOINED, each a column with `model simultaneous;` whose feed
#  declares no phase and whose own (T, P) equilibrium is NOT the saturated
#  liquid its `feedQuality 1.0` says: the report now prices the resolved feed
#  while the column still prices the declared liquid (its resolver returns
#  the CARRIED vf for a converged single-phase answer -- the "unmistakable is
#  not a channel the engine reads" shape, CLAUDE.md section 6), so the
#  latent heat of the feed is the whole residual.  They closed at 0.0000 %
#  before ONLY because both sides read the same default; the gap is real
#  and was invisible:
#    acetone07_luyben_column_C2  (was 0.0000 %) -> 196.7990 %       JOINED
#    column03_azeotrope_mesh     (was 0.0000 %) ->  60.8760 %       JOINED
#  Both are the column03 entry of DEV.md section 5 ("NOT YET DECIDED:
#  whether the case's feed T moves to its true bubble point ... or the case
#  is re-specified"), and the fix that makes the column read the resolved
#  single-phase answer makes both cases REFUSE their `feedQuality` -- a
#  pedagogical decision about each case that is Vitor's, so they are PINNED
#  here as measured and not fixed.
#  BOTH LEFT on 2026-10-05 (DEV.md D1, decided by Vitor in C35): the column
#  now reads a single-phase feed by its own equilibrium, both cases refused
#  their `feedQuality 1.0`, and each was corrected to declare the saturated
#  liquid it was designed around (`phase liquid;` at the feed's bubble point
#  under the case's own model, the `feedQuality` key deleted).  Measured on
#  the corrected cases, read off the engine's report:
#    acetone07_luyben_column_C2  196.7990 % -> 0.0000 % (residual 0 kW)  LEFT
#    column03_azeotrope_mesh      60.8760 % -> 0.0000 % (residual 0 kW)  LEFT
#  ONE JOINED 2026-10-14 (DEV.md 4c C71), a NEW case, measured with `--seed`
#  on its first golden and NOT diagnosed: aceticAcid02_plant at 1.3610 %
#  (-79.9842 kW).  Its energyBalance_byUnit.csv puts the remainder at M1
#  (+82.7738 kW, a mixer at a DECLARED T) and the reactor (-2.7901 kW).
#  ONE LEFT AND ONE RE-MEASURED ON 2026-10-17 (DEV.md 4c C74): the
#  declared-T mixer now publishes the duty its temperature implies.
#    aceticAcid02_plant      1.3610 % -> 0.049 % (+2.8922 kW: the reactor's
#                            -2.7901 kW and M1's tear gap -0.1025 kW)  LEFT
#    polycaprolactonePlant  20.0100 % -> 15.3450 % (-10.6095 -> -8.4650 kW;
#                            its Mixer's +2.1445 kW paid)          RE-PINNED
#  hda (0.825 % -> 0.000 %) and acetonePlant (0.146 % -> 0.249 %: its M1 and
#  M2 had been cancelling part of the absorber's -11.2496 kW, which is now
#  the whole of its residual) were never pinned.
#  TWO LEFT ON 2026-10-17, when C73 and C74 were merged together (re-measured
#  with `--seed` over the full steady corpus on the combination): the pfr's
#  single-reaction duty is priced on the published outlet, which now means
#  its own equilibrium (DEV.md 4c C73) -- the polyester melt leaves part
#  vapour, and the old xi*dH_rxn on the feed's liquid rung paid no latent heat.
#    pfr_polyesterification  18.3420 % -> 0.0000 % (-9.3303 -> 0 kW)    LEFT
#    polycaprolactonePlant   15.3450 % -> 0.0000 % (-8.4650 kW was its
#                            Reactor's latent heat, C73; its Mixer's
#                            +2.1445 kW had been paid by C74)           LEFT
#  (userOp01_yield_reactor stays in KNOWN_OPEN_KW below: a `code/` case the
#  standalone `--seed` cannot run -- the blind spot above.)
#  THREE LEFT ON 2026-10-20 (DEV.md 4c C112 point 6): the isothermal
#  gibbsReactor priced its feed as a VAPOUR whatever the stream was, and the
#  three cooled-WGS witnesses feed 1 CO : 3 steam at 350 K and 1 bar, which
#  the report resolves at vf = 0.4315 -- the residual was exactly the latent
#  heat of the feed's 0.5685 kmol/h of liquid water.  Both ends of the duty
#  go through `flashState::priceState` now; measured after, all three close
#  at 0.0000 kW and the unit arm judges their reactor.
#    gibbs07_wgs_cooled                  150.7280 % -> 0.0000 %   LEFT
#    gibbs08_wgs_cooled_reactiveflash    150.7280 % -> 0.0000 %   LEFT
#    gibbs09_wgs_cooled_directmin        150.6790 % -> 0.0000 %   LEFT
#  ONE LEFT ON 2026-10-24 (the delegated decision of 2026-10-21, DEV.md 4c
#  (b)): the ADIABATIC mixer solved its balance on one dominant phase and
#  published that label, while the report resolves and prices the same
#  streams at their own equilibrium.  cavett01's M2 and M3 published
#  liquids at 337.93 and 336.42 K that resolve two-phase, and carried
#  +352 666.2 and +196 652.9 kW -- the whole of the plant's residual.  The
#  mixer's outlet is now the state of equal enthalpy RESOLVED at its own
#  equilibrium (269.67 K, V/F 0.7788; 273.62 K, V/F 0.6169).
#    cavett01_recycle_train  88.0220 % -> 0.0000 % (+0.0019 kW)   LEFT
KNOWN_OPEN = {
    "tutorials/plant/esterification2sector": 170.9790,
    "tutorials/steady/flowsheets/proxy01_gas_loop": 51.9550,
    "tutorials/steady/rotating/pump01_water": 65.0000,
    "tutorials/steady/rotating/pump02_pressure_spec": 65.0000,
    "tutorials/steady/thermo/basis01_two_unit_chain": 7.4630,
}


#  MEASURED, never typed.  case -> SIGNED residual in kW at the moment of
#  pinning.  Regenerate with `--seed`.  The sign is kept because it says which
#  way the plant leaks and costs nothing to carry; the band and the ratchet
#  read the MAGNITUDE.  EVERY ENTRY IS A PLANT THAT DOES NOT CONSERVE ENERGY
#  AND THAT NOBODY HAS YET LOOKED AT -- a ledger of work owed, not exemptions.
#  SEVEN ENTRIES LEFT IT ON 2026-09-27 (sprayDryer01/03/04/05/06/07 and
#  solidDryer01), with cstr07 from KNOWN_OPEN and the flagship re-measured
#  3.1710 -> 1.0300: the dryers and the CSTR priced their energy balance on a
#  surface their streams are not priced on (and solidDryer01's hot air
#  declared no phase).  PAID, not waived: docs/design/three-units-and-the-
#  flagship-first-law.md.
#  TWO ENTRIES LEFT IT ON 2026-10-05 (DEV.md 4c C35, 4d D1):
#  column04_multifeed_sidedraw (-78.6939 kW) and column08_radfrac_multidraw
#  (-891.9801 kW) were each exactly -(Q_reboiler + Q_condenser), because the
#  report filed a multi-feed column as an internal heat exchanger by its port
#  count and dropped both duties.  Internal-exchanger status is read off the
#  unit type now; both close at 0.0000 kW.  PAID, not waived.
#  ONE ENTRY LEFT IT ON 2026-10-11 (DEV.md 4c C65 item d), and one left
#  KNOWN_OPEN: letdown01_ammonia_flashing (+38.6639 kW, joined by C64 the same
#  day) and credo01_valve_heater_drum (2.0940 %, -5.4445 kW).  The `valve`
#  balanced H_out = H_in on its OWN surface (Hliquid/Hvapour at a Tref -- a
#  Watson latent heat and an ideal-gas vapour with no pressure term) while the
#  report priced the same streams on the formation surface with SRK; it now
#  prices both ends through `flashState::priceState`.  Measured after:
#  letdown01 +0.0001 kW (the two drums' -6.2e-5 and -1.5e-5 kW), credo01
#  -0.0000 kW (0.000 %).  PAID, not waived; the valve joined the unit arm.
#  ONE MORE LEFT 2026-10-21 (DEV.md 4c C123, finding 4):
#  extract02_declared_interior (-1.0263 kW) closes at +0.0001 kW, and
#  extract01 (-0.8814 kW, just inside the band) at -0.0001 kW.  An isothermal
#  extractor with no excess-enthalpy model has H(out) = H(in) once its material
#  closes, so the residual was the cascade's 1e-4 tolerated mass imbalance
#  priced at the formation datum; the cascade now closes to 1e-8.  PAID.
KNOWN_OPEN_KW = {
    "tutorials/steady/absorption/absorber01_NH3_water": -27.9838,
    "tutorials/steady/absorption/acetone05_luyben_absorber": 3.1179,
    "tutorials/steady/absorption/stripper01_NH3_water": 19.8710,
    "tutorials/steady/distillation/shortcut01_benzene_toluene": -1.0804,
    "tutorials/steady/flash/flash20_ethanol_water_pcsaft": 42.8610,
    "tutorials/steady/heat/coolingTower01_merkel": 1.5666,
    "tutorials/steady/userops/userOp01_yield_reactor": 2.1701,
}


#  ---- THE UNIT ARM (2026-09-27): a unit whose energy balance is H_out = H_in
#  (plus a duty it publishes) must close ON THE REPORT'S OWN SURFACE -------------
#
#  The plant-boundary residual is the SUM of the per-unit remainders, so a
#  plant can be red because one unit computes its energy balance on a surface
#  its streams are not priced on -- the family CLAUDE.md 6 names, THE STATE A
#  UNIT COMPUTES WITH IS NOT THE STATE ITS STREAMS CARRY.  On 2026-09-27 the
#  flagship's +34.4126 kW was three such units: the spray dryer (-70.8516 kW,
#  a constant-Cp air balance and a Watson latent heat), the solid dryer
#  (+10.2352 kW, the same plus a temperature floor that evaporated water no
#  heat paid for) and the fermentor's CSTR (+36.9987 kW, a quality blend at
#  the overall z where the report resolves a CO2 split).  All three now price
#  through `flashState::priceState`, the call the report's own rule is, so for
#  them the report's `remaining_kW` is ZERO BY CONSTRUCTION -- and that is a
#  claim this arm can check on every case that runs one, where the global arm
#  above can only see the sum.
#
#    * ADIABATIC: an adiabatic dryer declares no energy item, so the report's
#      remainder for it IS the enthalpy change across its streams, and it
#      must be zero;
#    * DUTY IS dH: a reactor whose published `Q_kW` is H_out - H_in on the
#      streams it publishes must leave nothing unattributed.  Only a unit that
#      PUBLISHED a `Q_kW` is judged: one with a species lacking an enthalpy
#      route publishes no duty (ConversionReactor's `haveDuty`), declares no
#      item, and its row is the implied duty, not a disagreement.
#
#  Precision: the report prints kW to four decimals, so a remainder below
#  UNIT_TOL_KW is zero to the report's own precision; the units solve their
#  balances to a microwatt.
#  `convectiveDryer` joined 2026-10-05 (DEV.md C26): it balances on the
#  package's formation surface by construction (2026-09-29), a claim its own
#  gate held only at PLANT level until then.
#  `evaporator` joined 2026-10-05 (DEV.md 4c C35 item 3, Vitor's ruling: the
#  duty's latent heat is the enthalpy difference the report prices, not the
#  Watson correlation).  Its heat crosses as MATERIAL -- chest steam in,
#  condensate out, both its own streams -- so it declares no energy item and
#  the report's remainder for it IS the enthalpy change across its five
#  streams.  It used to leave +17.6 ... +18.4 kW there on every single-effect
#  brine case and -89.1 / -16.3 / -28.8 kW on the triple effect's three
#  effects; the flagship's Evap1 + Evap2 (-10.4180 - 0.3773 kW) were the
#  whole of what kept `energy-T2:plant` red.  A no-datum evaporator (its feed
#  or chest carries a component with no enthalpy datum) publishes no closure
#  row, because the report is UNAVAILABLE for it -- `noLedger`, never judged.
#  `distillationColumn` joined 2026-10-05 (DEV.md 4c C35 / 4d D1): its
#  reboiler and condenser are heat that crosses the boundary, never heat
#  passed between its own streams, and its `Q_reboiler_kW` closes the column's
#  own balance by construction (a plug on the condenser), so the report's
#  remainder for it must be zero.  It was not on a MULTI-FEED column: the
#  report filed any unit with >= 2 process inlets and >= 2 outlets as an
#  internal exchanger and dropped both duties, so column04's row left
#  -(Q_reboiler + Q_condenser) = -78.6939 kW and column08's -891.9801 kW --
#  the whole of each plant's residual.  Internal-exchanger status is now
#  read off the unit TYPE (`reporting::isProcessToProcessExchanger`).
UNIT_BOUNDARY_DUTY = {"distillationColumn"}
UNIT_ADIABATIC = {"sprayDryer", "solidDryer", "convectiveDryer"}
UNIT_MATERIAL_HEAT = {"evaporator"}
#  `gibbsReactor` joined 2026-10-20 (DEV.md 4c C112 point 6): its ISOTHERMAL
#  mode publishes Q_kW = H_out - H_in, and it priced the inlet as a VAPOUR
#  whatever the feed was, while the report resolves an unpinned feed at its
#  own (T, P, z).  gibbs07/08/09 (1 CO : 3 steam at 350 K and 1 bar, 57 % of
#  the water liquid at its own equilibrium) each left +6.69 kW there -- the
#  latent heat of the feed's liquid, ~150.7 % of each plant's exchanged
#  energy and the whole of each plant's residual.  Both ends go through
#  `flashState::priceState` now (`GibbsReactor::feedEnthalpy_W`).  Its
#  ADIABATIC mode publishes no Q_kW and is not judged here.
#  `equilibriumReactor` joined 2026-10-25 (C131 reactors review, W6): its
#  Q_kW was SUM_j xi_j dH_rxn_j(T) on the ideal-gas rung -- the heat of
#  reaction ALONE -- so a feed entering at another temperature left its
#  sensible heat unattributed (equil01 fed at 700 K: 59.64 kW declared,
#  80.43 kW by the report) and a cubic EoS its departure function (N2 + 3 H2
#  at 200 bar, SRK: 102.78 %).  It publishes H_out - H_in through
#  `flashState::priceState` now; every corpus golden holds (equil01's
#  Q_kW is unchanged to 12 figures: its feed is at the reactor's T).
UNIT_DUTY_IS_DH = {"cstr", "conversionReactor", "gibbsReactor",
                   "equilibriumReactor"}
#  `valve` joined 2026-10-11 (DEV.md 4c C65 item d): a throttle declares no
#  heat and no work, so the report's remainder for it IS the enthalpy change
#  across its own two streams -- and it must be zero now that it prices both
#  ends through `flashState::priceState`.  It was not: letdown01's ValveLP
#  left -39.5039 kW and credo01's V1 +5.4445 kW, each the Watson latent heat
#  and the ideal-gas vapour of the unit's own surface against the report's.
UNIT_THROTTLE = {"valve"}
#  `mixer` joined 2026-10-17 (DEV.md 4c C74): a mixer at a DECLARED outlet
#  temperature (`operation { T ...; }`) is a mixer and a heater in one box,
#  and it publishes the duty that temperature implies as Q_kW = H(outlet) -
#  SUM H(inlets), every term through `flashState::priceState` -- so nothing
#  may remain unattributed.  Until then it published NO duty: aceticAcid02's
#  M1 left +82.7738 kW, hda's Mixer +341.7016 kW (that plant's whole
#  -341.9073 kW residual), acetonePlant's M1/M2 -5.9308/+10.6069 kW and
#  polycaprolactonePlant's Mixer +2.1445 kW.  An ADIABATIC mixer publishes no
#  Q_kW and is not judged here; a declared-T mixer whose duty is UNAVAILABLE
#  (a merged stream with no enthalpy datum: ed07's ions, unsteady04's BSA)
#  publishes none either.  A declared-T mixer fed by a recycle TEAR is
#  counted and named, not judged (see the docstring: the report prices the
#  published tear, the unit consumed the one the final pass started from).
#  The ADIABATIC mixer joined 2026-10-24 (the delegated decision of
#  2026-10-21, DEV.md 4c (b)): it publishes no Q_kW, declares no energy
#  item, and its outlet is the state of equal enthalpy resolved at its own
#  equilibrium and priced through `flashState::priceState`, so the report's
#  remainder for it is zero by construction.  Until then it balanced on one
#  dominant phase: cavett01's M2/M3 left +352 666 / +196 653 kW,
#  ammonia03's three mixers -6.68 / +0.57 / +3.37 kW.  Tear-fed ones are
#  counted and named exactly as the declared-T ones are.
UNIT_DECLARED_T = {"mixer"}
UNIT_TOL_KW = 1.0e-4
#  The relative material gap above which a declared-T mixer's row is taken to
#  carry its recycle's convergence gap (see the docstring).  A gate
#  CONVENTION: measured 2026-10-17, the judged witnesses sit at <= 3.2e-9
#  (the JSON prints F to 12 figures) and the two unjudged at 3.5e-7
#  (membrane18's MIX, Newton recycle) and 1.2e-5 (aceticAcid02's M1).
MATERIAL_GAP_REL = 1.0e-7
#  WITNESSES the arm must READ whenever their case is in scope, so it cannot
#  go green by reading nothing (the check_true_ions shape): the flagship's two
#  dryers and fermentor, and one standalone case of each dryer type.
UNIT_WITNESSES = {
    ("tutorials/plant/ChemicalPlantTutorial", "DRYING.SD"),
    ("tutorials/plant/ChemicalPlantTutorial", "DRYING.BD"),
    ("tutorials/plant/ChemicalPlantTutorial", "FERMENTATION.Fermentor"),
    ("tutorials/steady/drying/sprayDryer01_sugar", "dryer"),
    ("tutorials/steady/drying/solidDryer01_sugar", "solidDryer"),
    #  The solid dryer SATURATION-bound (C37 item 3): its evaporation stops
    #  where the exhaust saturates, a branch of its own in the unit.
    ("tutorials/steady/drying/solidDryer02_starved_air", "solidDryer"),
    ("tutorials/steady/drying/convDryer01_sugar_curve", "co"),
    ("tutorials/steady/drying/convDryer01_sugar_curve", "counter"),
    #  The evaporator: the flagship's two effects, a single-effect brine on
    #  a Pitzer package (its liquor carries L_phi on the liquid surface) and
    #  the triple effect, whose chests 2 and 3 are the previous effects'
    #  PRODUCED vapour.
    ("tutorials/plant/ChemicalPlantTutorial", "CONCENTRATION.Evap1"),
    ("tutorials/plant/ChemicalPlantTutorial", "CONCENTRATION.Evap2"),
    ("tutorials/steady/evaporation/evaporator06_nacl_pitzer", "evap"),
    ("tutorials/steady/evaporation/evaporator02_triple_effect_sugar", "effect1"),
    ("tutorials/steady/evaporation/evaporator02_triple_effect_sugar", "effect2"),
    ("tutorials/steady/evaporation/evaporator02_triple_effect_sugar", "effect3"),
    #  The column: the two MULTI-FEED cases whose duties the report dropped
    #  as an "internal exchanger" (C35), and one single-feed column.
    ("tutorials/steady/distillation/column04_multifeed_sidedraw", "radfracLite"),
    ("tutorials/steady/distillation/column08_radfrac_multidraw", "radfrac"),
    ("tutorials/steady/distillation/column01_benzene_toluene", "column01"),
    #  The valve: a liquid that hardly flashes (dissolved gas only), a liquid
    #  that flashes across its vapour pressure, a gas throttled on SRK (its
    #  Joule-Thomson cooling), a benzene-toluene liquid flashing on an ideal
    #  package, and an undeclared vapour inlet.
    ("tutorials/steady/hydraulics/letdown01_ammonia_flashing", "ValveHP"),
    ("tutorials/steady/hydraulics/letdown01_ammonia_flashing", "ValveLP"),
    ("tutorials/steady/hydraulics/letdown01_ammonia_flashing", "PurgeValve"),
    ("tutorials/steady/flowsheets/credo01_valve_heater_drum", "V1"),
    ("tutorials/steady/flowsheets/inletState01_undeclared_vapour", "V1"),
    #  The declared-T mixer (C74): a gas+liquid merge whose furnace is lumped
    #  downstream (hda), two in one plant -- one cooling, one heating
    #  (acetonePlant) -- and a liquid merge on a two-phase feed
    #  (polycaprolactonePlant).  All four are fed by a recycle tear whose
    #  published material closes the mixer to 1e-9, so they are judged.
    ("tutorials/plant/hda", "Mixer"),
    ("tutorials/plant/acetonePlant", "M1"),
    ("tutorials/plant/acetonePlant", "M2"),
    ("tutorials/plant/polycaprolactonePlant", "Mixer"),
    #  The ADIABATIC mixer (2026-10-24): cavett01's two mixers, which carried
    #  the plant's whole 88 % residual and now publish a two-phase outlet;
    #  column12's `recombine`, the stage's own two phases put back together
    #  (V/F 0.5, the case's identity); ammonia03's two quench mixers (gas at
    #  680 K) and inletState01's undeclared vapours.
    ("tutorials/steady/flowsheets/cavett01_recycle_train", "M2"),
    ("tutorials/steady/flowsheets/cavett01_recycle_train", "M3"),
    ("tutorials/steady/distillation/column12_stage_is_a_flash", "recombine"),
    ("tutorials/plant/ammonia03_quench_converter", "quench1Mix"),
    ("tutorials/plant/ammonia03_quench_converter", "quench2Mix"),
    ("tutorials/steady/flowsheets/inletState01_undeclared_vapour", "M1"),
    #  The isothermal gibbsReactor (C112 point 6): a two-phase AUTHORED feed
    #  (the condensing WGS reactor, by each of its three methods) and a
    #  produced feed at a pressure above the reactor's on SRK (the green
    #  ammonia Converter, whose -7.24 kW was the departure function between
    #  the feed's 150.93 bar and the reactor's 150 bar).
    ("tutorials/steady/gibbs/gibbs07_wgs_cooled", "wgs"),
    ("tutorials/steady/gibbs/gibbs08_wgs_cooled_reactiveflash", "wgs"),
    ("tutorials/steady/gibbs/gibbs09_wgs_cooled_directmin", "wgs"),
    ("tutorials/plant/greenAmmoniaPEQ_baseCase", "Converter"),
    #  The equilibriumReactor (C131 reactors review): the two-reaction
    #  reformer.
    ("tutorials/steady/reactors/equil01_reforming", "reformer"),
}
UNIT_HEADER = re.compile(r">>>  Unit \[\d+\]:\s+(\S+)\s+\(type = (\w+)\)")
#  The header's next line names the unit's inlets and outlets (either side
#  of the arrow); read only for a declared-T mixer's material test.
UNIT_PORTS = re.compile(r">>>  Unit \[\d+\]:\s+(\S+)\s+\(type = \w+\)\s*\n"
                        r">>>  Inputs:([^\n]*?)\u2192([^\n]*)")


def json_block(txt: str, key: str):
    """The value of a top-level `"key": <json>` in the engine's result JSON on
    stdout, parsed by the JSON parser rather than by a pattern -- or None."""
    at = txt.find('"%s": ' % key)
    if at < 0:
        return None
    try:
        return json.JSONDecoder().raw_decode(txt, at + len(key) + 4)[0]
    except ValueError:
        return None


def judge_units(rel: str, txt: str, seen: set, stats: dict, bad: list):
    """The unit arm, on one case's stdout.  Adds (rel, unit) to `seen` for
    every unit it JUDGED, so the witness check can tell read from unread."""
    types = dict(UNIT_HEADER.findall(txt))
    if not any(t in UNIT_ADIABATIC or t in UNIT_DUTY_IS_DH
               or t in UNIT_MATERIAL_HEAT or t in UNIT_BOUNDARY_DUTY
               or t in UNIT_THROTTLE or t in UNIT_DECLARED_T
               for t in types.values()):
        return
    closures = json_block(txt, "energyClosures")
    kpis = json_block(txt, "kpis") or {}
    portsOf = {u: (ins.split(), outs.split())
               for u, ins, outs in UNIT_PORTS.findall(txt)}
    streams = json_block(txt, "streams") or {}

    def material_gap(unit):
        """(F_out - SUM F_in) / F_out over the PUBLISHED streams, or None
        when a port is not readable -- the unit is then JUDGED: an unreadable
        port must never become an exemption."""
        ins, outs = portsOf.get(unit, ([], []))
        try:
            fi = sum(float(streams[n]["F"]) for n in ins)
            fo = sum(float(streams[n]["F"]) for n in outs)
        except (KeyError, TypeError, ValueError):
            return None
        if not ins or not outs or fo == 0.0:
            return None
        return (fo - fi) / fo
    if not isinstance(closures, list):
        stats["noLedger"] += 1          # the report did not run (outer driver)
        return
    for row in closures:
        unit = row.get("unit")
        t = types.get(unit)
        if t in UNIT_ADIABATIC:
            why = ("an ADIABATIC %s declares no energy item, so this is the "
                   "enthalpy change across its own streams" % t)
        elif t in UNIT_MATERIAL_HEAT:
            why = ("an %s's heat crosses as MATERIAL (chest steam in, "
                   "condensate out, both its own streams), so it declares no "
                   "energy item and this is the enthalpy change across its "
                   "own streams -- its duty must be the enthalpy difference "
                   "the report prices, h(chest) - h(condensate), and its "
                   "process side priced on the same surface" % t)
        elif t in UNIT_BOUNDARY_DUTY:
            why = ("a %s's reboiler and condenser are heat crossing the "
                   "boundary (never passed between its own streams, whatever "
                   "its feed count), and its reboiler duty closes its own "
                   "balance by construction -- a remainder equal to its "
                   "Q_reboiler + Q_condenser means the REPORT dropped both "
                   "duties (reporting::isProcessToProcessExchanger, C35)" % t)
        elif t in UNIT_THROTTLE:
            why = ("a %s is an isenthalpic throttle -- no heat, no work -- so "
                   "this is the enthalpy change across its own two streams, "
                   "and its H_out = H_in must hold on the surface the report "
                   "prices them on (C65 item d)" % t)
        elif t in UNIT_DUTY_IS_DH and "Q_kW" in kpis.get(unit, {}):
            why = ("a %s publishes Q_kW = H_out - H_in on the streams it "
                   "publishes, so nothing may remain unattributed" % t)
        elif t in UNIT_DECLARED_T and "Q_kW" not in kpis.get(unit, {}):
            #  The ADIABATIC mixer (2026-10-24): no Q_kW, so no energy item,
            #  and the report's remainder IS the enthalpy change across its
            #  own streams.  A declared-T mixer whose duty is UNAVAILABLE
            #  publishes no Q_kW either -- but its streams have no enthalpy
            #  route, so the report carries no closure row for it and it
            #  never reaches this loop.
            gap = material_gap(unit)
            if gap is not None and abs(gap) > MATERIAL_GAP_REL:
                stats["tearFed"].append("%s:%s (published material gap %.2e)"
                                        % (rel, unit, gap))
                continue
            why = ("an ADIABATIC %s declares no energy item, so this is the "
                   "enthalpy change across its own streams -- its outlet must "
                   "be the state of equal enthalpy, RESOLVED at its own "
                   "equilibrium and priced as the report prices it "
                   "(2026-10-24 decision, DEV.md 4c (b))" % t)
        elif t in UNIT_DECLARED_T and "Q_kW" in kpis.get(unit, {}):
            gap = material_gap(unit)
            if gap is not None and abs(gap) > MATERIAL_GAP_REL:
                stats["tearFed"].append("%s:%s (published material gap %.2e)"
                                        % (rel, unit, gap))
                continue
            why = ("a %s at a DECLARED outlet temperature publishes the duty "
                   "that temperature implies, Q_kW = H(outlet) - SUM "
                   "H(inlets), on the streams it publishes (DEV.md 4c C74)"
                   % t)
        else:
            continue
        rem = float(row.get("remaining_kW", 0.0))
        seen.add((rel, unit))
        stats["judged"] += 1
        if abs(rem) > UNIT_TOL_KW:
            bad.append(
                "%s: unit '%s' (%s) leaves %+.4f kW of its energy balance "
                "unattributed in the engine's own report -- %s.  The unit is "
                "computing its energy balance on a state or surface its "
                "streams are not priced on (CLAUDE.md 6, THE STATE A UNIT "
                "COMPUTES WITH IS NOT THE STATE ITS STREAMS CARRY).  Price "
                "every term through flashState::priceState (+ priceSolids), "
                "the call the report's own rule is; never widen %.0e kW."
                % (rel, unit, t, rem, why, UNIT_TOL_KW))


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
    """The kW arm: the same four verdicts the percentage arm gives (closed,
    unpinned, grown, shrunk), taken on the MAGNITUDE of an absolute residual,
    plus a fifth for a residual that changed SIGN without changing size.
    Returns 1 when the case closes and is not pinned, so the caller can count
    it exactly as it counts the other arm.
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
    elif a < abs(pin) - ratchet_kW(pin):
        bad.append(
            "%s: first-law residual SHRANK from the pinned %+.4f kW to "
            "%+.4f kW (> %.4f kW, the ratchet for a pin that size).  This is "
            "good news and it is still a failure, for the same reason the "
            "growth arm is one: the pin is a MEASUREMENT.  Re-measure it with "
            "`--seed` and re-pin."
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
    unitSeen, unitStats = set(), {"judged": 0, "noLedger": 0, "tearFed": []}
    ranClean = set()

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
        ranClean.add(rel)
        judge_units(rel, txt, unitSeen, unitStats, bad)
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
        elif pct < pin - RATCHET:
            bad.append(
                "%s: first-law residual SHRANK from the pinned %.4f %% to "
                "%.4f %% (> %.2f pp).  This is good news and it is still a "
                "failure: the pin is a MEASUREMENT, and a measurement that "
                "moved is a claim about the engine that stopped being true.  "
                "Re-measure it with `bin/curate/check_energy_closure.py "
                "--seed` and re-pin.  Leaving it high would also hand the "
                "next regression %.4f pp of room to grow back in silence."
                % (rel, pin, pct, RATCHET, pin - pct))

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

    #  THE UNIT ARM MUST HAVE READ ITS WITNESSES.  A witness case that ran
    #  clean in scope and whose unit was not judged means the arm lost its
    #  subject -- the header it reads types from, or the ledger it reads
    #  remainders from, changed shape -- and a green verdict over nothing is
    #  the check_true_ions failure.
    for rel, unit in sorted(UNIT_WITNESSES):
        if rel in ranClean and (rel, unit) not in unitSeen:
            bad.append(
                "%s: the unit arm did not READ its witness '%s' -- the case "
                "ran clean, but no `>>>  Unit ... (type = ...)` header with a "
                "judged type and no `energyClosures` row reached it.  THIS IS "
                "A DEFECT IN THE GATE (or the witness was renamed): an arm "
                "that reads nothing passes forever." % (rel, unit))

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
        ns = no_subject("check_energy_closure",
                        "no case in scope published a global first law")
        if ns is not None:
            return ns
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
          "not); PER-UNIT closure in general, where a plant can close globally "
          "with two units cancelling -- EXCEPT the unit arm: %d unit(s) whose "
          "energy balance is H_out = H_in by construction (adiabatic "
          "sprayDryer/solidDryer/convectiveDryer; an evaporator, whose heat "
          "crosses as its own chest and condensate streams; a "
          "distillationColumn, whose reboiler and condenser cross the "
          "boundary whatever its feed count; a valve, an isenthalpic "
          "throttle; a "
          "cstr/conversionReactor/isothermal gibbsReactor/"
          "equilibriumReactor "
          "that published "
          "Q_kW; a mixer at a declared outlet T that published Q_kW; an "
          "ADIABATIC mixer, its outlet resolved at its own equilibrium) leave "
          "no more than %.0e kW unattributed in the report, "
          "every in-scope witness among %d was read, and %d case(s) running "
          "such a unit published no per-unit ledger (the report did not run "
          "under an outer driver) and are unjudged.  NOT judged and NAMED: "
          "%d mixer(s) whose PUBLISHED inlets do not sum to "
          "their outlet beyond %.0e relative -- a recycle tear's convergence "
          "gap (the report prices the published tear, the unit the one the "
          "final pass started from), which their energy row carries "
          "too%s.  The arm reads unit "
          "types from the console header, so a unit run at a verbosity that "
          "prints none is unjudged too, and the witnesses are what keep that "
          "from going silent.%s"
          % (ok, BAND, len(KNOWN_OPEN), okKW, BAND_KW, len(KNOWN_OPEN_KW),
             RATCHET, RATCHET_KW_ABS, 100.0 * RATCHET_KW_REL,
             len(refused), len(announced), len(noReport), noReportOuter,
             len(unrun),
             unitStats["judged"], UNIT_TOL_KW, len(UNIT_WITNESSES),
             unitStats["noLedger"], len(unitStats["tearFed"]),
             MATERIAL_GAP_REL,
             (": " + "; ".join(unitStats["tearFed"]))
             if unitStats["tearFed"] else "",
             scope_sentence(len(measured) + len(measuredKW) + len(refused)
                            + len(noReport) + len(announced),
                            len(outOfScope))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
