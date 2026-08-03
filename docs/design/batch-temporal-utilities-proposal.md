# Batch temporal utilities — time-resolved demand and the peak

**Status: BUILT 2026-08-03 — form B approved with amendments (the
ratified second-opinion round of 2026-08-03, executed same day).  §8
records the as-built contract and the two real ledger bugs the
reconciliation caught on first contact.**

Date: 2026-08-03.  Author: dev session, for Vítor's review.

---

## 1. What exists, and what it deliberately cannot say

The first half of phase (f) shipped (forum #98.3-6 as amended by #99-5):
every VALID energy-ledger record with a service temperature is allocated
to a catalogue utility by the same `pickForDuty` rule the steady report
uses, campaign cost = Σ E·price, unserved records LISTED never dropped
(`utility_*_kJ` + `utility_cost_eur_total` KPIs).

The ledger's constitutional strength is EXACTNESS: an `EnergyRecord` is
an exact state difference over a *segment of constant physics* — Hess
over the elements datum, never a quadrature.  That is also exactly why
it cannot answer two questions a real plant asks:

1. **The peak.**  A campaign total of 500 MJ of LP steam hides whether
   it was drawn at a steady 50 kW or in one 2-minute 4-MW burst — and
   it is the burst that sizes the boiler.
2. **Simultaneity.**  Two vessels each drawing modest steam may or may
   not draw it at the same time; the campaign total is blind to the
   difference, and the shared header is sized by the coincidence.

A record spanning [tStart, tEnd] with one E_kJ has *no interior*: the
mean rate E/(tEnd−tStart) is the only rate it can honestly state, and a
mean is precisely what a peak is not.

## 2. The design tension, named up front

Any time-resolved demand is a RATE, and a rate profile is inherently a
step-wise (trapezoid-class) object — weaker than the ledger's exact
differences.  The proposal's central commitment is therefore:

> **The ledger stays the authority.  The temporal profile is a separate,
> clearly-labelled artefact whose integral must CLOSE against the exact
> records — reconciled by the engine, refused loudly when it does not.**

This is the same posture as the speciation block (the reader verifies
`m = A n` against the declared bridges) and the ctrl balance ledger
(trapezoid on the accepted-step grid, claims stated to their own order):
a derived surface never becomes a second source of truth; it closes
against the primary one by construction, and the closure is checked.

## 3. Three shapes considered

**A. Subdivide the EnergyRecords themselves** (per-step duty increments
inside each record).  REJECTED-SHAPE CANDIDATE: it breaks the record's
identity — "one record = one segment of constant physics, one exact
state difference" — and replaces an exact object with a list of
trapezoid claims.  The arity sin inside the ledger's own spine.

**B. A parallel demand profile on the accepted-step grid** (the
proposal).  Each batch unit already integrates on an accepted-step grid
and already knows, per step, the same physics its segment record will
close over (jacket duty, reboiler/condenser rates, latent draws).  Emit,
per accepted step and per OPEN energy record, the step's energy
increment ΔE (trapezoid, same order as the ctrl ledger) into a
time-series artefact:

    reports/utilities/utilityDemand.csv
    t_start_s, t_end_s, unit, kind, utility, dE_kJ, rate_kW

with `utility` inherited from the parent record's `pickForDuty`
allocation (ONE allocator — the profile never re-picks).  Rates are
piecewise-constant per accepted step; multi-vessel campaign demand is
the sum of step functions on the union grid — no resampling, no
smoothing, the honest staircase.

**C. Differentiate the stored trajectories post-hoc.**  REJECTED:
`trajectory.csv` does not carry every ledgered physics (transfers,
impulses, crystallisation duty), so the profile would silently cover a
subset while looking total.

## 4. The contract (proposal B, in full)

1. **Emission.**  A batch unit with an open energy segment appends one
   row per accepted step per live kind.  `writeOutputs` gates the
   artefact exactly as it gates every other one (the outerDict functor
   stays pure).
2. **Closure.**  At segment close, the engine sums the segment's rows
   and compares against the record's exact E_kJ.  |Σ dE − E| must sit at
   trapezoid order (reported per record in a `.meta` sidecar, the
   ctrl-balance pattern); a gap beyond the step-order bound is a
   REFUSAL of the profile (the record stands — the authority is never
   poisoned by its derivative).
3. **Peak KPIs.**  Per utility: `utility_<name>_peak_kW` and
   `utility_<name>_t_peak_s`, computed from the campaign staircase
   (all vessels summed).  Peak ≥ campaign-mean by construction; the
   gate checks it.
4. **Impulses refuse a rate.**  A `setParameter`-T impulse is a
   zero-width record — energy with no duration has NO finite rate.  It
   appears in the profile as an impulse row (`rate_kW` empty, dE
   carried) and is EXCLUDED from the peak with a named note: sizing an
   impulse is a charge-time question the recipe has not declared.  If a
   recipe someday declares a ramp time, the impulse becomes an ordinary
   segment and the refusal retires itself.  (Explicit refusal over an
   incomplete model — the P-swing ruling's posture.)
5. **Invalid records cast no profile.**  A record with `E_valid false`
   emits no rows (its named gaps already say why); the profile's
   coverage line states which records are unprofiled, so a partial
   staircase never reads as total.
6. **GUI draws, engine owns.**  The CSV is the contract; any plotting
   is a GUI concern (the credo).

## 5. What this deliberately does NOT do

* No utility re-allocation over time (the tier pick stays per record,
  worst-case T — a utility that is only *sometimes* hot enough is a
  scheduling decision, out of scope).
* No campaign scheduling / load-shifting optimisation (a future
  outerDict study could sit on top of the CSV; nothing here blocks it).
* No steady-state analogue (steady duties are constant; their "profile"
  is the existing report).
* No new dictionary grammar: the artefact rides the existing `reports`
  control and `writeOutputs` gate.

## 6. Cost estimate

`BatchUnitOperation` gains a per-step hook (emit into an in-memory
series beside the open segment; ~30 lines per unit kind that overrides
it), choupoBatch's campaign loop writes the CSV + meta + peak KPIs
(~120 lines), one gate `check_batch_temporal.py` (closure per record +
peak ≥ mean + impulse exclusion + the negative: no reports block, no
artefact; sabotage-verified), witnesses: `recipe01` (multi-segment,
transfers) and `recipe02` (T-programme + impulses — the impulse-refusal
exhibit).  No new deps, no grammar, no unit-op behaviour change.

## 7. Decision requested from Vítor

Approve shape B with the closure contract and the impulse refusal — or
amend.  Named alternatives if the accepted-step grid is judged too fine
for the artefact: emit on the `writeInterval` grid instead (coarser,
still closing, loses intra-interval peaks — the trade-off would be
stated in the meta).

---

## 8. BUILT (2026-08-03) — the as-built contract and what it caught

Form B was approved with amendments and executed the same day.  The
as-built deltas against §4, then the finds.

**As-built contract.**  Canonical grid = the ACCEPTED DRIVER STEPS,
never `writeInterval`.  Row schema (ratified):
`tStart_s,tEnd_s,unit,eventType,utility,deltaEnergy_kJ,averageRate_kW`
with `averageRate = deltaEnergy/(tEnd−tStart)` — explicitly a step
MEAN.  The engine reconciles, per record, Σ profile.deltaEnergy against
the record's exact E_kJ at a DECLARED tolerance (1e-6 relative — the
samplers are exact state-difference increments, so they telescope to the
record identically; anything worse is a sampler bug): a non-closing
profile is **REFUSED, the record stands** (the ledger is never poisoned
by its derivative).  Unprofiled records are LISTED (`UNPROFILED`, stdout
+ `.meta`).  Impulses are an explicit class (`eventType impulse`, rate
column EMPTY, excluded from every peak KPI, warning in stdout + meta).
Peaks (`utility_<name>_peak_kW`/`_t_peak_s`) come from the canonical
profile only — sum of step functions on the union grid, defined-rate
rows only, `utility` inherited from each record's `pickForDuty` (ONE
allocator; the profile never re-picks).

