# Architectural ownership index — who owns what, and what to run before touching it

> **AUTHORITY: NAVIGATION (level 3).  This page states NO policy — it
> LOCATES it.**  Written 2026-08-10 under Vítor's operational-memory ruling.
> Every cell is a pointer; the explanation, the rationale and the binding
> wording live in the referenced contract or ADR, and where this page and a
> referenced document disagree, this page is the stale copy.  One truth, one
> home — this index is the *address book*, deliberately.
>
> **How to use it.**  Before a non-trivial source change, find the feature's
> row and fill the impact brief (`DEV.md`) from it: the owner is where the
> edit belongs, the producers/consumers are the blast radius to inspect, the
> gates are the focused tests, the witness class (a name from
> `tutorials/WITNESSES`) is the ladder's step 2.  If your edit starts
> touching files outside the row, stop and re-read the row's ADR — either
> the plan is wrong or this row has rotted (fix whichever it is).
>
> **What the gate checks.**  `check_ownership_index` verifies every
> backticked path exists, every named `check_*` gate exists, and every
> witness class is declared in `tutorials/WITNESSES`.  It does NOT judge
> whether a row's content is *right* — prose rots silently, which is why
> every row must point at a gate or witness that would catch the rot in the
> machinery itself.

Legend: **Owner** = canonical home of the logic/representation ·
**Prod → Cons** = principal producers → principal consumers ·
**Never** = the prohibited duplication or fallback ·
**Contract** = the binding record · **Witness** = class in
`tutorials/WITNESSES` · **Gates** = focused `check_*` scripts.

---

## Thermodynamics & chemistry

