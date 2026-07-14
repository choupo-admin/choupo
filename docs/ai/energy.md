# Energy: shaft work, heat duties, utilities, heat integration

How energy moves between units in Choupo, and how heat duties become plant
utilities.  One rule covers everything; the rest is examples.

> **The rule.** A heat **duty** is *carried by a physical stream when one is
> wired to it, otherwise it is sized to a plant utility by temperature
> level.*  Shaft **work** is a direct scalar wire (no carrier).

---

## 1. Two kinds of energy

| | **Work (W)** | **Heat (Q)** |
|---|---|---|
| Carrier | none — a direct scalar **wire** unit→unit | a **duty**; carried by a stream/utility, or allocated |
| Examples | turbine → compressor, turbine → electricLoad | reboiler, condenser, flash duty, heater Q |
| Sign | + into the consumer | + heating, − cooling |

There is **no abstract "Q stream"** travelling the flowsheet.  Heat is either
on a *physical* carrier (a steam header, cooling water, a hot process stream)
or it is a *duty* that a post-run report sizes.  This keeps the glass-box
honest: the solver never conjures a stream the topology doesn't declare.

### Who SETS a duty vs who COMPUTES it — the flash/heater rule

A duty `Q` is **either** a spec you type **or** a result the unit computes —
never both, and which one depends on the unit's *job*, not on taste.  Every
unit has a fixed number of degrees of freedom; once you spend them, the rest —
the duty included — is forced.

| Unit | You specify | The solver computes |
|---|---|---|
| `heater` | **Q** (the power delivered) | `T_out` |
| `isothermalFlash` | **T, P** | **Q** (the duty to hold T) |
| `adiabaticFlash` | **Q = 0, P** | `T` |
| `conversionReactor` / `cstr` / `pfr` / `gibbsReactor` | conversion / kinetics / equilibrium | **Q** (heat of reaction from `gibbsFormation`, the elements datum) |

