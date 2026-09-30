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

#include "GelPolarisation.H"
#include "thermo/ThermoPackage.H"

#include <cmath>
#include <stdexcept>

namespace Choupo {
namespace membrane {

void GelPolarisation::readParameters(const DictPtr& params)
{
    const std::string ctx = "transport gelPolarisation";
    if (!params || !params->found("gel"))
        throw std::runtime_error(ctx + ": no `gel { solute; c_gel; sieving {};"
            " source; }` block in the unit's `transportParameters {}` -- the"
            " law has no gel concentration and no sieving coefficients"
            " without it");
    auto g = params->subDict("gel");
    for (const char* k : { "solute", "c_gel", "sieving", "source" })
        if (!g->found(k))
            throw std::runtime_error(ctx + ": `gel {}` declares no `"
                + std::string(k) + "`" + (std::string(k) == "source"
                ? " -- c_g and S are declared numbers; the case must say where"
                  " they come from (a measurement, a paper, or \"hypothetical"
                  " teaching value\")" : ""));
    gelSolute_ = g->lookupWord("solute");
    cGelMass_  = g->lookupScalar("c_gel");
    if (!(cGelMass_ > 0.0))
        throw std::runtime_error(ctx + ": c_gel must be positive");
    auto s = g->subDict("sieving");
    for (const auto& k : s->keys())
    {
        const scalar S = s->lookupScalar(k);
        if (S < 0.0 || S >= 1.0)
            throw std::runtime_error(ctx + ": sieving coefficient of '" + k
                + "' is " + std::to_string(S) + " -- it must lie in [0, 1)"
                  " (S = 1 is a solute the membrane does not see)");
        sieving_[k] = S;
    }
    read_ = true;
}

TransportSolution GelPolarisation::localFluxes(const TransportContext& ctx) const
{
    if (!read_)
        throw std::runtime_error("transport gelPolarisation: no"
            " `transportParameters { gel { solute; c_gel; sieving {}; source; } }`"
            " in the unit's operation -- the law has no gel concentration and"
            " no sieving coefficients without it");
    const std::size_t Ns = ctx.soluteIdx.size();
    std::vector<scalar> S(Ns, 0.0), k(Ns, 0.0);
    std::size_t g = Ns;
    for (std::size_t s = 0; s < Ns; ++s)
    {
        const std::string& nm = ctx.thermo.comp(ctx.soluteIdx[s]).name();
        auto it = sieving_.find(nm);
        if (it == sieving_.end())
            throw std::runtime_error("transport gelPolarisation: no sieving"
                " coefficient for solute '" + nm + "' -- declare it in"
                " gel { sieving { " + nm + " <S>; } }");
        S[s] = it->second;
        k[s] = ctx.polarisation.kFilm(ctx.hydraulics, s);
        if (nm == gelSolute_) g = s;
    }
    if (g == Ns)
        throw std::runtime_error("transport gelPolarisation: the gel-forming"
            " solute '" + gelSolute_ + "' is not a solute of this feed");

    TransportSolution sol;
    sol.c_m.assign(Ns, 0.0);
    sol.c_p.assign(Ns, 0.0);
    sol.J_s.assign(Ns, 0.0);
    const scalar dP = ctx.P_feed_Pa - ctx.P_perm_Pa;
    if (dP <= 0.0) { sol.J_w = 0.0; return sol; }

    //  The gel concentration in the module's units (kmol/m3).
    const scalar cg = cGelMass_ / ctx.thermo.comp(ctx.soluteIdx[g]).MW();
    auto wall = [&](std::size_t s, scalar J)
    {
        const scalar e = std::exp(J / k[s]);
        return ctx.c_b[s] * e / (1.0 - S[s] + S[s] * e);
    };

    scalar J = ctx.A_w * dP;                         // pressure-controlled
    if (wall(g, J) > cg)
    {
        //  Mass-transfer controlled: the wall is pinned at c_g.
        const scalar den = ctx.c_b[g] - S[g] * cg;
        J = (den > 0.0 && ctx.c_b[g] < cg)
          ? k[g] * std::log(cg * (1.0 - S[g]) / den)
          : 0.0;
    }
    sol.J_w = J;
    for (std::size_t s = 0; s < Ns; ++s)
    {
        sol.c_m[s] = (s == g && J < ctx.A_w * dP) ? std::min(cg, wall(s, J))
                                                  : wall(s, J);
        sol.c_p[s] = S[s] * sol.c_m[s];
        sol.J_s[s] = J * sol.c_p[s];
    }
    return sol;
}

} // namespace membrane
} // namespace Choupo
