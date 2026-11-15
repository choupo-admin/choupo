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

**Not done:** MB-05 (pinned debt, as asked); the reviewer's sabotages;
the 20-case byte identity against a baseline build; the full sweep.
