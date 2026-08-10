# Aqueous analysis as a first-class inlet — inspection and proposed slice

> **KIND: SCOPE.  Status: A1 SHIPPED 2026-08-09 · A2 SHIPPED 2026-08-09.**
> §8 records A1; **§9 records A2** — constrained weighted least squares, what
> was measured, the boundary that was made structural, and the two things
> that were deliberately NOT built.
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

---

## 9. A2 as SHIPPED (2026-08-09) — constrained weighted least squares

### 9.1 Vítor's ruling, and the one line that shaped the build

> laboratory analysis → reconciliation → ONE conserved admissible
> composition → aqueous equilibrium / speciation
>
> "Weighted least squares should reconcile the authored laboratory analysis
> into one physically admissible inlet specification.  It must NOT become
> part of the aqueous-equilibrium solver itself … not a coupled loop in which
> equilibrium starts modifying measurements to make the chemistry easier to
> satisfy."

**The arrow is one-way, and A2 makes that STRUCTURAL rather than incidental.**
The reconciler is its own translation unit, `src/streams/AnalysisReconciler.{H,cpp}`,
whose entire include list is `core/Types.H`, `solver/ActiveSetQP.H` and the
standard library.  It cannot NAME `ThermoPackage`, `SpeciationSolver`,
`ReactiveVLE`, `ElectrolyteModel` or an activity model, so it cannot call one
— not by accident, not after a refactor that "just needs gamma here".  Its
interface is POD: labels, numbers, charges, atom counts and linear rows, all
of them facts the caller resolved from declared records before the call.
There is no seam through which an equilibrium result could be passed in even
if a caller wanted to.  The reconciler runs to completion and hands back one
composition; only then does any unit see the stream.

`check_aqueous_reconciliation.py` arm A7 makes it a COMPILE FACT on two
independent readings: the source includes nothing from `thermo/` and names no
chemistry type, **and** the compiled `AnalysisReconciler.o` references exactly
ONE Choupo symbol, `Choupo::solver::activeSetQP` — a whitelist one name long
rather than a blacklist that ages.  Same posture as the one-entry lockdown in
`check_solid_service` A8.

### 9.2 What was built

* **`method weightedLeastSquares;`** — minimise `Σ ((x−m)/σ)²` over the
  measured analytical quantities, subject to the laws the case DECLARES plus
  non-negativity, which is not in the list because it is not optional.  Solved
  as a convex QP by the project's existing hand-rolled active-set solver
  (`solver/ActiveSetQP`, Nocedal & Wright Alg. 16.3).  No new dependency.
* **The problem is posed in SIGMA UNITS** (`u = (x−m)/σ`), for two reasons and
  both matter: the objective Hessian becomes the identity, so a sheet mixing
  millimolar calcium with micromolar iron is as well conditioned as one that
  does not; and `u` IS the normalized correction the report publishes, so the
  number the solver works in is the number the reader sees.
* **`enforce ( electroneutrality elementalConservation );`** — DECLARED, never
  assumed.  A1's single-species rule enforced charge implicitly; with a second
  law available the engine must not pick.  An unknown word refuses; a family
  that expands to ZERO constraints refuses (a declared law that generates
  nothing would pass silently while claiming to have been enforced — the
  permanently-green-gate shape, inside the engine).
* **The ELEMENT ROW**, which is what makes `elementalConservation` real.  A row
  may declare `element <symbol>;` instead of a species: it carries NO material
  (that would count the same matter twice), it is a REDUNDANT determination of
  material other rows carry, and its only effect is the law tying it to them.
  That redundancy is what makes this a least-squares problem rather than one
  equation.  An element row with the family unenforced refuses — a measured
  number nothing reads.
* **A SPECIES row's surrogate ratio is a CONVENTION; an ELEMENT row's is
  ARITHMETIC.**  `alkalinity … as CaCO3` needs `perFormulaUnit 2` because
  nothing in the formula says a titration counts two bicarbonate per unit.
  `totalHardness { element Ca; as CaCO3; }` needs no such key **and is refused
  if it carries one**: how many Ca there are in a CaCO3 is stated by the
  formula, and a declared number beside a derived one is a second home free to
  drift.
* **Uncertainties, three declared sources and no silent fourth** (§9.4).
* **`maximumCorrection` in sigma as well as per cent** — two limits, not two
  spellings of one.  Per cent bounds the correction against the MEASURED
  VALUE; sigma bounds it against the DECLARED UNCERTAINTY, and only the second
  can tell a nudge from an overrule.  Both may be declared; each refuses on its
  own, naming the quantity and both numbers.
