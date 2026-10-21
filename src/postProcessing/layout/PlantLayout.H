/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
-------------------------------------------------------------------------------
Namespace
    Choupo::plantLayout

Description
    THE PLANT LAYOUT A STUDENT DECLARES AND THE ENGINE CHECKS (2026-10-17,
    DEV.md 4c C75).  `system/layoutDict` places every SIZED item of the run on
    a plot plan -- (x, y) of its plan centre, the elevation z of its base, its
    orientation -- and may declare sector AREAS, SEPARATION tables between
    equipment kinds, a PREVAILING WIND, and per item whether it is a RELEASE
    source (with hazardous-area zones) or an IGNITION source.  Nothing here
    is a shipped number: every distance, zone extent and angle is the
    CASE'S declaration, with its own `source` and `reason`.  The usual
    spacing and zoning tables (CCPS, GAP 2.5.2, Mecklenburgh, IEC 60079-10-1,
    EI 15, API RP 505) grant no redistribution, so none is transcribed
    (CLAUDE.md §10 licence policy).

    THE FOOTPRINT IS THE ITEM'S OWN.  Where the sizer published a diameter
    and a length -- (`D`, `H`), (`shellID`, `tubeLength`) or
    (`chamberDiameter`, `chamberHeight`) -- the item is a CYLINDER of that
    diameter and that length, along the declared axis.  Where it published
    no such pair (a compressor's power, an evaporator's area, a rated
    exchanger's area) no size is invented: the case DECLARES a box
    `footprint { length; width; height; }`, and a declared footprint on an
    item that publishes its own is REFUSED (two homes for one size).

    WHAT IS NEVER PLACED ON ITS OWN.  A tray stack, a catalyst charge and a
    relief valve live inside or on another item, and a member listed in a
    converter shell's `encloses` is a basket inside that shell; naming one
    is REFUSED, naming its host.

    WHAT IS REFUSED (the run stops, exit 2): an entry naming no sized item
    (and no item of a sizing entry whose sizer refused -- such an item is
    ANNOUNCED as `sizingRefused` and left unplaced, C79: a refused sizer is
    already its own reported failure, and a plot plan must not turn one
    missing sheet into a missing run), an item placed twice, two footprints that overlap in plan AND in height,
    an area for a sector the case does not have, and every malformed
    declaration.  WHAT IS ANNOUNCED (stderr + AdvisoryLog, so it reaches the
    caveat block and the result JSON): every pair closer than its declared
    separation, an item outside its sector's area, an ignition source inside
    a declared zone envelope or downwind of a release source, a separation
    rule that names a kind no placed item carries, and the sized items left
    unplaced.  The asymmetry is deliberate: an overlap is not a layout at
    all, while a short distance IS a layout -- a draft whose shortfall the
    student must see and defend.

    ITEMS INSIDE THE BUILDING (2026-10-19, DEV.md 4c C100).  An item a room
    of the declared `building {}` lists in its `equipment ( ... )` stands
    INSIDE that room (BuildingLayout.H): its base `z` is the room's floor
    elevation, read from the building (`buildingLayout::indoorPlaces`, one
    home) -- a `z` declared on it is REFUSED -- and the building checks that
    it fits its room in plan and in height.  The building's shell (its
    `envelope`) does not clash with the items its rooms list, and still
    clashes with anything else: an item overlapping the shell that no room
    lists is REFUSED, naming the room it needs.  Indoors the ROOM is
    classified, not the item: a `release` or an `ignition` declared on an
    indoor item is REFUSED, naming the room's `atex {}` and `ignition`.  On
    the site an indoor item is represented by its building: the separation
    table spaces items in the open (pairs with an indoor item are not
    checked; a rule whose kind only indoor items carry is a `deadRule` that
    says so), the road access is the building's, a pipe clash is the shell's,
    and its ground is the building's footprint, not counted again.  A
    junction piped only to indoor items stands indoors with them.  INDOOR
    PIPING IS NOT ROUTED: a stream both of whose ends stand indoors is listed
    not routed (`indoor`), and one with an end indoors and one in the open
    is routed only where the case DECLARES its outdoor leg as waypoints whose
    indoor-side end lies ON the shell's wall -- the WALL PENETRATION, that
    end's kind `wallPenetration`; with none declared it is listed not routed
    and marked at its outdoor end.

    THE PIPES (2026-10-17, DEV.md 4c C80).  After placement every MATERIAL
    stream of the flowsheet is either ROUTED or listed as not routed with
    its reason -- never dropped in silence.  Its two ends:
      * a PLACED ITEM -- the pipe meets it at its NOZZLE, the item's plan
        centre at its TOP (z + its height, standing or lying); a unit that
        realises several items is piped through the FIRST of them the case
        placed (the order of `items`), so a column's overhead loop and a
        second storage tank are not drawn;
      * a JUNCTION -- an UNSIZED mixer, splitter or valve, drawn as a node
        on the rack's centre line at its lowest tier, at the MEAN plan x of
        the placed items it is piped to (a junction piped only to other
        junctions takes their mean, in passes, in flowsheet order);
      * a BATTERY LIMIT -- a plant inlet arrives at the rack's west end
        (`xStart`), a plant outlet leaves at its east end (`xEnd`); with a
        declared fence, at its crossing ON the fence (THE FENCE, below).
    Any other end (an unsized unit that is not a junction, a sized unit
    whose items are not placed, a stream consumed by two units) leaves the
    stream NOT ROUTED, with that reason, the units at its two ends and the
    plan point of the end the layout DOES reach -- where a surface marks the
    missing pipe, so a plant with a pipe missing never looks finished.
    SOLIDS ARE NOT PIPED (2026-10-18, DEV.md 4c C97): a stream whose FLUID
    molar flow is zero and which carries a solid (`ProcessStream::F` is the
    fluid phases only, `ProcessStream::s` the solid -- a powder, granules,
    tablets) is moved in containers or by conveyor, not in a pipe, so it is
    listed as not routed with that reason and `solids` set, and no point is
    marked for it (nothing is missing); a mixer, splitter or valve ALL of
    whose streams are such is not a junction on the rack.  A slurry or a
    wet cake (a fluid phase beside the solid) is still a stream to route.
    THE ROUTE is deterministic and orthogonal: up (or down) from the source
    nozzle to its LANE, across to the lane, along the rack (plan x), across
    to the target, down to its nozzle.  The rack runs along plan x; the
    case declares it (`pipeRack { y; elevation; laneSpacing; lanesPerTier;
    tierSpacing; xStart; xEnd; reason; }`, every key) or the engine uses a
    STATED DEFAULT and ANNOUNCES it once.  LANES are handed out in the order
    the flowsheet first names the streams (each unit's inlets, then its
    outlets), `lanesPerTier` across the rack centred on its line, the tiers
    stacked `tierSpacing` upward.  A case may override one pipe's route with
    declared WAYPOINTS (`pipes { <stream> { waypoints ( { x; y; z; } ... );
    } }`): the route is then the source nozzle, the waypoints, the target
    nozzle (a battery limit adds no point), each segment REQUIRED to run
    along one axis.  The length published is the polyline's own.  NO
    pressure drop and NO cost: the next slice.  THE ROUTER DOES NOT STEER
    ROUND ITEMS, so once every route is final (the fence legs included) a
    segment whose plan path crosses a placed item's footprint (a vertical
    cylinder's disc, any other item's rectangle) strictly between its base
    and its top is ANNOUNCED as `pipeClash` (2026-10-18, DEV.md 4c C93),
    once per (pipe, item), the pipe's own end items excepted -- never
    refused: a clash is a draft to move, like a short distance.
    Structures, a pipe against another pipe, rotation other than the two
    plan axes, and any distance taken from a standard are NOT here.

    THE PLOT (2026-10-17, DEV.md 4c C82).  After the pipes, the ground the
    layout occupies is published by ONE rule (`plotOf`): the axis-aligned
    ENVELOPE of every declared sector area, every placed footprint (process
    and non-process) and every routed pipe's polyline, grown on every side
    by the case's `plot { margin <m>; reason "..."; }`.  Absent the block
    the margin is 0 m and that is ANNOUNCED: the area is then a lower bound,
    and no margin is invented.  An envelope, not a union, because a plot is
    one parcel of land bought whole; where sector areas are declared their
    UNION is published beside it, and two areas that claim the same ground
    are announced with the shared m2.  Also published: the plan area the
    footprints cover (a vertical cylinder's disc, any other item's
    rectangle; each item once, so `stackedPairs` counts the pairs that stand
    one above another) and, per sector, the declared area or else the
    envelope of the sector's own footprints.  The economics prices this
    plot area when the case declares a land price (EconomicsPass.cpp).
    A declared `building {}` (BuildingLayout.H) adds every room's plan box to
    the envelope, and the rule's published sentence says so only then.
    With a declared fence, the routed pipes enter the envelope as the rack's
    plan band: a pipe's run past the rack ends is the fence's to carry.

    THE ROADS (2026-10-18, DEV.md 4c C90).  A case may declare `roads {
    source; reason; headroom; access { distance; source; reason; };
    [noTraffic ( <zones> );] network ( { road "<name>"; width; reason;
    waypoints ( { x; y; } ... ); } ... ); }`: centre lines at grade, every
    segment along one plan axis, the PAVED surface each segment widened by
    half the width on every side.  REFUSED: a road through a footprint below
    the headroom; a road under the pipe rack whose published elevation is
    below the headroom; a routed pipe below the headroom over a road; a
    diagonal segment, a waypoint with a `z`, a road named twice.  ANNOUNCED:
    a road in a zone the case closes to traffic; a road whose centre line
    meets no road a gate reaches; no gate; a gate, a site building or a
    process item with no reached road within the access distance; a
    weighbridge no reached road crosses.  Two non-process KIND words carry a
    meaning here and nowhere else (`kGateKind`, `kWeighbridgeKind`): a
    `gate` is an entrance, a `weighbridge` is drivable.  Published: each
    road's length, the network's length and paved area (`unionArea`), each
    crossing under the rack, per item the nearest reached road; the roads
    are inside the plot (`plotOf`).  The draft draws no road.

    THE FENCE (2026-10-18, DEV.md 4c C93).  A case may declare `fence {
    source; reason; [inset <m>;] [crossings ( { stream; from|to "<label>";
    [side north|south; at <m>;] } ... );] }`.  The line is DERIVED, never
    typed: the published plot rectangle moved `inset` inward (absent: 0 m,
    announced) -- one home for the boundary.  It opens at each `gate` item,
    on the side nearest it, centred on the road serving the gate and as wide
    as that road.  REFUSED: a road that meets the fence anywhere but at an
    opening (a fence is a built line, as a footprint is a built volume), an
    item across or outside the fence, a negative inset, a crossing for a
    stream that does not cross the battery limit, a label on the wrong
    direction, `side north|south` without `at` or `at` on west/east, an `at`
    outside the fence, a stream declared twice.  Every boundary pipe crosses
    at a PUBLISHED point: west for an inlet, east for an outlet, at its
    lane's y and height (the stated default), or where `side`/`at` put it
    (the pipe leaves its lane there), or at the end of its waypoint override,
    which must then end on the fence.  A crossing with no label is
    ANNOUNCED (`unlabelledCrossing`), never refused.  Published: the line,
    its length, each opening, each crossing; the draft carries no fence.

    SECONDARY CONTAINMENT (2026-10-21, DEV.md 4c C134).  A case may declare
    `bunds ( { name; kind bund|impounding; items ( ... ); region { xMin;
    xMax; yMin; yMax; } | polygon ( { x; y; } ... ); wall { height; };
    [pit { x; y; length; width; depth; }] capacityRule { basis
    vesselVolume|heldLiquid; terms ( { fraction; of largest|total; } ... );
    [allowances ( { name; volume|depth; reason; } ... );] source; reason; }
    drain closedValve|sumpPump|openToSewer; source; reason; } )`.  A bund or
    an impounding area is a DECLARED REGION round the items it holds, not a
    placed item, so the overlap rule does not apply to it.  REFUSED: a
    listed item outside the wall, a placed item inside it and not listed, a
    wall through a footprint, an item indoors, an item in two containments,
    two containments sharing a floor, a pit under an item or a road, a
    containment across the fence, a missing capacity rule, and every
    malformed declaration.  THE NET VOLUME: a bund's area x its wall height
    less what the enclosed footprints occupy below the wall's top (the floor
    at grade); an impounding area's REMOTE pit.  THE REQUIRED VOLUME: the
    largest of the case's terms -- a fraction of the largest, or of the
    total, volume the enclosed items that hold LIQUID (by their sizing's own
    inventory) count on the declared basis -- plus the declared allowances
    (a volume, or a depth over the catch area: rain).  No standard's table is
    shipped (the usual ones grant no redistribution): every number is the
    case's, with its source.  ANNOUNCED: a containment short of its rule
    (`bundCapacity`), one that holds no liquid (`bundHoldsNothing`), an open
    drain to the sewer (`bundDrainOpen`), an impounding pit inside its own
    catch area (`pitNotRemote`), a road through a wall (`roadCrossesBund`), a
    pipe through one below its top (`pipeThroughBund`), and -- on EVERY
    layout -- an item in the open that holds liquid and that no containment
    encloses (`unbundedLiquid`).  Published: each containment's area, wall,
    gross / displaced / net / required volumes, the governing term, the
    verdict; the outline and the pit enter the plot.  The draft carries none.
