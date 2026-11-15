# Review: C398 slice (d) + A4, grammar, refusals, the column, the view, gates

Date 2026-11-14.  Subject: `origin/c398/slice-d-diffusion` at bb4e8f00b.
Rows DG-01..DG-10 in docs/reviews/LEDGER.tsv (reviewer branch
`review/c398d-grammar`, 2ac1693c8).

Verdict: not ready to land as it is; no S1, four S2.  The diffusivity
grammar holds (every refusal probed fires and says why) and the door
replaces the column's own Wilke-Chang with the same numbers.  Blocking: an
A4 hole (a property value typed in a column block still read and used), two
places where a measured viscosity is set aside or not used without warning,
and four sabotages that pass all seven named gates.

## What was run

bb4e8f00b built with `make -j4`; about 60 probes on copies of the witness,
ratebased01, trayEfficiency01 and column01/02/03; 12 sabotages one at a time
(rebuild, the 7 gates, the goldens of the 17 slice cases); a scratch merge
with (c) and the adapter swapped out.  No full sweep.  Base: 19 PASS / 0
FAIL.  Tree restored, `make all` re-run, `git status` clean.

## What holds (measured)

* Diffusivity grammar: refused by name: solute == solvent; a component the
  system lacks; two entries for one pair; a misspelt rule (suggests
  "Vignes"); `take 0`, `take 2`, `take` missing; `from`; `returns` missing;
  `model` beside the new keys; `composition` with `returns
  infiniteDilution`; `VignesKooijmanTaylor` in the selected variant; `value`
  beside `experiments`; a negative value; in the experiments file: wrong
  property, kind, direction, `system`, no T column, no box, two points, a
  wrong-dimension unit; a box wider than its point with no or blank reason.
* n >= 3 with `returns effective`: "present" read from the stream (x > 0):
  three declared with one at zero allowed; a trace of 1e-12 refused; a pure
  liquid refused as self-diffusion.
* Measured viscosity grammar: `use` missing, reason empty or missing, box
  missing or missing an axis, a box not containing its own point, two
  points, no unit, wrong dimension, wrong property, solvent not in
  `system`, a w column for the solvent, an unknown key, two `use method` on
  one set: all refused.  degC converted and announced.
* Box: a state outside is refused at evaluation in the props op and the
  column; no catch falls back to another source.
* `use method` reaches every consumer of `viscosityLiquid` (door, props op,
  view, the AndersonBabb diffusivity: D_L_effective falls by exactly the
  inverse viscosity ratio, 0.75556); `use check` moves no number.
* A4 at the top of `DistillationColumn::solve`: fired for rateBased,
  WangHenke, simultaneous and MESH, in `operation`, `operation.packing`,
  `operation.condenser`; unknown words announced as never read.
* No other Wilke-Chang instance in src/; the ratchet reports 76.
* Docs: both Theory Guide sections exist with the witness numbers; modelDocs
  links the four rules; docs/ai and the catalogue updated; PDFs rebuilt.
* An unselected variant's diffusivity block is never parsed (consistent
  with check_variant_same_values (h)).

## Rows

* **DG-01 (S2)**: `hydraulics { sigma }` passes the A4 refusal: the list
  (ColumnTypedProperties.H:41-73) has `surfaceTension`, not `sigma` (read at
  TrayHydraulics.cpp:164), and the refusal looks one level deep
  (Dictionary.cpp:681).  One tray then has two surface tensions (hydraulics
  prefer the typed value, TrayHydraulics.cpp:249-252; efficiency the
  package, DistillationColumn.cpp:5206).  trayEfficiency01 with `sigma
  0.05;`: exit 0, %flood 57.6 -> 48.3, E_MV tray 1 0.7307 -> 0.7323;
  surfaceTension listed twice in the sources.  Shipped: aceticAcid02_plant.
  The guide and unit-ops.md say "any property word" is refused, and the
  unit-ops example still shows `sigma`.  Printed as `declared`.
* **DG-02 (S2)**: a trace of a third component silently replaces the
  measurement with the law (`liquidViscosityMeasurementFor` matches only an
  exact component set, ThermoPackage.cpp ~:3335): isopropanol 1e-9 added
  gives 3.7778e-4 (the law), not the declared 5e-4; exit 0, no word.
