# The positivity guard is a mask over every unit

*Kind: ADR.  Status: BUILT 2026-10-31 (DEV.md 4c C185 item 8), on a
general's branch, not merged.  Gate: `check_positivity_mask`.*

---

## 1. The defect, reproduced before it was fixed

An external review (relayed by Vítor 2026-10-27) read one line of
`src/solver/ODE/AdaptiveTimeStep.H`:

```cpp
ctrl.nPositive = (units.size() == 1) ? units[0].nPositive : 0;
```

The adaptive driver packs the ODE-form units of a run into ONE state vector,
each unit at its own offset, and the integrator's positivity guard was a
PREFIX COUNT -- "the first n rows must stay >= 0".  A prefix cannot name the
species rows of a second unit, so the driver switched the guard OFF for
every run that packed two or more units and left a comment saying it
"relied on each unit's `setOdeState()` clamp".  That clamp is a `std::max(y,
0)` applied AFTER the integrator has accepted the step: the integrator's own
copy of the state keeps the negative value, the unit publishes zero, and
the product that the overshoot created stays.

Reproduced on the parent commit `e41af35f8` with a fixture the gate now
builds (`bin/curate/check_positivity_mask.py`): tank1 holds 1 kmol of compA
in 1 m3 and runs a ZEROTH-order compA -> compB at 0.02 kmol/(m3 s) -- a rate
the holdup cannot stop, so the exact solution crosses zero at t = 50 s and
reads A = -1, B = 2 at t = 100 s; tank2 is an idle vessel fed by tank1's
outlet.  Under `timeStepping adaptive` with deltaTmax = 100 s the first grown
step reaches t = 100 s in ONE step whose local error is exactly zero (the
solution is linear in t), so nothing but the positivity guard could reject
it.

| run on the parent | answer |
|---|---|
| two units, `choupoSemiContinuous`, endTime 100 | **exit 0**, `100/` written, tank1 publishes **n_compA = 0, n_compB = 2** from an initial total of 1 |
| the same with tank2 removed | refuses at t = 50 s: "hMin: the step fell below the floor after a rejected step (a positive row driven negative)" -- 23 accepted, 175 rejected sub-steps |
| two `batchReactor`s, `choupoBatch`, the first zeroth-order (ethanol 0.00925 kmol, 1e-5 kmol/s, crossing at 925 s) run to 2000 s | the step accepted and clipped the same way: `2000/` written, reactor1 publishes **n_ethanol = 0, n_ethylAcetate = 0.02**, total 0.04 from 0.0185; exit **1**, but from the CAMPAIGN element balance finding 36.75 % of the atoms unaccounted for -- the ledger saw the invented inventory after the fact; the dynamic driver has no such verdict on exit |

The one-unit run is what the guard has always done; the two-unit run is the
review's A = 0, B = 2.  No golden could see it: a golden pins what a run
PRINTS, and the corpus holds no case that packs two ODE-form units under
adaptive stepping (measured: ctrl03 packs one; batch17's two adsorbers are
not ODE-form; the unsteady cases step fixed).

## 2. The rule

**A positivity guard is a per-ROW mask over the whole packed vector, built
from every unit's own contract at that unit's offset; the integrator REJECTS
a trial step that drives a masked row negative, and nothing downstream
clips.**  A negative masked row that reaches a unit's commit is an engine
defect and is refused by name.

Rejected alternatives:

* **Keep the prefix count and reorder the packing** so every unit's species
  rows come first.  The derivative closure scatters by unit offset, the
  Jacobian structure a unit declares is per unit, and a reorder would make
  the packed layout a second home for what each unit already states in
  `odeState()`.
* **Keep the clip and announce it.**  A clip after acceptance is the
  integrator's accepted state and the unit's published state disagreeing,
  with the product of the overshoot kept: announcing it would say "the
  inventory doubled" more loudly.  Rejection is what the single-unit case
  always did and what the step controller is for.
* **Two members, `nPositive` and `positiveRows`, on `ODEControls`.**  Two
  homes for one decision; a reader of one would not see the other.

## 3. What was built

* `ODEControls::positiveRows` (`src/solver/ODE/ODEIntegrator.H`), a
  `std::vector<bool>` over the state; rows beyond its length are unguarded,
  an empty mask guards nothing.  `nPositive` is GONE from the controls.
  `ODEStats::negativeRow` carries the row the mask refused.
* `Rosenbrock23.cpp` and `EulerSI.cpp` read the mask (the only two readers;
  the `RK4` class never read the prefix either -- see §5).
* `solver::positiveRowMask(units, off)` in `AdaptiveTimeStep.H` is the ONE
  home of the mask over several units: each unit's leading `nPositive` rows
  at `off[u]`; a unit declaring more positive rows than it packs is refused
  by name.  `advance()` hands it to the integrator unconditionally -- the
  `units.size() == 1` branch is gone.  `OdeUnit::nPositive` stays what it
  was, the unit's own leading-row count (the per-unit contract is a prefix
  and is right; the GLOBAL one was wrong), and `OdeUnit` gains an optional
  `rowLabel` so the refusal says `n_compA of unit 'tank1'` rather than
  "row 7 of 12" -- `odeRowLabel(i)` on both unit bases, overridden by
  `DynamicCSTR` and `BatchReactor`.