**Samplers.**  `BatchUnitOperation::takeDemandSamples()` (drain);
BatchReactor samples the isothermal jacket duty per accepted driver step
(same `isoMixH_` state-difference pricing as the record — linear in Δn
at fixed T, so it telescopes exactly); BatchStill samples reboiler +
condenser as increments of the pot enthalpy + the per-package
accumulators (both models, rayleigh and rectifier).  The sampler lives
in `noteTimeAdvanced` — NOT `step()` — because a `hasOdeForm()` unit is
advanced by the stiff sweep (`setOdeState`) and `step()` never fires for
it.

**Find 1 — the transfer mis-attribution (a real, golden-locked ledger
bug).**  On recipe01 the reconciliation refused the reactor's profile:
sample sum −181.06 kJ vs record +6716.64 kJ.  The samples were right —
the RECORD was wrong: `chargeFrom`/`dischargeAll`/`discharge` mutated
the inventory FIRST and fired `notifyStateChanged` after, so the
segment closed on the post-transfer state and priced the t=400 transfer
jump into the "reaction" record (+6716.64 = H(empty)−H(charge); the
still's "reboiler" seg0 −6897.69 kJ over an EMPTY still was the charge
arriving).  The campaign closure never saw it because the
mis-attributed terms cancel pairwise across vessels — but the utility
allocator charged 7324 kJ of LP steam for what was mostly a vessel
transfer.  Fix: `notifyStateWillChange()` (new hook, fired by the base
transfer primitives BEFORE the first mole moves) closes the segment on
the pure state; `notifyStateChanged()` is now re-base only.  recipe01
after: reaction −181.06 kJ (exothermic → coolingWater), reboiler 607.59
kJ (steamLP), campaign cost 0.0909 → 0.0076 EUR.

**Find 2 — the hand-off ordering.**  The still's `segVapH_`/`segLatent_`
accumulate at package HAND-OFF (`takeContinuousDischarge`), which the
driver ran AFTER `noteTimeAdvanced` — every sample window lagged its
hand-off by one step and the final one was lost (reboiler off by exactly
one step's vapour enthalpy, 6.03 kJ).  Fix: the driver routes continuous
discharges BEFORE the clock-note (`routeDischarges` → `noteTimeAdvanced`
→ events), in both the fixed and the adaptive loops.

**The number the totals hid.**  recipe01 steamLP: mean reboiler draw
0.76 kW, peak 16.96 kW at t=400 — the bring-to-boil spike, 22× the
mean.  That ratio is the whole pedagogical case for this artefact.

**Witnesses + gate.**  recipe01 (2000 rows, 0 refused, 0 unprofiled,
peak == staircase recomputed independently), recipe02 (impulse rows,
exclusion + warning, impulse-only utility grows NO peak KPI), batch13
(crystalliser has no sampler → records LISTED unprofiled, no rows).
Gate `bin/curate/check_temporal_utilities.py` (wired into runTests)
includes the three MANDATED sabotages — removed interval, flipped sign,
altered deltaEnergy ⇒ the reconciliation refuses each.  The engine-side
refusal branch was additionally verified live: the pre-fix ordering
produced `profile sum 613.63 kJ vs exact record 607.59 kJ -- profile
REFUSED, the record stands` through the real path.
