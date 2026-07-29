# Changelog

All notable changes to **Choupo** are documented here.  The format follows
[Keep a Changelog](https://keepachangelog.com/).  Releases are dated, not
semantic: the public name is `Choupo-YYMM`, the immutable git tag is
`vYYMM`, and the internal version string is `YYMM` (so `Choupo-2607` =
tag `v2607` = version `2607`).  Development happens on `main`, the default
branch, which carries `Choupo-dev`; a release is an immutable tag.
**Choupo-2607** is the first version.

## Choupo-dev (2026-07-28)

* **The development line moved to the DEFAULT branch — `main` is now
  `Choupo-dev`, and `dev` retires.**  The previous arrangement froze `main`
  at the last release and did the work on `dev`, claiming OpenFOAM-dev as its
  model.  Checking rather than remembering settled it: OpenFOAM.org keeps one
  repository per version line (`OpenFOAM-dev`, `OpenFOAM-13`, `OpenFOAM-12`,
  ...) and in *every one of them the default branch is that line's own* — no
  repository there holds "default = frozen release, side branch = the work".
  Two lessons taken: the development line owns the default branch, and a
  release is **maintained**, not photographed (a `release-YYMM` branch is cut
  from its immutable `vYYMM` tag only on the day a patch actually ships).
  The old layout had also duplicated the release — `main` and `v2607` were
  meant to name the same thing, and `main` had already drifted 3 commits past
  the tag: the arity sin, in the repository's own structure.  Concretely this
  also DELETES a click: the `github-pages` environment admits only the default
  branch, so publishing from `dev` needed a branch rule that no longer exists
  — what publishes and what the environment allows are now the same branch by
  construction (`publish-site.yml` triggers on `main`).  Rationale and
  procedure in `RELEASING.md`; `CLAUDE.md` §2 supersedes the 2026-07-20 note.

* **The tree compiles CLEAN: 40 warnings -> 0**, and two of them were real.
  - `NewtonND`'s backtracking line search can EXHAUST (every trial infeasible,
    or none reducing the norm before alpha falls under `minAlpha`) and then
    fell out having assigned NOTHING: the iteration carried an uninitialised
    `normFNew` into `normF` and moved a possibly-EMPTY `FxNew` into `Fx`, so
    the convergence test, the iteration hook and the returned residual were
    all reading memory nobody wrote.  An exhausted search is now a FAILED
    step: bail with the last good iterate and `converged = false`, the same
    posture as a singular Jacobian.
  - `VleConsistency` had a dangling `else` binding to the INNER `if`: with a
    named `partner`, every component that did not match ran the
    two-component fallback and overwrote `i2`.  It landed on the right index
    by arithmetic accident (n == 2 is the only case where the branch does
    anything), never by the control flow anyone wrote.
  The rest were noise that hid them: 20 missing-field-initializers cured at
  the struct (`PairResolution`'s five audit fields carry explicit defaults --
  an audit detail nobody filled is ABSENT, not zero), a `/*` inside a comment,
  two misleading-indentation lambdas, three unused `RTt` (this layer works in
  g/RT throughout), a member-init list disagreeing with declaration order, and
  an unused-but-documenting parameter now named out.
* **`make STRICT=1` makes a warning an error.**  Opt-in, not the default: a
  newer compiler invents new warnings and a user on one we never tested must
  still be able to build.  Development holds the line; distribution stays
  kind.

* **`phaseSet auto`: the phase set decided, not typed.**  The case dicts have
  said for a while that "the phase set is a RESULT, not an input", and then
  made the author type it.  Under `auto` the engine decides, from two things
  it already trusts: WHAT THE PACKAGE ADMITS (a formulation declaring one
  liquid has no second to split into; one declaring no vapour cannot boil)
  and MICHELSEN's TPD on the liquid -- the same test the LL path already runs.
  When a second liquid exists and the package has a vapour, the RICHEST
  admissible set goes to the Gibbs minimisation and Gibbs decides whether the
  vapour is populated; the engine does not assert it.
  A first cut asked a third question -- the Rachford-Rice bracket at the FEED
  composition -- and it was wrong in the way that matters: on vlle03 it read
  sum zK = 0.965 and chose LL over the declared VLLE, losing a vapour the
  minimisation does find.  K-values at the feed are not K-values at the split.
  That question is gone.
  Opt-in and golden-neutral: absent, the phase set stays VL; an explicit
  VL/LL/VLLE remains the author's override.  Proved by EQUIVALENCE rather
  than by a new case -- the gate runs four cases twice, declared and with
  `auto` swapped in, and requires the same phase set AND the same V/F AND the
  same regime: VL (flash01, flash02), LL (vlle01), VLLE (vlle03), 4/4.  The
  check was verified to fail when the VLLE branch is broken.
