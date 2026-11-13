# Pack: plant layout (plot plan) and the GMP building interior

budget: 3150 words (~5000 tokens)

Read this pack when the design must say WHERE things stand: a plot plan with
the sized equipment, a pipe rack, roads, a fence, hazardous-area zones; or,
for a pharmaceutical plant, the rooms of the building (grades, pressures,
airlocks, flows).  Binary: `choupoSolve`; the layout is one more file,
`system/layoutDict`, checked on every run of a case that has it.  It places
SIZED items, so the case needs a `sizing` pass (pack `design-cost`) first.

## 1. The rule that decides everything

* An OVERLAP is not a layout: it REFUSES (exit 2).  A SHORT DISTANCE is a
  layout you must defend: it is ANNOUNCED (log, caveat block, result JSON,
  the 3D view).  Read the announcements and say in DESIGN.md why each is safe.
* Nothing is a shipped number.  Every separation, wind, zone extent, road
  width, height and spacing is YOURS, with `source "...";` and `reason "...";`.
  The usual tables (CCPS, IEC 60079-10-1, API RP 505, ISPE) are not
  redistributed; say "assumed" or cite the standard your client specifies.
* The footprint is the item's OWN: where its sizer published a diameter and
  a length (vessel `D`/`H`, shell-and-tube with a design `shellID`/
  `tubeLength`) the item is a cylinder of that size.  Where it published only
  an area or a power (exchanger sized by `A`, compressor), YOU declare a box
  `footprint { length m; width m; height m; }`.  A box on an item that
  publishes its own size is refused (two homes for one size).
* Item ids are the sizing ids: the unit name (`flashDrum`), or
  `unit/tag` for a unit with several items (`lightsColumn/shell`,
  `methanolTank/tank1`).  The design sheets under `design/` list them.
* NOT placed on their own: tray stacks, catalyst charges, relief valves, a
  converter's baskets (naming one is refused, naming its host).  NOT placed
  at all: `ratedMachine` (a machine stands in a ROOM) and the clean-utility
  items.  A sized unit left out is announced `unplaced`; a sizer that refused
  leaves its item `sizingRefused`.

* A layout with NOTHING sized stops the run: `the case declares a layout, and
  a layout places SIZED items -- this run sized nothing`.  Size at least one
  item first (and an empty `items ( )` does not help).

## 2. `system/layoutDict` keys

```
items ( { item "<id>"; x 0 m; y 0 m; z 0 m; orientation vertical|alongX|alongY;
          [footprint { length; width; height; }]
          [ignition "why";]
          [release { source; reason; zones ( { zone 1|2; radius 3 m; height 3 m; } ); }] }
        { nonProcess "<name>"; kind <word>; x; y; z; orientation; footprint {...};
          source; reason; [ignition "why";] } );
separation ( { source; reason; measure edgeToEdge|centreToCentre;
               distances ( { between ( kindA kindB ); distance 15 m; } ); } );
wind { from 270 deg; planNorth 0 deg; halfAngle 30 deg; reach 40 m; source; reason; }
pipeRack { y 5 m; elevation 6 m; laneSpacing 0.5 m; lanesPerTier 4; tierSpacing 1 m;
           xStart -15 m; xEnd 25 m; reason; }
pipes { <stream> { waypoints ( { x; y; z; } ... ); } }     // override one route
ports { <stream> { item <id>; side top|bottom|east|west|north|south;
                   [elevation 2 m;] } }                     // move one pipe end's port
utilityLines ( { name "CW-X-supply"; service coolingWaterSupply|coolingWaterReturn|
                  refrigerantSupply|refrigerantReturn|flareHeader;
                  from "<item>"; to "<item>";            // the flow runs from -> to
                  [fromPort { side top|bottom|east|west|north|south; [elevation 2 m;] }]
                  [toPort { ... }]
                  [carries { unit <unit>; utility <utility>; }]   // reads the run's allocation row
                  reason "..."; } );
typicals ( { typical "train"; index "train"; count 6; pitch { x 19 m; y 0 m; }
             members ( "RO1/train1" ... ); source; reason; } );
areas { <SECTOR> { xMin; xMax; yMin; yMax; } }             // sectored cases only
plot { margin 5 m; reason; }
roads { source; reason; headroom 5 m; access { distance 25 m; source; reason; }
        [noTraffic ( <zones> );]
        network ( { road "name"; width 6 m; reason; waypoints ( { x; y; } ... ); } ); }
fence { source; reason; [inset 2 m;]
        crossings ( { stream <s>; from|to "label"; [side north|south; at 5 m;] } ); }
bunds ( { name; kind bund|impounding; items (...); region {...}|polygon (...);
          wall { height; }; capacityRule {...}; drain closedValve|sumpPump|openToSewer;
          source; reason; } );                              // secondary containment
building { ... }                                           // §4
```
* Angles carry `deg`; lengths carry units.  `x`,`y` = plan centre; `z` = base
  elevation (an item listed in a room takes `z` from the room's floor: never
  declare it).  A vertical item's `orientation` is `vertical`.
