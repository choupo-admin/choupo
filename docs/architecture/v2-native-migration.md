# The v2-native migration — honest state + the ratified path

**Status:** LIVE record, opened 2026-07-18 (Codex finding + the plan ratified
2026-07-17).  Update this file as steps land; delete it when step 5 closes.

## The honest state (2026-07-18)

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
- 2026-07-18 — **BOUNDARY (deliberate stop): the electrolyte formulations
  (electrolyteGammaPhi, aqueousProperties) stay on the scaffold.**  Their
  translate step is already a thin OBJECT-dict key-mapping (no text
  synthesis) into `buildElectrolyte`, which assembles via the
  `adoptElectrolytePackage` seam — but making them native means rewiring
  buildElectrolyte's input layer, and that is entangled with the
  TRANSITIONAL inline `chemistry{}` blocks whose permanent home is NOT yet
  ratified (Codex 2026-07-18: "ratificar primeiro uma única casa para a
  química ativa do caso e só então migrar" — do not improvise it here).
  Next native wave AFTER that ratification; also still scaffold: the ~32
  shaped gammaPhi cases (transport / pureFluids / inline-pairs / cosmoSAC /
  explicit phases), the Flowsheet propertyContextBase chain, fitParameters.
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