* **The flash machine has a NAME: the `model` slot.**  Four numerical worlds
  have always lived inside the one flash unit -- K-value iteration
  (Rachford-Rice + Wegstein), direct Gibbs minimisation for the liquid split,
  the multi-start seeding of the three-phase case, and the reactive joint
  Newton -- and none of them had a name in the dictionary: a student found
  out which one ran by reading the C++.  `model` now names the first two, in
  the slot the distillation column settled (`type` -> `model` ->
  `operation`), with the DEFAULT being what already ran: 327 PASS, every KPI
  byte-identical.
  What is deliberately NOT in the list is the reactive path.  It is chosen by
  `thermo.hasReactiveEquilibrium()` -- a consequence of the declared
  formulation (the one-knob rule), and units never implement chemistry
  (ratified 6b) -- so naming it in the unit would give one decision two homes
  and let a case declare a machine its package cannot run.  Four refusals,
  each with its reason: `rachfordRice` on an LL/VLLE phase set (the K-value
  iteration converges to the trivial K = 1 saddle -- two phases of identical
  composition, which satisfies every equality and is not a split),
  `gibbsMinimisation` on VL, ANY model on a reactive package, and an unknown
  name with the available list.  `bin/curate/check_flash_model.py` proves all
  four fire WITH their reasons, that the corpus exercises the declared branch
  and not only the implied default, and that a reactive case announces no
  unit-level model.

* **The dissolved-totals ledger lied for a Henry-pinned master.**  `WATER
  BEFORE/AFTER` rebuilt each total as `feed - sum nu_pj n_p`, which is
  meaningless for a master whose balance the PIN replaced -- the run itself
  announces that its `totals` entry is only an initial guess.  On an open-CO2
  water precipitating calcite it read **2.8x high** (HCO3 2.6855e-3 against
  9.562e-4 mol/kg summed from the species).  Both sides of the ledger now
  read the same quantity off the converged state, `m_j + sum_s nu_sj m_s`:
  identical for an honoured balance, CORRECT for a pinned one.  Verified to
  reconcile with the species table to 1.0000.
* **`equilibrate {}` inside a `type exchange;` op was silently ignored** -- a
  softener carrying it reported SI_calcite +1.708 with nothing precipitated
  and no message, in a code that refuses unknown keys inside `equilibrate{}`
  itself.  Now refused by name, with both remedies (drop it, or speciate the
  effluent in a separate op) and the reason it is not simply honoured: the
  solver does carry a CEC row and a mineral active set, but nobody has ever
  solved them together against a reference.  A capability, not an oversight
  -- and not something to enable by accident.
* **flashComplex stops headlining a number the model cannot price.**  Its
  description led with `pH 8.341`.  The ions are Davies on water-referenced
  molality in a backbone that is ~10 mol% ethanol; the standard-state
  transfer term is a named gap worth ~1.4 kJ/mol per unit z^2 -- a factor of
  ~9 on a divalent gamma and about two log units on the calcite SI.  What the
  case earns is `|r| 2e-13`: that vapour + two liquids + speciation + a
  growing mineral + a permanent gas solve TOGETHER.  The description and the
  thermoPhysPropDict now say that, and say the pH is the model's output, not
  a claim about the water.

