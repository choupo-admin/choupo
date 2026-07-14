# Changelog

All notable changes to **Choupo** are documented here.  The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[Semantic Versioning](https://semver.org/) (pre-1.0: minor bumps may carry
breaking changes).

## [Unreleased]

## [Choupo-2607] — 2026-07-14

Two threads under one stabilisation tag: a large **open compound-library
expansion** with release hygiene, plus the **pristine-electrolyte architecture**.

### Added (open compound library)
- **~28.8k group-estimated compounds** under `data/groupEstimative/` — identity +
  Joback / Lee-Kesler / Ambrose-Walton estimates from the open `chemicals` /
  `thermo` + RDKit toolchains, each `.dat` flagged as an ESTIMATE (never a
  measurement), engine-loadable, gated by `check_groups` (atom conservation).
  A stable nomenclature base (names / CAS / groups) students cannot silently rename.
- **UNIFAC groups filled on 25 standard components** (vocab-checked vs
  `unifac/groups.dat`).

### Changed (release hygiene)
- **`yieldReactor` built-in removed** — a mass-yield split blind to atoms could
  create or destroy elements; the case-local `userOp01` yield reactor stays as
  the teaching example of adding your own unit op.
- **`data/references/` retired** (superseded by `data/groupEstimative/`): the
  release ships Choupo's own open estimates, not third-party pointers.
- **No commercial-simulator interop in the public tree** — private benchmark
  tooling and validation suites are local-only; the public repo names no
  commercial simulator.

### Electrolyte architecture

The **pristine-electrolyte-architecture** work.  Native **208/0**, byte-exact
throughout.  Consolidates the 8-home / 2-axis electrolyte data architecture and
**retires the legacy `electrolyte{}` component block** — the arity-1 "saco" is gone.

> **Status: stabilisation tag, not a feature announcement.**  The electrolyte
> architecture is one to two days old, validated by AI-assisted design
> reviews and byte-exact regression only — **not yet
> reviewed by a human co-author nor exercised by real use.**  Byte-exact 207/0
> proves *no regression*, not *architecture correctness*.  Announce as a milestone
> only after human review + a case authored from scratch against the new tree.

### Changed
- **8-home electrolyte data architecture** (design settled 2026-07-01).  A substance's ROLE
  (lumped / dissociated / multi-ion / molten) is chosen by the `propertyPackage`,
  never stored on the substance, via two orthogonal axes: REPRESENTATION (the
  package activates) × REFERENCE (the method selects one of 4 discrete rungs).
  Homes: `components/` (identity + `dissociatesTo`) · `species/` · `phases/solid/`
  · `chemistry/` · `parameters/` · `propertyMethods/` · `propertyPackages/` ·
  `propertySets/`.  Canonical doc: `docs/architecture/electrolyte-data-architecture.md`.
- **`components/apparent/*` deleted** (the duplicate salt records); the builder
  reads salt identity + `dissociatesTo` from `components/`, solid from
  `phases/solid/`, anchor from `chemistry/salts/`.
- **The legacy `electrolyte{}` component block RETIRED** from all 21 salt `.dat`
  via expand-contract (shim → backfill `dissociatesTo` → repoint DSPM-DE +
  Crystalliser → delete).  cation/anion single-sourced from `dissociatesTo`;
  dHsoln/solubility from `chemistry/salts`.
- **"true species" purged** → *model species*: `species/` (was `components/true/`),
  `phases/solid/` (was `species/solids/`), `dissociatesTo`, `speciesComposition`.
- **halite dissolution dH corrected** 1370 → 3841 J/mol (phreeqc.dat
  `delta_h 0.918 kcal/mol`; the old value mis-cited the source).

