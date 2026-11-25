<!-- Copyright (C) 2026 Vítor Geraldes -->
<!-- SPDX-License-Identifier: GPL-3.0-or-later -->

# The reference plant's converter tab, its six unrouted pipes and its 162 advisories (2026-11-24)

Follow-up to `docs/audits/2026-11-24-demo-browser-pass.md`, items 6 and 7.  Case: `tutorials/plant/greenAmmoniaPEQ_baseCase`, untouched.  Engine facts were read from a native run of the tree's `choupoSolve` (the binary copied from the shared build; it prints 164 advisories where the published WASM, commit afd3f8ff9, prints 162; the two-advisory gap is not examined).  Browser facts: Playwright headless Chromium 1440x900, the GUI of this branch built with `vite build` on the WASM downloaded from `https://www.choupo.org/wasm/`, screenshots in `/tmp/claude-0/gen-conv/` (not in the repository).  Nothing under `src/` or the case was changed.

## 1. The converter tab

**Verdict: the engine does not publish convergence or an energy balance for a sector, and the GUI also threw away the plant's verdict when it sliced the result for the drilled tab.  Fixed in `gui/`; nothing missing in `src/` that a sector could use.**

What the engine publishes, per run and not per sector:

- `converged`, one boolean: `src/result/ResultEmitter.cpp:127`.
- `recycleLoops`, one entry per declared tear, units and streams under qualified names: `ResultEmitter.cpp:634-653`.  On the reference plant both loops (tears `PreheatedFeed` and `Recycle`) list `CONVERTER.Bed1`, `CONVERTER.InterbedCooler1`, `CONVERTER.Bed2`, `CONVERTER.InterbedCooler2` and `CONVERTER.Bed3` among their units.  The converter has no recycle loop of its own: the plant's loops pass through it.
- `globalEnergyBoundary`, one object for the plant boundary: `ResultEmitter.cpp:1284-1310`.  For the converter the result carries only `unitSectors` (the five member units map to `CONVERTER`) and per-bed `closuresByConstruction` rows (each bed's `Q = H(out) - H(in)`).  No sector-level first law exists in the JSON, and `converged/` and `reports/` hold none either.

What the GUI did: `sliceRunResult` (`gui/src/case/resultSlice.ts`, the `const out: RunResult` block, was line 297) builds the drilled tab's seeded result and copied neither `converged` nor `globalEnergyBoundary`.  `runSummary` (`gui/src/case/runSummary.ts:93`, `:133`) and `RunSummaryStrip.tsx` (was `:145`, `:158`) then printed "not published".  The mass closure was fine: it is computed from the sector's own streams by the existing `massBalance`.

The fix (commit "GUI: a drilled-in sector's strip says whose verdict it shows"):

- the slice carries the parent's `converged` and marks the result `inheritedFrom: <sector>` (new optional field, `gui/src/adapters/SolverAdapter.ts`);
- the strip reads `yes (plant run)` (or `no (plant run)`) with a tooltip saying the engine tests convergence once per run and the plant's loops pass through the sector, and the energy item reads "closed on the plant boundary, not per sector" with a tooltip saying why;
- the status sentence reads "Sector CONVERTER: numbers from the plant run (the plant run converged); 22 advisories.";
- a real re-run of the sector has no marker and keeps the plain words.
- tests: `gui/tests/resultSlice.test.ts` (verdict carried, marked, never invented) and `gui/tests/resultsFirst.test.ts` (the sentence, the failed and absent cases).

Browser, before (`before-converter.png`): "Run complete: convergence not published; 22 advisories. CONVERGED not published ... ENERGY not published".  After (`after-converter.png`): "Sector CONVERTER: numbers from the plant run (the plant run converged); 22 advisories. CONVERGED yes (plant run) MASS 99.9991 % ENERGY closed on the plant boundary, not per sector".  Not yet verified: the energy word is deliberately not a number; whether a colleague wants the plant's 1.76 kW residual repeated there is a judgement left to Vítor.

## 2. The six unrouted pipes (report only)

The six are, from `layout.notRouted` in the result: `PreheatedFeed` (FEHE to `CONVERTER.Bed1`), `CONVERTER.Bed1Out`, `CONVERTER.Bed2Feed`, `CONVERTER.Bed2Out`, `CONVERTER.Bed3Feed`, `CONVERTER.HotEffluent` (Bed3 to FEHE).  Every one touches a unit inside the converter sector.

**Why.**  The converter is one placed item, `CONVERTER/shell` (`tutorials/plant/greenAmmoniaPEQ_baseCase/system/layoutDict:218`), which the sizer registers under the unit name `CONVERTER` (the sector), as "ONE pressure shell around the 5 items of sector CONVERTER" (run log, sizing table; `src/postProcessing/sizing/ConverterShellSize.cpp:439`).  The router finds a unit's items by the unit name of the sizing: `placedOf[s->second.unitName]` (`src/postProcessing/layout/PlantLayout.cpp:815`), and each pipe end is looked up by the flattened unit name of the stream's producer or consumer (`endOf`, `PlantLayout.cpp:1560-1690`).  The streams run between `CONVERTER.Bed1`, `CONVERTER.InterbedCooler1`, ... so the lookup misses, and the reason the engine prints is "unit `CONVERTER.Bed1` is sized (CONVERTER.Bed1/catalystCharge, CONVERTER.Bed1/shell) but none of its items is placed on the plot plan" (`PlantLayout.cpp:1690-1693`; the two inter-bed coolers are also sized and have no layout item, hence "2 sized items are not placed").  The bed shells and charges are classed `internal` (`isInternal`, `PlantLayout.cpp:4848-4862`: "a basket inside the converter shell"), which stops them being reported as unplaced but does not tell the router that a stream ending in a bed ends at the converter shell.

**Indoor by rule?**  No.  The indoor rule (C100) marks a pipe whose end sits in a room (`PlantLayout.cpp:1808-1861`); none of these has an end in a room.  **A router failure?**  Yes, in the narrow sense: the router has no mapping from an enclosed member unit to its host shell's unit, so a pipe that a plot plan should draw (the loop's hot line) is not drawn.  The engine says so honestly and marks the one end it reached (`PreheatedFeed` and `CONVERTER.HotEffluent` carry an anchor at the FEHE; the other four have none, which is why the 3D view names them in a legend "NOT routed and not marked", `gui/src/case/plantLayout.ts:1197`).

