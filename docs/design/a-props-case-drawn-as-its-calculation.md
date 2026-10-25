# A props case drawn as its calculation: a tree, a map, the details of what is selected

DEV.md 4c C151, phase 1 (2026-10-25).  Vítor, reviewing C147's review screen:
a "Plots" menu beside plots already on the main screen confuses; "os
dicionários do caso são muito importantes para consulta"; "não há nenhuma tree
para nos guiarmos?  Fica tudo ao molho?  E baralhas termodinâmica, cinética
química, transporte em membranas?"; "No flowsheet ... F1 e vamos ter a página
exata da explicação da operação unitária.  Aqui o help é uma confusão
monumental ... podia haver um data set com uma seta para um bloco de modelo de
transporte e aí com um F1 chegávamos à página da teoria"; "Temos de ir por
tentativa e erro.  Avança."  This is the first prototype he tests.

## 0. The task the screen answers (CLAUDE.md §10, 2026-10-25)

*An engineer arrives with a laboratory dataset and a case an assistant wrote
around it; he needs to see what data he has, which model the case applies to
it, what each operation concluded and how well it agrees with his data, the
figures that show it, the lines of the propsDict that asked for it, and where
the theory is.*  The screen answers in that order: the tree (what he has,
shelved by discipline), the map (which model applies to which data and feeds
which figure), the details below it (verdict, agreement, numbers, figures),
the Case link (the lines), F1 (the theory).  The audit -- every raw number
the engine publishes -- stays one fold below, never the answer.

## 1. What was measured before anything was built

* 46 props operation types are registered (`src/propertyOps/PropertyOperation.cpp`
  `registerBuiltins`), each with a schema in `gui/schemas/operations/`; none
  declared what it is ABOUT (a discipline) or what it DOES (an activity).
* `tutorials/props/` folders mix discipline (thermo, kinetics, membrane,
  transport) with activity (fit, estimate, compare, scan, curation).
* In a props case the "Plots" entry of the menu drew the same PropsView a
  second time (`AppShell.tsx`'s props branch has no `plots` arm): the
  confusion Vítor named was a duplicate, not a second view.
* F1 in a props case with no workspace open opened TWO tabs: AppShell's
  handler and PropsView's both answered (fixed here, `AppShell.tsx`).
* An op type with no `OP_DEST` entry sent F1 to the Props Guide's COVER;
  `OP_DEST` and `PROPS_MODEL_DEST` (`gui/src/case/modelDocs.ts`) were outside
  `check_guide_anchors`.

## 2. The decision, in one sentence

A props case's Results is THREE panes -- a tree of the case, a calculation map
derived from the propsDict, and the details of whatever is selected in either
(the overview when nothing is) -- and every op type states, in its own schema,
the discipline, activity, models, data and records the map and the tree are
derived from.

## 3. One home for what an op type is (`"x-choupo"` in its schema)

Each props op schema carries one annotation block (a JSON-Schema validator
ignores an `x-` keyword, so the grammar the schema states is unchanged):

```json
"x-choupo": {
  "discipline": "Separation", "activity": "evaluate",
  "models": [ { "key": "transport", "role": "transport law" },
              { "key": "transportParameters.activity", "role": "activity" } ],
  "data":   [ { "key": "membrane", "kind": "record", "label": "membrane record",
                "file": "constant/assets/{}.dat" } ],
  "writes": [ ... ]
}
```

* `discipline` is one of Thermodynamics · Transport · Kinetics · Separation ·
  Data · Safety; `activity` one of evaluate · scan · fit · estimate · compare ·
  curate.  `disciplineBy` / `activityBy` let a key decide (`fitParameters`
  with `residual.kind isotherm` is an adsorption fit; `mode evaluate` scores
  rather than fits); `package` / `packageUnless` say when the op reads the
  case's thermo package.
* Models are KEYS of the op (`transport`, `massTransfer.model`), or a model the
  op IS (`fixed`: a Pitzer bench is Pitzer).  The first one the op declares is
  its LAW; the others are the choices inside it.
* Data are keys naming measured data, another source's numbers, a record (with
  where the case keeps it), or numbers written inline; `writes` names the
  record an op proposes.