### Added
- **`ENRTLMixedSolvent` — the generalized segment-based eNRTL** (Chen & Song 2004,
  DOI 10.1002/aic.10151) for a 1-1 salt in water+alcohol: segment local NRTL
  (ethanol = 1.811 C2H4 + 0.609 OH) + component-scale PDH + mixed-solvent
  infinite-dilution reference.  New `enrtlMixedSolvent` props op + a validation
  tutorial against the PRIMARY Esteso 1989 gamma_pm data (47 points, 0-90 wt%
  ethanol): **AAD 4.31% with ZERO refit** of the published parameters (aqueous
  1.0%; the +8% at 80/90 wt% is Esteso's own measured ion pairing, declared).
- **`thermoTest` tutorial** — one system {NaCl, CaSO4, ethanol, water}, five
  models: lumped vs Pitzer evaporators (BPE 2.11 vs 5.07 K — the representation
  axis on one operation), eNRTL antisolvent crystalliser, NRTL flash, Pitzer-HMW
  speciation+scaling (gypsum/halite SI).  In `tutorials/{steady,props}/thermoTest/`.

### Limitations (honest scope — declared, not hidden)
- **eNRTL is single-salt** *in this implementation* — the Chen-Song-Evans model is
  multi-salt by design; only Choupo's `ENRTLSingleSalt` treats one salt per case
  (the shipped eNRTL cases are single-salt, so this is a scope limit, not an error;
  a multi-ion eNRTL is a roadmap item, mirroring `PitzerHMW` on the Pitzer side).
- **eNRTL `calorimetricFit=false`** — the `tau(T)` is not calorimetrically
  calibrated, so the apparent molar enthalpy (heat of dilution, `L_phi`) is gated
  OUT of the energy balance; the antisolvent-crystalliser duty is therefore
  *materially approximate on the enthalpy side*.
- **Aqueous-only**: no redox (pe), no solid solutions, no non-aqueous/molten
  electrolyte yet (the reference-rung machinery accepts it; no case ships).
- Reference-datum **T-dependence is shallow** (a single ΔH, not a full T-function)
  for most salts.
- The `thermoPackage` path and the flat-vs-`identity{}` component dual-reader are
  **retained compat surfaces** (all ~200 tutorials use `thermoPackage`; it is the
  legitimate degenerate `propertyPackage`).

## [Choupo-2606] — 2026-06-30

The **property-architecture** release.  Native **202/0** throughout.  Choupo's
thermophysical properties become *Aspen-like declarative packages with
OpenFOAM-like explicit files*: **`propertyPackage` declares,
`ThermoPackageBuilder` assembles, `ThermoPackage` computes.**

### Added
- **The Aspen-like property architecture, implemented.**  A case SELECTS a
  `propertyPackage`; the `ThermoPackageBuilder` assembles a `ThermoPackage`
  (loads, never estimates); each `propertyMethod` declares its per-phase
  reference basis; `propertySets` are the reported quantities.  One stack serves
  electrolyte AND molecular (decisions U1–U4); the old `thermoPackage` is a
  degenerate package.  Documented across the **theory / props / developer** guides
  (the canonical section is the Developer Guide's *thermophysical property
  architecture*).
- **The entire electrolyte data tier consolidated.**  The 8 standards monoliths
  (`ions / pairs / mixing / enrtl / minerals / speciation / gases / exchange.dat`)
  are split into the per-file Aspen layout — `components/true/aqueous/`,
  `parameters/electrolyte/{pitzer,eNRTL}/`, `chemistry/{salts, mineralSolubility,
  aqueousSpeciation, gasLiquid, ionExchange}/`, `propertyPackages/`,
  `propertySets/`, `assets/resins/` — and **deleted**; the engine reads the tree
  via dual-leg readers (case-local overlay first, else standards per-file),
  byte-identical, with a per-kind faithfulness guard.
- **Phase 5 — the legacy salt-level electrolyte front-end retired.**  The 12
  electrolyte cases (4 Pitzer + 8 eNRTL) now select a `propertyPackage`; the
  builder assembles the `ElectrolyteActivity` via the `SaltFromCatalogue` helpers
  byte-identically; `ElectrolyteActivity::configure()`, the `(comps, model)`
  constructor, and the `model pitzer` / `model eNRTL` factory registrations are
  **deleted** (a `model pitzer;` thermoPackage now fails loudly).
- **SolidDryer: the drying air is a REAL STREAM** — no `(airTemperature, RH)`
  parameters and no phantom duty; the hot air brings the heat (its sensible
  cooling) and carries the moisture (a humid exhaust), adiabatic, and the energy
  balance closes with real streams (the Aspen `air` mixture, not a pseudo-comp).
  All four solidDryer cases migrated.
- **+12 flash-validated reference components** (CoolProp/Lemmon EOS, full
  provenance, the engine's `[estimate]` guard as the gate) — ethyleneOxide, the
  biodiesel FAMEs, carbonyl sulfide, hydrocarbons, specialised gases (151 total).
- **+19 aqueous-ion formation values** (Wagman 1982, each cross-checked against
  an independent 2nd source) — **boron** (H3BO3, B(OH)4-) for membrane boron-
  rejection speciation, the sulfate-scale set, trace metals (36/41 ions now
  carry a formation tier).
- **GUI:** stream enthalpy (H, Ḣ = F·H) in the Properties panel; the **Display**
  menu (units + significant figures, renamed from "Units").

### Fixed
- **GUI:** the solid molar flow read the crystal MASS as moles — a sugar powder
  read ~3.5 Mmol/h; now converted via the molar mass.
- **ChemicalPlantTutorial:** keep the drillable v2 — double-clicking a sector now
  opens it in a new tab (the original lacked the `.cho` sub-node markers).
- **economics:** IRR no longer returns `nan` (a finite bracket); the flagship
  economics case's revenue/opex SCALE is still off — economics stays in-progress.

### Changed
- Refreshed the CLAUDE.md standard-catalogue counts (56→151 components etc.).

## [v0.9.0] — 2026-06-24

The pre-1.0 consolidation release: the energy ledger closes across the board,
the dynamic/control story is now interactive end-to-end, the Property Explorer
grows a family of graphical analyzers, and the data catalogue nearly doubles
after a rigorous audit.  Gated by an AI release-QA storm (21 independent
validation passes -- 11 case validators + 10 data auditors): **199 PASS / 0 FAIL**, zero
blockers.

### Added
- **Dynamic + control, interactive in the browser** — all four binaries
  (`choupoSolve`/`Props`/`Ctrl`/`Batch`) build to WASM; `choupoBatch`/`choupoCtrl`
  write OpenFOAM-style real-time instant directories, harvested into a
  **TimeScrubber** that animates the transient.
- **The Control Room** — a live PID-tuning bench: watch a temperature signal
  oscillate, turn Kp/Ki/Kd, see IAE/overshoot/settling, with a **disturbance
  picker** (step/staircase/ramp/pulse/sine via sliders) and a one-point Bode
  read-out for the sinusoid.  Backed by an explicit **Signal forcing hierarchy**.
- **Opt-in adaptive time-stepping** (Rosenbrock23 local-error control, the ODE
  analogue of a Courant limit) for `choupoBatch`/`choupoCtrl`.
- **Graphical operating-line analyzers in the Explorer** — McCabe-Thiele
  (interactive R/q staircase over the real y*(x)) and the **binary flash**
  (tie-line + lever rule), both pure-TS redraws over the engine's VLE curve.
- **Property Explorer redesign** — chrome-minimal (collapsible rail, single
  toolbar, fixed-origin plot); SET·LENS·VIEW.
- **theoryGuide** grew 16 → 88 figures (a 6-domain figure campaign).

### Fixed
- **The energy ledger closes.** ChemicalPlantTutorial to 0.55% on the elements
  datum (crystals + heat-of-solution rung); the combined-cycle plant
  **70% → −0.05%** (the Gibbs combustor + turbine duties now reach the boundary
  CSV, and the global sweep no longer double-counts); isothermal CSTR emits its
  reaction duty (**process05 8.6% → 0.006%**).  Rankine/compressor-turbine cases
  close too.
- **ctrl feed-rate unit typo** `kmol/h → kmol/s` across all six ctrl tutorials —
  a 240-HOUR residence time had frozen the chemistry and made disturbances
  invisible (the reactor moved 0.02 K).
- **Reactor product phase** — CSTR/PFR now inherit the inlet phase instead of
  defaulting to liquid (WGS products were mislabelled liquid at 600 K, corrupting
  the enthalpy).
- **Swept cases show stream values in the GUI** — the SweepDriver now emits a
  representative result so the flowsheet draws (was blank `— K — Pa`).
- **Tutorial headers** that asserted a result the run didn't deliver
  (evaporator "50%" → 82%, Dowtherm "530 K" → 623 K, ctrl01 window).

### Data
- **150 entries promoted** `/proposed` → `/standards` after a 10-professor
  audit: **43 components** (CoolProp reference-EOS skeletons + curated
  literature, primary-cited, VLE-validated) + **107 binary pairs** (NRTL/UNIQUAC/
  Wilson, zero golden-master movement).  **0 mechanisms** — every synthetic /
  no-grant / unvalidated kinetic set held back.  126 rejected on
  provenance/physics; catalogue audit (identity + unique-CAS + no-ESTIMATE) clean.
- **Data-governance doctrine** ratified (ARITY→SCOPE→KIND; primary-source per
  value; `docs/ai/data-doctrine.md`).

## [v0.3.0] — 2026-06-22

A large release: new capabilities plus a point-by-point QA pass (an MIT-student
review storm + two MIT and two CalTech "virtual professors") that closed eight
real engine bugs, each gated and with primary-source provenance.

### Added
- **Variable parametrisation + What-if** as a KPI instrument; transient
  tinkering (edit Properties-box numbers, run, never written to disk).
- **Context-sensitive F1 help** → the relevant theory-guide section.
- **Gas-phase CHEMKIN kinetics** + a **Rosenbrock23 stiff ODE integrator**
  (validated on Robertson) + NASA-7 Cp; H2/O2 ignition.
- **Polymer property estimators** — Van Krevelen density + Yang 2020 Tg
  (CC-BY) — in the Explorer; a **polycaprolactone production plant** tutorial.
- **PHREEQC electrolyte data** expansion (+52 entries; public-domain USGS).
- **Honest test harness** — `runTests` now FAILS on a non-zero exit / missing
  result block (the forbidden `binary && PASS` anti-pattern is gone);
  `.known-broken` / `.expect-nonconvergence` markers make breakage visible.

### Fixed
- **Gibbs reactor pressure reference P°** (gas term + directMin V-L liquid
  term): treated `p.P` in Pa as bar — only bit Δn≠0 reactions, so **steam
  reforming went 1.8% → 99%**; the twin of the earlier `Kc` bug.
- **sprayDryer** — energy-capped drying: the air cannot cool below the
  wet-bulb, so no more sub-zero (−53 °C) product or η>1; excess solvent stays
  in the powder (a wet product).
- **Spiral-wound membrane** — mass balance now closes to machine precision
  (was ~1% mass created from inconsistent solution-density conventions).
- **Water/n-butanol LLE** — cited **Winkelman et al., FPE 284 (2009) 71–79**
  UNIQUAC restores the genuine liquid-liquid split; the UNIQUAC engine now
  evaluates the full `A(T)=a+bT+cT²`.
- **IsothermalFlash** — removed a phantom LL-decanter duty (the β-liquid was
  priced as a vapour); Q≈0 for an isothermal split.
- **Honest vf/phase inference** — a stream that omits `vf` is no longer
  silently "liquid"; a supercritical carrier gas is inferred as vapour with a
  loud advisory (the no-silent-crutch credo).
- **Provenance** — declared citations wired into the structured `source` field
  (IAPWS, Appelo 2015, Yang 2020); synthetic data labelled honestly.
- **Spurious txy/VLE envelopes** suppressed for non-VLE units.
- **24 tutorial READMEs** corrected against real output; pitzer prose fixed
  (Appelo 2015, not Pitzer & Mayorga 1973).

## [v0.2.0] — 2026-06-09

First version since the launch.  The banner was deliberately held at `v0.1.0`
while the property, electrolyte, crystallisation and model-boundary work
matured; this release captures it.  Pre-1.0: minor bumps may carry breaking
changes.

### Property estimation & the Property Explorer

- **Property-architecture realised** (estimation = a resolution problem solved
  at *curation* time, not runtime): per-value `Origin` provenance parsed and
  emitted; `ConstantEstimator` factory (Joback extracted behind it); a pre-solve
  `--gap-report` (`AuditFinding`); a package minimum-parameter-set audit
  (MISSING / ESTIMATED / PLACEHOLDER, warn-only at the validation boundary); a
  `data/proposed` **UNVERIFIED** tier (precedence `proposed < standards <
  case-local`); self-describing `groups{}` recipe back-filled into 260
  components with an MW-sum consistency check.
- **Property Explorer (GUI):** reactive auto-plot; pure-compound P–T phase
  diagram (solid + liquid + vapour, water); binary VLE; ternary VLE
  boiling-temperature surface and ternary LLE via UNIFAC (fanned across WASM
  workers); multi-method comparison (SEE the spread); case-local components +
  UNIFAC groups + in-Explorer estimation; a **psychrometric chart** for any
  carrier + condensable (adiabatic-saturation and true wet-bulb via the Lewis
  number).
- Joback 15 → 40 groups (full Poling Tab 2-2); refuse `Psat` above `Tc`;
  transport decoupled from the EoS; ammonia liquid viscosity corrected;
  duplicate-CAS audit + load-time identity guard.

### Electrolytes & crystallisation

- **Electrolyte activity models:** Pitzer and eNRTL as runnable `activityModel`
  options; **temperature-dependent** eNRTL/Pitzer (`tau(T)`, `A_DH(T)` via
  `eps_w(T)`/`rho_w(T)`); mixed-solvent eNRTL drowning-out; `Ksp(T)` van't Hoff;
  a self-contained per-case electrolyte catalogue (`constant/electrolyte/`).
- **Crystalliser:** cooling and antisolvent (drowning-out) modes; MSMPR and a
  population-balance (FVM) PSD; dual-output wet cake (crystals + mother liquor
  via `cakeMoisture`); a per-solute `solute` selector; a cold-utility duty stub;
  a two-crystalliser KHT/KCl selective separation with ethanol recovery + recycle.

### Model boundaries & dignified fractal units

- **The model-boundary rule (forum 5/5):** *H is the conserved truth; T is the
  model-dependent readout of it.*  At a thermo-model boundary Choupo holds
  `(T,P,z)` and lets `H` step (visible), never a silent T-nudge.
- **Model-boundary audit:** per-boundary `dH` (kJ/mol + kW) and the implied
  `dT`, summed into a plant model-inconsistency line; **hard-refuses** across a
  speciation change (electrolyte to molecular).  Surfaced in the run log *and*
  the result JSON + GUI run summary.
- **Cascade made loud:** every unit announces `thermo: inherited (global)` vs
  `LOCAL override`.
- **Dignified fractal units:** every unit may carry its own `system/` +
  `constant/` (flexible — inline remains valid); a unit's `constant/` is its
  local-data home.
- `bin/curate/overlay_index.py`: a repo-wide datum-drift scan over `.dat`
  overlays (flags the same datum with disagreeing values).

### Data, energy & GUI

- Henry's law: **+195 Sander (2015) CC-BY** gas–water pairs (validated); the
  CODE-vs-DATA licence policy codified (bundled data may be copyleft as an
  aggregate; per-source provenance + NOTICE).
- Heat duties / shaft work shown **on** the flowsheet (energy streams + dashed
  wires); the energy balance closes counting unit duties; the adiabatic flash
  (`Q=0`) leads as the honest default.
- Numerous GUI fixes (psychrometric chart, node T/P significant figures, duty
  wires, colour-by).

## [v0.1.0] — 2026-05-26

Initial release.

### Architecture

- Three-layer simulator: **outer driver** (sweep / optim / parameter
  estimation / DesignSpec) → **simulator core** (sequential modular with
  Newton-on-tears recycle, plus Wegstein as an alternative) → **post-
  processor** / reports chain.
- Four binaries by problem class:
  - `choupoSolve` — steady-state simulation (`F(x) = 0`)
  - `choupoBatch` — batch / time-dependent simulation (`dY/dt = f`)
  - `choupoCtrl` — dynamic continuous with control loops
    (`dY/dt = f(Y, u, t)`, controllers writing MVs onto units)
  - `choupoProps` — property evaluation + parameter fitting
- Plain-text case directories (`system/` + `constant/` + optional
  `code/`), plain-text hierarchical dicts with physical-dimension
  tracking.
- Fractal multi-sector flowsheets: `unit ⊂ sector ⊂ plant`, recursive
  flatten with namespacing, folder cascade for `thermoPackage` /
  `controlDict` / `constant/components`.

### Thermo

- Activity coefficients: ideal, NRTL, Wilson.
- Equations of state: ideal gas, SRK, Peng-Robinson — both cubics with
  vdW one-fluid mixing and optional binary interaction parameters.
- Henry's law for solutes (van't Hoff temperature dependence).
- Pitzer electrolyte osmotic coefficient (1:1 salts).
- Ideal-gas H/S/Cp on `ThermoPackage` with the JANAF / NIST reference
  state; departure functions from the cubic EoS.
- Transport (selectable sub-models):
  - Gas viscosity (Chung), thermal conductivity (Eucken), binary
    diffusivity (Fuller).
  - Liquid viscosity (Andrade, Vogel), thermal conductivity (Sato-Riedel,
    Latini), binary diffusivity (Wilke-Chang, Scheibel).
- Property axioms: intrinsic universal data on the component file;
  pair-dependent data (NRTL pairs, Henry pairs) in
  `data/standards/<feature>/`; sample-specific data (sorption isotherm,
  drying kinetics, crystallisation kinetics) in the case under
  `constant/`.

### Unit operations

- Flash: isothermal (VL / LL / VLLE via direct Gibbs minimisation),
  adiabatic (credo-pure: `{ P; }`), bubble-T, dew-T.
- Distillation: Wang-Henke (bubble-point), simultaneous MESH (Newton),
  shortcut FUG (Fenske-Underwood-Gilliland-Kirkbride).
- Reactors: CSTR, PFR, batch reactor (incl. adiabatic mode, multi-
  reaction, reversible kinetics via detailed balance), Gibbs reactor
  with three selectable methods (element-potential / reactiveFlash /
  directMin).
- Heat transfer: 1-stream heater (gas- or liquid-aware), 2-stream HX
  (ε-NTU rating).
- Rotating equipment (credo-pure hardware = W_shaft + η):
  compressor, turbine, pump.
- Mass-transfer separations: absorber, stripper (coupled mass +
  energy, stage-by-stage).
- Solids: cyclone (Lapple / LeithLicht / IoziaLeith / Barth /
  Muschelknautz, selectable), bag filter, gas-solid splitter,
  crystalliser (equilibrium / MSMPR / discretised PBE FVM), spray
  dryer (atomisation + drying curve + GAB sorption equilibrium),
  contact / through-circulation solid dryer.
- Membranes: spiral-wound NF / RO module with selectable sub-models for
  film mass-transfer (Schock-Miquel Sherwood), pressure drop
  (Schock-Miquel friction), and osmotic pressure (van't Hoff / Pitzer),
  plus multi-element trains.
- Mixer, splitter, flowsheet, dynamic CSTR.

### Numerical layer

- Hand-rolled Newton-1D + bracketing fallback, Newton-ND with
  central-difference Jacobian + Gauss + plain backtracking line
  search, Wegstein acceleration, RK4, Nelder-Mead direct search,
  Levenberg-Marquardt.
- Phase-stability TPD (Michelsen) for the flash; multi-start direct
  G-minimisation for LL and VLLE.

### Outer drivers

- `sweep` (parametric scan), `optimization` (Nelder-Mead),
  `fitBinaryPair` (LM regression of binary interaction pairs),
  `designSpec` (outer Newton on user-declared
  `$variables` with KPI / stream targets).

### Reports

- `streamTable`, `massBalance` (global + per unit), `energyBalance`
  (per unit, with both sensible+latent and elements-formation
  reference states), `utilities` (aggregation by stream `category`),
  `profiles` (per-unit internal sweep), `computed` (post-processing
  expressions via the mini-arithmetic evaluator), `design` (sizing),
  `economics` (Guthrie), `energyStreams` (direct scalar wires
  between units), `spreadsheet` (consolidated coloured `.ods`).

### Energy streams

- Direct scalar wires between unit ops (turbine shaft → compressor,
  heater Q from a furnace, …): `energyOutputs ( { expression … } )`
  on the producer + `energyInputs ( { from … target … } )` on the
  consumer, evaluated before the consumer's solve().  Typed ports
  (`work` / `heat`), the usual sign convention.

### Web GUI

- React + React Flow + Plotly + Vitest in `gui/`.
- WASM build of `choupoSolve` and `choupoProps` (the steady + property
  binaries) via Emscripten; the GUI dispatches by case
  `controlDict.application`.
- Live editing of per-case operation scalars with download to disk
  (the dicts on disk remain the source of truth).
- Tutorial loader (File → Open Tutorial), drag-resizable output
  pane, trajectory CSV plotting, PropsView for property scans, energy
  wires rendered as dashed edges in the flowsheet canvas.

### Tutorials

- 105 end-to-end cases under `tutorials/{steady,batch,ctrl,props,plant}/`.
- Anti-regression sweep via `bin/runTests` with per-case golden
  masters (`expected`) and a NaN/inf guard on every run.

### Licensing and identity

- **GPL-3.0-or-later (+ commercial)** — single permissive licence; no CLA;
  inbound = outbound.  Copyright **Vítor Geraldes** (the author).
- **"Choupo" is a trademark of TalentGround Lda.** (the founder's
  family holding) — separate from the code copyright (no open-source licence grants
  no trademark rights).  Trademark and copyright are distinct rights
  here: the name belongs to the holding, the code is authored by Vítor
  Geraldes under GPL-3.0-or-later.
