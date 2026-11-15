# Review: C398 slice (c), grammar, refusals, view, identity, gates

Date 2026-11-14.  Subject: `c398/slice-c-tables` at 1492dba57.  Rows
TG-01..TG-16 in docs/reviews/LEDGER.tsv (reviewer branch
`review/c398c-tg01`, 6d42dfd36).

Verdict: do not land as it stands.  Two S1 holes, each turning a table's
refusal into a wrong number in an exit-0 run.  The refusals, the docs, the
density reader and the thread safety hold as measured.

## What was run

About 80 refusal probes (viscosity pins, Cp pins, record tables, the pipe
unit, a one-sector plant, variants); 13 code sabotages, each against six
gates (check_view_matches_calls, check_record_law_values,
check_record_law_pins, check_record_primitives, check_provenance_home,
check_transport_correlations) and `bin/runTests --scope` over
table01/02/03, all restored and rebuilt; liquidDensity01-06 against a
679eebd28 build; the docs gates, case-manifest and brain-facts checks,
check_seal_drift.

## What holds (measured)

* Every grammar refusal probed refuses by name: duplicate abscissa, NaN/inf,
  T below 0 K; swapped or missing units, viscosity in Pa, P, cSt or `-`,
  `J/g/K` on a viscosity, `J/K` on a Cp; a pin naming a Cp file, two pins on
  one component, a component not in the system, a file whose `system` lists
  another or two, `law` with `table`, missing `interpolation`,
  `interpolation`/`extend` on a law pin, unknown keys, a file named as a
  record law; extend with a bound inside the span, no unit, no reason, a
  misspelt key, a wrong dimension; `domain`/`Trange` anywhere; `clamp` and
  five spellings of it; monotoneCubic with 2 points, a zero on a log form,
  logLinear on a Cp, an ideal-gas Cp table; a Cp table without 298.15 K,
  `extend` in a record, a record table without a source.  degF converts
  correctly.
* Single choice: a pipe whose table misses 300 K refuses (rc 2) naming the
  table, with no fall-back to the record's law; table03's message is true;
  two variants differing only in interpolation get two identities.
* Density reader: liquidDensity01-04 byte-identical to 679eebd28; 05 and 06
  refuse identically; every unit of the old private table keeps its factor.
* Thread safety: TableViscosity's `call_once` flag is per instance; no
  cross-package or cross-case sharing; the excursion counter under a mutex.
* Docs: sec:record-law-table exists and its refusal text matches the
  engine; modelDocs maps `table`; the three PDFs carry the new text.

## Rows

S1
* **TG-01**: a table refusal becomes H = 0.  pipe01 with a crcWaterCp
  caloric pin and the feed at 380 K, 5 bar: exit 0, feed and downstream
  `"H": 0`.  The PropertyDomainError is caught at Flowsheet.cpp:4316
  ("enthalpy GAP (formation datum)") and the blend fallback swallows it at
  ThermoPackage.cpp:2047.
* **TG-02**: a sector's table pin reads the root case's file (readFile via
  `localRecord`, walking up from the cwd: ExperimentsFile.cpp:98,
  RecordResolver.H:96).  One-sector plant: a file only in the sector gives a
  false refusal; a same-named root file with doubled values gives exit 0
  with LINE.P1 at mu = 1.711 mPa s instead of 0.8557, the view naming no
  directory.  Measured.cpp uses the same resolver.

S2
* **TG-03**: table03 holds nothing (`.expect-nonconvergence`, skipped at
  bin/runTests:8397-8402); the Cp extension's integral and the extension's
  upper bound are held by no gate or golden; table01's extended point sits
  exactly on upTo.

S3
* **TG-04**: check_view_matches_calls compares a table with itself (both
  print `Law::tableText`; the fresh object is built by the same path,
  ResolvedView.cpp:209 vs ThermoPackage.cpp:3111; the probe temperature is
  the midpoint, a node for 11 even points); the two new arms edit text.
* **TG-05**: `generated/caseManifest.json` stale (none of the three
  cases); the real cause of the brain-facts mismatch.
* **TG-06**: the view never prints the molar mass a per-mass Cp is
  converted with (`tableText` built with MW = 0, RecordLaws.cpp:252).
