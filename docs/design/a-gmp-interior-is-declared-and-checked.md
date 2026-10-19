# A GMP interior is declared and checked

DEV.md 4c C97, phase B (2026-10-18).  Record of the slice that lets a case
declare the INTERIOR of a pharmaceutical building -- floors, rooms of a
cleanliness grade held at a declared pressure, airlocks, doors, and the
personnel, material and waste flows -- and has the engine check it.

## 1. What was asked

Vítor (2026-10-18), for a pharmaceutical-industry project group producing
apalutamide tablets: "Caso novo + layout GMP".  Phase A is the case; this is
phase B, the interior layout, on the existing file-first grammar of
`system/layoutDict` (C75 and its slices: pipes, plot, roads, fence).  The
commission listed the grammar (floors, rooms with grade / pressure /
containment / ATEX / occupancy, doors and airlocks with a regime, the three
flows, equipment by `itemId()`), the engine's checks (refuse a geometric
impossibility, ANNOUNCE every rule finding), publication and pinning, a GUI
cutaway and plan, the docs, and a gate that recomputes every verdict.

## 2. The grammar -- `building {}` in `system/layoutDict`

The full grammar with an example is in `docs/ai/case-layout.md` (the
"THE GMP INTERIOR (C97)" bullet).  Its shape:

```
building
{
    name; source; reason;
    cascade { minimumStep 10 Pa; source; reason; }
    atexSeparation { distance 6 m; source; reason; }          // optional
    floors ( { floor <name>; elevation <m>; height <m>; } ... );
    rooms  ( { room <name>; floor; xMin; xMax; yMin; yMax; grade A|B|C|D|CNC;
               pressure <Pa>; relativeTo <room>|outside;
               [role room|personnelAirlock|materialAirlock|gowning;]
               [regime cascade|bubble|sink;]      // airlocks, required there
               [containment yes|no;] [atex { zone; source; reason; }]
               [ignition "<why>";] [occupancy <n>;] [height <m>;]
               [equipment ( <item ids> );] [source; reason;] } ... );
    connections ( { between ( <room> <room>|outside ); type door|stair|lift; } ... );
    flows ( { flow "<name>"; kind personnel|material|waste;
              path ( <space> ... ); [reason;] } ... );            // optional
    shared ( { room; flows ( <kind> <kind> ); reason; } ... );    // optional
}
```

Every number that decides a verdict is the case's, with its source: the
cascade step, the ATEX separation, each grade, each pressure.  Nothing is
shipped.

## 3. Decisions taken on stated defaults

**An airlock is a ROOM, not a kind of door.**  The commission wrote the
airlock as a connection type (`door | personnelAirlock | materialAirlock |
gowning`) with a regime.  Taken differently, and this is the place to
disagree with it: an airlock has floor area, a grade and a pressure of its
own, and its regime -- cascade, bubble, sink -- IS a statement about that
pressure against its two neighbours.  As a connection it would have no
pressure, so the engine could check the declared regime against nothing,
and the room would vanish from the floor area and the plan.  Annex 1's own
glossary calls an airlock "an enclosed space with interlocked doors".  So
an airlock is a room with `role` and `regime`, and a connection is only an
opening: a `door` (one floor, a shared wall), a `stair` or a `lift` (two
floors, plans that overlap).  A changing room is a personnel airlock where
garments change (`role gowning`), Annex 1 para 4.12 (i).

**Pressures are declared relative, resolved absolute.**  A room declares
`pressure` against `relativeTo` (a room or `outside`), as a commissioning
sheet does; the engine resolves the chain to `pressureToOutside` (a cycle is
refused) and every rule compares that one number.

**The cascade, through an airlock.**  Between two connected rooms, neither
an airlock, of different cleanliness (A > B > C > D > CNC > outside), the
cleaner is higher by at least the step -- not asked when the cleaner side is
CNC (nothing graded is at stake).  Across a CASCADE airlock the same is
asked of its neighbours, because a cascade airlock is a step in the cascade.
A bubble or a sink is the case's declared decision to break the cascade at
that door; the engine checks it really is one: a bubble above every
neighbour by the step, a sink below every neighbour by the step, a cascade
airlock strictly between.

**Containment pulls the other way.**  A containment room against a
non-containment neighbour is governed by the containment rules, not the
cascade (it is deliberately LOWER): it opens only on another containment
room or on a bubble or sink airlock, and it is below every neighbour by the
step -- except a sink, which is lower by design and exhausts what leaves
(the commission's "negative to its neighbours" read so that a sink-airlock
design, the textbook containment arrangement, is not announced as wrong).

**Gowning.**  Walking a personnel flow, the person is gowned for the grade
of the last gowning room passed; leaving to CNC or outside un-gowns.  A
person entering a graded room cleaner than that is announced.  This is the
commission's "CNC to graded requires a gowning room", generalised one step
by Annex 1 para 4.12: changing in stages of increasing cleanliness, the
final stage of the grade of the room it leads to.

