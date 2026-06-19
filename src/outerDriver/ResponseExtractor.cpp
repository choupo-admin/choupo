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
\*---------------------------------------------------------------------------*/

#include "ResponseExtractor.H"

#include <stdexcept>

namespace Choupo {

namespace {

// Mixture molar mass (kg/kmol) for a stream's composition.  Returns 0 when
// the composition length disagrees with the component list (callers fall
// back to molar F); preserves the historic DesignSpec behaviour exactly.
scalar MW_mix(const SimulationResult& r, const sVector& z)
{
    if (r.componentNames.size() != z.size()) return 0.0;
    scalar mw = 0.0;
    for (std::size_t i = 0; i < z.size(); ++i)
    {
        auto it = r.componentMolarMass.find(r.componentNames[i]);
        if (it != r.componentMolarMass.end()) mw += z[i] * it->second;
    }
    return mw;
}

} // anonymous namespace

scalar extractResponse(const SimulationResult& r,
                       const std::string&      key,
                       const std::string&      ctx)
{
    const auto dot = key.find('.');
    if (dot == std::string::npos)
        throw std::runtime_error(ctx + ": response key '" + key
            + "' is not in 'unit.kpi' or 'stream.field' format");

    const std::string a = key.substr(0, dot);
    const std::string b = key.substr(dot + 1);

    // First try unit KPIs.
    auto itU = r.kpis.find(a);
    if (itU != r.kpis.end())
    {
        auto itK = itU->second.find(b);
        if (itK != itU->second.end()) return itK->second;
    }

    // Then stream fields (canonical SI).
    auto itS = r.streams.find(a);
    if (itS != r.streams.end())
    {
        const auto& s = itS->second;
        if (b == "F"     ) return s.F;                    // kmol/s
        if (b == "F_mass") return s.F * MW_mix(r, s.z);   // kg/s
        if (b == "T"     ) return s.T;                    // K
        if (b == "P"     ) return s.P;                    // Pa
        if (b == "vf"    ) return s.vf;                   // -
        throw std::runtime_error(ctx + ": unknown stream field '" + b
            + "' (allowed: F (kmol/s) | F_mass (kg/s) | T | P | vf)");
    }

    throw std::runtime_error(ctx + ": response '" + key
        + "' did not resolve to a unit KPI or to a stream field");
}

Dimensions expectedResponseDimensions(const SimulationResult& r,
                                      const std::string&      key)
{
    const auto dot = key.find('.');
    if (dot == std::string::npos) return Dims::dimensionless;
    const std::string a = key.substr(0, dot);
    const std::string b = key.substr(dot + 1);

    // KPI side: dimensionless (no metadata available).
    if (r.kpis.count(a)) return Dims::dimensionless;

    if (r.streams.count(a))
    {
        if (b == "F"     ) return Dims::molarFlow;
        if (b == "F_mass") return Dims::massFlow;
        if (b == "T"     ) return Dims::temperature;
        if (b == "P"     ) return Dims::pressure;
        if (b == "vf"    ) return Dims::dimensionless;
    }
    return Dims::dimensionless;
}

} // namespace Choupo