* `nonProcess` kinds: any word (`building`, `warehouse`, `controlRoom`); two
  words mean something: `gate` (an entrance) and `weighbridge` (drivable).
  Separation tables match by KIND: equipment kinds are the sizing types
  (`vessel`, `shellTubeHX`, `storageTank`, ...), non-process kinds are your
  word.  A rule naming a kind no item carries is announced `deadRule`.
* Every pipe end lands on a PORT of its item (a drafting CONVENTION, said
  once per run, NOT a vendor's nozzle schedule), from the item's kind, its
  sized dimensions and the stream's ROLE in its unit, read off the unit's
  declared ports (`in`/`inputs`/`outputs` position, `feeds`/`sideDraws`
  stages; a drum's outlets by the produced stream's vapour fraction), never
  off a stream's name: a column's feed on its SHELL at its stage's height,
  bottoms at the sump, distillate on the reflux drum (else the condenser,
  else the head); an exchanger's tube ends and shell nozzles over and under;
  a drum's side inlet, top vapour, bottom liquid; a reactor or machine at the
  ends of its axis; a tank's roof and low outlet (a horizontal tank's nozzle takes the end of the axis nearer the other end of its pipe; a battery limit counts as lying on the side of the fence you declared for the stream).  A unit type with no rule
  keeps the item's top centre (`origin default`, announced).  Each pipe
  publishes `fromPort`/`toPort` (item, port, origin, point, `leaves` = where the 1 m stub ends); a `ports` block
  moves one (`item` must be a placed item of a unit at an end of the stream:
  refused by name otherwise; `elevation` only on a side).  A `pipes`
  override now begins at the port's stub, not at the top centre: its first
  waypoint must share two coordinates with the `leaves` point of `fromPort` (and its last
  with `toPort.leaves`), because every segment is orthogonal.
* A HEADER (C268): several identical parallel items (store vessels, a tank
  farm, trains) are piped by one MAIN along their row with a BRANCH to each
  port; a postDict store on a boundary stream (`storage`, `gasStorage`; its
  own `stream`, not repeated in layoutDict) has that pipe routed THROUGH it.
  The main runs between two rows, or beside one at the 1 m stub tips; a
  third row is announced.  Branches: pipes `pipe:<stream>@<item>`, no flow.
  A `pipes` override on such a stream is refused.
* The pipe router is deterministic: up from the port's stub to its
  lane, along the rack (plan x), down to the target's port.  Plant INLETS arrive at
  the rack's west end `xStart`, OUTLETS leave at the east end `xEnd`.  Every
  MATERIAL stream is routed or listed `notRouted` with its reason.  SOLIDS ARE
  NOT PIPED (powder, tablets: containers or conveyors), a unit with no placed
  item leaves its streams unrouted, and the router does not steer round
  items: a segment through a footprint is announced `pipeClash`.  No pressure
  drop here.  Absent `pipeRack`, a stated default is used and announced.
