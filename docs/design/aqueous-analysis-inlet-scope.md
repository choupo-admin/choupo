# Aqueous analysis as a first-class inlet — inspection and proposed slice

> **KIND: SCOPE.  Status: PROPOSED 2026-08-09, nothing implemented.**
> Vítor's ruling asks for inspection, the smallest coherent slice, the exact
> blast radius, the contracts and the tests BEFORE any code.  This is that
> return.  It is deliberately NOT folded into the closed TP-stream campaign.

## 1. What already exists (and it is more than I expected)

| the ruling asks for | today | where |
|---|---|---|
| ion-basis inlet, first-class | **EXISTS** — `speciesMolarFlows { network …; basis analytical\|stoichiometric; Ca …; HCO3 …; }`, one of six exclusive canonical forms | `StreamStateIO.cpp`; witness `flash18_water_analysis_basis` |
| analysis → conserved inventory | **EXISTS** — `m = A n` inverted against the components' declared bridges, REFUSING when the inversion is not unique (the basis-rank test) | same |
| charge check on a measured water | **EXISTS, as a REFUSAL** — `basis analytical` must close in charge; "an unbalanced water is a measurement to fix, never a residue for the solved pH to absorb" | same |
| analytical totals + solved pH + gas pin | **EXISTS** in the props bench — `analyticalTotals {}`, `pH solve;`, `atmosphere { pCO2 … }` | `Speciate.cpp`; witness `pb82_calcite_open_co2` |
| charge-imbalance measurement | **EXISTS** — `SpeciationResult::imbalancePct`, warned above 5 % (and correctly silenced when a charged master is atmosphere-pinned) | `SpeciationSolver` |
| mg/L, ppm | **EXIST** as units (dimension: density) | `Units.cpp` |
| declared vs resolved layers | **EXISTS as a constitutional principle** — `0/feed` is what the user DECLARED, `converged/feed` what it RESOLVES to (ratified 2026-08-09, O1) | stream-state architecture |
| calculated species on a stream | **EXISTS** — the report-only `speciation {}` block, stamped `origin`, `solvedAtT`, verified against the declared bridges on read | `aqueous-stream-basis-proposal.md` |

**So layers 1 and 3 of the ruling already have homes**, and the O1 ratification
gave them the right separation: the authored file is never rewritten, the
resolved snapshot carries the calculated state.

## 2. What does NOT exist

1. **RECONCILIATION — none at all.**  Not weighted least squares, not a single
   adjustment record, no uncertainties, no `maximumCorrection`, no residuals,
   no active-constraint report.  Today the engine has exactly two postures: a
   `basis analytical` stream that does not close in charge is **refused**, and
   a props-bench analysis over 5 % imbalance is **warned about**.  Neither
   adjusts anything, and neither records what it would have adjusted.
2. **Layer 2 has no home.**  There is no "reconciled inventory, with every
   correction recorded" between the measurement and the equilibrium.
3. **Analytical reporting bases** — `as CaCO3`, `as N`, `as SO4`.  Absent.
   This is not cosmetic: alkalinity is almost always reported as CaCO₃, and an
   engine that cannot read that cannot read a real analysis.
4. **Uncertainties** — no field, anywhere, on any measured quantity.
5. **The density route.**  `mg/L` is a per-VOLUME concentration and the stream
   carries a molar flow; nothing today converts between them.  flash18
   sidesteps this entirely by declaring `kmol/h`, which a laboratory never
   reports.
6. **pH as an INPUT on a stream.**  It exists as a solved output inside the
   report-only block; a stream cannot declare a measured pH.

## 3. The one conflict with existing behaviour — and its resolution

The ruling wants a measured water **reconciled** within declared
uncertainties and refused only beyond an admissible limit.  `flash18` today
**refuses** an analytical set that does not close in charge, and a gate arm
pins that refusal.

These do not actually collide, and the distinction is worth keeping:

* `speciesMolarFlows … basis analytical;` declares an **INVENTORY** — flows
  the author has already reconciled.  Charge closure is a *contract* on that
  declaration, and refusing a violation is right.
* `aqueousAnalysis {}` declares a **MEASUREMENT** — mg/L with uncertainties,
  which is exactly the thing that does not close and is *supposed* to be
  reconciled.

