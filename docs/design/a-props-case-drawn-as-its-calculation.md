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

## 7. Gates and tests

* `gui/tests/propsMap.test.ts`: the registry coverage of `x-choupo`; the
  locator; the maps of NanoFiltran, isotherm02, polarisation01 and
  estimate_acetone; F1 per block kind; the tree.
* `gui/tests/workspaceKinds.test.ts`: Plots absent on a props case, present on
  flowsheet cases; the Results caption.
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
