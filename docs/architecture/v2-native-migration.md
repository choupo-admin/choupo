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
