<!--
  Choupo — Pro Property Explorer: vetted design (DEV reference).
  Forum-designed + adversarially vetted 2026-06-06 (7 agents). Both vets: sound,
  holds the reuse contract (zero physics in TS), stays a visualiser scratchpad.
  Gated by docs/property-architecture.md (the property-model contract) + the GUI
  credo §3 (the Property Explorer as a visualiser scratchpad).
-->

# Pro Property Explorer — vetted design

> **SHIPPED 2026-06-06 (status update).** Fase-A landed: the pure-vs-mixture
> mode split (per-component properties no longer imply an equimolar mixture),
> compound-identity de-duplication, empty-state onboarding, context-aware
> controls, dark-mode contrast, and `Cp_liquid_<comp>`.  **Ternary shipped via
> REUSE, not the GibbsPhaseSplit EXTRACTION below**: `propertyScanTernary` calls
> the existing `IsothermalFlash::solveCore` per simplex node (Michelsen-TPD +
> Gibbs-min), so flash and ternary cannot disagree WITHOUT the riskier refactor —
> the extraction is now optional future cleanup, not a blocker.  `TernaryPlot`
> renders the phase map (barycentric projection on a Plotly `scatter`, since
> `scatterternary` is absent from plotly-basic-dist).  The Explorer's ternary
> BUTTON stays gated: no catalogue triple yet has the 3 NRTL pairs an LL gap
> needs, and the synthesizer isn't wired to emit a `phases`-block VLLE package —
> both gated on the pairs-catalogue data decision (MORNING.md M2).  Validation is
> flash-agreement-only for v1.  See `docs/ai/unit-ops.md` for the case-author entry.

**Goal.** Turn the crude Fase-1 control row into the tool that most attracts
students: browse the standard catalogue, build a set of 1/2/3/N components, and
SEE the classic thermo plots — pure-component curves, binary T-x-y/x-y, ternary
diagrams, isolines/contours. Ambitious AND honest: every curve is a `choupoProps`
WASM run (zero physics in TS); ternary ships only after its real engine op.

## The three-zone layout (one workspace, no modal/route)
1. **Left rail (~240px) — Compound Browser.** Search (name/formula) + role-filter
   chips + scrollable list + a removable-chip selected-set tray. Lives only in
   this workspace (vanishes on Esc) — not the permanent left panel the credo killed.
2. **Top strip — plot-type SegmentedControl**, driven by a `PLOT_TYPES` table
   (`{id,label,why,minComp,maxComp,axisKind,engineReady}`). An option is
   **disabled-with-reason** (Tooltip `why`) when `selected.length` is outside
   `[minComp,maxComp]` OR not engine-ready ("Ternary needs the simplex op — Phase B";
   "no vaporPressure for <comp> — cannot appear in T-x-y"). **This gating IS the
   "see, then decide" pedagogy.**
3. **Canvas — the existing `CsvAutoPlot`** (auto-dispatches scan / T-x-y / grid;
   Phase B adds `TernaryPlot`) + legend.
**The "pro" inversion:** the chosen plot-type drives the secondary controls
(state sweep → from/to/fixed-P; composition sweep → hide from/to; grid → 2nd axis).

## Compound browser — the catalogue manifest (the data-plumbing answer)
A build-time manifest in a new `gui/src/case/catalogue.ts` via
`import.meta.glob(['../../../data/standards/components/*.dat'],{query:'?raw',eager:true})`
— the SAME pattern `gui/src/cases/tutorials.ts` already proves. Each raw `.dat` is
run through the existing `gui/src/dict` parse→toJson (zero new dep) to harvest
`name`, `formula`, role flags (`hasVaporPressure`, `hasTc`, `nonvolatile`). Role →
**VLE-able vs not** (vetting: simplify the taxonomy to what the data supports +
what gating needs; `nonvolatile true` wins; else vaporPressure+Tc → volatile).
Case-local components fold in via `mergeCatalogue()` (overlay `caseFiles.rawFiles`
`constant/components/*.dat`, badge `origin:local`, ship raw body via
`exploreSynth.componentFiles`). Standard ship by NAME (engine resolves the frozen
catalogue); local ship raw bodies.

## Plot taxonomy (each mapped to its engine path)
| Set | Plots | Engine path |
|---|---|---|
| **1 comp** | Psat(T) · Z(T) iso-P family · v_molar(T) · H_real/S_real(T) · Cp_ig(T) · μ/k liquid(T) | **EXISTS**: `propertyScan1D` over T; all keywords confirmed in `PropertyEvaluator.cpp` |
| 1 comp (gap) | liquid Cp(T) · ρ/Vliq(T) | NEW keywords `Cp_liquid_<c>`, `Vliq_<c>`/`rho_liquid_<c>` (data in the .dat, no evaluator branch) |
| **2 binary** | T-x-y · x-y (McCabe-Thiele) · T-x/T-y · γ(x) | **EXISTS**: `propertyScan1D` vary `x[c1]` 0→1, props `(T_bubble y_eq_c1)` (the compare_vle pattern) → `TxyPlot` |
| 2 binary (gap) | P-x-y · gE(x) | NEW keywords `P_bubble`+isothermal `y_eq@T`; `g_excess` (= RT Σ x ln γ, kept engine-computed) |
| **N (any)** | iso-property contour/isolines/heatmap over a 2-D grid | **EXISTS**: `propertyScan2D` (the `z_co2_grid` pattern); only TS add = a contour-mode toggle in CsvAutoPlot. (x,T)/(x,P) grids are BINARY-only; (T,P) grids any set |
| **3 ternary** | VLLE/LLE regions + tie-lines · on-triangle iso-property · residue curves | **NEW op (Phase B blocker)**: `propertyScanTernary` |

