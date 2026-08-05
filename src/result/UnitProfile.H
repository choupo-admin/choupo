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

    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
-------------------------------------------------------------------------------
Struct
    Choupo::ProfileMarker, Choupo::UnitProfile

Description
    The 1-D internal profile a unit op publishes (PFR axial sweep,
    distillation stage table, ...) -- a PURE DATA shape, deliberately in
    its own small header: SimulationResult and the reporting layer consume
    profiles without depending on the whole unit-operation hierarchy (and
    through it the thermodynamics).  Build-hygiene split, 2026-07-26.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

// 1-D internal profile of a unit op (PFR axial sweep, distillation
// stage table, etc.).  The first column named by `xAxis` is the
// independent variable; the GUI plots every other column against it.
//
// `markers` are vertical annotations the unit wants the GUI to draw,
// each anchored at a position along the xAxis.  Used e.g. by the
// distillation column to mark the feed stage.
struct ProfileMarker
{
    scalar         x;       // position along the unit's xAxis
    std::string    label;
};

struct UnitProfile
{
    std::string                                  xAxis;       // e.g. "V" or "stage"
    std::map<std::string, std::vector<scalar>>   columns;
    std::vector<ProfileMarker>                   markers;
};

} // namespace Choupo
