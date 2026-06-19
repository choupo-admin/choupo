# Choupo GUI Credo

The single source of truth for how the Choupo GUI is designed.  Read
this before proposing any UI change, before reviewing GUI code, or
before suggesting a "feature you've seen elsewhere".

The Choupo GUI is not a clone of any existing tool.  It is informed
by **ParaView's separation of authoring (offline) from viewing (in
the GUI)**, but adapts that pattern to the specifics of a
chemical-process simulator built around dict-on-disk cases edited
with LLM help.

## 1. Identity

The Choupo GUI is a **viewer** for a Choupo case directory.  It loads
the plain-text dicts (`system/`, `constant/`, fractal sectors), runs
the C++ solver compiled to WebAssembly in the browser, and renders
the results.  The shell is deliberately minimal: a 32 px header
(menu + brand + case + Run) over a **full-screen flowsheet canvas**,
with detail surfaced on demand (see §2.5).  It is not:

- **A spreadsheet-style block editor.**  Cases are authored as dicts
  on disk (with an LLM assistant), not built by drag-drop in the GUI.
- **A literal ParaView clone.**  The "pipeline" relevant to a chemical
  engineer is the dict-file structure of the case, not a chain of
  visualisation filters — see §3.
- **An IDE.**  Editing the dicts happens in the user's text editor.
  The GUI shows what is on disk; it does not write back silently.

## 2. Founding principles (non-negotiable)

1. **Dict-on-disk is the source of truth.**  The GUI loads and
   renders; it never silently writes.  When the user wants to change
   a case, the change happens in the dict files.
2. **LLM is the author, GUI is the viewer.**  The expected authoring
   workflow is the user describing what they want to an LLM (in
   plain language), the LLM editing the dicts via `Write`/`Edit`,
   the GUI inspecting the result.
3. **Single click selects, double click opens.**  File-manager
   convention.  Single click on any element → the floating top-right
   **selection card** updates.  Double click on a stream → new browser
   tab (pop-out).  Double click on a sector / unit that is itself a
   case → drill into it as its own URL.
4. **Pop-out (new browser tab) beats modal.**  Long content (file
   text, streams table, plots, multi-phase / many-component
   streams) opens in a separate browser tab via Blob URL +
   programmatic anchor click.  The user keeps the flowsheet visible
   while reading the detail — modal would block the canvas.
5. **Errors must never blank the screen.**  Render exceptions are
   caught by a global ErrorBoundary and replaced with a visible
   fallback (message + stack + reset button).  Defensive numeric
   formatters render "—" instead of throwing on missing data.
6. **Onboarding is implicit in the layout.**  Any opened case
   answers "what is this?" within 5 seconds: the full flowsheet is
   on screen at once, the case subtitle comes from
   `controlDict.description`, and the detail (streams, thermo, case
   files, log, plots) is one click away in the top-menu workspaces.

## 2.5 The shell (current layout)

The shell was redesigned in the Fase A/B workspaces rework
(2026-05-27, `gui/src/ui/AppShell.tsx`).  There is **no** permanent
left case-tree, **no** right Properties panel, and **no** bottom tab
strip — all three were removed.  The layout is now:

```
┌──────────────────────────────────────────────────────────┐
│  File Streams Plots Log Thermo Case Reports … [▶ Run]    │  32 px header
├──────────────────────────────────────────────────────────┤
│                                                          │
│                FlowCanvas (full screen)        ┌───────┐ │
│                                                │ sel.  │ │  ← floating
│                                                │ card  │ │    top-right
│                                                └───────┘ │    (when selected)
└──────────────────────────────────────────────────────────┘
```

- **Header (32 px).**  Menu items on the left (`MenuBar`), brand /
  case name on the right (`TopBar`).
- **Run is per-view, not a global toolbar button** (the `[▶ Run]` in the
  sketch above is historical).  Each view owns its Run: the FlowCanvas
  carries a "Run flowsheet" panel (top-right), PropsView its own run
  action.  They dispatch `choupo:run` / `choupo:stop` DOM events; the
  `TopBar` stays the orchestrator (it holds the AbortController and
  shows the run toasts) but no longer renders the button.
