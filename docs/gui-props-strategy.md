# Props mode — philosophy & strategy

> **Status: EXECUTING — P0–P4a shipped 2026-07-01/02** (systematic review after a night of one-off UX
> fires; three audit passes — full case sweep, philosophy-vs-credo, architecture
> seam). Extends `docs/ai/gui-credo.md` for the props workspace; changes here go
> through the credo's questions like any GUI change.

## The philosophy (what props mode IS)

**choupoProps is the property bench.** It answers one question — *can I trust
these thermophysical properties before a simulation uses them?* — through four
jobs: **CREATE** (estimate a missing compound), **SEE** (how does the model
behave), **TEST** (does it match measured data), **FIT** (regress parameters).
The loop is CREATE → SEE → TEST → FIT → PROMOTE → USE.

**CREATE without ceremony (2026-07-02):** the molecular structure is IDENTITY —
components carry `jobackGroups { CH3 2; ... }` in their own `.dat` (sibling of
the UNIFAC `groups{}` block), and `bin/estimate <name>` is the one-command
curation act (glass-box table + ONE stable `<name>.estimated.dat` proposal).
The `estimateComponent` op keeps inline `groups (...)` for the pedagogical
form; backfilling `jobackGroups` across the catalogue is student curation work.

A props case is a **question asked of the thermodynamics**, and a run produces
an **answer per operation** — a number, a verdict, a fitted parameter — before
it produces any plot. The credo's five-second rule applies to the run: within
five seconds of a run finishing the user knows what each op concluded and where
its evidence is.

Therefore:
1. **The surface mirrors the `propsDict`, not the output files.** One panel per
   declared operation, in the author's order, under the author's names. The
   dict is the source of truth; shape-guessing from CSVs is only a rendering
   fallback inside a panel, never a taxonomy.
2. **The answer lands first.** Pre-run the landing is thermo READINESS ("can I
   run?"); post-run it is the RESULTS epilogue ("what did I learn?") — the GUI
   twin of the terminal epilogue, one row per op: name · headline diagnostics ·
   verdict · link to evidence. Same numbers, same source (the machine block).
3. **Silence is never a valid render.** Every declared op gets a panel: no
   plottable output → its diagnostics table; a failure → a failure card in
   place (status + last log lines), never only "see the Log".
4. **The engine declares, the GUI renders.** Ops already emit structured
   `diagnostics()`; they gain a `headline()` so each op names its own answer.
   The GUI never scrapes logs or re-derives what the C++ computed.

## What the review found (evidence, 2026-07-01)

- **The contract gap:** 22 registered op types; the GUI reads the type for 4;
  the rest are guessed from CSV shape by 9 detectors. Audit of the 40 live
  props cases: **16 OK · 12 WRONG-PANEL · 3 MISSING · 9 RISKY**. Ops' answers
  (`AAD_total_pct`, `SI_*`, `pH`, `hardness_removal_pct`, steam verification
  pins…) are computed, transported to the GUI, and dropped — Log-only.
- **Five systemic causes** explain ~all 24 non-OK cases: (a) one shared y-axis
  for mixed-dimension CSVs; (b) no generic diagnostics surface; (c)
  detectGrid2D false-positives (the eNRTL validation renders as a NaN-holed
  heatmap); (d) EstimatePanel hardcodes Joback (Yang/van Krevelen/petroleum
  outputs invisible); (e) no cross-op aggregation + the `pointOnly` gate drops
  point tables from mixed cases.
- **The architecture seam is broken at the front door:** all **17
  propertyPackage tutorials are invisible** in the GUI browser (the flagship
  crystalliser09_dignified, the whole antisolvent series, thermoTest, the
  package demos) — `filesToCaseFiles` hard-requires `constant/thermoPackage`;
  File→Open refuses the same cases. The electrochem category is likewise
  filtered out. ThermoView shows a confident "ideal" badge for speciation
  cases (per-op pitzerHMW) and for package cases, and its ΔGf gap-advice
  contradicts the ion-derived salt doctrine. (WASM data bundle and vocabulary:
  verified clean.)

## The plan (phased; each phase independently shippable, gate = GUI battery + goldens)

- **P0 — unbreak the front door** (hours). `filesToCaseFiles` accepts
  `constant/propertyPackage` XOR `constant/thermoPackage` (the engine's own
  rule) — unblocks catalogue, folder-open, zip, bridge in one place; add the
  electrochem category; WasmAdapter writes thermoPackage only when present.
- **P1 — the Results epilogue** (half day). Generic per-op results panel from
  `operationResults` (name/type/diagnostics/verdict), post-run landing,
  failure cards in place. Kills the "e agora?" class; surfaces the answers of
  10+ cases at once. Delete the one-shot jump patch.
- **P2 — the worst renders** (a day). Per-column dimension check in the scan
  plot (split mixed-dimension CSVs into small multiples); fix detectGrid2D
  false-positive; de-hardcode EstimatePanel (rows from the diagnostics the op
  actually emitted); fix the `pointOnly` gate (mixed cases keep their table).
- **P3 — truthful thermo panel** (half day). ThermoView: per-op activity
  models ("pitzerHMW (speciate ops)"), package-case awareness (show the
  selected package + its records), ΔGf "ion-derived" for `dissociatesTo`
  components instead of a red gap.
- **P4 — the full op contract.** **P4a SHIPPED:** one pill per propsDict op in
  the author's order under the author's names; typed renderers
  (consistency/estimate/fit/points) keyed on op TYPE; `OpGenericPanel` as the
  fallback (diagnostics band + the op's CSV, or an honest note) — no op can be
  born invisible; the shape-group taxonomy (Consistency/Estimate/Fit/Points/
  Scan) retired to one "Operations" group; unclaimed CSVs keep a defensive
  tail pill. **P4b residual (small, engine-side):** `headline()` in
  `PropertyOperation` so ops rank their own answer keys in the Results
  epilogue (today it honestly shows ALL diagnostics), and retiring
  `parsePropertyPointLog` by emitting the point values through the machine
  block (the table's units/reference formatting must move with it).

## What NOT to change (the parts that already honour the credo)

The consolidation bar + Simulate hand-off; the Decision Ledger; the
evidence-not-badges AAD tables; the estimate promotion gates (UNVALIDATED
badge, exact-bytes preview, off-GUI promote); the ConsistencyPanel; lab-data
overlays default-on; the no-mock refusal; the sector fan-out.
