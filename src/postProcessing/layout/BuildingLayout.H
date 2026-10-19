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
    Choupo::buildingLayout

Description
    THE GMP INTERIOR A CASE DECLARES AND THE ENGINE CHECKS (2026-10-18,
    DEV.md 4c C97 phase B).  A pharmaceutical plant is a BUILDING before it
    is a plot plan: rooms of declared cleanliness, held at declared pressures
    so air always moves from the cleaner room to the less clean one, reached
    through airlocks, walked by people, carried through by material and by
    waste.  `system/layoutDict` may declare one `building {}` block beside
    the plot plan; this file reads it, checks it against the plot plan the
    engine has ALREADY checked (`PlantLayout`), raises every finding and
    returns the record the result JSON publishes as `"building"`.  Absent the
    block, nothing here runs and no output changes.

    THE VOCABULARY.  A room's `grade` is A | B | C | D in the sense of EU GMP
    Annex 1 (European Commission, EudraLex Vol. 4, C(2022) 5938, para 4.4:
    A the critical zone for high-risk operations, B its background, C and D
    cleanrooms for the less critical stages), or CNC -- controlled, not
    classified -- the industry's word for a room with no grade.  Annex 1 is
    written for STERILE products; an oral-solid-dose plant borrows its grade
    vocabulary and its rule of thumb by declaration, which is why the step is
    the case's (`cascade { minimumStep; source; reason; }`) and never a
    number shipped here.  Cleanliness ranks A > B > C > D > CNC > outside.

    AN AIRLOCK IS A ROOM.  Annex 1's glossary calls it "an enclosed space with
    interlocked doors"; it has floor area, a grade and a pressure of its own,
    and its job -- cascade, bubble or sink -- is a statement about that
    pressure against its neighbours.  So an airlock is declared as a room
    with `role personnelAirlock | materialAirlock | gowning` and a `regime`,
    and a CONNECTION is a plain opening between two spaces: a `door` (one
    floor, a shared wall), a `stair` or a `lift` (two floors, plans that
    overlap).  A changing room is a personnel airlock where garments change
    (para 4.12 (i)); `gowning` says so.

    WHAT IS REFUSED (the run stops): a malformed declaration (an unknown
    word, a missing key, a duplicate name, a room `relativeTo` chain that
    closes on itself); two rooms that share a volume (a room takes its
    floor's elevation and height, or a declared `height` of its own -- a
    double-height suite -- and must then clear the floor above); two floors
    whose heights overlap; a door between rooms with no shared wall, or to
    `outside` from a room with no exterior wall; a stair or lift between
    rooms on the same floor or whose plans do not overlap; an equipment
    item that is not placed, is assigned twice, or does not fit inside its
    room (plan and height); a placed item inside a room's volume that the
    room does not list; a road through a room below the roads' headroom; a
    room across the fence; a flow naming an unknown room or a single room;
    an `envelope` that names no placed non-process item, and a room outside
    that item's box.

    THE SHELL AND THE PLOT.  `envelope <id>;` (optional) names the
    NON-PROCESS item of the plot plan that is the building as the SITE sees
    it -- its footprint, its separations, its road access, its ignition --
    so the rooms are its interior: each must lie inside its box, and it is
    the one placed item a room may stand inside without listing it.  The
    rooms' plan boxes enter the PLOT (`plotOf` in PlantLayout.cpp, through
    `roomPlans` below, the same reader), so no room can lie beyond the
    published plot and its ground is priced with the rest (2026-10-18,
    DEV.md 4c C97: the `roomBeyondPlot` finding phase B raised instead is
    retired with the gap it reported).

    WHAT IS ANNOUNCED (stderr + AdvisoryLog, so it reaches the caveat block
    and the result JSON), each a `<kind>:<a>:<b>` finding:
      cascade                   between two connected rooms of different
                                cleanliness (or across a cascade airlock),
                                the cleaner is not higher by `minimumStep`;
      airlockRegime             a bubble not above every neighbour by the
                                step, a sink not below, a cascade airlock
                                not strictly between its neighbours, or an
                                airlock opening on fewer than two spaces;
      gradeChangeWithoutAirlock a connection between spaces of different
                                cleanliness, the cleaner graded, neither an
                                airlock;
      wrongAirlock              a personnel flow through a material airlock,
                                a material or waste flow through a personnel
                                airlock or gowning room (unless `shared`);
      ungownedEntry             a personnel flow entering a graded room
                                cleaner than the last gowning room it
                                passed since it left CNC or outside;
      containmentAccess         a containment room opening on a
                                non-containment space other than through a
                                bubble or sink airlock;
      containmentNotNegative    a containment room not lower by the step
                                than a neighbour (a sink airlock excepted:
                                it is lower by design and exhausts what
                                leaves);
      flowBreak                 two consecutive rooms of a flow with no
                                declared connection between them;
      materialRevisit           a material flow entering a room twice;
      flowCrossing              a room a personnel flow and a material flow
                                both pass THROUGH, not declared `shared`;
      wasteMeetsMaterial        a room a waste flow and a material flow both
                                pass through, not declared `shared`;
      atexIgnition              an ATEX room and an ignition room closer
                                than the declared separation, or connected
                                by a door, or one and the same room;
      atexSeparationUndeclared  ATEX and ignition rooms with no separation;
      noEscape                  a room with no way to `outside` through
                                doors and stairs (a lift is not an exit);
    "Pass through" means the flow's INTERIOR rooms: its first and last are
    where it starts and ends -- the room an operator works in, the room
    where waste is produced -- and meeting there is the work itself, not a
    crossing.

    NOT HERE, said plainly: air change rates and HVAC sizing, door widths,
    travel distance to an exit, particle classes, and any number from the
    ISPE Baseline Guides (cited by title only; their tables grant no
    redistribution).
\*---------------------------------------------------------------------------*/

#ifndef Choupo_buildingLayout_BuildingLayout_H
#define Choupo_buildingLayout_BuildingLayout_H

#include "core/BuildingRecords.H"
#include "core/Dictionary.H"
#include "core/ResultRecords.H"

#include <string>
#include <vector>

namespace Choupo
{
namespace buildingLayout
{

//- The plan box of one declared room.
struct RoomPlan
{
    std::string name;
    scalar xMin = 0, xMax = 0, yMin = 0, yMax = 0;   // [m]
};

//- The declared rooms' plan boxes (absent block: none), read by the same
//  reader `evaluate` uses -- for the plot rule, which runs first.
std::vector<RoomPlan> roomPlans(const Dictionary& layoutDict);

//- Read the `building {}` block of `layoutDict` (absent: an empty record),
//  check it against the plot plan `plant` (already checked), raise every
//  announcement and return the record.  Throws a runtime_error naming the
//  defect on every refusal.
BuildingRecord evaluate(const Dictionary& layoutDict,
                        const PlantLayoutRecord& plant,
                        int verbosity);

} // namespace buildingLayout
} // namespace Choupo

#endif

// ************************************************************************* //