- **Canvas (everything below).**  The flowsheet fills the viewport.
- **Workspaces, opened on demand from the top menu.**  Each menu
  item (Streams / Plots / Log / Thermo / Case; Reports is a
  placeholder) is a **toggle** that swaps the canvas for that
  workspace; clicking it again — or pressing **Esc** — returns to the
  canvas.  At most one workspace is open at a time.  This replaces the
  old always-on bottom tabs.
- **Selection card (floating, top-right).**  Appears only when
  something is selected; shows the selected unit's "hardware"
  parameters and its latest-run KPIs, or a stream's conditions.  It is
  a small overlay card, NOT a docked right panel, and it disappears
  when nothing is selected (it does not fall back to a ThermoSummary).
- **PropsView.**  A `choupoProps` case (carries `propsDict`, no
  `flowsheet`) replaces the canvas centre with the property-scan /
  fit view instead.

## 3. Deliberate adaptations vs ParaView

ParaView is the architectural inspiration (DSL + viewer family, dicts
on disk, CLI binaries, no editing of physics models in the GUI).  But
chemical-process simulation is not CFD; some adaptations are needed.

| Where | ParaView | Choupo | Why |
|---|---|---|---|
| **Left panel** | Pipeline Browser: source + applied filters | **None.**  The flowsheet canvas is full-screen; case files live in the on-demand **Case** workspace, not a permanent tree | An always-on left tree where clicking does little was "nojo" — a docked panel earns its pixels only if it is constantly useful.  The case files are one menu click away instead. |
| **Right panel** | Properties of selected filter | **Floating selection card** (top-right): the selected node's hardware + run KPIs, or a stream's conditions.  Vanishes when nothing is selected | A docked Properties panel is mostly empty most of the time.  A card that appears on selection and gets out of the way otherwise keeps the canvas dominant. |
| **View modes** | Render View / Spreadsheet / Plot / etc. swap on the central canvas | **On-demand workspaces** (Streams / Plots / Log / Thermo / Case) opened from the top menu; each toggles over the canvas, Esc returns | Done in Fase A/B (2026-05-27).  The earlier bottom-tab strip was removed; workspaces are the canvas-view-mode pattern this row once flagged for "Layer 2". |
| **Multi-view split** | Yes (4-up layout) | **No — pop-outs (new tab) instead** | Pop-outs let the user multi-monitor or window-tile, with the same outcome and far less code.  Browser tabs are persistent and survive a Choupo crash. |
| **Time controls** | Timeline + slider for transient runs | Not yet — `choupoBatch` / `choupoCtrl` trajectories have static plots | Layer 2 work. |
| **Color By field selector** | Yes | Not yet | Layer 2 work — colour streams by T / dominant component / phase. |

### The Property Explorer (interactive visualiser scratchpad) — adaptation, 2026-06-05

An on-demand workspace to navigate a component's (standard or case-local) or a
mixture's properties and plot them interactively (xy multi-curve, 2D contour /
isolines, ternary, later) — *serendipity before authoring a case*. This is the
purest expression of the founding "see, then decide" principle and the front
door to the property-model tree (`docs/property-architecture.md`).

It does NOT cross the "GUI is a viewer, authoring is offline" line — it is a
**visualiser scratchpad**, gated by five hard guard-rails:

1. **Ephemeral — never writes a case.** Computes + renders; never persists.
2. **Hands off to authoring.** When the student keeps an exploration, the
   explorer EMITS the `propsDict` snippet for the student/agent to author on
   disk. Dict-on-disk stays the source of truth (Credo Q2). The explorer feeds
   authoring; it does not replace it (ver → decidir → o agente autora).
3. **On-demand workspace** (top menu + Esc), NOT a first-step config dialog
   gating a case (that is the forbidden setup-wizard anti-pattern, §5).
4. **Reuses the engine + plot kit — reimplements ZERO physics in TS.** Every
   curve is a `choupoProps` (WASM) run over a transient, GUI-synthesized
   `propsDict` (the same `propertyScan1D`/`2D` + `evaluateProperty` an authored
   case uses), rendered with the shared `gui/src/ui/plotting/` kit. A property
   or sweep the explorer needs that the engine lacks is ADDED to `choupoProps`
   (reused by authored cases + the agent) — the explorer is a forcing function
   that completes the engine, never a parallel compute path.
5. **Provenance-first — PENDING.** Each curve is to carry
   `origin/method/validity`, with the validity range shaded and measured data
   + AAD overlaid where available (scheduled with the per-value `Origin`
   provenance keystone, `docs/property-architecture.md`). The explorer is the
   surface where per-value provenance becomes visible.
