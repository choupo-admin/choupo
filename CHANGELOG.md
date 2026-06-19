# Changelog

All notable changes to **Choupo** are documented here.  The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[Semantic Versioning](https://semver.org/) (pre-1.0: minor bumps may carry
breaking changes).

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