**Crossings are on the rooms a flow passes THROUGH.**  A flow's first and
last rooms are where it starts and ends -- the room an operator works in,
the room where waste is produced -- and meeting there is the work, not a
crossing.  So a personnel and a material flow CROSS at a room interior to
both; a waste and a material flow meet at a room interior to both; either
is announced unless the case declares the room `shared` for those kinds,
with a reason.  The commission said personnel and material "cross only at
declared airlocks": a crossing in an airlock is a personnel flow through a
material airlock or the reverse, which `wrongAirlock` announces anyway, so
`shared` is the one declaration for both.

**The material flow never revisits a room** -- as commissioned.  A
central-corridor layout, where material goes room -> corridor -> room, is
announced by this rule on its corridor.  That is deliberate (it is the
textbook objection to a single corridor) and the case answers it by
declaring a separate material route, not by an exemption.

**Escape** is reachability of `outside` through doors and stairs; a lift is
not an exit.  Travel distance is not checked.

**The building on the site.**  The building is read AFTER the plot plan is
checked, against what it published: a road through a ground-floor room
(below the roads' headroom) and a room across the fence are refused; an
item placed inside a room that does not list it is refused, as is an
assigned item that does not fit.  A room outside the published plot is
ANNOUNCED (`roomBeyondPlot`): its ground is not in the plot area and not
priced as land.  NOT done, and the next step: the building's envelope does
not enter the plot rule (`plotOf` in `PlantLayout.cpp`) -- that is a hook in
the plant layout's own file, deferred while C96 edits it; until then the
case grows `plot { margin; }` and the finding says so.  (DONE in the wiring
step, §9: the rooms are in the plot and `roomBeyondPlot` is retired.)

## 4. The vocabulary, and the licence it rests on

The grades are EU GMP Annex 1's (European Commission, EudraLex Volume 4,
*Manufacture of Sterile Medicinal Products*, C(2022) 5938, para 4.4),
PARAPHRASED in the engine header, the GUI legend and the Design Guide: A the
critical zone for high-risk operations, B its background, C and D cleanrooms
for less critical stages.  The 10 Pa figure is Annex 1 para 4.14's guidance
value, quoted as one fact and cited.  The text was read from the
Commission's PDF of 22 August 2022 (pp. 6-8, paras 4.4, 4.12-4.14, and the
glossary entry "Airlock").  The PDF carries no reuse notice of its own; what
was relied on is the Commission's document-reuse policy (Commission Decision
2011/833/EU), under which Commission documents may be reused provided the
source is acknowledged.  No table is transcribed from Annex 1 -- none is
needed: the grade particle limits are not checked.

Annex 1 is written for STERILE products.  A tablet plant borrows its grade
vocabulary and its rule of thumb by declaration; that is why the grade and
the step are the case's statements with their source, never values looked
up.  `CNC` (controlled, not classified) is the industry's word for a room
with no grade.

The ISPE Baseline Guides (Volume 2, *Oral Solid Dosage Forms*; Volume 7,
*Risk-Based Manufacture of Pharmaceutical Products*) are cited by title
only; their tables grant no redistribution and none is transcribed.

The ATEX zones use the IEC 60079-10-1 / -10-2 vocabulary (0, 1, 2 for gas;
20, 21, 22 for dust) as words; no zoning table is shipped.

## 5. Where it lives

* Engine: `src/postProcessing/layout/BuildingLayout.{H,cpp}` (its own files:
  C96 was editing `PlantLayout.{H,cpp}` the same day).  Run from
  choupoSolve's layout hook right after `plantLayout::evaluate`, given the
  plot plan's record; an empty record when no `building` is declared.
* Record: `src/core/BuildingRecords.H`, carried on `SimulationResult::building`.
* JSON: `src/result/BuildingJson.{H,cpp}` writes the top-level `"building"`
  block, one record per line with an `"id"`; one call in `ResultEmitter.cpp`.
