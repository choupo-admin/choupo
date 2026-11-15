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
