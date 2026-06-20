<!--
  Design record — the What-if as a KPI instrument.
  Forum-ratified 2026-06-20 (9 agents, 4 design lenses + adversarial critique).
  Status: Slice 1 (GUI, 1-knob KPI curve) in build on branch feat/variable-knobs.
  CC BY-SA 4.0 (docs); code excerpts GPL-3.0-or-later.
-->

# The What-if as a KPI instrument — design verdict

Confirmed: flash01 feed is **40/60** benzene/toluene; column01 feed is **50/50** with D=50 kmol/h (D/F=0.5). Neither dict has a `variables{}` block. The critiques that flagged the fabricated 0.96 column baseline and the missing knob blocks were right. This decides the verdict.

---

# THE WHAT-IF VERDICT — a KPI instrument: watch one number, turn ≤2 knobs, see the response

## 1. THE VERDICT

The What-if becomes a **KPI instrument**: one sentence — **"Watch `[KPI]` as I turn `[knob]` ( + `[knob]`)"** — with the watched KPI's live current number as the hero, a curve (1 knob) or a contour (2 knobs) as the body, and a "you are here" dot tying the number to the picture. The mental model is the one every chem-eng forms reflexively: *"how does THIS number move when I turn THAT?"* — objective first, lever second, the order the professor thinks in. It is natural because (a) the **KPI list is the unit's own emit-set** (`result.kpis`), a short authored shortlist of physical names, never an Aspen property-tree; (b) the **knob is just a dict scalar swept**, with the slider value visibly flowing into the dict path the solver reads — no hidden coupling; (c) the **≤2 cap is a visualisation law, not a UI preference** (1→line, 2→surface, 3→unviewable, exactly Vítor's framing), enforced structurally; and (d) the curve **renders the moment a knob is chosen**, so the student SEES the whole response before deciding anything. Three corrections the critiques forced and I adopt: knobs turn the **literal operation scalar directly** (no mandatory `variables{}` authoring tax — `flash06` already sweeps a raw `operation.T`), so the instrument works the instant you open it on the shipped cases; **no auto-selected "recommended" KPI/knob** (open with the live KPI readout and a blank "+ add knob" — pre-picking R is a recommended-badge, which the credo forbids); and the **surface earns its keep on the flash (T,P, both continuous), while the column's honest What-if is a 1-knob R-curve** — integer knobs (N, feedStage) render as discrete small-multiples, never an interpolated contour.

## 2. THE UX (KPI first, then knob, range last)

**On open** (any unit's Internals → What-if tab):
- Top line: **Watch: `[ KPI ▾ ]` = `<live value>`** — the dropdown is `result.kpis[unitName]`, filtered (see §5); it shows the converged parent-run value immediately, before any click. Zero magic — it's the number already on disk.
- Second line: **Turn: `[ + add knob ]`** — blank. No knob is pre-selected.

**1 knob → a KPI-vs-knob curve.** Pick a KPI, click "+ add knob", pick one scalar (a named `variables{}` entry if the case declares them, else any `operation` scalar — both offered, named ones first). A symmetric range around the current value auto-fills (editable, two number boxes — honest, not magic). The body draws **x = knob, y = KPI**, a line over the swept range, with a **"you are here" dot** at the current (knob, KPI) and a crosshair. Dragging the slider snaps the dot to the nearest swept point and reads off its real solve (the dot snaps to computed points — no live re-solve storm; stated plainly so the picture never lies). Under the plot: the glass-box substitution line, `units[0].operation.T = 370 → 365 K`. **Exact plot: Plotly line/scatter (the existing `CsvAutoPlot`, projected to one response column).**

**2 knobs → a filled contour.** Click "+ add knob" again; after the second chip the control greys with the tooltip *"≤2 knobs so the response stays a curve or a surface."* The body draws **x = knob A, y = knob B, colour = KPI**, with overlaid iso-KPI contour lines and a "you are here" dot at the current (A,B). **Exact plot: Plotly `Contour` (filled heatmap + iso-lines).** A "show as curves" toggle re-slices the *same* grid into a small family of KPI-vs-A lines (one per B) for those who prefer it. **Auto-detect: if either knob is integer-valued (N, feedStage), the contour is FORBIDDEN — render discrete small-multiple curves instead** (one KPI-vs-continuous-knob line per integer value), because a smooth contour over integers interpolates columns that do not physically exist.

## 3. FLASH WORKED EXAMPLE — flash01, KPI=V/F, knobs T & P

Feed: 100 kmol/h, **40/60 benzene/toluene**, at 370 K / 1 bar.

- **On open:** `Watch: V/F = <converged value at 370 K,1 bar>`, blank knob. (V/F read straight from `kpis_["V_over_F"]`.)
- **1 knob (T):** range auto-fills ~[355, 385] K. Body renders the **V/F-vs-T S-curve** — flat at 0 (subcooled, below bubble), rising through the two-phase window, flat at 1 (superheated, above dew) — dot at the current point. This is exactly what `flash06_sweep_T` already produces; the only new thing is that the y-axis is the *chosen* KPI projected to one line, not a thicket of all responses. The student SEES the bubble→dew march.
- **2 knobs (T, P):** both continuous, both influential — the surface earns its keep here. Body renders a **filled contour of V/F over the T×P plane**, with the **V/F=0 (bubble) and V/F=1 (dew) iso-lines** bounding the two-phase band, "you are here" dot at (370 K, 1 bar). The student discovers the flash envelope by turning knobs — the single most intuitive picture in the simulator, and it falls straight out of the model. Swap the KPI to `Q_kW` (same knobs) → the duty surface that holds each (T,P). Swap to `vapor.benzene` → the relative-volatility lesson.

## 4. DISTILLATION WORKED EXAMPLE — column01

Feed: **50/50 benzene/toluene, D=50 kmol/h (D/F=0.5), R=2, N=15, feedStage=8, P=1.013 bar.**

- **The tab opens with NO default KPI or knob pre-selected** (no recommended-badge). It shows the live KPI readout once the student picks one, and a blank "+ add knob."
- **The sensible 1-knob instrument the student builds:** KPI = `x_D_LK` (labelled by its real name, **not** relabelled to "purity" — that relabel lies on 3+ components and is glass-box magic), knob = `refluxRatio`. **Honesty flag for Vítor:** at D/F=0.5 on a 50/50 feed, the material balance pins the cut hard, so the purity-vs-R curve on *this* dict is modest, not the textbook knee. Two honest options — both stated, neither hidden: (a) **default the column demo's most-teaching KPI to `recovery` or `Q_reboiler_kW`** (which DO move dramatically with R on this dict), or (b) **ship a tuned demo dict** with a purity target so the knee appears. The instrument is correct either way; the dict just has to be one whose default point shows a live response.
- **How the user swaps:** change the KPI dropdown to `Q_reboiler_kW` → same R knob, the **duty-vs-R curve** (rising while purity flattens) — the energy trade-off in one screen, no re-run if the sweep emitted all responses (it does; swapping KPI is a re-colour, not a re-solve — see-then-decide done cheaply).
- **2 knobs on the column:** the honest answer is **mostly don't.** `(R, feedStage)` and `(R, N)` both cross continuous R with an INTEGER axis → rendered as **discrete small-multiple R-curves** (one line per integer feedStage/N), never an interpolated contour. `(R, P)` is a valid continuous surface but P barely moves benzene/toluene. So **the column's natural What-if is the 1-knob R-curve**; the surface is a flash story. This flips the "column is where it earns its keep" claim — correctly.

## 5. KPI + KNOB SELECTION (glass-box, no Aspen menu)

Both lists are short because they are **authored, not generated**:

- **KPIs = `result.kpis[unitName]`**, the unit-op author's curated emit-set — the only things the unit physically computed this run. **Three mandatory filters** (the critiques caught real leaks): (i) exclude any KPI whose name equals a selected knob (kills `watch T as I turn T` tautologies — flash emits `kpis_["T"]`, `["P"]`; column emits `["R"]`, `["nStages"]`, `["D"]`); (ii) exclude non-numeric/enum KPIs (flash's `phaseSet` is a category — cannot be a y-axis); (iii) show the KPI's **real key name** (`x_D_LK`), never a friendly relabel.
- **Knobs = any swept dict scalar.** The literal `operation` scalar is turnable directly (no `variables{}` required — the engine already sweeps raw `operation.T`). If the case declares `variables{}`, those named/unit-tagged entries are offered **first** (the author's blessed levers); raw operation scalars follow. `variables{}` is thus the way to **name and persist** a knob you found useful, surfaced by the "Save as outerDict" bridge — not an entry tax.

The only decision the student makes is **which physical KPI to watch against which knob** — the pedagogical choice, nothing else. No property-method cascade, no recommended badge, no LLM pick.

## 6. BUILD PLAN (smallest-first, ~80% reuse)

**Reuse as-is:** 1-unit clone solve + override chips + no-save discipline (`WhatIfTab.tsx`); named knobs (`collectVariableKnobs`); 1-knob sweep synth + `SweepDriver` + `CsvAutoPlot`; per-unit `kpis_` maps (`IsothermalFlash.cpp:1099`, `DistillationColumn.cpp:355`).

**Slice 1 — the "natural" feel on the FLASH (ships alone, no C++):**
1. Invert the page: KPI-hero line at top (dropdown over filtered `result.kpis` + live current value), blank "+ add knob" below. **Delete** the "show all inputs" / per-scalar form (it re-imports the blizzard — kill, don't demote).
2. Bind the chosen KPI as the sweep's single `responses(...)` entry; project `CsvAutoPlot` to that one column; overlay the "you are here" dot (snaps to swept points — commit to this, no live-drag re-solve).
3. The substitution line + auto-range boxes + the empty-knob on-ramp (works on raw `operation.T`; the `variables{}` snippet becomes a *"promote to a named knob"* nudge beside a working slider, never a wall).
This proves end-to-end on flash01 today (it IS `flash06`).

**Slice 2 — 2 knobs, FLASH first (the one real engine touch):** a new **`gridSweep`** OuterDriver (sibling to `sweep`, registered explicitly per the factory rule — leaves 1-D `sweep` and every tutorial untouched, reads glass-box). `parameters( {target;range;nPoints} {target;range;nPoints} )`, emits long-form `point,A,B,<all responses>` CSV. New `synthesizeGridSweep()` + a **new CSV parse branch** (the contour parse is new, not just the render — the ledger must own this) + Plotly `Contour`. Cap UI at 2. Prove on flash01 (T,P) → the envelope.

**Slice 3 — DISTILLATION + integer honesty:** auto-detect integer knobs → force discrete small-multiple curves (never a contour); 1-knob R-curve as the column's natural instrument; KPI-swap re-colour (gridSweep emits all responses). Tune/ship a column demo dict whose default point shows a live R response. Optionally add `variables{}` blocks to flash01/column01 to demo the named-knob path.

**Slice 4 — "Save as outerDict":** one click reveals/writes the exact transient `outerDict` — the toy↔real bridge. No solver work.

No C++ beyond the one `gridSweep` driver; everything else is GUI reframe + the WASM transient-outerDict writer that already exists.

## 7. HONEST CHECK

**Is it natural now?** Yes — once Slice 1 ships, opening What-if on flash01 shows `V/F = <value>`, you add the T knob, and the S-curve with the dot appears immediately. That "the objective is already on screen and the curve draws the instant I pick a lever" is the fix for "doesn't feel natural." The KPI-first sentence + the ≤2 cap as a visualisation law are the professor's own mental model made structural.

**The one risk to watch: non-convergence rendered honestly.** The clone WILL fail to converge at off-design points (a column below minimum reflux; an over-specified flash). Glass-box demands the failure be a **visible, explained state** — a gap in the curve labelled "below minimum reflux — no steady state", a struck cell in the contour — **never a blank, a NaN, or a smoothed-over line.** Every plotted point must be a real converged solve or an honest hole. If a student drags into a non-converging region and sees silence or noise, they conclude the *physics* is noisy and distrust the instrument — that single hole would undo the whole "natural" feeling. Build the explained-failure state into Slice 1, not as an afterthought.
