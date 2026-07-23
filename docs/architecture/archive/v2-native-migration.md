# The v2-native migration — honest state + the ratified path

**Status: CLOSED / ARCHIVED 2026-07-21.**  The migration is complete — all
five steps executed, `translateV2` deleted (`rg translateV2 src/` is empty),
the builder assembles every `equilibrium.formulation` natively (`[v2 native]`
announces, no `[v2 plan]` scaffold path remains), and the negative-parity gate
forbids the v1 grammar's return.  This file is kept as the HISTORICAL record of
how the migration was done; **the "honest state (2026-07-18)" section below
described the mid-migration scaffold and is now superseded by the step log at
the end** (which records the scaffold's deletion).  Do not treat the early
"not yet native" caveat as current — it is history.  Live architecture:
[`CHOUPO-CONSTITUTION.md`](CHOUPO-CONSTITUTION.md) §4 +
[`property-architecture.md`](property-architecture.md).

## The honest state (2026-07-18) — SUPERSEDED, see the closing note above

The EXTERNAL surface is v2-only: no tutorial authors `propertyDict` /
`thermoPackage`, and the v1 grammar is REFUSED with a migration error.  That
part of the consolidation is real and gate-protected.

The INTERNAL pipeline is **not yet native**.  Do not claim "the engine reads
v2 natively" anywhere:

- all four binaries call `ThermoPackageBuilder::translateV2()` first;
- `translateV2()` emits a v1-shaped `Dictionary("propertyPackage")` — in
  several branches it synthesizes TEXT and reparses it via
  `Dictionary::fromString` — and hands that to `build()` (manifest worlds)
  or `ThermoPackage::readFromDict()` (flat worlds);
- `Component::readFromDict` still lifts modern blocks onto flat legacy
  aliases before consuming them;
- consequences are real, not cosmetic: a declared v2 block can be verified
  by the translator and then dropped/decorative in a branch the v1 shape
  cannot express (the `caloric{}` verify-then-discard pattern), and per-op
  overrides had to learn the authored-merge path (2026-07-18) precisely
  because the translated intermediate is not the source of truth.

`translateV2` is a **scaffold** — a legitimate bridge that made the corpus
migration safe (goldens byte-intact), never the end state.

## The ratified path (2026-07-17 plan + Codex 2026-07-18, do in ORDER)

1. ONE shared `buildV2(authored, db)` entry point used by all four binaries
   (today each main wires translate+build/readFromDict itself).
2. Build phases, activity models, EoS, caloric and transport DIRECTLY from
   the v2 sub-blocks — no v1 string/dict emission.  Pilot ONE formulation
   end-to-end first (smallest surface: `phiPhi`), keep the translator for
   the rest, announce which path served the case.
3. `ThermoPackage` receives ASSEMBLED structures/models — it stops
   reparsing `activityModel` / `equationOfState` / `propertyMethods` keys.
4. `Component` reads its blocks natively; only then remove the flat aliases.
5. Delete `translateV2` and every flat/v1 route; add the gate that forbids
   their return.

**Rule for every step:** structural steps preserve goldens byte-for-byte;
numbers may move only in separately-identified PHYSICAL fixes, each with its
traceable explanation.  Do not mix this migration with model growth
(PC-SAFT association etc.).

## Step log

- 2026-07-18 (waves I+J — **STEP 5 EXECUTED: translateV2 is DELETED**):
  the per-unit / per-op `thermo{}` override is a TYPED v2 FRAGMENT
  (`src/thermo/ThermoOverride.H`, one merge for both paths: same-formulation
  fragments override per slot, a formulation change replaces the whole
  equilibrium block; components/chemistry forbidden; the flat keys refused
  with the migration message; all 11 existing overrides migrated).  The
  builder dispatch is EXHAUSTIVE with named refusals (no silent fallback);
  the four mains collapse onto it; `rg translateV2` over src/ is EMPTY.
  The NEGATIVE-PARITY GATE (`bin/curate/check_v2_refusals.py`, in runTests)
  pins 10 refusals with their named messages — its first run caught a real
  hole (an aqueousProperties system with a bad model was accepted when no
  speciation op read it; choupoProps now validates the surface eagerly).
  tartaricAcid fixed physically (H2SO4 `role nonvolatile;` overlay, sealed
  via --merge-overlay; 0/ flattened to the completeness contract; expected
  recorded) and ENTERS the suite: 293 PASS / 0 FAIL, GUI 1778/1778.
  REMAINING of the plan: step 3 leftovers (build()'s v1-shaped manifest
  branches — now reachable only programmatically), step 4 (Component
  block-native + alias removal), then the solverDict phase.

- 2026-07-18: this record opened; `ThermoPackageBuilder.H` comment corrected
  (it claimed the translator's "role is permanent" — it is a scaffold).
- 2026-07-18: **steps 1–2 PILOT landed — the phiPhi world assembles natively.**
  `ThermoPackageBuilder::build()` is the ONE v2 dispatch point: a formulation
  `v2NativeFormulation()` claims goes to `buildV2()` (authored grammar →
  `ThermoPackage::assemblePhiPhi`, no v1-shaped dict, no synthesized text);
  the rest ride the scaffold.  The native path announces `[v2 native]`, the
  scaffold keeps `[v2 plan]` — never a silent switch.  Wired: choupoSolve
  main, choupoProps main, the per-op `thermo{}` override
  (`PropertyOperation::thermoForOp`).  Component loading factored into the
  shared `ThermoPackage::loadComponentSet` (mixture expansion + alias
  canonicalisation + load + seeds — one code path for both assemblies).
  NOT yet native (stays on the scaffold, by design): the per-unit
  `propertyContextBase` chain in `Flowsheet.cpp` (its F2 override logic reads
  the v1 shape — step 3 work), choupoBatch/choupoCtrl mains (no phiPhi cases
  exist there; they translate as before), fitParameters (fits activity pairs,
  re-translates its mutated authored copy per iteration).
  Cases on the native path today: flash09/flash10 (SRK / PCSAFT phiPhi),
  pcsaft01/pcsaft02 (+ its per-op SRK cross-check override).  Goldens
  byte-intact; a phiPhi case declaring transport/pureFluids/activeComponents/
  chemistry falls back to the scaffold until the native assembly wires them.
- 2026-07-18 (wave A): **gammaPhi assembles natively** — the ideal-liquid and
  the source-declared-pairs shapes (Codex's two pilots: flash01,
  nrtl01_ethanol_water_package with the per-pair citation announce).
  `assemblePhiPhi` generalised to `ThermoPackage::assembleTwoPhase` (one
  native assembly for both worlds; the Phase gets the RAW activity config and
  injects its own UNIFAC/UNIQUAC copy — forum #69 idempotence).  All FOUR
  binaries now route v2 through `build()`'s one dispatch (choupoBatch /
  choupoCtrl rewired; the mains never decide to translate); the scaffold
  branch inside build() routes the translated shape by content
  (manifest → builder, FLAT → readFromDict).  The per-op `thermo{}`
  authored-merge learned the gammaPhi slots (activityModel / equationOfState
  → vapour.fugacityModel / transport via the inverse T13 map / pureFluids
  verbatim).  **Engine gap 2 CLOSED as a consequence** (perUnitThermo01: an
  EoS-only per-unit override now inherits the global molecular gamma — the
  synthesized base carries `activityModel { model <global> }` when the unit
  does not name its own liquid world; electrolyte surfaces excluded via
  `asElectrolyte()`, those units declare their own world as before).
  Count: ~210 of 242 gammaPhi contexts + 4 phiPhi native; ~32 gammaPhi stay
  on the scaffold (transport / pureFluids / inline-pairs / cosmoSAC-set /
  explicit-phases shapes) plus gammaGamma, diluteSolution,
  electrolyteGammaPhi, aqueousProperties and the Flowsheet
  propertyContextBase chain.  Full suite 292/0; GUI 1778/1778.
- 2026-07-18 (wave C): **diluteSolution assembles natively** — the T6 rung
  refusals, every Henry pair record loaded fail-closed + cited, G5 real
  vapour phi; the dissolution wiring factored to ONE home
  (`ThermoPackage::applySolution`, shared with readFromDict).  Native:
  ammonia01/02, flash08, stripper01, absorption01, absorber01.
- 2026-07-18 (wave D): **the chemistry home ratified and migrated** —
  `constant/chemistryDict` (recordType `chemistrySystem`, `equilibria {
  solidPhases ( ... ); }`) is THE selection home; `ChemistrySystem::fromDict`
  (strict minimal grammar), `resolveChemistryContext` on the same inherits
  chain (nearest owner wins, replace-whole), the builder takes the OBJECT
  (`build(pkg, db, chem)`), all 17 transitional inline `chemistry{}` blocks
  migrated mechanically, the translateV2 carry removed, and BOTH gates live
  (inline chemistry{} refused in the property dict AND in the v1-shaped
  package).  The importer harvests the new home.  **The wave exposed and
  fixed a REAL bug:** the per-node electrolyte context (Flowsheet::thermoFor)
  never copied the ctx's chemistry into the node's package — the
  lithiumBrinePlant BRINE crystalliser ran with NO active salt (m_sat 1e-9,
  Ksp_activity 0, yield ≈ 100 % — degenerate physics the golden had pinned).
  With the selection now resolved along the node's chain, crystNaCl computes
  the REAL Pitzer halite saturation (Ksp 38.48, m_sat 6.144 mol/kg, γ± 1.0097
  — bit-identical to crystalliser05's standalone numbers) → yield 20.7 %,
  halite 3.78 → 0.646 kmol/h, downstream ripple; golden re-recorded with this
  explanation (the ONE physical change of the wave; everything else 292/0
  byte-intact).
- 2026-07-18 (wave E, after the chemistryDict ratification unlocked it):
  **electrolyteGammaPhi assembles natively** — `buildElectrolyte`'s input
  layer refactored to TYPED inputs (component names + isENRTL + the
  ChemistrySystem object; the propertyMethods vapour/transport refusals
  moved to the two callers — one contract, two assemblies), and buildV2
  applies the scaffold's refusals (Pitzer|eNRTL, molality basis, idealGas
  vapour, caloric routes) on the authored grammar directly.  Pilots: pitzer02
  (Pitzer) + evaporator07 (eNRTL), then the whole electrolyte family
  (crystallisers, evaporators, thermoTest models, enthalpy_naoh,
  lithiumBrinePlant per-node) — 292/0, goldens intact.
- 2026-07-18 (wave F): **aqueousProperties reads natively** — the speciation
  surface is a TYPED reader (`propertyOps::caseAqueousSurface()`, one walker
  replacing the two duplicated `caseDictionary()` implementations): the ops
  (speciate / scalingScan / exchange) read the AUTHORED
  `aqueousProperties { activityCoefficients { model } solvent }` block
  directly, with the scaffold's refusals (Davies|PitzerHMW, aqueousMolality,
  water-only solvent) moved into the reader/op; the op-level `activityModel`
  override (the model-CONTRAST mechanism) is unchanged.  choupoProps builds
  the ideal solvent BASIS via `assembleTwoPhase` (no synthesized text) and
  never translates a speciation system.  15/15 family cases green.
- 2026-07-18 (wave G): **every authored gammaPhi shape assembles natively**
  — transport (the T13 phase-structured block mapped onto the canonical flat
  hierarchy as DICT OBJECTS; mixingRule still refused), pureFluids (verbatim
  + the G4 announce), inline pairs (copied verbatim, source-XOR-inline
  STRICT kept), the cosmoSAC set selector (`source <setName>` rides along).
  `readTransportBlock`/`readPureFluids` factored out of readFromDict and
  shared with `assembleTwoPhase`.  The wave exposed a LATENT move bug: the
  hand-written ThermoPackage move operator never carried
  `mixtureMembersByToken_` ("KEEP THE MEMBER LIST IN SYNC" violated), so any
  by-value package with a predefined mixture (`air`) lost its stream-token
  splice — bit only now because the flat path read in-place.  Fixed; the
  sprayDryer family caught it.
- 2026-07-18 (wave H): **the scaffold counter reaches ZERO.**  fitParameters
  hands its mutated authored copy to the builder's ONE dispatch (native per
  iteration); the `activeComponents` pair-domain projection rides natively
  into the gamma worlds' activity configs; the Flowsheet
  `propertyContextBase` chain builds a claimed v2 context via `build()`
  directly — COMPONENTS STAY GLOBAL (the ctx list is replaced by the built
  global's), the per-node auxiliaries (`binaryPairsBase`, the node's
  chemistryDict) ride alongside.  Empirical: a fresh run of every previously
  scaffold-flagged case prints ZERO `[v2 plan]` — the whole corpus assembles
  `[v2 native]`.  translateV2 is now reachable only by an authored shape no
  case uses; its deletion (step 5) is the next, separate commit — note the
  per-unit INLINE `thermo{}` override language still uses the flat FORM as
  its merge target (perUnitThermo01), so "todas as rotas flat" needs its own
  scoping decision before step 5 executes.
- ~~Still scaffold: activeComponents systems, the propertyContextBase chain,
  fitParameters~~ (wave H).
- 2026-07-18 (wave B): **gammaGamma assembles natively** —
  `ThermoPackage::assembleNamedPhases` (each liquid phase from its own
  config dict, shared activity model resolved once per phase — no cross-phase
  mutation; optional vapour = VLLE), `resolveActivity` shared pair resolver
  in buildV2 (source records loaded + cited; inline coefficients copied as
  entry values, nested provenance blocks skipped).  A system carrying
  `activeComponents`/`chemistry` (the lithiumBrinePlant EXTRACTION sector
  context) stays on the scaffold by the standing guard.  Native now: the
  LLE/VLLE family (vlle01/03, extraction01, extract01, the three props LLE
  scans).  Full suite 292/0.