* **Curated stoichiometry is now CHECKED, not assumed.**  Two identities hold
  for every record in the electrolyte layer and the whole electroneutrality
  closure is DERIVED from them -- `z_s = sum_j nu_sj z_j` for a complex,
  `0 = sum_j nu_pj z_j` for a mineral (the crystal is neutral).  They were
  used everywhere and asserted nowhere.  An independent audit priced the
  gap: editing calcite's dissolution to `{ ion H; nu -2; }` -- a "solid" of
  charge -1, which is not a crystal -- converged, exited 0, moved the solved
  pH by 2.7 units and passed every gate, because the charge row it corrupts
  is exactly the row derived from the identity it broke.  Now refused at
  LOAD time, by name, with the arithmetic shown (`+1*(Ca +2)  +1*(HCO3 -1)
  -2*(H +1) = -1, expected +0`), exit 2.  The whole curated corpus passes
  unchanged: 326 PASS.
* **The charge-balance gate was weaker than its own docstring**, and the same
  audit found both spots.  Its precipitation-coverage assertion was written
  two ways round and asserted nothing (it passed on `stayed dissolved`, the
  NO-precipitation message); it now reads the AMOUNT and requires n > 0.  Its
  pH-GIVEN claim was never implemented; it now fails if every given-pH line
  is at round-off, which is what "electroneutrality is being imposed behind a
  given pH" would look like.  Both were verified to fail when they should.

* **Electroneutrality FIXED: a neutral crystal moves no charge.**  The
  charge row of the speciation Newton carried an extra `nu_pH * n_p` term,
  added so a precipitating carbonate's freed proton would re-acidify the
  solved pH.  The effect is real; the term counted it TWICE.  A crystal is
  neutral, so its dissolution reaction is charge-balanced by construction
  (calcite: `+2 -1 -1 = 0`), and substituting the mole balances into the
  charge sum shows `sum z_i m_i = 0` ALREADY shifts the proton condition by
  `nu_pH n_p` -- the sink pulls Ca(+2) and HCO3(-1) out in 1:1 and only H+
  can restore the balance.  The double count forced `sum z_i m_i = +n_p`
  (exactly 1.00000 of the precipitated amount, 24 % of the total charge in
  flash16) and was SILENT: converged, exit 0, goldens green.  Consequences,
  all in the safe-to-know direction: the calcite ceiling of an RO
  concentrate rises 58 % (12.1 -> 19.2 kg/day at r = 0.85 in
  `precipitation_ro_brackish`) -- i.e. the bug UNDER-READ the true ceiling
  by 37 % -- gypsum backs off as calcite takes the shared Ca (onset
  r 0.60 -> 0.65), and every solved pH rises by 0.01-0.09.  Three goldens
  deliberately re-recorded.
* **The charge balance is now REPORTED and GATED.**  Every speciation
  announces `sum z_i m_i / sum |z_i| m_i` on its answer, read two ways and
  labelled: pH SOLVED = the residual of a row the solver imposes (belongs
  at round-off); pH GIVEN = the net charge the analysis actually carries
  (reported, never forced).  `bin/curate/check_charge_balance.py` gates the
  first over 8 named cases -- three of them with a precipitating solid,
  the exact configuration the bug lived in -- and was verified to FAIL on
  the reintroduced term.  Theory guide gains the pitfall with the
  derivation (`ch:speciation`).

## Choupo-dev (2026-07-25/26)

* **D2 closed migration EXECUTED** (identity per parameterisation): all
  205 `parameters/Henry/` pairs carry the typed identity (gasSpecies /
  dissolvedSpecies / convention `Sander-Hxp-v1`) -- 204 by the audited
  curation script `bin/curate/migrate_henry_identity.py` (deterministic,
  idempotent, fail-closed; reactive/acid/base solutes via an explicit
  reviewed exception table, never name similarity); the 9 chemistry
  gas-liquid records are canonical schemaVersion 2 (gasSpecies /
  dissolvedSpecies / solvent / convention `PHREEQC-gasMolal-v1`).  The
  loader keeps a LEGACY ADAPTER strictly at its boundary (old external
  cases convert in memory, announced, re-import recommended; never written
  back); `check_legacy_schema` proves the dev corpus canonical (standards +
  sealed mirrors); 13 sealed cases re-imported.  Cross-convention
  diagnostics now cover 6 families (CH4 49%, O2 43%, N2 41%, H2 31%,
  CO2 29%, NH3 13% worst-dev -- independent primaries, findings not
  errors).
