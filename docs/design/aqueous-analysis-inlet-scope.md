# Aqueous analysis as a first-class inlet — inspection and proposed slice

> **KIND: SCOPE.  Status: A1 SHIPPED 2026-08-09.**  §8 records what was
> built, what was measured, and the three answers that made it buildable.
> A2 (weighted least squares) is NOT built and is refused BY NAME.
>
> The inspection below is kept as written — it is the record of what the
> engine had before the slice, and §1's finding (that layers 1 and 3 already
> had homes) is what made A1 small.  Vítor's ruling asks for inspection, the
> smallest coherent slice, the exact blast radius, the contracts and the
> tests BEFORE any code.  It is deliberately NOT folded into the closed
> TP-stream campaign.

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

## 8. A1 as SHIPPED (2026-08-09) — the answers, the build, the measurements

### 8.1 The three questions, ruled

* **Q1 — a NEW form.**  `aqueousAnalysis {}` is the SEVENTH exclusive
  canonical inlet form, sharing the other six's refusal on conflict.  The
  rationale is one sentence and it is in the code: *inventory is not
  measurement.*  A `speciesMolarFlows … basis analytical;` block declares
  flows somebody has already reconciled, and charge closure is a CONTRACT
  there; an analysis is mg/L with uncertainties, which is precisely the thing
  that does not close.  The REJECTED ALTERNATIVE was extending
  `speciesMolarFlows`: it would have made one block mean two different things
  about the same numbers, and it would have put a corpus blast radius where
  there is now none.
* **Q2 — `converged/<stream>`, under `calculated {}`.**  Both the
  reconciliation record and the reconciled conserved inventory.  `0/<stream>`
  is NEVER rewritten (O1) — a reconciliation written back into the
  measurement destroys the measurement, and the next run reconciles the
  reconciliation.
* **Q3 — pass through when it closes, refuse when it does not.**  With no
  `reconciliation {}` block: an analysis inside `closureTolerance` (a NAMED
  DEFAULT of 0.5 %, announced whenever it is the default) passes through with
  its measured imbalance ANNOUNCED and nothing adjusted — silence would leave
  a reader unable to tell "balanced" from "nobody looked".  Outside it, the
  run REFUSES naming the two legal remedies (declare a rule, or fix the
  analysis).  **Never a silent adjustment**, in either direction.

### 8.2 What was built

* **The reader** (`StreamStateIO.cpp`): the seventh form, with `basis`
  (mg/L · mmol/L · mol/kg, DECLARED and then verified against every entry's
  own unit — it selects the conversion ROUTE), `sampleTemperature`, the
  density route, per-entry `uncertainty` (parsed and CARRIED; only A2
  consumes it), per-entry `as <formula>` with a declared `perFormulaUnit`,
  and `pH` as a measured value.
* **`as <formula>`** resolves its molar mass through the ONE elemental-formula
  parser (`thermo/ElementComposition` + `AtomicWeights`) — no second table of
  molar masses, no new chemistry home.  `perFormulaUnit` is DECLARED because
  "alkalinity as CaCO3 is two bicarbonate per carbonate unit" is a
  *convention*, not arithmetic the engine may invent.
* **The density route is REQUIRED and explicit**: `density { value <rho>;
  provenance measured; }` plus exactly one flow anchor (`volumetricFlow` XOR
  `totalMassFlow`).  `provenance iterative;` is REFUSED BY NAME as the
  declared A1 gap.  The solvent is closed by the density AFTER the inversion,
  not on the ion masses — the component bridges are not mass-conserving on
  their own (CaCO3 → Ca + HCO3 borrows an H from the water), so closing on
  the ions would leave that hydrogen unowned and the stream's total mass
  would not be `rho·Q`.
* **ONE inverter, shared.**  `collectBridges` / `requireDeclaredNetwork` /
  `invertMastersOntoComponents` were EXTRACTED from `readSpecies` and are now
  called by both forms.  A second inverter would have been a second place for
  the rank test to be right in.
