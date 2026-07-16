# The adsorption program — Phase 0 architecture note

**Status: SURVEY + CONTRACT (design forum #104/#105).  No physics code is
authorized by this note; Phase 1 starts only after the forum reviews it.
Documentation requirement (Vítor, 2026-07-11): every phase ships its
manuals — theoryGuide physics, userGuide grammar, annotated catalogue
entries, docs/ai authoring notes — never a documentation block at the end.**

## 0. What ALREADY exists (the survey's correction to the premise)

The #104 program assumed a green field; the engine already carries a
working nucleus:

| exists | where | what |
|---|---|---|
| `Adsorbent` entity + registry | `src/thermo/adsorbent/Adsorbent.{H,cpp}` | identity, `rho_bulk`, per-species Langmuir params, van't Hoff `b(T)` anchored at 298 K |
| adsorbent catalogue | `data/standards/adsorbents/{zeolite5A,zeolite13X,activatedCarbon}.dat` | `adsorbent{name;type;rho_bulk}` + `isotherms{ <comp>{q_max;b_298;dH_ads} }` + provenance; teaching-grade 298 K fits, flagged as such |
| `psa` unit | `src/unitOperations/separation/PSA.{H,cpp}`; tutorial `psa01_h2_psa` | equilibrium-theory cyclic-steady split (Knaebel/LeVan), competitive Langmuir, isothermal; explicitly NOT: LDF, breakthrough, cycle time, thermal swing, hydraulics |
| `ionExchanger` | `src/unitOperations/separation/IonExchanger.{H,cpp}` | Gaines-Thomas total equilibrium over the speciation solver; resin records in `data/standards/assets/resins/` |
| GAB moisture sorption | `Component.cpp:248` (`sorption{Xm;C;K}`) read by SolidDryer/SprayDryer | the UNARY exception: moisture equilibrium as a material property of the solid |
| ODE integrators | `src/solver/ODE/` (RK4, EulerSI, Rosenbrock23 + adaptive control, Jacobian) | ready for a method-of-lines bed |
| LM fit machinery | `src/propertyOps/FitParameters` | bounds, standard errors, 95% CI, correlation matrix, reduced chi² — but ONLY `kind=T_bubble` today |
| sequencing grammar | choupoBatch recipe (time+condition events; transfer/setParameter), choupoCtrl controllers | the seed of the Phase-4 cycle sequencer |
| pressure-flow machines | Compressor/Turbine/Pump (`W_shaft` real, isentropic core), Valve (isenthalpic) | the Phase-4 vacuum/compression work terms |

## 1. The entity contract (#104's separation, mapped onto the engine)

* **`Adsorbent`** (exists; EXTEND, don't fork): identity/material,
  `rho_bulk` (exists) + particle density, intraparticle porosity,
  particle size/distribution, Cp, k, pore area/volume, stability notes,
  provenance.  Equipment parameters NEVER live here.
* **`AdsorptionEquilibrium`** (today: the `isotherms{}` block inside the
  adsorbent file): adsorbate(s) + adsorbent + model + parameters per T or
  a declared T-correlation + **loading basis** + pressure/concentration/
  fugacity basis + validity domain.  MIGRATION DECISION FOR THE FORUM:
  keep packaged per-adsorbent (arity is honoured — the block is already
  pair-scoped) vs split into a per-model pair catalogue like `parameters/<MODEL>/`
  (`adsorption/<adsorbate>__<adsorbent>.dat`).  The survey leans to the
  PAIR CATALOGUE for symmetry with every other pair-scoped datum and for
  CurationBundle routing, with the adsorbent file keeping only material
  identity — but existing files migrate, so it is a forum call.
* **`AdsorptionTransport`** (missing): film / macropore / micropore /
  surface diffusion or LDF `k`, each with the SCOPE it was fitted at
  (pair, particle, or bed+fluid+regime) declared on the record.
* **`PackedBed`** (missing): geometry, void fraction, wall/heat transfer,
  dispersion + pressure-drop correlations — equipment records, in the
  case's `design/`-adjacent home, never on the material.
* **Datasets**: equilibrium isotherm points / uptake kinetics /
  breakthrough curves are three DISTINCT dataset kinds, all routed by the
  CurationBundle (`docs/architecture/evidence-pipeline.md`).

**Loading basis is a contract blocker (#104): `mol/kg dry adsorbent`,
`kg/kg`, `mol/m3 pellet` must be explicit units converted by the engine;
no naked `q` anywhere.  Gas-side driving force declares partial pressure
vs fugacity; liquid-side declares concentration vs activity.**

## 2. The gaps (verified by grep, file:line in the survey)

1. No isotherm FACTORY (Langmuir is hardcoded in `Adsorbent.cpp`; no
   Freundlich/Toth/Sips/D-R/IAST).
2. `FitParameters` cannot fit isotherms (`kind=T_bubble` only) — the LM
   core is reusable; Phase 1 adds a new kind.
3. No LDF / transport records at all.
4. No 1-D bed: no generic method-of-lines or finite-volume mesh (PFR and
   membranes march axially ad-hoc); Phase 3 builds the reusable kernel on
   the existing ODE integrators.
5. No CSS solver (the `psa` unit's equilibrium theory bypasses it).
6. No `batchAdsorber`.
7. No breakthrough datasets anywhere in `data/` or `tutorials/`.
8. Recipe grammar has no cycle-step/valve vocabulary (Phase 4 extends it).

## 3. Phase plan with commit granularity (each phase ships its manuals)

* **Phase 1 — properties + headless regression.**  (a) `IsothermModel`
  factory (explicit registerBuiltins, house pattern): `henry`, `langmuir`
  first; `Adsorbent` delegates (byte-identical for the 3 catalogue
  files); (b) loading-basis units in the dict parser; (c) `FitParameters`
  gains `kind=isotherm` reusing LM/bounds/covariance; (d) gates: Henry/
  Langmuir analytic limits, unit invariance, zero-noise synthetic
  recovery, adversarial rank deficiency, proposal CLI round-trip.
* **Phase 2 — `batchAdsorber`** (closed contact, exact conservation; LDF
  first kinetics; heat of adsorption on the canonical H surface; ledger +
  named gaps).  Analytic LDF golden.
* **Phase 3 — 1-D transient bed kernel** (method of lines on the ODE
  integrators; Danckwerts BCs under dispersion; Ergun; gas/solid/wall
  energy with local-thermal-equilibrium first; staircase validation:
  no-adsorption transport, plug-flow limit, integral balances, reference
  breakthrough, mesh/time refinement with PUBLISHED discretization
  error).  `choupoSolve` later exposes only a pseudo-steady rating
  DERIVED from this kernel — never a second algebraic model.
* **Phase 4 — cycle sequencer + PSA/VSA** (recipe-layer extension:
  pressurize/feed/depressurize/blowdown/purge/repressurize/equalize;
  real compressor/vacuum work in the ledger; CSS as a FIXED POINT of the
  full-cycle map with per-cycle scaled norms, cyclic balances, purity/
  recovery/productivity/specific energy; single bed + prescribed
  boundaries first, then two-bed equalization; Wegstein/Anderson
  acceleration only after direct iteration validates, with fallback).
* **Phase 5 — TSA** (after the bed's thermal balance closes; VSA is PSA
  with a vacuum boundary, never a duplicated unit op).  SMB and detailed
  diffusion models stay OUT of the first program.
* **GUI**: no adsorption GUI — the Curation workspace registry/plots
  extend (q-P/q-C per T, uptake q-t, breakthrough c/c0-t, z-t profiles).

## 4. Conflicts / decisions for the forum

1. **Pair catalogue vs per-adsorbent packaging** (§1) — the one real
   ontology decision; everything else is additive.
2. The existing `psa` unit KEEPS its equilibrium-theory identity as the
   shortcut/teaching model (honestly bannered, as today); the Phase-3/4
   bed+cycles are a NEW capability, not a replacement — both survive,
   like Wang-Henke vs simultaneous.
3. The GAB `sorption{}` block on components stays where it is (drying
   moisture is a material property of the SOLID, a different physical
   object from a designed adsorbent pair); the doctrine note gets a
   sentence so nobody "unifies" them wrongly.
