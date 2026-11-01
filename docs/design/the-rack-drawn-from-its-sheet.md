# The rack drawn from its sheet, and the hall as a drawing set

*2026-11-02, DEV.md 4c C199 (phase B, the GUI).  Phase A made
`tutorials/plant/swro01_campoDalias` six trains in one RO building and
published, per vessel bank, the keys a drawing needs
([`a-desalination-plant-is-trains-and-racks.md`](a-desalination-plant-is-trains-and-racks.md)).
This record is what the GUI does with them.*

## 1. The user's task, in one sentence

An engineer designing a seawater RO hall must SEE how the plant is organised --
six trains, each with its pump, its pressure-exchanger array and its vessel
racks -- and how each rack is built.  The 3D answers "where is everything";
the drawings answer the two questions a plan of equipment cannot: the
ORGANISATION (a train) and the CONSTRUCTION (a rack).

## 2. What is drawn, from what, and where it appears

| Drawing | From | Where |
|---|---|---|
| every vessel inside its rack inside the hall, 3D | the bank's sheet + the engine's envelope | the existing layout view (Reports, "Plant layout (3D)") |
| plan of the hall | layout items, the declared building's rooms, every bank's sheet | Reports, new section "Trains and racks" |
| section through a rack bay | one bank's sheet + the room height | same |
| elevation of one rack, with its three headers | one bank's sheet | same, and above the sheet table of a `membraneBank` sheet in "Equipment sheets" |
| one train | the seven sheets of train k | same section |

**Why a Reports section and not a tab of the layout pane.**  The layout pane is
one object with one camera (the 3D and its tables).  These are drawings of the
equipment, which Reports already holds for the column and the exchanger; they
need three pickers (train, bank, rack) the layout pane has no place for; and
the section is EARNED by a fact (a `membraneBank` sheet exists), as the column
section is (`reportSections.ts`).  The elevation also appears over a bank's
own sheet, dispatched on the sheet's `equipment` word like the pressure
exchanger's schematic, because that is where a reader who opened the sheet
looks for it.

## 3. The 3D

`equipmentModel.ts` gained the kind `membraneBank`.  Its recipe draws each
vessel a horizontal cylinder of `vesselOutsideDiameter` x `vesselLength`, in
tiers of `vesselsPerTier`, racks side by side along y with `rackAisle`, the
loading clearance free at the high-x end, the frame at `baseHeight`; every
number is a sheet key (`membraneBank.ts::readBank`).  **One instanced part per
rack** (a new `InstancedCylinderPart`), drawn by one `InstancedMesh`
(`layoutRenderer.ts`): a train has up to 233 vessels and the plant 1398, and a
mesh per vessel is the draw call the scene cannot afford.  The vessels are the
BODY and stand inside the envelope the engine published; the base, the posts
and the cradles are decoration, also inside it.

**The join is one seam.**  The engine's `layout {}` carries only the envelope;
the sheet is another channel.  `withBanks` attaches each bank to its layout
item at the one place both exist (`WasmAdapter`, where `designFiles` arrives), by the engine's own item identity
`unit/tag` (`EquipmentSizing::itemId`), so the scene, the export and the
pop-out all read it and none reads a sheet.  A bank whose sheet is missing or
lacks a key keeps the plain box and says so in its tooltip.

Trap kept in view: `mergeGeometries` throws on an empty list (C194's
"t[0] is undefined"); an empty rack draws nothing and a test holds
`mergeNonEmpty`.

## 4. The 2D drawing set