\*---------------------------------------------------------------------------*/

#ifndef Choupo_plantLayout_PlantLayout_H
#define Choupo_plantLayout_PlantLayout_H

#include "core/Dictionary.H"
#include "core/ResultRecords.H"
#include "result/SimulationResult.H"

#include <string>

namespace Choupo
{
namespace plantLayout
{

//- A sized item's own plan shape, read from what its sizer published.
//  `known` false: the item publishes no diameter-and-length pair, and `why`
//  names what it does publish.
struct Footprint
{
    bool        known = false;
    scalar      D     = 0.0;    // [m]
    scalar      L     = 0.0;    // [m] along the cylinder's axis
    std::string fromKeys;       // e.g. "D/H"
    std::string why;
};

Footprint publishedFootprint(const EquipmentSizing& s);

//- True when the item lives inside or on another one (never placed on its
//  own); `host` says where it lives.
bool isInternal(const EquipmentSizing& s, const SimulationResult& r,
                std::string& host);

//- Read `layoutDict`, check it against the run's sized items, raise every
//  announcement, and return the record the result JSON publishes.  Throws a
//  runtime_error naming the defect on every refusal.
PlantLayoutRecord evaluate(const Dictionary& layoutDict,
                           const SimulationResult& r,
                           int verbosity);

//- A DRAFT layoutDict for this run: the placeable items in flow order along
//  one line, one area per sector, the case's own separation table, wind and
//  hazard declarations carried from `previous` when given.  Returns the text.
std::string draft(const SimulationResult& r, const Dictionary* previous);

} // namespace plantLayout
} // namespace Choupo

#endif

// ************************************************************************* //
