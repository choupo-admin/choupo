#!/usr/bin/env python3
"""Gate: a plant layout is DECLARED by the case, CHECKED by the engine, DRAFTED by a tool.

    bin/curate/check_plant_layout.py
    bin/curate/check_plant_layout.py --keep DIR    run, keep the runs in DIR, check

WHY THIS EXISTS (2026-10-17, DEV.md 4c C75).  `system/layoutDict` places the
sized items of a run on a plot plan; the engine reads each item's FOOTPRINT
from its own sizer (a diameter and a length) or from a box the case declares,
REFUSES what is not a layout (an unknown or internal item, an item placed
twice, two footprints that overlap, a malformed declaration), and ANNOUNCES
what is a layout the student must defend (a pair closer than its declared
separation, an item outside its sector's area, an ignition source inside a
declared hazardous-area zone or downwind of a release source, a rule that
names no placed kind, the sized items left out).  `bin/choupo-layout --draft`
writes a proposal from the topology and the sizes.  Every distance, zone and
angle is the CASE's own; no table is shipped.

The risks such a feature carries are specific, and each arm names one:

  (a) THE WITNESS (`tutorials/plant/ammonia02_full_plant`) runs and publishes
      the block; each vessel's extents equal the D and H on its OWN design
      sheet (design/<unit>/vessel, read here as text -- an independent home
      for the footprint rule); and the one separation finding's distance is
      RECOMPUTED here from the published positions and extents
      (circle-to-circle, edge to edge) and agrees.
  (b) THE ANNOUNCEMENT REACHES ALL THREE SURFACES: stderr at its site, the
      end-of-run caveat block under PLANT LAYOUT, and the result JSON
      (`advisories` AND `layout.findings`).
  (c) REFUSALS, each fired through the real reader on a copy of the witness
      and each required to exit 2 and NAME its defect: an unknown item, an
      item placed twice, an overlap, a footprint declared on an item that
      publishes its own size, an item that publishes none and declares none,
      an angle with no unit, a zone that is not 0/1/2, areas on a flat case,
      one pair of kinds declared twice; on a column: its tray stack (an
      internal) placed on its own; on the sectored flagship: an area for a
      sector the case does not have.
  (d) THE HAZARD ANNOUNCEMENTS: a non-process ignition source moved into the
      let-down drum's zone 2 and the wind turned to blow at it raise an
      `ignitionInZone` and `ignitionDownwind` finding each, with the
      distances recomputed here; a rule naming an absent kind raises a
      `deadRule`; on the sectored flagship an area that leaves an item out
      raises `outsideArea`.
  (e) THE DRAFT TOOL: on the flagship (no layoutDict) it writes a file headed
      as a DRAFT, the same run checks it (block published, zero findings),
      areas are written per sector, items with no size of their own are
      listed for the student and not placed; run again without --force it
      REFUSES and leaves the file byte-identical; with --force on the witness
      it carries the separation table, the declared footprints, the hazards,
      the non-process item and (C82) the plot margin, and its own check
      finds no shortfall (C134: it says it did NOT carry the `bunds`, and
      the liquid stores it lines up are announced unbunded -- the only
      findings it may raise).
  (f) ABSENCE IS SILENCE: the witness with its layoutDict removed publishes
      no `layout` key, prints no `[layout]` line and no PLANT LAYOUT heading.
  (g) A PLACED ITEM WHOSE SIZER REFUSED (2026-10-17, DEV.md 4c C79, the
      commander's decision): on a copy of the witness whose postDict makes
      the separator's sizer refuse (a flow KPI the unit does not publish),
      the run exits 0, the separator is NOT placed, a `sizingRefused`
      finding names it and quotes the sizer's own FAILED line, and the
      announcement reaches stderr, the caveat block and the JSON.  The
      negative, on the same sabotaged sizing: an item `separatorX` (a name
      that merely STARTS with the refused entry's) still refuses as naming
      no sized item -- the id belongs to an entry only as the entry itself
      or `entry/<tag>` (`EquipmentSizing::isItemOf`).

  (h) THE PIPES (2026-10-17, DEV.md 4c C80), on the three plants that carry
      a layout, all three on DECLARED racks (ammonia02_full_plant since C93,
      when its tank farm dragged the stated default onto the main road; the
      stated default is exercised on a copy of it with `pipeRack` removed):
      every stream of the stream table (one per identity: an entry marked
      `aliasOf`/`boundaryLabel` is a label, an independent home for the set)
      is routed or listed in `notRouted` with a reason, never both, never
      dropped; every route is ORTHOGONAL (each segment along one axis), its
      published length is the polyline's own (recomputed here), and its two
      ends are where the published block puts them -- an item's top centre,
      a junction's node, the rack's xStart/xEnd for a battery limit (with a
      fence, the published crossing ON the fence); a rack route claims no
      override; the default rack (the probe) is published as such and
      ANNOUNCED on stderr, the caveat block and the advisories, a declared one
      announces nothing; each pipe REPRODUCES its golden `layout` rows (from,
      to, length), every published pipe is pinned and every pinned pipe is
      published, and the summary's pipe counts agree three ways.  SOLIDS ARE
      NOT PIPED (DEV.md 4c C97; `apalutamide01_tablets` is the fourth pipe
      plant for it): from the stream table alone, every stream whose fluid
      mass is zero and solid mass is not is never routed and is listed with
      `solids`, the reason and no anchor; nothing else is listed `solids`;
      and no published junction is a unit every stream of which is solids
      (each unit's streams read from the published pipe and not-routed
      ends).  A plant with a declared `pipes` override is not required to
      route every pipe on the rack.  The witness
      routes EVERY stream: its `notRouted` must be empty (Vitor, C93: "there
      are compressors that have no inlets").
  (i) A DECLARED ROUTE: on a copy of the witness, `pipes { rawLiquid {
      waypoints (...) } }` is honoured (separator top -> two waypoints ->
      let-down top, `routedBy waypoints`, no lane) and its length recomputed;
      REFUSED, each exit 2 and naming its defect: a diagonal segment, an
      override naming no stream, an override on a stream with no routable end
      (`productNH3`, once T201's bullets are taken off the copy's plot plan: a
      sized unit none of whose items is placed), a partial `pipeRack`, a
      fractional
      `lanesPerTier`.  THE UNROUTED MARK (C93): on the same copy with no
      override, `productNH3` is listed with `fromUnit letdown`, `toUnit T201`
      and an `anchor` equal to the routed pipe's first point (the let-down's
      nozzle -- where the 3D view marks the missing pipe), and
      `productStored`, which reaches no end, carries no anchor.  The forced
      draft carries a declared rack as declared and says it did not carry the
      waypoint overrides.

  (j) THE PLOT (2026-10-17, DEV.md 4c C82), on the same four plants and on
      two fixtures of the sectored flagship: the published plot RECOMPUTED
      here from the published items, areas and pipe routes by the stated
      rule (envelope + the margin read from the case's own layoutDict, 0 m
      where it declares none; with a declared `building {}`, its rooms'
      plan boxes too, and the published sentence must name them exactly
      when a building is declared -- DEV.md 4c C97), and its area; the footprint area recomputed
      (a vertical cylinder's disc, any other item's rectangle) and its share;
      a declared margin announces nothing, an absent one is ANNOUNCED on
      stderr, the caveat block and the advisories (aceticAcid02); every
      published plot / plotSector number is pinned by a golden row and every
      pinned one is published.  On the flagship: two declared sector areas
      that overlap -- their union and the shared ground recomputed, the
      overlap announced, each sector's area its declared one; then one area
      declared and a margin -- the undeclared sector's area is the envelope
      of its own footprints, the margin grows the plot.  REFUSED, exit 2 and
      named: a negative margin, a plot block with no reason.

  (k) THE ROADS (2026-10-18, DEV.md 4c C90), on the witness, which declares
      two gates, a canteen, a warehouse and nine roads: each road's published
      length is its centre line's own and the network's is their sum (both
      recomputed here); the PAVED AREA is recomputed here as the union of the
      paved rectangles on the grid of their own edges -- an independent
      implementation of the rule; the crossing under the rack is recomputed
      from the published rack band and the published clearance is the rack's
      elevation, at least the declared headroom; every item's ACCESS distance
      (footprint edge to the nearest paved rectangle of a road a gate
      reaches) is recomputed here and each is within the declared distance,
      so the witness raises no road finding; the plot recomputed by arm (j)
      includes the paved rectangles (this arm requires that the plot would be
      SMALLER without them, so the roads are in the envelope); every
      published road length, network length, paved area and access distance
      is pinned by a golden row and every pinned one is published.  Then on
      copies of the witness, REFUSED (exit 2, named): a road through a
      footprint (the converter), a road under the rack with a headroom above
      the rack's 6 m, a pipe below the headroom over a road (a waypoint
      route), a diagonal road segment, a road declared twice, a waypoint
      carrying a `z`, a roads block with no `access`, a non-process item with
      a `source` and no `reason`.  ANNOUNCED (stderr, the caveat block and
      the JSON, values recomputed here): a road in a zone the case closes to
      traffic (the makeup compressor's zone 2 grown to reach the west road,
      with `noTraffic ( 1 2 )`), a road no gate reaches, a site building no road
      serves, a process item beyond the access distance, a network with no
      gate, a weighbridge no road crosses -- and its negative: a weighbridge
      the main road runs OVER is not refused as a road through a footprint,
      is published `onDeck`, and raises nothing.  The forced draft says it did
      not carry the roads and carries each site building's source and reason.

  (l) THE FENCE (2026-10-18, DEV.md 4c C93), on the witness, which declares
      a fence with inset 0 and six crossings: the fence RECOMPUTED here from
      the published plot (moved by the inset read from the case) and its
      length; each gate opening recomputed (the side nearest the gate, the
      serving road's centre-line vertex nearest that side, the road's width);
      every road's paved rectangle meets the fence only inside an opening;
      each crossing recomputed (its side -- west for an inlet, east for an
      outlet, or the declared one; its point -- the pipe's lane y and height,
      or the declared `at` on the fence line; its label and direction) and
      the pipe's battery-limit end IS that point; the witness raises no
      `unlabelledCrossing`; every published fence / opening / crossing number
      and word is pinned by a golden row and every pinned one is published.
      ANNOUNCED (stderr, caveat block, JSON, exit 0): a crossing with no label
      (the `makeup` entry removed from a copy); a fence with no gate.
      REFUSED (exit 2, named): a road through the fence at no gate (inset
      6 m pulls the fence across the east road), an item across the fence
      (no roads, inset 6 m), a negative inset, a crossing for a stream that
      does not cross the battery limit (`mixed`), an outlet labelled `from`,
      `side north` with no `at`, an `at` outside the fence, a stream declared
      twice.

  (m) THE PIPE CLASH (2026-10-18, DEV.md 4c C93): on the three shipped
      layouts, the engine's `pipeClash` findings equal the (pipe, item) pairs
      recomputed here from the published routes and items -- a segment whose
      plan path is strictly inside the item's footprint (a vertical
      cylinder's disc, any other item's rectangle) while its elevation lies
      strictly between the item's base and top, the pipe's own end items
      excepted -- empty on all three today.  Two probes on copies of the
      witness, each exit 0 with the clash ANNOUNCED by name on stderr, the
      caveat block and the advisories, at the pipe's elevation and with the
      item's top as the limit: the warehouse moved onto the makeup line (a
      box), and rawLiquid routed by waypoints 5 m up through the converter
      (a vertical cylinder).  The negative: rawLiquid turned 5 m up at the
      converter's plan CORNER (inside the disc's bounding square, outside the
      disc) raises no clash.

  (n) THE SITE LOGISTICS (2026-10-18, DEV.md 4c C96), on the witness, which
      declares a design vehicle, a one-way truck loop, a car park, two gates,
      muster points and the fire pumps: the truck route WALKED AGAIN here by
      an independent implementation of the rule (from the gate's fence
      opening along each declared road to where it meets the next, a road
      named twice driven to its far end and back) -- its path point by
      point, its length, every corner's turn, declared radius (the smaller of
      the two roads'), outer edge (radius + half the narrower road) and
      verdict; the route CLEAR (no reversal, every outer edge at least half
      the turning diameter, consecutive corners at least their two radii
      apart), over the placed weighbridge (the deck crossing recomputed),
      past every `serves` stop (its road point on the path), gate to gate;
      the car park laid out again (rows, bays per row, capacity, area) and
      every published bay inside the footprint with a unit exit direction,
      left nose first; the witness raises no site-logistics finding; every
      C96 number and word pinned and every pinned one published.  ANNOUNCED
      (exit 0, stderr, caveat block, JSON), values recomputed where they
      have one: a sharp corner (the main road's radius 5 m: outer 8 against
      12.5 m), two corners too close (21 m against 24), a one-way road driven
      backwards, a route that turns back with no turning area (and so misses
      the weighbridge), a dead end turned in a turning area big enough
      (CLEAR, the reversal named in `tankFarmEnd`) and one too small (16
      against 25 m), a weighbridge and a stop the route misses, a route
      ending at a building, a muster point downwind of the separator and
      the let-down drum (distances recomputed), the fire pumps in the
      makeup compressor's zone 2 (distance recomputed), one entrance, bays
      left by reversing.  REFUSED (exit 2, named): more bays than the
      footprint holds, `parking {}` on another kind, a car park with none, a
      bay at 20 deg, routes with no design vehicle, an unknown road, two
      roads that do not meet, a route from no placed item, an approach
      through an item, a turning area through an item, a negative corner
      radius, a `oneWay` word that is no word.  The approach is held in arms
      (k) (the paved area includes it) and (l) (recomputed per opening).
  (o) ITEMS INSIDE THE BUILDING (2026-10-19, DEV.md 4c C100), on
      apalutamide01, whose every process item but the two bulk-solvent tanks
      stands in a room of its GMP building, from the published block alone:
      no pipe is drawn to the nozzle of an item indoors; every pipe end at a
      unit whose item stands indoors is a `wallPenetration`, lying on a side
      face of a building's box between its base and top (arm (h) checks the
      same for every plant); every stream listed `indoor` has an end at an
      indoor unit, and its anchor (when any) marks no item indoors; the
      streams between two ends indoors (sprayFeed, loopGas, gasRecycle,
      exhaustGas, coatingSuspension) are listed as indoor piping, unmarked;
      no separation finding and no access record names an item indoors; the
      plant's declared outdoor legs are exactly the two solvent lines through
      the east wall.  Its layout with the `pipes {}` block removed lists both
      lines `indoor`, each marked at the top of its tank.  REFUSED, named: a
      wall penetration off the wall, an override on a stream both of whose
      ends stand indoors.  Arms (h) (`on_a_wall`), (j) (an indoor item's plan
      area left out of the footprints) and (m) (no clash with an indoor item:
      the shell answers for it) read the item's `room`.
  (p) SECONDARY CONTAINMENT (2026-10-21, DEV.md 4c C134), on the two
      witnesses: greenAmmoniaPEQ_baseCase (a BUND round its two refrigerated
      tanks, declared boxes, and a kerbed IMPOUNDING slab under the loop's
      three liquid vessels) and ammonia02_full_plant (an IMPOUNDING area
      under the seven T201 bullets, its pit remote).  For every published
      containment, recomputed HERE: the area (the outline's shoelace), the
      volume the enclosed footprints displace below the wall's top (disc,
      lying cylinder's circular segment, box -- an independent
      implementation), the net volume, the required volume -- each term on
      the declared basis read off the DESIGN SHEETS as text (`V_R` for
      `vesselVolume`, the liquid phases' `volume` of the sheet's `inventory`
      for `heldLiquid`), a `depth` allowance over the catch area and the pit
      -- and the verdict word; every published number and word pinned by a
      `layout` golden row; each witness adequate, no item of it unbunded, an
      impounding pit outside its catch area.  The green witness with its
      `bunds` removed publishes no `bunds` and announces EXACTLY the five
      items whose sheets hold liquid, each on stderr, the caveat block and
      the advisories, with its sheet's volume.  ANNOUNCED, the run going on:
      the tank bund with a 2 m wall (SHORT, its finding's value and limit the
      published net and required, those recomputed); an open drain; a pit
      moved into its catch area; the catch area's kerb moved across a road;
      a declared pipe route at 0.1 m through the kerb.  The bullets in a 2 m
      BUND displace their circular segments (recomputed, and less than 90 %
      of their bounding boxes).  An L-shaped POLYGON wall round the tanks
      publishes its shoelace area and is recomputed like the rest; a
      bow-tie polygon is refused as crossing itself.  REFUSED, exit 2 and named: a listed item
      outside the wall, an unlisted item inside it, a wall through a
      footprint, no capacity rule, an unknown kind, a bund with a pit, an
      unknown basis, an impounding area with no pit, a pit under an item, an
      item in two containments, two containments sharing a floor.  Arm (j)
      recomputes the plot WITH the walls' outlines and the pits, and holds
      the plot sentence to name a containment exactly when one is declared.

NOT COVERED, said so: whether a declared distance or zone extent is SENSIBLE
(the author's assumption, by design -- no standard is shipped), a pipe's
pressure drop and cost (none is computed), a pipe clashing with another pipe
or crossing a road's paved surface below the headroom outside the road
check, structures, rotations other than the two plan axes, a road's
gradient, a truck's swept path (only each corner's outer edge is checked),
how a car reaches a car park's aisles, whether a declared headroom or access distance is
sensible (the author's assumption, as every distance here), the GUI
drawing (its pure scene mapping, phase, speed, declutter and camera fit are
tested in gui/tests/plantLayout.test.ts), and byte-identity of the cases
without a layout (measured once, not gated).

SABOTAGES performed by hand (2026-10-17; each restored with `git checkout`
and one idempotent `make all`; all CAUGHT, two only after the gate was
strengthened):
  S1 `clearPlan` circle-circle returns the CENTRE distance        -> (a) the
     engine's 3.5 m against the 1.886 m recomputed here; (c) the overlap
     fixture exits 0.
  S2 the overlap refusal's condition inverted to `c > kTol`        -> (a) the
     witness itself refused; (c), (d), (e) every fixture refused.
  S3 `announce()` writes stderr only, no AdvisoryLog::add         -> (b) no
     PLANT LAYOUT block, no advisory in the JSON; (d) neither hazard finding
     in the caveat block.
  S4 the draft skips the `layoutDict && !force` refusal            -> (e) exit 0.
     The file-unchanged half did NOT fire on its own: the tool is
     deterministic, so its overwrite was byte-identical to what it replaced.
     The arm now appends a student edit before the second draft (S4b: caught
     on both halves).
  S5 `publishedFootprint` reads (D, D) instead of (D, H)           -> (a) dz
     against the design sheets' H, all three vessels.
  S6 the downwind direction taken as `from`, not `from + 180`      -> (a) two
     spurious downwind findings on the witness; (d) three missing.
  S7 the zone check's VERTICAL test removed                        -> SURVIVED
     first: every fixture item stood at grade, so the height half of the
     envelope had no case.  The hazard fixture now carries a panel 20 m up,
     inside two zone radii in plan and above both envelopes -> caught.
  (C79, arm (g), 2026-10-17; each restored with `cp` of the saved file
  and one idempotent `make all`, all CAUGHT):
  S8 `refusedSizingOf` returns nullptr at its top (the C76 behaviour) -> (g)
     "a layout placing an item whose sizer refused exited 2".
  S9 `EquipmentSizing::isItemOf` loses its `id[unit.size()] == '/'` test
     (a bare prefix match)                                          -> (g)
     "`separatorX` beside a refused `separator` exited 0".
  S10 `addFinding` skips `announce()` for a sizingRefused finding (the
     finding still published in `layout.findings`)                 -> (g)
     not on stderr, not in the caveat block, not in the advisories.
  (C80, arms (h) and (i), 2026-10-17; each restored with `cp` of the saved
  PlantLayout.cpp and one idempotent `make all`, all CAUGHT on first run):
  S11 the length taken end to end, not along the polyline          -> (h)
     every pipe's length against its own polyline and its golden row.
  S12 the corner across to the lane dropped                         -> (h)
     every rack route moves along two axes at once.
  S13 declared waypoints ignored (always the rack)                  -> (i)
     the override not honoured, its length wrong, the diagonal one exit 0.
  S14 the default-rack announcement removed                         -> (h)
     ammonia02's default rack said on no surface.
  S15 a stream with no routable end dropped without a `notRouted` row -> (h)
     four ammonia02 streams neither routed nor listed; the summary count
     against the golden.
  S16 a junction placed at its FIRST placed neighbour, not the mean -> (h)
     the junction-touching pipes' lengths against their golden rows.
  (C82, arm (j), 2026-10-17; each in PlantLayout.cpp, restored byte for
  byte (sha256 checked) and the engine rebuilt; all CAUGHT on first run):
  S17 the margin left off the plot's x extent                      -> (j)
     ammonia02, greenAmmoniaPEQ and the flagship fixture: the plot against
     its recomputation and the golden.
  S18 a vertical cylinder's footprint counted as its square        -> (j)
     the footprint area on all three plants and their golden rows; the
     flagship's FERMENTATION sector.
  S19 the absent-margin announcement removed                       -> (j)
     aceticAcid02 says it on no surface.
  S20 the union of the sector areas counts shared ground twice     -> (j)
     the flagship: union 1200 m2 / overlap 0 against 1000 / 200.
  S21 the routed pipes left out of the envelope                    -> (j)
     ammonia02's default rack reaches 5 m past the eastmost footprint and
     aceticAcid02's declared rack past its westmost: both plots short.
  (C90, arm (k), 2026-10-18; each in PlantLayout.cpp, restored byte for
  byte (sha256 checked) and the engine rebuilt; all CAUGHT on first run):
  S22 the road-through-footprint refusal skipped                   -> (k) the
      fixture still exits 2, but on the pipe riser it then meets, and the
      arm requires the refusal to NAME the converter.
  S23 the paved area summed per rectangle (no union)               -> (k)
      2400 m2 against the union's 2140.75 m2, and the golden row.
  S24 the roads left out of the plot envelope                      -> (k) the
      plot 9535.5 m2 against 11918.5 m2 recomputed with the roads.
  S25 the rack-crossing headroom test inverted                     -> (k) the
      witness itself refused (6 m > 5 m now reads as too low).
  S26 the access distance measured to the centre line, not the
      paved edge                                                   -> (k)
      every access distance off by half its road's width.
  S27 connectivity taken as "every road joined"                    -> (k) the
      island road raises no roadDisconnected.
  S28 the roadInZone finding never raised                          -> (k) the
      closed-zone fixture publishes none.
  (S14 and S21 were caught on ammonia02's default rack; since C93 that rack
  is declared and the default lives on the probe copy, which (h) reads.)
  (C93, arm (l) and the unrouted mark, 2026-10-18; each in PlantLayout.cpp
  or ResultEmitter.cpp, restored with `cp` of the saved file and one
  idempotent `make all`; all CAUGHT on first run):
  S29 the fence taken as the plot itself, the inset ignored         -> (l) the
      road-through-fence and item-across-fence probes no longer refuse (both
      depend on the 6 m inset).
  S30 a gate opening centred on the GATE's x, not the road's        -> (l) the
      opening against its recomputation and its golden row.
  S31 the road-at-no-gate refusal disabled                          -> (l) the
      probe exits 2 on a DIFFERENT message (the item it then meets), and the
      arm requires the refusal to name the road and the side.
  S32 the unlabelledCrossing finding never raised                   -> (l) the
      unlabelled probe announces nothing.
  S33 an inlet's default side taken as east                         -> (l) the
      makeup crossing against its recomputation and its golden row.
  S34 a default crossing placed at grade (z = 0), not the lane       -> (l) the
      witness itself exits 2: the pipe's drop to grade runs under the road
      headroom.
  S35 the notRouted anchor not emitted                              -> (i) the
      unrouted mark: productNH3 carries no anchor.
  (C93, arm (m), 2026-10-18; in PlantLayout.cpp, restored with `cp` of the
  saved file and one idempotent `make all`):
  S36 the pipe-clash check's elevation test inverted (a clash only ABOVE
      the item)                                                     -> (m)
      both probes announce nothing.
  S37 the disc taken as the circle's bounding square                -> (m)
      the corner negative publishes pipeClash:rawLiquid:converter.
  (C96, arm (n) and the approach, 2026-10-18; in PlantLayout.cpp, run
  against the moved rows re-recorded in a scratch copy, restored with `cp`
  of the saved file -- byte-identical, `cmp` -- and one `make all`):
  S38 a corner's radius the LARGER of the two roads'                -> (n)
      the sharp-corner probe announces nothing.
  S39 the outer edge on the WIDER road                              -> (n)
      the witness's corners against their walk (13.5 against 13 m).
  S40 the car park's end aisles dropped                             -> (n)
      capacity 32 against the 22 recomputed here.
  S41 the approach left out of the paved area                       -> (k)
      3287.75 m2 against the union recomputed here, 3370.25.
  S42 the one-way check disabled                                    -> (n)
      the wrong-way probe announces nothing.
  S43 the muster point's downwind announcement dropped              -> (n)
      the downwind probe announces nothing.
  C97 wiring, 2026-10-19, by hand, each on a rebuilt engine, arm (h):
  S11 `solidsOnly` always false: "apalutamide01: solids-only stream(s)
      routed as pipes: [apiFeed, asdPowder, ...]".  CAUGHT.
  S12 a junction no longer asks whether its streams are all solids: six
      "junction blender (... tabletPress) is on the rack and every stream of
      it carries only solids".  CAUGHT.
  S13 the plot sentence does not name the building: arm (j) "the plot rule
      and the run disagree".  CAUGHT.
  C100 (items inside the building), 2026-10-19, by hand, each on a rebuilt
  engine (the sabotaged PlantLayout.cpp restored by copy and rebuilt after):
  S44 the shell's exemption for the items its rooms list dropped        -> (o)
      "the apalutamide plant exited 2" (`SD` OVERLAPS the building).
  S45 an indoor item's plan area counted in the footprints again        -> (j)
      3743.13 m2 published against the 3734.76 recomputed here.
  S46 the wall-penetration test disarmed (the whole condition)          -> (o)
      "a wall penetration off the wall: the run was NOT refused".
  S47 a junction piped only to indoor items no longer stands indoors    -> (o)
      loopGas, gasRecycle and coatingSuspension listed for an unreachable
      junction, not as indoor piping.
  S48 the access record no longer skips an item indoors                 -> (o)
      "an access record for `SD`, which stands indoors" (and six more).
  C134 (secondary containment), 2026-10-21, by hand, each on a rebuilt
  engine (PlantLayout.cpp restored by copy and rebuilt after), arm (p):
  S49 the displaced volume dropped (net = gross)                        -> (p)
      "displaced/net 9248/29920 m3; recomputed 9248.0/20672.0" (and the two
      fixtures).
  S50 the unbunded announcement disarmed                                -> (p)
      each of the five liquid holders "must be announced `unbundedLiquid`".
  S51 a listed item outside the wall no longer refused                  -> (p)
      the run is refused for another reason that does not NAME the outside
      item -- caught by the needle, not by the exit code.
  S52 a lying cylinder displaces its bounding box                       -> (p)
      2334.47 m3 against the segments' 1681.47 recomputed here.
  S53 a pipe through a wall tested ABOVE its top                        -> (p)
      the 0.1 m route through the kerb announces nothing.
  S54 a depth allowance over the catch area only (the pit dropped)      -> (p)
      "allowance rain 9.6 m3; 0.05 m over 204.0 m2 gives 10.2".
"""
import json
import re
import shutil
import subprocess
import sys
import tempfile
import hashlib
from math import hypot, atan2, degrees, pi, sin, cos, radians, floor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BIN = ROOT / "choupoSolve"
TOOL = ROOT / "bin" / "choupo-layout"
WITNESS = ROOT / "tutorials/plant/ammonia02_full_plant"
FLAGSHIP = ROOT / "tutorials/plant/ChemicalPlantTutorial"
APALUTAMIDE = ROOT / "tutorials/batch/plant/apalutamide01_tablets"
COLUMN = ROOT / "tutorials/steady/distillation/column09_tray_hydraulics"
ENV = {"CHOUPO_HOME": str(ROOT), "PATH": "/usr/bin:/bin"}

