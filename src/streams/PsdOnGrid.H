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
Description
    Put a stream's size distribution on the case's size grid -- the ONE
    place a unit that generates its own bins (a crystalliser's population
    balance, a spray dryer's droplet spread) hands its result over to the
    case's classes (DEV.md 4c C361, docs/design/c361-solids-processing.md).

    A distribution that is already on the grid is left untouched (the
    mapping would be the identity, and an identity computed in floating
    point is not one).  Otherwise it is re-binned by `SizeGrid::mapTable`,
    from its declared edges or, when it has none, from edges inferred at the
    geometric midpoints of its sizes; the report says which and how much mass
    lay above xMax.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/distribution/SizeGrid.H"
#include "streams/ProcessStream.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

//  Returns a one-line description of what was done ("" when nothing was).
inline std::string putPsdOnGrid(ParticleSizeDistribution& psd,
                                const SizeGrid&           grid,
                                SizeGridMapReport*        rep = nullptr)
{
    if (psd.empty() || grid.empty()) return "";
    if (grid.sameAs(psd.edges)) return "";
    const bool inferred = !psd.onGrid();
    const std::vector<scalar> src = inferred ? inferSizeEdges(psd.diameter)
                                             : psd.edges;
    SizeGridMapReport r;
    psd.massFrac = grid.mapTable(src, psd.massFrac, &r);
    psd.diameter = grid.representative();
    psd.edges    = grid.edges();
    psd.declaredLaw.reset();
    if (rep) *rep = r;
    return std::string("re-binned onto the case's ")
         + std::to_string(grid.nClasses()) + " size classes from "
         + (inferred ? "edges inferred at the geometric midpoints of its own bins"
                     : "its declared edges");
}

//  The derived quantities of a stream's distribution as KPIs, from the ONE
//  home (`psdMoments`): <prefix>d10_um ... d90_um, d32_um (Sauter) and
//  Sv_m2_m3 (6/d32, surface per volume of solid).  Sizes in micrometres
//  because that is the unit a sieve analysis is read in.
inline void publishPsdKpis(std::map<std::string, scalar>& kpis,
                           const std::string&             prefix,
                           const ParticleSizeDistribution& psd)
{
    const PsdMoments m = psdMoments(psd.edges, psd.diameter, psd.massFrac);
    if (!m.valid) return;
    kpis[prefix + "d10_um"]   = m.d10 * 1e6;
    kpis[prefix + "d50_um"]   = m.d50 * 1e6;
    kpis[prefix + "d80_um"]   = m.d80 * 1e6;
    kpis[prefix + "d90_um"]   = m.d90 * 1e6;
    kpis[prefix + "d32_um"]   = m.d32 * 1e6;
    kpis[prefix + "Sv_m2_m3"] = m.Sv;
}

} // namespace Choupo
