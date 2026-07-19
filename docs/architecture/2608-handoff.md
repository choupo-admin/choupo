# Choupo 2607 → 2608 handoff

Written 2026-07-19 at the close of the 2607 consolidation wave.  This
document describes the CODE AS IT IS on branch
`cleanup/binarypairs-parameters-tidy` (154 unpushed commits, listed in §9) —
not the conversation that produced it.  Verify any claim against the tree
before acting on it.

---

## 1. Current architecture and stabilised contracts

**Three layers, four binaries.**  `OuterDriver` (sweep / optimization /
designSpec / parameter estimation) wraps a pure simulator pass
(`runSimulation`: Flowsheet → SimulationResult); `PostProcessor` (sizing,
costing) augments after.  One binary per problem class: `choupoSolve`
(steady F(x)=0), `choupoBatch` (recipe-driven dY/dt), `choupoCtrl`
(dynamic + controllers), `choupoProps` (property bench).  `bin/runCase`
dispatches on `controlDict.application`.

**The case grammar (v2, NATIVE — v1 is dead).**
`constant/thermoPhysPropDict` with `recordType
thermophysicalPropertySystem; schemaVersion 2;` is the ONLY thermophysical
input the engine reads.  There is no translator: `translateV2` was deleted
(`d5c353c2c`); the builder (`src/thermo/ThermoPackageBuilder.cpp`)
assembles each `equilibrium.formulation` natively and refuses unknown
shapes by name.  Formulations: `gammaPhi`, `gammaGamma` (LLE/VLLE),
`diluteSolution` (KK/KI Henry), `phiPhi` (one cubic, both roots),
`electrolyteGammaPhi`.  Sibling top-level blocks: `caloric {}` (energy
routes; `energyBasis elementsDatum;`), `transport {}` (per-phase +
`interface`), `pureFluids {}` (IF97).  A per-unit `thermo {}` override is a
typed v2 FRAGMENT merged onto the authored system.  A case carrying
`constant/propertyDict` gets a hard refusal naming the migrator.

**Sealing / self-containment.**  `bin/choupo-import` materialises each
case's dependency closure into `constant/` (components/, parameters/,
species/, chemistry/…) with `constant/propertyManifest` (per-record sha256,
`sealed true;` forbids catalogue fallback).  274+ tutorials are sealed;
`RecordResolver` is the one lookup path.  Active chemistry selection lives
in `constant/chemistryDict` (`1a3a1089e`).

**Stream state.**  `flowsheetDict` = topology only.  `0/` = complete
initial state, one file per stream (completeness FATAL); `converged/` =
steady solution; `bin/choupo-init0` materialises by explicit propagation.
A `streams {}` block anywhere is refused.  The aggregated snapshot spelling
is `streamFaces/` on disk and `faces{}` in dicts (`26e58b13c`); no writer
or migrator can resurrect the old spelling (`5fb232ac9`).

**Balance diagnostics, three levels (engine-owned; the GUI only draws).**
- ONE formula parser: `src/thermo/ElementComposition` (nested groups,
  hydrates, isotopes D/T, charge convention: terminal sign alone =
  monovalent).  `src/thermo/AtomicWeights` = IUPAC/CIAAW 2021.
- `elementalComposition {}` component block (`b3e809ee4`): declared
  composition for formula-less substances (basis `massFraction` with
  mandatory `unaccountedMassFraction`, or `formulaUnit`), validated at
  `Component` read, provenance-gated.
- Steady: `elementBalance` report (`src/reporting/ElementBalanceReport`)
  writes `reports/balances/elementBalance.csv` + `.meta`
  (FULL/PARTIAL/UNAVAILABLE with named reasons).  **It is a DEFAULT
  diagnostic of every converged steady run** (`89568dc72`): choupoSolve
  appends it when undeclared; any report block can opt out with
  `enabled false;` (generic, in `Report::buildChain`).
- Batch: material + energy ledgers (TransferRecord / EnergyRecord, exact
  state differences on the elements datum); campaign verdict only when
  every piece is priceable.
