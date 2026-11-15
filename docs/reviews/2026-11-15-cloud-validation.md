# Cloud validation of three paused branches, 2026-11-15

Asked by the coordinating session while the laptop was suspended; the
owner authorised the work in this session ("Fazer tudo como pedido":
validate, and fix on the branch what is mechanical).  Container: 4
cores, LaTeX present, no `rsync`, a disk allowance that ran out once
during the work (section 4).  Every suite below ran on a branch MERGED
WITH the main of 2026-11-15 (0cddb183cb); each merge was clean and was
pushed to its branch, so the head validated is the head on origin.
Commits carry author Vítor Geraldes, committer Claude (CLAUDE.md section
2), a Signed-off-by trailer, no co-author trailer.

## 1. Task 1: `c402/fragments-to-variants`

Head received: e39f661da0.  Merged with main: c01c39aca6 (pushed).
Fix commit on the branch: 56771d0cde (pushed).

| step | command | result |
|---|---|---|
| build | `make all -j4` | exit 0 |
| plan | `bin/integrate --plan origin/c402/fragments-to-variants` | 69 files, 59 case arguments, 117 standalone gates, `--gui` yes, `--fast` no; FULL SWEEP REACHED (a binary's main and shared headers), not launched |
| scope | `bin/runTests --scope <the plan's 59 arguments>` | **PASS 66 / FAIL 0** (58 cases: 57 against their goldens, `sugarPlantEconomicsSweep` smoke + NaN guard; 8 conservation gates scoped to the pass: mass_closure 51 steady cases within 0.5 %, campaign_closure 6 time-integrated cases, energy_closure, element_balance, closure_ledger_pinned 27 quantities in 7 cases, energy_boundary_pinned 172 quantities in 46 cases, golden-closure-static) |
| fast | `bin/runTests --fast` | **PASS 86 / FAIL 0 / EXPECTED-FAIL 5** (conservation: mass_closure 42 cases, campaign_closure 10, energy_closure, element_balance, closure_ledger_pinned 6 in 2, energy_boundary_pinned 116 in 31) |
| gui | `bin/runTests --gui` | PASS 46 / FAIL 4, none caused by the branch (below) |
| gates | `gate_manifest.py --only` the 10 gates the branch changed | first run REFUSED TO WRITE (check_no_unit_chemistry marks no claim); after the fix: 8 claims unchanged, check_no_unit_chemistry and check_record_law_pins updated |

The four `--gui` failures:
1. `gui-tests`: three lesson citations by `file:line` in `runLog.test.ts`
   (BubblePoint.cpp:334 and :383) and `equilibriumOrRateBased.test.ts`
   (DistillationColumn.cpp:5092).  **Fails on main too** (main's
   2788b59f9c moved the bubble-point lines beyond the tool's 40-line
   window).  Fixed on its own branch, see section 5.
2. `check_capability_index`: `envelope05_natural_gas_phiphi` named bare
   in docs/ai/capabilities.md.  **Fails on main too.**  Fixed on its own
   branch, section 5.
3. `check_gate_selftest`: "the pool could not be prepared ... No such file
   or directory: 'rsync'.  No arm ran."  This container has no rsync; an
   environment limit, not the branch.  NOT RUN here.
4. `check_plant_layout`: `[Errno 28] No space left on device` while it
   copied a case (the disk allowance ran out, section 4).  Re-run alone
   after space was freed: OK.

Re-check of item 1-2 on the branch: main's two fixes cherry-picked on a
LOCAL throwaway branch (`tmp/frag-gui-recheck`, never pushed):
`check_capability_index` OK, `check_plant_layout` OK; the full GUI test
run is reported in section 1a.

Fix on the branch (mechanical, a manifest claim): `gate_manifest --only`
refused to write because `check_no_unit_chemistry` passed and printed no
`<name>: OK` line (its last line read "unit-chemistry gate: ...").  Its
last line is now `no_unit_chemistry: OK -- ...`, stating what it
verified, whether its engine arm (check 4) ran or was SKIPPED for want of
a binary, and what it does not verify.  `bin/runTests` reads this gate's
FIRST line, so the suite's row is unchanged.

Open: nothing caused by the branch.  The full sweep its plan reaches was
not run (the owner's authorisation is needed).

### 1a. GUI tests on the branch with main's two fixes (local re-check)

`cd gui && npm test` on the branch with 151a007140 and 3032e772dc
cherry-picked locally (the throwaway branch was then deleted): **327 test
files passed of 327; 8291 tests passed, 1 skipped, 0 failed.**  So the
branch's GUI is green once main's own two defects are fixed; with them
unfixed it fails exactly as main does.

## 2. Task 2: `c402/membranes-no-legacy`

Head received: a524044de5.  Merged with main: 61724651d7 (pushed).
Commits added on the branch (all pushed): the two PDFs rebuilt; the
re-observed gate claims; the pressure-exchanger test's three stale
expectations.  Branch head after this task: see `git log` of the branch.

| step | command | result |
|---|---|---|
| build | `make all -j2` | exit 0 |
| plan | `bin/integrate --plan origin/c402/membranes-no-legacy` | 1468 cases (> 150: `DensityResolver.cpp` reaches every case with a liquid density, 1411), 131 gates, `--gui` yes, `--fast` yes.  **That is the sweep in all but name and needs the owner's authorisation: NOT run.** |
| scope | `bin/runTests --scope <47 cases>`: every case of a `spiralWoundModule`, `batchDiafilter`, `membraneShortlist` or `membraneSW` unit, every membrane props case, the cases the branch changed and the liquid-density cases | **PASS 51 / FAIL 0 / EXPECTED-FAIL 2** (liquidDensity05 and 06, deliberate refusals); conservation: mass_closure 33 steady cases, campaign_closure 5 time-integrated cases, energy_closure, element_balance, energy_boundary_pinned 25 quantities in 6 cases, golden-closure-static |
| fast | `bin/runTests --fast` | **PASS 86 / FAIL 0 / EXPECTED-FAIL 5** |
| tutorials guide | `gen_tutorials_guide.py --check` | OK, 675 entries current (no regeneration needed) |
| PDFs | `make -C docs -B theoryGuide.pdf tutorialsGuide.pdf` | built; `check_guide_pdf_fresh` OK on 8 guides; `check_guide_pdf_version` OK.  Committed on the branch |
| gates | `gate_manifest.py --only` the 15 gates the branch changed + check_property_source_witnesses + check_fit_then_simulate | 9 claims updated, 6 unchanged, committed; **check_spiral_array FAILS** (below); check_gate_selftest not runnable here (no rsync) |
| gui | `bin/runTests --gui` | PASS 45 / FAIL 4 (below) |

**The two questions asked.**
* `check_capability_index` fails on MAIN too: `envelope05_natural_gas_phiphi`
  named bare in docs/ai/capabilities.md (main's 2788b59f9c).  Fixed on its
  own branch (section 5).
* `check_fit_then_simulate`: **passes** on the branch, with and without the
  branch's build first on PATH (this container has no other Choupo build
  on PATH).  `bin/runCase` takes the binary from PATH first
  (`command -v $APP`, `bin/runCase` near line 326) and only then the tree's
  own, so on a machine whose PATH carries another tree's `choupoProps`
  (a sourced `etc/bashrc` of the main checkout) the gate runs the wrong
  engine.  Remedy for the laptop: run gates with the branch's root and
  `bin/` first on PATH, or make `runCase` prefer its own tree (a code
  change, not made here).

**Failures caused by the branch, NOT fixed (not mechanical):**
1. **`check_spiral_array` arm (h).**  The new operation-key allow-list
   (`src/unitOperations/UnitTypedProperties.H:119`, MB-06) refuses
   `moduleDiameter` with the generic "is not a key a membrane module reads"
   BEFORE the retired-key refusal (`SpiralWoundModule.cpp:208-215`) that
   names the `Generic-2540 | 4040 | 8040 | 16040` records.  The student
   loses the remedy.  Fix: run the retired-key check before the
   allow-list, or let the allow-list hand the retired words to it.
2. **`check_source_licence`: "NEW encumbered source:
   data/standards/parameters/solution/NaCl-water.dat:60  CRC Handbook
   cited AS the authority (not 'via')".**  The record's out-of-sample
   check reads the CRC Handbook (82nd ed., p. 8-77 for NaCl at 20 degC;
   p. 14-12 for seawater at S = 35).  The CRC is a no-grant compilation
   (CLAUDE.md section 10): its numbers do not enter the public tree, even
   cited; a primary read THROUGH it is fine.  NOT gated but the same
   class: MB-03's seawater viscosity 0.966 mPa s is entered as DATA from
   "the CRC Handbook's table (p. 14-12)" in
   `tutorials/plant/swro01_campoDalias/constant/experiments/seawater35_*_liquidViscosity.dat`
   and `tutorials/steady/membranes/membrane04_spacer_schock_miquel/constant/experiments/seawater35_NaCl_liquidViscosity.dat`.
   Remedy: the primary source the CRC tables cite, read and cited
   ("..., via CRC"), or another published dataset.  Needs a source read at
   a page, so left.

**`--gui` failures.**  `gui-tests` (6 failed in 3 files),
`check_capability_index`, `check_gate_selftest` (no rsync),
`check_source_licence` (item 2).  With main's two fixes cherry-picked
locally (throwaway branch, deleted): 3 tests failed, all in
`pressureExchangerSchematic.test.ts`: the slice re-tuned membrane27 and
transcribed its new sheet into the fixture but left three assertions on
the old values.  **Fixed on the branch** (a stale expectation the slice
explains): `pxHPout 53.37 -> 53.36 bar`, `recovers 51.37 -> 51.36 bar`,
`HP side loses 0.7600 -> 0.76 bar` (the drawing's formatter drops
trailing zeros; read by rendering the fixture with the branch's own
code).  The file passes 7/7; `check_pressure_exchanger` (which holds the
fixture to the witness's sheet) OK.  The full GUI suite was NOT re-run
after this fix.

**Not done, against the paused commit's own list:** MB-05 (pinned debt,
as asked); the reviewer's sabotages re-run; the 20-case byte identity
against a baseline build; the search for OTHER membrane case headers
gone stale (the paused commit says they are not detected
automatically); the full sweep.  Done from that list: the PDFs, the
tutorials guide check, check_property_source_witnesses re-checked (its
claim updated), swro01 and membrane27 against their goldens after the
header-only edits (both PASS in the scope run), --fast, --gui.

## 3. Task 3: `gui/c404-total-reflux-loop`

Head received: cc391ac9bb.  Merged with main (clean) and pushed.  No fix
was needed on the branch.

| step | command | result |
|---|---|---|
| build | `make all -j2` (gate zero needs a native build) | exit 0 |
| gui | `bin/runTests --gui` | PASS 46 / FAIL 3: `gui-tests` (3 tests in 2 files), `check_capability_index`, `check_gate_selftest` |

None is caused by the slice: the 3 GUI tests are main's stale lesson
citations (`runLog.test.ts`, `equilibriumOrRateBased.test.ts`), the
index is main's bare case name, the self-test needs rsync.  With main's
citation fix cherry-picked locally (throwaway branch, deleted):
`runLog.test.ts`, `equilibriumOrRateBased.test.ts` and the slice's own
`totalRefluxLoop.test.ts` pass, **170 of 170**.  Of the whole GUI suite
on the branch: 326 of 328 files and 8297 of 8301 tests passed before that
fix (3 failed, 1 skipped).

Not done: seeing the drawing in a browser; the DEV.md status row (not
touched, as asked).

## 4. The environment, and what it cost

* No `rsync` in this container, so `check_gate_selftest` could not run on
  any branch.  Worse, each attempt first cloned its four workers into
  `~/.cache/choupo/gate-selftest/<tree hash>/w0..w3` (about 2 GB per tree)
  and only then failed, leaving the pool behind.  Two GUI runs at once
  exhausted the session's disk allowance: one `check_plant_layout` run
  died on `[Errno 28] No space left on device`, and one `--gui` was
  stopped and re-run alone.  Suggestion for the gate (not made): check
  for rsync BEFORE cloning the workers.
* Every suite here ran with the branch's own root and `bin/` first on
  PATH and `CHOUPO_HOME` set to the branch (see task 2 on `runCase`).

## 5. Fixes to main's own defects, each on its own branch off main

| branch | commit | what | evidence |
|---|---|---|---|
| `cloud/fix-capability-index-envelope05` | 151a007140 | `envelope05_natural_gas_phiphi` named by its full `tutorials/props/molecular/...` path in docs/ai/capabilities.md | `check_capability_index` OK (204 names, 100 paths); `check_doc_references` OK |
| `cloud/fix-lesson-citations-bubblepoint` | 3032e772dc | three lesson citations re-pointed with `repoint_lesson_citations --window 80`: BubblePoint.cpp:334 -> 393 and :383 -> 447 (runLog.ts), DistillationColumn.cpp:5092 -> 5103 (equilibriumOrRateBased lesson and test) | `--check` reads 515 citations current; the GUI suites of tasks 1 and 3 green with it |
| `cloud/fix-guide-environments-mathtools` | 79ab253f0f | `check_guide_environments` knows `psmallmatrix` (mathtools, loaded by theoryGuide.tex); claim re-observed | the gate failed on main saying theoryGuide dies at 15770-15772; `make -B theoryGuide.pdf` built it (task 2) |

All three are reached by every branch merged with today's main, so they
should land before (or with) the three branches above.

## 6. What waits on the laptop

1. Task 2, `check_spiral_array` (h): the allow-list hides the retired-key
   remedy (engine code).
2. Task 2, the CRC citations: NaCl-water.dat:60 (gated) and the seawater
   viscosity datasets (same class, not gated) -- a source read.
3. The full sweeps the plans of tasks 1 and 2 reach: the owner's
   authorisation.
4. `check_gate_selftest` on all three branches, on a machine with rsync.
5. The full GUI suite of task 2 after its last test fix (only the fixed
   file and its gate were re-run).
