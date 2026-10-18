# A plant layout is declared, checked and drafted

**Kind:** ADR · **Status:** SHIPPED 2026-10-17 (slice 1 of commission C75,
on stated defaults) · **Gate:** `check_plant_layout` · **Witness:**
`tutorials/plant/ammonia02_full_plant`

## 1. What was asked

Vítor, 2026-10-17, after a student of his had an assistant draw her
flowsheet's plant in 3D: *"Podes fazer um EduTool com isso, criar esse
dicionario e criar uma tool para gerar o layout 3D?"*  The commander's
reading, put to him first: the 3D picture is the easy half; what a student
learns is PLACEMENT -- separation distances, access, flow order, sectors as
areas -- and later what it costs (pipe lengths).  The same day he added the
prevailing wind and the hazardous-area (ATEX) zones: *"acrescenta o vento
dominante e as zonas ATEX"*.  Slice 1 is the dictionary, the engine check,
the draft tool and the GUI view; slice 2 is the EduTool lesson, on the
outline he approved the same day (§10).

## 2. The grammar -- `system/layoutDict`

Optional.  Absent, no line of any output changes (measured: the 20 cases with
a sizing pass and the 73 `FASTSET` cases, console, stderr and every design
sheet, byte-identical against a build of the parent commit).

```
items
(
    { item "converter"; x 40 m; y -6 m; z 0 m; orientation vertical; }
    { item "makeupComp"; x 6 m; y -8 m; z 0 m; orientation alongX;
      footprint { length 8 m; width 4 m; height 4 m; }      // no size of its own
      release { source "..."; reason "...";
                zones ( { zone 2; radius 7.5 m; height 6 m; } ); } }
    { nonProcess "controlRoom"; kind building; x -30 m; y -40 m; z 0 m;
      orientation alongX; footprint { length 15 m; width 10 m; height 4 m; }
      ignition "non-hazardous-area electrical equipment and people"; }
);
areas { REACTION { xMin 0 m; xMax 40 m; yMin -10 m; yMax 10 m; } }   // sectored cases
separation
(
    { source "..."; reason "..."; measure edgeToEdge;
      distances ( { between ( vessel compressor ); distance 9 m; } ); }
);
wind { from 225 deg; planNorth 0 deg; halfAngle 30 deg; reach 60 m;
       source "..."; reason "..."; }
```

* **Identity is `EquipmentSizing::itemId()`** -- the design sheet's own id
  (`converter`, `column09/shell`, `DRYING.SD`); nothing splits it.
* `(x, y)` is the item's plan CENTRE, `z` its BASE elevation; plan `+y` is
  the plan's north.  A list cannot carry a unit in this grammar, so every
  length is its own `keyword value unit;`.
* `orientation` is one of `vertical`, `alongX`, `alongY` -- a cylinder's axis
  or a box's length.  Rotation by an arbitrary angle is not in this slice.
* `kind` is the design sheet's `equipment` word for a sized item and is
  REFUSED if written there (one home); a `nonProcess` item declares its own.
* An ANGLE must carry its unit (`deg`, added to `core/Units.cpp` and its GUI
  mirror as the degree of arc in radians).  The grammar's raw form is SI, and
  for an angle that is the radian, so `from 225;` would silently read as
  225 rad; it is refused instead.
* `measure` is required -- `edgeToEdge` or `centreToCentre` -- because a
  distance table means one or the other and the reader must not guess which.
* Every `separation` table, every `release` and the `wind` carry a `source`
  and a `reason`.  An `ignition` carries its reason as its value.

## 3. The footprint rule -- the item's own, or declared

| what the sizer published | footprint |
|---|---|
| `D` and `H` (vessel, stirred tank, column shell and drum, catalyst-bed shell, converter shell) | cylinder of diameter `D`, length `H` |
| `shellID` and `tubeLength`, one shell (a DESIGNED shell-and-tube) | cylinder of diameter `shellID`, length `tubeLength` |
| `chamberDiameter` and `chamberHeight` (spray dryer) | cylinder |
| anything else (a compressor's power, an evaporator's or a rated exchanger's area, a cyclone's body diameter alone, a storage tank's volume, a crystalliser's magma volume, a shell-and-tube of several shells) | **no size is invented**: the case declares `footprint { length; width; height; }`, a box |