* NO op today is Safety; the shelf exists in the vocabulary and the tree shows
  only shelves that hold an op.
* Reader: `operationMapMeta` in `gui/src/case/operationSchemas.ts`.  Held by
  `gui/tests/propsMap.test.ts`: every op in the C++ registry has the block,
  and no flowsheet unit does.
* The block was written once by a one-shot editor (kept out of the tree); the
  schema file is the op's entry from now on.

## 4. The layout, and where it comes from

Two pieces of established practice, chosen over inventing a third:

* **ParaView's pipeline browser** ("Displaying data", ParaView User's Guide):
  the pipeline is a TREE on the left, and the panels below it follow the
  SELECTED object -- its properties, its information, its views.  A props case
  is a pipeline of data -> models -> operations -> views; the tree is that
  pipeline and the details panel follows the selection.
* **"Overview first, zoom and filter, then details on demand"** (B.
  Shneiderman, "The Eyes Have It: A Task by Data Type Taxonomy for Information
  Visualizations", IEEE Symposium on Visual Languages, 1996): with nothing
  selected the details pane IS the overview -- the verdict strip and every
  view; selecting narrows it to one object; F1 is the detail on demand.

So, in `gui/src/ui/ReviewScreen.tsx`:

| pane | what | source |
|---|---|---|
| left | the case tree: Overview · Data · Models · Operations by discipline (each op with its views as children) · Views across the case · Records produced · My plots | `caseTree`, `PropsTree.tsx` |
| centre | the calculation map, read-only | `derivePropsMap`, `PropsMap.tsx` |
| below | the details of the selection, or the overview | `PropsDetails.tsx` |

One selection drives all three: a click on a block or one of its rows, on a
tree node, or on an operation's name in the verdict strip selects the same
object everywhere (the ids are the map's member ids).  The map sits ABOVE the
details rather than in a tab of its own, so a figure is one click from the
block that produced it and the tree can light both at once.

The shape is chosen so the Process (flowsheet) mode can adopt it later (C152:
a case may carry both a propsDict and a flowsheetDict): tree, canvas, details
are three components with a selection id between them, and nothing in them
knows that the canvas is a props map.

## 5. The map

**Four kinds of block, left to right** -- DATA, MODELS, OPERATIONS, VIEWS --
in four columns: the layout is a layered one by construction, so it is
computed (`derivePropsMap`), never hand-placed and never stored, and needs no
graph-layout library (no new dependency).

**Typed, coloured, and never colour alone** (the node-editor practice of
ComfyUI and KNIME: each data type its colour, ports and wires sharing it).
Each block kind has its own colour, corner (data square with a thick left
edge, models rounded, operations a heavier border, views a double outline),
icon and word; each wire kind (measured data, reference numbers, records,
model, results, proposed record) its own colour AND dash, with a legend on
the canvas.

**Grouped to avoid spaghetti** (KNIME's metanodes and annotations; "visual
programming does not scale" is the known failure of node editors).  Within a
study, the ops of one type are ONE block listing them ("10 × poreTransport");
the data of one kind, the views, the models of one law likewise.  Every row is
selectable, and a group can be drawn member by member (the expand control).

**Studies as labelled frames.**  Ops, views, references and data files that
refer to each other in the propsDict form a connected component; a component
holding a declared view is a STUDY, drawn in its own frame.  Records, models
and the package are shared resources and do not join studies -- one membrane
record read by two parts of a paper would otherwise weld them -- so each sits
in its first consumer's frame and its wires cross frames.  NanoFiltran's three
parts (code-to-code, Bowen & Mohammad's measurements, the stiff case) fall out
as three frames with no label in the dict saying so.  The frame's label is
derived ("Study 2 · 10 poreTransport ops → 4 views"); a hand-written label per
study would need a new propsDict key, not taken in phase 1.

**Small by default.**  People struggle to read node-link diagrams beyond
roughly fifty nodes (V. Yoghourdjian et al., "Scalability of network
visualisation from a cognitive load perspective", arXiv 2008.07944); the
target is fifteen or fewer blocks by default.  Measured: NanoFiltran (22 ops,
12 views, 7 references, 3 membrane records, 8 model choices) draws in
thirteen blocks; isotherm02 in five; polarisation01 in four.  A minimap
appears only where the fitted map would be drawn below 0.7 zoom.

**Each block says what it does.**  An operation block carries its type's
first schema sentence, its activity and the verdicts its ops published; a
model block its role and its choices; a data block its citation or its file.
Badges are counts and the engine's words; the map computes no number.

**F1, a double click or the block's "?"** opens what it is about: a model its
theory section (`PROPS_MODEL_DEST`: DSPM-DE at `ch:dspmde`, the hindrance at
`eq:dspmde-H`, the pore solver at `eq:dspmde-sg`, the stirred cell at
`eq:film`, ...), an operation its section (`OP_DEST`, else its own entry of
the Props Guide's operations reference, `op:<type>`, now labelled by
`bin/curate/props_ops_reference.py`), a view its figure (selected in the
details pane), a dataset or record its file in the Case tab.

## 6. The menu and the Case tab

* A props case's tabs: File · Results · Log · Case · Literature · Help.  The
  `Props` entry keeps its identity and is CAPTIONED Results there
  (`WorkspaceEntry.caption`); `Plots` leaves props cases.  Flowsheet cases are
  unchanged.
* Every op row of the verdict strip, every declared view and every selected
  object links to its block in `system/propsDict`: the Case tab opens on the
  file with those lines marked (`store.openCaseAt`, `propsDictLocate.ts`, which
  reads the file with the dict's own tokenizer so a `name` inside a comment is
  never taken for the entry's).
* Ad-hoc plotting is "+ New plot" under My plots in the tree (any CSV the run
  wrote, remembered per case in this browser only); the free CSV auto-plots
  are also one collapsed "Other plots" section of the overview.  One home for
  every figure of a props case.

## 6b. One case, two modes (C152's GUI half)

A case carrying BOTH `system/flowsheetDict` and `system/propsDict` runs in
either mode (C152, `docs/design/one-case-two-modes.md` on that branch).  The
GUI reads the rule `bin/curate/case_manifest.py` writes into
`generated/caseManifest.json` -- both dicts, both modes; Properties & data by
default only where `application` is choupoProps -- off the case files it has
already loaded (`gui/src/case/caseModes.ts`), the same fact by the same rule.

* A **mode switch** (Process | Properties & data) sits in the menu row of a
  two-mode case only; Properties & data IS the props-case screen above, and
  Process drops the `Props` view, so there is one door to each.
  `state/useCaseMode.ts` is the one home every surface asks.
* On the map, a `fitParameters` op that writes `output.record` draws the
  chain DATA -> the fit -> the RECORD it writes -> the flowsheet UNIT whose
  `operation.membrane` names it (a fifth column, PROCESS); F1 on the unit
  switches to Process and selects it.
* In Process, a unit whose membrane record carries a `fit {}` block says which
  operation fitted it and opens that operation in Properties & data -- read
  off the record itself, so it holds before any run.
* A Process run that refuses a STALE fit shows the engine's sentence and its
  remedy as a button over the canvas (`StaleFitBanner`) that
  switches to Properties & data.

## 6c. The split the reader drags (DEV.md 4c C153)

Vítor, on NanoFiltran the day phase 1 landed: "Ficou agora mesmo fixe e
intuitivo!! ... o painel que fica por baixo não é ajustável.  Será que pode
ficar noutro menu de 'Plots'?  Aqui ainda estou na dúvida."  Measured: the map
had a height computed from the laid-out map (`min(560, max(300, 90 + 0.62 x
its height))`) and no handle, so on a large map the details of a selection
began below the fold and a click on a block looked like nothing.

* **The map is a TOP panel of the panel contract** (`PROPS_MAP_PANEL`,
  `ui/panelContract.tsx`; its keys `PANELS.propsMap` in `state/prefs.ts`), the
  same seam the Streams workspace's balances band has: drag it, arrow keys on
  it, double-click or Enter to reset.  Its size is a READER PREFERENCE, kept
  across cases and tabs.  Until the reader drags it, the map keeps C151's
  computed height (`autoMapPx`, `ui/propsSplit.ts`), so nothing moved for a
  reader who never touches it, and a reset returns to that computed height
  rather than to a fixed number (`hasPanelSize` / `forgetPanelSize`).
* **The details pane keeps its header row** (Overview / Details, "← overview",
  the selection's block in the propsDict) however far the map is dragged, so a
  pane dragged down to nothing still says what it would show.
* **"Figures full height"** is one button in the map's header: it folds the
  map (the contract's fold, remembered) and gives the details and figures the
  whole height; "Show the map" brings it back at the size it had.
* **A selection opens a pane too short to show it.**  When something is
  selected (on the map, the tree or the verdict strip) while the details pane
  is shorter than a usable height (260 px, half the split on a short screen),
  the map's DRAWN height is capped so the pane opens to it.  Render-only: the
  reader's stored size is not touched, the cap is dropped the moment he drags
  or resets, and a pane he made larger is never shrunk (`openDetailsCap`).
* **No Plots menu.**  C151 removed the second door to a props case's figures
  on purpose (Vítor's own complaint: a Plots menu beside plots already on the
  main screen confuses), and the split answers the complaint underneath it:
  the figures can now have the screen.  If he still wants a separate Plots
  entry for a props case after using the split, it is one switch -- `Plots`
  back in the props branch of `allowedWorkspaceLabels` (`ui/workspaces.ts`),
  with the props branch of `AppShell.tsx` drawing it from the same one home
  the Results screen reads (`postProcessing.ts`'s views), never a second
  computation.
* **The floating selection card was NOT built.**  C153 first proposed the
  flowsheet's card on the props map; Vítor, looking again, found that a click
  already shows its summary in the details pane and that a resizable pane
  "already solves a lot", so the card was dropped before it was written.

## 6d. An external reviewer's walk (DEV.md 4c C154)

A reviewer walked NanoFiltran on the live site -- About, run, Fig. 3, the op
that feeds it, the dictionary, F1 on a parameter, the CSV -- and judged that
the case is auditable but its first use needs too much of Choupo's insides.
What changed, each from a declaration or a published fact, none computed:

* **About this case** shows the case's own introduction: its `README.md`
  (rendered as a lesson) where it carries one, else the first comment of its
  propsDict that is NOT the Choupo banner (the dialog had shown the banner,
  because it took the first comment).  The studies the propsDict declares
  are listed as doors.
* **Studies are declared, not inferred** (`studies ( ... )`, the views
  grammar's record §4): the map's frames carry their titles, the tree lists
  them first, the Overview reads them in the case's order -- each with its
  purpose, its operations, its figures and tables -- and every operation's
  row says the purpose of its study.
* **Run status apart from the status of the evidence**
  (`case/reviewScreen.ts`): `run` (done / failed / no result / not run, the
  op's own `rc` published by the engine when non-zero) and `evidence` (the
  op's curation verdict, else "no acceptance test in this run"); an AAD an op
  type cannot publish (its declared activity fits and compares nothing) reads
  "not applicable".
* **Every block shows its state** (`case/propsMapState.ts`): run, failed, not
  run or stale -- a word in ink AND colour, named in the legend.  Stale is
  claimed per block only when every changed part of the case is one a block
  reads (its propsDict block, the files it names; `case/staleness.ts`'s
  per-part fingerprints) and travels downstream along the wires; otherwise
  the map says once "case changed since the run".
* **A poreTransport op shows its scientific table first** -- per J_v point
  and ion, J_v, c_bulk, c_wall, c_perm, R_obs, R_real with the op's units
  (the engine publishes `Jv_p<p>` and each diagnostic's unit now) -- shaped
  by its schema's `x-choupo.pointTable`, the raw diagnostics folded after it.
* **Figures**: a lone figure takes the pane's width, "Enlarge" opens it at
  the window's size, the case's `note` sits under the title, and the CSV
  export carries a `#` header (title, note, axes and series with units,
  sources, the cited references).
* **The selection and the expanded blocks survive a trip to another tab**
  (the store keeps them per case), and a new selection is read from its top.
* **F1 on a key in the Case tab** (`case/keyHelp.ts`): click a line, F1, and
  a card gives the key's meaning, unit and model from the schema that
  documents it -- an operation's or unit's, a record's by its `kind`
  (`gui/schemas/records/membrane.schema.json`), the controlDict's -- or the
  block's help with that scope said, never a guess.  The Outline names the
  propsDict's studies, operations, views and references.
* **The Log** lists a props log's OPERATIONS and groups its repeated `[tag]`
  announcements with a count.

Not done, said plainly: marking a record key the run did not READ (A_w at an
imposed J_v) as inactive -- the engine says so only in a log sentence, and a
mark parsed from prose would be the GUI inferring; the F1 card says it from
the record schema instead.  The thermoPhysPropDict's v2 grammar has no schema
in the GUI, so F1 there answers for the file.

## 7. Gates and tests

* `gui/tests/propsMap.test.ts`: the registry coverage of `x-choupo`; the
  locator; the maps of NanoFiltran, isotherm02, polarisation01 and
  estimate_acetone; F1 per block kind; the tree.
* `gui/tests/workspaceKinds.test.ts`: Plots absent on a props case, present on
  flowsheet cases; the Results caption.
* `gui/tests/caseModes.test.ts`: the GUI's mode rule against
  `generated/caseManifest.json` over every case; membrane24's datasets ->
  fit -> record -> Stage; the record naming its fit; ctrl17; the stale-fit
  refusal read off a log.
* `gui/tests/propsSplit.test.ts` (C153): the computed default is C151's; the
  map dragged to its maximum leaves the details' header row; a selection opens
  a pane dragged to nothing and never shrinks one the reader made large; the
  cap is render-only (a source arm: the effect that opens the pane never saves
  a size).  `gui/tests/panelContract.test.ts` holds the new panel to the three
  questions every docked panel answers.
* `gui/tests/c154PropsWalk.test.ts` (C154): the declared studies and the
  purpose vocabulary held to the engine's list; the story that is not the
  banner; run status apart from evidence; F1 on poreRadius, A_w, an op's
  J_v, an undocumented key and a schemaless file; the point table; the
  block states (stale attributed or said once); the CSV header; the log's
  operations and grouped announcements.
* `bin/curate/check_guide_anchors.py` now holds `OP_DEST`, `PROPS_MODEL_DEST`
  and the `op:<type>` fallback for every props op, beside the two tables it
  held.

## 8. Not done, said plainly

* Phase 2 (folders of `tutorials/props/` by discipline) waits on Vítor's look
  at phase 1.
* `bin/curate/props_ops_reference.py` keeps its own editorial GROUPS for the
  Props Guide; with the discipline now declared per op they could be derived
  -- a guide restructure, not taken here.
* No EduTool is linked from an op block: the EduTools registry names no props
  op type today.  The block's door would be one more field of `x-choupo`.
* A study's frame label is derived, not authored.
* "My plots" lives in the browser (localStorage), not in the case: a plot a
  reader wants the case to carry is a view in the propsDict.
* In a two-mode case the Properties & data run is the props view's own
  (as it was for a flowsheet case carrying a propsDict); the top bar's Run
  still runs `application`.  One run control per mode is the next step.
* ctrl17's props ops read `trajectory.csv`, a file its OWN Process run writes;
  the map draws it as a dataset "not in this case's files" -- a wire from the
  Process run to that dataset would say what it is.
* The mode rule is held to `generated/caseManifest.json` over every case, but
  no case in the corpus defaults to Properties & data, so only the fixture
  test holds that half.