## Engine ops to add (the forcing function — all land in `src/propertyOps`, never TS)
- **`propertyScanTernary`** — walk the (x1,x2,x3) simplex at fixed T,P; per node run
  the EXISTING `IsothermalFlash` Gibbs-min to classify region + tie-lines; long-form CSV.
- **REFACTOR PREREQUISITE (riskiest):** extract the Gibbs-min LL/VLLE simplex core
  (`pushDerivedStart`/`vlleObjective`/LL branch) out of `IsothermalFlash::solve` into a
  reusable `solver::GibbsPhaseSplit`, called by BOTH the flash and the ternary op — so a
  diagram cannot disagree with a flash. All flash tutorials must stay green.
- `P_bubble` + isothermal `y_eq@T` (binary P-x-y); `T_dew` (PropertyScan1D.H advertises it
  but evaluateProperty lacks it — fix the doc/code mismatch); `Cp_liquid`/`Vliq`/`rho_liquid`;
  `g_excess`.
- OPTIONAL: `choupoProps --list-components` JSON, to validate the GUI manifest against the
  engine's own catalogue view (guards .dat-schema drift).

## Phasing (Pareto — existing-engine wins first; ternary never faked in TS)
- **A0** (biggest "feels pro" jump, pure GUI, zero engine): the CompoundBrowser +
  PLOT_TYPES set-size gating, replacing the comma-sep TextInput. Kills the typo-fail class.
- **A1**: wire the EXISTING-engine templates — 1-comp curves, binary VLE quartet
  (T-x-y/x-y/T-x/T-y/γ) via `propertyScan1D`-over-x with NRTL/Wilson pairs resolved
  **by-name from `data/standards/parameters/<MODEL>/`** (the engine already does this — vetting
  corrected the spec; UNIFAC DESCOPED from A1 until per-component group data is curated),
  + N-comp 2-D contour via `propertyScan2D`. ~80% of the vision on TODAY's engine.
- **A2** (small keywords, no refactor): `T_dew`, `Cp_liquid`/`Vliq`/`rho_liquid`,
  `P_bubble`+`y_eq@T`, `g_excess` — each a localized evaluator branch + WASM rebuild.
- **B** (ternary, gated disabled-with-reason until it lands): the IsothermalFlash
  Gibbs-min EXTRACTION refactor (flash tutorials green) → `propertyScanTernary` →
  `TernaryPlot.tsx` (Plotly scatterternary, draws engine-labelled CSV) → residue-ODE op.

## Reuse contract (held — both vets confirmed)
Only explorer-specific code: `exploreSynth.ts` (builds a dict) + the browser (parses .dat
purely to render names/badges; outputs NAMES) + plot-template recipes (pick axis/properties/
thermo{}). Every number = a choupoProps WASM run via the unchanged
`synthesizeExploreCase → resolveAdapter('wasm','choupoProps')`. Plot kit reused; only NEW
TS renderers = a contour-mode toggle (A1) + TernaryPlot (B), both pure Plotly drawers of
engine-labelled CSV. Ternary REUSES the extracted flash core (not duplicated). 5 guard-rails
intact (ephemeral, hands-off via "Author this →", on-demand workspace, zero TS physics,
provenance-first with a reserved validity-shading slot).

## Validation plan
Each new op/keyword follows the 5-step graft recipe: a `props/compare` AAD case vs cited
data (P_bubble/T_dew/binary VLE; Cp_liquid/Vliq vs the .dat range + a literature point;
g_excess cross-checked); `propertyScanTernary` validated against the EXISTING flash
tutorials (`vlle03_audit_artificial`, `extraction01_waterButanol` — same extracted core,
labels+tie-lines must match — pins the refactor); `bin/runTests` green; the e2e node-WASM
check (assert CSV columns CsvAutoPlot expects) before the browser.

## Vetting corrections folded in
- **Model picker strictly presence-gated** (offered only when the engine can resolve the
  data; never a free input) — keeps it a scratchpad, not a wizard. (HIGH)
- **Role taxonomy** simplified to VLE-able vs not-VLE-able (the data supports that, not a
  fragment/pseudo zoo). (MEDIUM)
- **NRTL/Wilson pairs resolve by-name from `data/standards/parameters/<MODEL>/`** (engine already
  does this — the spec undersold it). (MEDIUM)
- **(x,T)/(x,P) contour is binary-only**; (T,P) any set. (MEDIUM)
- **UNIFAC descoped from A1** (needs per-component group data; would edge toward
  structure-first identity, which the architecture rejects). (MEDIUM)

## Open forks (Vítor's calls)
1. NRTL pair catalogue: which pairs ship (cited, license-clean) in `data/standards/parameters/<MODEL>/`?
2. UNIFAC group data: curate per-component groups, or defer UNIFAC?
3. Ternary reference data: which measured LLE/VLLE system + citation (or flash-agreement-only for v1)?
4. Ternary scope for first ship: regions+tie-lines only, or +residue curves +on-triangle contours?
5. Role-taxonomy ratification (CO2 = solute but has Tc+vaporPressure → keep VLE-able).
6. Build `choupoProps --list-components` to harden the manifest, or is the glob enough for now?
