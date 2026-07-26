# Changelog

All notable changes to **Choupo** are documented here.  The format follows
[Keep a Changelog](https://keepachangelog.com/).  Releases are dated, not
semantic: the public name is `Choupo-YYMM`, the immutable git tag is
`vYYMM`, and the internal version string is `YYMM` (so `Choupo-2607` =
tag `v2607` = version `2607`).  Development happens on the `dev` branch
(`Choupo-dev`); `main` is always the latest stable release.
**Choupo-2607** is the first version.

## Choupo-dev (2026-07-25/26)

* **choupo-lint** (`choupoSolve --lint`): validate a case without solving it.
* **Sequential-plan contract**: declared order + tears validated at the
  flatten seam; six named refusals; non-converged recycle exits 1.
* **Reactive electrolyte VLE** (section 6b, unit-local): NH3/water spike
  (flash09) and the acetic mirror (flash10) -- simultaneous speciation +
  phase equilibrium, streams stay apparent, pH solved; acetic adds VAPOUR
  DIMERISATION priced in the saturation check (Chao & Zwolinski 1978).
* **Aqueous chemistry declared once, read by units**: `aqueous {}` readable
  with any formulation; `ThermoPackage::speciateAqueous()`; units never
  choose or construct chemistry (membrane, ED, ion exchanger migrated);
  `chemistryDict` owns the admitted solids, units keep only policy.
* **The SI shows its work**: the membrane scaling audit prints the full
  chain (totals -> free+complexes -> gamma -> activity -> IAP vs Ksp).
* **Chemical-family views from the engine**: `choupoProps --family iron`,
  `--aqueous-graph`; navigation ontology in `metadata/` (outside the sealed
  tree), mediator-aware family propagation.
* **Typed identifiers**: ComponentId/SpeciesId/SolidId strong types; the
  component->species bridge is declared and stoichiometric (aqueousMapping /
  dissociatesTo); lexical crossings are compile errors.
* **F2 identifier campaign EXECUTED**: p/m charge mangles gone, redox in
  roman numerals (FeII/FeIII, CuI/CuII, MnII/MnIII), chemistry/ files named
  by reaction, identity single-homed, 42 aqueous sealed cases re-imported.
  The `aq` suffix stays as the interim lexical disambiguator.
* **VT-2005 licence separation**: the public tree ships references, never
  the values; `bin/choupo-import-cosmo` installs the user's own copy into
  gitignored `data/local/cosmo/`; cosmoSAC01 regresses on synthetic
  teaching surrogates.  Sealed-mirror sweep: 276+ cases re-imported.
* **Sealing leak fixed**: PitzerHMW pair enumeration obeyed the sealed
  closure (it read the installation catalogue unconditionally).
* **Sealed corpus**: every top-level tutorial carries
  `constant/propertyManifest` + hashed record copies (283 sealed, 2
  live-overlay demos exempt by design; `check_sealed_corpus` gate).
* **Reactive chemistry is KPI-bound**: the reactive flash publishes `pH`,
  `p_eq_sum_atm` and -- when a volatile dimerises -- `p_mono_atm`,
  `p_dimer_atm`, `dimer_share`, so sweeps and outer drivers read the
  chemistry acting with T.  New tutorial `flash11_acetic_T_sweep` (T swept
  328->368 K inside the subsaturated window: total volatility climbs, the
  dimer share falls).  The water-analysis charge-imbalance advisory no
  longer fires on stoichiometric (component-derived) totals -- a neutral
  acid delivered as its conjugate-base master is balanced by construction.
* **Declared bridges anchor reactive families**: the reactive builder reads
  a component's `aqueousMapping` FIRST; element-marker inference stays only
  as the unambiguous legacy fallback (two masters carrying the same marker
  now refuse by name, pointing at the typed bridge).
* **ThermoResolver / SystemClassifier (ratified three-way 2026-07-26)**:
  components carry the substance-level FACT `aqueousSpeciation none|<set>;`
  (vapour reactions deliberately excluded); `classifySystem` reads facts --
  never names, never case lists -- and classifies solvent (DECLARED, no
  `if water`), apparent electrolytes, molecular reactives, molecular
  nonionising, UNKNOWN (refused inside electrolyte systems, curation remedy
  named).  The recommended package is PERSISTED in the case; the runtime
  classifies the sealed system, verifies the declaration and announces --
  `bin/choupo-resolve [--draft]` is where the recommendation is born, and
  choupo-lint surfaces the report.  Approximations are DELIMITED:
  `approximations { idealMolecularVLE { components ( ... ); } }` -- the
  builder refuses the approximation for anything unlisted and refuses
  listing anything the classifier did not find nonionising.  New gate:
  `check_resolver_coherence` (facts vs bridges vs chemistry; phase purity).
* **New tutorial `flash12_nh3_acetic_ethanol_reactive`** (the resolver's
  reference case): NH3 + HAc neutralise into an ammonium-acetate buffer
  (pH 4.62 ~ pKa_HAc) with ethanol as an authorised ideal-Raoult molecular
  co-volatile (`p_ethanol_atm` KPI) -- three speciating actors, four
  volatiles, dimer priced, subsaturated, sealed; `choupo-resolve --draft`
  regenerates its declared dict from the feed.
* **The two-phase reactive slice**: the coupled Newton generalises to n
  volatiles ((ln V, softmax vapour odds); the 2-volatile logit is the m = 2
  case), the acetic VAPOUR DIMER re-weights the vapour mole balance
  explicitly (v_HAc = t_mono + 2 t_dim, monotone inner reduction) and its
  association enthalpy is priced EXACTLY into the flash duty
  (h_dim = 2 h_mono + dH, announced); the authorised molecular co-volatile
  carries its ideal-Raoult leg inside the same Newton.  New tutorial
  `flash13_acetic_ethanol_vacuum_flash`: V/F = 0.415 at 358.15 K/0.65 atm,
  ethanol strips (y = 0.169), the buffer HOLDS the ammonia (y_NH3 = 3e-4,
  99.97 % liquid-bound as NH4+), liquid pH rises 4.62 -> 4.88.  flash10/12
  stay subsaturated by design (their single-liquid lessons); the stale
  "refused" wording is swept.
* **Mixed-solvent v1 (same-day, on Vitor's order)**: the reactive liquid's
  molecular backbone (solvent + nonionising co-volatiles, ion-free
  x-basis) can declare the FULL curated NRTL pair --
  `activityModel { ionic davies; molecular NRTL; }` -- never a
  gammaInfinity constant.  Solvent activity decomposes multiplicatively
  (a_w = gamma_w x_w * aw_ionic, no double counting); ions stay Davies on
  water-referenced molality; the network K's stay water-referenced (the
  transfer term is the NAMED next slice); an authorisation may not shadow
  a declared model.  The sealed pair record rides the closure BECAUSE it
  now has a reader.  flash13 moves onto the modelled route (gamma_EtOH =
  2.97 triples the ideal volatility; V/F 0.415 -> 0.580; pH 5.03) and
  flash12 stays the deliberate ideal-authorised comparison pair;
  choupo-resolve recommends the modelled route whenever the backbone
  pairs exist.
* Thirteen new curation gates in `runTests` (312 PASS / 0 FAIL).

## [Unreleased]

## [Choupo-2607] — 2026-07-14, consolidated 2026-07-19

Three threads under one stabilisation tag: a large **open compound-library
expansion** with release hygiene, the **pristine-electrolyte architecture**,
and the **2026-07-19 consolidation wave** below.

### Consolidation wave (2026-07-15 → 2026-07-19)

- **v2-native case grammar.**  `constant/thermoPhysPropDict`
  (`recordType thermophysicalPropertySystem; schemaVersion 2;`) is THE case
  grammar: the builder assembles every `equilibrium.formulation` natively
  (`gammaPhi` / `gammaGamma` / `diluteSolution` / `phiPhi` /
  `electrolyteGammaPhi`), the v1 `propertyDict` reader and the `translateV2`
  scaffold are deleted, and a v1 case gets a named refusal pointing at the
  migrator.  Active chemistry selection lives in `constant/chemistryDict`.
- **Sealed, self-contained tutorials.**  `bin/choupo-import` mirrors each
  case's dependency closure into its own `constant/` under a sha256
  `propertyManifest` (`sealed true;` forbids catalogue fallback); the corpus
  runs with `data/standards/` hidden.  A seal-drift gate audits sealed copies
  against the live catalogue.
- **Balance diagnostics, three levels — mass, per-element atoms, energy.**
  One shared formula parser (`ElementComposition`, IUPAC/CIAAW 2021 atomic
  weights); the steady `elementBalance` report is a DEFAULT diagnostic of
  every converged run (opt-out `enabled false;`), with
  FULL/PARTIAL/UNAVAILABLE honesty states and named refusals; batch carries
  material+energy campaign ledgers (exact state differences on the elements
  datum); choupoCtrl integrates an accepted-state ledger
  (`balanceTrajectory.csv` + sidecar) for mass + per-element laws, and the
  dynamicCSTR physical-energy claim honestly refuses pending its
  reformulation.  `elementalComposition{}` gives formula-less substances a
  declared, provenance-gated composition.
- **Stream-face closure.**  The aggregated snapshot is `streamFaces/` on
  disk and `faces{}` in dicts; a `streams {}` block is refused at every node.
- **PC-SAFT non-associating core** (Gross & Sadowski 2001) validated ~1 %
  against literature; **COSMO-SAC 2002** with named multi-set profiles.
- **GUI.**  Global balances are the landing surface; ONE "Element balance"
  view (total atoms in/out + per-element detail, sealed only when every
  element closes); the plots sidebar shows only the open result's views;
  pinch no-recovery states conclude once with every stream drawn; the
  landing is capability-aware and phone-safe; the Explore bench synthesizes
  v2 natively.  Incremental WASM build (clean 13 min → ~1 min; correct
  invalidation on sources, flags and standards content).
- **Docs from a blank slate.**  Every LLM surface (`docs/ai/`, AGENTS.md,
  README, CLAUDE.md) and all seven guides teach only the v2 grammar; the
  theory guide gains "Balances: mass, elements, energy"; F1 deep-links cover
  the Control workspace and the balance family; the retired-name gate scans
  every doc surface for v1 tokens.  `docs/architecture/2608-handoff.md`
  records the state, debts and deferrals.

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