**Why the plan says 0 findings.**  `layout.summary.findings` counts rule findings (separation, zone, clash, exposure; `addFinding` calls in `PlantLayout.cpp`), and a stream left unrouted is not one: it is listed in `notRouted` with its reason and counted separately (`summary.notRouted 6`, `PlantLayout.cpp:5506`).  Only a utility line left unrouted is a finding (`utilityNotRouted`, `:5816`).  The GUI facts block already prints both numbers side by side ("Not routed 6", "Layout findings 0", `gui/src/case/layoutFacts.ts:191-193`), so the page is internally consistent but reads as a contradiction.  Whether an unrouted process pipe should be counted as a finding is a design decision for the layout owner; the case-side workaround is a per-stream `pipes` override, but `PlantLayout.cpp:1795-1800` refuses an override whose ends the layout cannot reach, so it does not work here.  The real fix is in `src/` (map an `encloses` member unit to its host shell's unit in `placedOf`, and place or declare the two inter-bed coolers); not attempted.

## 3. The 162 advisories (report only)

Native counts by category and severity (164 total, this binary):

| kind (category, severity) | count | kind | count |
|---|---|---|---|
| model, warning | 38 | assumed, warning | 9 |
| validity, warning | 36 | validity, info | 6 |
| rating, warning | 22 | layout, info | 5 |
| design, warning | 14 | thermo, info | 4 |
| density, info | 12 | thermo, warning | 2 |
| model, info | 10 | design, info | 2 |
| costing, warning | 2 | costing, info / economics, warning | 1 + 1 |

That is 15 kinds, 125 at warning level.  Of the 38 "model, warning", 34 are `[window]` notices of the converter's rate law (`ratioH2N2` outside 2.99 to 3.01, and `P` below its window; `src/thermo/reaction/ExpressionRate.cpp:644`); the window is declared at `constant/reactions:176`.

**Folded in the GUI: yes.**  In the browser run the Streams tab holds one `<details data-advisory-fold>` element, closed, because 15 kinds exceed the 3 kinds that open (`gui/src/ui/StreamsSummary.tsx:499-501`, `gui/src/case/advisoryGroups.ts` `advisorySummary`).  The strip's "ADVISORIES 162" is a count only.

**Why 162 against 107.**  The 107 is the C266 walk's count on 2026-11-23 (`docs/reviews/2026-11-23-c266-student-walk/README.md:29`, 8 of them at warning level).  `git log -S` cannot attribute it: the history is squashed (791 commits, and every `-S` search returns the same three integration commits).  Instead the CURRENT engine was run on the case as it stood before commit 252e150475 (C440, C302, 2026-11-23 01:40, "the reference plant's converter is the kinetically sized one"), extracted with `git archive` into a scratch directory.  Result: 105 advisories, converged.  So the engine moved the count by about 2 (105 against 107) and the case change added about 59, almost all from the converter becoming three kinetic beds with two inter-bed coolers.  Deltas by kind, old case to current case: model warning 0 to 38 (+38, the rate-law windows), assumed warning 1 to 9 (+8, the converter shell's undeclared corrosion allowance and joint efficiency, plus the bed shells), validity warning 30 to 36 (+6), design warning 10 to 14 (+4), rating warning 19 to 22 (+3), layout info +1, model info +1, validity info -2.  By locus, 44 of the 164 name the CONVERTER sector or its rate law.  The demonstration script's "107" (`docs/demo/demonstration-path-december.md:109`) is stale; the figure to expect now is about 160.  The wording "decide whether the header folds them" is answered: the Streams band folds them already; the strip does not list them.

Caveats: the old-case run uses the current binary, so it separates the case change from the engine change only to within the 2 advisories noted; the 162 against 164 gap (WASM against native) is not examined.
