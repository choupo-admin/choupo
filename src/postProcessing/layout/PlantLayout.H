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

    WHAT IS REFUSED (the run stops, exit 2): an entry naming no sized item,
    an item placed twice, two footprints that overlap in plan AND in height,
    an area for a sector the case does not have, and every malformed
    declaration.  WHAT IS ANNOUNCED (stderr + AdvisoryLog, so it reaches the
    caveat block and the result JSON): every pair closer than its declared
    separation, an item outside its sector's area, an ignition source inside
    a declared zone envelope or downwind of a release source, a separation
    rule that names a kind no placed item carries, and the sized items left
    unplaced.  The asymmetry is deliberate: an overlap is not a layout at
    all, while a short distance IS a layout -- a draft whose shortfall the
    student must see and defend.

    Pipe lengths, structures and racks, rotation other than the two plan
    axes, and any distance taken from a standard are NOT here.
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