6. **Generate-and-DOWNLOAD is the ONE authoring act the explorer may do**
   (ratified 2026-06-06, forum-validated). Estimating a missing component is
   still *see-then-decide*, so it is allowed — under THREE fences: (a) the
   ENGINE does all the physics (`choupoProps estimateComponent` via WASM; zero
   TS), (b) the result is a **reviewable case-local
   `constant/components/<name>.estimate-DATE.dat` proposal the student DOWNLOADS
   via Save-As** — the GUI NEVER writes `<name>.dat` in place and NEVER persists
   silently, and (c) `data/standards/` stays frozen. *Promotion = the student's
   `mv`/rename on disk*, never a GUI action. "Download a dated proposal" ≠
   "activate a component" — the word "promote" is reserved for the manual disk step.

Build order (Pareto, on data the engine already produces): Fase 1 = xy
multi-curve + 2D contour/isolines + binary x-y/T-x-y; Fase 2 = ternary (needs a
composition-simplex sweep added to `choupoProps`); 3D surface optional.

## 4. Consolidated patterns

### Selection model
- **Single click** on any flowsheet element → `selectNode(id)`.
  The floating top-right **selection card** appears (or updates) with
  that node's hardware + KPIs, or that stream's conditions.
- **Double click** on a stream (FEED / PRODUCT / edge label) →
  `popOutStreamByName(name)`.  New browser tab with conditions table
  + composition bars.  The selection card ALSO updates.
- **Double click** on a sector or unit that is itself a sub-case →
  `openInNewWindow(id)`.  New browser window loads the sub-case as its
  own root case (fractal drill-in).
- **Click on the canvas pane** → `selectNode(null)`.  The selection
  card disappears (the canvas is the resting state — there is no
  ThermoSummary fallback; Thermo lives in its own workspace).

### Direct manipulation of the layout (view-only, persisted)
The flowsheet is a layout the user can arrange; none of this writes
back to the dicts (the dict topology is immutable from the GUI).
- **Drag a node** to reposition it.
- **Drag an edge's mid-point** to bend it (`waypoint` / `WaypointEdge`),
  routing connections around units.
- **Drag a connection point** along a unit's border to choose where a
  stream attaches (per-unit `<unitId>\0<handleId>` overrides).
- **Per-case layout persistence.**  Node positions, viewport, edge
  bend-centres, and connection-point overrides are saved to
  `localStorage`, keyed by case, and reloaded on next open.  Cleared by
  the usual "reset layout" affordance; never touches disk.

### Stream-class show/hide
The canvas carries view-only toggles (NOT case data) to show/hide
classes of stream: **energy** wires (W / Q), **recycle** tear edges,
and **utility** streams (incl. the column duty stubs).  Default: all
shown.  This lets a reader declutter a busy flowsheet without editing
anything.

### Column duty stubs
A distillation column renders short **duty stub** edges for its
reboiler / condenser heat ports.  Each stub reads the duty (kW) from
the run KPIs and the allocated utility + cost (€/h) from the solver's
`utilityAllocation`, so the stub shows which utility serves it and at
what cost.  (For the underlying heat-port / heat-link / utility model,
see `docs/ai/energy.md`.)  Duty stubs are part of the **utility**
stream class for show/hide.

### Pop-out pattern
Used in: Files (single file from the Case workspace), Streams table
(whole table, from the Streams workspace), Single stream (from canvas
double-click or the selection card's ↗), Plots (current Plotly view
as PNG).

Implementation:
- Build full HTML document (inline `<style>`, no React, no Mantine).
- Wrap in `Blob`, get URL via `URL.createObjectURL`.
- Create hidden `<a target="_blank" rel="noopener">`, programmatic
  `.click()`, remove.
- Revoke URL after 30 s (generous timeout for cold browser tabs).

This bypasses Firefox's popup blocker (no `window.open(...)` with
explicit features) and works identically across Firefox / Chrome /
Safari.

### Stream-name lookup
Streams cross several naming conventions in the same case:
- `flowsheetDict` connections: `concentration/condensate1` (slashes)
- Solver JSON output: `concentration.evap1.cond1` (dots) OR
  `evapCondensate1` (boundary alias)