fails = []
claims = []


def fail(msg):
    fails.append(msg)


def prepare(work, name, src, edit=None, drop_layout=False):
    d = work / name
    if d.exists():
        shutil.rmtree(d)
    shutil.copytree(src, d, ignore=shutil.ignore_patterns(
        "reports", "converged", "design", "iterations"))
    lay = d / "system" / "layoutDict"
    if drop_layout and lay.exists():
        lay.unlink()
    if edit is not None:
        lay.write_text(edit(lay.read_text() if lay.exists() else ""))
    return d


def run(cmd, cwd=ROOT):
    p = subprocess.run(cmd, capture_output=True, text=True, cwd=str(cwd),
                       timeout=900, env=ENV)
    return p.stdout, p.stderr, p.returncode


def solve(d, *extra):
    return run([str(BIN), *extra, str(d)])


def result_json(out):
    m = re.search(r"<<<Choupo:result-begin>>>\s*\n(.*?)\n<<<Choupo:result-end>>>",
                  out, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return None


def sheet_value(d, rel, key):
    """A sizing value read off a design sheet as TEXT (`key  12.3 m;`)."""
    t = (d / "design" / rel).read_text()
    blk = t[t.index("\nsizing"):]
    m = re.search(r"^\s+" + re.escape(key) + r"\s+([-0-9.eE+]+)\s", blk, re.M)
    return float(m.group(1)) if m else None


def clear_circles(a, b):
    return hypot(a["x"] - b["x"], a["y"] - b["y"]) - a["dx"] / 2 - b["dx"] / 2


def point_to_box(px, py, i):
    gx = max(0.0, abs(px - i["x"]) - i["dx"] / 2)
    gy = max(0.0, abs(py - i["y"]) - i["dy"] / 2)
    return hypot(gx, gy)


# --------------------------------------------------------------- arms -----
def arm_witness(work):
    d = prepare(work, "witness", WITNESS)
    out, err, rc = solve(d)
    if rc != 0:
        fail(f"(a) the witness exited {rc}:\n    " + (err.strip().splitlines() or [""])[-1])
        return
    j = result_json(out)
    lay = (j or {}).get("layout")
    if not lay:
        fail("(a) the witness published no `layout` block")
        return
    items = {i["id"]: i for i in lay["items"]}
    if len(items) != WITNESS_ITEMS:
        fail(f"(a) the witness places {len(items)} items, expected {WITNESS_ITEMS} (seven"
             " process items and the product store's seven bullets, sized, and the"
             f" {WITNESS_ITEMS - 14} site items -- control room, gates, buildings, car park,"
             " weighbridge, laydown, muster points, fire water, windsock)")
    #  The process vessels stand; the product store's bullets (DEV.md 4c
    #  C92) LIE -- a lying cylinder's plan extents are its length along its
    #  axis and D across, and its height is D.
    stores = [(f"T201/vessel{k}", f"T201/vessel{k}", False) for k in range(1, 8)]
    for unit, sheet, standing in [(u, f"{u}/vessel", True)
                                  for u in ("converter", "separator", "letdown")] + stores:
        D = sheet_value(d, sheet, "D")
        H = sheet_value(d, sheet, "H")
        it = items.get(unit)
        if it is None or D is None or H is None:
            fail(f"(a) {unit}: not placed, or its design sheet carries no D/H")
            continue
        if standing:
            want = (D, D, H)
        elif it.get("orientation") == "alongX":
            want = (H, D, D)
        else:
            want = (D, H, D)
        if any(abs(it[k] - w) > 1e-6 * w for k, w in zip(("dx", "dy", "dz"), want)):
            fail(f"(a) {unit}: published extents {it['dx']} x {it['dy']} x {it['dz']}"
                 f" are not its design sheet's D = {D}, H = {H}"
                 f" ({'standing' if standing else 'lying'})")
        if it["shape"] != "cylinder" or it["footprintFrom"] != "published":
            fail(f"(a) {unit}: drawn as {it['shape']}/{it['footprintFrom']}, not a"
                 " published cylinder")
    f = [x for x in lay["findings"] if x["id"] == "separation:separator:letdown"]
    if len(f) != 1 or len(lay["findings"]) != 1:
        fail(f"(a) the witness's findings are {[x['id'] for x in lay['findings']]},"
             " expected exactly separation:separator:letdown")
    else:
        mine = clear_circles(items["separator"], items["letdown"])
        if abs(mine - f[0]["value"]) > 1e-6 or f[0]["limit"] != 4:
            fail(f"(a) separator-letdown: the engine says {f[0]['value']} m against"
                 f" {f[0]['limit']} m; recomputed here {mine} m against 4 m")
    # (b) three surfaces
    msg = f[0]["message"] if f else "stand"
    if "[layout] " + msg not in err:
        fail("(b) the separation announcement is not on stderr at its site")
    if "PLANT LAYOUT" not in out or msg not in out.split("PLANT LAYOUT", 1)[-1]:
        fail("(b) the separation announcement is not in the caveat block under PLANT LAYOUT")
    if not any(a.get("category") == "layout" and a.get("message") == msg
               for a in (j.get("advisories") or [])):
        fail("(b) the separation announcement is not in the result JSON's advisories")
    claims.append(f"witness: {WITNESS_ITEMS} items, vessel extents = their design sheets' D/H"
                  " (standing, and T201's bullets lying),"
                  " the one shortfall recomputed edge to edge and announced on"
                  " stderr, the caveat block and the JSON")
    return lay


def sub(old, new):
    def f(text):
        if old not in text:
            raise RuntimeError(f"fixture anchor not found: {old!r}")
        return text.replace(old, new, 1)
    return f


def sub_all(old, new):
    """Every occurrence (a fixture that must reach both gates, C96)."""
    def f(text):
        if old not in text:
            raise RuntimeError(f"fixture anchor not found: {old!r}")
        return text.replace(old, new)
    return f


def chain(*fs):
    def f(text):
        for g in fs:
            text = g(text)
        return text
    return f


ITEMS_OPEN = "items\n(\n"
#  The witness's placed items: seven process items, T201's seven bullets and
#  (C96) fourteen site items.
WITNESS_ITEMS = 28
REFUSALS = {
    "unknown item": (sub(ITEMS_OPEN, ITEMS_OPEN
        + '    { item "noSuchItem"; x 200 m; y 0 m; z 0 m; orientation vertical; }\n'),
        [r"item `noSuchItem` names no sized item", r"Placeable items:.*converter"]),
    "placed twice": (sub(ITEMS_OPEN, ITEMS_OPEN
        + '    { item "converter"; x 200 m; y 0 m; z 0 m; orientation vertical; }\n'),
        [r"item `converter` is placed twice"]),
    "overlap": (sub("x           59.5 m;", "x           56.5 m;"),
        [r"`separator` and `letdown` OVERLAP", r"interpenetrate by"]),
    "footprint on a sized item": (sub('item        "converter";        // D and H from its own sizing',
        'item        "converter";  footprint { length 3 m; width 3 m; height 3 m; }'),
        [r"declares a `footprint`, but its sizer\s+already published its size",
         r"one item, one size"]),
    "no footprint, no size": (sub("        footprint   { length 8 m; width 4 m; height 4 m; }   // author-set\n", ""),
        [r"item `makeupComp` \(a `compressor`\) cannot be placed",
         r"No size is\s+invented"]),
    "angle with no unit": (sub("from        225 deg;", "from        225;"),
        [r"`from` carries no unit", r"the raw form is the radian"]),
    "zone not 0/1/2": (sub("{ zone 1; radius 1.5 m;", "{ zone 3; radius 1.5 m;"),
        [r"hazardous-area zone", r"Accepted.*0.*1.*2"]),
    "areas on a flat case": (lambda t: t + "\nareas { LOOP { xMin 0 m; xMax 10 m; yMin 0 m; yMax 10 m; } }\n",
        [r"`areas` are declared, and this case has no sectors"]),
    "pair declared twice": (sub("{ between ( vessel vessel );           distance 4 m;  }",
        "{ between ( vessel vessel );           distance 4 m;  }\n"
        "            { between ( vessel vessel );           distance 6 m;  }"),
        [r"between `vessel` and\s+`vessel` is declared twice"]),
}


def arm_refusals(work):
    n = 0
    for label, (edit, pats) in REFUSALS.items():
        d = prepare(work, "refuse_" + re.sub(r"\W", "_", label), WITNESS, edit)
        out, err, rc = solve(d)
        txt = out + err
        if rc != 2:
            fail(f"(c) {label}: exit {rc}, expected the refusal's 2")
            continue
        for p in pats:
            if not re.search(p, txt, re.S):
                fail(f"(c) {label}: the refusal does not say /{p}/:\n    "
                     + "\n    ".join(l for l in txt.splitlines() if "ERROR" in l)[:500])
        n += 1
    # an internal: the column's tray stack, placed on its own
    d = prepare(work, "refuse_internal", COLUMN,
                lambda _t: 'items ( { item "column09/trays"; x 0 m; y 0 m; z 0 m;'
                           ' orientation vertical; } );\n')
    out, err, rc = solve(d)
    if rc != 2 or not re.search(r"is not placed on its own: it is a `sieveTrays`",
                                out + err):
        fail(f"(c) internal: column09/trays was not refused as an internal (exit {rc})")
    else:
        n += 1
    # an unknown sector, on the sectored flagship
    d = prepare(work, "refuse_sector", FLAGSHIP,
                lambda _t: 'items ( { item "DRYING.SD"; x 0 m; y 0 m; z 0 m;'
                           ' orientation vertical; } );\n'
                           'areas { NOWHERE { xMin 0 m; xMax 1 m; yMin 0 m; yMax 1 m; } }\n')
    out, err, rc = solve(d)
    if rc != 2 or not re.search(r"areas: `NOWHERE`", out + err) \
            or "FERMENTATION" not in out + err:
        fail(f"(c) unknown sector: NOWHERE was not refused naming the sectors (exit {rc})")
    else:
        n += 1
    claims.append(f"{n} refusals fired through the real reader, each exit 2 and"
                  " naming its defect")


ROADS_BLOCK = re.compile(r"\nroads\n\{.*?\n\}\n", re.S)


def drop_roads(text):
    """The witness's road network (C90), removed: a fixture that moves an
    item where a road runs is about the item, not the road."""
    out, n = ROADS_BLOCK.subn("\n", text)
    if n != 1:
        raise RuntimeError("fixture anchor not found: the witness's roads block")
    return out


def arm_hazards(work):
    #  The control room moved east of the let-down drum, the wind turned to
    #  blow from the west, a rule for an absent kind added.  The roads go:
    #  the room's new place is where the east road runs.
    edit = chain(
        drop_roads,
        sub("        x           -30 m;\n        y           -40 m;",
            "        x           70 m;\n        y           -6 m;"),
        sub("from        225 deg;", "from        270 deg;"),
        sub("{ between ( controlRoom shellTubeHX ); distance 30 m; }",
            "{ between ( controlRoom shellTubeHX ); distance 30 m; }\n"
            "            { between ( flare vessel );            distance 60 m; }"),
        # the control room is now too close to everything at 30 m: drop
        # those rules so the arm reads the HAZARD findings alone
        sub("{ between ( compressor controlRoom );   distance 30 m; }", ""),
        sub("{ between ( controlRoom vessel );      distance 30 m; }", ""),
        sub("{ between ( controlRoom shellTubeHX ); distance 30 m; }", ""),
        # an ignition source on a platform ABOVE both zone envelopes it sits
        # within in plan: the envelope is a cylinder of declared HEIGHT, so it
        # must not be reported (found by sabotage S7: without this item the
        # vertical half of the rule was untested)
        sub(ITEMS_OPEN, ITEMS_OPEN
            + '    { nonProcess "elevatedPanel"; kind panel; x 59.5 m; y -2 m;'
              ' z 20 m; orientation alongX;'
              ' footprint { length 1 m; width 1 m; height 1 m; }'
              ' ignition "an electrical panel on a platform"; }\n'),
    )
    d = prepare(work, "hazards", WITNESS, edit)
    out, err, rc = solve(d)
    j = result_json(out)
    lay = (j or {}).get("layout")
    if rc != 0 or not lay:
        fail(f"(d) the hazard fixture exited {rc} / published no layout:\n    "
             + "\n    ".join(l for l in (out + err).splitlines() if "ERROR" in l)[:400])
        return
    items = {i["id"]: i for i in lay["items"]}
    got = {f["id"]: f for f in lay["findings"]}
    cr = items["controlRoom"]
    # zone: the let-down drum's zone 2 (radius 4.5 m) reaches the room's box
    zid = "ignitionInZone:controlRoom:letdown#zone2"
    mine = point_to_box(items["letdown"]["x"], items["letdown"]["y"], cr)
    if zid not in got:
        fail(f"(d) no {zid}; findings: {sorted(got)}")
    elif abs(got[zid]["value"] - mine) > 1e-6 or got[zid]["limit"] != 4.5:
        fail(f"(d) zone: engine {got[zid]['value']} / {got[zid]['limit']},"
             f" recomputed {mine} / 4.5")
    if "ignitionInZone:controlRoom:letdown#zone1" in got:
        fail("(d) the room is outside the let-down drum's zone 1 (1.5 m) and was"
             " reported inside it")
    # wind: from 270 (true), plan north = true north, so downwind is plan +x;
    # within +/-30 deg and 60 m: separator (14 m), letdown (10.5 m),
    # recycleComp (52 m, 2.2 deg off); makeupComp is 64 m away.
    want = {"separator", "letdown", "recycleComp"}
    for rel in ("separator", "letdown", "recycleComp", "makeupComp"):
        fid = f"ignitionDownwind:controlRoom:{rel}"
        r = items[rel]
        dist = hypot(cr["x"] - r["x"], cr["y"] - r["y"])
        bearing = degrees(atan2(cr["x"] - r["x"], cr["y"] - r["y"])) % 360
        inside = dist <= 60 and abs(((bearing - 90) + 180) % 360 - 180) <= 30
        if inside != (rel in want):
            fail(f"(d) the fixture's own geometry moved: {rel} at {dist} m,"
                 f" bearing {bearing}")
        if inside and (fid not in got or abs(got[fid]["value"] - dist) > 1e-6):
            fail(f"(d) {fid}: expected at {dist} m, got {got.get(fid)}")
        if not inside and fid in got:
            fail(f"(d) {fid} reported though {rel} is {dist} m away, bearing {bearing}")
    p = items.get("elevatedPanel")
    if p is None or point_to_box(items["letdown"]["x"], items["letdown"]["y"], p) >= 4.5:
        fail("(d) the elevated panel fixture is not where it must be (inside the"
             " let-down drum's zone-2 radius in plan)")
    for fid in got:
        if fid.startswith("ignitionInZone:elevatedPanel:"):
            fail(f"(d) {fid}: the panel stands 20 m up, above every envelope's"
                 " declared height, and was reported inside one")
    if "deadRule:flare:flare|vessel" not in got:
        fail(f"(d) the rule naming the absent kind `flare` raised no deadRule; {sorted(got)}")
    caveat = out.split("PLANT LAYOUT", 1)[-1] if "PLANT LAYOUT" in out else ""
    for fid in (zid, "ignitionDownwind:controlRoom:letdown"):
        if fid in got and got[fid]["message"] not in caveat:
            fail(f"(d) {fid} did not reach the caveat block")
    # outsideArea, on the sectored flagship
    d = prepare(work, "outside_area", FLAGSHIP,
                lambda _t: 'items ( { item "DRYING.SD"; x 0 m; y 0 m; z 0 m;'
                           ' orientation vertical; }\n'
                           '        { item "FERMENTATION.Fermentor"; x 10 m; y 0 m; z 0 m;'
                           ' orientation vertical; } );\n'
                           'areas { DRYING { xMin -2 m; xMax 2 m; yMin -2 m; yMax 2 m; }\n'
                           '        FERMENTATION { xMin 3 m; xMax 6 m; yMin -2 m; yMax 2 m; } }\n')
    out, err, rc = solve(d)
    lay = ((result_json(out) or {}).get("layout")) or {}
    ids = {f["id"] for f in lay.get("findings", [])}
    if rc != 0 or "outsideArea:FERMENTATION.Fermentor:FERMENTATION" not in ids \
            or any(i.startswith("outsideArea:DRYING") for i in ids):
        fail(f"(d) outsideArea: exit {rc}, findings {sorted(ids)}")
    if lay and len(lay.get("areas", [])) != 2:
        fail("(d) the flagship's two declared areas were not published")
    claims.append("a zone-2 intrusion and three downwind ignitions recomputed"
                  " here, a dead rule, an item outside its sector's area")


def arm_draft(work):
    d = prepare(work, "draft_flagship", FLAGSHIP)
    lay_path = d / "system/layoutDict"
    out, err, rc = run([str(TOOL), "--draft", str(d)])
    if rc != 0 or not lay_path.exists():
        fail(f"(e) the draft on the flagship exited {rc} / wrote nothing:\n    "
             + "\n    ".join(l for l in (out + err).splitlines() if "ERROR" in l)[:400])
        return
    text = lay_path.read_text()
    if "A DRAFT" not in text or "PROPOSAL, NOT A LAYOUT" not in text:
        fail("(e) the draft is not headed as a DRAFT the student must own")
    lay = ((result_json(out) or {}).get("layout")) or {}
    if not lay or lay.get("findings"):
        fail(f"(e) the draft's own check: block {'present' if lay else 'ABSENT'},"
             f" findings {[f['id'] for f in lay.get('findings', [])]}")
    if sorted(a["sector"] for a in lay.get("areas", [])) != ["DRYING", "FERMENTATION"]:
        fail(f"(e) the draft's areas are {[a['sector'] for a in lay.get('areas', [])]}")
    for u in ("CONCENTRATION.Evap1", "CONCENTRATION.Cryst"):
        if u not in lay.get("unplaced", []) or f'"{u}"' in text.split("NOT PLACED")[0]:
            fail(f"(e) {u} publishes no size and was placed, or not listed for the student")
    #  The student's edit, so an overwrite is visible even when the tool would
    #  write the same proposal again (it is deterministic: a byte-identical
    #  rewrite passed the hash alone -- found by sabotage S4).
    lay_path.write_text(lay_path.read_text() + "\n// the student's own edit\n")
    h = hashlib.sha256(lay_path.read_bytes()).hexdigest()
    out, err, rc = run([str(TOOL), "--draft", str(d)])
    if rc != 2 or "never overwritten without --force" not in out + err \
            or hashlib.sha256(lay_path.read_bytes()).hexdigest() != h:
        fail(f"(e) a second draft without --force: exit {rc}; the file"
             f" {'changed' if hashlib.sha256(lay_path.read_bytes()).hexdigest() != h else 'kept'}")
    # --force on the witness: carried, and its own check finds no shortfall
    d = prepare(work, "draft_force", WITNESS)
    out, err, rc = run([str(TOOL), "--draft", "--force", str(d)])
    text = (d / "system/layoutDict").read_text()
    lay = ((result_json(out) or {}).get("layout")) or {}
    if rc != 0 or not lay:
        fail(f"(e) --force on the witness exited {rc}")
        return
    #  C134: the draft carries no containment (each wall was drawn round
    #  positions it moves), so every liquid store it lines up is announced
    #  unbunded -- that is the engine telling the student to redeclare them,
    #  and no shortfall of the draft's own.
    drafted = [f for f in lay.get("findings", []) if f["kind"] != "unbundedLiquid"]
    if drafted:
        fail(f"(e) the forced draft has findings {[f['id'] for f in drafted]}"
             " -- it must honour every declared separation")
    for needle in ('nonProcess  "controlRoom"', "footprint   { length 8.00 m",
                   "between ( vessel vessel ); distance 4.00 m", "from      225 deg",
                   "{ zone 1; radius 1.50 m; height 3.00 m; }",
                   "margin 5.00 m;", 'kind        canteen;',
                   'reason      "meals and rest for the shift crews',
                   "`roads {}` network is NOT carried", "arrangement doubleLoaded;",
                   "`bunds ( ... )` are NOT carried",
                   "entry       reverse;"):
        if needle not in text:
            fail(f"(e) the forced draft did not carry `{needle}`")
    if len(lay.get("items", [])) != WITNESS_ITEMS:
        fail(f"(e) the forced draft places {len(lay.get('items', []))} items, expected"
             f" {WITNESS_ITEMS}")
    if "roadNetwork" in lay or "\nroads\n{" in text:
        fail("(e) the forced draft wrote or ran a road network: roads are drawn round"
             " positions the draft moves, and are never carried")
    claims.append("the draft writes a headed proposal its own run checks clean,"
                  " lists what it will not size, refuses to overwrite, and with"
                  " --force carries the author's table, boxes, hazards and"
                  " non-process item with no shortfall")


LAND_BLOCK = re.compile(r"\n    //  THE LAND \(DEV\.md 4c C82\).*?\n    land\n    \{.*?\n    \}\n", re.S)


def drop_land(d):
    """The witness prices its PLOT as land (C82): without a layout the land
    has no area and refuses by name, so a fixture that removes the layout
    removes the land block with it."""
    pd = d / "system" / "postDict"
    text, n = LAND_BLOCK.subn("\n", pd.read_text())
    if n != 1:
        raise RuntimeError("fixture anchor not found: the witness postDict's land block")
    pd.write_text(text)


def arm_absent(work):
    d = prepare(work, "absent", WITNESS, drop_layout=True)
    drop_land(d)
    out, err, rc = solve(d)
    j = result_json(out)
    if rc != 0 or j is None:
        fail(f"(f) the witness without its layout exited {rc}")
        return
    if "layout" in j or "[layout]" in out + err or "PLANT LAYOUT" in out \
            or '"category": "layout"' in out:
        fail("(f) a case without system/layoutDict printed or published a layout")
    claims.append("a case without a layoutDict prints and publishes nothing of one")


REFUSED_SIZER_EDIT = ("designRules { residenceTime 45.0;  flowKey F_beta;",
                      "designRules { residenceTime 45.0;  flowKey noSuchKpi;")


def prepare_refused_sizer(work, name, layout_edit=None):
    d = prepare(work, name, WITNESS, layout_edit)
    pd = d / "system" / "postDict"
    text = pd.read_text()
    if text.count(REFUSED_SIZER_EDIT[0]) != 1:
        raise RuntimeError("fixture anchor not found in the witness postDict: "
                           + REFUSED_SIZER_EDIT[0])
    pd.write_text(text.replace(*REFUSED_SIZER_EDIT))
    return d


def arm_refused_sizer(work):
    d = prepare_refused_sizer(work, "refused_sizer")
    out, err, rc = solve(d)
    j = result_json(out)
    lay = (j or {}).get("layout")
    if rc != 0 or not lay:
        tail = [l for l in (out + err).splitlines() if l.strip()][-1:]
        fail(f"(g) a layout placing an item whose sizer refused exited {rc} /"
             " published no layout -- one refused sizer must not cost the run:\n    "
             + ("\n    ".join(l for l in (out + err).splitlines() if "ERROR" in l)
                or "\n    ".join(tail))[:400])
        return
    failed = re.search(r"separator  FAILED: (.*)", err)
    if not failed:
        fail("(g) the fixture's separator sizer did not refuse -- the probe"
             " no longer reaches the case it is about")
        return
    ids = [i["id"] for i in lay["items"]]
    if "separator" in ids:
        fail("(g) the separator was placed although its sizer refused")
    if len(ids) != WITNESS_ITEMS - 1:
        fail(f"(g) {len(ids)} items placed, expected the witness's {WITNESS_ITEMS} less the"
             " separator")
    f = [x for x in lay["findings"] if x["id"] == "sizingRefused:separator:separator"]
    if len(f) != 1:
        fail(f"(g) no sizingRefused finding for the separator; findings "
             f"{[x['id'] for x in lay['findings']]}")
        return
    msg = f[0]["message"]
    if failed.group(1).strip() not in msg or "UNPLACED" not in msg:
        fail("(g) the finding does not quote the sizer's FAILED line and say"
             f" UNPLACED: {msg}")
    if "[layout] " + msg not in err:
        fail("(g) the sizingRefused announcement is not on stderr at its site")
    if "PLANT LAYOUT" not in out or msg not in out.split("PLANT LAYOUT", 1)[-1]:
        fail("(g) the sizingRefused announcement is not in the caveat block")
    if not any(a.get("category") == "layout" and a.get("message") == msg
               for a in (j.get("advisories") or [])):
        fail("(g) the sizingRefused announcement is not in the JSON's advisories")
    # the negative: a name that merely starts with the refused entry's
    d = prepare_refused_sizer(work, "refused_sizer_typo", sub(ITEMS_OPEN, ITEMS_OPEN
        + '    { item "separatorX"; x 200 m; y 0 m; z 0 m; orientation vertical; }\n'))
    out, err, rc = solve(d)
    if rc != 2 or not re.search(r"item `separatorX` names no sized item", out + err):
        fail(f"(g) `separatorX` beside a refused `separator` exited {rc}; it must"
             " still refuse as naming no sized item")
    claims.append("an item whose sizer refused is left unplaced and announced"
                  " on all three surfaces quoting the sizer, the run going on;"
                  " a name that only starts like the refused entry's still refuses")


# ------------------------------------------------------------ pipes (C80) --
PIPE_CASES = {
    "ammonia02": WITNESS,
    "greenAmmoniaPEQ": ROOT / "tutorials/plant/greenAmmoniaPEQ_baseCase",
    "aceticAcid02": ROOT / "tutorials/plant/aceticAcid02_plant",
    #  DEV.md 4c C97: the one corpus plant with powders and tablets (the
    #  solids rule) and a declared GMP building (its rooms in the plot).
    "apalutamide01": APALUTAMIDE,
}
TOL = 1e-6


def stream_identities(j):
    """The physical streams of a run, from the STREAM TABLE's own rule (one
    row per identity: an entry marked `aliasOf` or `boundaryLabel` is a
    label of another), an independent home for the set the pipes must
    cover."""
    return {k for k, v in (j.get("streams") or {}).items()
            if not v.get("aliasOf") and not v.get("boundaryLabel")}


def end_point(lay, kind, at, first, stream=None):
    """Where a pipe end must lie, recomputed here from the published items,
    junctions and rack: an item's top centre, a junction's node, or (x only)
    the rack's end for a battery limit -- or, where the case declares a fence
    (DEV.md 4c C93), the crossing the engine published for that stream, all
    three coordinates."""
    if kind == "batteryLimit" and lay.get("fence"):
        c = next((x for x in lay.get("fenceCrossings", []) if x["stream"] == stream), None)
        return None if c is None else (c["x"], c["y"], c["z"])
    if kind == "item":
        i = next((x for x in lay["items"] if x["id"] == at), None)
        return None if i is None else (i["x"], i["y"], i["z"] + i["dz"])
    if kind == "junction":
        jn = next((x for x in lay.get("junctions", []) if x["unit"] == at), None)
        return None if jn is None else (jn["x"], jn["y"], jn["z"])
    if kind == "batteryLimit":
        return (lay["pipeRack"]["xStart"] if first else lay["pipeRack"]["xEnd"],)
    return None


def on_a_wall(lay, pt):
    """True when the plan point lies on a side face of a placed non-process
    box (a building's wall), its height between the box's base and top."""
    for i in lay["items"]:
        if not i["nonProcess"]:
            continue
        x0, x1 = i["x"] - i["dx"] / 2, i["x"] + i["dx"] / 2
        y0, y1 = i["y"] - i["dy"] / 2, i["y"] + i["dy"] / 2
        on_x = min(abs(pt[0] - x0), abs(pt[0] - x1)) < TOL and y0 - TOL <= pt[1] <= y1 + TOL
        on_y = min(abs(pt[1] - y0), abs(pt[1] - y1)) < TOL and x0 - TOL <= pt[0] <= x1 + TOL
        if (on_x or on_y) and i["z"] - TOL <= pt[2] <= i["z"] + i["dz"] + TOL:
            return True
    return False


def check_routes(tag, lay, require_rack_route=True):
    """Every published route: each segment along ONE axis, its length the
    polyline's own, its two ends where the published items / junctions /
    rack say.  Returns the number of pipes checked."""
    n = 0
    for p in lay.get("pipes", []):
        r = p["route"]
        if len(r) < 2:
            fail(f"(h) {tag} pipe {p['stream']}: a route of {len(r)} point(s)")
            continue
        L = 0.0
        for a, b in zip(r, r[1:]):
            moved = sum(1 for k in range(3) if abs(a[k] - b[k]) > TOL)
            if moved != 1:
                fail(f"(h) {tag} pipe {p['stream']}: segment {a} -> {b} moves along"
                     f" {moved} axes -- a route is orthogonal")
            L += sum(abs(a[k] - b[k]) for k in range(3))
        if abs(L - p["length"]) > 1e-9 * max(1.0, L):
            fail(f"(h) {tag} pipe {p['stream']}: published length {p['length']} m,"
                 f" the polyline's own {L} m")
        for first, kind, at, pt in ((True, p["fromKind"], p["from"], r[0]),
                                    (False, p["toKind"], p["to"], r[-1])):
            if kind == "wallPenetration":
                #  DEV.md 4c C100: the pipe ends where it ENTERS the building
                #  -- on a side face of a non-process box, between its base
                #  and its top.
                if not on_a_wall(lay, pt):
                    fail(f"(h) {tag} pipe {p['stream']}: its end at {pt} enters the"
                         f" building for `{at}` and lies on no building's wall")
                continue
            want = end_point(lay, kind, at, first, p["stream"])
            if want is None:
                fail(f"(h) {tag} pipe {p['stream']}: its end `{at}` ({kind}) is nowhere"
                     " in the published block")
            elif kind == "batteryLimit" and lay.get("fence"):
                if any(abs(pt[k] - want[k]) > TOL for k in range(3)):
                    fail(f"(h) {tag} pipe {p['stream']}: a battery-limit end at {pt},"
                         f" the fence crossing the engine published is {want}")
            elif kind == "batteryLimit":
                if p["routedBy"] == "rack" and abs(pt[0] - want[0]) > TOL:
                    fail(f"(h) {tag} pipe {p['stream']}: a battery-limit end at x ="
                         f" {pt[0]}, the rack's {'xStart' if first else 'xEnd'} is {want[0]}")
            elif any(abs(pt[k] - want[k]) > TOL for k in range(3)):
                fail(f"(h) {tag} pipe {p['stream']}: its {'source' if first else 'target'}"
                     f" end {pt} is not `{at}`'s point {want}")
        if require_rack_route and p["routedBy"] != "rack":
            fail(f"(h) {tag} pipe {p['stream']}: routed by {p['routedBy']}, and the case"
                 " declares no override")
        n += 1
    return n


SOLIDS_SEEN = []


def check_solids(tag, j, lay):
    """Arm (h), SOLIDS ARE NOT PIPED (DEV.md 4c C97): from the stream table
    alone, a stream whose fluid mass (`F_mass` - `F_solid_mass`) is zero and
    whose solid mass is not is NOT routed, is listed with `solids` and no
    anchor; nothing else is listed with `solids`; and no published junction
    is a unit every stream of which is such (each unit's streams read from
    the published ends of the pipes and of the not-routed list)."""
    streams = j.get("streams") or {}

    def solids_only(s):
        v = streams.get(s) or {}
        fm, sm = v.get("F_mass", 0.0), v.get("F_solid_mass", 0.0)
        return sm > 0.0 and abs(fm - sm) <= 1e-12 * max(fm, 1e-300)

    want = {s for s in stream_identities(j) if solids_only(s)}
    routed = {p["stream"] for p in lay.get("pipes", [])}
    listed = {n["stream"]: n for n in lay.get("notRouted", [])}
    if want & routed:
        fail(f"(h) {tag}: solids-only stream(s) routed as pipes: {sorted(want & routed)}")
    for s in sorted(want - routed):
        n = listed.get(s)
        if not n or not n.get("solids") or n.get("anchor") or "not piped" not in n["reason"]:
            fail(f"(h) {tag}: solids-only stream {s} must be listed not routed with"
                 f" `solids`, no anchor and the reason; published {n}")
    for s, n in listed.items():
        if n.get("solids") and s not in want:
            fail(f"(h) {tag}: {s} is listed as solids but carries a fluid phase")
    units = {}
    for p in lay.get("pipes", []):
        for u in (p.get("fromUnit"), p.get("toUnit")):
            if u:
                units.setdefault(u, []).append(False)
    for n in lay.get("notRouted", []):
        for u in [n.get("fromUnit", "")] + n.get("toUnit", "").split(", "):
            if u:
                units.setdefault(u, []).append(n["stream"] in want)
    for jn in lay.get("junctions", []):
        flags = units.get(jn["unit"], [])
        if flags and all(flags):
            fail(f"(h) {tag}: junction {jn['unit']} is on the rack and every stream of"
                 " it carries only solids")
    if want:
        SOLIDS_SEEN.append(f"{tag} {len(want)}")


def golden_rows(case):
    rows = {}
    for line in (case / "expected").read_text().splitlines():
        f = line.split()
        if len(f) >= 5 and f[0] == "layout" and (f[1].startswith("pipe:")
                                                 or f[1] == "summary"):
            rows[(f[1], f[2])] = (f[3], f[4])
    return rows


def arm_pipes(work):
    total = 0
    for tag, case in PIPE_CASES.items():
        d = prepare(work, "pipes_" + tag, case)
        out, err, rc = solve(d)
        j = result_json(out)
        lay = (j or {}).get("layout")
        if rc != 0 or not lay or "pipes" not in lay:
            fail(f"(h) {tag}: exit {rc}, no layout or no pipes block")
            continue
        # every stream routed, or listed with a reason -- never dropped
        ids = stream_identities(j)
        routed = [p["stream"] for p in lay["pipes"]]
        listed = [n["stream"] for n in lay.get("notRouted", [])]
        if len(set(routed)) != len(routed) or set(routed) & set(listed):
            fail(f"(h) {tag}: a stream is routed twice, or both routed and listed")
        missing = ids - set(routed) - set(listed)
        extra = (set(routed) | set(listed)) - ids
        if missing:
            fail(f"(h) {tag}: stream(s) neither routed nor listed: {sorted(missing)}")
        if extra:
            fail(f"(h) {tag}: pipe(s) for no stream of the table: {sorted(extra)}")
        for nr in lay.get("notRouted", []):
            if len(nr.get("reason", "")) < 10:
                fail(f"(h) {tag}: {nr['stream']} is not routed and says no reason")
        # the witness routes EVERY stream (DEV.md 4c C93, Vitor: "there are
        # compressors that have no inlets"): no unit it places stands with a
        # port drawn to nothing
        if case == WITNESS and listed:
            fail(f"(h) {tag}: the witness must route every stream; not routed: {listed}")
        overrides = re.search(r"^pipes\s*\n\{", (case / "system" / "layoutDict").read_text(),
                              re.M) is not None
        total += check_routes(tag, lay, require_rack_route=not overrides)
        check_solids(tag, j, lay)
        check_plot(tag, case, lay, out, err, j)
        # the rack: declared in all three (ammonia02 since C93, when its tank
        # farm dragged the stated default onto the main road); the stated
        # default is exercised by the probe below, a copy with no pipeRack
        rack = lay["pipeRack"]
        default_said = "no `pipeRack` is declared" in err
        if not rack["declared"] or default_said:
            fail(f"(h) {tag} declares its pipeRack: it must be published as declared,"
                 " with no default announced")
        # the pipes reproduce the golden rows, and every pipe is pinned
        gold = golden_rows(case)
        for p in lay["pipes"]:
            pid = "pipe:" + p["stream"]
            for key, val in (("from", p["from"]), ("to", p["to"]), ("length", p["length"])):
                g = gold.get((pid, key))
                if g is None:
                    fail(f"(h) {tag}: {pid} {key} is published and pinned by no golden row")
                elif key == "length":
                    if abs(float(g[0]) - val) > float(g[1]) * max(abs(val), 1e-30):
                        fail(f"(h) {tag}: {pid} length {val} m against the golden {g[0]} m")
                elif g[0] != val:
                    fail(f"(h) {tag}: {pid} {key} `{val}` against the golden `{g[0]}`")
        pinned = {k[0] for k in gold if k[0].startswith("pipe:")}
        stale = pinned - {"pipe:" + s for s in routed}
        if stale:
            fail(f"(h) {tag}: golden rows pin pipes the run no longer publishes: {sorted(stale)}")
        summ = lay.get("summary", {})
        for key, val in (("pipes", len(routed)), ("notRouted", len(listed))):
            g = gold.get(("summary", key))
            if g is None or int(float(g[0])) != val or summ.get(key) != val:
                fail(f"(h) {tag}: summary {key} = {summ.get(key)} / golden"
                     f" {g[0] if g else 'absent'} / counted here {val}")
    # THE STATED DEFAULT RACK, on a copy of the witness with its declared rack
    # taken out (DEV.md 4c C93 moved this role from the shipped witness to a
    # probe): published as the default AND announced on all three surfaces.
    d = prepare(work, "pipes_default_rack", WITNESS, drop_block_edit("pipeRack"))
    out, err, rc = solve(d)
    j = result_json(out)
    lay = (j or {}).get("layout") or {}
    caveat = out.split("PLANT LAYOUT", 1)[-1] if "PLANT LAYOUT" in out else ""
    if rc != 0 or lay.get("pipeRack", {}).get("declared", True) \
            or "no `pipeRack` is declared" not in err \
            or "no `pipeRack` is declared" not in caveat \
            or not any("no `pipeRack` is declared" in (a.get("message") or "")
                       for a in (j or {}).get("advisories") or []):
        fail(f"(h) the witness with no pipeRack (exit {rc}): the default must be published"
             " as such AND announced on stderr, the caveat block and the advisories")
    else:
        total += check_routes("default-rack probe", lay)
    if not SOLIDS_SEEN:
        fail("(h) no plant carries a solids-only stream: the solids rule went unexercised")
    claims.append(f"{total} pipes on four plants, every stream routed or listed with"
                  " its reason, each route orthogonal with its length its own and its"
                  " ends at the published nozzles, junctions and battery limits, each"
                  " reproducing its golden rows; solids-only streams (from the stream"
                  f" table: {', '.join(SOLIDS_SEEN)}) listed as not piped, never routed, no"
                  " junction of solids alone on the rack; the default rack announced on"
                  " three surfaces where none is declared")


MARGIN_RE = re.compile(r"^plot\s*\{[^}]*?margin\s+([-0-9.eE+]+)\s*m\s*;", re.M)
PLOT_KEYS = ("plotArea", "footprintArea")


def margin_of(layout_text):
    """The margin the case DECLARES, read from its layoutDict as text (an
    independent home for the number); 0 where it declares none."""
    m = MARGIN_RE.search(re.sub(r"//[^\n]*", "", layout_text))
    return float(m.group(1)) if m else 0.0


def plan_area(i):
    if i["shape"] == "cylinder" and i["orientation"] == "vertical":
        return pi * i["dx"] ** 2 / 4.0
    return i["dx"] * i["dy"]


def plot_recomputed(lay, margin, building=None):
    """The stated rule, recomputed: the envelope of the declared areas, the
    placed footprints, the routed pipes' points and (DEV.md 4c C97) the
    rooms of a declared building, grown by the margin."""
    xs, ys = [], []
    for r in (building or {}).get("rooms", []):
        xs += [r["xMin"], r["xMax"]]
        ys += [r["yMin"], r["yMax"]]
    for i in lay["items"]:
        xs += [i["x"] - i["dx"] / 2, i["x"] + i["dx"] / 2]
        ys += [i["y"] - i["dy"] / 2, i["y"] + i["dy"] / 2]
    for a in lay.get("areas", []):
        xs += [a["xMin"], a["xMax"]]
        ys += [a["yMin"], a["yMax"]]
    #  With a fence (DEV.md 4c C93) the rack-routed pipes enter as the rack's
    #  plan band (the legs that carry them on to the fence are drawn FROM this
    #  plot); a declared waypoint route enters as itself.
    fenced = bool(lay.get("fence"))
    band = False
    for p in lay.get("pipes", []):
        if fenced and p["routedBy"] == "rack":
            band = True
            continue
        for q in p["route"]:
            xs.append(q[0])
            ys.append(q[1])
    if band:
        k = lay["pipeRack"]
        hw = k["lanesPerTier"] * k["laneSpacing"] / 2
        xs += [k["xStart"], k["xEnd"]]
        ys += [k["y"] - hw, k["y"] + hw]
    for rect in paved_rects(lay):
        xs += [rect[0], rect[1]]
        ys += [rect[2], rect[3]]
    #  SECONDARY CONTAINMENT (DEV.md 4c C134): every wall's outline and every
    #  impounding area's pit.
    for b in lay.get("bunds", []):
        for q in b["outline"]:
            xs.append(q[0])
            ys.append(q[1])
        if "pitX" in b:
            xs += [b["pitX"] - b["pitLength"] / 2, b["pitX"] + b["pitLength"] / 2]
            ys += [b["pitY"] - b["pitWidth"] / 2, b["pitY"] + b["pitWidth"] / 2]
    r = (min(xs) - margin, max(xs) + margin, min(ys) - margin, max(ys) + margin)
    return r, (r[1] - r[0]) * (r[3] - r[2])


def close(a, b, rel=1e-9):
    return abs(a - b) <= rel * max(1.0, abs(a), abs(b))


def check_plot(tag, case, lay, out, err, j):
    """Arm (j) on one plant: the plot recomputed, the margin's announcement,
    and published <=> pinned."""
    plot = lay.get("plot")
    if not plot:
        fail(f"(j) {tag}: the layout publishes no `plot`")
        return
    margin = margin_of((case / "system" / "layoutDict").read_text())
    rect, area = plot_recomputed(lay, margin, j.get("building"))
    clause = "every room of the declared building"
    if (clause in plot.get("rule", "")) != bool(j.get("building")):
        fail(f"(j) {tag}: the plot rule and the run disagree on whether a building's"
             f" rooms are in it (building declared: {bool(j.get('building'))})")
    clause = "every declared secondary containment"
    if (clause in plot.get("rule", "")) != bool(lay.get("bunds")):
        fail(f"(j) {tag}: the plot rule and the run disagree on whether a declared"
             f" containment is in it (bunds declared: {bool(lay.get('bunds'))})")
    got = (plot["xMin"], plot["xMax"], plot["yMin"], plot["yMax"])
    if not all(close(a, b) for a, b in zip(rect, got)) or not close(area, plot["plotArea"]):
        fail(f"(j) {tag}: the plot {got} = {plot['plotArea']} m2; recomputed here"
             f" {rect} = {area} m2 (margin {margin} m)")
    if plot["margin"] != margin or plot["marginDeclared"] != (margin != 0.0):
        fail(f"(j) {tag}: margin {plot['margin']} (declared {plot['marginDeclared']}),"
             f" the case's layoutDict says {margin}")
    #  An item inside the declared building (DEV.md 4c C100) is on the
    #  building's ground: not counted again.
    fa = sum(plan_area(i) for i in lay["items"] if not i.get("room"))
    if not close(fa, plot["footprintArea"], 1e-8) \
            or not close(fa / area, plot["footprintShare"], 1e-8):
        fail(f"(j) {tag}: footprints {plot['footprintArea']} m2 (share"
             f" {plot['footprintShare']}); recomputed {fa} m2 ({fa / area})")
    said = "no `plot { margin; reason; }` is declared"
    caveat = out.split("PLANT LAYOUT", 1)[-1] if "PLANT LAYOUT" in out else ""
    everywhere = (said in err and said in caveat
                  and any(said in (a.get("message") or "") for a in j.get("advisories") or []))
    if plot["marginDeclared"] and said in out + err:
        fail(f"(j) {tag} declares its plot margin and the default was announced")
    if not plot["marginDeclared"] and not everywhere:
        fail(f"(j) {tag} declares no plot margin: that must be ANNOUNCED on stderr, the"
             " caveat block and the advisories")
    # published <=> pinned
    gold = {}
    for line in (case / "expected").read_text().splitlines():
        f = line.split()
        if len(f) >= 5 and f[0] == "layout" and (f[1] == "plot" or f[1].startswith("plotSector:")):
            gold[(f[1], f[2])] = (f[3], f[4])
    published = {("plot", k): plot[k] for k in PLOT_KEYS}
    for s_ in lay.get("plotSectors", []):
        for k in PLOT_KEYS:
            published[("plotSector:" + s_["sector"], k)] = s_[k]
    for key, val in published.items():
        g = gold.get(key)
        if g is None:
            fail(f"(j) {tag}: {key[0]} {key[1]} is published and pinned by no golden row")
        elif abs(float(g[0]) - val) > float(g[1]) * max(abs(val), 1e-30):
            fail(f"(j) {tag}: {key[0]} {key[1]} {val} against the golden {g[0]}")
    for key in gold:
        if key not in published and key[1] in PLOT_KEYS:
            fail(f"(j) {tag}: a golden row pins {key[0]} {key[1]}, which the run no"
                 " longer publishes")
    PLOT_SEEN.append(tag)


PLOT_SEEN = []

FLAGSHIP_ITEMS = ('items ( { item "DRYING.SD"; x 0 m; y 0 m; z 0 m; orientation vertical; }\n'
                  '        { item "FERMENTATION.Fermentor"; x 20 m; y 0 m; z 0 m;'
                  ' orientation vertical; } );\n')


def arm_plot(work):
    """(j) on the sectored flagship: declared sector areas, their overlap, an
    undeclared sector's envelope, a declared margin; and the two refusals."""
    #  Two declared areas that share ground: 20..30 x -10..10 is claimed twice.
    d = prepare(work, "plot_overlap", FLAGSHIP, lambda _t: FLAGSHIP_ITEMS
                + 'areas { DRYING { xMin -10 m; xMax 30 m; yMin -10 m; yMax 10 m; }\n'
                  '        FERMENTATION { xMin 20 m; xMax 40 m; yMin -10 m; yMax 10 m; } }\n')
    out, err, rc = solve(d)
    j = result_json(out) or {}
    lay = j.get("layout") or {}
    plot = lay.get("plot") or {}
    if rc != 0 or not plot:
        fail(f"(j) flagship, overlapping areas: exit {rc}, plot {'published' if plot else 'ABSENT'}")
    else:
        rect, area = plot_recomputed(lay, 0.0)
        if not close(area, plot["plotArea"]) or not (rect[0] <= -10 and rect[1] >= 40):
            fail(f"(j) flagship: the plot {plot['plotArea']} m2; recomputed {area} m2 on {rect}")
        # the union of 40x20 and 20x20 sharing 10x20: 800 + 400 - 200
        if not close(plot["declaredAreasUnion"], 1000.0) \
                or not close(plot["declaredAreasOverlap"], 200.0):
            fail(f"(j) flagship: areas union {plot['declaredAreasUnion']} m2 / overlap"
                 f" {plot['declaredAreasOverlap']} m2; recomputed 1000 / 200")
        secs = {x["sector"]: x for x in lay.get("plotSectors", [])}
        want = {"DRYING": ("declaredArea", 800.0), "FERMENTATION": ("declaredArea", 400.0)}
        for sec, (frm, a) in want.items():
            x = secs.get(sec)
            if not x or x["from"] != frm or not close(x["plotArea"], a):
                fail(f"(j) flagship: sector {sec} published {x}; expected {frm} {a} m2")
        msg = "the declared areas of sectors DRYING and FERMENTATION share 200 m2"
        if msg not in err or msg not in out.split("PLANT LAYOUT", 1)[-1]:
            fail("(j) flagship: two sector areas sharing ground were not announced on"
                 " stderr and the caveat block")
    #  One area declared, a margin: FERMENTATION's area is its footprints' envelope.
    d = prepare(work, "plot_envelope", FLAGSHIP, lambda _t: FLAGSHIP_ITEMS
                + 'areas { DRYING { xMin -10 m; xMax 10 m; yMin -10 m; yMax 10 m; } }\n'
                  'plot { margin 5 m; reason "fixture"; }\n')
    out, err, rc = solve(d)
    j = result_json(out) or {}
    lay = j.get("layout") or {}
    plot = lay.get("plot") or {}
    if rc != 0 or not plot:
        fail(f"(j) flagship, one area and a margin: exit {rc}")
    else:
        rect, area = plot_recomputed(lay, 5.0)
        if not close(area, plot["plotArea"]) or not plot["marginDeclared"]:
            fail(f"(j) flagship + margin: the plot {plot['plotArea']} m2; recomputed {area} m2")
        f = next((i for i in lay["items"] if i["id"] == "FERMENTATION.Fermentor"), None)
        secs = {x["sector"]: x for x in lay.get("plotSectors", [])}
        x = secs.get("FERMENTATION")
        if f is None or not x or x["from"] != "footprintEnvelope" \
                or not close(x["plotArea"], f["dx"] * f["dy"]) \
                or not close(x["footprintArea"], plan_area(f)):
            fail(f"(j) flagship: FERMENTATION published {x}; expected the envelope of its"
                 f" one footprint, {f['dx'] * f['dy'] if f else '?'} m2")
        if "no `plot { margin; reason; }` is declared" in out + err:
            fail("(j) flagship: a declared margin was announced as missing")
    #  Refusals, on the witness's own plot block.
    n = 0
    for label, edit, pat in (
            ("negative margin", sub("    margin  5 m;", "    margin  -1 m;"),
             r"plot: `margin -1 m;`.*cannot be negative"),
            ("no reason", lambda t: re.sub(r"\n    reason  \"author-set assumption for this"
                                           r" exercise: the fence and a 5 m[^\n]*", "", t),
             r"plot: `reason` is not declared")):
        d = prepare(work, "plot_refuse_" + re.sub(r"\W", "_", label), WITNESS, edit)
        out, err, rc = solve(d)
        if rc != 2 or not re.search(pat, out + err, re.S):
            fail(f"(j) refusal `{label}`: exit {rc}, not named")
        n += 1
    claims.append(f"the plot recomputed on {len(PLOT_SEEN)} plants ({', '.join(PLOT_SEEN)})"
                  " from the published footprints, areas and routes with the margin read"
                  " from each layoutDict, its footprint share, the absent margin announced"
                  " on three surfaces, every plot number pinned; on the flagship two"
                  f" overlapping sector areas (union and shared ground recomputed,"
                  f" announced) and an undeclared sector's footprint envelope; {n} refusals")


def drop_block(text, name):
    """The layoutDict `text` without its top-level `name { ... }` block."""
    m = re.search(r"^%s\s*\n\{" % re.escape(name), text, re.M)
    if not m:
        return text + "\n#error the probe found no `%s` block\n" % name
    depth, i = 0, m.end() - 1
    while i < len(text):
        depth += {"{": 1, "}": -1}.get(text[i], 0)
        i += 1
        if depth == 0:
            break
    return text[:m.start()] + text[i:]


def drop_block_edit(name):
    return lambda t: drop_block(t, name)


def drop_items(text, prefix):
    """The layoutDict `text` without every `item "<prefix>..."` entry: each
    entry is the brace block that opens on the line before its `item`."""
    out, i = [], 0
    lines = text.split("\n")
    while i < len(lines):
        if lines[i].strip() == "{" and i + 1 < len(lines) \
                and re.match(r'\s*item\s+"%s' % re.escape(prefix), lines[i + 1]):
            depth = 0
            while True:
                depth += lines[i].count("{") - lines[i].count("}")
                i += 1
                if depth == 0:
                    break
            continue
        out.append(lines[i])
        i += 1
    return "\n".join(out)


OVERRIDE = """
pipes
{
    rawLiquid
    {
        waypoints ( { x 56 m; y -6 m; z 10 m; } { x 59.5 m; y -6 m; z 10 m; } );
    }
}
"""


def arm_pipe_override(work):
    d = prepare(work, "pipe_override", WITNESS, lambda t: t + OVERRIDE)
    out, err, rc = solve(d)
    lay = ((result_json(out) or {}).get("layout")) or {}
    p = next((x for x in lay.get("pipes", []) if x["stream"] == "rawLiquid"), None)
    if rc != 0 or p is None:
        fail(f"(i) the waypoint override exited {rc} / published no rawLiquid pipe")
        return
    items = {i["id"]: i for i in lay["items"]}
    s, t = items["separator"], items["letdown"]
    want = [[56, -6, s["z"] + s["dz"]], [56, -6, 10], [59.5, -6, 10],
            [59.5, -6, t["z"] + t["dz"]]]
    if p["routedBy"] != "waypoints" or p["lane"] != -1 or len(p["route"]) != 4 \
            or any(abs(a - b) > TOL for q, w in zip(p["route"], want) for a, b in zip(q, w)):
        fail(f"(i) the declared waypoints were not honoured: {p['routedBy']} {p['route']}")
    L = (10 - want[0][2]) + 3.5 + (10 - want[3][2])
    if abs(p["length"] - L) > 1e-9:
        fail(f"(i) the override's length {p['length']} m, recomputed here {L} m")
    check_routes("override", lay, require_rack_route=False)
    nh3 = next((x for x in lay.get("pipes", []) if x["stream"] == "productNH3"), None)
    n = 1
    # THE UNROUTED MARK (DEV.md 4c C93): a stream the engine cannot route is
    # listed with the units at its ends and the plan point of the end it
    # DOES reach, which is where the 3D view marks the missing pipe -- the
    # letdown's nozzle, where the routed pipe started in the run above; the
    # stream with no reachable end carries no point.
    d = prepare(work, "pipe_unrouted_mark", WITNESS,
                lambda t: drop_bunds(drop_items(t, "T201/vessel")))
    out, err, rc = solve(d)
    nr = {x["stream"]: x for x in
          (((result_json(out) or {}).get("layout")) or {}).get("notRouted", [])}
    a_ = nr.get("productNH3", {})
    b_ = nr.get("productStored", {})
    if rc != 0 or nh3 is None or a_.get("fromUnit") != "letdown" or a_.get("toUnit") != "T201" \
            or len(a_.get("anchor", [])) != 3 \
            or any(abs(u - v) > TOL for u, v in zip(a_["anchor"], nh3["route"][0])) \
            or b_.get("fromUnit") != "T201" or b_.get("toUnit") != "" or "anchor" in b_:
        fail(f"(i) the unrouted mark (exit {rc}): productNH3 {a_} against the routed pipe's"
             f" first point {nh3['route'][0] if nh3 else None}; productStored {b_}")
    else:
        n += 1
    refusals = {
        "diagonal waypoint": (lambda t: t + OVERRIDE.replace("{ x 59.5 m; y -6 m; z 10 m; }",
                                                             "{ x 59.5 m; y -2 m; z 10 m; }"),
                              [r"moves along more than one axis", r"ORTHOGONAL"]),
        "unknown stream": (lambda t: t + "\npipes { noSuchStream { waypoints ( { x 0 m;"
                           " y 0 m; z 9 m; } ); } }\n",
                           [r"pipes: `noSuchStream`", r"Accepted.*rawLiquid"]),
        #  `productNH3` runs to T201, whose bullets the witness places (C92);
        #  the copy takes them off its plot plan, so the unit is sized and
        #  NONE of its items is placed -- a stream with no routable end.
        "override on an unroutable stream": (
            lambda t: drop_bunds(drop_items(t, "T201/vessel"))
            + "\npipes { productNH3 { waypoints ( { x 70 m; y 0 m; z 9 m; } ); } }\n",
            [r"pipes `productNH3`: an override routes a pipe", r"T201"]),
        "partial pipeRack": (
            lambda t: drop_block(t, "pipeRack") + "\npipeRack { y 0 m; elevation 6 m; laneSpacing 0.6 m;"
                          " lanesPerTier 6; tierSpacing 1.5 m; xStart -5 m;"
                          " reason \"r\"; }\n",
            [r"pipeRack: `xEnd` is not declared"]),
        "a fractional lane count": (
            lambda t: drop_block(t, "pipeRack") + "\npipeRack { y 0 m; elevation 6 m; laneSpacing 0.6 m;"
                          " lanesPerTier 2.5; tierSpacing 1.5 m; xStart -5 m; xEnd 70 m;"
                          " reason \"r\"; }\n",
            [r"lanesPerTier 2\.5", r"whole number"]),
    }
    for label, (edit, pats) in refusals.items():
        d = prepare(work, "pipe_refuse_" + re.sub(r"\W", "_", label), WITNESS, edit)
        out, err, rc = solve(d)
        if rc != 2 or not all(re.search(pt, out + err, re.S) for pt in pats):
            fail(f"(i) {label}: exit {rc}, expected 2 naming {pats}:\n    "
                 + "\n    ".join(l for l in (out + err).splitlines() if "ERROR" in l)[:400])
        else:
            n += 1
    # the draft: a declared rack is carried; none declared leaves a template
    rack = ("\npipeRack { y -1 m; elevation 7 m; laneSpacing 0.5 m; lanesPerTier 4;"
            " tierSpacing 1.25 m; xStart -6 m; xEnd 70 m; reason \"the author's own\"; }\n")
    d = prepare(work, "pipe_draft", WITNESS,
                lambda t: drop_block(t, "pipeRack") + rack + OVERRIDE)
    out, err, rc = run([str(TOOL), "--draft", "--force", str(d)])
    text = (d / "system/layoutDict").read_text()
    lay = ((result_json(out) or {}).get("layout")) or {}
    if rc != 0 or "lanesPerTier 4;" not in text or "xEnd         70.00 m;" not in text \
            or "the author's own" not in text or "are NOT\n//  carried" not in text \
            or not lay.get("pipeRack", {}).get("declared"):
        fail(f"(i) the forced draft (exit {rc}) did not carry the declared rack, or did not"
             " say it dropped the waypoint overrides")
    else:
        n += 1
    claims.append(f"a declared waypoint route honoured and measured, an unrouted stream"
                  f" marked at the end it reaches, {n - 3} refusals"
                  " (a diagonal segment, an unknown stream, an override on an unroutable"
                  " stream, a partial rack, a fractional lane count), and the draft"
                  " carrying a declared rack")


# ------------------------------------------------------------ roads (C90) --
def paved_rects(lay):
    """Each road's paved rectangles, from the PUBLISHED centre line and width
    (x0, x1, y0, y1): every segment widened by half the width on every side."""
    out = []
    for r in lay.get("roads", []):
        h = r["width"] / 2
        c = r["centreline"]
        for a, b in zip(c, c[1:]):
            out.append((min(a[0], b[0]) - h, max(a[0], b[0]) + h,
                        min(a[1], b[1]) - h, max(a[1], b[1]) + h))
    return out


def approach_rects(lay):
    """C96: each fence opening's APPROACH -- the published road end to the
    published opening, widened by half the opening's width across it."""
    out = []
    for o in lay.get("fenceOpenings", []):
        if o.get("approach", 0) <= 1e-9:
            continue
        h = o["width"] / 2
        vert = abs(o["approachX"] - o["x"]) < 1e-9
        out.append((min(o["approachX"], o["x"]) - (h if vert else 0),
                    max(o["approachX"], o["x"]) + (h if vert else 0),
                    min(o["approachY"], o["y"]) - (0 if vert else h),
                    max(o["approachY"], o["y"]) + (0 if vert else h)))
    return out


def union_area(rects):
    """The union of axis-aligned rectangles, exactly, on the grid of their
    own edges -- written here again, not imported, so the engine's rule has
    an independent home."""
    xs = sorted({v for r in rects for v in r[:2]})
    ys = sorted({v for r in rects for v in r[2:]})
    total = 0.0
    for x0, x1 in zip(xs, xs[1:]):
        for y0, y1 in zip(ys, ys[1:]):
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            if any(r[0] < cx < r[1] and r[2] < cy < r[3] for r in rects):
                total += (x1 - x0) * (y1 - y0)
    return total


def clear_item_rect(i, rect):
    """Clear plan distance from an item's footprint to a rectangle (0 if
    they touch or overlap): a vertical cylinder is a disc, any other a box."""
    x0, x1, y0, y1 = rect
    if i["shape"] == "cylinder" and i["orientation"] == "vertical":
        px = min(max(i["x"], x0), x1)
        py = min(max(i["y"], y0), y1)
        return max(0.0, hypot(i["x"] - px, i["y"] - py) - i["dx"] / 2)
    gx = max(0.0, max(x0 - (i["x"] + i["dx"] / 2), (i["x"] - i["dx"] / 2) - x1))
    gy = max(0.0, max(y0 - (i["y"] + i["dy"] / 2), (i["y"] - i["dy"] / 2) - y1))
    return hypot(gx, gy)


def layout_of(d, extra_ok=False):
    out, err, rc = solve(d)
    j = result_json(out) or {}
    return out, err, rc, j, (j.get("layout") or {})


def said_everywhere(msg, out, err, j):
    caveat = out.split("PLANT LAYOUT", 1)[-1] if "PLANT LAYOUT" in out else ""
    return ("[layout] " + msg in err and msg in caveat
            and any(a.get("category") == "layout" and a.get("message") == msg
                    for a in j.get("advisories") or []))


ROAD_REFUSALS = {
    "a road through a footprint": (
        sub("waypoints ( { x 28 m; y -31 m; } { x 28 m; y 16 m; } );",
            "waypoints ( { x 40 m; y -31 m; } { x 40 m; y 16 m; } );"),
        [r"road `rackCrossing` runs THROUGH `converter`", r"interpenetrate by"]),
    "a road under a rack below the headroom": (
        sub("    headroom 5 m;", "    headroom 7 m;"),
        [r"road `(east|rackCrossing)` passes UNDER the pipe rack", r"6 m above grade",
         r"7 m headroom"]),
    #  The route ends below the purge splitter's rack node, on the witness's
    #  DECLARED rack line, y = -3 m (C93; the stated default's -22/7 m
    #  before the tank farm).
    "a pipe below the headroom over a road": (
        lambda t: t + "\npipes { unreactedGas { waypoints ( { x 56 m; y -6 m; z 3 m; }"
                      " { x 56 m; y -31 m; z 3 m; } { x 37 m; y -31 m; z 3 m; }"
                      " { x 37 m; y -3 m; z 3 m; } ); } }\n",
        [r"pipe `unreactedGas` crosses road `main` 3 m above grade"]),
    "a diagonal road segment": (
        sub("waypoints ( { x -8 m; y -31 m; } { x -8 m; y 16 m; } );",
            "waypoints ( { x -8 m; y -31 m; } { x -6 m; y 16 m; } );"),
        [r"road `west`: the segment .* runs DIAGONALLY", r"add the corner"]),
    "a road declared twice": (
        sub('            road      "west";', '            road      "east";'),
        [r"road `east` is declared twice"]),
    "a waypoint with a z": (
        sub("{ x -8 m; y 16 m; } { x 68 m; y 16 m; }", "{ x -8 m; y 16 m; z 1 m; } { x 68 m; y 16 m; }"),
        [r"road `north` waypoint 1: a road lies at grade"]),
    "no access block": (
        lambda t: re.sub(r"\n    access\n    \{.*?\n    \}\n", "\n", t, count=1, flags=re.S),
        [r"roads: `access \{ distance <m>;", r"is not declared"]),
    "a source with no reason": (
        sub('        reason      "spares, catalyst drums', '        // reason      "spares, catalyst drums'),
        [r"nonProcess `warehouse`: declare both `source"]),
}


def arm_roads(work):
    d = prepare(work, "roads_witness", WITNESS)
    out, err, rc, j, lay = layout_of(d)
    net = lay.get("roadNetwork")
    if rc != 0 or not net:
        fail(f"(k) the witness exited {rc} / published no roadNetwork")
        return
    roads = lay.get("roads", [])
    if len(roads) != 9 or net["roads"] != 9:
        fail(f"(k) the witness declares nine roads; published {len(roads)} / {net['roads']}")
    total = 0.0
    for r in roads:
        c = r["centreline"]
        L = sum(abs(a[0] - b[0]) + abs(a[1] - b[1]) for a, b in zip(c, c[1:]))
        total += L
        if not close(L, r["length"]):
            fail(f"(k) road {r['road']}: published length {r['length']} m, its centre line's"
                 f" own {L} m")
        if not r["fromEntrance"]:
            fail(f"(k) road {r['road']}: published as not reached from the gate")
    if not close(total, net["length"]):
        fail(f"(k) the network's length {net['length']} m, the roads summed here {total} m")
    rects = paved_rects(lay) + approach_rects(lay)
    pav = union_area(rects)
    if not close(pav, net["pavedArea"]):
        fail(f"(k) paved area: the engine {net['pavedArea']} m2, the union recomputed here"
             f" {pav} m2 (the plain sum would be {sum((r[1]-r[0])*(r[3]-r[2]) for r in rects)})")
    if net["components"] != 1 or net["entrances"] != ["gate", "emergencyGate"]:
        fail(f"(k) the witness's network: {net['components']} component(s), entrances"
             f" {net['entrances']}; expected one, reached from `gate` and `emergencyGate`")
    # the crossing under the rack, recomputed from the published rack band
    k = lay["pipeRack"]
    hw = k["lanesPerTier"] * k["laneSpacing"] / 2
    band = (k["xStart"], k["xEnd"], k["y"] - hw, k["y"] + hw)
    want = []
    for r in roads:
        h = r["width"] / 2
        c = r["centreline"]
        for a, b in zip(c, c[1:]):
            x0, x1 = max(min(a[0], b[0]) - h, band[0]), min(max(a[0], b[0]) + h, band[1])
            y0, y1 = max(min(a[1], b[1]) - h, band[2]), min(max(a[1], b[1]) + h, band[3])
            if x1 - x0 > 1e-6 and y1 - y0 > 1e-6:
                want.append((r["road"], x0, x1, y0, y1))
    got = [(c["road"], c["xMin"], c["xMax"], c["yMin"], c["yMax"])
           for c in lay.get("rackCrossings", [])]
    if len(want) != len(got) or any(w[0] != g[0] or not all(close(a, b) for a, b in zip(w[1:], g[1:]))
                                    for w, g in zip(want, got)):
        fail(f"(k) rack crossings: published {got}; recomputed {want}")
    for c in lay.get("rackCrossings", []):
        if c["clearance"] != k["elevation"] or c["clearance"] < net["headroom"]:
            fail(f"(k) crossing {c['road']}: clearance {c['clearance']} m, the rack's"
                 f" elevation {k['elevation']} m, headroom {net['headroom']} m")
    if sorted(w[0] for w in want) != ["east", "rackCrossing"]:
        fail(f"(k) the witness's roads cross the rack at {[w[0] for w in want]};"
             " the case declares two crossings, `rackCrossing` and `east`")
    # access: footprint edge to the nearest paved rectangle of a reached road
    items = {i["id"]: i for i in lay["items"]}
    access = {a["item"]: a for a in lay.get("access", [])}
    reached = [r for r in roads if r["fromEntrance"]]
    for iid, it in items.items():
        a = access.get(iid)
        best, road = None, None
        for r in reached:
            for rect in paved_rects({"roads": [r]}):
                dd = clear_item_rect(it, rect)
                if best is None or dd < best - 1e-9:
                    best, road = dd, r["road"]
        if a is None or a.get("road") != road or not close(a.get("distance", -1), best, 1e-8):
            fail(f"(k) access {iid}: published {a}; recomputed {road} at {best} m")
        elif best > net["accessDistance"] + 1e-9:
            fail(f"(k) access {iid}: {best} m, beyond the declared {net['accessDistance']} m,"
                 " on the witness")
    road_kinds = {"roadInZone", "roadDisconnected", "buildingNotReached", "noRoadAccess",
                  "noEntrance", "weighbridgeOffRoad", "gateOffRoad", "singleEntrance",
                  "turningAreaOffRoad"}
    bad = [f["id"] for f in lay["findings"] if f["kind"] in road_kinds]
    if bad:
        fail(f"(k) the witness raises road findings {bad}; it must raise none")
    # the roads are inside the plot: without them it would be smaller
    margin = margin_of((WITNESS / "system" / "layoutDict").read_text())
    _, with_roads = plot_recomputed(lay, margin)
    _, without = plot_recomputed({**lay, "roads": []}, margin)
    if not (without < with_roads - 1.0) or not close(with_roads, lay["plot"]["plotArea"]):
        fail(f"(k) the plot {lay['plot']['plotArea']} m2: recomputed with the roads"
             f" {with_roads} m2, without them {without} m2 -- the roads must be in the envelope")
    # published <=> pinned
    gold = {}
    for line in (WITNESS / "expected").read_text().splitlines():
        f = line.split()
        if len(f) >= 5 and f[0] == "layout" and (f[1].startswith("road:") or f[1] == "roadNetwork"
                                                 or f[1].startswith("access:")):
            gold[(f[1], f[2])] = (f[3], f[4])
    published = {("roadNetwork", "length"): net["length"],
                 ("roadNetwork", "pavedArea"): net["pavedArea"]}
    for r in roads:
        published[("road:" + r["road"], "length")] = r["length"]
    for a in lay.get("access", []):
        if "distance" in a:
            published[("access:" + a["item"], "distance")] = a["distance"]
    for key, val in published.items():
        g = gold.get(key)
        if g is None:
            fail(f"(k) {key[0]} {key[1]} is published and pinned by no golden row")
        elif abs(float(g[0]) - val) > float(g[1]) * max(abs(val), 1e-30) + 1e-12:
            fail(f"(k) {key[0]} {key[1]} {val} against the golden {g[0]}")
    for key in gold:
        if key not in published:
            fail(f"(k) a golden row pins {key[0]} {key[1]}, which the run no longer publishes")
    n_ok = 0
    # ---- refusals ----------------------------------------------------------
    for label, (edit, pats) in ROAD_REFUSALS.items():
        d = prepare(work, "roads_refuse_" + re.sub(r"\W", "_", label), WITNESS, edit)
        out, err, rc = solve(d)
        if rc != 2 or not all(re.search(pt, out + err, re.S) for pt in pats):
            fail(f"(k) refusal `{label}`: exit {rc}, expected 2 naming {pats}:\n    "
                 + "\n    ".join(l for l in (out + err).splitlines() if "ERROR" in l)[:500])
        else:
            n_ok += 1
    # ---- announcements -----------------------------------------------------
    announced = 0
    #  a road in a closed zone: the makeup compressor's zone 2 grown to 12 m
    #  about (6, -8), so it reaches the west road (11 m), zone 2 closed
    d = prepare(work, "roads_zone", WITNESS, chain(
        sub("    noTraffic ( 1 );", "    noTraffic ( 1 2 );"),
        sub("zones   ( { zone 2; radius 7.5 m; height 6 m; } );",
            "zones   ( { zone 2; radius 12 m; height 6 m; } );")))
    out, err, rc, j, lay2 = layout_of(d)
    f = next((x for x in lay2.get("findings", []) if x["id"] == "roadInZone:west:makeupComp#zone2"), None)
    if rc != 0 or f is None:
        fail(f"(k) zone: exit {rc}, findings {[x['id'] for x in lay2.get('findings', [])]}")
    else:
        it = {i["id"]: i for i in lay2["items"]}["makeupComp"]
        r = next(x for x in lay2["roads"] if x["road"] == "west")
        mine = min(clear_item_rect({"shape": "cylinder", "orientation": "vertical",
                                    "x": it["x"], "y": it["y"], "dx": 0.0}, rect)
                   for rect in paved_rects({"roads": [r]}))
        if not close(f["value"], mine, 1e-8) or f["limit"] != 12:
            fail(f"(k) zone: engine {f['value']} / {f['limit']}, recomputed {mine} / 12")
        elif not said_everywhere(f["message"], out, err, j):
            fail("(k) the roadInZone announcement did not reach stderr, the caveat block"
                 " and the advisories")
        else:
            announced += 1
    #  a disconnected road, a building no road serves, a process item beyond
    #  the access distance
    d = prepare(work, "roads_reach", WITNESS, chain(
        sub("    access\n    {\n        distance 20 m;",
            "    access\n    {\n        distance 7 m;"),
        sub("        x           46 m;\n        y           -62 m;",
            "        x           100 m;\n        y           15 m;"),
        lambda t: t.replace("    network\n    (\n", "    network\n    (\n"
            '        { road "island"; width 4 m; reason "fixture";'
            ' waypoints ( { x 100 m; y 0 m; } { x 110 m; y 0 m; } ); }\n', 1)))
    out, err, rc, j, lay3 = layout_of(d)
    got = {x["id"]: x for x in lay3.get("findings", [])}
    want_ids = [next((x for x in got if x.startswith(w)), w)
                for w in ("roadDisconnected:island:", "buildingNotReached:warehouse:")]
    if rc != 0 or any(w not in got for w in want_ids):
        fail(f"(k) reach: exit {rc}, findings {sorted(got)}")
    else:
        for w in want_ids:
            if not said_everywhere(got[w]["message"], out, err, j):
                fail(f"(k) {w} did not reach all three surfaces")
        it3 = {i["id"]: i for i in lay3["items"]}
        reached3 = [r for r in lay3["roads"] if r["fromEntrance"]]
        for iid, it in it3.items():
            if it["nonProcess"]:
                continue
            best = min(clear_item_rect(it, rect) for r in reached3
                       for rect in paved_rects({"roads": [r]}))
            fid = next((x for x in got if x.startswith(f"noRoadAccess:{iid}:")), None)
            if (best > 7 + 1e-9) != (fid is not None):
                fail(f"(k) access 7 m: {iid} at {best} m, finding {fid}")
            elif fid and not close(got[fid]["value"], best, 1e-8):
                fail(f"(k) {fid}: engine {got[fid]['value']} m, recomputed {best} m")
        if not any(x.startswith("noRoadAccess:") for x in got):
            fail("(k) the 7 m access distance raised no noRoadAccess: the fixture no longer"
                 " reaches the case it is about")
        isl = next(r for r in lay3["roads"] if r["road"] == "island")
        if isl["fromEntrance"] or lay3["roadNetwork"]["components"] != 2:
            fail(f"(k) the island road: fromEntrance {isl['fromEntrance']}, components"
                 f" {lay3['roadNetwork']['components']}")
        announced += 1
    #  no gate
    d = prepare(work, "roads_nogate", WITNESS, sub_all('        kind        gate;', '        kind        guardhouse;'))
    out, err, rc, j, lay4 = layout_of(d)
    if rc != 0 or "noEntrance:roads:" not in {x["id"] for x in lay4.get("findings", [])} \
            or lay4.get("roadNetwork", {}).get("entrances") != []:
        fail(f"(k) no gate: exit {rc}, findings {[x['id'] for x in lay4.get('findings', [])]}")
    else:
        announced += 1
    #  a weighbridge: ON the main road (driven over, nothing raised), then off it
    wb = ('    { nonProcess "weighbridge2"; kind weighbridge; x 40 m; y -31 m; z 0 m;'
          ' orientation alongX; footprint { length 18 m; width 3.5 m; height 0.4 m; }'
          ' source "fixture"; reason "fixture: road tankers weighed at the gate"; }\n')
    d = prepare(work, "roads_weighbridge_on", WITNESS, sub(ITEMS_OPEN, ITEMS_OPEN + wb))
    out, err, rc, j, lay5 = layout_of(d)
    acc = {a["item"]: a for a in lay5.get("access", [])}.get("weighbridge2", {})
    if rc != 0 or not acc.get("onDeck") or acc.get("road") != "main" \
            or any(x["a"] == "weighbridge2" for x in lay5.get("findings", [])):
        fail(f"(k) a weighbridge on the main road: exit {rc}, access {acc}, findings"
             f" {[x['id'] for x in lay5.get('findings', [])]}")
    else:
        announced += 1
    d = prepare(work, "roads_weighbridge_off", WITNESS,
                sub(ITEMS_OPEN, ITEMS_OPEN + wb.replace("x 40 m; y -31 m;", "x 90 m; y -15 m;")))
    out, err, rc, j, lay6 = layout_of(d)
    f6 = next((x for x in lay6.get("findings", []) if x["id"] == "weighbridgeOffRoad:weighbridge2:"), None)
    if rc != 0 or f6 is None or not said_everywhere(f6["message"], out, err, j):
        fail(f"(k) a weighbridge off the road: exit {rc}, findings"
             f" {[x['id'] for x in lay6.get('findings', [])]}")
    else:
        announced += 1
    claims.append(f"the witness's nine roads: lengths, the network's length and its paved area"
                  f" ({net['pavedArea']:.2f} m2, the union recomputed here), the crossing under"
                  " the rack and every item's access distance recomputed, none beyond the"
                  " declared distance, the roads inside the plot, every road number pinned;"
                  f" {n_ok} road refusals; {announced} road announcement fixtures (a closed"
                  " zone, a disconnected road with an unserved building and items beyond"
                  " the access distance, no gate, a weighbridge on and off the road)")



# ------------------------------------------------------------ the fence (C93) --
def fence_declared(text):
    """The witness's `fence {}` block, read here as TEXT: its inset and, per
    crossing, (word, label, side, at) -- an independent home for what the
    engine must have read."""
    m = re.search(r"^fence\s*\n\{(.*?)^\}", text, re.S | re.M)
    if not m:
        return None
    body = m.group(1)
    im = re.search(r"\binset\s+([-0-9.eE+]+)\s*m\s*;", body)
    out = {"inset": float(im.group(1)) if im else None, "crossings": {}}
    for e in re.findall(r"\{([^{}]*)\}", body):
        s = re.search(r"\bstream\s+(\w+)\s*;", e)
        w = re.search(r'\b(from|to)\s+"([^"]*)"\s*;', e)
        side = re.search(r"\bside\s+(\w+)\s*;", e)
        at = re.search(r"\bat\s+([-0-9.eE+]+)\s*m\s*;", e)
        if s and w:
            out["crossings"][s.group(1)] = (w.group(1), w.group(2),
                                            side.group(1) if side else None,
                                            float(at.group(1)) if at else None)
    return out


def arm_fence(work):
    """(l) THE FENCE -- see the module docstring."""
    text = (WITNESS / "system" / "layoutDict").read_text()
    dec = fence_declared(text)
    if dec is None:
        fail("(l) the witness declares no `fence {}` -- this arm CANNOT RUN; it must not pass")
        return
    d = prepare(work, "fence_witness", WITNESS)
    out, err, rc, j, lay = layout_of(d)
    F, plot = lay.get("fence"), lay.get("plot")
    if rc != 0 or not F or not plot:
        fail(f"(l) the witness exited {rc} / published no fence or no plot")
        return
    # the line: the published plot moved `inset` inward, its length
    inset = dec["inset"] if dec["inset"] is not None else 0.0
    want = (plot["xMin"] + inset, plot["xMax"] - inset, plot["yMin"] + inset, plot["yMax"] - inset)
    got = (F["xMin"], F["xMax"], F["yMin"], F["yMax"])
    L = 2 * ((want[1] - want[0]) + (want[3] - want[2]))
    if not all(close(a, b) for a, b in zip(want, got)) or not close(F["length"], L) \
            or F["inset"] != inset or F["insetDeclared"] != (dec["inset"] is not None):
        fail(f"(l) the fence {got}, {F['length']} m (inset {F['inset']}); recomputed from"
             f" the published plot and the declared inset {want}, {L} m")
    x0, x1, y0, y1 = want

    def nearest(px, py):
        c = [(py - y0, "south"), (y1 - py, "north"), (px - x0, "west"), (x1 - px, "east")]
        best = c[0]
        for v in c[1:]:
            if v[0] < best[0] - 1e-6:
                best = v
        return best[1]

    def on_side(side, along):
        return {"south": (along, y0), "north": (along, y1),
                "west": (x0, along), "east": (x1, along)}[side]
    along_x = lambda side: side in ("south", "north")
    # the openings: one per gate, on its nearest side, centred on the end of
    # the road that serves it (the nearest paved rectangle), that road's width
    items = {i["id"]: i for i in lay["items"]}
    gates = [i for i in lay["items"] if i.get("nonProcess") and i["kind"] == "gate"]
    opens = {o["gate"]: o for o in lay.get("fenceOpenings", [])}
    if len(opens) != len(gates) or not gates:
        fail(f"(l) {len(gates)} gate(s) placed, {len(opens)} opening(s) published")
    for g in gates:
        o = opens.get(g["id"])
        side = nearest(g["x"], g["y"])
        best, road = None, None
        for r in lay.get("roads", []):
            for rect in paved_rects({"roads": [r]}):
                dd = max(0.0, clear_item_rect(g, rect))
                if best is None or dd < best - 1e-6:
                    best, road = dd, r
        along = g["x"] if along_x(side) else g["y"]
        width = g["dx"] if along_x(side) else g["dy"]
        end = None
        if road:
            dmin = None
            for q in road["centreline"]:
                fx, fy = on_side(side, q[0] if along_x(side) else q[1])
                dd = hypot(q[0] - fx, q[1] - fy)
                if dmin is None or dd < dmin - 1e-6:
                    dmin, along, end = dd, (q[0] if along_x(side) else q[1]), q
            width = road["width"]
        ox, oy = on_side(side, along)
        #  C96: the APPROACH, the road carried on from that end to the opening.
        appr = hypot(ox - end[0], oy - end[1]) if end else 0.0
        if not o or o["side"] != side or not close(o["x"], ox) or not close(o["y"], oy) \
                or not close(o["width"], width) or o["road"] != (road["road"] if road else "") \
                or not close(o.get("approach", -1.0), appr, 1e-9) \
                or (end and (not close(o["approachX"], end[0]) or not close(o["approachY"], end[1]))):
            fail(f"(l) the opening for gate {g['id']}: published {o}; recomputed {side} side"
                 f" at ({ox}, {oy}), {width} m, road {road['road'] if road else ''},"
                 f" approach {appr} m from {end}")
    # no road meets the fence outside an opening (recomputed, both ways)
    for r in lay.get("roads", []):
        for (rx0, rx1, ry0, ry1) in paved_rects({"roads": [r]}):
            for side, hit, a0, a1 in (
                    ("south", ry0 < y0 - 1e-6 < ry1, max(rx0, x0), min(rx1, x1)),
                    ("north", ry0 < y1 + 1e-6 < ry1, max(rx0, x0), min(rx1, x1)),
                    ("west", rx0 < x0 - 1e-6 < rx1, max(ry0, y0), min(ry1, y1)),
                    ("east", rx0 < x1 + 1e-6 < rx1, max(ry0, y0), min(ry1, y1))):
                if not hit:
                    continue
                ok = any(o["side"] == side and
                         a0 >= (o["x"] if along_x(side) else o["y"]) - o["width"] / 2 - 1e-6 and
                         a1 <= (o["x"] if along_x(side) else o["y"]) + o["width"] / 2 + 1e-6
                         for o in opens.values())
                if not ok:
                    fail(f"(l) road {r['road']} meets the fence on its {side} side outside"
                         " every gate opening, and the witness ran")
    # every pipe with a battery-limit end crosses once, where the rule says,
    # with the declared label; nothing else crosses
    k = lay["pipeRack"]
    def lane(n):
        tier, pos = divmod(n, k["lanesPerTier"])
        return (k["y"] + (pos - 0.5 * (k["lanesPerTier"] - 1)) * k["laneSpacing"],
                k["elevation"] + tier * k["tierSpacing"])
    cross = {c["stream"]: c for c in lay.get("fenceCrossings", [])}
    boundary = [p for p in lay.get("pipes", [])
                if "batteryLimit" in (p["fromKind"], p["toKind"])]
    if set(cross) != {p["stream"] for p in boundary} or not boundary:
        fail(f"(l) crossings {sorted(cross)} against the pipes with a battery-limit end"
             f" {sorted(p['stream'] for p in boundary)}")
    for p in boundary:
        c = cross.get(p["stream"])
        if c is None:
            continue
        inlet = p["fromKind"] == "batteryLimit"
        w = dec["crossings"].get(p["stream"])
        ly, lz = lane(p["lane"])
        side = w[2] if w and w[2] else ("west" if inlet else "east")
        if along_x(side):
            pt = (w[3], y0 if side == "south" else y1, lz)
        else:
            pt = (x0 if side == "west" else x1, ly, lz)
        if c["direction"] != ("in" if inlet else "out") or c["side"] != side \
                or any(not close(c[q], v) for q, v in zip(("x", "y", "z"), pt)):
            fail(f"(l) crossing {p['stream']}: published {c['direction']} {c['side']}"
                 f" ({c['x']}, {c['y']}, {c['z']}); recomputed {side} {pt}")
        if not w or not c["labelDeclared"] or c["label"] != w[1] \
                or w[0] != ("from" if inlet else "to"):
            fail(f"(l) crossing {p['stream']}: label {c['label']!r} (declared"
                 f" {c['labelDeclared']}) against the layoutDict's {w}")
    if any(f["kind"] == "unlabelledCrossing" for f in lay["findings"]):
        fail("(l) the witness raises an unlabelledCrossing finding; every crossing is labelled")
    # published <=> pinned
    gold = {}
    for line in (WITNESS / "expected").read_text().splitlines():
        f = line.split()
        if len(f) >= 5 and f[0] == "layout" and (f[1] == "fence" or f[1].startswith("fence")):
            gold[(f[1], f[2])] = f[3]
    pub = [("fence", "length", F["length"])]
    for o in opens.values():
        pub += [("fenceOpening:" + o["gate"], q, o[q]) for q in ("x", "y", "side", "approach") if q in o]
    for c in cross.values():
        pub += [("fenceCrossing:" + c["stream"], q, c[q]) for q in ("x", "y", "z", "side")]
    for rid, key, v in pub:
        g = gold.get((rid, key))
        if g is None:
            fail(f"(l) {rid} {key} is published and pinned by no golden row")
        elif isinstance(v, str):
            if g != v:
                fail(f"(l) {rid} {key} `{v}` against the golden `{g}`")
        elif not close(float(g), v, 1e-4):
            fail(f"(l) {rid} {key} {v} against the golden {g}")
    pubkeys = {(r, q) for r, q, _ in pub}
    for key in gold:
        if key not in pubkeys:
            fail(f"(l) a golden row pins {key[0]} {key[1]}, which the run no longer publishes")

    # ---- an unlabelled crossing is ANNOUNCED by name, never refused ----------
    n_ok = 0
    d = prepare(work, "fence_unlabelled", WITNESS, lambda t: re.sub(
        r"\n\s*\{\s*stream makeup;[^{}]*\}", "", t, count=1))
    out, err, rc, j, lay2 = layout_of(d)
    f = next((x for x in lay2.get("findings", []) if x["id"] == "unlabelledCrossing:makeup:"), None)
    if rc != 0 or f is None or not said_everywhere(f["message"], out, err, j) \
            or "`makeup`" not in f["message"]:
        fail(f"(l) the makeup crossing's label removed: exit {rc}, findings"
             f" {[x['id'] for x in lay2.get('findings', [])]} -- it must be ANNOUNCED by"
             " name on all three surfaces and the run must finish")
    else:
        n_ok += 1
    # ---- the gate-closed announcement --------------------------------------
    d = prepare(work, "fence_nogate", WITNESS, sub_all("        kind        gate;",
                                                         "        kind        guardhouse;"))
    out, err, rc, j, lay3 = layout_of(d)
    if rc != 0 or "the fence declares no way in" not in err \
            or (lay3.get("fenceOpenings") or []) != []:
        fail(f"(l) no gate: exit {rc}; the closed fence must be announced and open nowhere")
    else:
        n_ok += 1
    # ---- refusals, each exit 2 and naming its defect -------------------------
    inset_line = re.search(r"\n    inset\s+[^;]*;", text).group(0)
    refusals = {
        #  6 m inward cuts the entrance road AT the gate's opening (allowed)
        #  and the east road on the north side, where no gate opens it.
        "a road through the fence at no gate": (
            sub(inset_line, "\n    inset   6 m;"),
            [r"road `east` meets the fence on its north side", r"no gate"]),
        "an item across the fence": (
            chain(drop_block_edit("roads"), sub(inset_line, "\n    inset   6 m;")),
            [r"fence: `[\w/]+` stands across or outside the fence", r"reduce the inset"]),
        "a negative inset": (
            sub(inset_line, "\n    inset   -1 m;"), [r"`inset -1 m;`", r"INWARD"]),
        "a crossing on no boundary stream": (
            sub("    crossings\n    (\n", "    crossings\n    (\n"
                '        { stream mixed; to "nowhere"; }\n'),
            [r"fence crossing `mixed`: no pipe of this layout ends at a battery limit"]),
        "an outlet labelled `from`": (
            sub('{ stream letdownGas;    to ', '{ stream letdownGas;    from '),
            [r"`letdownGas` is a plant OUTLET", r"`to"]),
        "a north crossing with no `at`": (
            sub("side north;  at 37 m;", "side north;"),
            [r"fence crossing `purge`: a crossing on the north side names where"]),
        "an `at` off the side": (
            sub("side north;  at 37 m;", "side north;  at 900 m;"),
            [r"`at 900 m;` lies outside the north side"]),
        "a crossing declared twice": (
            sub("    crossings\n    (\n", "    crossings\n    (\n"
                '        { stream makeup; from "again"; }\n'),
            [r"fence crossing `makeup` is declared twice"]),
    }
    for label, (edit, pats) in refusals.items():
        d = prepare(work, "fence_refuse_" + re.sub(r"\W", "_", label), WITNESS, edit)
        o, e, r = solve(d)
        if r != 2 or not all(re.search(pt, o + e, re.S) for pt in pats):
            fail(f"(l) {label}: exit {r}, expected 2 naming {pats}:\n    "
                 + "\n    ".join(l for l in (o + e).splitlines() if "ERROR" in l)[:400])
        else:
            n_ok += 1
    claims.append(f"the witness's fence ({F['length']:.2f} m) recomputed from the published"
                  f" plot and the declared inset, {len(opens)} gate opening(s) recomputed"
                  " from the gate and its road, no road meeting it elsewhere,"
                  f" {len(cross)} pipe crossings recomputed (side, point, lane) each with"
                  " the declared origin or destination, every fence number pinned;"
                  f" {n_ok} fixtures (an unlabelled crossing announced by name, a gateless"
                  " fence announced, eight refusals)")


# ------------------------------------------------------------ clash (C93) --

def seg_inside_circle(cx, cy, r, a, b):
    """The parameter interval of segment a->b strictly inside the disc."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    fx, fy = a[0] - cx, a[1] - cy
    A = dx * dx + dy * dy
    C = fx * fx + fy * fy - r * r
    if A < 1e-18:
        return (0.0, 1.0) if C < 0 else None
    B = 2 * (fx * dx + fy * dy)
    disc = B * B - 4 * A * C
    if disc <= 0:
        return None
    q = disc ** 0.5
    t0, t1 = max(0.0, (-B - q) / (2 * A)), min(1.0, (-B + q) / (2 * A))
    return (t0, t1) if t1 > t0 else None


def seg_inside_rect(lo, hi, a, b):
    """Orthogonal segments only (the router's and the gate's contract): the
    interval along an axis-aligned segment strictly inside the rectangle."""
    t0, t1 = 0.0, 1.0
    for k in (0, 1):
        d = b[k] - a[k]
        if abs(d) < 1e-12:
            if not (lo[k] < a[k] < hi[k]):
                return None
            continue
        u0, u1 = sorted(((lo[k] - a[k]) / d, (hi[k] - a[k]) / d))
        t0, t1 = max(t0, u0), min(t1, u1)
        if t1 <= t0:
            return None
    return (t0, t1)


def clashes_recomputed(lay):
    """Every (pipe, item) pair whose route passes through the item's footprint
    below its top and above its base, the pipe's own end items excepted --
    recomputed here from the published routes and items."""
    eps = 1e-6
    found = set()
    for p in lay.get("pipes", []):
        for it in lay["items"]:
            if it["id"] in (p["from"] if p["fromKind"] == "item" else None,
                            p["to"] if p["toKind"] == "item" else None):
                continue
            if it.get("room"):
                continue   # DEV.md 4c C100: the building's shell answers for it
            circle = it.get("shape") == "cylinder" and it.get("orientation") == "vertical"
            for a, b in zip(p["route"], p["route"][1:]):
                if circle:
                    iv = seg_inside_circle(it["x"], it["y"], it["dx"] / 2 - eps, a, b)
                else:
                    iv = seg_inside_rect((it["x"] - it["dx"] / 2 + eps, it["y"] - it["dy"] / 2 + eps),
                                         (it["x"] + it["dx"] / 2 - eps, it["y"] + it["dy"] / 2 - eps),
                                         a, b)
                if iv is None:
                    continue
                za = a[2] + iv[0] * (b[2] - a[2])
                zb = a[2] + iv[1] * (b[2] - a[2])
                if max(za, zb) > it["z"] + eps and min(za, zb) < it["z"] + it["dz"] - eps:
                    found.add((p["stream"], it["id"]))
                    break
    return found


#  The probe: the warehouse moved north onto the makeup pipeline's line (the
#  pipe runs at y -4.5, 6 m up; the warehouse is 7 m tall) -- a box clash.
CLASH_WAREHOUSE = sub('''        nonProcess  "warehouse";
        kind        warehouse;
        x           46 m;
        y           -62 m;''', '''        nonProcess  "warehouse";
        kind        warehouse;
        x           -30 m;
        y           -4 m;''')
#  The second probe: rawLiquid routed by waypoints 5 m up through the
#  converter -- a vertical cylinder, the disc rule.
CLASH_CONVERTER = ("\npipes { rawLiquid { waypoints ( { x 56 m; y -6 m; z 5 m; }"
                   " { x 40 m; y -6 m; z 5 m; } { x 40 m; y -3 m; z 5 m; }"
                   " { x 59.5 m; y -3 m; z 5 m; } { x 59.5 m; y -6 m; z 5 m; } ); } }\n")

#  The negative: rawLiquid turned at the converter's plan CORNER, 5 m up --
#  inside the disc's bounding square, outside the disc itself (the turn sits
#  0.95 R off the centre on both axes), so NO clash: a pipe beside a column
#  does not run through it.
CLASH_CORNER = ("\npipes { rawLiquid { waypoints ( { x 56 m; y -6 m; z 5 m; }"
                " { x 56 m; y -4.989 m; z 5 m; } { x 41.011 m; y -4.989 m; z 5 m; }"
                " { x 41.011 m; y -3 m; z 5 m; } { x 59.5 m; y -3 m; z 5 m; }"
                " { x 59.5 m; y -6 m; z 5 m; } ); } }\n")


def arm_clash(work):
    n = 0
    # the shipped layouts: the engine's clash list equals the recomputed one
    # (empty on every one of them today)
    for tag, case in PIPE_CASES.items():
        d = prepare(work, "clash_" + tag, case)
        out, err, rc, j, lay = layout_of(d)
        pub = {(f["a"], f["b"]) for f in lay.get("findings", []) if f["kind"] == "pipeClash"}
        rec = clashes_recomputed(lay) if lay else None
        if rc != 0 or rec is None or pub != rec:
            fail(f"(m) {tag}: published clashes {sorted(pub)} against {sorted(rec or [])}"
                 " recomputed here")
        else:
            n += 1
    for label, edit, want in (
            ("the warehouse moved onto the makeup line", CLASH_WAREHOUSE,
             ("makeup", "warehouse", 6.0, 7.0)),
            ("rawLiquid routed through the converter", lambda t: t + CLASH_CONVERTER,
             ("rawLiquid", "converter", 5.0, None))):
        d = prepare(work, "clash_probe_" + re.sub(r"\W", "_", label), WITNESS, edit)
        out, err, rc, j, lay = layout_of(d)
        fs = {(f["a"], f["b"]): f for f in lay.get("findings", []) if f["kind"] == "pipeClash"}
        rec = clashes_recomputed(lay) if lay else set()
        f = fs.get(want[:2])
        top = None
        if lay:
            it = next((i for i in lay["items"] if i["id"] == want[1]), None)
            top = it["z"] + it["dz"] if it else None
        if rc != 0 or f is None or set(fs) != rec \
                or abs(f["value"] - want[2]) > 1e-9 or top is None \
                or abs(f["limit"] - (want[3] if want[3] is not None else top)) > 1e-9 \
                or not said_everywhere(f["message"], out, err, j) \
                or f"`{want[0]}`" not in f["message"] or f"`{want[1]}`" not in f["message"]:
            fail(f"(m) {label}: exit {rc}, clashes {sorted(fs)} (recomputed {sorted(rec)});"
                 f" `{want[0]}` through `{want[1]}` must be ANNOUNCED by name on stderr,"
                 " the caveat block and the advisories, at its elevation and below the"
                 " item's top, and the run must finish")
        else:
            n += 1
    d = prepare(work, "clash_probe_corner", WITNESS, lambda t: t + CLASH_CORNER)
    out, err, rc, j, lay = layout_of(d)
    fs = [f["id"] for f in lay.get("findings", []) if f["kind"] == "pipeClash"]
    rec = clashes_recomputed(lay) if lay else {("no", "layout")}
    if rc != 0 or fs or rec:
        fail(f"(m) rawLiquid turned at the converter's plan corner (outside its disc):"
             f" exit {rc}, clashes published {fs}, recomputed {sorted(rec)} -- none expected")
    else:
        n += 1
    claims.append(f"no routed pipe runs through a placed item on the {len(PIPE_CASES)}"
                  " shipped layouts (the engine's clash list equal to the one recomputed"
                  f" here), {n - len(PIPE_CASES) - 1} probes (a box, a vertical cylinder)"
                  " each announced by name on three surfaces, and a pipe turned at a"
                  " column's plan corner, outside its disc, announced as nothing")


# ------------------------------------------------------------ site logistics (C96) --
#  An independent home for the truck-route walk and the car-park rule
#  (PlantLayout.cpp `checkTruckRoutes`, `readParking`), written again here
#  from the rule's sentence, never imported.

def _arc_on(cl, p):
    s = 0.0
    for a, b in zip(cl, cl[1:]):
        if (min(a[0], b[0]) - 1e-6 <= p[0] <= max(a[0], b[0]) + 1e-6
                and min(a[1], b[1]) - 1e-6 <= p[1] <= max(a[1], b[1]) + 1e-6):
            return s + abs(p[0] - a[0]) + abs(p[1] - a[1])
        s += abs(b[0] - a[0]) + abs(b[1] - a[1])
    return None


def _point_at(cl, s):
    acc = 0.0
    for a, b in zip(cl, cl[1:]):
        seg = abs(b[0] - a[0]) + abs(b[1] - a[1])
        if s <= acc + seg + 1e-9:
            t = (s - acc) / seg if seg > 0 else 0.0
            return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]
        acc += seg
    return list(cl[-1])


def _driven(cl, s0, s1):
    acc = [0.0]
    for a, b in zip(cl, cl[1:]):
        acc.append(acc[-1] + abs(b[0] - a[0]) + abs(b[1] - a[1]))
    pts = [_point_at(cl, s0)]
    idx = range(len(cl)) if s1 >= s0 else range(len(cl) - 1, -1, -1)
    for k in idx:
        if min(s0, s1) + 1e-6 < acc[k] < max(s0, s1) - 1e-6:
            pts.append(list(cl[k]))
    pts.append(_point_at(cl, s1))
    return pts


def _meetings(A, B):
    out = []
    for a0, a1 in zip(A, A[1:]):
        for b0, b1 in zip(B, B[1:]):
            x0 = max(min(a0[0], a1[0]), min(b0[0], b1[0]))
            x1 = min(max(a0[0], a1[0]), max(b0[0], b1[0]))
            y0 = max(min(a0[1], a1[1]), min(b0[1], b1[1]))
            y1 = min(max(a0[1], a1[1]), max(b0[1], b1[1]))
            if x1 < x0 - 1e-6 or y1 < y0 - 1e-6:
                continue
            out.append([x0, y0])
            if x1 - x0 > 1e-6 or y1 - y0 > 1e-6:
                out.append([x1, y1])
    return out


def walk_route(lay, t):
    """The path the rule drives, and its corners: [(x, y, turn, radius,
    outer, ok)] with turn left|right|reverse."""
    roads = {r["road"]: r for r in lay["roads"]}
    access = {a["item"]: a for a in lay.get("access", [])}
    opens = {o["gate"]: o for o in lay.get("fenceOpenings", []) if o.get("road")}

    def end_of(name, road):
        o = opens.get(name)
        if o and o["road"] == road:
            return [o["approachX"], o["approachY"]], [o["x"], o["y"]]
        a = access[name]
        return [a["roadX"], a["roadY"]], None

    pts, seg_road = [], []

    def push(q, road):
        if pts and abs(pts[-1][0] - q[0]) < 1e-6 and abs(pts[-1][1] - q[1]) < 1e-6:
            return
        if pts:
            seg_road.append(road)
        pts.append(list(q))

    P, Oin = end_of(t["from"], t["roads"][0])
    E, Oout = end_of(t["to"], t["roads"][-1])
    if Oin:
        push(Oin, t["roads"][0])
    push(P, t["roads"][0])
    for k, name in enumerate(t["roads"]):
        cl = roads[name]["centreline"]
        s0 = _arc_on(cl, P)
        target = E
        if k + 1 < len(t["roads"]) and t["roads"][k + 1] == name:
            total = _arc_on(cl, cl[-1])
            target = list(cl[0]) if s0 > 0.5 * total else list(cl[-1])
        elif k + 1 < len(t["roads"]):
            cands = _meetings(cl, roads[t["roads"][k + 1]]["centreline"])
            target = min(cands, key=lambda c: abs(_arc_on(cl, c) - s0))
        for q in _driven(cl, s0, _arc_on(cl, target)):
            push(q, name)
        P = target
    if Oout:
        push(Oout, t["roads"][-1])
    need = lay["designVehicle"]["turningDiameter"] / 2
    corners = []
    for i in range(1, len(pts) - 1):
        ax, ay = pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]
        bx, by = pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]
        dot = (ax * bx + ay * by) / (hypot(ax, ay) * hypot(bx, by))
        if dot > 0.5:
            continue
        if dot < -0.5:
            corners.append((pts[i][0], pts[i][1], "reverse", None, None, None))
            continue
        rin, rout = roads[seg_road[i - 1]], roads[seg_road[i]]
        r = min(rin.get("cornerRadius", 0), rout.get("cornerRadius", 0))
        outer = r + min(rin["width"], rout["width"]) / 2
        corners.append((pts[i][0], pts[i][1], "left" if ax * by - ay * bx > 0 else "right",
                        r, outer, outer >= need - 1e-6))
    length = sum(hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts, pts[1:]))
    return pts, corners, length


def car_park_recomputed(it, c):
    """(rows, perRow, capacity) by the rule, from the declared bay, aisle,
    angle and arrangement and the item's own plan extents."""
    th = radians(c["angle"])
    sn, cs = sin(th), (0.0 if abs(cos(th)) < 1e-12 else cos(th))
    along_x = it["orientation"] == "alongX"
    L, W = (it["dx"], it["dy"]) if along_x else (it["dy"], it["dx"])
    depth = c["bayLength"] * sn + c["bayWidth"] * cs
    pitch = c["bayWidth"] / sn
    first = c["bayLength"] * cs + c["bayWidth"] * sn
    usable = L - 2 * c["aisle"]
    per = 0 if usable + 1e-9 < first else int(floor((usable - first) / pitch + 1e-9)) + 1
    rows = 0
    if c["arrangement"] == "doubleLoaded":
        mod = 2 * depth + c["aisle"]
        v = -W / 2
        while v + mod <= W / 2 + 1e-9:
            rows += 2
            v += mod
        if v + depth + c["aisle"] <= W / 2 + 1e-9:
            rows += 1
    else:
        v = -W / 2 + c["aisle"]
        while v + depth + c["aisle"] <= W / 2 + 1e-9:
            rows += 1
            v += depth + c["aisle"]
    return rows, per, rows * per


def _deck_crossed(pts, it):
    for a, b in zip(pts, pts[1:]):
        cx = min(max(it["x"], min(a[0], b[0])), max(a[0], b[0]))
        cy = min(max(it["y"], min(a[1], b[1])), max(a[1], b[1]))
        if abs(cx - it["x"]) <= it["dx"] / 2 + 1e-6 and abs(cy - it["y"]) <= it["dy"] / 2 + 1e-6:
            return True
    return False


def _on_path(pts, p):
    return any(min(a[0], b[0]) - 1e-6 <= p[0] <= max(a[0], b[0]) + 1e-6
               and min(a[1], b[1]) - 1e-6 <= p[1] <= max(a[1], b[1]) + 1e-6
               for a, b in zip(pts, pts[1:]))


ROUTE_OPEN = "    truckRoutes\n    (\n"


def _add_route(entry):
    return sub(ROUTE_OPEN, ROUTE_OPEN + entry)


def _route_block(name, roads, extra=""):
    return ('        { route "%s"; from gate; to gate; roads ( %s ); %s'
            'reason "fixture"; }\n' % (name, roads, extra))


#  The tank-farm road carried on to x 160 m with a turning area at its end,
#  and a second route that drives it to the end and back (a dead end visited).
def _tank_farm_dead_end(diameter):
    return chain(
        sub("waypoints ( { x 68 m; y -31 m; } { x 146 m; y -31 m; } );",
            "waypoints ( { x 68 m; y -31 m; } { x 160 m; y -31 m; } );"),
        sub("    network\n    (\n",
            "    turningAreas ( { area \"tankFarmEnd\"; x 160 m; y -31 m; diameter %s m;"
            " reason \"fixture\"; } );\n    network\n    (\n" % diameter),
        _add_route(_route_block("tankers", "entrance main tankFarm tankFarm main entrance")))


SITE_REFUSALS = {
    "more bays than the footprint holds": (
        sub("            bays        22;", "            bays        30;"),
        [r"30 bays are declared, and the footprint holds 22", r"2 row\(s\) of 11"]),
    "parking on a kind that is not a car park": (
        sub("        kind        carPark;", "        kind        lorryPark;"),
        [r"`parking \{\}` is declared on an item of kind `lorryPark`"]),
    "a car park with no parking block": (
        lambda t: re.sub(r"\n        parking\n        \{.*?\n        \}\n", "\n", t, count=1,
                         flags=re.S),
        [r"a `carPark` declares its bays"]),
    "a bay at 20 deg": (
        sub("            angle       90 deg;", "            angle       20 deg;"),
        [r"`angle 20 deg;` -- a bay stands at\s+30 to 90 deg"]),
    "truck routes with no design vehicle": (
        lambda t: re.sub(r"\n    designVehicle\n    \{.*?\n    \}\n", "\n", t, count=1, flags=re.S),
        [r"`truckRoutes` are declared with no `designVehicle"]),
    "a route naming no declared road": (
        sub("roads  ( entrance main yardLink yard entrance );",
            "roads  ( entrance main nowhere );"),
        [r"truck route `deliveries`: `nowhere`", r"Declared"]),
    "two roads that do not meet": (
        sub("roads  ( entrance main yardLink yard entrance );",
            "roads  ( entrance tankFarm entrance );"),
        [r"roads `entrance` and `tankFarm` do not meet"]),
    "a route from no placed item": (
        sub("            from   gate;", "            from   gateX;"),
        [r"truck route `deliveries`: `gateX` is no placed item"]),
    "an approach through an item": (
        sub(ITEMS_OPEN, ITEMS_OPEN + '    { nonProcess "kiosk"; kind kiosk; x -12 m; y -84 m;'
            ' z 0 m; orientation alongX; footprint { length 3 m; width 2 m; height 2 m; } }\n'),
        [r"the approach from road `entrance` to gate `gate`'s opening in the fence runs"
         r" THROUGH `kiosk`"]),
    "a turning area through an item": (
        sub("    network\n    (\n", "    turningAreas ( { area \"t\"; x 146 m; y -31 m;"
            " diameter 25 m; reason \"fixture\"; } );\n    network\n    (\n"),
        [r"turning area `t` .* runs THROUGH `T201/vessel7`"]),
    "a negative corner radius": (
        sub("            cornerRadius 10 m;\n            oneWay       yes;\n"
            "            reason       \"the truck yard",
            "            cornerRadius -1 m;\n            oneWay       yes;\n"
            "            reason       \"the truck yard"),
        [r"road `yard`: `cornerRadius` cannot be negative"]),
    "a one-way word that is no word": (
        sub("            oneWay       yes;\n            reason       \"the truck yard",
            "            oneWay       maybe;\n            reason       \"the truck yard"),
        [r"road `yard`: `oneWay`", r"Accepted.*yes.*no"]),
}


def arm_site(work):
    d = prepare(work, "site_witness", WITNESS)
    out, err, rc, j, lay = layout_of(d)
    if rc != 0 or not lay.get("truckRoutes") or not lay.get("carParks"):
        fail(f"(n) the witness exited {rc} / published no truck route or car park")
        return
    items = {i["id"]: i for i in lay["items"]}
    # ---- the truck route, walked again here -------------------------------
    T = lay["truckRoutes"][0]
    pts, corners, length = walk_route(lay, T)
    pub_c = [c for c in lay.get("routeCorners", []) if c["route"] == T["route"]]
    if len(pts) != len(T["path"]) or any(not close(a[0], b[0]) or not close(a[1], b[1])
                                         for a, b in zip(pts, T["path"])):
        fail(f"(n) route {T['route']}: published path {T['path']}; walked here {pts}")
    if not close(length, T["length"]):
        fail(f"(n) route {T['route']}: published length {T['length']} m, walked {length} m")
    if len(pub_c) != len(corners) or any(
            c["turn"] != w[2] or not close(c["x"], w[0]) or not close(c["y"], w[1])
            or (w[3] is not None and (not close(c["radius"], w[3]) or not close(c["outerRadius"], w[4])
                                      or c["ok"] != w[5]))
            for c, w in zip(pub_c, corners)):
        fail(f"(n) route {T['route']}: published corners {[(c['turn'], c['x'], c['y'], c['radius'], c['outerRadius'], c['ok']) for c in pub_c]};"
             f" walked {corners}")
    need = lay["designVehicle"]["turningDiameter"] / 2
    if T["verdict"] != "clear" or T["reversals"] != 0 or any(not w[5] for w in corners) \
            or any(c["required"] != need for c in pub_c):
        fail(f"(n) the witness's route must be CLEAR -- no reversal, every corner's outer edge"
             f" at least {need} m: verdict {T['verdict']}, corners {corners}")
    for a, b in zip([c for c in corners], corners[1:]):
        gap = abs(b[0] - a[0]) + abs(b[1] - a[1])
        if gap < a[3] + b[3] - 1e-6:
            fail(f"(n) corners {a[:2]} and {b[:2]}: {gap} m apart, radii {a[3]} + {b[3]} m")
    bridges = [i for i in lay["items"] if i.get("nonProcess") and i["kind"] == "weighbridge"]
    crossed = [b["id"] for b in bridges if _deck_crossed(pts, b)]
    if not crossed or T["weighbridge"] != crossed[0]:
        fail(f"(n) route {T['route']}: weighbridge published `{T['weighbridge']}`, crossed"
             f" here {crossed}")
    access = {a["item"]: a for a in lay.get("access", [])}
    for s in T["serves"]:
        a = access.get(s, {})
        if not a.get("road") or not _on_path(pts, (a["roadX"], a["roadY"])):
            fail(f"(n) route {T['route']} serves `{s}`, whose road point {a} is not on its path")
    gates = {i["id"] for i in lay["items"] if i.get("nonProcess") and i["kind"] == "gate"}
    if T["from"] not in gates or T["to"] not in gates:
        fail(f"(n) route {T['route']} runs {T['from']} -> {T['to']}: both must be gates")
    # ---- the car park, laid out again here --------------------------------
    for c in lay["carParks"]:
        it = items[c["item"]]
        rows, per, cap = car_park_recomputed(it, c)
        if (rows, per, cap) != (c["rows"], c["perRow"], c["capacity"]) or c["bays"] > cap \
                or len(c["stalls"]) != c["bays"] or not close(c["area"], it["dx"] * it["dy"]):
            fail(f"(n) car park {c['item']}: published rows/perRow/capacity {c['rows']}/"
                 f"{c['perRow']}/{c['capacity']}, {len(c['stalls'])} bays drawn of {c['bays']},"
                 f" area {c['area']}; recomputed {rows}/{per}/{cap}, area {it['dx'] * it['dy']}")
        for x, y, ux, uy in c["stalls"]:
            if abs(x - it["x"]) > it["dx"] / 2 + 1e-9 or abs(y - it["y"]) > it["dy"] / 2 + 1e-9 \
                    or not close(hypot(ux, uy), 1.0):
                fail(f"(n) car park {c['item']}: a bay at ({x}, {y}) lies outside the footprint"
                     " or its exit direction is not a unit vector")
                break
        if not c["exitsForward"] or c["entry"] != "reverse":
            fail(f"(n) the witness's car park must let a car leave nose first (reverse-in)")
    # ---- the witness raises no C96 finding --------------------------------
    c96 = {"routeReverses", "turningAreaTooSmall", "sharpCorner", "cornersTooClose", "wrongWay",
           "routeMissesWeighbridge", "routeMissesStop", "routeNoGate", "exposedInZone",
           "exposedDownwind", "carParkReverseExit", "singleEntrance", "turningAreaOffRoad"}
    bad = [f["id"] for f in lay["findings"] if f["kind"] in c96]
    if bad:
        fail(f"(n) the witness raises {bad}; it must raise no site-logistics finding")
    # ---- published <=> pinned ---------------------------------------------
    gold = {}
    for line in (WITNESS / "expected").read_text().splitlines():
        f = line.split()
        if len(f) >= 5 and f[0] == "layout" and (f[1] == "designVehicle" or (
                ":" in f[1] and f[1].split(":")[0] in (
                    "truckRoute", "routeCorner", "carPark", "turningArea"))):
            gold[(f[1], f[2])] = f[3]
    published = {("designVehicle", "turningDiameter"): lay["designVehicle"]["turningDiameter"]}
    for t in lay["truckRoutes"]:
        published[("truckRoute:" + t["route"], "length")] = t["length"]
        published[("truckRoute:" + t["route"], "verdict")] = t["verdict"]
        published[("truckRoute:" + t["route"], "from")] = t["from"]
        published[("truckRoute:" + t["route"], "to")] = t["to"]
    for k, c in enumerate(pub_c):
        for q in ("x", "y", "radius", "turn"):
            published[(f"routeCorner:{T['route']}:{k}", q)] = c[q]
    for c in lay["carParks"]:
        for q in ("bays", "capacity", "area"):
            published[("carPark:" + c["item"], q)] = c[q]
    for key, val in published.items():
        g = gold.get(key)
        if g is None:
            fail(f"(n) {key[0]} {key[1]} is published and pinned by no golden row")
        elif isinstance(val, str):
            if g != val:
                fail(f"(n) {key[0]} {key[1]} `{val}` against the golden `{g}`")
        elif not close(float(g), val, 1e-4):
            fail(f"(n) {key[0]} {key[1]} {val} against the golden {g}")
    for key in gold:
        if key not in published:
            fail(f"(n) a golden row pins {key[0]} {key[1]}, which the run no longer publishes")

    # ---- announcements, each with its value recomputed where it has one ----
    n_ann = 0

    def probe(label, edit, want_ids, check=None):
        nonlocal n_ann
        dd = prepare(work, "site_" + re.sub(r"\W", "_", label), WITNESS, edit)
        o2, e2, r2, j2, l2 = layout_of(dd)
        got = {x["id"]: x for x in l2.get("findings", [])}
        miss = [w for w in want_ids if w not in got]
        if r2 != 0 or miss:
            fail(f"(n) {label}: exit {r2}, missing {miss}; findings {sorted(got)}")
            return
        for w in want_ids:
            if not said_everywhere(got[w]["message"], o2, e2, j2):
                fail(f"(n) {label}: {w} did not reach stderr, the caveat block and the"
                     " advisories")
                return
        if check and not check(l2, got):
            return
        n_ann += 1

    def sharp_check(l2, got):
        for w in ("sharpCorner:deliveries:0", "sharpCorner:deliveries:1"):
            if not close(got[w]["value"], 5 + 3) or not close(got[w]["limit"], 12.5):
                fail(f"(n) sharp corner: {w} {got[w]['value']} / {got[w]['limit']},"
                     " recomputed 8 / 12.5 (radius 5 + half the 6 m main road)")
                return False
        t = l2["truckRoutes"][0]
        if t["verdict"] != "announced":
            fail(f"(n) sharp corner: the route's verdict is `{t['verdict']}`, not announced")
            return False
        return True
    probe("a sharp corner",
          sub("            cornerRadius 10 m;\n            reason       \"south of the compressor",
              "            cornerRadius 5 m;\n            reason       \"south of the compressor"),
          ["sharpCorner:deliveries:0", "sharpCorner:deliveries:1"], sharp_check)

    def close_check(l2, got):
        f = got["cornersTooClose:deliveries:1"]
        if not close(f["value"], 21) or not close(f["limit"], 24):
            fail(f"(n) corners too close: {f['value']} / {f['limit']}, recomputed 21 / 24")
            return False
        return True
    probe("two corners too close",
          chain(sub("            cornerRadius 10 m;\n            reason       \"south of the compressor",
                    "            cornerRadius 12 m;\n            reason       \"south of the compressor"),
                sub("            cornerRadius 10 m;\n            oneWay       yes;\n"
                    "            reason       \"the truck yard",
                    "            cornerRadius 12 m;\n            oneWay       yes;\n"
                    "            reason       \"the truck yard"),
                sub("            cornerRadius 10 m;\n            oneWay       yes;\n"
                    "            reason       \"from the main road",
                    "            cornerRadius 12 m;\n            oneWay       yes;\n"
                    "            reason       \"from the main road")),
          ["cornersTooClose:deliveries:1"], close_check)
    probe("a one-way road driven backwards",
          sub("waypoints    ( { x 60 m; y -52 m; } { x -12 m; y -52 m; } );",
              "waypoints    ( { x -12 m; y -52 m; } { x 60 m; y -52 m; } );"),
          ["wrongWay:deliveries:yard"])
    probe("a route that turns back with no turning area",
          _add_route(_route_block("bad", "entrance main entrance")),
          ["routeReverses:bad:0", "routeMissesWeighbridge:bad:"])

    def dead_end_ok(l2, got):
        t = next(x for x in l2["truckRoutes"] if x["route"] == "tankers")
        rev = [c for c in l2["routeCorners"] if c["route"] == "tankers" and c["turn"] == "reverse"]
        if t["verdict"] != "clear" or len(rev) != 1 or rev[0]["turningArea"] != "tankFarmEnd" \
                or not close(rev[0]["x"], 160) or t["reversals"] != 1:
            fail(f"(n) a dead end with a 26 m turning area: verdict {t['verdict']},"
                 f" reversals {rev}; it must turn in `tankFarmEnd` and stay clear")
            return False
        pts, _, length = walk_route(l2, t)
        if not close(length, t["length"]):
            fail(f"(n) the dead-end route: published {t['length']} m, walked {length} m")
            return False
        return True
    probe("a dead end with a turning area big enough", _tank_farm_dead_end(26), [], dead_end_ok)

    def small_check(l2, got):
        f = got["turningAreaTooSmall:tankers:1"]
        if not close(f["value"], 16) or not close(f["limit"], 25):
            fail(f"(n) a small turning area: {f['value']} / {f['limit']}, declared 16 / 25")
            return False
        return True
    probe("a turning area smaller than the truck turns", _tank_farm_dead_end(16),
          ["turningAreaTooSmall:tankers:1"], small_check)
    probe("a weighbridge off the route",
          chain(sub('        nonProcess  "weighbridge";\n        kind        weighbridge;\n'
                    '        x           9 m;',
                    '        nonProcess  "weighbridge";\n        kind        weighbridge;\n'
                    '        x           -27 m;')),
          ["routeMissesWeighbridge:deliveries:"])
    probe("a stop the route does not pass",
          sub("serves ( warehouse laydown );", "serves ( warehouse laydown controlRoom );"),
          ["routeMissesStop:deliveries:controlRoom"])
    probe("a route that ends at a building",
          chain(sub("            to     gate;", "            to     warehouse;"),
                sub("roads  ( entrance main yardLink yard entrance );",
                    "roads  ( entrance main yardLink yard );")),
          ["routeNoGate:deliveries:warehouse"])

    def downwind_check(l2, got):
        it = {i["id"]: i for i in l2["items"]}
        w = l2["wind"]
        for rel in ("separator", "letdown"):
            f = got[f"exposedDownwind:musterNorth:{rel}"]
            mine = hypot(it["musterNorth"]["x"] - it[rel]["x"], it["musterNorth"]["y"] - it[rel]["y"])
            if not close(f["value"], mine, 1e-6) or f["limit"] != w["reach"]:
                fail(f"(n) downwind muster point: {f['id']} {f['value']} m, recomputed {mine} m")
                return False
        return True
    probe("a muster point downwind of the separator",
          sub('        nonProcess  "musterNorth";\n        kind        musterPoint;\n'
              '        x           -20 m;\n        y           12 m;',
              '        nonProcess  "musterNorth";\n        kind        musterPoint;\n'
              '        x           80 m;\n        y           10 m;'),
          ["exposedDownwind:musterNorth:separator", "exposedDownwind:musterNorth:letdown"],
          downwind_check)

    def zone_check(l2, got):
        f = got["exposedInZone:firePumps:makeupComp#zone2"]
        it = {i["id"]: i for i in l2["items"]}
        mine = point_to_box(it["makeupComp"]["x"], it["makeupComp"]["y"], it["firePumps"])
        if not close(f["value"], mine, 1e-6) or f["limit"] != 7.5:
            fail(f"(n) fire pumps in a zone: {f['value']} / {f['limit']}, recomputed {mine} / 7.5")
            return False
        return True
    probe("the fire pumps in a release's zone",
          sub('        nonProcess  "firePumps";\n        kind        firePumpHouse;\n'
              '        x           -32 m;\n        y           -16 m;',
              '        nonProcess  "firePumps";\n        kind        firePumpHouse;\n'
              '        x           6 m;\n        y           -16 m;'),
          ["exposedInZone:firePumps:makeupComp#zone2"], zone_check)
    probe("a site with one entrance",
          sub('        nonProcess  "emergencyGate";\n        kind        gate;',
              '        nonProcess  "emergencyGate";\n        kind        kiosk;'),
          ["singleEntrance:gate:"])
    probe("bays a car leaves by reversing",
          sub("            entry       reverse;", "            entry       forward;"),
          ["carParkReverseExit:carPark:"])
    # ---- refusals ----------------------------------------------------------
    n_ref = 0
    for label, (edit, pats) in SITE_REFUSALS.items():
        dd = prepare(work, "site_refuse_" + re.sub(r"\W", "_", label), WITNESS, edit)
        o2, e2, r2 = solve(dd)
        if r2 != 2 or not all(re.search(pt, o2 + e2, re.S) for pt in pats):
            fail(f"(n) refusal `{label}`: exit {r2}, expected 2 naming {pats}:\n    "
                 + "\n    ".join(l for l in (o2 + e2).splitlines() if "ERROR" in l)[:500])
        else:
            n_ref += 1
    claims.append(f"the witness's truck route `{T['route']}` walked again here ({length:.1f} m,"
                  f" {len(corners)} corners each with its declared radius, outer edge at least"
                  f" {need} m, no reversal, over `{T['weighbridge']}`, past"
                  f" {', '.join(T['serves'])}, gate to gate: CLEAR) and its car park laid out"
                  f" again ({lay['carParks'][0]['capacity']} bays), every C96 number pinned;"
                  f" {n_ann} site-logistics announcement fixtures (a sharp corner, two corners"
                  " too close, a one-way road driven backwards, a reversal with no turning area,"
                  " a dead end turned in a turning area big enough and one too small, a"
                  " weighbridge and a stop the route misses, a route ending at a building, a"
                  " muster point downwind, the fire pumps in a zone, one entrance, bays left by"
                  f" reversing); {n_ref} refusals")


INDOOR_SEEN = []


def indoor_units(lay):
    """The flowsheet units whose placed item stands in a room (DEV.md 4c
    C100): an item's unit is its id up to the `/` of a tag."""
    return {i["id"].split("/")[0] for i in lay["items"] if i.get("room")}


def check_indoor(tag, j, lay):
    """Arm (o) on one plant, from the published block alone: no pipe reaches
    an item indoors at its nozzle (an end at an indoor unit is a
    `wallPenetration` on a building's wall); every stream listed `indoor`
    has an end at an indoor unit or at a junction off the rack; an anchor
    marks only an end in the open; no separation finding and no access
    record names an item indoors."""
    ins = indoor_units(lay)
    if not ins:
        return
    rooms = {i["id"] for i in lay["items"] if i.get("room")}
    jr = {jn["unit"] for jn in lay.get("junctions", [])}
    for p in lay.get("pipes", []):
        for kind, at, unit in ((p["fromKind"], p["from"], p.get("fromUnit")),
                               (p["toKind"], p["to"], p.get("toUnit"))):
            if kind == "item" and at in rooms:
                fail(f"(o) {tag} pipe {p['stream']} is drawn to the nozzle of `{at}`,"
                     " which stands indoors")
            if unit in ins and kind != "wallPenetration":
                fail(f"(o) {tag} pipe {p['stream']}: its end at `{unit}` (indoors) is a"
                     f" `{kind}`, not the wall penetration")
    for n in lay.get("notRouted", []):
        if not n.get("indoor"):
            continue
        ends = [n.get("fromUnit", "")] + n.get("toUnit", "").split(", ")
        if not any(u in ins or (u and u not in jr and u not in
                   {i["id"].split("/")[0] for i in lay["items"]}) for u in ends):
            fail(f"(o) {tag} {n['stream']} is listed `indoor` with no end indoors: {ends}")
        a = n.get("anchor")
        if a:
            inside = [i for i in lay["items"] if i.get("room")
                      and abs(i["x"] - a[0]) < TOL and abs(i["y"] - a[1]) < TOL]
            if inside:
                fail(f"(o) {tag} {n['stream']}: its anchor {a} marks an item indoors"
                     f" ({inside[0]['id']}); an anchor marks the end in the open")
    for f in lay.get("findings", []):
        if f["kind"] == "separation" and (f["a"] in rooms or f["b"] in rooms):
            fail(f"(o) {tag}: a separation finding names an item indoors: {f['id']}")
    for a in lay.get("access", []):
        if a["item"] in rooms:
            fail(f"(o) {tag}: an access record for `{a['item']}`, which stands indoors")
    INDOOR_SEEN.append(f"{tag} ({len(rooms)} item(s) indoors)")


INDOOR_REFUSALS = [
    ("a wall penetration off the wall", "must lie ON the wall",
     lambda t: sub_text(t, "{ x -8 m;   y -7 m;  z 4.5 m; } );    // the wall penetration",
                        "{ x -7 m;   y -7 m;  z 4.5 m; } );    // off the wall")),
    ("an override on a stream both of whose ends stand indoors",
     "indoor piping is not routed -- remove the override",
     lambda t: sub_text(t, "\npipes\n{\n",
                        "\npipes\n{\n    sprayFeed { waypoints ( { x -14 m; y -11 m; z 6 m; } ); }\n")),
]


def sub_text(text, old, new):
    if text.count(old) != 1:
        raise RuntimeError(f"probe edit anchor not found once: {old!r}")
    return text.replace(old, new, 1)


def arm_indoor(work):
    """(o) ITEMS INSIDE THE BUILDING (DEV.md 4c C100), on apalutamide01."""
    d = prepare(work, "indoor", APALUTAMIDE)
    out, err, rc = solve(d)
    j = result_json(out)
    lay = (j or {}).get("layout") or {}
    if rc != 0 or not lay:
        fail(f"(o) the apalutamide plant exited {rc}")
        return
    check_indoor("apalutamide01", j, lay)
    #  Between two ends indoors -- an item and an item, an item and a
    #  junction that stands indoors with it, two such junctions -- the
    #  reason is indoor piping, never an end the layout could not reach.
    nr0 = {n["stream"]: n for n in lay.get("notRouted", [])}
    for s_ in ("sprayFeed", "loopGas", "gasRecycle", "exhaustGas", "coatingSuspension"):
        n = nr0.get(s_)
        if not n or not n.get("indoor") or n.get("anchor") \
                or not n["reason"].startswith("inside the building: indoor piping is not routed"):
            fail(f"(o) {s_} runs between two ends indoors: it must be listed `indoor`,"
                 f" unmarked, as indoor piping; published {n}")
    pipes = {p["stream"]: p for p in lay.get("pipes", [])}
    legs = [s_ for s_, p in pipes.items() if "wallPenetration" in (p["fromKind"], p["toKind"])]
    if sorted(legs) != ["acetoneToPrep", "recoveredSolvent"]:
        fail(f"(o) the plant's declared outdoor legs: {sorted(legs)}; the two solvent"
             " lines through the east wall")
    #  Without its declared legs: both listed `indoor`, each marked at its tank.
    d2 = prepare(work, "indoor_nolegs", APALUTAMIDE, drop_block_edit("pipes"))
    out2, err2, rc2 = solve(d2)
    lay2 = ((result_json(out2) or {}).get("layout")) or {}
    nr = {n["stream"]: n for n in lay2.get("notRouted", [])}
    items = {i["id"]: i for i in lay2.get("items", [])}
    want = {"acetoneToPrep": "acetoneTank/tank1", "recoveredSolvent": "recoveredTank/tank1"}
    for s_, tank in want.items():
        n, t = nr.get(s_), items.get(tank)
        if rc2 != 0 or not n or not n.get("indoor") or not t or not n.get("anchor") \
                or any(abs(a - b) > TOL for a, b in zip(n["anchor"], (t["x"], t["y"], t["z"] + t["dz"]))):
            fail(f"(o) with no declared legs, {s_} must be listed `indoor` and marked at"
                 f" the top of {tank}; published {n}")
    n_ref = 0
    lay_text = (APALUTAMIDE / "system" / "layoutDict").read_text()
    for k, (label, needle, edit) in enumerate(INDOOR_REFUSALS):
        d3 = prepare(work, f"indoor_ref{k}", APALUTAMIDE, lambda _t, e=edit: e(lay_text))
        o3, e3, rc3 = solve(d3)
        if rc3 == 0:
            fail(f"(o) {label}: the run was NOT refused")
        elif needle not in o3 + e3:
            fail(f"(o) {label}: refused without naming it ('{needle}'): {e3.strip()[-300:]}")
        else:
            n_ref += 1
    if INDOOR_SEEN and n_ref == len(INDOOR_REFUSALS):
        claims.append(f"(o) items inside the building ({', '.join(INDOOR_SEEN)}): no pipe"
                      " drawn to an indoor nozzle, every end at an indoor unit a"
                      " `wallPenetration` on a building's wall, every `indoor` listing"
                      " with an end indoors and an anchor only in the open, no"
                      " separation finding or access record on an item indoors, the"
                      " footprints counting it in its building; without the declared"
                      " legs the two solvent lines are listed `indoor` and marked at"
                      f" their tanks; {n_ref}/{len(INDOOR_REFUSALS)} refusals: a"
                      " penetration off the wall, an override on indoor piping")


# ------------------------------------------------------- containment (C134) --
GREEN = ROOT / "tutorials/plant/greenAmmoniaPEQ_baseCase"


def shoelace_area(pts):
    a = 0.0
    for k, p in enumerate(pts):
        q = pts[(k + 1) % len(pts)]
        a += p[0] * q[1] - q[0] * p[1]
    return abs(a) / 2.0


def displaced_below(i, h):
    """The volume an item's footprint occupies between grade and h, by the
    stated rule: a vertical cylinder's disc, a lying cylinder's circular
    segment, any other item's rectangle -- an independent implementation."""
    lo, hi = max(0.0, i["z"]), min(h, i["z"] + i["dz"])
    if hi <= lo:
        return 0.0
    if i["shape"] == "cylinder" and i["orientation"] == "vertical":
        return pi * i["dx"] ** 2 / 4.0 * (hi - lo)
    if i["shape"] == "cylinder":
        D = i["dz"]
        R = D / 2.0
        L = i["dx"] if i["orientation"] == "alongX" else i["dy"]

        def seg(t):
            from math import acos, sqrt
            t = max(0.0, min(D, t))
            return R * R * acos((R - t) / R) - (R - t) * sqrt(max(0.0, 2 * R * t - t * t))
        return L * (seg(hi - i["z"]) - seg(lo - i["z"]))
    return i["dx"] * i["dy"] * (hi - lo)


def sheet_rel(lay, item):
    """An item's design sheet: `<unit>/<tag>` where a unit realises several
    items, `<unit>/<its equipment word>` where it realises one."""
    if "/" in item:
        return item
    kind = next((i["kind"] for i in lay["items"] if i["id"] == item), "")
    return item + "/" + kind


def sheet_liquid(d, item):
    """The liquid an item holds, read off its design sheet as TEXT: the sum
    of the `volume` of every `liquid` phase in its `inventory` block -- an
    independent home for what `heldLiquid` counts."""
    p = d / "design" / item
    if not p.is_file():
        return 0.0
    t = p.read_text()
    if "\ninventory" not in t:
        return 0.0
    blk = t[t.index("\ninventory"):]
    total = 0.0
    for m in re.finditer(r"phase\s+liquid;(.*?)\}", blk, re.S):
        v = re.search(r"\bvolume\s+([-0-9.eE+]+)", m.group(1))
        if v:
            total += float(v.group(1))
    return total


def check_bund(tag, d, lay, b, case):
    """One published containment, recomputed here from the published items
    and outline and the design sheets."""
    items = {i["id"]: i for i in lay["items"]}
    area = shoelace_area(b["outline"])
    h = b["wallHeight"]
    if not close(area, b["area"]):
        fail(f"(p) {tag} {b['bund']}: area {b['area']} m2; the outline gives {area}")
    if b["containment"] == "bund":
        disp = sum(displaced_below(items[x], h) for x in b["items"])
        gross = area * h
    else:
        disp = 0.0
        gross = b["pitLength"] * b["pitWidth"] * b["pitDepth"]
    net = gross - disp
    if not close(disp, b["displacedVolume"], 1e-8) or not close(net, b["netVolume"], 1e-8):
        fail(f"(p) {tag} {b['bund']}: displaced/net {b['displacedVolume']}/{b['netVolume']}"
             f" m3; recomputed {disp}/{net}")
    held = []
    for x in b["items"]:
        liq = sheet_liquid(d, sheet_rel(lay, x))
        if liq <= 0:
            continue
        if b["basis"] == "vesselVolume":
            held.append(sheet_value(d, sheet_rel(lay, x), "V_R"))
        else:
            held.append(liq)
    if not held:
        fail(f"(p) {tag} {b['bund']}: no enclosed item holds liquid by its design sheet")
        return
    terms = [t[0] * (max(held) if t[1] == "largest" else sum(held)) for t in b["terms"]]
    pit_area = b["pitLength"] * b["pitWidth"] if "pitX" in b else 0.0
    allow = sum(a[3] if a[1] == "volume" else a[2] * (area + pit_area) for a in b["allowances"])
    for a in b["allowances"]:
        if a[1] == "depth" and not close(a[3], a[2] * (area + pit_area), 1e-8):
            fail(f"(p) {tag} {b['bund']}: allowance {a[0]} {a[3]} m3; {a[2]} m over"
                 f" {area + pit_area} m2 gives {a[2] * (area + pit_area)}")
    req = max(terms) + allow
    #  The V_R read off the sheet is printed to 8 significant figures.
    if not close(req, b["requiredVolume"], 1e-7):
        fail(f"(p) {tag} {b['bund']}: required {b['requiredVolume']} m3; recomputed {req}"
             f" (terms {terms}, allowances {allow})")
    verdict = "adequate" if net >= req * (1 - 1e-9) else "inadequate"
    if b["verdict"] != verdict:
        fail(f"(p) {tag} {b['bund']}: verdict {b['verdict']}; recomputed {verdict}")
    if case is None:          # a fixture: no golden of its own
        return net, req
    # published <=> pinned
    gold = {}
    for line in (case / "expected").read_text().splitlines():
        f = line.split()
        if len(f) >= 5 and f[0] == "layout" and f[1] == "bund:" + b["bund"]:
            gold[f[2]] = (f[3], f[4])
    for k in ("area", "wallHeight", "displacedVolume", "netVolume", "requiredVolume"):
        g = gold.get(k)
        if g is None:
            fail(f"(p) {tag}: bund:{b['bund']} {k} is published and pinned by no golden row")
        elif abs(float(g[0]) - b[k]) > float(g[1]) * max(abs(b[k]), 1e-30):
            fail(f"(p) {tag}: bund:{b['bund']} {k} {b[k]} against the golden {g[0]}")
    for k in ("containment", "verdict"):
        g = gold.get(k)
        if g is None or g[0] != b[k]:
            fail(f"(p) {tag}: bund:{b['bund']} {k} `{b[k]}` against the golden {g}")
    return net, req


def drop_bunds(text):
    """The layoutDict `text` without its top-level `bunds ( ... );` list."""
    m = re.search(r"^bunds\s*\n\(", text, re.M)
    if not m:
        return text + "\n#error the probe found no `bunds` list\n"
    depth, i = 0, m.end() - 1
    while i < len(text):
        depth += {"(": 1, ")": -1}.get(text[i], 0)
        i += 1
        if depth == 0:
            break
    if text[i:i + 1] == ";":
        i += 1
    return text[:m.start()] + text[i:]


def finding(lay, kind, a=None):
    return [f for f in lay.get("findings", []) if f["kind"] == kind
            and (a is None or f["a"] == a)]


BUND_REFUSALS = [
    #  (label, needle, edit on the green witness's layoutDict)
    ("a listed item outside the wall", "stands OUTSIDE its wall",
     sub('items       ( "NH3Storage/tank1" "NH3Storage/tank2" );',
         'items       ( "NH3Storage/tank1" "NH3Storage/tank2" "Separator" );')),
    ("an unlisted item inside the wall", "stands INSIDE its wall and is not in its `items`",
     sub('items       ( "NH3Storage/tank1" "NH3Storage/tank2" );', 'items       ( "NH3Storage/tank1" );')),
    ("a wall through a footprint", "its wall runs THROUGH the footprint of `NH3Storage/tank2`",
     sub("xMax 213 m;", "xMax 190 m;")),
    ("no capacity rule", "`capacityRule { basis vesselVolume|heldLiquid;",
     lambda t: re.sub(r"\n        capacityRule\n        \{.*?\n        \}\n", "\n", t,
                      count=1, flags=re.S)),
    ("an unknown containment kind", "containment kind",
     sub("kind        bund;", "kind        dike;")),
    ("a bund with a pit", "a `pit` is an impounding area's",
     sub("drain       closedValve;",
         "drain       closedValve; pit { x 160 m; y -90 m; length 5 m; width 5 m; depth 2 m; }")),
    ("a basis no rule knows", "unknown basis 'tankVolume'",
     sub("basis   vesselVolume;", "basis   tankVolume;")),
    ("an impounding area with no pit", "an impounding area leads the spill to a REMOTE pit",
     sub("        pit         { x 70 m; y 24 m; length 4 m; width 3 m; depth 1.5 m; }\n", "")),
    ("a pit under an item", "lies under `Chiller`",
     sub("pit         { x 70 m; y 24 m;", "pit         { x 62 m; y 5 m;")),
    ("an item in two containments", "which bund `tankFarm` already holds",
     sub('items       ( "Separator" "LetdownHP" "StorageFlash" );',
         'items       ( "Separator" "LetdownHP" "StorageFlash" "NH3Storage/tank1" );')),
    ("two containments sharing a floor", "claim the same ground",
     sub("region      { xMin 103 m; xMax 213 m; yMin -69 m; yMax -1 m; }",
         "region      { xMin 80 m; xMax 213 m; yMin -69 m; yMax 12 m; }")),
]


def arm_bunds(work):
    """(p) SECONDARY CONTAINMENT (DEV.md 4c C134)."""
    n_checked = []
    # ---- the two witnesses, recomputed ----------------------------------
    for tag, case, kinds in (("greenAmmoniaPEQ", GREEN, {"bund", "impounding"}),
                             ("ammonia02", WITNESS, {"impounding"})):
        d = prepare(work, "bund_" + tag, case)
        out, err, rc, j, lay = layout_of(d)
        bs = lay.get("bunds") or []
        if rc != 0 or not bs:
            fail(f"(p) {tag} exited {rc} / published no `bunds`")
            continue
        if {b["containment"] for b in bs} != kinds:
            fail(f"(p) {tag}: containments {[(b['bund'], b['containment']) for b in bs]};"
                 f" the witness declares {sorted(kinds)}")
        for b in bs:
            r = check_bund(tag, d, lay, b, case)
            if r:
                n_checked.append(f"{tag} {b['bund']} {r[0]:.0f}/{r[1]:.0f} m3")
            if b["verdict"] != "adequate":
                fail(f"(p) {tag}: the witness's {b['bund']} must hold its own rule")
        if finding(lay, "unbundedLiquid"):
            fail(f"(p) {tag}: the witness leaves liquid unbunded:"
                 f" {[f['a'] for f in finding(lay, 'unbundedLiquid')]}")
        for b in [x for x in bs if "pitX" in x]:
            # the pit is REMOTE: outside the catch area
            xs = [q[0] for q in b["outline"]]
            ys = [q[1] for q in b["outline"]]
            inside = (min(xs) < b["pitX"] < max(xs) and min(ys) < b["pitY"] < max(ys))
            if inside or finding(lay, "pitNotRemote"):
                fail(f"(p) {tag}: the pit of {b['bund']} must stand outside its catch area")
    # ---- unbunded liquid: the green witness with no bunds ---------------
    d = prepare(work, "bund_none", GREEN, drop_bunds)
    out, err, rc, j, lay = layout_of(d)
    tanks = [i["id"] for i in lay.get("items", [])
             if sheet_liquid(d, sheet_rel(lay, i["id"])) > 0]
    if rc != 0 or "bunds" in lay or "bundRule" in lay or len(tanks) != 5:
        fail(f"(p) the green witness without bunds: exit {rc}, `bunds` published"
             f" {'bunds' in lay}, liquid holders by their sheets {tanks} (the two tanks"
             " and the loop's three vessels)")
    for t in tanks:
        f = finding(lay, "unbundedLiquid", t)
        liq = sheet_liquid(d, sheet_rel(lay, t))
        if not f or not close(f[0]["value"], liq, 1e-7) \
                or not said_everywhere(f[0]["message"], out, err, j):
            fail(f"(p) without bunds, {t} (holding {liq} m3 by its sheet) must be announced"
                 f" `unbundedLiquid` on stderr, the caveat block and the advisories: {f}")
    if any(f["a"] not in tanks for f in finding(lay, "unbundedLiquid")):
        fail(f"(p) an item holding no liquid by its sheet was announced unbunded:"
             f" {[f['a'] for f in finding(lay, 'unbundedLiquid')]}")
    # ---- a bund too small for its rule: announced, never refused --------
    d = prepare(work, "bund_small", GREEN, sub("wall        { height 4 m; }",
                                                "wall        { height 2 m; }"))
    out, err, rc, j, lay = layout_of(d)
    bs = lay.get("bunds") or []
    f = finding(lay, "bundCapacity")
    if rc != 0 or not bs or bs[0]["verdict"] != "inadequate" or not f \
            or not close(f[0]["value"], bs[0]["netVolume"]) \
            or not close(f[0]["limit"], bs[0]["requiredVolume"]) \
            or not said_everywhere(f[0]["message"], out, err, j):
        fail(f"(p) a 2 m wall round the tanks must leave the bund SHORT, announced on the"
             f" three surfaces, the run going on: exit {rc}, {bs[:1]}, {f}")
    else:
        #  The shortfall's numbers are the rule's, recomputed (the verdict
        #  word must follow the arithmetic, not a flag).
        check_bund("green, 2 m wall", d, lay, bs[0], None)
    # ---- a POLYGON wall: an L-shaped bund round the same tanks ------------
    #  The witnesses declare rectangles; the outline's own corners must give
    #  the area (shoelace) and the containment test (inside, not across).
    d = prepare(work, "bund_polygon", GREEN, sub(
        "region      { xMin 103 m; xMax 213 m; yMin -69 m; yMax -1 m; }",
        "polygon     ( { x 103 m; y -69 m; } { x 213 m; y -69 m; } { x 213 m; y -1 m; }"
        " { x 160 m; y -1 m; } { x 160 m; y -10 m; } { x 103 m; y -10 m; } );"))
    out, err, rc, j, lay = layout_of(d)
    bs = lay.get("bunds") or []
    if rc != 0 or not bs or bs[0]["regionFrom"] != "polygon" \
            or not close(bs[0]["area"], 110 * 68 - 57 * 9):
        fail(f"(p) an L-shaped polygon bund: exit {rc}, {bs[:1]}; its area is"
             f" {110 * 68 - 57 * 9} m2")
    else:
        check_bund("green, L-shaped wall", d, lay, bs[0], None)
    d = prepare(work, "bund_bowtie", GREEN, sub(
        "region      { xMin 103 m; xMax 213 m; yMin -69 m; yMax -1 m; }",
        "polygon     ( { x 103 m; y -69 m; } { x 213 m; y -1 m; } { x 213 m; y -69 m; }"
        " { x 103 m; y -1 m; } );"))
    o, e, rc = solve(d)
    if rc != 2 or "a wall's outline must not cross itself" not in o + e:
        fail(f"(p) a bow-tie polygon must be refused as crossing itself: exit {rc}")
    # ---- a bund round LYING cylinders: the circular segment ---------------
    #  The witness's bullets (D 5.27 m, lying along y) in a 2 m bund: each
    #  displaces the segment of its circle below 2 m times its length -- the
    #  one shape the green witness's boxes cannot reach.
    d = prepare(work, "bund_lying", WITNESS, chain(
        sub("kind        impounding;", "kind        bund;"),
        sub("        pit         { x 108 m; y -77 m; length 24 m; width 9 m; depth 3.5 m; }\n", ""),
        sub("wall        { height 0.3 m; }", "wall        { height 2 m; }")))
    out, err, rc, j, lay = layout_of(d)
    bs = lay.get("bunds") or []
    if rc != 0 or not bs or bs[0]["containment"] != "bund" \
            or not bs[0]["displacedVolume"] > 0:
        fail(f"(p) the bullets in a 2 m bund: exit {rc}, {bs[:1]}")
    else:
        check_bund("ammonia02 as a 2 m bund", d, lay, bs[0], None)
        box = sum(i["dx"] * i["dy"] * 2.0 for i in lay["items"] if i["id"] in bs[0]["items"])
        if not bs[0]["displacedVolume"] < 0.9 * box:
            fail(f"(p) lying bullets displaced {bs[0]['displacedVolume']} m3 below 2 m; their"
                 f" bounding boxes would give {box} -- the segment is not being taken")
    # ---- the open drain, the pit inside its catch area, a road and a pipe
    #      through a wall: announced ----------------------------------------
    d = prepare(work, "bund_drain", GREEN, sub("drain       closedValve;",
                                                "drain       openToSewer;"))
    out, err, rc, j, lay = layout_of(d)
    if rc != 0 or not finding(lay, "bundDrainOpen"):
        fail(f"(p) a drain open to the sewer must be announced: exit {rc}")
    d = prepare(work, "bund_pit", WITNESS, sub(
        "pit         { x 108 m; y -77 m; length 24 m; width 9 m;",
        "pit         { x 103 m; y -45 m; length 3 m; width 3 m;"))
    out, err, rc, j, lay = layout_of(d)
    if rc != 0 or not finding(lay, "pitNotRemote"):
        fail(f"(p) a pit inside its own catch area must be announced `pitNotRemote`: exit {rc}")
    d = prepare(work, "bund_road", WITNESS, sub("yMax -36 m;", "yMax -30 m;"))
    out, err, rc, j, lay = layout_of(d)
    if rc != 0 or not finding(lay, "roadCrossesBund", "tankFarm"):
        fail(f"(p) a road through the catch area's kerb must be announced"
             f" `roadCrossesBund`: exit {rc}; {[x['kind'] for x in lay.get('findings', [])]}")
    #  The let-down liquid to the first bullet, declared to run at 0.1 m into
    #  the farm: it crosses the catch area's west kerb (x = 73 m) BELOW its
    #  0.3 m top.  Every point inside the published plot, so nothing else moves.
    d = prepare(work, "bund_pipe", WITNESS, lambda t: t + (
        "\npipes { productNH3 { waypoints ( { x 59.5 m; y -6 m; z 9 m; }"
        " { x 70 m; y -6 m; z 9 m; } { x 70 m; y -60 m; z 9 m; }"
        " { x 70 m; y -60 m; z 0.1 m; } { x 78 m; y -60 m; z 0.1 m; }"
        " { x 78 m; y -54 m; z 0.1 m; } ); } }\n"))
    out, err, rc, j, lay = layout_of(d)
    if rc != 0 or not finding(lay, "pipeThroughBund", "productNH3"):
        fail(f"(p) a pipe below the kerb's top through it must be announced"
             f" `pipeThroughBund`: exit {rc}; {err.strip()[-300:]}")
    # ---- refusals ----------------------------------------------------------
    n_ref = 0
    text = (GREEN / "system" / "layoutDict").read_text()
    for k, (label, needle, edit) in enumerate(BUND_REFUSALS):
        d = prepare(work, f"bund_ref{k}", GREEN, lambda _t, e=edit: e(text))
        o, e, rc = solve(d)
        if rc != 2:
            fail(f"(p) {label}: exit {rc}, not refused")
        elif needle not in o + e:
            fail(f"(p) {label}: refused without naming it ('{needle}'): {e.strip()[-300:]}")
        else:
            n_ref += 1
    if len(n_checked) >= 2 and n_ref == len(BUND_REFUSALS):
        claims.append("(p) secondary containment: on both witnesses (" + "; ".join(n_checked)
                      + " net/required) the area, the displaced and net volumes, the"
                      " required volume (terms on the basis read off the DESIGN SHEETS,"
                      " allowances) and the verdict recomputed here, every published"
                      " number pinned; the impounding pit remote; without bunds every"
                      " liquid store announced unbunded on the three surfaces with its"
                      " sheet's volume, nothing else; a 2 m wall SHORT and announced, its numbers recomputed; the bullets in a 2 m bund displacing their circular segments; an L-shaped polygon wall recomputed, a bow-tie refused; an"
                      " open drain, a pit in its catch area, a road and a low pipe through"
                      " a wall announced; " + str(n_ref) + " refusals named")


def main():
    argv = sys.argv[1:]
    keep = Path(argv[argv.index("--keep") + 1]).resolve() if "--keep" in argv else None
    if not BIN.exists():
        print("check_plant_layout: FAIL -- no choupoSolve build; run `make all`")
        return 1
    work = keep or Path(tempfile.mkdtemp(prefix="plantlayout."))
    work.mkdir(parents=True, exist_ok=True)
    try:
        arm_witness(work)
        arm_refusals(work)
        arm_hazards(work)
        arm_draft(work)
        arm_absent(work)
        arm_refused_sizer(work)
        arm_pipes(work)
        arm_pipe_override(work)
        arm_plot(work)
        arm_roads(work)
        arm_fence(work)
        arm_clash(work)
        arm_site(work)
        arm_indoor(work)
        arm_bunds(work)
    finally:
        if not keep:
            shutil.rmtree(work, ignore_errors=True)
    if fails:
        print("check_plant_layout: FAIL")
        for f in fails:
            print("  - " + f)
        return 1
    print("check_plant_layout: OK -- " + "; ".join(claims)
          + ".  NOT COVERED: whether a declared distance or zone is sensible"
          " (the author's assumption -- no standard is shipped), a pipe's"
          " pressure drop and cost (none is computed), a pipe clashing with"
          " another pipe or a road's paved surface, structures, a road's gradient, a"
          " truck's swept path (each corner's outer edge only), whether a declared headroom or access distance is sensible,"
          " a containment's floor slope, wall strength and pool evaporation, whether a declared capacity rule is the right one,"
          " the GUI drawing (its scene"
          " mapping is a vitest), and"
          " byte-identity of cases without a layout (measured once, not gated).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
