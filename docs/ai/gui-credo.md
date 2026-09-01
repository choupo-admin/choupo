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
│  File <context-dependent workspaces> …        [▶ Run]    │  32 px header
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
  item is a **toggle** that swaps the canvas for that workspace;
  clicking it again — or pressing **Esc** — returns to the canvas.  At
  most one workspace is open at a time.  This replaces the old
  always-on bottom tabs.
  **The lineup is CONTEXT-DEPENDENT, and the authority on it is the
  `WORKSPACES` table in `gui/src/ui/MenuBar.tsx`** — this file states
  the rule, never a copy of the list (an earlier revision carried one
  and it drifted: it still named a "Thermo" workspace years of edits
  after Thermo became a TAB inside Props, and called Reports a
  placeholder long after it shipped utilities + global balances).  The
  rule: each case TYPE exposes only the workspaces that mean something
  for it, so a lit-but-dead button never shows — a props case gets the
  props set, a batch/ctrl case gets the time set (plus the Control
  Room only when a PID is actually declared), a steady case gets the
  full set (incl. Variables, Pinch — greyed until a run yields duties
  — and Reports), and a blank boot shows no tabs at all except the
  standalone Explorer.  "Explore" is in every set because the explorer
  synthesizes its own transient case.
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
| **View modes** | Render View / Spreadsheet / Plot / etc. swap on the central canvas | **On-demand workspaces** opened from the top menu (context-dependent lineup — see §2.5; `MenuBar.tsx` is the authority); each toggles over the canvas, Esc returns | Done in Fase A/B (2026-05-27).  The earlier bottom-tab strip was removed; workspaces are the canvas-view-mode pattern this row once flagged for "Layer 2". |
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

**Explorer chrome budget — the NO-REBLOAT invariant (ratified 2026-06-24).**
The plot is the one primary surface. There are exactly **three chrome homes**:
(1) the **collapsible left SET rail** (component authoring only — folds to a
28px re-open tab, lossless of the dragged width, `[` toggles); (2) **ONE top
toolbar row, `wrap: nowrap`, which must NEVER grow a second row**; (3) the
**collapsible honesty footer** below the plot (alerts + validity readouts stay
VISIBLE — numerical-honesty credo — but a `⚠ N` pill folds them so they never
push the plot down). Any new control goes into the toolbar as a
menu-button/popover, or into an existing popover — **NEVER a new stacked row
above the plot.** A control that would force the toolbar to wrap is wrong by
construction: fold it into a popover. The plot's top-left origin is FIXED and
must not move when lenses or options change (the PURE/MIXTURE badge, the SET
pill and the plain-words caption ride as on-plot top-left overlays, not pre-plot
rows). `wrap: nowrap` is the *mechanical* guard that makes re-bloat physically
impossible without consciously breaking the rule. **No STEP-1/2/3 wizard
labels** — the regions are self-evident spatially (a numbered wizard is the
forbidden setup-dialog smell, §5). The one exception that stays INLINE rather
than folding into a popover: a control that *forks the curve* (the scaling
Davies/Pitzer activity model; the steam saturation/isobar mode) — because
SEEING the fork is the lesson.

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
  ThermoSummary fallback; the thermo summary lives as the ThermoView
  TAB inside the Props workspace).

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
  opened from the top menu; the lineup is context-dependent per case
  type and `gui/src/ui/MenuBar.tsx` is its authority (§2.5).  At most
  one is open; Esc closes it back to the canvas.  (Older docs called
  these "views / bottom tabs"; the bottom-tab strip was removed in the
  Fase A/B redesign.)
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

## 9. The Methods workspace (2026-08-15)

A second standalone workspace beside the Property Explorer, ratified
2026-08-15, hosting **classical METHOD CONSTRUCTIONS** — operating lines,
staircases, process paths on a state chart.  The criterion that splits the
two planes, recorded here as the contract:

> **method-construction → Methods;  property-surface → Explorer.**

A property surface answers *"what does this system's property look like?"*
(T-x-y, γ(x), a Psat scan — the Explorer keeps these).  A method
construction answers *"what does the classical graphical method say about a
design question?"* (how many stages does this R and q buy; where does this
drying path land).  The first slice migrated the two tools that were method
constructions living in the Explorer: **McCabe-Thiele** and the
**psychrometric chart** — the HOSTING moved (`MethodsWorkspace.tsx`), the
plot components stayed in the shared `gui/src/ui/plotting/` kit, and the
engine feeds moved to their one shared home (`gui/src/case/methodFeeds.ts`
— Explore's T-x-y / γ(x) / flash lenses and Methods' McCabe tool consume the
SAME `binaryVleSpec`, so the two hosts cannot drift).