**A flash GIVES a Q; a heater TAKES a Q.**  A flash is fixed by exactly two
numbers (Duhem's theorem — an equilibrium state of known composition needs two
independent variables): spec `T,P` and the duty is whatever the energy balance
forces, surfaced as a heat stream.  A flash therefore **never takes a `Q` key**
(the option was deliberately removed) — to *impose* a known heat and then
separate, use a `heater(Q) → flash` chain, so the heat rides a visible wire into
the heater and the flash stays a pure equilibrium device.  ("Heat is a stream,
not a hidden number.")

**"I want a target T"** is a **DesignSpec**, not a third flash spec: wrap the
heater (or the flash's upstream heater) in a spec on `$Q` with a target on
`out.T`.  The outer loop is visible; the duty is never back-computed in secret.
Same pattern as outlet pressure on a compressor (spec `W_shaft`, target `P_out`)
— see `theoryGuide` §"Isothermal flash" for the degrees-of-freedom derivation.

## 2. Energy wires (the `energyInputs` / `energyOutputs` mechanism)

Energy is wired on the **CONSUMER**, with one uniform syntax — learn it once
and it works for turbines, columns, everything:

```
energyInputs ( { from <producer>.<port>;  kind <work|heat>;  target <opKey>; } );
```

The producer publishes a port.  A rotating unit declares it explicitly:

```
{ name T1; type turbine;  operation { W_shaft -0.4 kW; eta 0.8; }
  energyOutputs ( { name shaft;  kind work;  expression "-W_shaft";  unit W; } ) }

{ name G1; type electricLoad;  operation { eta 0.97; }
  energyInputs  ( { from T1.shaft;  kind work;  target W_shaft; } ) }
```

The Flowsheet evaluates the producer's port AFTER the producer solves, then
injects the scalar into the consumer's `operation.<target>` BEFORE the
consumer solves.  **Forward only:** the producer must solve first (it must
appear earlier in the unit list / topological order).  Typed ports are
checked — a `work` wire cannot connect to a `heat` input.

**Shaft node (summing several inputs).**  When two or more `energyInputs`
target the SAME key, they SUM — a shaft junction.  This is the gas-turbine
**shaft-split**: one generator nets the turbine's gross work against the
compressor's load.  Both rotating units publish `expression "-W_shaft"`, so
the turbine (W_shaft < 0) contributes `+`, the compressor (W_shaft > 0)
contributes `−`, and the generator receives the delivered power:

```
{ name gasGenerator; type electricLoad;  operation { eta 0.97; }
  energyInputs (
    { from gasTurbine.shaft;  kind work;  target W_shaft; }   // + gross
    { from compressor.shaft;  kind work;  target W_shaft; } ) }  // - load (summed)
```
Tutorial: `combined02_brayton_rankine_shaft` (1500 kW turbine − 900 kW
compressor → 600 kW net).

## 3. Heat duties → utilities (the default: "Q then allocate")

Most units that move heat just **report a duty** and let a report size the
utility.  This is the lightweight default — you don't model every steam
header to get a balanced flowsheet.

Add the report in `controlDict`:

```
reports { utilityAllocation { dTmin 10; } }     # dTmin optional (default 10 K)
```

For each duty `Q` at process temperature `T` it picks the lowest-grade
catalogue utility that still works (tightest feasible margin):

- heating duty → a steam grade with `T_in ≥ T + dTmin`;
- cooling duty → a coolant with `T_in ≤ T − dTmin`;

and converts |Q| to a utility mass flow (`|Q|/dutyPerKg`), a load (MW) and a
cost (€/h).  Two clean steps: the **physics** (the duty the unit computes)
then the **services** decision (which utility).  Utilities live in
`data/standards/utilities/` (steamLP/MP/HP, coolingWater, chilledWater,
dowthermA, hitecSalt, refrigerationPG).

**Electricity is the third tier (`power`).**  Shaft work is not free: the same
report tallies the plant's electrical bill alongside the steam and cooling-water
bills.  A pump or compressor MOTOR draws grid electricity
(`W_shaft / driveEfficiency`); a turbine GENERATOR (an `electricLoad`) feeds it
back (`W_electric`, a credit).  Shaft work supplied by a **wire** (turbine →
compressor) is mechanical, not grid, and is skipped — so a combined cycle that
exports power shows a negative €/h.  The `electricity` utility carries the
tariff (≈ 0.10 €/kWh = 27.8 €/GJ) and the motor/generator `driveEfficiency`.
Nothing to declare in the case: the report reads the `W_shaft` / `W_electric`
KPIs that already exist.

## 4. Distillation columns: reboiler + condenser heat ports

A column carries two intrinsic duties, reported as KPIs and placed
spatially — **heat at the base, cold at the top**:

- `Q_reboiler_kW`  — heating, at the bottoms T → a steam grade;
- `Q_condenser_kW` — cooling, at the top T → cooling water.

By default both auto-allocate.  Name one explicitly when you want a specific
service:

```
operation { ...  reboiler { utility steamMP; }  condenser { utility coolingWater; } }
```

(See [`unit-ops.md`](unit-ops.md) → `distillationColumn`.)

### Film-condensation duty from geometry (the condenser HTC)

A `phaseChanger`/`condenser` can also let its **duty EMERGE** from the
condensing-film physics rather than spec it: `model geometry;` builds the duty
from a **Nusselt (1916) laminar film** coefficient on the surface + the wall +
a coolant film, solving a 1-D wall-energy balance (`q_cond == q_cool`) for the
wall temperature, then `Q = h_cond · A · dT_film`.  The first-law ledger sees
the resulting Q exactly as it sees any other duty — the duty is still a RESULT,
just sourced from geometry.  Grammar (`geometry`/`condensation`/`coolant`
blocks) → [`dict-syntax.md`](dict-syntax.md); tutorial
`steady/heat/condenser01_film_nusselt`.

## 5. Heat integration: wire a duty to a carrier ("carried", not allocated)

When the heat has a real carrier it is **not** re-allocated — that is the
whole point of integration (no double-counting CW at the condenser *and*
steam at the consumer).  Two ways to give a duty a carrier:

**(a) A physical utility/process stream into a heat exchanger.**  A
`heatExchanger` fed a cooling-water stream carries its duty on that stream;
the allocation marks it `(carried: <stream>)`.

**(b) A forward heat-link** — reuse a column's condenser heat to drive a
downstream unit.  Wire it like any energy link, on the CONSUMER:

```
{ name preheater; type heater;  in coldFeed;  outputs (warmFeed );
  operation { }                                   # Q comes from the link
  energyInputs ( { from column01.condenser;  kind heat;  target Q; } ) }
```

The column's condenser (heat source, +|Q_cond| heats the consumer) and
reboiler (heat demand, −|Q_reb| cools whoever supplies it) are exposed as
heat ports automatically — no `energyOutputs` block on the column.  Both ends
then read `(carried: heat-link …)` in `utilityAllocation`, and only the
un-integrated duty (e.g. the reboiler) draws a utility — so the report shows
the **saving**.  Tutorial: `heatlink01_condenser_to_heater`.

**Forward vs feedback.**  A *forward* link runs in one pass (the producer
column solves before its heat consumer).  A *feedback* link — the condenser
preheating the column's OWN feed — is circular: an **energy tear**.  The
Flowsheet detects it (the producer is listed after the consumer), turns the
recycle outer loop on even with no material tears, and converges the duty by
successive substitution (Wegstein); the consumer reads the previous pass's
duty (0 on the first pass).  Just list the units in feed order and wire the
link — no `tearStreams` needed.  Tutorial: `heatlink02_condenser_feed_preheat`.

## 6. In the GUI

W wires render as dashed amber edges; heat as dashed orange.  A column shows
a ♨ **reboiler** stub at its base and a ❄ **condenser** stub at its top,
labelled post-run with the duty (kW), the allocated utility and €/h; a
heat-linked port shows the link edge instead.  The `utility` show/hide chip
toggles the whole energy/utility layer so a busy plant declutters.

---

## 7. Model boundaries (when adjacent units use different thermo)

A per-unit `thermo {}` override (or one sector on eNRTL feeding another on
NRTL) creates a **model boundary**: the stream is described by model X on the
upstream side and model Y on the downstream side.  The components are the same
(the species set is a plant-wide contract); only the *model* differs.

> **The rule: `H` is the conserved truth; `T` is the model-dependent readout
> of it.**

Choupo stores stream enthalpy on the **elements / formation datum** (a single
globally-consistent zero — the same datum that makes the heat of reaction
emerge as `H_out − H_in` across a reactor).  Because of that shared zero,
"model X and model Y disagree on `H(T,P,z)`" is a real, quantifiable number.

**One enthalpy base for the heat of reaction.**  Because that datum carries each
species' ΔHf°(elements, 25 °C) via its `gibbsFormation` block, the heat of
reaction is `dH_rxn(T) = Σ νᵢ·hᵢ(T)` in **every** reactor — steady
(`conversionReactor` / `cstr` / `pfr` / `gibbsReactor`) **and** time-dependent
(`batchReactor` / `dynamicCSTR`).  Every reacting species therefore needs a
`gibbsFormation` block.  The reactions-dict **`dH_rxn` key is not the primary
input**: it is an explicit, **announced** override, used only when a species
deliberately lacks formation data (toy / lumped pedagogy).  When both are
present the engine cross-checks them and warns on a mismatch; it never silently
overrides the curated formation value and never runs silently
thermally-neutral.

**A crystallising SALT's enthalpy is DERIVED from the ions, never stored
(settled 2026-06-29, forum).**  A salt that dissolves / crystallises gets its
**solid formation from the ions**, not a component block:
`Hf_solid = Σνᵢ·hfAq_i − dH_soln`, where each `hfAq` lives in
`data/standards/components/true/aqueous/` and `dH_soln` is the component's
`electrolyte { dissolutionEnthalpy }` (primary-cited).  Writing the salt a
component-level `gibbsFormation` block is **forbidden** — it is a second source
of truth that silently drifts from the ions (*trees never store derivatives*),
and `bin/curate/check_ion_pins.py` exits 1 if it ever returns.  The crystalliser
reads the **`dissolutionEnthalpy` straight** for the heat of crystallisation
(single-sourced, real even for unfitted / mixed-solvent salts — the `dHcryst
0.0` placeholder is gone), and a **nonvolatile salt never routes through the
ideal-gas reference** (`h_pure_ig`) — it takes the solid / aqueous rung.

**A model boundary is NOT a physical device.** Nothing physical happens between
"the X view" and "the Y view" of one stream — so there is no real temperature
change to absorb.  Choupo therefore makes the honest choice:

* **Default — hold (T,P,z), let H jump.** The stream carries (T,P,z,F)
  verbatim; each unit recomputes its own `H` from its own model.  The
  disagreement stays **visible in the printed enthalpy**, where you can see it
  and decide whether it matters.  Do NOT expect the solver to silently nudge
  the downstream temperature to make `H` continuous — that would hide energy in
  an invisible `T` shift (and, across a recycle, bias the converged result).
  Choosing `H`-continuity over `T`-continuity is a *convention, not a law*.

* **The audit (when you want the number).** If two adjacent units differ in
  thermo, the report prints `ΔH = H_down − H_up` at fixed (T,P,z), in **kJ/mol
  and kW**, and sums it into a *model-inconsistency* line of the first-law
  balance.  A large `ΔH` is a signal: your two models genuinely disagree there
  — reduce to ONE global model, or accept and document the boundary.  The audit
  **refuses** (loud error, not a silent flash) when the boundary also flips the
  phase (`vf`), the speciation basis (electrolyte ↔ non-electrolyte), or the
  **enthalpy datum** — a `PureFluidModel` (IAPWS-IF97 & kin) reports `h` on its
  own reference datum (the IAPWS triple point), incommensurable with the
  formation/sensible datum of the generic package, so a `ΔH` across that
  junction would subtract two unrelated gauges.  (A closed single-package loop
  — e.g. an IF97 Rankine cycle — never triggers this: the constant offset
  cancels around the loop.  The refusal only fires across a per-unit `thermo{}`
  override that adds/removes a pure-fluid between adjacent units; that override
  is itself a deferred feature, so until it ships a pure-fluid datum and the
  formation datum simply cannot coexist in one case.)

**Practical guidance for a case author:** default to ONE consistent global
model.  Reach for a per-unit override only when the physics demands it (a real
gas in one compressor; the ethanol-water azeotrope in a recovery column whose
plant otherwise runs an electrolyte model).  When you do, expect the printed
`H` to step at the boundary — that step is information, not a bug.