**Inventory is not measurement.**  Keeping them as two forms means the new
work adds a form instead of changing one, and the corpus blast radius is
ZERO.

## 4. The smallest coherent slice (A1)

**Goal: one witness case whose inlet is a real laboratory analysis, resolved
through three separately recorded layers, with every default named.**

1. **`aqueousAnalysis {}` as a SEVENTH canonical inlet form** (exclusive with
   the other six, same refusal on conflict).  Carries: `basis mg/L;`,
   `sampleTemperature`, a density ROUTE, per-entry `uncertainty`, per-entry
   `as <formula>`, and `pH` as a measured value.
2. **`as <formula>` conversion**, via the named formula's MW through the
   shared `ElementComposition` parser — no new chemistry, one existing home.
3. **The density route, REQUIRED and explicit**: `density … measured;` OR a
   volumetric flow.  **Iterative density is REFUSED by name in A1** as a
   declared gap — the ruling permits it "with explicit authorization", and an
   authorised iteration whose convergence must be visible is its own slice.
4. **Reconciliation, ONE method in A1**: the ruling's own
   `method adjustChloride;` shape (a named single species absorbs the
   imbalance), plus `maximumCorrection`, plus the full record.  **Weighted
   least squares is the NAMED next slice (A2)** — it is arithmetic behind the
   same contract, and shipping the contract first is what makes A2 cheap.
   With no `reconciliation {}` block at all: **refuse**, naming the two legal
   remedies.  No silent default in A1 (`genericWaterAnalysis-v1` is an A2
   concern, and a versioned default profile deserves its own ratification).
5. **The record**, written into the resolved snapshot only:
   `calculated { analysisReconciliation { chargeImbalanceBefore/After;
   adjustments { … }; method; limit; } conservedInventory { … } }`.  The
   authored `0/feed` is **never** rewritten (O1).
6. **pH is NOT the balancing variable** — refused if a reconciliation rule
   names it in A1, since "pH may participate under an explicit declared rule"
   needs the rule grammar A2 brings.

## 5. Blast radius, exact

* **Corpus: ZERO cases change.**  A new exclusive form; every existing stream
  file keeps its own.  flash18 keeps `speciesMolarFlows` and its refusal arm.
* **Code touched**: `StreamStateIO.cpp` (one more form + its refusals),
  `ProcessStream` (a carried analysis record for the writer), the resolved
  writer (the `calculated {}` block), `Units.cpp` (nothing — mg/L exists).
* **Sealing**: none.  `0/` is not part of the sealed closure (only
  `constant/` is), so no manifest, no reseal.
* **Goldens**: one new case; no existing golden moves.  A gate arm asserting
  that is cheaper than trusting it.

## 6. Tests (the gate, written with the slice)

1. The witness resolves: a real analysis (mg/L, alkalinity as CaCO₃, measured
   density) → conserved inventory → equilibrium, all three layers present.
2. **The authored file is byte-identical after the run** — layer 1 is
   immutable, and this is the arm that proves it.
3. Imbalance before ≠ 0, after = 0 within tolerance, and **every adjustment
   is listed**; the sum of adjustments equals the original imbalance.
4. **Refusals, each by name**: no density route; no `reconciliation {}`;
   correction exceeding `maximumCorrection`; pH named as the balancing
   variable; two material forms in one file.
5. **The negative**: a stream declared in `componentMolarFlows` produces NO
   reconciliation record — the machinery does not switch itself on.
6. **Sabotage**: with the adjustment step disabled, arm 3 must fail.

## 7. Open questions for Vítor before A1 is built

* **Q1** — is `aqueousAnalysis` a new form (my recommendation, zero blast
  radius) or an extension of `speciesMolarFlows`?
* **Q2** — should the reconciled inventory ALSO be written to `converged/`
  for a stream that is a plant INLET (it is not a solver output, but it is
  not the declaration either)?  My recommendation: yes, in the same
  `calculated {}` block, because O1 already makes `converged/` the home of
  "what the declaration resolves to".
* **Q3** — A1 refuses when no `reconciliation {}` is declared.  Is that the
  posture you want, or should an analysis that ALREADY closes in charge be
  allowed through untouched with an announcement?
