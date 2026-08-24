# The glass-box READING benchmark — four fresh readers, the output alone

**Date:** 2026-08-24.  **Commissioned by Vítor**, on his correction of the
test's target: *"o aluno vai sempre usar LLM como interface … o aluno só
tem depois de ser o man in the loop para avaliar e usar a feature glass
box."*  The 2026-08-23 benchmark measured the half an LLM owns (can the
case be ASSEMBLED?).  This one measures the half the STUDENT owns: **given
the output alone, can a reader understand, verify, and correctly distrust
what the simulator did?**

## Protocol

Four FRESH agents, each cast as a student who did NOT author the case.
Allowed: everything inside the case directory, and running the case.
**Forbidden: `src/`, `docs/`, `CLAUDE.md`, `DEV.md`, `bin/curate/`, any
other tutorial, the web.**  Every answer had to quote the line it came
from or be marked GUESS.  Cases chosen to bite in different places:

| case | what it tests |
|---|---|
| `flash01_benzene_toluene` | the baseline: can a K-value be traced to its parameters? |
| `esterification2sector` | the honesty test: a case that DECLARES known-poor physics — is the reader correctly calibrated? |
| `column13_sour_water_stage_identity` | the hardest physics: does the output TEACH the chemistry or merely report it? |
| `ctrl19_tanks_in_series` | built the same day: is the RTD lesson extractable? |

Every finding below was AUDITED against the tree before being recorded;
the ones that changed the engine are marked FIXED with the commit.

## The verdict

**The design bet holds where it is pointed, and the gaps are where it is
not pointed yet.**  Three readers independently re-derived the engine's
own numbers by hand from the case's own files — Antoine + Rachford-Rice
to ten digits, the Davies charge balance and ionic strength on four
trays, the Erlang-3 moments from the E-curve.  That is the glass box
working: *the answer is checkable without trusting the tool.*  The
divergence block did its job on the case built for it — that reader
concluded, in his own words, that he would not quote any separation
number, which is exactly the calibration it exists to produce.

What the four readings agree on is subtler and is the real finding:
**the engine is honest about what it KNOWS it changed, and silent about
what it was never asked to notice.**  Five things reached the reader as
"trustworthy" that are not.

## FINDINGS

### F1 — an impossible phase label is never checked, and it costs 808 kW  [NAMED, not built]

`esterification2sector` prints a red ENERGY BALANCE FAILED on its flash.
The session's own first reading of it (2026-08-24, earlier the same day)
called it "the case's own declared known-poor physics" — **that was
WRONG, and the reader disproved it with controlled re-runs**, reproduced
here before recording:

* flash at 300 K, producing NO vapour at all → residual **identical**,
  807.9995 kW.  So it is not an outlet priced in the wrong phase.
* feed at 330 K, a genuinely subcooled liquid → residual **−0.0000 kW,
  closure 100.00 %**.  So the engine's first law is fine.

The cause is the INLET: `0/REACTION/Feed` declares no `vf`, so it
defaults to liquid, and the 50/50 acid/ethanol mixture at 360 K /
1.013 bar **cannot be one** — the same log prints `g(V=0) = +0.2825`,
which IS the test that says so.  808 kW ÷ 27.78 mol/s ÷ 0.807 =
36.05 kJ/mol, a textbook mixture latent heat: the residual is exactly
the vapour the label denies.

Neither unit invents the label (CSTR has inherited the inlet phase since
before this session; `conversionReactor` was aligned with it the same
day — see the F2 ruling).  **Nothing checks whether the label is
possible.**  The engine's residual message currently GUESSES the cause
("usually means a stream priced in the wrong phase"); it holds the
thermo package and could TEST it and name the offending stream.  *A
check that can run must not stay a guess* — but this is new engine
behaviour beyond the three slices ratified today, so it is NAMED here
with its evidence and left for the architect.

Consequence worth stating: the disputed −229 kW is what the costing
believed, and **four of the eight golden rows pin that utility
allocation** — the golden freezes a number the same run declares failed.

### F2 — the caveat surface is defeated by volume  [NAMED]

`column13` emits **103 model assumptions, 99 of them the same Davies
out-of-band line** with a different ionic strength, none attributed to a
stage, a stream, or converged-vs-trial.  The one that describes THE
ANSWER — stage 1's converged I = 0.6359 mol/kg, outside Davies' own
trust range — is indistinguishable from 98 that describe discarded trial
states.  `profile.csv` prints `ionicStrength` with no flag.  The block
whose stated purpose is that *"a warning a thousand lines above the
answer has been delivered, not received"* is, at this volume, not
received either.

Same case, opposite failure: the `[stageK]` simplex projection and every
`[adiabaticFlash]` re-seed are announced at their site and are **absent
from both the caveat block and the `advisories` array**.