* **Reconciliation:** `adjustSingleSpecies` with `species <name>`, plus the
  ruling's own `adjustChloride` accepted as SUGAR and expanded aloud (the
  runtime species id of chloride is `Cl`, and the announcement says so rather
  than leaving the reader to infer it).  `maximumCorrection` is MANDATORY — a
  rule with no limit absorbs any residue, which turns a broken analysis into
  a plausible one.  `weightedLeastSquares` refuses by name as A2.  Naming
  `pH` (or `H`/`OH`) as the balancing variable refuses: that needs A2's rule
  grammar.
* **The writer:** the `calculated { analysisReconciliation { … }
  conservedInventory { … } }` block, into the resolved snapshot only.  It
  carries the imbalance BOTH ways (the signed equivalent flow and the
  ion-balance percentage), every adjustment with measured / reconciled /
  correction, the measured sheet with its uncertainties, and the reconciled
  master totals.  The reader IGNORES the block, so the file stays feedable as
  state — the same deletability test the `speciation` block passes.

### 8.3 What was measured

Witness `tutorials/steady/flash/analysis01_water_analysis_inlet` — a calcium
bicarbonate groundwater (Ca 84.0 mg/L, Cl 45.0 mg/L, alkalinity 143.0 mg/L
**as CaCO3**, measured density 998.4 kg/m³ at 293.15 K, 2.0 m³/h), flashed at
313.15 K and 1 atm:

| quantity | value |
|---|---|
| ion balance BEFORE | **+0.7813 %** (cations − anions, over their sum) |
| ion balance AFTER | **0.0000 %** |
| chloride adjusted | **+5.1208 %** of the measured 45.0 mg/L (+1.2999e-4 kmol/h of charge) |
| declared limit | 10 % — at 2 % the run REFUSES with both numbers |
| solved pH | 7.9077 |

**Blast radius, as predicted: ZERO corpus goldens moved.**  The slice adds a
form instead of changing one; `flash18` keeps `speciesMolarFlows` and its
charge refusal, which `check_stream_basis` still pins.

### 8.4 The gate

`bin/curate/check_aqueous_analysis.py`, wired into `bin/runTests`.  It
recomputes the ion balance INDEPENDENTLY from the authored mg/L (including
the `as CaCO3` surrogate) rather than reading the engine's own answer back;
it asserts the authored `0/feed` is byte-identical after the run; it checks
that the charge the listed adjustments move equals the residue they cancel
(**charge-weighted** — moles and equivalents coincide only for a monovalent
ion, which is exactly the accident that would hide a bug the day a divalent
one is adjusted); it fires eight refusals BY NAME; and it pins the negative,
that a plain `componentMolarFlows` stream produces no record at all.

Sabotage-verified in an isolated worktree: with the single line that applies
the correction disabled, both halves of arm 3 fail ("the imbalance AFTER is
0.7813 %" and "reconciliation is recorded but NOT applied").

**And the sabotage corrected the expectation the gate was written under.**
It was assumed the corpus golden would NOT see this — it did: pH 8.1349
against the recorded 7.9077.  That is a property of THIS witness and not of
the corpus: chloride is the first link of a chain that reaches the pH here
(Cl fixes CaCl2, which fixes CaCO3, which fixes CO2), so the absorber is not
a spectator.  An analysis whose absorber genuinely is one would move no KPI
at all, and only this gate would notice.  The arm is kept, and the docstring
now records what was observed rather than what was expected.

### 8.5 Named, NOT built

* **A2 — weighted least squares** over the declared uncertainties, and the
  rule grammar that would let pH participate.  Refused by name today.
* **The iterative density.**  Permitted by the ruling only with explicit
  authorisation; refused by name until its convergence can be watched.
* **A versioned default profile** (`genericWaterAnalysis-v1`).  A default
  reconciliation profile deserves its own ratification; A1 has none.
* **TWO analyte rows reporting the SAME species** (a sheet listing both
  "carbonate" and "bicarbonate" against `HCO3`).  The totals still accumulate
  correctly, so the material and the reconciliation are right; what breaks is
  the per-row `adjustments` record, which would credit each row with the
  whole corrected total.  It degrades to a GATE FAILURE and not to a silent
  wrong answer — the charge-weighted adjustment identity does not close —
  and it is named here rather than guarded, because A1's budget was the
  contract and adding refusals outside it is how a slice stops being one.