* UTILITY LINES are DECLARED in `utilityLines` (a utility is not a stream, so
  nothing is inferred): routed on the SAME rack above the process pipes' tiers
  (no process route moves), ports as above, every line UNSIZED (no pipe is sized
  here).  `carries` reads that unit's utility allocation row (kg/s) as
  `utilityFlow`; a row the run lacks is refused.  Findings: `utilityClash`,
  `utilityCrossesRoad`, `utilityThroughBund`, `utilityNotRouted`.  Design Guide
  \S\ref{utility-lines}.
* The plot is the envelope of the footprints, the routed pipes, the roads
  and the sector areas, grown by `plot.margin`.  Absent margin: 0 m,
  announced (the area is a lower bound).  `economics { land { price; source;
  reason; } }` prices that area.
* A road's pavement reaches HALF ITS WIDTH past its first and last waypoint
  and to each side.  Keep every road end at least width/2 (+ the item's
  half-length) clear of a footprint, and do not start a road ON a gate: a
  6 m road ending 1 m short of a control room still REFUSES (`road site runs
  THROUGH controlRoom: its paved surface (6 m wide) and the item's footprint
  interpenetrate by 2 m on the plan, below the 5 m headroom`).  A road
  reaches a building or gate when it passes within `access` of it; it need
  not touch it.
* REFUSED (exit 2): an entry naming no sized item; an item placed twice; two
  footprints overlapping in plan AND height; a road through a footprint below
  the headroom; a road under the rack lower than the headroom; a diagonal
  road segment; a road meeting the fence anywhere but at a gate opening; an
  item across the fence; a missing `source`/`reason`.
* ANNOUNCED: a pair closer than its declared separation; an item outside its
  sector area; an ignition source inside a zone or DOWNWIND of a release
  source; a site with ONE gate; a gate, building or item with no road within
  `access`; a road in a closed zone; an unlabelled fence crossing; a liquid
  item no bund encloses (`unbundedLiquid`).
* A draft: `bin/choupo-layout --draft <case>` solves the case and writes a
  PROPOSAL `system/layoutDict`: the sized items in flow order along one line
  with a drafting gap, one area per sector, each separation you already
  declared kept.  It lists items it cannot size for you (declare their box),
  checks its own draft, and never overwrites a layoutDict without `--force`.
  It invents no distance, wind or zone.  Move every item to where you can
  defend it.
* In the app: Reports -> "Plant layout (3D)".  The viewer offers a guided TOUR
  generated from the case's sectors and units (each sentence carries the result
  field it was read from), orbit / walk / drone cameras, a "Go to..." list, a
  minimap, a click card on every item and pipe (the sheet and the stream the engine
  published), and colour by phase, temperature, pressure or the mole fraction of a
  component you choose.  Every value is read from the published result; the viewer
  computes nothing.  Pipes end on the item's ports, drawn as nozzles; a port is a
  conventional position, not a vendor's nozzle schedule.  The engine publishes no
  line velocity, so flow particles are stylised.

## 3. Example: a heater and a flash drum on a rack, a road, a gate, a fence

Case = the `design-cost` example's flowsheet (ethanol + water, `heater`
then `isothermalFlash`) with this sizing-only `postDict`.