### F3 — the chemistry has no declared validity domain  [NAMED, data layer]

Not one of `column13`'s seven chemistry records carries a `Trange`.  The
engine polices an NH3 heat-capacity fit over a **4.6 K** excursion and
says nothing about evaluating an equilibrium constant at 371 K, or
probing at 483 K.  In a case whose whole subject is chemistry, the
chemistry is the only layer with no stated domain.

Worse, and reproduced here: `CO2aq-formation.dat` carries BOTH a
van't Hoff pair and a PHREEQC analytic set, and at the tray temperature
they disagree by **0.346 log units — a factor of 2.22 in K**.  Nothing
in the output says which one ran.  (The reader determined it was the
analytic set by inverting the printed pH — the van't Hoff route implies
a water activity of 0.44, which is impossible.)

### F4 — the identity case does not pin its own identity  [FIXABLE]

`column13` exists to claim that a MESH tray's effective K IS the flash's
equilibrium, *including the ion inventory*.  Its golden pins 35 rows and
**not one speciation number, not the pH, not stage 2's temperature**.
The verification lives in `bin/curate/check_stage_identity.py`, outside
the case.  So the golden would not notice if the two ion inventories
diverged — the very thing the case is about.

### F5 — small truths absent from the output  [PART FIXED]

* `ctrl19` wrote `reports/rtd/E.csv` and never named it — the RTD lesson
  looks at the CURVE, not its moments.  **FIXED.**
* `ctrl19` published `sigma2` and `tbar` and left the reader to divide:
  the dimensionless spread σ²/t̄², the one number the tanks-in-series
  lesson is ABOUT, was not computed.  **FIXED** — published as a
  measurement, with `N = 1/ratio` stated as the MODEL's reading, never
  as a measurement.
* `ctrl19`'s tracer (`compB`) carried its "synthetic" status only in a
  comment banner, so the caveat block counted ONE synthetic component in
  a case with two — and the one it missed was the measured species.
  **FIXED** (parsed `provenance` block).
* `ctrl19`'s total-mass closure reads 2e-16 while the explicit router
  loses 0.62 % of the tracer — equal molar masses make total mass
  conserve regardless of what happens to composition, so that closure is
  *structurally incapable* of seeing it.  **FIXED**: with routes active
  the ledger now says the closure is the domain-boundary total and does
  not audit the hand-offs, and points at halving `deltaT` to size them.
  The loss itself is first order and honest — measured 1.245 / 0.624 /
  0.312 / 0.156 % at dt = 2 / 1 / 0.5 / 0.25 s — and that table is now
  the case's band rationale.
* `flash01`'s end-of-run summary lists a toluene extrapolation flat,
  losing the tag its SITE carries (*"from the T-x-y scan, NOT your
  operating point"*).  The summary — the thing a reader reads — is the
  one place the qualification is dropped.  [NAMED]
* `flash01`'s shipped feed declares `vaporFraction` equal to the unit's
  own answer, so the flash duty is identically **zero**; feeding the same
  stream sub-cooled costs 275.6 kW.  The state is physically correct (at
  370 K that mixture IS 30.4 % vapour) — but the corpus's most-read case
  teaches "flash duty = 0" without saying why.  [NAMED — a note, not a
  data change]
* The liquid-enthalpy route (Watson exponent 0.38 from `HvapTb`) is
  named nowhere; the reader reproduced it to ten digits only by trying
  candidates.  [NAMED]

### F6 — prose drifts where numbers cannot  [NAMED]

Three case narratives contradict their own runs: `esterification2sector`'s
README calls the extent in kmol/h a "34.2 % conversion" (it is 68.4 %)
and quotes a split of 34.18/65.82 against the run's 41.065/58.935;
`column13`'s README claims the identity holds "to about 1e-9" where it
now holds to 7e-8; and this session's own `ctrl19` band rationale glued a
PREDICTED +2 s delay to an OBSERVED +0.63 %, which are 0.83 % and 0.63 %
of 240 s — two different claims joined by a comma.  Every number in each
`expected` is pinned to 1e-4; **the prose beside it is pinned by
nothing.**  (The `ctrl19` one is FIXED; the other two are the owner's
cases to correct.)

## What this says about the constitution's bet

The bet was: **the LLM assembles, the student reads a glass box.**  Both
halves are now measured, on the same protocol, a day apart.

* Assembly: five requests, five successes in one round.
* Reading: four readers, four successful re-derivations of the engine's
  own arithmetic — and four lists of what reached them as trustworthy
  and should not have.

The second number is the one that matters now, and it is not a number:
**every gap found is a place where the engine knew something and did not
say it, or said it where it could not be heard.**  None of them is a
wrong answer.  That is the difference between a system that is honest
and a system that is heard, and it is the next slice of work.