The `findRunStream(streams, name)` helper tries in order: exact match,
slash↔dot swap, leaf-match (case-insensitive suffix on the last path
segment).  Used by all stream lookups (selection card + pop-out).

### Defensive rendering
- `formatTemperature/Pressure/Flow` return `"—"` for `undefined`,
  `null`, or non-finite inputs.  Never throw.
- `Object.entries(... ?? {})` on any composition / extraFiles / etc.
- Top-level `ErrorBoundary` in `App.tsx` catches any render exception
  and shows a fallback instead of unmounting the app.

### The what-if lives in the unit's INTERNALS page — Vítor's ruling 2026-06-12

All interactive "change a value and re-run" wishes are ONE concept, not
many features: a **transient overlay over a clone the GUI already
makes** (every run ships the dicts to MEMFS; `unitFocus.ts` synthesises
a 1-unit case that never existed on disk).  Where it lives was settled
by Vítor, overruling the first card-based build AND the forum's
focus-tab arrangement:

- **The parent flowsheet stays a pure viewer.**  No editable fields on
  the main case's canvas or selection card, ever.  Dict-on-disk stays
  the only authoring channel for the case itself (principle §2.1).
- **Parameter manipulation happens in the unit's INTERNALS page**
  (`?internals=`, the pop-out where the unit's tables and PLOTS live) —
  a "What-if" tab beside Streams/Hardware/Dict/Model: edit the
  `operation` scalars, run the synthesised 1-unit clone, sweep a
  parameter, and SEE the resulting plots in the same page.  Manipulate
  where you plot; one page per unit.
- **NEVER a save option.**  The what-if is transient by definition:
  no download, no write-back, no "save edited dict" — closing the tab
  is the reset.  Showing/copying the equivalent dict text is allowed
  (glass-box: the screen teaches the dict); SAVING it is not.
- **Honesty banner is mandatory:** the clone's inlets are FROZEN from
  the parent run — plant-level feedback (recycles, controllers,
  heat-links) is NOT in the loop.  Say so on the surface.
- **The GENERIC what-if path is the ASSISTANT CONSOLE, not widgets
  (Vítor, 2026-06-12).**  The in-GUI LLM console runs a real agent in
  the open case: it can vary ANY parameter, author a real `outerDict`,
  run the solver and present the result — at the student's request, in
  natural language.  That is strictly more general than any classic
  control, and it IS the credo's "LLM is the author" principle at
  work.  The classic What-if tab therefore stays deliberately modest —
  the no-LLM fallback for classroom/offline/quick-demo use — and new
  interactive-variation wishes default to "the console already does
  this" before any widget is considered (wish-filter question (d)).

**The wish filter** (apply to EVERY interactivity request, including
the founder's): (a) does the engine already know how to do it? (new
physics/drivers go to C++ first); (b) is it expressible as a dict diff
the student could apply by hand?; (c) does it emit that dict when the
user wants to keep it?; (d) does it reuse the overlay/scratchpad
concept, or invent a parallel mechanism?  Failing (b) or (d) ⇒ reject,
however attractive.  This is what keeps the GUI from becoming a
monster of one-off controls.

**Tab citizenship + two surfaces (2026-06-12).**  There are exactly
TWO unit surfaces: the read-only selection card (single click) and the
unit's internals page (double-click; tables + plots + the What-if
tab).  A pop-out tab is a REAL tab: it must survive F5 (stable,
never-consumed stash), carry a distinguishing `document.title`, and
when its source is gone it refuses honestly ("expired — reopen from
the parent") — it must NEVER silently degrade into another surface
while its URL claims otherwise.

## 5. Anti-patterns to avoid

When a feature request smells like one of these, **stop and re-read
this Credo before proposing**.

- **Modal full-screen for inspection content.**  Use pop-out (new
  browser tab) instead.  Modals interrupt; tabs compose with the
  user's existing workflow.
- **Drag-drop authoring of any kind.**  Streams, unit ops,
  experimental data, thermo packages — all are authored as dicts on
  disk.  GUI never edits.
- **Palette of unit-op types as a drag source.**  This is a
  catalogue-of-types editor pattern.  Choupo has no catalogue-of-types
  palette and no permanent left panel at all — the flowsheet comes
  from the case dicts, not from dragging blocks onto a canvas.
- **Setup wizard / modal property selector / "choose your thermo
  package" first-step dialog.**  Authoring is offline.  The GUI
  starts by loading a case, not by configuring one.
- **Auto-save back to disk.**  If we ever add edit operations
  (today: case-level scalar tweaks), the user must explicitly Save
  → download.  Disk is never written silently.
- **Interop / file-conversion dialogs.**  Out of scope
  and a vector for proprietary lock-in.
- **`window.open(url, "_blank", features)` with explicit features.**
  Triggers Firefox's popup blocker.  Use Blob URL + anchor click.
- **CDN-only assets** (Plotly via CDN, fonts via Google Fonts,
  etc.).  Choupo runs offline after first load; everything ships in
  the bundle.

## 6. Vocabulary

- **Case** — a directory with the Choupo layout
  (`<short>.cho` marker, `system/`, `constant/`, optional sectors).
- **Stream** — a process stream (mass + energy carrier between units),
  NOT a data stream or React stream.
- **Sector** — a sub-flowsheet folder in a fractal case (e.g.
  `concentration/`, `drying/` inside the plant case).
- **Workspace** — a content mode that toggles over the canvas,
  opened from the top menu (Streams / Plots / Log / Thermo / Case;
  Reports is a placeholder).  At most one is open; Esc closes it back
  to the canvas.  (Older docs called these "views / bottom tabs"; the
  bottom-tab strip was removed in the Fase A/B redesign.)
- **Selection card** — the floating top-right overlay showing the
  selected node's hardware + KPIs (or a stream's conditions).  Appears
  on selection, vanishes on deselect.  NOT a docked right panel.
