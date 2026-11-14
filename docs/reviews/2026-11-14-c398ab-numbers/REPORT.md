# The c398ab integration: what a golden comparison cannot see, by measurement

Date: 2026-11-14.  Subject: `origin/integ/c398ab` at a5d286d69 (four merged
branches: `c398/slice-a-variants`, `c398/slice-b-named-laws`,
`fix/pa09-t-vf-pressure`, `c329/b1-review-rows`) against `origin/main` at
afa154705 (the merge base).  The reviewer did not build what it reviews.  No
tracked file was changed; every probe on a copy of a case ran outside the
tree.  No `bin/runTests` was run (the coordinator's full regression covers
the goldens).  Rows `CN-01..CN-06` are in `docs/reviews/LEDGER.tsv`.

**The claim attacked.**  Apart from four appended `source` rows (ratebased01-04)
and the goldens of the new witness cases, no number that any shipped case
computes has changed, on any path, and no shipped case is newly refused.

## 0. Verdict

The claim holds for every number and every refusal measured, with ONE
exception: the plant-boundary energy report of `totalReflux01_c6c7_yanagiRun628`
moves (CN-01, S2), from the `c329/b1-review-rows` change to
`EnergyBalanceReport.cpp`; the move is a correction (it is RB-15's fix) but it
is not in the claim's list, and its golden cannot see it.  One false statement
by the new resolved view on a shipped case (CN-02, S2) is the other row that
matters.  Everything else is text the builders already listed.

## 1. Method

Two clean builds: the branch in this worktree, `origin/main` exported into a
separate folder (each binary linked to its own `libchoupo.so`, checked with
`ldd`; each run with `CHOUPO_HOME` set to its own tree, so each reads its own
`data/`).  A harness ran every case IN PLACE in each tree with that tree's
binary (dispatched by `application`, as `runCase` does) and compared: stdout,
stderr, the result JSON key by key (every numeric leaf), and every file the
run created or changed (state directories `0/` and `converged/`, `<t>/` and
trajectory CSVs, reports, sweep CSVs, iteration snapshots).  Before comparison
the known text-only differences were normalised away and then READ, not
assumed: tree paths, the commit stamp of the banner and the citation,
wall-clock timestamps, the `[properties]` view, the `[propertyPoint] key ...
omitted` line.  Every remaining difference was classified by hand.

**The sample: everything that runs from the repository.**  All 600 tutorial
cases that dispatch to a shipped binary (the six with a compiled `code/`
directory excluded), the 9 benchmark cases, and a stratified sample of 98
`data/curation` cases (all 6 batches, every 4th electrolyte, every 5th
component, every 12th Henry pair, every 25th pair) -- 698 cases, both builds:

| binary | ran to exit 0 on both | identical failure on both |
|---|---|---|
| choupoSolve | 339 | 6 (deliberate refusal witnesses, one benchmark) |
| choupoProps | 208 | 57 (56 curation cases that need `constant/archiveExtracts`, not tracked; 1 refusal witness) |
| choupoBatch | 58 | 3 (refusal witnesses) |
| choupoCtrl | 21 | 0 |
| choupoSemiContinuous | 8 | 0 |

31 751 written files compared.  Exit codes identical in all 698 (no case newly
refused, none newly accepted).  The three two-mode cases were also run in
their other mode (choupoProps on `reforming01_methane_steam_pfr`,
`ctrl17_step_reaction_curve`, `membrane24_fit_then_simulate`): every numeric
leaf of the result identical.

The brief's named groups are all inside the sample and all identical in every
number: the cases loading sealed or catalogue copies of benzene, ethanol,
methanol, toluene and water with every liquid-transport word; the three
COSMO-SAC cases and the five PC-SAFT cases (the records whose provenance
entries left `cosmo{}`/`pcsaft{}`); the four graphite (NASA7) cases; the five
RowlinsonBondi cases; every batch, ctrl and semi-continuous case including
those with unit fragments and sectors; all 14 plants including
`lithiumBrinePlant`; `transport_c327`.

## 2. Findings

### CN-01 (S2): a number moves in a shipped case, unpinned -- `totalReflux01`'s energy boundary

`src/reporting/EnergyBalanceReport.cpp:293-305` (from `c329/b1-review-rows`)
now adds a stream-less distillation column's duties to the plant boundary.  On
`tutorials/steady/distillation/totalReflux01_c6c7_yanagiRun628`, unmodified,
the result's `globalEnergyBoundary` and `reports/balances/globalEnergyBoundary.csv`
move:

| field | main | branch |
|---|---|---|
| `noBoundary` | true | false |
| `residual_denom_kW` | null | 1282.99297228 |
| `residual_pct` | null (`residual_pct_available` false) | -1.77221294547e-14 |
| `Q_boundary_kW`, `Q_heat_kW`, `residual_kW` | 0 | -2.27373675443e-13 |
| `residual_basis` | "UNAVAILABLE -- this plant declares no duty ..." | "energy exchanged (...)" |

and the stdout report line goes from "NO EXCHANGED-ENERGY SCALE -- percentage
unavailable" to "|in-out|/in = 0.000 %".  The golden pins only
`H_feeds_kW`, `Q_boundary_kW` (0 at 1e-4) and `H_products_kW` of that block
(`expected:32-34`), so the regression passes it.  The other 15 stream-less
column cases (packing01-04, ratebased01-04, trayEfficiency01-07) print no
boundary block, so this is the one shipped case it reaches.  The move is the
fix RB-15 asked for and the new numbers are right; the defect is that the
claim omits it and nothing pins the denominator or the flag that changed.
Remedy: name it in the landing's list of moved outputs, and pin
`residual_denom_kW` / `noBoundary` in the golden.

### CN-02 (S2): the resolved view says the transport properties have no model while the run computes them

`src/thermo/ResolvedView.cpp:452-458`: a transport row with no package model
and no per-constituent laws prints "no model: a consumer that asks is refused,
or takes its own source", without consulting the pure-fluid route.  On
`tutorials/props/steam/steam02_water_transport` (unmodified; `pureFluids {
water { method IF97; } }`, no `transport` block) the view prints that line for
vapour viscosity, vapour thermal conductivity, liquid viscosity, liquid
thermal conductivity and surface tension, while the same run prints `water
viscosity: IAPWS R12-08`, `water thermal conductivity: IAPWS R15-11`, `water
surface tension: IAPWS R1-76` and returns them (25 C: viscosity 8.900e-4 Pa s,
k 0.6065 W/(m K), sigma 0.07197 N/m) -- the case's whole subject.  The same
view does name the IF97 route for density and vapour pressure, so it is
inconsistent within one block.  No number is wrong; the statement is.  (The
view is new in this integration; SA-04 lists other misleading lines, not this
one.)

### CN-03 (S3, by reading): a vapour-pressure pin of water is not honoured by `speciate`'s solvent leg

`src/propertyOps/Speciate.cpp:595-596` prices the solvent's partial pressure
with `database()->loadComponent("water").vp()`, a fresh copy built after the
package's `RecordLawPinScope` has closed (`ThermoPackageBuilder.cpp:2001-2008`),
so it takes the record's preferred law even when the case pins another, and
`verifyRecordLawPins` checks only the package's own components.  Same class as
SB-01 (a component copy outside the package).  Not reached by any shipped case
(no shipped record of water holds two vapour-pressure laws; the witness
`purelaws02` uses a case-local copy and no speciation).  Not reproduced at run
time.

### CN-04 (S3, pre-existing, same on main): the vapour transport accessors return saturated-LIQUID values on the pure-fluid route

`src/thermo/ThermoPackage.cpp:2075-2093`: `viscosityGas` on a pure-fluid
component returns `m.mu(T, m.p_sat(T))`; the comment says "the saturated-vapour
state", the kernel returns the liquid branch.  Reproduction: a copy of
`steam02_water_transport` with `pin_25C` set to `T 473.15 K; P 1 bar` (a
superheated vapour; the run's own `v_molar` 0.0393 m3/mol): `viscosity`
1.3459e-4 Pa s and `thermal_conductivity` 0.6586 W/(m K), the saturated-liquid
values at 200 C, where steam is about 1.6e-5 Pa s and 0.033 W/(m K) (factors 8
and 20).  Identical with main's build, so not this integration's; it matters
to it because the new `[propertyPoint]` text names that key "the vapour
viscosity" (`PropertyPoint.cpp:209-211`).  No shipped case evaluates it on a
vapour state (the cases declaring `pureFluids` either ask liquid states,
steam02, or never call the gas accessors on pure water: rankine02, the spray
dryers, reboiler_water_copper, economics04).

### CN-05 (S4): a negative zero printed by the corrected boundary report

The duties added by CN-01 sum to -2.27e-13 kW, printed as `Q_boundary,-0.000000`,
`residual,-0.000000`, `residual_pct,-0.0000` in the CSV and "residual -0.0000 kW"
on stdout (`totalReflux01`).  Cosmetic; a student reads a sign.

### CN-06 (S4): the caveat block now lists provenance of properties the run never evaluates

The provenance entries moved home are read at load, so every run that loads
water (catalogue copy) gains `UNVERIFIED DATA (1): component 'water':
'surfaceTension' reviewStatus autoPromoted` in its ASSUMPTIONS AND CAVEATS
block and result advisories -- e.g. `aminoBuffers01_tris_glycine` goes from
"ASSUMPTIONS AND CAVEATS: none raised" to that line, and the case evaluates no
surface tension.  The builders listed the announcement as text; the wording
("what this run announced along the way") reads as if the run used it.

## 3. Paths a refusal could newly reach (counted, not only run)

* **The T-and-P refusal** (`StreamStateIO.cpp:3219-3256`, `:3304-3331`).  It is
  reached only by `readStreamState`, whose two callers read `0/`
  (`StreamStateIO.cpp:3473` via `Flowsheet.cpp:2285`; `DynamicDriver.cpp:266`).
  Tear seeds and products written back go through `writeStreamState`, which
  always writes T and P (`StreamStateIO.cpp:401-402`); outer-driver
  `StreamOverrides` act on the read registry (`SweepDriver.cpp:135-145`,
  `DesignSpec.cpp:242-254`), not on files; props inline `state {}` blocks and
  batch recipe charges have their own readers.  A parser over EVERY `0/` tree
  in the repository (tutorials, benchmarks, data/curation, gui) found 1794
  stream-state files and 0 without a top-level T or P.  `-init0 --force` on
  two recycle cases (membrane18, ed07) writes identical `0/` on both builds.
* **The removed factory defaults.**  Read by code: the Chung vapour viscosity
  was the only default reachable from an authored block (any `transport {}`
  without a vapour viscosity); its consumers either refuse by name (cyclone,
  bag filter, spray dryer, Ergun bed, AIChE/rate-based column, PFR Ergun,
  pneumatic conveyor) or swallow the error (propertyPoint drops the key,
  announced; propertyScan writes NaN).  A parser over 2119 dictionaries found
  0 transport property blocks without a `model` word on main; the six props
  `thermo {}` fragments that carry `transport` sit on bases with no transport
  (identical result under the new per-block merge) or on the two bases that
  now declare Chung (mixing01, surfacetension01: every number identical).  No
  JSON key and no CSV column disappeared in the 698 runs.  NASA7: all five
  NASA7 records (graphite and four sealed copies) declare Tlow/Tcommon/Thigh.
* **The time-integrated `thermo` refusal** (`PropertyContext.H:273-283`): no
  flowsheetDict of the 90 time-integrated cases, unit fragments included,
  declares a unit `thermo` (one grep hit was a comment).
* **Records the new law parser reads differently** (43 401 `.dat` files
  scanned): no surface-tension block with an untyped sub-block, no
  vapour-pressure or heat-capacity block without `model` outside the new
  witness and one `data/tmp` candidate; 743 liquid-viscosity blocks hold two or
  more laws with no `preferred` -- refused only for a block with no word, and
  no shipped block lacks one.

## 4. Determinism and order

* `purelaws01` (three constituents, three record laws, a pin) with its
  component list reversed: every value identical.
* `sprayDryer01_sugar` with `( water air sucrose )` reordered to `( sucrose air
  water )`, both builds: all 42 KPIs identical within each build, and main vs
  branch identical in all 192 numeric leaves.
* Pins are keyed by name and the law choice by component index at assembly
  (`ThermoPackage::resolveLiquidLaws`, `Database::loadComponent` under a
  thread-local scope); no visit order enters it.

## 5. What I could not reach

* 56 of the 98 sampled `data/curation` cases (components, pairs) fail on both
  builds identically because their `constant/archiveExtracts/*.dat` are not
  tracked; their numbers are unverifiable by anyone working from the
  repository.
* The GUI and the WebAssembly build (no browser, no `make wasm`).
* A run-time reproduction of CN-03 (needs a case-local water with two
  vapour-pressure laws inside an electrolyte vapour case).
* Unit-local re-runs (`runCase <unit dir>`, `--refresh-from-ancestor`) were not
  run; they copy `converged/` files, which always carry T and P.
* Pre-existing, outside the claim: running the benchmark cases rewrites
  tracked files (`benchmarks/*/*/constant/parameters/PengRobinson/*.dat`,
  `kijFits/curation/*.dossier`) whose committed `rms_rel` differs from what
  BOTH engines compute today (e.g. 0.17540132 committed, 0.19673578 by main
  and branch alike); the files were restored after the run.