* **The inspectable record** — §9.3 — into `converged/<stream>` under
  `calculated { analysisReconciliation { … } }` (A1's home, extended) **and**
  into the result JSON, which is the only surface the GUI reads.

### 9.3 The record, and why the attribution is exact

Every measured quantity — moved or not, because "this one was left where it
was" is a result of the fit and not an absence — states:

| field | what it is |
|---|---|
| `reportedValue` | what the laboratory sent |
| `adjustedValue` | what the equilibrium was fed |
| `sigma` + `weight` + `uncertaintyPct` + origin | the declared uncertainty, `1/σ²`, and WHERE the σ came from |
| `correctionSigma` | THE normalized correction |
| `constraintResponsible` + `responsibleShare` + `causedBy {}` | which law caused it, and the exact per-law parts |
| `closure {}` | how much of each law's OWN residue this row removed |

plus, per law, `residualBefore` / `residualAfter` / `multiplier` / `binding`,
and the run's `objective` and `workingSetChanges`.

**`causedBy` is a KKT identity, not a share invented afterwards.**  At the
optimum `u + Aᵀλ + Aᵢₙₑqᵀμ = 0`, so `u_r = −Σ_k λ_k A_{k,r} + μ_r`: each law
contributes exactly `−λ_k A_{k,r}` standard deviations to row *r*, and the
parts SUM to the whole correction.  The reconciler **asserts the
reconstruction before publishing it** and refuses otherwise — a published
explanation that does not reconstruct its own answer is worse than none.  (A
sabotage confirmed that guard fires; see §9.6.)

### 9.4 THE DEFAULT PROFILE WAS REFUSED, and that is the answer

`genericWaterAnalysis-v1` was reserved for the analyte with no declared
uncertainty.  **It is deliberately NOT shipped**, and the absence refuses BY
NAME with the reason and the remedy.

A per-analyte uncertainty is a property of a LABORATORY and a METHOD, not of
an analyte.  Standard Methods and ISO/IEC 17025 publish how a laboratory
ESTIMATES its own uncertainty; neither publishes a universal table of one.
Numbers invented here would look authoritative *precisely because* they
carried a version, and neither a reader nor a gate could tell.  **A visible
gap is strictly better than an invisible falsehood.**

Nothing is lost by refusing, because equal weights are one declared line away.
The three sources that DO exist, in precedence:

1. the row's own `uncertainty <x> percent;` — A1's field, at last consumed;
2. `uncertainties { <rowKey> <x> percent; }` — the author's own row label,
   matched inside the same block that defines it.  (Not the name-identity the
   F2 contract bans: that ban is about reaching a species record by
   resemblance; this matches a label to itself three lines away.)
3. `uncertainties { <class> … }` selected by an explicit `uncertaintyClass`
   on the row, plus an optional `default`.  **The class is DECLARED, never
   inferred** — the ruling spells classes "majorIons / minorIons /
   alkalinity", and deciding from a name which ions are major would be the
   engine classifying the author's chemistry for him.

Every row ANNOUNCES which source its σ came from; an `uncertainties` entry no
row consumed REFUSES (a declared uncertainty nobody reads is a comment, and
the run would report a weighting the author did not get).

### 9.5 pH: THE REFUSAL IS KEPT, and A2 found the REASON

A1 deferred pH to "the rule grammar A2 brings".  A2 has that grammar, and pH
still does not qualify — on three grounds, the first of which decides it
alone:

1. **A pH is not an amount.**  Turning it into the [H⁺] a charge balance needs
   takes an activity coefficient, hence an ionic strength, hence the
   speciation.  A reconciler that could do that would have to call the
   equilibrium solver it exists to run BEFORE — exactly the coupled loop the
   ruling forbids, and exactly what §9.1's translation unit is built unable to
   do.  **It is not deferred; it is on the other side of the boundary.**
2. It could not close anything anyway: at pH 7–8 the free H⁺/OH⁻ contribution
   to the charge balance is ~1e-7 eq/L against a residue of ~1e-3.
3. What pH actually governs is how alkalinity is SHARED between HCO₃⁻, CO₃²⁻
   and dissolved CO₂ — chemistry, layer 3, downstream of here by construction.

So the measured pH is carried as a measurement and the residue is absorbed by
measured IONS.  The refusal message now states this instead of promising a
later slice.

### 9.6 What was measured

Witness `tutorials/steady/flash/analysis02_weighted_least_squares` — the SAME
groundwater as `analysis01`, plus the line a real laboratory almost always also
sends: an EDTA total hardness that measures the same calcium the ICP measured,
by a different method, and disagrees with it by 0.84 %.

| quantity | reported | σ | adjusted | correction | in σ |
|---|---|---|---|---|---|
| Ca (ICP-OES) | 2.09591 mmol/L | 2 % | 2.08445 | −0.547 % | **−0.2735** |
| Cl (IC) | 1.26929 mmol/L | 5 % | 1.27920 | +0.781 % | **+0.1562** |
| alkalinity (as CaCO₃) | 2.85754 mmol/L | 4 % | 2.88969 | +1.125 % | **+0.2813** |
| totalHardness (element Ca, as CaCO₃) | 2.07821 mmol/L | 3 % | 2.08445 | +0.300 % | **+0.1000** |

* ion balance **+0.7813 % → 0.0000 %**; calcium redundancy **+0.01770 mmol/L → 0**
* `Σ ((x−m)/σ)² = 0.18834`, ONE working-set change, no row on its bound
* declared limit **3 σ**; worst correction **0.2813 σ**
* per-law parts, e.g. calcium: electroneutrality −0.2063 σ + elemental
  −0.0672 σ = −0.2735 σ (the identity, exactly)

**The contrast is the pedagogy.**  A1 shoves 5.12 % into one ion and cannot
touch the calcium disagreement at all — no amount of chloride makes two calcium
measurements agree.  A2 answers both at once and spends the residue where the
uncertainty is: four quantities move, none by a third of its own σ.

**Blast radius: ZERO existing goldens moved.**  A2 adds a method behind A1's
contract and a case beside A1's; `analysis01` is byte-identical in answer and
keeps its own gate.

### 9.7 The pedagogical separation, and how it is achieved

A measurement-correction and a chemistry result are different KINDS of claim.
They are kept apart by marks that survive being read out of order, so telling
them apart never depends on remembering a paragraph:

* **a field only one side can have** — every correction row carries
  `reportedValue`; nothing in `speciation {}` has one and nothing ever can (a
  laboratory reported it, or it was calculated, never both);
* **a unit only one side can be in** — corrections are quoted in SIGMA, which
  is meaningless for a calculated quantity;
* **disjoint KEY SPACES** — corrections are keyed by the author's sheet labels
  (`alkalinity`, `totalHardness`), the chemistry by species ids (`HCO3`,
  `CaCO3aq`).  A label is not a species;
* **no shared key for the two pHs** — the flash SOLVES a pH into the same
  file, so the measured one is `pHReported`.  A comment saying "measured" is
  no defence against a reader who greps;
* a LEGEND at the head of the block, and a `note` in the JSON for a consumer
  that shows the payload raw;
* on the console, the corrections print under their own banner: *MEASUREMENT
  CORRECTIONS (layer 2 — nothing below is a calculated chemistry quantity)*.

Gate arm A8 checks all of it, including the negative: if `reportedValue` or
`correctionSigma` ever appears in the speciation block, the mark means nothing
and the arm fails.

### 9.8 The gate, and what the sabotage found

`bin/curate/check_aqueous_reconciliation.py`, wired into `bin/runTests`.  Ten
arms; the fit is re-solved by the gate's OWN KKT elimination from the authored
mg/L and compared row by row to 1e-9.  Four sabotages, and two surprised:

* **The first attempt never reached the gate.**  Breaking the row scaling also
  breaks the change of variables, so the reconciler's own guard refused before
  writing anything.  That locates the defence: damage inside the solver is
  caught by the solver, and the gate's job is damage that produces a VALID
  answer.
* **Ignoring the declared uncertainties** (every row forced to a flat 3 %)
  fires arm A1 on all four rows — *and* moves the corpus golden
  (`p_eq_sum_atm` 0.0747853 against 0.0747977).  Measured, not assumed.
* **Decoupling the closure from its law's coefficient** fires A3b and NOTHING
  else: answer untouched, golden green, all six fields present, every number
  plausible.  A3b is the sole defence for the sixth field.
* **The boundary sabotage disagrees with itself.**  A header-INLINE reach into
  `ThermoPackage` leaves no undefined symbol, so the OBJECT reading did not
  fire while the SOURCE reading did; an out-of-line reach fires both.  **A7b
  sees out-of-line reach only**, and that blind spot is stated in the gate
  rather than waiting to be discovered.

**A real bug the gate found before any sabotage**, and it belongs to A1: the
`measured {}` writer emitted a trailing `// sigma …` note BEFORE the row's
closing brace, so the comment swallowed the `}` and `converged/<stream>`
stopped parsing.  A1 shipped the claim *"the reader ignores the block, so the
file stays feedable as state"* with nothing checking it.  Fixed; arm A10 now
feeds every resolved snapshot back.

### 9.9 Named, NOT built

* **The iterative density.**  Still refused by name — unchanged from A1.
* **`genericWaterAnalysis-v1`.**  Refused, with the reason (§9.4).  If a
  citable, method-specific source is ever adopted, this is where it lands.
* **GROSS ERROR DETECTION.**  A large `objective` says the measurements and
  the laws disagree; nothing decides WHICH measurement is at fault.  A2 does
  none and claims none — the gate says so in its own not-checked list.
* **TWO INDEPENDENT TOTALS OF ONE ELEMENT.**  A real laboratory situation, and
  it refuses: reconciling them needs a declaration of which one the species
  rows are tied to, and nobody has made it.
* **A ROW REPORTED AS ZERO.**  Refused: relative uncertainty has no scale to
  be relative to.  An absent analyte is not a measured zero — drop the row, or
  report it at its detection limit.

---

## 10. RULINGS 2026-08-10 — the uncertainty refusal upheld, and slices A → C → B

Vítor's architectural ruling on aqueous analysis as a first-class inlet was
received on 2026-08-10, inspected against the shipped A1/A2 work, and answered
with a gap list.  Two rulings came back.  Both are recorded here verbatim in
substance because they CONSTRAIN the slices below.

### 10.1 `genericWaterAnalysis-v1` — refusal UPHELD, earlier ruling WITHDRAWN

The 2026-08-10 directive had allowed a named, versioned default uncertainty
profile.  It was **withdrawn by its author** on inspection, with the reasoning
that matters more than the outcome:

> Versioning would make assumptions reproducible, but would not make them
> evidentially valid; worse, it could give invented uncertainties an
> undeserved appearance of authority.

That is the sharper form of the argument A1 shipped ("an uncertainty is a
property of a laboratory and a method, not of an analyte"), and it settles the
class of defect: **reproducibility is not validity, and a version number is a
credibility signal that unearned data must not be allowed to borrow.**

The contract, as ruled:

* constrained weighted least squares REQUIRES user-supplied uncertainties,
  covariance information, or an explicitly selected laboratory/method profile;
* absent those, Choupo **refuses that method** — it does not degrade quietly to
  a weaker one;
* the user may instead select an explicit deterministic closure rule
  (`adjustChloride` / `adjustSingleSpecies`), which is already built;
* an unweighted or heuristic least-norm policy MAY exist later, but it must be
  named as a **numerical allocation rule** and never presented as measurement
  uncertainty.

**No built-in `genericWaterAnalysis-v1`.**  The name stays reserved and
unshipped so that a future reader finds the refusal rather than a gap.

### 10.2 Slice order APPROVED: A → C → B, with sharpened contracts

**A — `equilibriumState` grouping + `material` wrapper.**  Approved as the
structural foundation, with one correction to the proposal's wording.  "Both
forms accepted side by side" means the PARSER understands both layouts — it
does **not** mean one stream may carry two competing material specifications:

> For each inlet, exactly one authoritative material-input form must be
> selected unless a future contract explicitly defines how forms are combined.

Therefore, and each is a refusal rather than a convention:

* **ambiguous double specification is REJECTED** — the reader refuses a stream
  in which both representations appear;
* the **writer emits ONLY the canonical form**, so a round trip converges on
  the canonical layout rather than preserving whichever the author happened to
  type;
* a **write → read witness must prove the canonical round trip** (the §5a.5
  rule: a format claim earns an executable witness, not a paragraph).

**C — the analytical qualifier.**  The proposal's "default to `dissolved`,
announced" was **rejected**:

> Whether a result is dissolved, total, or free-ion is a property of the sample
> preparation and analytical method; Choupo cannot infer it safely.

So there is no default at all, announced or otherwise.  The grammar is a
block-level declaration with per-analyte overrides:

```
aqueousAnalysis
{
    defaultQualifier dissolved;      // explicitly supplied by the user

    calcium   44 mg/L;
    iron       2 mg/L qualifier total;
}
```

* if neither a block-level nor an analyte-level qualifier resolves the meaning,
  **refuse**;
* `freeIon` is **accepted and preserved syntactically**, and its RESOLUTION
  refuses until the speciation machinery can honour its thermodynamic meaning —
  it must never be quietly reinterpreted as an analytical total;
* **`total` must be defined precisely before anything calculates from it**: it
  may not silently collapse dissolved concentration, total recoverable
  concentration, and a particulate-bearing sample into one meaning.

**B — authorised iterative density.**  Third, and only after the material
structure and analytical semantics are fixed.  The user authorises it
explicitly, and the diagnostic record must keep visible: the initial estimate,
the successive values, the residual, the convergence criterion, the iteration
count and the final density.  **Refuse on non-convergence or an invalid
thermodynamic domain.**

### 10.3 Standing instruction

Return after EACH slice with its contracts and witnessed gates.  The closed
TP-stream campaign is not reopened by any of this.

### 10.4 Slice A as BUILT (2026-08-10) — and the two clauses that had no subject

**Built and witnessed.**  `material { ... }` is read for EVERY canonical
material form (one rule, no special case for the analysis), and a stream
declaring the wrapper beside a top-level form is REFUSED as ambiguous, naming
the offending key.  Gate `check_material_wrapper`: the wrapped
`analysis01_water_analysis_inlet` answers identically to the bare form
(pH 7.90774504802, same reconciliation, same conserved inventory), the wrapper
also serves `componentMolarFlows` on `flash01_benzene_toluene`, and the
refusal fires.  Sabotage-verified: disabling the refusal fails A2 in the
ruling's own words.

One implementation note, paid for at the site: DETECTION and READING must use
the same source.  A form detected inside the wrapper and then read from the
top level finds nothing and refuses for the wrong reason, so both go through
one `matSrc`.

**Two clauses of the ruling turned out to have NO SUBJECT, and inventing one
would have been worse than reporting it.**

*"The writer must emit only the canonical form."*  There is no writer of the
`aqueousAnalysis` form.  It is AUTHOR-ONLY input: `converged/` emits the
RESOLVED `componentMolarFlows` + `speciation {}` + `calculated {}`, never the
analysis.  So the canonical-round-trip obligation falls on the READER, which
is what the gate witnesses.  A writer built only to satisfy the clause would
have created a second spelling of the measurement — the opposite of the
ruling's intent.

*"`calculated { equilibriumState { aqueousSpecies, precipitatedSolids } }`."*
**NOT BUILT — escalated.**  The equilibrium state already has a settled home:
THE TWO BASES contract (2026-07-30) puts the speciation at stream top level
when there is one liquid, and inside `phases.aqueous` when a second liquid or
a solid is named, because that is where the ions actually are.  A copy under
`calculated {}` would be a THIRD home for one truth — the arity sin — and
MOVING it there for analysis-derived streams alone would make a reader's
lookup depend on how the inlet was specified, which is worse.

The ruling's substance is nevertheless already satisfied: the three layers ARE
separate (declared measurements preserved per row as `reportedValue`;
reconciled totals in `conservedInventory`; equilibrium in `speciation {}`).
What is missing is only that `calculated {}` does not NAME where layer 3
lives.  **Recommendation: a cross-reference, not a copy.**  Vítor's call.

## 10. The `equilibriumState` cross-reference (ruled + shipped 2026-08-10)

The slice-A escalation — whether `calculated {}` should group an
`equilibriumState` — was ruled by Vítor: **a cross-reference, never a
copy**.  The canonical home stays THE TWO BASES; `calculated {
equilibriumState { target speciation; fingerprint "<fnv1a-64>"; } }` is
written beside every speciation-bearing stream, and the reader recomputes
the fingerprint from the block actually in the file.  Stale (a
closure-invisible edit — pH, solvedAtT, origin, network — under the
reference), missing target and incompatible target all refuse by name;
deleting the whole `calculated {}` block still runs, so the O1
deletability separation survives.  Numbers enter the canonical string
exactly as the writer prints them (`setprecision(10)`), making
write → parse → recompute the identity; FNV-1a is drift detection, not
cryptography, and the writer says so.

Convergence and evidence fields are ALLOWED by the ruling and deliberately
NOT emitted yet — they arrive with the slice that needs them (C/B), and a
fabricated convergence record would be worse than an absent one.

The round trip caught a real pre-existing defect on first contact: the
reader's carriage kept only the FIRST network name, so
`network ( ammonia carbonate );` was carried as `ammonia` and the second
chemistry set silently vanished on every write→read→write — the spike's
byte-stability criterion was already broken for multi-network blocks.
Fixed with the slice.  Gate: `check_equilibrium_state_ref`
(sabotage-verified twice; the second sabotage fired STRICTER than
predicted — a missing fingerprint reads as STALE at the round trip, and
the observed output is what the docstring records).  **Slices C and B are
now unblocked.**