* **TG-07**: the per-unit [liquid properties] line names no source for a
  table pin ("the case selects ()", quality "regressed / records' transport
  blocks"; LiquidPropertyDoor.cpp:181-189).
* **TG-08**: linear and monotoneCubic tables accept zero and negative
  values (a -797.7 point gives mu = 1.02e-4 Pa s at 298 K, exit 0).
* **TG-09**: check_variant_same_values has no table in play.
* **TG-10**: a sourceless record table, `extend` in a record and the table
  text dropped from the identity are refused in code but caught by no gate.

S4
* **TG-11**: no arithmetic arm for linear, logLinear or monotoneCubic;
  removing the Fritsch-Carlson limiter moves Cp(308 K) by about 2e-5, under
  the goldens' tolerance.
* **TG-12**: density columns now accept units by dimension alone (a mass
  fraction in `deg` or `points`, a density in `ppm`).
* **TG-13**: check_standards_write_guard probe (b) is environmental (the
  shell's CHOUPO_HOME points at the primary checkout); with CHOUPO_HOME set
  to the worktree the gate is OK; fix: set it to ROOT in the gate.
* **TG-14**: messages (a wrong-dimension upTo names no table; an absent
  component reported as a file mismatch; a record viscosity table's source
  checked only at first build, Cp at load).
* **TG-15**: the identity addition (ThermoPackage.cpp:3227-3247) is
  redundant within a case; its one shape is TG-02's.
* **TG-16**: the Theory Guide overstates what the view gate holds.

## Sabotage table

| # | Sabotage | Caught by | Missed by |
|---|---|---|---|
| S01 | logReciprocal evaluated as linear | corr (verify arm), golden | view, values, pins, prim, prov |
| S02 | extension upper bound ignored | none | all six and golden |
| S03 | extension dropped from the view text only | view (a witness string) | the other five, golden |
| S04 | per-mass conversion x10 everywhere | golden | all six |
| S05 | per-mass not converted in the object only | view (value), golden | the other five |
| S06 | Fritsch-Carlson limiter removed | none | all six and golden |
| S07 | Cp extension integral sign flipped | none | all six and golden |
| S08 | record table without a source accepted | none | all six and golden |
| S09 | `extend` accepted in a record | none | all six and golden |
| S10 | table text dropped from the identity | none | all six and golden |
| S11 | viscosity object forced to linear | golden | all six |
| S12 | degC offset 273.0 | view (span string), golden | the other five |
| S13 | case table labelled as a record law | view (home string) | the other five, golden |

## What could not be reached

A pin inside a sector's own `variants {}` and a sector dictionary through
`inherits`; the GUI and WASM; a data race under the Jacobian pool (none in
the slice; two unsynchronised lazy creations predate it).

(Written into the tree by the coordinator from the reviewer's hand-back:
the harness refuses report files written by a subagent.)

## Round 2 (2026-11-15): `c398/slice-c-tables` at 5834961cf

Verdict: both S1 rows closed (TG-01, TG-02); no row of this lens is still
S1 or S2.  12 of 16 fixed by measurement, TG-15 accepted, TG-03 and TG-05
partly fixed; new TG-17..20 (S3) and TG-21 (S4).  Ledger:
`review/c398c-tg01-r2` at 061f5c639.

* TG-01 fixed.  pipe01 at 380 K against the 273-373 K Cp table: exit 2,
  the table named, no result block.  A 0-40 C water Cp pin added to cases so
  the process leaves the table: heatExchanger01, column03_azeotrope_mesh,
  proxy01_gas_loop (recycle tear), designSpec01, still02 (batch): each
  refuses, exit 2; economics02_irr_sweep: every point `simulator FAILED`
  with the refusal, nan rows, exit 2 (the sweep's own contract); no result
  block emitted for any refused run.  No dynamic run driven into a refusal.
  All 105 `rethrowHardRefusal()` calls sit inside their catch blocks.  18
  kept sites and 7 "cannot receive one" sites sampled: every reason holds.
* TG-02 fixed: the one-sector decoy takes 0.8557 mPa s naming the sector's
  file, from any working directory; a sector through `inherits` with the
  pin at the root reads the root's file (where the pin is declared); a pin
  in a sector's own `variants {}` reads the sector's file.
* Round-2 sabotages: 11 of 13 caught (round 1: 6 of 13); S07 (the lower
  extension's integral sign) missed by every gate; S10 judged not
  observable.
* TG-03 partly fixed (upTo held, downTo not); TG-04/16 fixed
  (check_table_laws holds the arithmetic; the guide says so); TG-05 partly
  (case manifest OK, BRAIN facts stale, regenerated at integration); TG-06..14
  fixed by measurement; TG-15 accepted.
* **TG-17 (S3)**: a hand-written `experimentsDir "<path>";` in a pin is
  accepted (Database.cpp:856) and reads a table from outside the case (1.785e-3
  Pa s, exit 0); the CHOICE column hides the key.
* **TG-18 (S3)**: PricedDensity's keep drops a component on any refusal,
  including hard refusals of a real liquid (PureFluidLeaf below Tmin :118,
  Measured.cpp:346, SolutionLaw.cpp:258); it should keep only a dissolved
  gas above Tc (ThermoPackage.cpp:2633).  By reading.
* **TG-19 (S3)**: a unit's inline `thermo { }` pin inside a sector reads
  the root's file (1.711 mPa s on the decoy plant); printed, not silent.
* **TG-20 (S3)**: the downTo extension's Cp integral held by no gate (S07).
* **TG-21 (S4)**: check_table_laws' docstring says 1e-12, the code 5e-12.

Byte identity confirmed on esterification2sector, flash20_ethanol_water_pcsaft,
crystalliser09_KHT_KCl_series: identical in one directory, only the
`package <hash>` line differs across directories.

## Round 3 (2026-11-15): ed65dbb0f

The builder fixed TB-06, TG-03, TG-17..21 in one commit; each new gate arm
was shown failing on its own sabotage.  TG-18 is held by the source: no run
reaching the rethrow could be built (the route `select` calls throws only
the above-Tc refusal).  Accepted by the coordinator without a third
review round; landed after `--fast` 87/0 and `--gui` 49/0 on the merged
tree.