- **Pop-out** — opening content in a separate browser tab via Blob
  URL + anchor click.  The verb is "to pop out".  The icon is `↗`
  (IconExternalLink).
- **Drill-in** — double-clicking a sector to open its sub-case as a
  root case in a new browser window.  URL: `?case=<plant>/<sector>`.
- **Run** — pressing the green Run button to invoke the WASM solver
  on the current case.  The button lives IN the view it runs (the
  canvas's "Run flowsheet" panel, PropsView's run action), not in the
  top toolbar — see §2.5 (per-view Run-panel pattern).
- **Pre-Run / Post-Run** — UI states distinguishing "no
  solver output yet" from "solver output available".

## 7. Roadmap by layer

| Layer | Purpose | Status |
|---|---|---|
| **1 — Onboarding & context** | Subtitle, file/stream pop-out, ErrorBoundary, defensive formatters, sector lookup, slash/dot stream name normalisation | **Done** |
| **1.5 — Shell redesign** | Full-screen canvas, 32 px header, on-demand workspaces (replacing the bottom-tab strip), floating selection card (replacing the right panel), removal of the left case-tree | **Done** (Fase A/B, 2026-05-27) |
| **2 — Run + inspect** | Draggable nodes + edge bends + connection points, per-case layout persistence (localStorage), stream-class show/hide toggle, column duty stubs | **Done** |
| **2.5 — Inspect, remaining** | Time controls for trajectories, color-by-stream field selector, multi-stream comparison overlay | Planned |
| **3 — Comparison & decision** | `compare_*` props tutorials with multi-CSV overlay (done), parity plots for fits, declared `experimental {}` block + overlay, thermo audit auto-generation against current flowsheet | Partial |

## 8. Three questions before any UI change

If the answer to any of these is "no" or "I don't know", stop.

1. **Which founding principle does it serve?** (§2)  If none, don't
   propose it.
2. **Does it preserve dict-on-disk as the source of truth?**  If it
   creates a parallel authoring channel, reject.
3. **Which audience does it help — onboarding student, working
   researcher, both?**  Trade-offs that help one but degrade the other
   need explicit justification.

## Provenance

Started 2026-05-27 as `gui-mental-model.md` during over-correction
from a block-editor framing to ParaView patterns.  Renamed to `gui-credo.md`
and rewritten when Vítor pointed out that the Choupo GUI is its own
thing — informed by ParaView, but with deliberate adaptations driven
by chemical-process specifics and the dict-on-disk + LLM-author
workflow.

Update this file when:
- A new founding principle is established (rare).
- An adaptation vs ParaView is debated and decided.
- A new pattern is consolidated across multiple components.
- An anti-pattern is identified after a wrong path was taken.

Do NOT update for routine implementation work; that belongs in the
component itself and `CLAUDE.md`.