The rule is keyed on the PAIR OF KEYS a sizer published, never on its kind
word, so a new sizer that publishes `D` and `H` is placed without this code
changing.  A footprint declared on an item that publishes its own size is
REFUSED: one item, one size.  A `nonProcess` item always declares a box.

Never placed on their own, and refused by name if named: `sieveTrays`
(inside the column shell), `catalystCharge` (inside the bed), `reliefValve`
(mounted on the item it protects), and every member a converter shell lists
in its `encloses` (a basket inside that shell).

## 4. What the engine does with it

Run after the sizing pass, on the direct path and on an outer driver's
representative pass (`postProcessing/layout/PlantLayout.{H,cpp}`, called from
`choupoSolve/main.cpp`).

**REFUSED** (exit 2, by name, with the remedy): a layoutDict on a run that
sized nothing; an entry that is neither or both of `item`/`nonProcess`; an
item naming no sized item (the refusal lists the placeable ones) -- unless
it is an item of a sizing entry whose sizer REFUSED, which is announced
instead (below); an item placed twice; an internal; two footprints that overlap ON THE PLAN AND IN
HEIGHT (stacking is not refused: two items whose height ranges do not meet
do not collide); an area for a sector the case does not have, or areas on a
flat case; a pair of kinds whose distance is declared twice; and every
malformed declaration (a missing length, an angle with no unit, a zone that
is not 0/1/2, a non-positive size).

**ANNOUNCED** (stderr at its site + `AdvisoryLog` category `layout`, so it
reaches the end-of-run caveat block under PLANT LAYOUT and the result JSON):

* a pair closer than its declared separation -- both distances;
* an item whose footprint is not inside its sector's declared area;
* an ignition source inside a declared ZONE ENVELOPE -- a vertical cylinder
  about the release item's plan centre, of the declared radius, from the
  item's base to the declared height above it; inside means the ignition
  item's footprint comes within the radius of that axis AND its height range
  meets the envelope's.  The distance from the axis and the radius are both
  named;
* an ignition source DOWNWIND of a release source -- the true bearing from
  the release item's centre to the ignition item's (plan bearing +
  `planNorth`) lies within `halfAngle` of the downwind direction (`from` +
  180 deg) and the centre distance is within `reach`; every number in that
  rule is declared;
* a separation rule naming a kind no placed item carries (it checks nothing);
* the sized items left unplaced;
* an item the layout places whose SIZER REFUSED (finding `sizingRefused`,
  quoting the sizer's own FAILED line): the item is left UNPLACED and the
  run goes on.  Changed 2026-10-17 (DEV.md 4c C79, the commander's
  decision): until then such an item was "an item naming no sized item" and
  the plot plan refused the whole run, so one sizer's failure -- already
  printed, counted and replayed by the sizing pass -- became a missing run,
  and `check_design_sheet`'s probes had to delete the layoutDict to test a
  sizer refusal at all.  A refused sizer is already its own reported
  failure; a plot plan must not turn one missing sheet into a missing run.
  An item whose id belongs to NO sizing entry still refuses -- that is a
  typo, not a failure somebody else reported.  The id is matched to the
  refused entry by `EquipmentSizing::isItemOf`, the inverse of `itemId()`
  kept beside it.  The item's declared footprint and hazards are not read
  (there is no size to check them against).

**Announce, not refuse, for every shortfall -- the argued default.**  An
overlap is not a layout at all; a short distance IS a layout, a draft whose
shortfall the student must see and defend.  The same holds for an ignition
source in a zone: the run is a design draft, and refusing it would hide the
picture that shows the problem.  Refusing would also make the declared
numbers -- which are assumptions -- into a hard contract the engine cannot
justify.

The result JSON carries `layout {}` (items with position, extents, shape,
orientation, where the size came from, sector, hazards; areas; separation
tables; wind; findings; unplaced; internal; a summary) -- one record per line,
each carrying an `"id"`.

**Pinned by a new golden row kind, `layout`** (published => pinned): per item
`x y z dx dy dz` and `shape orientation footprintFrom` as words; per finding
`value limit`; the summary counts.  The source/reason sentences and the zone
and wind declarations are the case's own words echoed and are NOT pinned --
what they DECIDE is, through the findings and the count.  The existing kinds
could not read the block (`equipment` resolves inside `"equipment": [...]`
only), and folding layout numbers into a KPI would be a second home.

No `design/layout` file is written.  `design/` is a tree of one sheet per
physical item; a plot plan is about the PLANT, and the result block plus the
case's own layoutDict already say everything a file would.

## 5. The draft tool -- `bin/choupo-layout --draft <case> [--force]`

A bash wrapper over `choupoSolve --layout-draft` (the `choupo-lint` shape),
so the footprint rule keeps ONE home, in C++.  It solves the case, then:

1. orders the placeable items by the flowsheet's declared unit order (a valid
   flow order: the sequential-plan contract) and groups them by sector;