* **D6 primary-review dossier** (v2, six ratified corrections):
  `bin/curate/interim_review_dossier.py` generates
  `generated/interimReviewDossier.md` -- DISJOINT coverage categories
  (A directly-comparable / B identities-differ (composite kept apart) /
  C Sander-only / D network-only / E unresolved) with family vs
  parameterisation totals; typed-identity resolution through DECLARED
  mappings only (aceticAcid ~ CH3COOH via the Acetate+H bridge -> a 7th
  comparable family at 28.6% worst dev; H2S = composite/fused, direct
  comparison unavailable); route vocabulary (not everything is "Henry":
  infinite-dilution solute / solvent vapour / reactive molecular /
  composite); numeric validity marks with declared 5 K near-boundary
  presentation tolerance (373.15 K IS outside 273-373); deviation
  summaries split known-valid intersection vs full common scan range
  (PHREEQC domains undeclared = curation debt, said so); structured
  review metadata (reviewStatus/reviewReason/reviewOwner) preferred with
  announced text-marker fallback, migrated on touch.  Nothing promotes
  automatically.
* **D3 ADR committed** (contract only): the standard-state transfer
  correction -- conceptual interface, Delta-mu-transfer output (never an
  ambiguous factor), named-gap present state, non-assumptions, and the
  seven conditions for any future implementation
  (`docs/design/standard-state-transfer-adr.md`).
* **flash12 audit closed**: the thermoPhysPropDict now declares the
  DELIBERATE pedagogical override (composite mixed-solvent v1 is available;
  flash12 stays the ideal reference vs flash13) with a declared `reason`
  announced by the resolver; aceticAcid.dat's obsolete dimerisation note
  corrected (vapour association is not a pure-component property; it lives
  on the gas-liquid record); subsaturated reactive KPIs announced as the
  INCIPIENT vapour of the saturation check.
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
* **Build-hygiene campaign (6 commits, ChatGPT-audited plan)**: the
  incremental build now means what it says.  UnitProfile split out of
  UnitOperation.H; UnitOperation.H forward-declares ThermoPackage
  (fan-out 95 -> 54 TUs); ThermoPackage.H stops dragging 14 model
  headers (ActivityModel 136 -> 29, EquationOfState -> 21,
  SpeciationSolver -> 13, Phase -> 11, ReactiveVLE -> 5 TUs);
  Component.H stops dragging the correlation models
  (VaporPressureModel 177 -> 31, HeatCapacityModel 177 -> 29).  NATIVE
  FLAG STAMPS, split: a compile-flag change rebuilds all 261 objects, a
  LINK-flag change re-links 5 artefacts and recompiles NOTHING (both
  proven by dry-run counts; the old build silently reused stale objects
  on any flag change).  Instruments: bin/checkHeaderSelfContained
  (runTests gate, 304/304) + bin/checkCompileFanout (informational .d
  report, no arbitrary limits).  Touch-matrix proof: one .cpp -> 1 CXX +
  5 links; goldens byte-identical across all six commits.
* **Counsel wave (three-way ratified 2026-07-26 evening)**: the composite
  proves its limits (check_composite_limits: x_co->0, I->0, NRTL->0, live
  solver probes -- the I->0 probe exposed and fixed a real trace-volatile
  defect in the outer Newton); honest naming (composite mixed-solvent
  electrolyte v1) everywhere; announcements speak the COURSE's language
  (Raoult/Henry conventions named per component); theoryGuide gains the
  chapter-map ("One equation, many declarations"); docs/ai gains the
  three-questions section + the standard-states glossary.  D2 DESIGN
  materialised and EXERCISED on the first pair (CH4-water): versioned
  immutable convention profiles (Sander-Hxp-v1, PHREEQC-gasMolal-v1),
  typed parameterisation identity, and the equilibrium-family gate whose
  cross-convention DIAGNOSTIC immediately quantified a real 49 % high-T
  divergence between the Sander extrapolation and the PHREEQC analytic
  (evidence for the INTERIM primary reviews).  D4 first tranche:
  aqueousSpeciation facts for the dissolved gases (CH4/O2/N2/H2 none,
  CO2 carbonate, H2S sulfide -- with the missing H2Saq-formation record
  curated when the coherence gate refused an empty set); the classifier
  gains the HenrySolute class (a dissolved gas is never a Raoult backbone
  member; reactive-shape wiring is a named later slice).
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