* The three single-unit callers of `integrate()` that set a prefix
  (`BatchReactor.cpp`, `BatchAdsorber.cpp`, `FixedBedAdsorber.cpp`) assign
  the same rows to the mask.
* The C178 refusal message names the row: "the row driven negative is row 0
  of unit 'tank1' (n_compA): its model keeps consuming that state past zero,
  which no positivity-preserving step can follow".

## 4. The clips, enumerated

Every `std::max(..., 0.0)` on an integrated state in `src/unitOperations/
{dynamic,batch}` was read.  Two kinds:

**Reached from the integrator's commit (`setOdeState`)** -- unreachable for a
masked row now, and a clip that fires there is a defect:

| site | was | is |
|---|---|---|
| `DynamicCSTR::setOdeState` (`DynamicCSTR.cpp`) | `n_[i] = max(y[i], 0)` | REFUSES by name: "the integrator committed a NEGATIVE mole number ... an engine defect, not a case error" |
| `BatchReactor::setOdeState` (`BatchReactor.cpp`) | `state_.n[i] = max(y[i], 0)` | the same refusal |
| `BatchDryer::setOdeState` | already threw on a negative moisture row | unchanged |
| `BatchAdsorber::commitLoadings_` | already threw on a derived `n_gas < 0` | unchanged |
| `BatchDiafilter`, `BatchElectrodialysis`, `WilliamsOttoPlant` `setOdeState` | no clip | unchanged |

**Reached from a unit's OWN fixed-step `step()`** (an inline RK4; a fixed step
cannot reject, so the clip stays, but it is no longer silent):

| site | now |
|---|---|
| `DynamicCSTR::step` | clip ANNOUNCED once per (unit, species) through `AdvisoryLog` and stderr, with the amount invented and the remedy (smaller deltaT, or `timeStepping adaptive;`) |
| `BatchReactor::step` (the unpack shared by its explicit RK4 branch and its stiff branch; only the explicit branch can reach it) | the same announcement |
| `WilliamsOttoPlant::step` (`y[i] = max(0, y[i])` on the six masses), `BatchDiafilter::step` (`max(y + d dt, 0)`), `BatchStill::step`, `BatchCrystalliser::step` (the moments and the solute) | **NOT touched, named here**: silent clips on fixed paths of units this slice did not open.  The two stills are not ODE-form at all.  The next slice over any of them starts from this table. |

Also named: `DynamicCSTR::rateOfReaction_` and `derivatives_` clip the
concentrations they evaluate (`max(n, 0)` inside the rate), a modelling
guard on the DERIVATIVE, not on the state, left as is.

## 5. What the corpus said

* `ctrl03_adaptive_disturbance`, the ONE corpus case that packs a unit
  under adaptive stepping (one unit): `trajectory.csv` and the result JSON
  are BYTE-IDENTICAL to the parent build (md5 `675fb024…`).  The mask over
  one unit is the prefix it replaced.
* `bin/runTests --scope tutorials/ctrl tutorials/unsteady tutorials/batch`
  -- every choupoCtrl, choupoSemiContinuous and choupoBatch case (79), the
  integrator every one of them runs: **83 PASS, 0 FAIL, 3 EXPECTED-FAIL**
  (`batch12_adsorber_refused_P`, `ignition01_h2o2_eulersi`,
  `ignition01_h2o2_rk4` -- the deliberate ones, unchanged), the scoped
  conservation gates green.  **No golden moved**: no corpus case was
  overshooting and being clipped, because none packs two ODE-form units
  under adaptive stepping (measured in §1).
* **No corpus case fires the new fixed-step clip announcement** (the 79
  run logs hold no `CLIPPED to zero`): under `timeStepping fixed` the
  inline RK4 steps of the corpus never cross zero today.  The announcement
  is the measurement from here on.
* Two by-hand sabotages (the prefix restored; the integrator reading the
  mask but deciding nothing) are in the gate's docstring with their
  outputs.  Both showed the SECOND layer holding where the first was
  removed: the overshoot reached `setOdeState` and was refused there as an
  engine defect, so neither sabotage could reproduce the parent's exit 0
  -- which is why the gate names the cause by its words and not by the
  exit code.

## 6. Not done

* The fixed-step paths still clip (announced).  Making a fixed step REFUSE
  an overshoot, as `EulerSI` does through `st.ok`, would end every ctrl case
  that today crosses zero by round-off; whether any does is what the
  announcement measures from now on.
* The `RK4` integrator class (`src/solver/ODE/RK4.cpp`) reads no positivity
  control at all; it never read the prefix either.  No caller hands it one
  through `advance()` (the adaptive stepper is Rosenbrock23 only); the
  batch reactor's `integrator RK4` runs its own inline step.
* `EulerSI` reads the mask but no corpus case reaches it through
  `advance()`; its arm is the source arm.