* Golden: the `layout` kind reads the block (get_layout's block regex), and a
  SEPARATE generator pass in `bin/runTests` emits its rows, so every existing
  layout row is untouched.
* GUI: `gui/src/adapters/buildingPayload.ts` (types and shaping, one import
  in each adapter), `gui/src/case/gmpBuilding.ts` (pure: the cutaway scene,
  the per-floor plan), `gui/src/ui/plotting/gmpBuildingRenderer.ts` (three.js,
  drawn into the plot plan's scene through `layoutRenderer`'s ONE hook,
  `MountOptions.extend`), `gui/src/ui/GmpBuildingSection.tsx` (Reports:
  legend, 3D with a toggle per flow kind and for the rooms, SVG plan per
  floor, room schedule, findings).  "Export as page" carries the building
  (the stash and the export input gained an optional `building`) and the
  offline viewer draws it with the same toggles.

## 6. The gate -- `check_gmp_layout`

Its docstring lists the arms and the by-hand sabotages.  In short: a clean
probe (17 rooms, two floors, three flows) raises nothing and nothing is
recomputed; twelve probes each built to fire a rule, on each of which the
engine's finding list -- ids, values and limits -- EQUALS a list recomputed
in Python from the published rooms, connections and flows alone; the three
surfaces; seventeen refusals; absence is silence (and the `layout` block is
unchanged by the building's presence); the golden pins the block and fails
on a 1 Pa move.  Seven sabotages, all caught; one arm (the caveat block) was
found SURVIVING on the first run -- it searched to the end of stdout, where
the result JSON carries the same sentence -- and was narrowed to the block.

## 7. Byte-neutrality, measured

A build of origin/main (`b1a54185b`) and this branch ran
`ammonia02_full_plant`, `greenAmmoniaPEQ_baseCase`, `aceticAcid02_plant`
(the three corpus layouts), `sprayDryer07_design` and
`ChemicalPlantTutorial`: stdout and stderr identical, the banner's commit
stamp aside.

## 8. Not in this slice, named

* The building envelope in the plot area (above, §3) -- done in §9.
* The `?layout=` pop-out tab does not draw the building (Reports and the
  exported page do).
* A pipe through a room's wall, door positions, door widths, corridor
  widths, travel distances, air-change rates, HVAC, particle classes.
* The corpus witness: the apalutamide case (phase A) is wired by the
  commander after both phases land -- done in §9.

## 9. The wiring (DEV.md 4c C97, after phases A and B)

**The witness.**  `tutorials/plant/apalutamide01_tablets` declares its
interior: 35 rooms on a production floor (0-5 m) and a technical floor
(5.5-10 m), 54 openings, eight flows of all three kinds, one `shared`
corridor, and the engine raises NO finding on it (the case's two plot-plan
exercises, a separation and a single entrance, stay as they were).  An
oral-solid-dose suite: the product-exposed rooms grade D BY ANALOGY (Annex 1
is written for sterile products, and the case says so), the rest CNC; the
dispensary and the granulation-and-compression train CONTAINED on the
assumption that the bought API is potent, its exposure band to be confirmed
from the supplier's safety data sheet; a contained personnel corridor
entered through a bubble airlock and a contained return corridor that takes
the waste out through a sink, so waste never crosses a room the product
does; the product one way, east to west and back south to the warehouse.
Every value is an author-set assumption, said so in the file.

**`envelope <id>;` -- a decision taken on a stated default.**  The case's
plot plan already had the building as one non-process item, and three of
its checks read that item (the separation exercise, the road access, the
ignition), so removing it would have removed an exercise.  Leaving it made
the building impossible: the item stands inside every room, and the engine
refuses a placed item inside a room that does not list it.  So the building
may name the non-process item that IS its shell: every room must lie inside
that item's box (refused otherwise), the item is the one placed item a room
may stand inside without listing it, it must be non-process (refused
otherwise), and the GUI draws it as glass.  Absent the key, nothing changes.
The limit, named: with an envelope no placed item can stand inside the
building at all, because the PLOT PLAN refuses two items that share a
volume, before the building is read -- so the solid-dose machines could not
be put in their rooms even if they had a size, and the case's coating tank
cannot be moved into the coating room.  Lifting that needs the overlap, the
separation and the pipe-clash rules each to treat a shell as a container:
not built.

**The plot.**  The rooms' plan boxes enter `plotOf` (record of the plant
layout, slice 8); `roomBeyondPlot` is retired, its gate probe replaced by
arm (e) (without the building the plot is smaller, inside the building's,
and its rule names no building) and by a check, on every run the gate makes,
that the published plot holds every room and says so.

Gate: `check_gmp_layout` (g) (the envelope: a clean shelled probe, and four
refusals) and (h) (the witness: published, shelled, zero findings
published and zero recomputed).

## 10. The EduTool (DEV.md 4c C101)

*The GMP interior of a tablet plant: rooms, air and the ways through them*
(`tool=gmp-layout`, shelf Process design & economics, beside `plant-layout`
and linked both ways; `gui/src/ui/methods/GmpLayoutTool.tsx`, its text in
`gmpLayoutLesson.ts`, its moves in `gmpLayoutExercise.ts`), on the eight-part
scope Vítor approved on 2026-10-19: grades, the pressure cascade, airlocks,
gowning, containment, the three flows, solvents and ATEX, escape, and what
the model does not do.

**No new case.**  The standing rule of 2026-10-17 (no new tutorial case for
an EduTool) is kept the way the gate keeps it: the bench is a COPY of
`tutorials/steady/drying/sprayDryer07_design` (one sized spray dryer) made in
the browser, with the teaching building -- seventeen rooms on two floors,
seeded from this gate's clean probe -- written in as its
`system/layoutDict`.  That file is `gui/src/ui/methods/gmpTeachingBuilding.layoutDict`,
a plain dictionary the page shows and a student can run at home; the
tutorial on disk is not changed and no golden moves.  Its header says what
the probe's never had to: the host dries WATER, and the suite's zone 1 is
the teaching building's declaration, not that dryer's hazard.

**Each move is an edit of the declared text** (a grade, a pressure, a
regime, a door's type, a path), exact and required to land exactly once, and
the page draws only what the engine published: its `[building]` lines and
any refusal verbatim, the findings, and the floor plan.  Every move's
finding ids are held to a NATIVE run of the exact file map the browser sends
by `gui/tests/gmpLayoutLesson.test.ts` (the `caseAssembly` precedent), as is
every `file:line` the lesson cites into `BuildingLayout.cpp`.

