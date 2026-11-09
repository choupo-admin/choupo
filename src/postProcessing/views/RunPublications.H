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
    Choupo::views

Description
    WHAT A STEADY RUN PUBLISHES TO THE VIEWS (C271, docs/design/a-post-
    processing-dictionary.md section 7).  The producers of a flowsheet run
    are its UNITS and its STREAMS -- two namespaces, kept apart by a prefix
    in the publication's name (`unit:<name>`, `stream:<name>`), which a view
    writes as `unitOp <name>;` / `stream <name>;` -- and nothing else is
    invented here:

      * a unit: its KPIs as diagnostics (the unit of a KPI is published only
        where its key says it, `Q_reboiler_kW` -> kW; any other KPI publishes
        none and the case's declared unit is the author's statement) and its
        UnitProfile as ONE published table named `profile` (a column's unit
        likewise: T -> K, T_K, x_<comp> -> "-", stage -> "-"); a profile
        marker (the feed stage) is the diagnostic `marker_<label>`;
      * a stream: T [K], P [Pa], F [kmol/s], F_mass [kg/s], vf, and per
        component x_<c> (mole fraction), w_<c> (mass fraction) and m_<c>
        (mass flow, kg/s) of the OVERALL material, the one
        `overallMassFlow` counts.

    Built ONLY when the case declares views, so no other case's output moves.
\*---------------------------------------------------------------------------*/

#pragma once

#include "postProcessing/views/Views.H"
#include "result/SimulationResult.H"

#include <vector>

namespace Choupo {
namespace views {

std::vector<Publication> publicationsOfRun(const SimulationResult& r);

} // namespace views
} // namespace Choupo