**The Explorer's guard-rails (§3) are inherited unchanged**, above all:

* **ZERO physics in TS (guard-rail 4).**  Every curve is an engine (WASM
  `choupoProps`) run over a transient synthesized case, or an engine-written
  CSV.  The McCabe equilibrium curve y*(x) arrives ALREADY COMPUTED by the
  engine; the staircase drawn ON it (and the psychro chart's rendering) is
  pure geometry in the plot kit.  A construction the engine cannot yet feed
  is listed as *planned*, never faked in TS.
* **The propsDict / case hand-off (guard-rail 2).**  Each live tool keeps
  the "Author → copy propsDict" hand-off: the workspace EMITS the dict for
  the student / agent to author on disk; dict-on-disk stays the one
  authoring channel, and the workspace never writes a case.
* **Ephemeral, on-demand** (top menu beside Explore; Esc closes via the
  shell), standalone (works with no case open — it synthesizes its own
  transient runs; case-local components still reach the runs when a case IS
  open, exactly as in the Explorer).

**The tool registry is the authority.**  `METHOD_TOOLS` in
`MethodsWorkspace.tsx` is the single source of truth for which tools exist
and which are live — this document carries no copy of the tally (the
7-tool/2-live table that used to sit here had already drifted; a second
home for a derived count is the arity sin).  Planned entries stay
**visible but disabled**, each naming the engine output that will feed it;
the rail and the narrow-viewport bottom sheet BOTH render the registry
(`MethodToolList`), never a filtered subset.

**Consolidated pattern — ONE PANEL CONTRACT (2026-08-18; supersedes the
"responsive rail" paragraph that stood here).**  Every rail and the bottom
window obey one declaration, `gui/src/ui/panelContract.tsx`, over one storage
home, `gui/src/state/prefs.ts`.  A panel is resizable, auto-hideable,
keyboard-reachable, and its width belongs to the READER (localStorage, every
tab) while only which case/view/selection belongs to the TAB.  Three rules
are enforced structurally rather than by convention: a handle you can SEE is
a handle you can GRAB (it renders as a sibling of the clipping box, so no
ancestor `overflow: hidden` can trim it); an ADVERTISED shortcut is a BOUND
shortcut (one field derives both the hint and the binding); and collapse
defaults by MEASUREMENT — `fitsRow(min + contentMin, measured host width)`,
never a breakpoint and never `pointer: coarse`.

What the superseded paragraph got wrong is worth keeping, because it is the
project's standing lesson about posture: it made the DEFAULT a media query.
Breakpoints and `pointer: coarse` have each produced a wrong answer on a real
device here (a tablet treated as a phone), which is why the fit rule now
answers from two measured widths and an unmeasured width answers "fits".

The EduTools setup knobs were the LAST thing outside this contract — a
horizontal strip above the diagram, excluded on the argument that it was "a
fold with no size, so not the contract's shape".  True of a strip, void for a
panel: as a left panel it HAS a size, which is exactly the contract's shape.
Moving it returned the drawing its width (the strip cost 201 px of chrome
height, and an aspect-fitted plot pays lost height in width: 913 px drawn
becomes 1068 with zero side margin).  A square plot pays the opposite way,
and dragging or folding recovers it.

**A COLLAPSED PANEL MUST BE `visibility: hidden`, not merely `width: 0`.**
Paid for once, across seven panels at once: `width: 0; overflow: hidden`
clips PAINT only — the children keep boxes, tab order and hit-testing, so a
keyboard user tabs into a panel that is not on screen and types into fields
they cannot see.  It was invisible to the test suite (jsdom has no layout)
and reached only by the browser harness, which reported 94 unreachable
controls at 390 px.

Planned entries are never filtered out by posture, and hover is never
load-bearing: anything a tooltip says is a visible description in the panel.
At 390 px the knobs panel starts folded by the measured default and opens as
a sheet over the construction, saying so on the panel.

**Ratified naming (2026-08 ballot).**  The rail header is **CLASSICAL
METHODS**; tool labels are operation-first with the method in parentheses —
"Distillation (McCabe-Thiele)", "Absorption (Kremser)", "Batch still
(Rayleigh)", "Heat exchanger (ε-NTU)".  The top-menu label stays
**Methods** and the URL key stays `methods`.

Deep links: `?workspace=methods&tool=<id>` (new); the legacy
`?explore=mccabe` URL (without a `&key=` stash) now opens Methods/mccabe —
a redirect, never a broken link.  With `&key=` it remains the McCabe
analyzer pop-out tab, unchanged.  Selecting a tool writes the deep link
back into the address bar (`history.replaceState` — no history spam), so
the URL is always a shareable bookmark of what is on screen.

## Provenance

Started 2026-05-27 as `gui-mental-model.md` during over-correction
from a block-editor framing to ParaView patterns.  Renamed to `gui-credo.md`
and rewritten when Vítor pointed out that the Choupo GUI is its own
thing — informed by ParaView, but with deliberate adaptations driven
by chemical-process specifics and the dict-on-disk + LLM-author
workflow.

## 10. EduTools REPLACE THE TEXTBOOK — Vítor's ruling, 2026-08-31

Reviewing the pages, the owner ruled on their AMBITION, and it is a change
of mission rather than a refinement:

> *"Os alunos têm de chegar e ver lá a teoria toda deduzida, com equações,
> exemplos e a papinha toda feita!  Para o resto dos modelos de propriedades
> deve ser a mesma coisa!  O EduTools serve para substituir os livros de
> texto!  No McCabe e Thiele deve ter a dedução das equações!  E o Savarit
> também tem de ficar!"*

The occasion was the COSMO-SAC entry in `four-ways-mixture`: five fields and
one paragraph, telling a reader what the model KNOWS and never showing a
sigma-profile, never writing the segment-activity equation, never deriving
anything.  The verdict on it was "uma porcaria", and it is the right verdict
against this bar even though the card is correct against the OLD one.

What changes:

* A page is no longer a set of notes BESIDE the construction.  It carries
  the **derivation** — the equations, in order, with the assumptions named
  as they are made — then the worked example, then the live engine run.
* This binds **every property model**, not only COSMO-SAC: ideal, NRTL,
  UNIQUAC, UNIFAC, COSMO-SAC, PC-SAFT.
* It binds the classical constructions: McCabe-Thiele must derive its
  operating lines and its q-line, not merely draw them.
* **Ponchon-Savarit is IN SCOPE and must exist.**  The engine already
  publishes what it is drawn on (`enthalpyConcentration`, witness
  `tutorials/props/scan/hxy01_ethanol_water_1atm`, theory `ch:ponchon`);
  what is missing is the page.

WHAT THIS DOES NOT LICENCE, because the ruling raises the ambition and
repeals none of the invariants below it:

* **Zero physics in TypeScript still holds.**  A derivation is prose and
  equations; the NUMBERS in a worked example come from the engine run, or
  are closed-form arithmetic printed with their constants so a reader can
  redo them on paper.  A page that starts computing thermodynamics in the
  browser to look like a textbook has become a second engine.
* **Nothing invented.**  A derivation that needs a datum the tree does not
  carry states the gap; it does not supply a plausible number.
* Every equation shown must be the one the engine RUNS, cited to
  `file:line`.  This is not bureaucracy: requiring the citation is what
  turns writing a page into READING the implementation, and that is where
  the 2026-08-28/29 glossing slice found eight defects nobody was hunting.

A SCOPE LIMIT, added the day after: **management and organisational
material is OUT for now** (owner, 2026-09-01: *"para já vamos evitar o
management"*).  A page working through a capital cost's chain of judgement
was built and then WITHDRAWN at his word, and the "Economics & management"
shelf went with it — a discipline label with nothing under it is exactly
what the shelf test forbids.  Recorded so the next session does not
re-propose it as a fresh idea: it was tried, and the owner did not want it.
What the ruling above binds is the DERIVATION of what the engine computes;
it is not a licence to widen the syllabus.

THE ARITY QUESTION THIS OPENS, recorded because it is unresolved and the
next session must not assume it away: derivations already have a home, the
Theory Guide (`docs/theoryGuide.tex`), and every registry entry carries a
`theory:` field pointing into it (`ch:pcsaft`, `ch:ponchon`, ...).  Putting
the derivation on the page too creates a SECOND home for one derivation,
which is the sin this project spends most of its gates on.  The working
default, until the owner rules otherwise: the PAGE is written first and is
the home a student reads; the guide chapter keeps the formal treatment and
the two must be checked against each other rather than diverging quietly.
A mechanism that makes them one source has not been designed.

Update this file when:
- A new founding principle is established (rare).
- An adaptation vs ParaView is debated and decided.
- A new pattern is consolidated across multiple components.
- An anti-pattern is identified after a wrong path was taken.

Do NOT update for routine implementation work; that belongs in the
component itself and `CLAUDE.md`.