- Ctrl: `BalanceSnapshot` accepted-state ledger →
  `balanceTrajectory.csv` + `.meta`; mass + per-element laws; PARTIAL is
  relevance-gated (an absent component never contaminates); the
  dynamicCSTR PHYSICAL energy claim honestly refuses (Cp/convective ODE ≠
  dU/dH) — that reformulation is 2608 work.
- Shared math: `src/reporting/BalanceMath.H`
  (`elementBoundaryBalance` — union of in/out elements, refusals as
  states).

**Reports.**  `controlDict.reports {}` chain (`Report::buildChain`),
`reportsLayout postProcessing;` opt-in for the `postProcessing/<n>/` tree.
Heat of reaction is ALWAYS the elements datum via the shared
`reactionHeat()` resolver; salt solid formation is ION-DERIVED
(`Hf_solid = Σν·hfAq − dH_soln`).

## 2. Decisions that must NOT be reopened

The authoritative list lives in `CLAUDE.md` §5/§10 and
`docs/architecture/CHOUPO-CONSTITUTION.md`.  The 2607-wave additions:

- v1 `propertyDict` / `thermoPackage` / `translateV2` are DEAD — no dual
  reader, no fallback, refusal only.  Do not add compatibility back.
- `components/` is physically FLAT; species are one typed file each
  (`recordType modelSpecies`); "true species" vocabulary is banned.
- Pair catalogues live under `parameters/<MODEL>/` (all tiers, one
  spelling).  Assets live in flat `assets/` with a `kind` field.
- `streamFaces`/`faces{}` naming is closed (owner-ratified).
- The element balance seal requires EVERY element to close — the signed
  atom total alone never seals (anti-cancellation).
- ONE navigation entry "Element balance" in the GUI (literature: atom
  balance ≡ element balance); species molar flows is a diagnostic, not a
  balance.
- ctrl01 is a mass-conserving isomerisation (MW_A = MW_B = 30); do not
  reintroduce the 30→50 leak.
- Two data tiers only (`standards` public, `local` private/gitignored);
  the public `proposed` tier stays retired.
- Everything in CLAUDE.md's standing list: no CMake, no external deps, no
  auto-registration, no Python rewrite, GPL-3.0-or-later + TalentGround
  trademark, no competitor names in user-facing manuals, no silent crutch.

## 3. Real state of each capability