`system/postDict`
```
sizing
{
    units
    (
        { unitName heater;  type shellTubeHX;  material SS316;
          designRules { utility steamLP;  U 800;  pressureDesign 4; } }
        { unitName flashDrum;  type vessel;  material SS316;
          designRules { volume 5 m3;  L_over_D 3;  pressureDesign 3;
                        corrosionAllow 0.0015;  jointEfficiency 1.0; } }
    );
}
```
`system/layoutDict`
```
items
(
    {   item "heater";  x 0 m;  y 0 m;  z 0 m;  orientation alongX;
        footprint { length 6 m;  width 1 m;  height 1.5 m; } }          // the sizer published only an area: the box is ours
    {   item "flashDrum";  x 10 m;  y 0 m;  z 0 m;  orientation vertical; }   // D and H come from the sizer
    {   nonProcess "controlRoom";  kind building;  x 10 m;  y -34 m;  z 0 m;  orientation alongX;
        footprint { length 10 m;  width 6 m;  height 4 m; }
        source "assumed";  reason "operators' room, upwind and away from the drum";
        ignition "electrical equipment and people"; }
    {   nonProcess "gate";  kind gate;  x -20 m;  y -30 m;  z 0 m;  orientation alongX;
        footprint { length 4 m;  width 3 m;  height 3 m; }
        source "assumed";  reason "the site entrance"; }
);
separation
(
    {   source "assumed, not from a published spacing table";  reason "round numbers for a teaching plant";
        measure edgeToEdge;
        distances
        (
            { between ( shellTubeHX vessel );  distance 3 m; }
            { between ( building vessel );     distance 15 m; }
            { between ( building shellTubeHX ); distance 15 m; }
        );
    }
);
wind { from 270 deg;  planNorth 0 deg;  halfAngle 30 deg;  reach 40 m;
       source "assumed";  reason "a prevailing wind lets the plan be read for where a release drifts"; }
pipeRack
{
    y 5 m;  elevation 6 m;  laneSpacing 0.5 m;  lanesPerTier 4;  tierSpacing 1 m;
    xStart -15 m;  xEnd 25 m;
    reason "one rack along the north side, inlet at the west end, outlets at the east";
}
roads
{
    source "assumed";  reason "one road from the gate to the control room and past the unit";
    headroom 5 m;
    access { distance 25 m;  source "assumed";  reason "reach of a fire tender's hose"; }
    network
    (
        { road "site";  width 6 m;  reason "gate to the control room, then north past the plant";
          waypoints ( { x -14 m; y -24 m; } { x 4 m; y -24 m; } ); }
        { road "plant";  width 6 m;  reason "south of the plant, joined to the site road";
          waypoints ( { x -5 m; y -24 m; } { x -5 m; y -12 m; } { x 20 m; y -12 m; } ); }
    );
}
plot { margin 5 m;  reason "a clear strip inside the fence"; }
fence
{
    source "assumed";  reason "a fence round the plot";
    inset 2 m;
    crossings
    (
        { stream feed;           from "ethanol-water supply"; }
        { stream liquidProduct;  to "waste water header"; }
        { stream vapourProduct;  to "vapour header"; }
    );
}
```

Run as in `design-cost`.  Result as run: exit 0; `4 item(s) placed, 0 sized
item(s) unplaced`; `pipes: 4 routed (111.185 m in all), 0 not routed`; roads
2, 55 m, 414 m2 paved; `plot: 57 m x 53 m = 3021 m2`; `fence: 204 m round, 1
gate opening, 3 pipe crossing(s)`; one announcement: the site has ONE entrance.
Variants run: `flashDrum` at x 2 m ->
`ERROR: layoutDict: heater and flashDrum OVERLAP: their footprints
interpenetrate by 1.14252 m on the plan ...`, exit 2; a road through the control
room -> `road site runs THROUGH controlRoom ... below the 5 m headroom`, exit 2;
control room at x 26 m, y -2 m -> exit 0 with `flashDrum (vessel) and
controlRoom (building) stand 10.3575 m apart (edge to edge), closer than the
15 m the case declares`.  Hand estimate before you run: edge-to-edge
separations from the table, the rack above the tallest item's nozzle.

## 4. The GMP building: `building {}` in the same file

