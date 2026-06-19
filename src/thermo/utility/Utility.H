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
Class
    Choupo::Utility

Description
    Catalogued plant utility (heating or cooling service).  Read from
    data/standards/utilities/<name>.dat via UtilityCatalogue.

    A utility carries enough information to:
      * fix a process stream that names it (`utility steamMP;` in a
        stream block pulls P, T, state, components from the catalogue);
      * mark the stream as `kind utility` for visual differentiation
        in the GUI and segregation in the mass / cost reports;
      * compute the per-GJ cost of the duty it delivers, for the
        `utilities/consumption.csv` report.

    Pedagogical principle: utilities are physical streams of real
    chemicals (the spine of the topology, see CLAUDE.md).  The
    catalogue is a convenience for the case author to avoid restating
    the same standard conditions in every case — it does NOT create a
    hidden side-channel that bypasses the stream graph.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <string>
#include <vector>

namespace Choupo {

struct Utility
{
    std::string  name;
    std::string  tier;            // "heating" | "cooling"
    std::string  mechanism;       // "condensation" | "sensible" | "evaporation"

    // What flows in the loop
    std::vector<std::string> componentsList;
    std::string              state;       // "liquid" | "saturatedVapour" | ...

    // Operating conditions (canonical SI)
    scalar P     = 0.0;            // [Pa]
    scalar T_in  = 0.0;            // [K]  delivery temperature
    scalar T_out = 0.0;            // [K]  return temperature

    // Energy carried per kg of utility delivered.  For condensation
    // mechanisms, this is the latent heat ΔHvap at the loop pressure.
    // For sensible mechanisms, it is Cp_avg × |T_in − T_out|.  The
    // catalogue file precomputes the value with a comment on the source;
    // the report uses it to convert mass flow into MW and into €/h.
    scalar      dutyPerKg = 0.0;   // [J/kg delivered]

    // Economics (indicative — refine per region / plant scale)
    scalar      cost      = 0.0;   // [€/GJ delivered (heating) or rejected (cooling)]
    int         costYear  = 0;

    // Electromechanical efficiency for the "power" tier (electric motor on
    // the consumer side, generator on the producer side).  1.0 for thermal
    // utilities (unused).  Grid draw of a pump/compressor = W_shaft / this.
    scalar      driveEfficiency = 1.0;   // [-]

    // Pedagogy
    std::string description;
};

} // namespace Choupo