The usual set of a plant (the architect's decision, 2026-11-02): a PLAN, a
SECTION and the ELEVATION of one rack.

* **Plan**: the four declared rooms, every rack as a rectangle, every loading
  clearance hatched, the pumps and arrays as the boxes the case declared, the
  cut line A-A.  Indoor piping is not routed by the engine, so none is drawn.
* **Section** (looking along the vessels): one rack with its half-aisles, every
  vessel a circle of the published diameter, the base frame, the floor, and the
  roof from the declared room height.  The hall is much taller than the rack, so
  the roof is drawn BROKEN and the headroom dimension carries the true number
  marked "not to scale".
* **Elevation**: the rack seen across, tier by tier, the feed and brine headers
  above, the permeate header at the low-x end, a branch from every tier; below
  it the same rack seen from above with every vessel of its top tier on the
  three headers.

**Every dimension line marks its provenance in two channels** -- the ink and the
word -- exactly as the pressure exchanger's schematic does
(`PROVENANCE_INK`/`PROVENANCE_WORD`), each a `<g data-dim data-who>` so a test
reads it.  A missing key draws a labelled box and names it (`missingSvg`);
no number is typed (the element length printed is the sheet's: a test changes
it and watches the label follow).

**The headers are NOT sized**: no pipe sizer exists.  They are drawn at the
sheet's `headerNominalDiameter` when the case declares one and at a plain dashed
mark otherwise, and the drawing says so in words.  What a drawing convention
fixes and the engine does not publish (feed and brine radial ports near the
vessel ends, permeate at the low-x end cap, a vessel at the centre of its pitch
cell, a rack filled bottom tier first) is printed beside the picture with the
word *convention*.

## 5. The train

`equipmentSchematic.ts::trainSchematicSvg`: the HP pump, the pressure-exchanger
array (devices, flow per device, the declared window), the booster, RO1, the
second-pass pump and RO2a/RO2b, with the permeate, spent-brine and recycle
lines and their per-train flows.  **The roles are found from the streams the
sheets name** (the exchanger's HP inlet is the first bank's brine; the booster
takes its HP outlet; ...), never from unit names, which are the case's.  A
bank's flows are the unit's plant streams divided by the declared trains
(computed, said so); a pump's and the array's are the per-train numbers their
sheets carry.  A train whose roles do not resolve draws a labelled box naming
them.

## 6. How it is held

`tests/membraneBankModel.test.ts` and `tests/roHallDrawings.test.ts` read the
case's REAL run output (42 sheets and the structured result, declared in
`witnessOutputs.ts`) and recompute: the vessel length, the rack length, width and
height and the envelope from the sheet's own declared numbers; 233/54/18
vessels a train and 1830 in the plant, equal to the instances drawn; that EVERY
vessel of every bank is inside its rack (length, pitch cell, above the base,
under the rack height); that the drawing stays inside the published envelope;
pixel proportions of the section and the elevation against the keys; 48 racks
and 18 clearances in the plan; the roof's headroom from the declared room; and
that each dimension line carries its ink and its word.  No transcription of a
sheet exists, so none can drift; the keys the reader needs are checked against
the `d.set(...)` calls of `MembraneBankSize.cpp`, so a renamed key fails there.

## 7. What phase A did not publish, and what is not done

For the engine: a `headerNominalDiameter` (and a pipe sizer behind it); a
per-key `declared (...)` list on the bank sheet, as the exchanger sheet has --
the GUI carries the provenance of each key as a table about the sizer
(`BANK_KEY_WHO`); the port positions (feed, brine, permeate) of a vessel; the
bank's volumetric flows (the GUI divides the unit's plant mass flows).
Not done: the headers in 3D, piping in the plan, the booster and pumps drawn by
kind in 3D (they are the case's boxes), a screenshot test (WebGL is not
available in tests; the geometry description is pure and tested).

## 8. BUILT 2026-11-02: the headers at their own size

The header sizer (`a-header-is-sized-by-its-velocity.md`) publishes its sheets
on the bank's unit with the tag `train<k>.<role>`, so the header sheets have no
layout item and are read as a FAMILY: `headersOf(sheets, bank)`
(`membraneBank.ts`) joins on the bank's unit and `trainIndex`, and `readHeader`
refuses a sheet lacking a key or carrying it in a wrong unit.  The rack
elevation draws each header at ITS OWN `headerNominalDiameter`, solid, to scale
against the vessel (feed 0.60 and brine 0.45 m on RO1 differ), with two
dimension lines per header in the two provenance channels: the nominal bore
(`declared`: picked from the case's declared list) and the required bore
(`Choupo`, "computed from v max"; also a dashed inner ring), and a note with the
velocity and the pressure drop per metre.  A header whose sheet is absent stays
the dashed mark, labelled "not sized"; the old bank-sheet key is kept as a
fallback only.  The train schematic's bank boxes gained a `headers` row (feed /
brine / permeate bores, declared).  The engine publishes every key needed.