A pharmaceutical plant is a building before it is a plot plan.  The plot plan
sees the building as ONE `nonProcess` box; `envelope <id>;` makes that box
the shell of the rooms, which must lie inside it.
```
building
{
    name "..."; source "..."; reason "...";
    envelope productionBuilding;                      // a nonProcess item (optional)
    cascade { minimumStep 10 Pa; source; reason; }    // the step between adjacent grades
    floors ( { floor ground; elevation 0 m; height 4 m; } );
    rooms ( { room corridor; floor ground; xMin 0 m; xMax 20 m; yMin 5 m; yMax 7 m;
              grade D; pressure 35 Pa; relativeTo outside;
              [height 6 m;] [role personnelAirlock|materialAirlock|gowning;]
              [regime cascade|bubble|sink;] [containment yes;] [occupancy 2;]
              [equipment ( itemId ... );] [atex {...}] [ignition "why";] } ... );
    connections ( { between ( corridor outside ); type door|stair|lift; } ... );
    flows ( { flow "product"; kind material|personnel|waste; path ( roomA roomB ... outside ); } );
    shared ( { room corridor; flows ( personnel material ); reason; } );
}
```
* `grade` A|B|C|D|CNC (controlled, not classified); cleanliness A > B > C > D >
  CNC > outside.  An oral-solid-dose suite borrows the vocabulary (EU GMP
  Annex 1 is written for sterile products): say so.  Pressures are declared
  relative to `outside` or another room.
* An AIRLOCK is a ROOM with a `role` and a `regime`: `cascade` (between its
  neighbours), `bubble` (above all, keeps dust in/out), `sink` (below all,
  exhausts).  Doors, stairs and lifts are `connections`; a door needs a
  shared wall, a stair/lift two floors with overlapping plans, a door to
  `outside` an exterior wall.
* `equipment ( item )` lists the sized items standing in the room (a vessel
  from `sizing`): the item takes `z` from the floor, must fit the room in plan
  and height, may be listed by one room, and takes the room's hazard.
* REFUSED: rooms sharing a volume, a door between rooms with no shared wall,
  an equipment item not placed or not fitting, a room across the fence, a
  malformed word.  Message example: `room blendingRoom equipment binderPrep
  does not fit its room: the item spans x 4.91..5.09 ...; the room x 0..8 ...`.
* ANNOUNCED (each `<kind>:<a>:<b>`): `cascade` (the cleaner room is not
  higher by the step), `airlockRegime`, `gradeChangeWithoutAirlock` (a door
  between different grades where neither is an airlock), `wrongAirlock`,
  `ungownedEntry`, `containmentAccess`, `containmentNotNegative`, `flowBreak`,
  `materialRevisit`, `flowCrossing`, `wasteMeetsMaterial`, `atexIgnition`,
  `noEscape` (no way to `outside` through doors and stairs; a lift is not an
  exit).  A flow `path` needs a declared connection between consecutive rooms.
* Room list feeds `cleanUtilities` (pack `batch-plant`): each room's
  area x floor height is its air volume, its `grade` picks the air changes.
  The example of this building is the `batch-plant` pack's `layoutDict`.
* NOT here: air-change rates, door widths, travel distance, particle classes.

## 5. What a student should still decide (write it in DESIGN.md)

* Where the wind comes from and what each zone extent is (site data).
* Why every announced short distance or downwind finding is acceptable.
* The second gate, the bund for every liquid item, what is NOT routed.

<!-- RUN: scratch case plotLay (the design-cost flowsheet with the sizing-only postDict above and this layoutDict, verbatim); CHOUPO_HOME=/home/vitor/Choupo bin/choupo-init0 . ; choupoSolve .  -> exit 0.
     `bin/choupo-layout --draft` run on a copy without layoutDict: exit 0, wrote a draft with flashDrum placed and heater listed as unplaced (no box). Building grammar: run in the batch-plant pack's example. -->
<!-- SOURCES (src/postProcessing/layout unless noted)
 footprint rule, refusals, announcements, pipes, plot, roads, fence, bunds: PlantLayout.H:28-321 (read in full) and the draft banner printed by `choupoSolve --layout-draft`.
 building grammar, refusals, announcement kinds: BuildingLayout.H:28-150.
 layout runs before economics/cleanUtilities and after the chain otherwise: src/applications/choupoSolve/main.cpp:1498-1520; building evaluated :853-856.
 draft tool: bin/choupo-layout (header), --layout-draft main.cpp:543, :798-830.
 the messages quoted were measured in the variants above.
-->
