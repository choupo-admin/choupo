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
    Choupo

Description
    ONE shared dotted-path response extractor for every outer driver
    (sweep / design-spec / optimisation / constraints).  Previously three
    near-identical `extractResponse` copies lived in SweepDriver,
    DesignSpec and OptimizationDriver -- a taxonomy that begged to be
    reduced.  This file is that reduction: a single resolver that turns

        "<unit>.<kpi>"      -> result.kpis[unit][kpi]
        "<stream>.<field>"  -> result.streams[stream].{F | F_mass | T | P | vf}

    into a canonical-SI scalar, plus the companion dimension lookup the
    dict parser needs to read a unit-bearing RHS (`value 1125 kg/h;`).

    Stream fields (all canonical SI):
        F        molar flow      [kmol/s]
        F_mass   mass flow       [kg/s]   (= F * mixture molar mass)
        T        temperature     [K]
        P        pressure        [Pa]
        vf       vapour fraction [-]
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dimensions.H"
#include "core/SimulationResult.H"

#include <string>

namespace Choupo {

// Resolve a dotted response key to a canonical-SI scalar.  `ctx` names the
// caller for clear error messages (e.g. "SweepDriver", "DesignSpec",
// "optimization", "constraint").  Throws std::runtime_error if the key does
// not resolve to a unit KPI or a recognised stream field.
scalar extractResponse(const SimulationResult& r,
                       const std::string&      key,
                       const std::string&      ctx = "response");

// Natural physical dimensions for a target/response path so the dict parser
// can read `value <number> <unit>` with cross-checking.  Returns
// Dims::dimensionless for KPIs (no dim metadata) and unknown fields.
Dimensions expectedResponseDimensions(const SimulationResult& r,
                                      const std::string&      key);

} // namespace Choupo