2. places them on one line, `y = 0`, at grade, each at the smallest `x` that
   keeps (i) a clear gap to its predecessor equal to the larger plan extent of
   the two -- a DRAFTING spacing for access, said to be one, not a safety
   distance -- and (ii) every separation the case already declared, against
   every item already placed; positions are rounded UP to the centimetre the
   file prints;
3. writes one area per sector: the items' extent, widened by half the gap to
   the neighbouring sector so adjacent areas meet midway;
4. lists, commented out, every item that publishes no size, for the student
   to place with a footprint they defend, and the internals;
5. writes NO separation table, wind or zone -- commented templates only, with
   the sentence that Choupo ships none.

It refuses BEFORE solving when `system/layoutDict` exists and `--force` was
not given, and refuses before writing when the run sized nothing.  With
`--force` it carries the existing file's separation tables, wind, declared
footprints, non-process items and hazard declarations into the new draft.
The same run then CHECKS the draft it wrote, so the proposal is proved to
parse and to hold.  The file's header says it is a proposal the student must
own -- the `choupo-init0` / `choupo-resolve --draft` posture.

## 6. The GUI -- Reports, "Plant layout (3D)"

An earned section, shown only when the result carries a layout.
`gui/src/case/plantLayout.ts` (pure, vitest) maps the block onto a scene --
coordinate bookkeeping (plan `(x, y, z-up)` to three.js `(X, Y-up, Z = -y)`)
and the trigonometry of the declared wind angle, nothing else.
`ui/plotting/PlantLayout3D.tsx` draws it: cylinders where the engine says
cylinder, labelled boxes otherwise (*a labelled box beats a wrong picture*;
since DEV.md 4c C88 each item is drawn BY ITS EQUIPMENT KIND on that same
envelope -- `gui/src/case/equipmentModel.ts`, heads, skirts, saddles,
ladders and platforms as declared decoration -- and a kind with no drawing
keeps the plain cylinder or box),
sector areas on the ground, zones as translucent cylinders distinguished by
OPACITY, EDGE STYLE (solid / wire / dashed) and the WORD in their label --
never colour alone, so a greyscale print keeps them apart -- flagged items
labelled FINDING, a separation shortfall as a dashed line carrying both
distances, a wind arrow.  Tables below repeat every position and finding, so
a reader without WebGL loses nothing.