| Capability | State |
|---|---|
| Steady engine (49 unit-op models) | 299/0 regression, 4 deliberate EXPECTED-FAILs |
| v2 native thermo | COMPLETE — all formulations native, scaffold counter 0 |
| Sealing | COMPLETE for the corpus; seal-drift gate exists (`4447d6988`) — see §4 debt #1 |
| Balances steady | elementBalance default-on, FULL on real-formula cases; refuses on pseudo-components with named reasons |
| Balances batch | material + energy ledgers close to ~1e-15 on recipe01/recipe02 |
| Balances ctrl | mass + elements on accepted states; PHYSICAL energy refuses (2608) |
| elementalComposition{} | contract ratified + implemented + gated (`check_element_composition`) |
| PC-SAFT | non-associating core validated (~1 % vs literature); association term NOT implemented (2608) |
| COSMO-SAC | 2002 variant, 77 components with VT2005 sets; profile generation out of scope |
| Pinch (GUI) | composite/GCC/grid + heuristic matches; no-recovery state single-statement; Pareto cutoff defaults 0; with-recovery pinned by `gui/tests/pinch.test.ts` |
| GUI plots | sidebar shows only this-result views; Element balance single view (summary + By element); landing priority campaign → ctrl ledger → trajectory → elementBalance → profile |
| WASM | incremental build (§6); choupoSolve/Props current with all engine changes through `89568dc72` |
| Docs for LLMs | `docs/ai/` + AGENTS.md + README + CLAUDE.md teach v2 only (`ac32dada7`) |
| Help deep-links | help-index.json → PDF nameddest works; COVERAGE GAPS remain (§4 debt #3) |

## 4. Known debts, by severity

1. **SEAL DRIFT 126 — awaiting Vítor's decision.**  126 sealed copies
   differ from the live catalogue (18 origins changed by comment-only
   doctrine passes).  The gate reports; no mass reseal was performed —
   that is an owner decision, do not auto-reseal.
2. **ctrl physical energy refusal.**  The dynamicCSTR energy ODE is
   Cp/convective; a first-law U/H closure needs model reformulation
   (explicitly 2608).  The refusal message in the ledger is the contract.
3. **Help-index coverage gaps.**  `docs/help-index.json` has NO
   `workspaces.control` entry (theory `ch:pid` exists in
   theoryGuide.tex:21070) and no dedicated guide section/anchor for the
   three-level balance diagnostics (theoryGuide has no element-balance
   chapter; userGuide's reports table predates elementBalance default-on).
   The guides also still need a blank-slate legacy pass (Vítor's 2026-07-19
   order, unfinished for the .tex guides; docs/ai is done).
4. **Landing page mobile.**  At 390×844 the landing overflows horizontally
   (Codex smoke).  P2 if desktop-only is declared, P1 otherwise.
5. **userGuide reports table** lists massBalance/energyBalance etc. but
   not `elementBalance` nor the `enabled false;` opt-out (stale vs
   `89568dc72`).
6. **`docs/ai/consistency.md`, `extending.md`, `gui-credo.md`** were not
   part of the v2 scrub sweep (no propertyDict hits, but nobody re-read
   them end-to-end this wave).
7. **Batch/ctrl have no default element report** — deliberate (they carry
   their own ledgers), but the asymmetry should be stated in the manuals
   when debt #3 is paid.

## 5. Build and test commands

```sh
make -j$(nproc) all            # native release (build/linux64Gcc/)
make MODE=debug                # debug tree
bin/runTests                   # FULL regression: 299 cases, NaN/inf guard,
                               #   golden KPIs, doctrine + inventory gates
bin/runTests <caseDir>         # one case
bin/runTests --record <case>   # refresh a golden (needs traceable physics)
cd gui && npx tsc --noEmit && npx vitest run   # 1809 tests
python3 bin/curate/check_element_balance.py    # (and the other gates in bin/curate/)
bin/runGui                     # dev server + browser
```

Current counts: suite **PASS 299 / FAIL 0 / KNOWN-BROKEN 0 /
EXPECTED-FAIL 4**; vitest **1809/1809**; release inventory generated by
`bin/curate/release_inventory.py` (never hand-edit counts).

## 6. WASM incremental build

`make/wasm.mk`, rewritten this wave (`0e3b9a746` + `a258154c8`):

- Per-mode object tree `build/wasm/<mode>/obj` with `-MMD -MP` dep files;
  the common core compiles ONCE and links into all four binaries via
  explicit object lists (no archive).  Clean build 13 min → ~58 s; an
  incremental engine edit relinks in seconds.
- Invalidation is hash-in-filename stamps: standards-content
  (`find -printf '%p %T@ %s' | md5sum`), compile-flags and link-flags
  stamps — deleting a `.dat` or changing flags rebuilds correctly.
- Grouped link rules (`&:`) with aggregates listing BOTH pair members, so
  a deleted `.wasm` regenerates even when only the `.js` is requested.
- Makefile parse-order matters: stamps and `WASM_SRCS :=` are defined
  BEFORE the rules that reference them (the historical fossil expanded
  prerequisites empty).
- `make wasm-gui` (choupoSolve + choupoProps) is the default GUI rebuild.
  **Never run two wasm builds concurrently** (they clobber
  `gui/public/wasm/`).  Rebuild WASM after ANY engine change the GUI must
  see; hard-refresh the browser.

## 7. GUI state

- Runner + visualiser, never an editor (`docs/ai/gui-credo.md` governs).
  React + Mantine + Plotly + React Flow, WASM worker
  (`gui/public/workers/solverWorker.js`) harvests `trajectory.csv`,
  `balanceTrajectory.{csv,meta}`, `reports/**` and
  `postProcessing/**` CSVs into `result.csvFiles`.
- Plots workspace (`gui/src/ui/PlotsWorkspace.tsx`): sidebar shows only
  views this result can have — other-regime/driver views
  (`hideWhenUnavailable`) vanish; this-case views stay dimmed with a
  how-to-obtain tooltip.  Groups: Balance ("Global balances" per regime,
  "Element balance", Mass, Energy) · Phase equilibrium (T-x-y) · Solver ·
  Internal (Species molar flows, Profile, Trajectory, Campaign sequence) ·
  Outer driver (Sweep/scan, excludes `reports/` + `postProcessing/`).
- Element balance view (`ElementBalancePlot.tsx`): summary = total atoms
  IN/OUT bars (kmol-atom/h) + residual + seal `allElementsClose` (every
  element within tol; worst-element indicator); "By element" toggle for
  the C/H/O/N decomposition.  Parser
  (`gui/src/case/elementBalanceSurface.ts`) is pure; metadata sovereign;
  malformed artefacts withdraw with a named reason.
- Pinch (`PinchView.tsx` + `PinchGridPlot.tsx`): computed in-browser
  (`computePinch`); Pareto cutoff default 0 (opt-in filter, announced);
  no-recovery concludes once (header badge).
- `.cho` files carry GUI layout (`choupoLayout` JSON, node positions);
  solver never reads them.
- Vite plugin `gui/scripts/proposedCataloguePlugin.ts` uses
  `configureServer` + `server.watcher` (NOT `addWatchFile(dir)` — that
  caused dev-server 500s).  Restart Vite after structural changes.
- Assistant console (robot icon) runs a real `claude -c` on the open case
  (ws + node-pty, Linux only).

## 8. Data sources and legal position

- CODE: GPL-3.0-or-later; DOCS/manuals: CC BY-SA 4.0 (Vítor Geraldes +
  Pedro Mendes); DATA: multi-licensed per component, aggregation not
  derivative.  *Choupo* name/marks: TalentGround Lda. (INPI PT 9+42).
- `data/standards/` = curated public tier (247 components, 41 aqueous
  species, 205 Henry pairs, **5 public NRTL/UNIQUAC pairs** — the bulk
  moved to private `data/local/` in the 2026-07-14 legal scrub, ON
  PURPOSE; do not re-promote), 55 Pitzer + 3 eNRTL, assets, utilities.
- `data/local/` = private, gitignored working tier; ships empty; consumed
  data announces `[local] UNVERIFIED`.
- `thirdParty/` gitignored; the public repo redistributes NO third-party
  databank values.  `data/groupEstimative/` (~28k Joback estimates) is an
  INTENTIONAL name catalogue + flagged estimates — do not purge.
- COSMO-SAC sets: VT2005 (US-gov public domain via NIST bundle) on 77
  components; LVPP/CHAOS licence-compatible if ever added, each set named.
- Excluded regardless of copyleft: NonCommercial and no-grant sources
  (NIST SRD, DIPPR, Yaws, CRC…).  Cite the PRIMARY source per value.

## 9. The 2607 wave — unpushed commits (newest first)

154 commits on `cleanup/binarypairs-parameters-tidy` ahead of the remote.
NOTHING IS PUSHED; pushing is Vítor's decision alone.

```
d95d8585c fix(gui): pinch no-recovery state concludes ONCE; every stream drawn by default
25a2d43cb fix(tutorials): ctrl01's pseudo-reaction conserves mass -- an isomerisation
ac32dada7 docs(ai): the LLM surfaces teach the case grammar that actually exists
89568dc72 feat(reports): elementBalance is a DEFAULT diagnostic of every steady run
00070842d fix(gui): the plots sidebar shows THIS result's views, not the programme's
ffea3be3d fix(gui): ONE Element balance view (the literature's atom balance)
e40503965 feat(gui): Global atomic balance -- THE conservative molar view (Vitor's correction)
a258154c8 build(wasm): the incremental graph is also CORRECT -- deletions, output pairs and flags all invalidate
0e3b9a746 build(wasm): incremental objects -- the core compiles once, not four times (13 min -> 58 s clean, seconds incremental)
a76a1f0d7 fix(gui): post-commit audit amendments -- Explore dev-server 500, always- net molar, malformed withdraws, HDA demo
5d33afd2d feat(gui): global balances are the landing surface -- molar boundary, steady element surface, unambiguous names (Vitor's usage addendum)
5b977d79b fix(batch,ctrl): adversarial-audit findings -- verdict/summary consistency
61542fb92 fix(batch,ctrl): PARTIAL is a property of the ACCOUNTED set -- an absent component never contaminates the seal
c15d98570 docs: elementalComposition{} is part of the unit (capabilities + case-author view)
b3e809ee4 feat(thermo): elementalComposition{} -- declared composition for formula-less substances (Codex-ratified contract)
12e2adb8d fix(gui): three-level isolation -- a malformed element cell never hides the valid mass series
31ddf7af6 fix(gui): the dynamic-balance UNAVAILABLE state is never hidden
a3ac30476 docs: the balance diagnostics are part of the unit (manuals + guides)
a29b603e8 feat(gui): Dynamic balance plot -- the ctrl ledger over time (phase 5)
6ba91cdd6 chore(git): ignore the generated balanceTrajectory.meta sidecar
fd2f85df9 feat(ctrl): the balance ledger integrates ACCEPTED states (phase 4)
b477b64da feat(reports): elementBalance -- plant-boundary atom conservation (phase 3)
7204518de fix(gui): the element panel consumes only the validated view
df294c1c4 fix(gui): a malformed campaign payload never completes with zeros
944bb3a72 feat(gui): Campaign balance plot -- the batch ledger's own numbers
90059eeab feat(thermo): ElementComposition -- THE shared elemental-formula parser
c0ab4a19d fix(gates): the snapshot scan covers the AUTHORED 0/ -- with a causal self-test
046b6ca47 docs(data,io): tracked prose speaks streamFaces/faces{} everywhere
5fb232ac9 fix(curate,io): amendment -- no writer or migrator can resurrect the retired aggregated `streams` spelling
26e58b13c refactor(io,ctrl,gui,data): the aggregated snapshot is streamFaces/faces{}
6e098c2ee fix(gui): frozen feeds + tinkering address the 0/ projection, never a flowsheet streams{} block (P0/P1)
5d9bd3944 refactor(flowsheet): streams{} refused at EVERY node; fossils removed (P1/P2)
97e6d4458 fix(reports): composite boundary derives from the SOLVED topology (P0)
cf495cd05 fix(data,gates): wave F closure + gate G -- comment doctrine + contextual gates
d0639c3e8 refactor(data,thermo): wave F -- FLAT is THE component grammar
691feff31 docs(legal): OpenFOAM independence statement + provenance review
82aa52219 fix(props): resolve the inherits chain ONCE at the entry point; ONE aqueous-surface reader
3db7cd5ae refactor(clean-slate)!: purge blocks B+C+D -- the engine reads ONE grammar, and its text says so
ff4767961 refactor(clean-slate)!: purge block A+E -- the mains and ops speak ONLY the v2 grammar
9e061c3a1 docs(architecture): v2-native step log -- waves I+J (translateV2 deleted)
d5c353c2c refactor(thermo)!: v2-native wave J -- translateV2 DELETED; the dispatch is exhaustive
509f29409 refactor(thermo): v2-native wave I -- the thermo{} override is a typed v2 FRAGMENT
59d3e0ded refactor(thermo): v2-native wave H -- the scaffold counter reaches ZERO
0ca9c2c9f refactor(thermo): v2-native wave G -- every authored gammaPhi shape assembles natively
7a1ad8953 refactor(thermo): v2-native wave F -- aqueousProperties reads natively
6815dd69c refactor(thermo): v2-native wave E -- electrolyteGammaPhi assembles natively
c10153f84 docs(lithiumBrinePlant): the causal gate for the ONE re-recorded golden
1a3a1089e feat(chemistry): constant/chemistryDict -- the ONE home for the active-chemistry selection
fa3d33996 docs(architecture): v2-native step log -- waves B/C + the deliberate electrolyte boundary
1cb4284b2 refactor(thermo): v2-native wave C -- diluteSolution assembles natively
422b681a3 refactor(thermo): v2-native wave B -- gammaGamma assembles natively
8e1531d90 refactor(thermo): v2-native wave A -- gammaPhi assembles natively, all four binaries on ONE dispatch
08297ef3a chore(repo): drop the accidentally-tracked .tmp_10 writer snapshot + ignore the pattern
c56f94220 refactor(thermo): v2-native migration steps 1-2 pilot -- phiPhi assembles natively
77479f56c feat(thermo): PC-SAFT validation gate -- root coherence, step-convergence, cross-checks
999a229e3 fix(flash): a broken enthalpy route announces a NAMED duty gap, never silence
6e3a75aa9 fix(electrolyte): resinDose contract -- the CEC nameplate leaves the operation
799faa7dd fix(flash)!: LL vocabulary -- the second liquid is not a vapour (Codex P0.2)
ad147801b docs: STUDENT_REVIEW.md -- the student's-eye tutorial review (findings + what was fixed vs what awaits Vitor)
04c2aaf9f docs(tutorials): fix the dead ai/choupo-authoring.md reference in case CLAUDE.md (student review)
37274a5d7 docs(tutorials): drop the competitor block name 'MHeatX' from mheatx01 prose (student review #5, policy)
ad1d3a865 docs(tutorials): label recycle tear seeds as author-owned initial guesses (student review #6)
032dd9c65 docs(tutorials): strip dev jargon from student-facing descriptions (student review #3)
f8457bce4 docs(tutorials): units + illustrative label on the toy esterification kinetics (student review #4)
c13fff597 docs(tutorials): fix self-contradicting header numbers (student review #2 cont.)
b4ca4d352 docs(tutorials): fix copy-paste headers that named the wrong case (student review #2)
c882c4673 docs(tutorials): electrolyte thermoPhysPropDict headers stop saying 'ideal' (student review S1)
83bc9c1e4 fix(tools,data): seal interaction pairs ONLY for the model that consumes them (Codex invariant 3)
da5530ff3 chore(generated): refresh release inventory for pcsaft01 tutorial + PC-SAFT
7557295ea feat(thermo): PC-SAFT non-associating core (Gross & Sadowski 2001) -- commit 1/3
88f8091ce refactor(thermo,data): gammaGamma shares ONE activity model across phases (Codex P0.1)
1a6cac352 docs(tutorials): retire stale architecture names from case comments (Codex P2)
bc23ea6de fix(thermo,data)!: ONE asset home -- retire constant/membranes/ overlay (Codex assets-audit P0.3)
93e32d391 refactor(thermo,tools,docs)!: retire the methods/<model>.dat ceremony record + prune empty dirs (Codex order)
7586b6f4d fix(data,thermo,tools)!: P0/P1 of the species split -- lexical collision + O2(aq) is not an ion (Codex audit)
96b6f2b27 refactor(data,thermo,tools)!: the aqueous monolith dismantles -- ONE typed file per model species
d683d2e81 refactor(data,thermo): Criss-Cobble lives in each ion's OWN record -- the monolith dies (Vitor's arity-1 call)
aec256ee7 feat(tools,data): reachable-closure sealing -- the seal is the case's physical subgraph (Codex audit)
76042bfd0 refactor(electrolyte): the Pitzer oracle checks the CASE's ions; the full sweep is verifyGlobal's (Codex seal-audit)
ea90a77b8 feat(tutorials): OpenFOAM-style project banner on every authored case file
444b8b939 feat!: the CONSOLIDATION -- v1 propertyDict retired, thermophysicalPropertySystem is THE case grammar
0adf36c6a chore(data): refresh the 58 seals whose ethanol/nButanol origin evolved (G6 curation)
5a5cd86f4 feat(thermo,tools): G7 -- v2 inherits chains, the fractal contexts migrate (Codex-ratified)
a3ee62504 feat(data,tools): G6 -- UNIQUAC r/q live in the component .dat, rq{} retired from case dicts (Codex-ratified)
3786d8a44 fix(props): authored-v2 rides its OWN channel to the fit op, never thermoDict
c45fda372 feat(thermo,props,tools): G3 -- inline binaryParameters + the v2 fitting path (Codex-ratified)
f6f693e1a feat(thermo,tools): G2 -- formulation gammaGamma, the LLE/VLLE world (Codex-ratified)
6efab5b84 feat(thermo,tools): G5 -- real vapour phi (SRK) in gammaPhi AND diluteSolution (Codex-ratified)
9acd416ce feat(thermo,tools): G4 -- pureFluids{} rides v2 top-level, verbatim (Codex-ratified)
0cdf97136 feat(data,tools): G1 -- drop the redundant phase{type vle} on v2 migration (Codex-ratified)
bf816127e feat(data,tools): migrator cohorts T2 + diluteSolution -- 26 cases to thermoPhysPropDict v2
4447d6988 feat(tests): seal-drift gate -- sealed copies audited against the live catalogue
bbb4c57b0 refactor(thermo): retire every legacy constant/propertyData/ engine leg
f2dd4e1b7 feat(cases,thermo,tools): migrate the two legacy propertyData snapshots to the mirrored sealed form
d8429739a feat(tools,data): seal partial by-name overlays via --merge-overlay (gap 4)
539cb25ae fix(data): re-seal ternary03 with UNIFAC group tables in its closure
7f0d0f2bf feat(data): seal drying cases -- air + sucrose GAB closure
eeb4f0bda feat(thermo,tools): route UNIFAC group tables through the record resolver -- seal extract01 + column05
e7c223a82 feat(thermo,tools): sealing gap D -- Henry dilute-solution pairs + 27 air/dust/power/utility cases
c51ccca29 feat(thermo,tools): sealing gap C -- predefined mixtures mirrored
169b03dbf feat(cases): seal the electrolyte cases into mirrored constant/ (gap B)
24205d092 feat(cases): seal the asset cases into mirrored constant/ (gap A)
ddd605b3b feat(thermo,tools): sealing gaps A+B -- assets mirrored, electrolyte closure widened
03c6deb44 fix(cases): re-seal the 3 props pilots dropped by the wave's tree cleanup
b93deff89 feat(cases): seal ctrl into mirrored constant/
a4d9f204f feat(cases): seal batch adsorber+combustion+still into mirrored constant/
05ea3bec0 feat(cases): seal batch reactor+recipes into mirrored constant/
9c3ab1242 feat(cases): seal steady/optimisation into mirrored constant/
7aa784509 feat(cases): seal props/electrolyte (speciate-closure cases) into mirrored constant/
d024d2498 feat(cases): seal plant cases into mirrored constant/
a998825f0 feat(cases): seal props/adsorption into mirrored constant/
cf2438503 feat(cases): seal steady/rotating into mirrored constant/
cc37674de feat(cases): seal props/{steam,heat,gibbs,thermoTest} into mirrored constant/
50e7ca37d feat(cases): seal steady/flowsheets into mirrored constant/
0fec0af86 feat(cases): seal props/scan into mirrored constant/
92acdb5f8 feat(cases): seal steady/heat into mirrored constant/
47d9310ad feat(cases): seal props/estimate into mirrored constant/
9f066e999 feat(cases): seal props/molecular into mirrored constant/
9053dac4d feat(cases): seal steady/hydraulics into mirrored constant/
5599ef341 feat(cases): seal props/compare into mirrored constant/
619a10f69 feat(cases): seal steady/separation into mirrored constant/
872156db9 feat(cases): seal steady/membranes into mirrored constant/
fcca7490e feat(cases): seal steady/crystallisation into mirrored constant/
3f4a8ab90 feat(cases): seal steady/reactors + steady/gibbs into mirrored constant/
5d7b63303 feat(cases): seal steady/distillation into the mirrored constant/ form
59c2e4672 feat(cases): seal steady/flash into the mirrored constant/ form
25a1e3ccb feat(cases): seal the 7 v2 pilots into mirrored constant/ (self-contained, audit-ready)
677fa7ccb feat(thermo,tools): sealing v2 -- one common RecordResolver + mirrored constant/ + propertyManifest
7e51a1da4 chore(gui): exclude sealed constant/propertyData/** from the tutorial glob
4b4f619c2 feat(data,tools): sealing wave phase 1 -- choupo-import speaks v2 + 6 pilot snapshots
415c24005 fix(solver): drop the obsolete outerDriver+builder-manifest refusal (gap 1)
d19823c15 refactor(cases): v2 wave -- polycaprolactonePlant joins T1 (the steady follow-up case)
b5aff677b refactor(cases): v2 wave -- the batch/ctrl cohort (40 dicts) rides the new dispatch
bb7bde3fe feat(thermo): choupoBatch + choupoCtrl speak v2 -- thermoPhysPropDict dispatch
d4756b2eb refactor(cases): v2 wave -- the speciation cohort (13 dicts) reads the aqueous surface as physics
ec3f4a514 refactor(cases): v2 wave -- the transport cohort (17 dicts) reads gas/liquid/interface as physics
cd2e2ef58 feat(thermo): v2 T13 -- the transport block; pipe02 reads gas/liquid/interface as physics
6abe027b8 fix(props): speciation ops resolve thermoPhysPropDict -- the 4th wave gap closed
7ab9f4016 refactor(cases): v2 wave cohort (b) -- manifest packages read as declared formulations
6471a870f refactor(cases): v2 wave cohort (a) -- flat non-ideal activity reads as declared gamma-phi
7f35700e1 refactor(cases): v2 wave -- the strict-T1 cohort (116 dicts) reads as declared physics
9b4e2e5f5 feat(thermo): v2 wave phase 1 -- phiPhi + diluteSolution formulations; choupoSolve speaks v2
3eb877a71 feat(thermo): v2 contract SPIKE -- thermoPhysPropDict, physically-decomposed blocks (3 cases)
87faee645 feat(thermo,gates): Migration 6 closure -- active-set pair domains + the permanent gates
6bee4f479 refactor(data): Migration 5 -- chemistry/ flattens; recordType IS the family (no kind duplicate)
136386d61 refactor(data): Migration 4 -- physical kit lives in assets/, ONE flat home, kind = consumer
ca5ae7779 fix(cases,thermo): Codex-audit P0/P1 -- restore the EXTRACTION LLE closure + gate parameters{}
6f1b44b41 refactor(data): Migration 3 -- propertyMethods/<family>/ flattens to methods/ (kind field)
503307365 refactor(data): Migration 2 -- every pair catalogue lives in parameters/<MODEL>/ (one spelling, all tiers)
83ba33fa0 refactor(cases): drop the three silently-ignored propertyDict declarations (20 dicts)
d6c1693a7 chore(src): scrub stale layout comments -- comments only, zero semantics (#143 batch)
98f165d74 docs(guides,ai): retire stale proposed-tier + species-directory claims (#143 batch)
cdc8a90fc docs(architecture): evidence-driven scrub -- authority map + factual corrections (#143 batch)
a95461ab3 feat(electrolyte): generic multi-gas Henry pin -- open systems beyond CO2
```

## 10. Deferred to 2608 (proposed, NOT started)

- Ctrl PHYSICAL energy: reformulate dynamicCSTR around a stored U(n,T) /
  H(n,T) so the first-law ledger can claim closure.
- solverDict consolidation; speciation aliases; PC-SAFT association term;
  catalogue expansion; new unit operations.
- Reports default-on beyond elementBalance (mass/energy as normal
  diagnostics of every solved result — measure impact first).
- Pinch full programme (real match sizing beyond the heuristic screen).
- Provenance-badges slice of the Property Explorer (only if proposed and
  accepted).
- Landing mobile layout (§4 debt #4); help-index/guide coverage (§4 debt
  #3) if not closed before the transfer.

## 11. Files carrying USER changes — do not touch

- `tutorials/plant/ChemicalPlantTutorial/JuiceSplitter/JuiceSplitter.cho`
  — tracked, modified: Vítor's GUI layout.  Never revert, never sweep
  into a commit.
- Untracked root files — coordination channels and drafts, never staged:
  `chatGPT.md` (Codex → Claude), `ClaudeChat.md` (Claude → Codex),
  `codex.MD`, `HANDOFF.md`, `MORNING.md`, `GUI_SESSION_HANDOFF.md`,
  `STANDARDS_REORG_HANDOFF.md`, `AI_SLOP_REVIEW.md`,
  `site/product-workspace.webp`.
- Git identity for any commit: `Vítor Geraldes
  <talentgroundlda@gmail.com>`; no Co-Authored-By trailer; scoped adds
  only (never `git add -A`).
