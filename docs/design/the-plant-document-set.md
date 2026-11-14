# The plant document set: PFD, equipment list, line list, P&ID, control narrative

**Kind:** survey and design draft · **Status:** DRAFT 2026-11-03 (nothing
built; no engine or GUI code touched; the pedagogical scope in §6 is Vítor's
to answer before any dispatch) · **Commissions:** C203, C204, C207, C209,
C210 · **Witnesses proposed:** `tutorials/batch/plant/donepezil01_tablets`,
`tutorials/plant/swro01_campoDalias`

## 1. What was asked

Vítor wants Choupo to hand a student, for a designed plant, the document set a
process-design project is delivered with: a PFD as a PDF, a P&ID as a PDF, a
specification sheet for every pipe that connects equipment (the line list:
bore, velocity, total pressure drop, the pump the line needs, the valves and
instruments on it), the layout, and a control panel, eventually in a
`digitalTwin` case (DEV.md 4c C203).  This note measures what the tree
already holds, what fourteen earlier student reports delivered, and orders the
gap into slices.

Method.  Every engine and GUI fact below carries the file and line it was
READ at.  Two cases were RUN with the primary checkout's `choupoSolve`
(`/home/vitor/Choupo/choupoSolve`, no build) on copies in the scratchpad:
`donepezil01_tablets` (exit 0) and `swro01_campoDalias` (exit 0).  Where a
source was not read it says "located, not read".

## 2. What exists, measured

### 2a. The PFD (what the GUI draws, what leaves it)

| piece | where | what it does |
|---|---|---|
| unit box with symbol, name, up to three `k = v` lines | `gui/src/ui/UnitNode.tsx` (632 lines) | the node; the symbol comes from `symbolOf(type)` |
| orthogonal wire with waypoints | `gui/src/ui/WaypointEdge.tsx` (235 lines) | the stream |
| feed/product terminal with a state line | `gui/src/ui/StreamTerminal.tsx` (366 lines); `TERMINAL_W 230`, `TERMINAL_H 64` at `gui/src/case/toGraph.ts:136-137` | the boundary |
| docked utility / power stub | `gui/src/case/toGraph.ts:139-140` (`STUB_H`, `STUB_GAP`), explicit per-port utility read at `toGraph.ts:556-562`, auto-picked utility in the `utilityAllocation` report | the utility legend is NOT drawn as a legend; each stub is a box on its unit |
| 57 own unit symbols (SVG paths in a 48x48 box), 66 type-to-class entries | `gui/src/case/unitFamily.ts:123` (`SYMBOLS`), `:412` (`UNIT_CLASS`) | own drawings; `tag` is the CALCULATION MODEL (`CONV`, `EQ`, `MESH`, `SS`), not an equipment tag (`unitFamily.ts:101`, header comment 40-70) |
| datasheet schematics per EQUIPMENT KIND (tower with trays, pressure exchanger, membrane bank, labelled box otherwise) | `gui/src/case/equipmentSchematic.ts` (887 lines; `SCHEMATIC_KINDS` at `:867`, `fallbackBoxSvg` at `:119`) | a datasheet drawing, not a PFD symbol |
| absolute stream numbering across sectors | `gui/src/case/streamNumbering.ts` (200 lines; union-find over qualified endpoints, header lines 28-48) | one number per physical stream, same in the plant and in a sector |
| stream table | `gui/src/ui/StreamsTable.tsx` (411 lines): F, T, P and composition columns, honours the Units menu, ODS export through `downloadOds` (`:42`) | on screen; the numbers come from the result |
| stream table, engine side | `src/reporting/StreamTableReport.cpp` writes `reports/streams/streamTable.csv`: `stream, role, F_kmol_per_h, F_mass_kg_per_h, T_K, P_bar, vapourFraction, solids_kg_per_h, enthalpy_kW, x_<component>...` (header read from the `donepezil01_tablets` run) and `phases.csv` | one row per physical stream; OPT-IN: `donepezil01` declares `reports { streamTable {} ... }` (`system/controlDict:20-27`), `swro01_campoDalias` declares none and its `reports/` holds only `balances/` and `inventory/` |

Export.  An export path EXISTS and nobody has to build it from nothing:

