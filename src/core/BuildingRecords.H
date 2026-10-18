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
File
    src/core/BuildingRecords.H

Description
    THE GMP INTERIOR a case declares and the engine checks (2026-10-18,
    DEV.md 4c C97 phase B) -- the plain record `postProcessing/layout/
    BuildingLayout` produces and the result JSON carries as its top-level
    `"building"` block.  Scalars, ints, bools and strings only, in `core` for
    the reason `ResultRecords.H` gives (debt D7): the engine PRODUCES it and
    the result CARRIES it.  EMPTY (`present` false) unless the case declares
    `building {}` in `system/layoutDict`, so every other result is unchanged.

    Lengths in metres, areas in m2, pressures in Pa.  A room's `pressure` is
    the DECLARED differential against `relativeTo` (a room, or `outside`);
    `pressureToOutside` is the same pressure resolved along that chain, the
    one number every rule compares.
\*---------------------------------------------------------------------------*/

#ifndef Choupo_core_BuildingRecords_H
#define Choupo_core_BuildingRecords_H

#include "core/Types.H"

#include <string>
#include <vector>

namespace Choupo {

struct BuildingFloor
{
    std::string name;
    scalar      elevation = 0;   // [m] the floor's finished level
    scalar      height    = 0;   // [m] floor to ceiling
};

struct BuildingRoom
{
    std::string name;
    std::string floor;
    //  room | personnelAirlock | materialAirlock | gowning
    std::string role;
    std::string grade;            // A | B | C | D | CNC
    std::string regime;           // cascade | bubble | sink (airlocks only)
    bool        containment = false;
    int         atexZone    = -1; // -1: not a hazardous area; 0 1 2 20 21 22
    std::string atexSource, atexReason;
    std::string ignition;         // the declared reason; empty = not one
    scalar xMin = 0, xMax = 0, yMin = 0, yMax = 0;
    scalar z = 0, height = 0;     // [m] the floor's elevation and height
    scalar area = 0;              // [m2]
    scalar pressure = 0;          // [Pa] declared, against `relativeTo`
    std::string relativeTo;       // a room name, or `outside`
    scalar pressureToOutside = 0; // [Pa] resolved along the chain
    int    occupancy = -1;        // -1: not declared
    std::vector<std::string> equipment;   // placed item ids
    std::string source, reason;   // both or neither
};

//  A door (same floor, a shared wall) or a stair / lift (two floors, plans
//  overlapping).  `b` may be `outside`.  `dP` = p(a) - p(b), to outside.
struct BuildingConnection
{
    std::string id;               // "<type>:<a>:<b>"
    std::string a, b;
    std::string type;             // door | stair | lift
    scalar      dP = 0;           // [Pa]
};

struct BuildingFlow
{
    std::string name;
    std::string kind;             // personnel | material | waste
    std::vector<std::string> path;
    std::string reason;
    bool        connected = true; // every step through a declared connection
};

//  A room the case DECLARES two or more flow kinds may share, with its reason.
struct BuildingShared
{
    std::string room;
    std::vector<std::string> flows;
    std::string reason;
};

//  One finding: `<kind>:<a>:<b>` identity, as the plant layout's.
struct BuildingFinding
{
    std::string id;
    std::string kind;
    std::string a, b;
    scalar      value = 0;
    scalar      limit = 0;
    std::string message;
};

struct BuildingRecord
{
    bool        present = false;
    std::string name;
    std::string source, reason;
    scalar      minimumStep = 0;       // [Pa]
    std::string stepSource, stepReason;
    bool        atexSeparationDeclared = false;
    scalar      atexDistance = 0;      // [m]
    std::string atexSource, atexReason;
    std::vector<BuildingFloor>      floors;
    std::vector<BuildingRoom>       rooms;
    std::vector<BuildingConnection> connections;
    std::vector<BuildingFlow>       flows;
    std::vector<BuildingShared>     shared;
    std::vector<BuildingFinding>    findings;
    scalar      floorArea = 0;         // [m2] every room, every floor
    int         occupancy = 0;         // the declared occupancies summed
};

} // namespace Choupo

#endif

// ************************************************************************* //
