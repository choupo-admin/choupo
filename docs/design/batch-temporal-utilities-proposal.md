# Batch temporal utilities — time-resolved demand and the peak (proposal)

**Status: PROPOSAL — awaiting Vítor's alignment.  No code is authorised
by this document.**  (The no-skip-alignment rule of CLAUDE.md §10; this
is the second half of campaign phase (f), which DEV.md §4b names as an
architecture change: *propose before building*.)

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