* `gui/src/ui/flowsheetExport.ts` (152 lines; DEV.md 4c C114) reads what the
  canvas drew (each wire's path with its COMPUTED stroke, width, dash, opacity;
  each node's position and measured size) and hands it to the pure builder
  `gui/src/case/flowsheetSvg.ts` (228 lines): a self-contained SVG with the
  unit symbols and the colour legend BELOW the drawing, or a PNG rasterised
  from it at twice the size.  Triggered by an event listened for at
  `gui/src/ui/FlowCanvas.tsx:1463-1496`.
* `window.print()` ("Print / Save as PDF" button inside a generated HTML page
  opened from a Blob) is the PDF path used by the heat-exchanger and column
  datasheets: `gui/src/ui/HeatExchangerDatasheet.tsx:341,343`,
  `gui/src/ui/ColumnDatasheet.tsx:369,394`, `gui/src/case/hxDatasheet.ts:752`.
* "Download SVG" on the batch Gantt and the GMP plan
  (`BatchPlanSection.tsx:592`, `GmpPlanSheet.tsx:672`), and "Export as page"
  (a self-contained HTML of the 3D layout, `ExportLayoutButton.tsx`).

What the export does NOT cover: no title block, no stream table in the figure,
no equipment tags, no utilities legend (the legend is the colour legend of the
colouring field), no page size, no multi-sheet split of a sectored plant, no
PDF file (the repo carries no PDF-writing library: `gui/package.json:29` has
only `pdfjs-dist`, a reader; `chromium` is installed at `/usr/bin/chromium`
on this machine but is a machine fact, not a repository dependency).

Result JSON (read from `src/result/ResultEmitter.cpp` and
`gui/src/adapters/SolverAdapter.ts`).  Per stream: T, P, F (molar and mass),
composition, vf, phases; per unit: `kpis[unit][key]` (`SolverAdapter.ts:550`)
and the unit-list `units: string[]` (`:520`); per sized item the design
sheets.  There is NO equipment tag of the process-industry kind (P-101, E-201,
V-301) anywhere: `grep` for the form over `src/` and `gui/src` finds nothing,
and the only "tag" in the sizing records is `equipmentTag`, the 1:N sub-item
word (`src/core/ResultRecords.H:238-253`, e.g. `train1`, `train2`), which is
the unit name plus an item suffix, not a tag.

### 2b. Pipes

| fact | where |
|---|---|
| the layout ROUTES every material stream or lists it in `notRouted` with the reason | `src/postProcessing/layout/PlantLayout.H:92-168` (routing rules), result JSON `layout.pipes` / `layout.notRouted` at `src/result/ResultEmitter.cpp:1590-1636` |
| per routed pipe the JSON carries: `stream, label, fromKind/from/fromUnit, toKind/to/toUnit, routedBy, lane, length, F_mass, T, P, vf, route[x,y,z]` | `ResultEmitter.cpp:1590-1612`; typed at `gui/src/adapters/SolverAdapter.ts:1120-1135` (`LayoutPipe`) |
| per not-routed stream: `stream, reason, fromUnit, toUnit`, flags `solids`, `indoor`, an `anchor` | `ResultEmitter.cpp:1619-1634` |
| the `pipeHeader` sizer: declared velocity window, declared list of inside diameters, roughness, a registered friction correlation; reads mass flow, T, P, density (`phaseDensity::of`), viscosity; picks the smallest declared bore with v inside the window; publishes `requiredInsideDiameter, nominalInsideDiameter, velocity, flow, density, viscosity, reynolds, frictionFactor, pressureDropPerMetre` | `src/postProcessing/sizing/PipeHeaderSize.H:28-91`, `.cpp` 297 lines |
| what that sizer says it does NOT model: header length, fittings (the drop is per metre), wall thickness and pressure class, surge, cost, placement | `PipeHeaderSize.H` "NOT MODELLED" paragraph |
| friction correlations as objects with window, citation, anchor: Blasius, Colebrook(-White), Haaland, Churchill | `src/unitOperations/hydraulics/friction/FrictionFactorCorrelation.cpp:71,149,225`; Churchill located by the header of `Pipe.H` (default model), not read in the `.cpp` |
| the `pipe` UNIT: Darcy-Weisbach plus a minor-loss term from a declared list `fittings ( { K 0.9; count 2; } { K 10.0; } )`, outputs `deltaP, velocity, reynolds, dP_friction, dP_fittings, dP_elevation, head_loss_m` | `src/unitOperations/hydraulics/Pipe.H:96-124`, `Pipe.cpp` 643 lines (located, KPIs read from the header) |
| any equivalent-length table, any K-value catalogue for elbows/tees/valves, any valve Cv/Kv | `grep` over `src/` for `equivalentLength`, `Kfit`, `elbow` finds only the `Pipe.H` example; `Valve.H` has no Cv/Kv. DEV.md C205 D2 proposes `F = Cv x opening x sqrt(dP/rho)` for the dynamic tank outlet, not built. So: fittings exist ONLY as K numbers the case types, and no data is shipped (a published K table is a source to cite, see §2d) |
| pump sizing | `src/postProcessing/sizing/RatedMachineSize.H:80-84`: pumps per train = ceil(Q_train / the largest pump's flow), stand-by pumps declared, shaft power from the unit's `W_shaft`. It sizes a pump the FLOWSHEET HAS; it never decides that a line needs one |
| design sheets under `design/` | `swro01_campoDalias` run: 102 files; `donepezil01_tablets`: 16. A sheet carries `unit, equipment, item, material, basis`, `inlets{port0{global, T, P, F, mdot, vapourFraction}}`, `outlets{...}` (read from `design/HPpump/train1`: 2 bar to 58.6 bar, 1372 kg/s) |

Measured on the SWRO run (`log`, `[layout] pipes:` block): **9 streams routed
(1385.6 m in all), 15 not routed**, and 12 of the 15 are not routed because
both ends are inside the building ("indoor piping is not routed ... the
rooms and their service voids"); the other three are the media and cartridge
filters (`storageTank` units with no sized item). So the line list C207 asks
for would today cover 9 of 24 streams of the flagship desalination case, and
the 12 lines carrying the 59 bar high-pressure water (`hpFeed, roFeed,
boosted, pxHPout, brine ...`) are exactly the ones with no length. The batch
tablet plant routes only a few solids/air lines; solids are never piped
(`ResultEmitter.cpp:1634`).

### 2c. Instruments and control

* `choupoCtrl` grammar: `controllers ( { name TC1; type PID; measurement { unit
  reactor; cv T; } actuator { unit reactor; mv T_jacket; } setpoint 350.0;
  gains{Kp Ki Kd} output{min max bias} } )`, read at
  `tutorials/ctrl/ctrl01_cstr_temp_control/system/flowsheetDict:78-102`;
  level loop with a manipulated outflow in `ctrl21_tank_level_control`
  (`measurement { unit tank; cv level; }`, `actuator { unit tank; mv F_out; }`).
  Controller kinds: PID, Schedule, Signal (`src/control/`:
  `PIDController`, `ScheduleController`, `SignalController`,
  `signal/Signal.H`).  19 flowsheetDicts in `tutorials/` declare `controllers`
  (counted by `grep -ln "^controllers"` over the two depths searched).
* A controller is bound to a UNIT's cv/mv key.  There is NO instrument
  object: no transmitter, no sensor lag or dead time (`src/control/Controller.H`
  and `Signal.H` hold no lag/filter; `Signal.H:42` mentions "phase lag" only
  as a Bode-plot output), no valve (a manipulated variable is a unit
  parameter), no tag, no loop index, no degrees-of-freedom check.  No
  instrument tag letters (T, P, F, L, A + I, C, T, V) appear anywhere in `src/`
  or `gui/src` as a convention.
* The GUI side: the Control Room (`gui/src/ui/ControlWorkspace.tsx`) tunes PID
  gains on a closed-loop plot; the credo (`docs/ai/gui-credo.md:22-27`) says
  the GUI is a runner and visualiser, not an editor, which bounds the C203
  panel to declared setpoints and disturbances.
* Dynamic units that exist: `dynamicCSTR` (constant volume), `dynamicTank`
  (C205 slice 1, on main), the `quasiSteady` adapter (DEV.md 4c C204 measured
  fact). Everything else in a plant (exchangers, columns, flash drums, RO
  trains) has no dynamic model; C205 gives the order.
* C204 Pareto (DEV.md 4c): six placement families (inventory, gas
  pressure, flow and ratio, temperature by utility, composition, constraints)
  and one method page (count the degrees of freedom).  It is the rulebook a
  generated P&ID needs to PROPOSE loops, but C204's sources (Luyben, Tyreus &
  Luyben 1998; Skogestad 2004) were "not read in the session" by its own text.

### 2d. Symbols and standards

| item | status |
|---|---|
| Our own drawings | 57 unit symbols (`unitFamily.ts:123`), datasheet schematics (`equipmentSchematic.ts`), own icons in the 3D layout (`gui/src/case/equipmentModel.ts`, located). Nothing copied from a standard: the symbol header comments record the design reasoning (the `unitFamily.ts` 40-70 comment about "drawing differences that are not hardware") |
| ISA 5.1 (instrument symbols and identification) | a published standard, sold, no open grant. Not in the tree (`grep` for `ISA 5`, `ISA-5`, `ISO 10628` over `docs/` finds no standard citation; `docs/design-heuristics.md:808` uses "P&ID" only as a word). Located, not read |
| ISO 10628 (flow diagrams for process plants), ISO 14617 (graphical symbols) | published standards, no open grant; located, not read |
| tag LETTERS as a convention (first letter = measured variable T/P/F/L/A..., following letters = function I/C/T/V/...) | a widely documented naming convention in textbooks; the letters are a FACT, not a drawing. The proposal: Choupo declares its OWN small vocabulary (the measured variable letters and the five function letters it needs), documented in `docs/ai/` as "an ISA-style convention, simplified, not the standard", cites the standard by title only, never reproduces its tables, and never claims conformity. Which exact letters to adopt is to be written from a textbook the curator has, not from memory |
| equipment tag form `XX-YZZ A/B` | already in use in the repository as the Turton PFD convention, read from the KFUPM course slides (DEV.md 4c C209: "A/B identifies parallel units or backup units not shown on a PFD"). That is a read source; it fits the C209 `repeat N` train letters |
| fittings K values and equivalent lengths | published tables (Crane TP-410, Perry's, textbook tables) are copyright-arranged compilations; the engine rule is the sizer's: the CASE declares the number with its source (`PipeHeaderSize.H` takes the nominal-size list from the case for exactly this reason: "ASME B36.10, DIN and ISO tables are no-grant standards"). A small set of K values for elbows and tees can be quoted from the primary papers (Hooper 1981, Darby) only after they are read; not read here |

What may be done without copying: draw our own symbols; use tag letters as a
convention; ask the case to declare every K, every nominal bore, every velocity
window with `source` and `reason` (the C98/C199 pattern: the engine computes,
the case cites).

## 3. What the earlier reports delivered (fourteen design reports, eighteen readable projects)

Counted from the four group files (`data/local/pif-reports/group*.md`, git
ignored) and the aggregate `docs/reviews/2026-11-02-pif-reports-synthesis.md`.
"Design report" means the 14 of 18 that reach process design.

| deliverable | in how many | how it was made |
|---|---|---|
| batch Gantt | 14 of 14 | Excel; synthesis table 1 |
| mass balance (per batch, tables) | the large majority; named per strength in group A (22-23 steps), tables in B, C, D | by hand, Excel |
| equipment list | 14 of 14, as a selection from vendor catalogues with a one-line capacity match; no sizing formula in all but a few (synthesis section 1; group C line 289 "weaker than it sounds") | brochures, one report cites alibaba/made-in-china URLs in its Gantt workbook (group A line 42) |
| PFD proper (flow diagram with a stream table) | not tallied by the readers; the group files record only 3 mentions: a numbered process diagram (group A, 1 report), a block diagram (group B, 2 reports with a flowchart in an appendix), and "no flowsheet of its own" (group C). Not one report names a PFD with stream numbers and a stream table | the readers did not search for it; count as "unknown, at most 3 of 14" |
| plant layout, drawn | 14 of 14 | AutoCAD, Visio, LucidChart, Floorplanner (group files); "drawn by hand in a drawing tool in every design report" (synthesis section 2) |
| P&ID | **0 of 14** | one report lists a CIP valve procedure with valve numbers V2, V6, V7... and gauges (group C line 95) |
| line list / piping | **0 of 14**; piping is a PERCENTAGE of equipment cost: 5, 10, 12.5, 30, 65 % across reports | Lang-type factors |
| instrument index | **0 of 14**; instrumentation = the QC equipment cost or a percentage (10-50 %, one 600 000 EUR lump) | factors |
| control narrative | 0 of 14 with loops; in-process-control sampling tables (IPC/PAT) in most; two with a PLC/BMS named (group D) | prose |
| utilities | water treatment sized in several, HVAC bought as a lump | see synthesis |

Reading.  What students are asked for and what Choupo already beats by hand:
the layout (engine draws and checks it, C75-C100) and the Gantt (engine
publishes it as data).  What nobody produced and what a plant-design course
normally requires: the P&ID, the line list, the instrument index and the
control narrative: the whole second half of this note.

## 4. The gap, deliverable by deliverable

Sizes are in general-days (one general = 30-120 minutes of work; a day = a
sitting of one general plus the commander's integration).  "Assembly" means
every datum exists; "NEW" means new physics or a new declaration grammar.

| # | deliverable | data that exists | missing | assembly vs NEW | size |
|---|---|---|---|---|---|
| i | **PFD as a PDF with a stream table, equipment tags, a utilities legend and a title block** | the canvas SVG (`flowsheetSvg.ts`), stream numbering, `streamTable.csv`, result per-stream state, utility stubs | an equipment TAG (none exists), a title block, a table drawn beside the figure, a legend of the utilities, A3/A4 paging, a sector-per-sheet split of a sectored plant, and a PDF (the print path or a bundled writer) | assembly (GUI + one declared tag rule); the PDF route is one decision (§6 Q2) | 2 |
| ii | **equipment list** | every sized item has a `design/` sheet with `unit, equipment, item, material, basis` and size keys; `equipmentTag` for 1:N; costs in `costs.csv` | the tag, a one-page table across kinds (name, kind, tag, key size, material, installed cost), a CSV and a printable sheet; an `EquipmentSizing::itemId()` already identifies it | assembly; the tag rule is the same one as (i) | 1 (rides with i) |
| iii | **line list: one sheet per routed pipe** (C207) | routed length, route points, F_mass, T, P, vf per routed stream; `pipeHeader` bore-by-velocity with a registered friction correlation; the `pipe` unit's Darcy-Weisbach plus K list; density/viscosity via the package | (1) 12 of 24 SWRO lines have no length (indoor), so a rule for an indoor length (declared by the case, or a stated estimate announced); (2) fittings: a declared K/equivalent-length list per line with sources, no shipped data; (3) a velocity rule: the C207 "economic diameter" is NEW (capital against pumping over life; needs a cited correlation; the safe first slice is the declared velocity window the header sizer already uses); (4) the static head from the route's z; (5) "the pump the line needs" = pressure deficit between the upstream available P and the drop + downstream P, listed as a recommended item and never added to the flowsheet; (6) pipe cost (the layout's open half) | assembly for length, velocity, friction, static head, pump deficit; **NEW**: fittings data and grammar, the economic diameter, indoor length rule, wall/class, cost | 4 (3 for the declared-window version; the economic diameter adds 2 later) |
| iv | **instrument index and loop declarations** | `controllers` binds cv/mv of a unit; PID/Schedule/Signal | the declaration of an instrument (variable letter, location on a stream or unit, range, type), a loop object that names its sensor, controller, final element and signal path, a tag, and a degrees-of-freedom check (C203 item 2). NOT a runtime change: for a steady plant the index can be declarative and drive the drawing alone | **NEW grammar** (a dict, a refusal set, a gate); no new physics | 3 |
| v | **P&ID as a PDF** | topology (connections), unit symbols, valves only as `valve`/`splitter` units, the layout's pipe routes, the instrument index (iv) | a drawing model for lines with line numbers, valves (block/control/check), instruments as bubbles with tags and signal lines, nozzles, vents and drains; an own auto-layout is NOT needed if it reuses the canvas positions; the pipe symbols, valve symbols and instrument bubbles are NEW own drawings | assembly of (i)+(iii)+(iv) plus **new drawing work** (own symbols) | 4 after iii and iv |
| vi | **control narrative** | the loops of (iv); the Pareto text of C204 | a generator that turns a loop into a sentence ("TIC-101 holds the outlet of E-101 at 350 K by the cooling-water valve; if it fails, the valve fails open...") plus the C204 exception text per family; fail-safe positions are a DECLARATION the case must make (the engine has none) | assembly + prose templates; the fail-position declaration is NEW | 2 |
| vii | **the `digitalTwin` folder** (C203) | the plant's `converged/` as seed (the `choupo-init0` style), `choupoCtrl`/`choupoBatch`, layout, sized items, the Control Room plot, the GUI as runner | (1) dynamic models per unit: only `dynamicCSTR`, `dynamicTank`, `quasiSteady` exist (C205 order: tank, variable-volume CSTR, flash drum, exchanger, RO train, column); (2) instrument dynamics (sensor lag, dead time, valve stroke and stem friction), NEW physics; (3) the operator panel bound to declared setpoints and disturbances; (4) the folder discipline `tutorials/digitalTwin/` with a refusal without a `layoutDict` and without instruments; (5) a twin case on a plant that has a layout and a sizing already (the green-ammonia plant or the SWRO case) | almost all NEW | 15-25, not a slice; its first deliverable is only the dynamic-model plan |

Dependencies (an arrow means "needs"):

```
(i) PFD pdf  ----->  tag rule  <-----  (ii) equipment list
(iii) line list  -->  routed pipes (exists), indoor length rule, fittings grammar, velocity window
(iv) instrument index --> tag rule + loop grammar
(v) P&ID  -->  (i) + (iii) + (iv) + valve/instrument symbols
(vi) narrative --> (iv) + fail-position declaration + C204 text
(vii) twin --> (iv) + C205 dynamic units + instrument dynamics + panel
```

Two cheap facts that change the plan.  First, the PDF is not a deliverable
of its own but a route: the repository already uses "HTML page + print to
PDF" for datasheets, and carrying a PDF writer would be the project's first
binary dependency in the GUI (CLAUDE.md section 10, "No external libs").
Second, the tag rule is the root of five of the seven items; deciding it first
(Q1) removes the most rework.

## 5. Proposed order of slices

Each slice: witness, gate, and the `docs/ai` entry that CLAUDE.md section 10
("a new capability reaches the AI agents in the same commit") requires.
Existing packs: `docs/ai/packs/{batch-plant,design-cost,layout,pressure,reactors,
recycles,separations}.md` and `docs/ai/brief.md`.

| slice | what it delivers | witness | gate | docs/ai entry | days | pharma value |
|---|---|---|---|---|---|---|
| **S1: tags + the equipment list** | an equipment TAG per sized item, from one declared rule (see Q1) and written into the design sheet and `costs.csv`; `reports/equipment/equipmentList.csv` and a printable sheet; train letters from C209 when it lands | `donepezil01_tablets` (13 sized units) and `swro01_campoDalias` (11 units, 102 sheets, 6 trains) | `check_equipment_list`: every sized item has exactly one unique tag; the list is the recount of `design/`; the tag is the same on every surface (golden `equipment` kind extended, not a second home) | `docs/ai/packs/design-cost.md` gains the tag key and the list | 1.5 | high: the tablet groups deliver a vendor list today; this gives the list their report cites, with sizes and costs |
| **S2: the PFD as a sheet and a PDF** | the canvas figure + stream table (from `streamTable`) + tags + utilities legend + title block (project, case, date, engine version, sheet n of N), one sheet per sector; delivered as an HTML page with a print stylesheet (A3 landscape, `@page`), "Print / Save as PDF" as the datasheets do; an SVG per sheet | `donepezil01_tablets` (`streamTable {}` declared there) then `swro01_campoDalias` (needs `streamTable {}` added to its controlDict: the stream table is opt-in, §2a) | a GUI test that the sheet holds one row per physical stream and the stream numbers equal `streamNumbering`; a source gate that no second stream table is computed in the GUI (the engine publishes, the GUI draws) | `brief.md` and `layout.md` pack: how to ask for the PFD; the "reports { streamTable {} }" line becomes default advice | 2.5 | high: no previous report had a PFD with a stream table |
| **S3: the line list, declared-window version** (C207 phase 1) | one `design/` item per ROUTED stream: length, bore (pipeHeader rule, per-line `velocity`/`nominalSizes` block), velocity, Re, friction drop by the declared correlation, K-sum drop from a DECLARED fittings list, static head from the route z, total drop, and the PRESSURE DEFICIT; a `pump the line needs` row only when the deficit is positive (listed, never added); `lineList.csv` and a sheet; indoor lines without a length are listed as such with the reason (the layout already says why), not given an invented one | `swro01_campoDalias` (9 routed, 15 not; the indoor 12 need Q3), plus a small new witness with fittings declared | `check_line_list` recomputes drop and deficit from the case's dicts and the routed length; a refusal for a missing K source; the not-routed lines must be listed, not dropped | `docs/ai/packs/layout.md` + `pressure.md` | 3-4 | medium: the pharma groups have short liquid lines, but the water loops (purified water, WFI) are exactly what they size by percentage |
| **S4: instruments and loops, declarative** | `system/instrumentDict`: instruments (variable letter, function letters, on a stream or unit, range, units) and loops (sensor, controller, final element, action, fail position); degrees-of-freedom check; an instrument index sheet; no run-time change | a steady plant with five declared loops: the SWRO case (pressure, flow, level, conductivity) | `check_instrument_index`: every loop names existing ports, no two controllers on one valve, DoF consistent; the refusals fire | new pack `docs/ai/packs/control.md` | 3 | medium: groups name PLC/BMS and PAT; none declares a loop |
| **S5: the P&ID sheet** | S2's figure + valves on lines (S3), instrument bubbles and signal lines (S4), line numbers; own symbols; the same sheet/PDF route | the SWRO case | gate: every line of the line list appears once; every instrument of the index appears once; the line numbers equal the list's | `brief.md` + pack `control.md` | 4 | the deliverable no report had |
| **S6: the control narrative** | text generated from the loops with the C204 exception per family | as S4 | gate: sentences are generated from, and recount, the loops | pack `control.md` | 2 | medium |
| **S7: the economic diameter and pipe cost** | NEW physics; a cited correlation or the declared window stays | later | recompute gate | | 2-3 | low for the class |
| **S8: the digital twin** | C203 | | | | 15-25 | later |

Order rationale.  S1 first because it is the root of five items and the
cheapest; S2 second because the tablet groups get a PFD and a stream table
with no new physics; S3 is where the new decisions begin (fittings data,
velocity rule). S4/S5 give the P&ID, which is the deliverable no report had
but costs 7 days plus the symbols; S3's output (the line numbers) and S4's
(the tags) are its inputs, so it cannot move earlier. S1+S2+S3 = about
7 general-days; S1-S6 about 16.

Parallelism under the laptop budget (CLAUDE.md section 0.4: at most seven
generals): S1 and S2 touch different homes and run together after Q1; S3 and
S4 are independent of each other and each needs one engine home and one GUI
sheet, so run them after S1 to reuse the tag; S5 waits for both.

## 6. Questions for Vítor (pedagogical scope), with a recommended answer each

| # | question | recommended answer and reason |
|---|---|---|
| Q1 | Equipment tags: are they AUTO-GENERATED from a rule by default (kind letter + sector number + train suffix, e.g. `P-101A`) or DECLARED by the case, or both? | Both, with the generated tag the default and a declared `tag` winning, announced. Reason: students must be able to call an item the same thing in the PFD, the list, the P&ID and the cost table; the rule is a convention, so it is ours (the Turton `XX-YZZ A/B` form, already recorded in C209) and the letters per kind are a small table written by us |
| Q2 | PDF: print-to-PDF from a generated HTML page (the existing datasheet route), or a PDF writer in the GUI? | The print route. Reason: no dependency (CLAUDE.md section 10), already used and tested for datasheets, A3 `@page` is enough; revisit only if a student cannot print to PDF |
| Q3 | A line with both ends indoors has no length (12 of 24 on the flagship): estimate, require a declaration, or leave unlisted? | Require the case to declare an indoor length (or a bounding rule) with source, otherwise list the line as "length not declared" and compute only what needs no length (bore, velocity, per-metre drop). Reason: never invent a number the plan does not hold (the no-silent-crutch rule) |
| Q4 | Fittings: do we ship a small K table (elbow, tee, gate, globe, check) with primary citations, or only let the case declare K? | Case-declared first (as `Pipe.H` already works); a shipped table only after the primary sources are READ by the curator (Hooper or Darby, not the aggregators). Reason: licence and the "visible gap beats invisible falsehood" rule |
| Q5 | The "optimal velocity" of C207: a cited economic-diameter correlation now, or the declared velocity window of C199 only? | The declared window only in S3; the economic diameter is S7, after the line list works. Reason: the correlation is NEW physics with constants nobody here has read |
| Q6 | Instrument vocabulary: adopt the ISA letters as a convention, our own table, or both? | A small table of our own in an ISA-like form (measured variable letters T, P, F, L, A, and function letters I, C, T, V, S), documented as "convention, not the standard", citing the standard by title only. Reason: the standard is a purchased text we have not read; letters as a naming convention are common knowledge |
| Q7 | The P&ID for a plant that has NO control in the engine (all steady cases): drawn from a declared `instrumentDict` alone, with no run-time effect? | Yes. Reason: the document set is a deliverable; a loop that does not run in a steady plant is documentation of intent, and the twin (S8) makes it run. Say so in the sheet footer so nothing looks computed that is not |
| Q8 | Should the control narrative PROPOSE loops from the C204 Pareto (a generated first draft the student edits), or only describe loops the student declared? | Describe only in S6; a proposal tool is a later EduTool. Reason: C204's sources were not read in session; generating loops from unread rules would make the engine the author of a design decision |
| Q9 | Stream table on the PFD: always the engine's `streamTable`, with `reports { streamTable {} }` turned on by default for plant cases? | Yes. Reason: the SWRO flagship publishes none today; a PFD without a stream table is the deficiency the reports show |
| Q10 | Where do the generated documents live: `reports/documents/` of the case (regenerated whole, git-ignored like `design/`) or the GUI only? | `reports/documents/` for CSV and the data; the PDF is made by the GUI from the same data. Reason: one engine home for the numbers, the GUI draws (the 2026-09-05 first-law rule) |

## 8. Decisions (the architect, 2026-11-03, rule 00; Vitor may reverse any)

The ten questions of §6 are architecture and are decided here, each by its
recommended answer, with ONE change:

* Q1 both: the generated tag (Turton's `XX-YZZ A/B`) is the default and a
  declared `tag` wins, announced.  Q2 the print route.  Q3 an indoor line's
  length is DECLARED or the line is listed "length not declared" with what
  needs no length computed.  Q4 K values declared by the case; a shipped table
  only after its primaries are read.  Q5 the declared velocity window in S3;
  the economic diameter is S7.  Q6 our own ISA-like letter table, called a
  convention, the standard cited by title only.  Q7 yes, with the footer
  saying the loops do not run.  Q8 describe declared loops only.  Q10
  `reports/documents/` for the data; the GUI makes the PDF from it.
* Q9 CHANGED: the stream table is turned on in the WITNESS cases by
  declaration (`reports { streamTable {} }`); making it the default for every
  plant case is not decided until what it moves in the published results is
  measured (a default that changes output is a corpus change).

* S2 AMENDED the same night (Vitor: "No report o pdf do PFD devia ser gerado
  ... em formato A3, ou mesmo A1 para poderem aparecer uma tabela com as
  correntes todas"): the PFD PDF is a REPORT, listed in the app's Reports
  workspace beside the datasheets (the canvas export stays as a second way
  in); the PAGE SIZE follows the content, as an industrial PFD does: A3
  landscape at least, stepping to A2 and A1 when the stream table does not fit
  at a printed text height of 2.5 mm; beyond A1 the table continues on a
  following sheet with the same title block; never shrunk below legibility; a
  student may force a size.  The engine publishes the data; the GUI lays the
  sheet out and prints it (the flowsheet's layout lives in the GUI).

* S5 AMENDED (Vitor, 2026-11-03: "quando se faz o P&ID em modo de controlo,
  tambem devia de aparecer o pdf do P&ID no tamanho A adequado"): the P&ID PDF
  is a report under the SAME size rule as the PFD (A3 to A1 by content, sheets
  continued past A1).  Later, with S5.
* THE CONTROL PANEL (Vitor, same message: "criar o painel de controlo ...
  usar a ideologia de John Gall, de modo a garantir que o painel e simples,
  facil de entender e que ha minimizacao da complexidade de controlo"): the
  digital twin's operator panel follows Gall's law (Systemantics, 1975: a
  complex system that works has evolved from a simple system that worked; one
  designed complex from scratch does not work) -- it starts with the C204
  Pareto loops only (inventory, pressure, flow, temperature) and only the
  DECLARED loops, one screen per sector, an alarm only where an action exists,
  and each element added only after the simpler panel works.  Later, with the
  digital twin (S8, C203).

Order: S1 and S2 now, on branches (they touch different homes); S3 and S4
after S1; S5 after S3 and S4; S6; S7; S8 is the digital twin (C203).

## 7. What this note does not claim

* No file, key or number above was changed or added; the line list is a
  proposal, not a feature.
* The count of PFDs in the earlier reports is a floor read from the group
  files, not a recount of the PDFs.
* The ISA 5.1, ISO 10628, ISO 14617 and Crane TP-410 documents are
  LOCATED only; nothing in them was read for this note.
* The size estimates assume the existing `design/` sheet and canvas export
  code is reused; a first-principles P&ID layout (not reusing the canvas
  positions) would be larger and is not proposed.
* The `pipe` unit's `.cpp` (643 lines) and `RatedMachineSize.cpp` were not
  read line by line; their behaviour is taken from their headers.