**T1 — Thermo package assembly (the case's declared world)**
- Owner: `src/thermo/ThermoPackageBuilder.cpp` (assembles; NEVER estimates) → `src/thermo/ThermoPackage.H`
- Prod → Cons: case `constant/thermoPhysPropDict` (inline manifest) → every unit op via `Flowsheet::thermoFor`
- Never: a runtime resolver/estimator; a shared `propertyPackages/` catalogue (retired 2026-07-15); hardcoded `if (name == "water")`
- Contract: `docs/architecture/property-architecture.md` (one-knob rule); CLAUDE.md §5
- Witness: `reactiveMultiphaseFlash` · Gates: `check_resolver_coherence`

**T2 — Aqueous speciation (the equilibrium solver)**
- Owner: `src/thermo/electrolyte/SpeciationSolver.cpp`
- Prod → Cons: case `equilibrium { aqueous {...} }` declaration → `ThermoPackage::speciateAqueous()` → units (units READ, never construct chemistry)
- Never: a unit constructing chemistry or defaulting a model; a second γ fixed-point loop
- Contract: CLAUDE.md §5 (declared-by-case, 2026-07-25/26)
- Witness: `reactiveMultiphaseFlash` · Gates: `check_no_unit_chemistry`

**T3 — Reactive VLE (two-liquid split, wet organic, vapour Newton)**
- Owner: `src/thermo/electrolyte/ReactiveVLE.cpp`
- Prod → Cons: `SpeciationSolver` + phase models → `IsothermalFlash`, `stageK`
- Never: two molecular models across the split; silent fallback to one liquid; Nelder-Mead as the answer (Gibbs decides, Newton solves)
- Contract: `docs/design/reactive-second-liquid-proposal.md` §14–15
- Witness: `reactiveMultiphaseFlash` · Gates: `check_marcilla_lls`

**T4 — Electrolyte activity engines (three, distinct keys)**
- Owner: `src/thermo/electrolyte/PitzerHMW.cpp` (`pitzerHMW`) · `src/thermo/electrolyte/EdwardsPitzer.cpp` + `src/thermo/electrolyte/EdwardsCatalogue.cpp` (`edwardsPitzer`) · salt-level adapter (`pitzer`) behind `src/thermo/electrolyte/ElectrolyteModel.H`
- Prod → Cons: `data/standards/parameters/` records → `ThermoPackage::electrolyte()` / `ActivityModel::asElectrolyte()`
- Never: key collision across factories; an `electrolyteModel {}` case block; RTTI downcasts in the package; Edwards params inside HMW's equation
- Contract: CLAUDE.md §5 (A3 2026-06-29; Edwards 2026-08-04)
- Witness: `propsBench` · Gates: `check_edwards_model`

**T5 — Mean ionic γ publication (the measurable one)**
- Owner: `src/propertyOps/Speciate.cpp` (`diagMeanIonic`)
- Prod → Cons: `SpeciationSolver` per-ion rows (γ, z) → result diagnostics, goldens/anchors, `gui/schemas/operations/speciate.schema.json`, generated docs (`docs/propsGuide-operations.tex`, `docs/ai/schemas-reference.md`), the V&V §3 rows quoting γ± agreements (a prose consumer — the M5 brief's one recorded false negative)
- Never: stoichiometry from a salt NAME (F2); γ± hand-combined in case headers
- Contract: commit 6b999215; F2 in CLAUDE.md §5
- Witness: `propsBench` · Gates: `check_mean_ionic`, `check_schema_coverage`

**T6 — Component identity & typed identifiers (F2)**
- Owner: `src/core/Identifiers.H` (ComponentId/SpeciesId/SolidId); `src/thermo/Component.H` (`identity()`, `readIdentity()`, `readAqueousMapping()`)
- Prod → Cons: `data/standards/components/*.dat` → Database → every consumer of a Component
- Never: name-identity across the component→species crossing; a second parse of identity fields; a minted component missing a declared fact (reduced-identity rule)
- Contract: CLAUDE.md §5 (F2, executed 2026-07-26; reduced-identity generalised 2026-07-31)
- Witness: `reactiveMultiphaseFlash` · Gates: `check_species_identity`, `check_typed_identifiers`, `check_aq_disambiguation`

**T7 — Reaction heat (ONE enthalpy base)**
- Owner: shared `reactionHeat()` resolver; `src/thermo/reaction/Reaction.H` (incl. `forwardOrder` — one home, five readers retired)
- Prod → Cons: `standardThermochemistry{}` on species → every reactor, steady AND batch/dynamic
- Never: `dH_rxn` as primary input (it is a cross-checked override); a thermally-neutral default; a second order-default
- Contract: `docs/ai/energy.md` (settled 2026-06-27)
- Witness: `kineticReactor` · Gates: `check_forward_order`

**T8 — Salt formation enthalpy (ion-derived) & crystallisation heat**
- Owner: derivation `Hf_solid = Σν·hfAq − dH_soln`; `src/unitOperations/crystallisation/CrystallisationHeat.cpp` (shared steady↔batch)
- Prod → Cons: aqueous-ion `hfAq` + component `electrolyte{dissolutionEnthalpy}` → crystallisers, evaporators
- Never: a component-level `standardThermochemistry` on a dissolving salt (second home); routing a nonvolatile salt through `h_pure_ig`
- Contract: CLAUDE.md §5 (settled 2026-06-29); `docs/ai/energy.md`
- Witness: `electrolyteCrystalliser` · Gates: `check_ion_pins`

**T9 — Reference rung of the thermochemical datum**
- Owner: `Component::h_formation(T, phase)` honouring `standardThermochemistry.referenceState`; refusals in the `h_pure_ig` family
- Prod → Cons: component records → Gibbs reactors, `Reaction::Kp`, ReactiveFlash, H_ig/S_ig
- Never: reading a `pureSolid` datum on the ideal-gas rung; remedy text that names a nonexistent key
- Contract: `docs/design/reference-rung-refusal.md`
- Witness: `gibbsReactor` · Gates: `check_reference_rung`

**T10 — Ice / solid phase of the solvent**
- Owner: `src/thermo/phase/SolidPhase.cpp` (`fEffective`); K_f derived in `src/thermo/Component.H`
- Prod → Cons: component `Hfus`/triple-point data → `Kvec_phases`, freeze-concentration flashes
- Never: a special-cased mineral grammar; a stored K_f beside its inputs
- Contract: `docs/design/ice-as-a-solid-phase-of-the-solvent.md`
- Witness: `molecularFlash` (route shared) · Gates: `check_ice_freezing`

## Streams & state

**S1 — Stream state I/O (0/ · converged/ · the `material{}` wrapper)**
- Owner: `src/streams/StreamStateIO.cpp`
- Prod → Cons: authored `0/<stream>` + solver results → `converged/<stream>`, GUI, reports
- Never: stream values inside `flowsheetDict` (`streams{}` refused); two competing material forms on one inlet; a writer emitting a form the reader refuses
- Contract: `docs/architecture/stream-state-architecture.md`
- Witness: `recycleFlowsheet` · Gates: `check_material_wrapper`, `check_stream_transport_closure`

**S2 — Speciation attachment (THE TWO BASES) & `phases{}` decomposition**
- Owner: `src/streams/SpeciationBlock.cpp` (block); post-solve pass + `phases{}` reader
- Prod → Cons: solving/transporting unit (`origin` stamped) → stream files, downstream units, students comparing inlet vs outlet
- Never: re-speciation across a model boundary (silent); a precipitate listed as a dissolved species; a size distribution outside its population; a copy of the equilibrium state under `calculated{}` (ruled 2026-08-10: cross-reference only)
- Contract: CLAUDE.md §5 (2026-07-30/31); `docs/design/basis-reconciliation-spike.md`
- Witness: `reactiveMultiphaseFlash` · Gates: `check_both_bases`, `check_phase_speciation`, `check_basis_spike`, `check_equilibrium_state_ref`

**S3 — Aqueous analysis inlet (measurement ≠ inventory)**
- Owner: `src/streams/AnalysisReconciler.cpp` (QP reconciliation; includes NOTHING from thermo/ — boundary is a translation unit) + the `aqueousAnalysis{}` reader in `src/streams/StreamStateIO.cpp`
- Prod → Cons: lab sheet in `0/<stream>` (never rewritten) → `converged/` `calculated{analysisReconciliation, conservedInventory}` → reports only
- Never: reconciling into the measurement; a silent adjustment; a built-in uncertainty table (`genericWaterAnalysis-v1` refused); pH adjustment (other side of the boundary); a silent or automatic iterative density (authorised `provenance iterative;` only, record visible)
- Contract: `docs/design/aqueous-analysis-inlet-scope.md` §8–9
- Witness: `aqueousAnalysisInlet` · Gates: `check_aqueous_analysis`, `check_aqueous_reconciliation`, `check_aqueous_qualifier`, `check_iterative_density`

## Solvers & flowsheet

**N1 — Convergence verdicts (normalized residual)**
- Owner: `src/solver/Convergence.H` (ONE normalization, ONE decision)
- Prod → Cons: `system/solverDict` triples → ReactiveVLE outer Newton (wired); others named-not-wired in the ADR
- Never: a dimensional `1e-9` compared with nothing; acceptance without the declared verdict
- Contract: `docs/design/normalized-residual-convergence.md`
- Witness: `reactiveMultiphaseFlash` · Gates: `check_convergence_residual`

**N2 — Sequential plan (tears & order)**
- Owner: `Flowsheet::validateSequentialPlan` in `src/unitOperations/flowsheet/Flowsheet.cpp`
- Prod → Cons: `flowsheetDict` declared order + tears → choupoSolve, `bin/choupo-lint`
- Never: a silent topo-sort; stale-seed reads (undeclared tear); `converged/` written on non-convergence
- Contract: CLAUDE.md §6 (settled 2026-07-25)
- Witness: `recycleFlowsheet` · Gates: (refusals exercised in-suite; no standalone script)

**N3 — Effective stage K (column over a chemistry)**
- Owner: `ThermoPackage::stageK` in `src/thermo/ThermoPackage.cpp`
- Prod → Cons: per-stage reactive flash (`ReactiveVLE` `pEqAtm` on the subsaturated branch) → `DistillationColumn` MESH Jacobian (apparent basis only)
- Never: K=0 columns from an incipient K off a subsaturated trial; ions reaching the Jacobian
- Contract: `docs/design/sour-water-stripper-scope.md` §6a
- Witness: `stagedColumn` · Gates: `check_stage_identity`

**N4 — Model-boundary energy ledger**
- Owner: the independent audit beside the energy report (raw · declared step · remaining; assembles its own worlds via public `ThermoPackageBuilder`)
- Prod → Cons: per-unit `thermo{}` overrides → energy report, CSV surfaces (raw semantics unchanged)
- Never: the step charged to the unit as "unexplained"; the audit reusing `Flowsheet::thermoFor` (auditor ≠ auditee)
- Contract: `docs/design/model-boundary-energy-ledger.md`
- Witness: `molecularFlash` (per-unit override family) · Gates: `check_model_boundary_ledger`

**N5 — Balance diagnostics (mass · element · energy, default-on)**
- Owner: engine-owned reports; `src/thermo/ElementComposition.cpp` (ONE formula parser)
- Prod → Cons: converged results → report artefacts; GUI only draws (`gui/src/case/balances.ts` owns the chart arithmetic — no second copy in a plot component)
- Never: a second formula parser; a chart re-deriving per-component mass
- Contract: CLAUDE.md §6 (2026-07-19 / 2026-08-02)
- Witness: `sealedFractalPlant` · Gates: `check_element_composition`, `check_element_balance`, `check_default_reports`

## Batch, dynamic, post-processing

**B1 — Batch ledgers (material + energy + temporal utilities)**
- Owner: `src/unitOperations/batch/BatchUnitOperation.H` contract (TransferRecord/EnergyRecord, `notifyStateWillChange` pre-mutation, datum amendments)
- Prod → Cons: unit events → campaign closures, utility staircase (`reports/utilities/utilityDemand.csv`)
- Never: a quadrature where an exact state difference exists; transfers priced into duty records
- Contract: `docs/design/batch-temporal-utilities-proposal.md` §8; CLAUDE.md §6
- Witness: `batchRecipe` · Gates: `check_temporal_utilities`, `check_feed_switch`

**B2 — Ctrl first law (three probed routes)**
- Owner: dynamicCSTR route probe (canonical per-species / mixture-H / refusing Cp-convective), announced with reason
- Prod → Cons: enthalpy surface probing → energy rung of the accepted-step ledger (`balanceTrajectory.csv`)
- Never: route chosen by name; a claimed verdict on an unpriceable piece
- Contract: CLAUDE.md §6 (2026-08-01)
- Witness: `dynamicControl` · Gates: `check_ctrl_balance`

**P1 — Post-processing chain (sizing → costing → pinch)**
- Owner: `src/postProcessing/PostProcessor.cpp` factory; `src/postProcessing/PinchPass.cpp`
- Prod → Cons: `system/postDict` → `design/`, `economics/`, `reports/pinch/`
- Never: the pinch pass rewriting the network or saying "optimal"; costing without a designed equipment
- Contract: `docs/design/pinch-programme-scope.md`
- Witness: `designEconomics` · Gates: `check_pinch_p1`, `check_pinch_p2`, `check_economics_honesty`

## Data & verification machinery

**D1 — The standards tree (5 homes) & data tiers**
- Owner: `data/standards/{components,species,chemistry,parameters,conventions}` (+ `assets/`, `mixtures/`, `utilities/`); precedence standards > local
- Prod → Cons: curation acts → `Database` (exact-name O(1) lookup, `components/` physically FLAT)
- Never: the engine writing under `data/standards/`; a `components/<phase>/` split; third-party values in the public tree
- Contract: `docs/architecture/electrolyte-data-architecture.md`; CLAUDE.md §5/§7
- Witness: `propsBench` · Gates: `check_legacy_schema`, `check_source_licence`, `check_cosmo_scrub`

**D2 — Sealing & reproducibility (computational seal)**
- Owner: `src/core/DictCanonical.cpp` (the parsed-content claim); `bin/choupo-import` (dependency closure, observed via the consumption ledger)
- Prod → Cons: sealing acts → self-contained cases; the permalink hash (ADR, roadmap)
- Never: a seal that changes physics (importer PROVES agreement vs the golden, not just exit 0); byte-hash as the claim
- Contract: `docs/design/computational-seal-migration.md`; `docs/design/reproducible-permalink-sealing.md`
- Witness: `sealedFractalPlant` · Gates: `check_seal_schema`

**V1 — Goldens, anchors and the witness tier (runTests)**
- Owner: `bin/runTests` (kind = location, 6th column `anchor` = claim; `--witnesses` mode); `tutorials/WITNESSES` (the declared tier)
- Prod → Cons: case `expected` files → the suite verdicts; V&V §3 table
- Never: `--record` refreshing an anchor; an auto-generated anchor; a witness minted as a duplicate of an existing case
- Contract: `docs/architecture/verification-and-validation.md` §3a
- Witness: `molecularFlash` (carries live anchors) · Gates: `check_witness_tier`, `check_validation_subset`

**V2 — Factories & registration (every base class)**
- Owner: each base's `registerBuiltins()`, called explicitly in each `main.cpp` (e.g. `src/unitOperations/UnitOperation.cpp`)
- Prod → Cons: registration lines → `New()` lookups at case load; the WASM build (`make wasm` — a stale blob hides new types)
- Never: auto-registration macros/static initialisers; a native-only registration (GUI parity)
- Contract: CLAUDE.md §5 (factory pattern); §13 (WASM)
- Witness: `molecularFlash` · Gates: (registration exercised by every case; no standalone script)