* **DG-03 (S2)**: a one-component measurement is used by `viscosityLiquid`
  only; `pureLiquidViscosity` (Wilke-Chang solvent viscosity, the mixing
  rule's inputs, mu_j) keeps the law; methanol at 0.5 mPa s leaves
  D_L_inf_water_in_methanol unchanged.  Two viscosities for one pure liquid
  at one T in one run.
* **DG-04 (S3)**: `use check` beside `use method` on one set accepted and
  never printed (ThermoPackage.cpp:2238).
* **DG-05 (S3)**: the remedy for an unlisted pair suggests the old `{ model
  WilkeChang; }` (ThermoPackage.cpp:2287), which the new reader refuses; an
  omitted `kind` reads "unknown diffusivity kind ''".
* **DG-06 (S2)**: sabotages passing every named gate (table); the ratchet's
  DIRECT_OTHER (check_liquid_property_ratchet.py:112-114) misses
  `diffusivityLiquidEffective(`, a constructed `WilkeChang`, and
  `LiquidDiffusivityModel::New`.
* **DG-07 (S3)**: ruling 7 has no gate; proposed arm: profile columns
  `D_L`, `mu_L` at RateBasedSegment.cpp ~:882, a propertyPoint at one
  segment's state, equality to the printed precision.
* **DG-08 (S4)**: the door marks the measured value `literature` whenever T
  equals the stated T, whatever the composition; a one-component measurement
  called a "measured mixture value".
* **DG-09 (S4)**: check_standards_write_guard probe (b) fails in a worktree
  because `run_case` (lines 139-145) inherits the shell's CHOUPO_HOME; passes
  with CHOUPO_HOME=$PWD; fix: set it to ROOT.
* **DG-10 (S3)**: ruling 6's last clause (a zero interaction declared) is not
  implemented: a liquid-viscosity pair with no G_ij mixes with G = 0,
  announced once (LiquidViscosityMixingRule.cpp ~:186); outside the slice's
  files.

## Sabotage table (golden = the 17 slice cases)

| # | sabotage | caught by | result |
|---|---|---|---|
| S1 | AndersonBabb computed as the Vignes product; view unchanged | none of the 7; goldens trayEfficiency01-05 | MISSED by gates |
| S2 | `take <any>` accepted and ignored | none | MISSED |
| S3 | `use method` ignored in `viscosityLiquid` | liquid_diffusivity_declaration, view_matches_calls, ratebased_segment, packing_record; 16 goldens | CAUGHT |
| S4 | packed column's own Wilke-Chang, door still called | liquid_property_ratchet, ratebased_segment, packing_record; 5 goldens | CAUGHT |
| S5 | association-factor default 1.0 -> 1.5, view says 1.0 | packing_record (incidentally); 15 goldens | CAUGHT incidentally |
| S6 | props D_L_effective always Vignes | none | MISSED |
| S7 | n >= 3 refusal removed | liquid_diffusivity_declaration | CAUGHT |
| S8 | `liquidViscosity` dropped from the column's refusal list | liquid_diffusivity_declaration | CAUGHT |
| S9 | VKT read as Vignes | liquid_diffusivity_declaration | CAUGHT |
| S10 | an entry matches either direction | liquid_diffusivity_declaration; witness golden | CAUGHT |
| S11 | box never refuses at evaluation | liquid_diffusivity_declaration | CAUGHT |
| S12 | column calls `diffusivityLiquidEffective` directly | none (ratchet missed); goldens via the `source` row | MISSED by gates |

check_variant_same_values and check_feature_documented caught none.

## Merge with (c)

(c) at 1492dba57 onto bb4e8f00b: text conflicts in src/core/Units.cpp (the
duplicate `mPa.s`), check_view_matches_calls.py, docs/ai/capabilities.md,
docs/propsGuide-operations.tex (each keep-both); generated: codeMap.json,
releaseInventory.json, the three PDFs.  Builds clean; 19 golden rows pass.
The adapter can be deleted: a ~50-line shim over (c)'s `experiments::readFile`
+ `readTable` (roles read by column name), +59 / -219, builds, goldens and
check_ratebased_segment / check_packing_record pass; one arm of
check_liquid_diffusivity_declaration expects "has no `unit`" where (c) says
"declares no unit".

## What could not be reached

check_standards_write_guard on origin/main itself; the GUI and WASM;
aceticAcid02_plant (the sigma path shown on trayEfficiency01).

(Written into the tree by the coordinator from the reviewer's hand-back:
the harness refuses report files written by a subagent.)

## Round 2 (2026-11-15): `origin/c398/slice-d-diffusion` at 54d8e1037

Verdict: the four S2 rows of round 1 are fixed, each measured; nothing new
at S1 or S2 on this lens.  New: DG-11..13 and DG-15 (S3), DG-14 (S4).

Run: 54d8e1037 built (`make -j4`); the 7 gates and the 17 slice cases (19
rows) pass; about 25 new probes; 8 sabotages one at a time; every case with
a column `hydraulics` block; a scratch merge onto the current origin/main.

* DG-01 fixed: `hydraulics { sigma }`, sigma three blocks deep, `rho` in a
  list of blocks and `muL` under an unknown block refused by name; every
  lookup in src/unitOperations/distillation/ grepped, no other property key
  read; no false positive (column19's `lnKa` block outside `operation`).
* DG-02 fixed: a 1e-9 isopropanol trace refused at evaluation, naming it.
* DG-03, DG-04, DG-05 fixed; DG-06 fixed (S1 and S6 caught by
  check_liquid_diffusivity_declaration, S2 by the `take` arms, S12 by the
  ratchet); DG-07 fixed (a props-route-only perturbation of 1e-8 caught on
  D_L and mu_L; ratebased01's mu_L is a stated constant); DG-08 fixed by
  reading; DG-09 and DG-10 open, outside the slice.
* The surface-tension rule for supercritical components lives in
  `TrayHydraulics::surfaceTension` (TrayHydraulics.cpp:108-138), column-only;
  of 13 cases with a `hydraulics` block only aceticAcid02_plant drops a
  component; announced on stderr, as a KPI and as `leftOut` in the sources.
* Leffler-Cullinan equals Vignes only on a log-mole-average mixture
  viscosity; with a Grunberg-Nissan interaction (A = 1.0) on the witness
  Vignes 8.55503522944e-09, LC 8.12825964899e-09 (-4.99 %).

| # | sabotage | caught by | result |
|---|---|---|---|
| S1 | AndersonBabb computed as Vignes | liquid_diffusivity_declaration; 6 goldens | CAUGHT |
| S2 | any `take` accepted | liquid_diffusivity_declaration | CAUGHT |
| S6 | props D_L_effective always Vignes | liquid_diffusivity_declaration; witness golden | CAUGHT |
| S12 | column calls `diffusivityLiquidEffective` directly | liquid_property_ratchet; 5 goldens | CAUGHT |
| R7a | props route only: D_L x (1 + 1e-8) | liquid_diffusivity_declaration | CAUGHT |
| R7b | props route only: mu_L x (1 + 1e-8) | liquid_diffusivity_declaration, variant_same_values | CAUGHT |
| S16 | supercritical threshold at 0.9 Tc | no gate; goldens pass | MISSED |
| S17 | efficiency takes 1.05 x the door's sigma | only goldens trayEfficiency06/07 | MISSED by gates |

* **DG-11 (S3)**: a stated value on (methanol water) refuses every pure
  state of either constituent anywhere in the package (a propertyPoint at
  pure water exits 1, "holds no methanol"); no shipped case hits it.
* **DG-12 (S3)**: Leffler-Cullinan against Vignes untested where they differ.
* **DG-13 (S3)**: the supercritical rule and the single surface tension per
  tray are held by no gate (S16, S17).
* **DG-14 (S4)**: the ratchet still misses `std::make_unique<WilkeChang>`, a
  type alias, and a bare `diffusivityLiquidBinary(`.
* **DG-15 (S3)**: the merge with (c) at 85f01cbb4: 16 files conflict,
  among them five GUI files where both re-pointed lesson citations (to be
  re-derived with the repoint tool); a keep-both on the ThermoPackage.cpp
  hunk drops a closing brace; with it restored the C++ builds, 19 golden
  rows pass and five gates pass on the merge.

Ledger: `review/c398d-r2` at cf34c9675.

## Round 3 and landing (2026-11-15)

The builder answered DF-13..16 and DG-11..14 (778359946) and DF-15 by the
records' own surface-tension laws, the four sealed copies adopted
(03ec03f02; aceticAcid02 lights column D 0.337 / 0.329 / 0.342 m at
679eebd28 / round 2 / round 3); the legacy `diffusivity { model ...; }`
reader deleted (C402).  Accepted by the coordinator without a third review
round.  Merged with slice (c) by the builder (0e99b3b99, the reader adapter
replaced by (c)'s), then held on the integration tree by `--fast` 87/0 and
ONE FULL SWEEP over (c)+(d): 2240 PASS / 1 FAIL (the decision index missing
the C329 B2 record, a docs gate; fixed) / 9 EXPECTED-FAIL.