**The dependency: three.js** (`three@^0.170.0`, MIT; types `@types/three`,
MIT, dev only).  Measured: `plotly.js-basic-dist-min`, which the GUI ships,
has NO 3D traces.  The alternatives were Plotly's gl3d bundle (a second,
larger Plotly distribution beside the one the app already loads, and its
mesh3d traces have no cylinder primitive -- every vessel would be a
hand-triangulated mesh) and three.js (the conventional WebGL library, a
cylinder and a box are primitives, orbit controls and HTML labels ship with
it).  three.js is loaded with a dynamic `import()` the first time a layout is
shown, so a session that never opens one never downloads it; it is
JavaScript, no WebAssembly, and touches nothing of the engine's WASM build.
`gui/public/THIRD_PARTY_NOTICES` is regenerated from the lockfile.

## 7. The witness

`ammonia02_full_plant` -- a flat synthesis loop, 0.15 s, seven sized items:
three vessels with their own D and H, two compressors and two RATED
exchangers that publish no size and so declare boxes; a control room as a
non-process ignition source; a separation table, a wind and zones on the
hydrogen-bearing items.  Its file was started with the draft tool and moved
by hand.  **One pair is deliberately too close** (the let-down drum 1.9 m
from the separator against 4 m declared), so the shipped case shows the
announcement a student must learn to read; the refusals and the other
announcements are FIXTURES the gate builds, not defects in a tutorial.
Every number in the file that is not the engine's own size is an author-set
assumption, said so in those words: *"a citation invented for a round number
converts unsourced into falsely sourced."*

## 8. Rejected

* **A shipped spacing or zoning table.**  CCPS, GAP 2.5.2, Mecklenburgh,
  IEC 60079-10-1, EI 15 and API RP 505 grant no redistribution (CLAUDE.md
  §10); every number is the case's own.
* **Inventing a footprint** for an item with no published size (a
  compressor's box from its power by some correlation).  It would be a size
  nobody declared and no sizer computed -- the "default nobody declared".
* **Refusing a short distance** (argued in §4).
* **The layout check as a `postDict` pass.**  A layout is not post-processing
  of the flowsheet's result in the sense the chain uses -- it is a separate
  declaration about the plant, and its own file keeps the postDict a pure
  parameter file.
* **The draft tool in Python**, re-deriving the footprint from the design
  sheets: a second home for the footprint rule.
* **A `design/layout` sheet** (§4).
* **Plotly gl3d** (§6).

## 9. Not in this slice, named

Pipe lengths were the next slice and are §11 below.  Still not here: a
pipe's pressure drop and its cost (the slice after §11: the route and its
length now exist for them to read); structures and multi-level steel
(elevation is declared but nothing checks access); rotation by an arbitrary
angle; a stacking or support check; whether any declared distance or zone
extent is SENSIBLE -- by design that is the author's to defend.

## 11. Slice 3 -- the pipes, and the fluid seen moving (DEV.md 4c C80)

Vítor, 2026-10-17: *"os meus alunos tinham as colunas implantadas com as
tubagens ligadas entre eles e até tinham o fluido a passar
estilizadamente!!!"*.  The slice §9 named, widened to what his students'
drawing showed.  THE ENGINE ROUTES AND MEASURES; THE GUI DRAWS.

