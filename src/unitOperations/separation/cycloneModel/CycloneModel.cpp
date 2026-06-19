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

#include "CycloneModel.H"
#include "Lapple.H"
#include "LeithLicht.H"
#include "IoziaLeith.H"
#include "Barth.H"
#include "Muschelknautz.H"

#include <cmath>
#include <stdexcept>

namespace Choupo {

std::map<std::string, CycloneModel::Factory>& CycloneModel::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void CycloneModel::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<CycloneModel> CycloneModel::New(const std::string& name)
{
    auto it = registry().find(name);
    if (it == registry().end())
    {
        std::string avail;
        for (const auto& kv : registry()) avail += " " + kv.first;
        throw std::runtime_error("CycloneModel::New: unknown model '" + name
            + "'.  Available:" + avail);
    }
    return it->second();
}

std::vector<std::string> CycloneModel::availableTypes()
{
    std::vector<std::string> v;
    for (const auto& kv : registry()) v.push_back(kv.first);
    return v;
}

// Default d50: bisection on η(d) = 0.5 over a wide size window.  Models
// with a closed-form cut diameter (Lapple, IoziaLeith) override this.
scalar CycloneModel::cutDiameter(const CycloneContext& c) const
{
    scalar lo = 1.0e-9, hi = 1.0e-3;   // 1 nm.. 1 mm
    if (gradeEfficiency(lo, c) > 0.5) return lo;
    if (gradeEfficiency(hi, c) < 0.5) return hi;
    for (int it = 0; it < 80; ++it)
    {
        const scalar mid = std::sqrt(lo * hi);   // geometric bisection
        if (gradeEfficiency(mid, c) < 0.5) lo = mid; else hi = mid;
    }
    return std::sqrt(lo * hi);
}

// Default pressure drop: Shepherd-Lapple.  ΔP = N_H · ρ_g · v_i² / 2 with
// N_H = 8 velocity heads for the Lapple standard geometry (N_H = K a b / De²,
// K = 16, a = Dc/2, b = Dc/4, De = Dc/2).
scalar CycloneModel::pressureDrop(const CycloneContext& c) const
{
    constexpr scalar N_H = 8.0;
    return N_H * c.rho_g * c.vi * c.vi / 2.0;
}

void CycloneModel::registerBuiltins()
{
    registerType("Lapple",       []{ return std::make_unique<Lapple>();       });
    registerType("LeithLicht",   []{ return std::make_unique<LeithLicht>();   });
    registerType("IoziaLeith",   []{ return std::make_unique<IoziaLeith>();   });
    registerType("Barth",        []{ return std::make_unique<Barth>();        });
    registerType("Muschelknautz",[]{ return std::make_unique<Muschelknautz>();});
}

} // namespace Choupo
