# The c398ab integration: what a golden comparison cannot see, by measurement

Date: 2026-11-14.  Subject: `origin/integ/c398ab` at a5d286d69 (four merged
branches: `c398/slice-a-variants`, `c398/slice-b-named-laws`,
`fix/pa09-t-vf-pressure`, `c329/b1-review-rows`) against `origin/main` at
afa154705 (the merge base).  The reviewer did not build what it reviews.  No
tracked file was changed; every probe on a copy of a case ran outside the
tree.  No `bin/runTests` was run (the coordinator's full regression covers
the goldens).  Rows `CN-01..CN-09` are in `docs/reviews/LEDGER.tsv` (CN-07 and CN-08 from section 6, CN-09 from section 7).

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

## 6. Addendum: the fixes on `c398/slice-b-named-laws` at b0a5ffd1c

Asked by the coordinator after the builder reported CN-01..06 fixed (commit
6258b5453, merged into integ/c398ab at 7d112a493).  The head was built with
`make -j2` from a copy whose `src/`, `data/`, `bin/`, `tutorials/` and
`benchmarks/` were checked equal to `git archive b0a5ffd1c` (the banner of
that copy reads a stale commit stamp, a5d286d69, from the copied stamp file;
the sources are b0a5ffd1c's).  Main's build is the same as in section 1 (the
merge base is still afa154705).

### 6.1 The rows, re-measured as they were reproduced

| row | verdict | evidence on b0a5ffd1c |
|---|---|---|
| CN-01 | fixed | `expected` gains `noBoundary false exact` and `residual_denom_kW 1282.99297228`; the run gives exactly those.  Q_boundary_kW kept at 0: ACCEPTED.  An expected value of 0 is compared absolutely (bin/runTests:108-113, abs 1e-4 kW); the true value is 0 by construction (Q_reb = -Q_cond at total reflux) and -2.27e-13 kW is the cancellation of two 641.5 kW terms (about 2e-16 of the exchanged scale).  Pinning it would pin round-off; the price is that a defect below 0.1 W in the boundary sum is not seen, against 1283 kW exchanged.  The result JSON still carries -2.27e-13 (only the CSV and the line are printed as 0). |
| CN-02 | fixed | steam02's view now names, for vapour and liquid viscosity, vapour and liquid conductivity and surface tension, "when the phase is pure in it: water ... IAPWS R12-08 / R15-11 / R1-76 ... at the vapour state / at the saturated liquid / the saturation line", and "no model" only for any other phase. |
| CN-03 | fixed | The builder's gate arm (`check_record_law_pins speciate`, edwards02 with a second water law = Antoine A + log10 2) run on BOTH builds: on a5d286d69 FAIL, 28 of 99 numbers differ between pinned and preferred (P_atm 2.51337115048 vs 3.48386130432); on b0a5ffd1c OK, 0 differ, 28 moved by the law (the arm is not vacuous). |
| CN-04 | fixed (with CN-07) | Copy of steam02 with pin_25C at 473.15 K, 1 bar: viscosity 1.62039883352e-05 Pa s, thermal_conductivity 0.0334354404927 W/(m K) (before: 1.3459e-4, 0.6586); the same copy's `viscosity_liquid` is 1.34587280696e-4, the saturated liquid's.  The four anchors are what the release prints: IAPWS R15-11 (September 2011) Table 8, p. 14, read here from the release itself: mu 0.234877453e2 and 0.393727534e2 uPa s; lambda - lambda2 = 52.2311024 - 0.000129246457 = 52.2309732 and 177.709914 - 6.64341394 = 171.066500 mW/(m K).  The engine: 2.34877453472e-05, 3.93727534431e-05 Pa s, 0.052230973189, 0.171066499597 W/(m K) (largest relative gap 2.4e-9).  Note what they certify: the background conductivity only; at (50 MPa, 800 K) the release's full lambda is 3.7 % higher (the engine runs lambda2 = 0, as its label says).  The rename: the eight renamed rows carry identical values on both builds (pin_25C..100C viscosity and conductivity), and the scan's CSV body is byte-identical (header renamed only) -- but see CN-07. |
| CN-05 | fixed | No `-0.000000`/`-0.0000` left in any report of the 698 runs; 159 report lines in 70 cases moved from a negative zero to 0 (donepezil01/02, crystalliser01, absorption01, column13, ChemicalPlantTutorial, ...), no other digit. |
| CN-06 | fixed | aminoBuffers01 is back to "ASSUMPTIONS AND CAVEATS: none raised"; mixing01, which evaluates both surface tensions, still voices water's and acetone's.  The voicing is called from the package's per-constituent first evaluation (ThermoPackage.cpp:3046-3048); no consumer reads those record blocks outside it (grep of the three `*Dict()` readers outside src/thermo/transport). |

### 6.2 The main measurement again: 698 cases, main vs b0a5ffd1c

Same harness, same 698 cases, both builds.  Exit codes identical in all 698
(634 exit 0 on both, 8 + 56 identical failures).  Every difference, classified:

| family | lines | cases | source |
|---|---|---|---|
| banner commit stamp | 698 | 698 | my copy's stale stamp file (not the branch) |
| provenance voicing (UNVERIFIED DATA lines, [unreviewed] lines, their advisories) | 1091 | 34 | text, CN-06 |
| declared source `liquidThermalConductivity` (declaredNotUsed and the table) | 715 | 107 | text, c329 |
| negative zero printed as 0 | 159 | 70 | CN-05 |
| result provenance rows | 89 | 43 | text |
| caveat-block frame (the block appearing or not) | 52 | 9 | text, CN-06 |
| override announcement wording | 50 | 2 | text |
| the rate-based enthalpy probe advisory | 34 | 3 | text, c329 |
| pair source `inline` -> `standard` (SA-03) | 2 | 2 | text |
| Andrade/Vogel window wording (CV-15) | 4 | 2 | text |
| the Chung "Vc ESTIMATED" advisory at another position | 4 | 2 | text (mixing01, surfacetension01) |
| `totalReflux01` boundary block | 5 | 1 | CN-01, numbers, now pinned |
| `steam02_water_transport` | -- | 1 | CN-04 rename and two operations added; CN-07 |
| `methanol01_co2_hydrogenation` (benchmark) | many numbers | 1 | NOT the engine: CN-08 |

No other number differs in any stdout, result JSON or any of the files
written (the same set of state directories, trajectories, reports and CSVs as
in section 1).  The four changes on paths every case takes (the heat-capacity
wrapper, the vapour-pressure first-use hook, the stream-enthalpy rethrow of a
hard-window refusal, zero printed as 0) move no number and refuse no case in
this sample; the wrapper forwards all four virtuals of HeatCapacityModel
(Cp, H, S, modelName) and no code casts a heat-capacity object to a concrete
type.

`methanol01_co2_hydrogenation` differed in about 60 numbers (kij(CO,methanol)
-0.152688 vs -0.174458, feed T 377.248 vs 377.125 K, duties) because its
sub-cases `kijFits`/`kijTables` rewrite the tracked parameter files it reads,
and the two trees held different regenerations when it ran.  Re-run after both
trees held the same files: no number differs (both exit 2).  Pre-existing and
order-dependent: CN-08.

### 6.3 New rows

* **CN-07 (S2)**: the CN-04 rename hides two moved numbers.  steam02's
  `pin_100C` (373.15 K, 1 bar; IF97 places it in the vapour, p_sat 1.0142
  bar) still publishes `viscosity` and `thermal_conductivity`, now
  1.22336380006e-05 Pa s and 0.0245633017624 W/(m K) against 2.81585019366e-04
  and 0.677216843797 on main.  The golden rows of those names became the
  `*_liquid` rows; nothing pins the moved values, and the commit says "values
  identical".  The new values are right for steam at 100 C, 1 bar.  Remedy: list
  them as moved and pin them, or move pin_100C below p_sat.
* **CN-08 (S3, pre-existing)**: the benchmark above; a sweep's verdict on it
  depends on run order.

### 6.4 Verdict on the claim at b0a5ffd1c

Apart from the four appended `source` rows, the witnesses, totalReflux01's
boundary block (now pinned) and steam02's operations, no number of the 698
cases moves and no case is newly refused; the one unlisted move is steam02's
`pin_100C` vapour keys (CN-07).

## 7. Fourth round: `origin/integ/c398ab` at f31894354 against the current `origin/main` (bbef82e38)

The head merges `c398/slice-b-named-laws` at 5ff82183b and the current main
(which now also carries the packing-record slice and the mass-transfer
EduTool), so the reference is no longer afa154705: both sides were built
fresh from `git archive` of bbef82e38 and of f31894354 (`make -j3`, each
binary checked with `ldd` against its own `libchoupo.so`, each run with its
own `CHOUPO_HOME`).  New in this round on paths every case takes:
`src/solver/NewtonRaphson.cpp` (a refused iterate is halved back toward the
last answered point, a refused seed is re-seeded inside the stated window, an
unconverged search after a refusal rethrows it), and the stream-equilibrium
and isothermal-flash fallbacks rethrowing a hard-window refusal.

### 7.1 The measurement: 699 cases, main vs branch

The same 698 cases plus `packing05_schulz_record_0p10bar` (new on main, on
both sides); the three witnesses that exist only on the branch were not
compared.  Exit codes identical in all 699: 635 exit 0 on both, 8 refusal
witnesses and 56 curation cases (no archive extracts) fail identically.

| family | lines | cases | source |
|---|---|---|---|
| provenance announcements (UNVERIFIED DATA, [unreviewed], advisories) | 1091 | 34 | text (CN-06) |
| declared source `liquidThermalConductivity` | 717 | 108 | text (c329) |
| a negative zero printed as 0 | 159 | 70 | CN-05 |
| result provenance rows | 89 | 43 | text |
| caveat-block frame | 52 | 9 | text |
| override announcement wording | 50 | 2 | text |
| the rate-based enthalpy probe advisory | 32 | 2 | text (c329) |
| `[cp] ... declares Trange unknown` printed a second time (two lines each) | 386 | 6 | text, CN-09 |
| pair source `inline` -> `standard`; Andrade/Vogel window wording; the Chung advisory's position | 2 + 4 + 4 | 6 | text |
| `totalReflux01` boundary block | 5 | 1 | CN-01, pinned |
| `steam02_water_transport` | -- | 1 | two operations added, the renamed keys, the two pin_100C vapour values (CN-07, pinned) |

No other number differs in any stdout, result JSON or written file (state
directories, trajectories, reports, CSVs).  The benchmark
`methanol01_co2_hydrogenation` agreed this time (both exit 2, no number
differs): both trees started from the committed parameter files, which is
what CN-08 says it depends on.  `reforming01`'s rewritten
`eppr78_1000K.dat` has the same content on both sides (only its mtime
differed).  So the new Newton safeguard and the two rethrows move no number
and refuse no case in this sample; this sample cannot say how often they
fire, only that no shipped case's answer moved.

### 7.2 CN-07: fixed

The unmodified steam02 on f31894354 gives `pin_100C` `viscosity`
1.22336380006e-05 Pa s and `thermal_conductivity` 0.0245633017624 W/(m K)
(main: 2.81585019366e-04 and 0.677216843797), and `expected:95-96` now pins
exactly those values (1e-4); commit 5ff82183b corrects the previous commit's
"values identical" and states the old and new values.  Every other key of
every steam02 operation is identical to main's.

### 7.3 New row

* **CN-09 (S4)**: `src/thermo/ResolvedView.cpp:134-141`, `:169`.  The view
  builds a fresh law object from every record law it prints, to show a probe
  value, so each construction-time announcement runs twice per package at
  verbosity 2 or more: `[cp] polynomial Cp for X declares Trange unknown;`
  goes from 1 to 2 (2Chlorobutane-toluene), 3 to 4 (temperature02), 6 to 8
  (new_components_c309) and 186 to 372 (transport_c327, two records in 93
  packages) on stderr; at verbosity 1 (no view) the count is back to 1.  The
  advisory log de-duplicates, so the result JSON is unchanged, and no number
  moves.

### 7.4 Verdict at f31894354

Against the current main, no number of the 699 cases moves and no case is
newly refused, except the moves the claim now lists and pins (totalReflux01's
boundary block, steam02's renamed keys and pin_100C vapour values) and the
four appended `source` rows.  Open rows: CN-08 (pre-existing benchmark order
dependence) and CN-09 (a doubled stderr line).

## 8. Fifth round: `origin/integ/c398ab` at 8ffee1a73 against the current `origin/main` (a58d52c7e)

What changed since section 7, as the integration describes it:
- the in-search hard-window machinery is removed (`NewtonRaphson.cpp`, `IsothermalFlash.cpp` and `StreamEquilibrium.H` now equal main's, checked by diff);
- a post-solve audit of the reported states is added in Flowsheet and the props operations;
- the package identity changed;
- the time-integrated binaries gain a refusal (`refuseUnauditedHardWindows`);
- main's C394 harness is merged (`bin/` only; between bbef82e38 and a58d52c7e main changed nothing under `src/`, `data/` or `tutorials/`).

Both sides were built from `git archive` of a58d52c7e and 8ffee1a73 (`make -j3`). Each of the ten binaries was checked with `ldd` against its own `libchoupo.so`, and each run used its own `CHOUPO_HOME`.

### 8.1 The measurement: 699 cases, main vs branch

The same 699 cases as in section 7 were run: the 698 plus `packing05_schulz_record_0p10bar`, which is on both sides. The three branch-only witnesses were not compared. Exit codes are identical in all 699: 635 exit 0 on both builds, and 64 fail identically on both (8 refusal witnesses, 56 curation cases without archive extracts). So the new refusal in the time-integrated binaries refuses none of the 90 shipped time-integrated cases, and the post-solve audit refuses none of the steady or props cases.

Every difference, by family (the same families as in section 7, with CN-09's row gone):

| family | lines | cases | source |
|---|---|---|---|
| provenance announcements | 1091 | 34 | text (CN-06) |
| declared source `liquidThermalConductivity` | 717 | 108 | text (c329) |
| a negative zero printed as 0 | 159 | 70 | CN-05 |
| result provenance rows | 89 | 43 | text |
| caveat-block frame | 52 | 9 | text |
| override announcement wording | 50 | 2 | text |
| the rate-based enthalpy probe advisory | 32 | 2 | text (c329) |
| pair source `inline` -> `standard`; Andrade/Vogel window wording; the Chung advisory's position | 10 | 6 | text |
| `totalReflux01` boundary block | 5 | 1 | CN-01, pinned |
| `steam02_water_transport` | -- | 1 | the two added operations, the renamed keys, `pin_100C`'s two vapour values (CN-07, pinned) |

No other number differs in any stdout, result JSON or written file (state directories, trajectories, reports, CSVs). The numbers that do move are the ones section 7 lists:
- totalReflux01: `residual_denom_kW` 1282.99297228 (was null), `residual_pct` -1.77e-14 (was null), and Q_boundary/Q_heat/residual -2.27e-13 in the JSON;
- steam02 `pin_100C`: viscosity 1.22336380006e-05 Pa s and conductivity 0.0245633017624 W/(m K).

The benchmark file sets `recycle01_cavett_as_shipped` (four PR files) and `reforming01` (one file) differ in modification time only: their contents are byte-identical on both sides. That is the rewrite-in-place of CN-08. `methanol01` exits 2 on both sides, with no number differing.

### 8.2 CN-09: fixed (32f55c907)

The view now builds its probe objects silently (`ResolvedView.cpp`, `struct Silence`). The `[cp] ... declares Trange unknown` count on the combined output is now equal on both sides:

| case | main | branch | section 7 (branch) |
|---|---|---|---|
| 2Chlorobutane-toluene | 1 | 1 | 2 |
| temperature02_engineers_ladder | 3 | 3 | 4 |
| new_components_c309 | 6 | 6 | 8 |
| transport_c327 | 190 | 190 | 376 |

The advisory log is unchanged.

### 8.3 Rows

No new row. CN-01..07 and CN-09 are fixed; CN-08 stays open (pre-existing: benchmark sub-cases rewrite tracked inputs of their parent case).

### 8.4 Verdict at 8ffee1a73

Against the current main, over 699 cases, no number moves and no case is newly refused, except the moves the claim lists and pins: totalReflux01's boundary block, steam02's renamed keys and `pin_100C` vapour values, and the four appended `source` rows.