**Which streams.**  Every MATERIAL stream of the flattened topology (each
unit's `in`/`inputs` and `outputs`; one pipe per stream IDENTITY, the stream
table's rule) is either ROUTED or listed in `notRouted` with its reason --
never dropped in silence.  A pipe's two ends are one of:

* a **placed item** -- reached at its NOZZLE, the item's plan centre at its
  TOP (z + its height, standing or lying).  Stylised: no sizer publishes a
  nozzle schedule.  A unit that realises several items is piped through the
  FIRST of them the case placed (the order of `items`), so a column's
  overhead loop and a second storage tank are not drawn (named, §9);
* a **junction** -- an UNSIZED `mixer`, `splitter` or `valve` (the one list,
  `junctionTypes()`): a tee or a fitting on the line, with no footprint,
  drawn as a node on the rack's centre line at its lowest tier, at the MEAN
  plan x of the placed items it is piped to (each unit's first placed item).
  A junction piped only to other junctions takes their mean, in passes, in
  flowsheet order -- deterministic, never guessed;
* a **battery limit** -- a plant inlet (no producer) arrives at the rack's
  west end `xStart`, a plant outlet (no consumer) leaves at its east end
  `xEnd`.

Any other end leaves the stream not routed: an unsized unit that is not a
junction (on `ammonia02_full_plant`, the storage tanks T101 and T201 nobody
sized, so `makeup`, `makeupStored`, `productNH3` and `productStored` are
listed with that reason), a sized unit whose items are not placed, a refused
sizer, a stream consumed by two units.

**The route** is deterministic and ORTHOGONAL: up (or down, for an item
taller than the rack) from the source nozzle to the pipe's LANE, across to
the lane, along the rack (plan x), across to the target, down to its nozzle.
The polyline is published in the DIRECTION OF FLOW (the producer's end
first), corners only; its length is the polyline's own.

**The rack** runs along plan x.  A case declares it whole:

```
pipeRack
{
    y            -2 m;      // plan y of its centre line
    elevation    7 m;       // its lowest tier
    laneSpacing  0.6 m;     // lane to lane, across the rack
    lanesPerTier 6;
    tierSpacing  1.2 m;     // tier to tier, upward
    xStart       -14 m;     // west end: the inlets' battery limit
    xEnd         100 m;     // east end: the outlets'
    reason       "...";
}
```

-- every key required once the block is present (a partial rack refuses by
name; `lanesPerTier` a whole number >= 1; `xStart < xEnd`).  Absent, the
engine uses a STATED DEFAULT and ANNOUNCES it once (stderr, the caveat block,
the result JSON): the mean plan y of the placed PROCESS items (a building off
the plot must not drag the rack to it), 6 m up, lanes 0.6 m apart, 6 per
tier, tiers 1.5 m apart, 5 m past the outermost process footprint at each
end.  Drafting values, said as such.  **Lanes** are handed out in the order
the flowsheet first names the streams (each unit's inlets, then its
outlets): lane k sits in tier k / lanesPerTier, at position k mod
lanesPerTier across the rack, centred on its line.

**An override** replaces one pipe's route with declared WAYPOINTS:

```
pipes { rawLiquid { waypoints ( { x 56 m; y -6 m; z 10 m; }
                                { x 59.5 m; y -6 m; z 10 m; } ); } }
```

The route is then the source nozzle, the waypoints, the target nozzle (a
battery limit adds no point of its own), and every segment must run along
ONE axis or the case is refused naming the segment and where it begins and
ends.  A key naming no stream, or a stream with no routable end, refuses.

**Published** inside `layout {}` (it exists only with a layout): `pipeRack`
(with `declared`), `junctions` (unit, type, x, y, z), `pipes` (one line per
pipe: `pipe:<stream>` id, the stream identity and its plant label, each
end's kind / id / unit, `routedBy` rack|waypoints, `lane`, `length`, the
stream's `F_mass`, `T`, `P`, `vf` read from `streams` with the stream
table's own mass-flow sum -- one home, `overallMassFlow` in the emitter --
and the `route`), `notRouted` (stream, reason), and the summary's `pipes`,
`notRouted` and total `pipeLength`.  There is NO `direction` field: the
route runs in the direction of flow, and a field with one possible value is
doctrine written in the wrong place (the amplifier rule).  NO pressure drop
and NO cost.

**Pinned** by the existing `layout` golden kind, argued rather than a new
kind: the pipes are lines of the same block, one record per line with an
`"id"`, so one reader serves both.  Each pipe's `length` and its two ends
(`from`, `to`, as words), each junction's position, the rack's line and the
summary counts and total.  NOT pinned there: the stream's flow, T, P and vf
(the `stream` kind pins them in their one home) and the corner points (the
length and the gate's orthogonality arm hold them).  Appended, none moved:
52 rows on `ammonia02_full_plant`, 85 on `greenAmmoniaPEQ_baseCase`, 64 on
`aceticAcid02_plant`; each case run against its golden before the append.

**The cases.**  `greenAmmoniaPEQ_baseCase` and `aceticAcid02_plant` DECLARE
a rack, labelled as an author-set assumption for the students to replace
(the C76 posture); `ammonia02_full_plant` declares none and runs on the
announced default -- one witness per route.

**The draft tool** carries a declared rack as declared, leaves a commented
`pipeRack` template when none is declared (it never writes values for one),
and says it did NOT carry `pipes` overrides: they were drawn around
positions the draft moves.

**The GUI** (`case/plantLayout.ts`, pure and tested;
`ui/plotting/PlantLayout3D.tsx`; the register in `ui/PlantLayoutTables.tsx`,
one home for Reports and the `?layout=` pop-out) draws each published route
as a translucent tube, its phase read off the published vf (`phaseOf`:
liquid vf <= 1e-6, vapour vf >= 1 - 1e-6, two-phase between) in THREE
channels -- colour, particle SHAPE (spheres, octahedra, the two alternating)
and the legend's WORD; the rack and the junctions from the published block;
and particles moving along the route in the direction of flow at a speed
`1.2 + 2.4 log10(1 + m/(kg/s))` m/s -- monotone in the published mass flow,
stylised, said in the legend.  A Flow toggle stops them, and a reader whose
system asks for reduced motion starts with it off.  The pipe register lists
stream, from -> to, phase, T, P, flow and length, then every stream not
routed with the engine's reason.  Nothing is routed or measured in the GUI.
Riding with it, at Vítor's request from the live site: a label is the item
id alone (a flagged item's carries a warning glyph; everything else is the
hover tooltip), labels that collide on screen are DECLUTTERED by priority
(findings, items, the rest, zone labels -- the zone labels off by default),
and the camera opens FITTED on the plant (the placed process items and the
pipes) with a Fit button and fitted Plan and Elevation presets.

**Not here, named:** a pipe's diameter, pressure drop and cost; a clash check
of a route against an item it passes through or over (a tower taller than
the rack is crossed by its own lanes); the internal piping of a multi-item
unit; a rack along plan y or more than one rack; a pipe consumed by two
units.  Gate: `check_plant_layout` arms (h) and (i).

## 10. Slice 2 -- the EduTool lesson

*Plant layout: where each item stands, and why* (`tool=plant-layout`, shelf
Process design & economics; `gui/src/ui/methods/PlantLayoutTool.tsx`, its
text in `plantLayoutLesson.ts`, its knobs in `layoutExercise.ts`), on the
outline Vítor approved on 2026-10-17 (DEV.md 4c C75): why layout matters,
separation distances and why none is shipped, a guided exercise, the wind
and the zones, the trade-offs, the limits.  The exercise runs THIS witness in
the browser with the reader's numbers written into its layoutDict -- the
let-down drum's and the control room's positions, the wind's bearing, the
`measure` word -- and draws only what the engine published: its `[layout]`
lines and any refusal verbatim, the findings, and the same 3D scene as
Reports.  The draft tool is a command-line step the browser cannot run, so
the page describes it and starts from the witness's hand-moved file.  Every
`file:line` the lesson cites, every number it quotes and every guided move's
expected outcome is held to the tree by `gui/tests/plantLayoutLesson.test.ts`
(the moves recomputed from the witness's golden sizes and declared numbers
by the rules above).  Not taught, because the engine does not do it: pipe
lengths and their cost (said so on the page), and any zone extent or
distance from a standard (named bibliographically, marked NOT READ).

## 12. Slice 4 -- the plot area and the cost of the land (DEV.md 4c C82)

Vítor, 2026-10-17: *"o layout acaba por ser importante para avaliar os m2 de
implementação e o custo do terreno"*.  Two halves, one number between them.

**The plot area (engine, `PlantLayout.cpp` `plotOf`).**  ONE rule, published
on the result as the engine's own sentence (`layout.plot.rule`): the plot is
the axis-aligned ENVELOPE of every declared sector area, every placed
footprint (process and non-process) and every routed pipe's polyline, grown
on every side by the case's declared margin,

    plot { margin 10 m; reason "perimeter road, fence and access"; }

An envelope and not a union, because a plot is one parcel of land bought
whole: ground between two sectors is still bought.  The pipes are in it
because they occupy ground and their battery limits are where the plant
meets the outside -- on a default rack they reach past the outermost
footprint.  ABSENT the block, the margin is 0 m and that is ANNOUNCED
(stderr, caveat block, advisories): the area is then a LOWER BOUND, and no
margin is invented.  Published beside the area: the plan area the
footprints themselves cover (a vertical cylinder's disc, any other item's
rectangle; each item counted once, so `stackedPairs` counts the pairs that
stand one above the other) and its share of the plot -- what the separation
distances, the access and the rack cost in ground; per sector, the declared
area where there is one, else the envelope of that sector's own footprints;
and, where sector areas are declared, their UNION and the ground two of them
claim at once (each such pair announced with its shared m2: the plot counts
it once, the two published sector areas count it twice).  Pinned by the
`layout` golden kind: `plot` and `plotSector:<S>` lines, `plotArea` and
`footprintArea`, and the sector's `from` word.  The draft tool carries a
declared `plot {}` under `--force` and otherwise writes a commented one.

**The land (economics, `EconomicsPass.cpp` `readLand` + `appraise`).**  An
opt-in `land { price; source; reason; }` in the economics block prices the
plot area as land.  The AREA has one home: the layout's published plot where
the case declares a layoutDict (an `area` beside it refuses -- one plot, one
area), else a declared `area`; with neither, the land refuses by name.  The
layout is therefore checked BEFORE the economics pass on the direct path
(where the chain reaches `economics`; after the chain when there is none),
and under an outer driver -- which checks the layout after its chain -- a
land block needs its declared `area`, which the refusal says.

WHERE IT SITS IN THE CASH FLOW, read on 2026-10-17 in CAPCOST 2017 (the
file `readTimeline` already cites, same sha256): 'COM Summary'!B15:C15 is
the "Cost of Land" (`costLand`); 'Cash Flow Analysis'!C49 spends it at
year 0, the START of the project, before the first construction year's
capital; I63 recovers it at the end of the project life beside the working
capital, `=workingCapital/10^6 + costLand/10^6`, outside the taxed line.
CAPCOST's year 0 is Choupo's t = -constructionPeriod (Choupo's year 0 is
the END of construction), so a land price adds ONE row to the timeline.  The
land is NOT depreciated, its recovery is at its purchase value and untaxed
(no appreciation is modelled), and it is NOT in TCI -- a third capital line
beside FCI and WC, printed on its own line with its source.  It enters the
appraisal ONLY through `appraise` (the bundle carries price and area; the
outlay and the recovery are two lines inside it), so the C68 sensitivity
moves it as `land.price` with no arithmetic of its own.  The cash-flow
rows keep it OUT of `investment` (whose name is the fixed and working
capital) and carry it in a `land` cell.  Absent a land block every economics
case is byte-identical (measured: console, result JSON and every file the
run writes, on the nine economics cases without a layout, against a build of
the parent commit; the .ods compared on its content).

WITNESSES.  `ammonia02_full_plant` and `greenAmmoniaPEQ_baseCase` declare
`plot { margin 10 m; }` and `land { price 50; }` -- a ROUND PLACEHOLDER for
the students' site, said so in the file, not a market quotation.  Their
NPV (and, on ammonia02, IRR and payback) MOVE with it, as they must;
`aceticAcid02_plant` publishes its plot area only (its README makes pricing
the students' task), with the absent margin announced.

**Not here, named:** appreciation or a resale price different from the
purchase price; land bought on a schedule; the land's own taxes and fees;
a non-rectangular plot; the economics of a plot under an outer driver
without a declared `area`.  Gates: `check_plant_layout` arm (j),
`check_economic_sensitivity` arms (i)-(l), `check_cost_provenance` arm (s).
