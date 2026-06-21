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

#include "PolymerKPIs.H"

#include <cmath>
#include <iomanip>
#include <iostream>

namespace Choupo {
namespace PolymerKPIs {

bool addStepGrowthKPIs(std::map<std::string, scalar>& kpis,
                       UnitProfile&                   profile,
                       scalar p,
                       scalar M0,
                       int    maxX,
                       bool   wantDist,
                       int    verbosity)
{
    std::cout << "\n----------------------  Step-growth polymer  ----------------------\n";

    // -- Guards: announce, never clamp ------------------------------------
    if (M0 <= 0.0)
    {
        std::cout << "  [polymer] M0 = " << M0 << " kg/kmol -- non-physical "
                     "repeat-unit mass; molar-mass KPIs skipped.\n"
                     "===================================================================\n\n";
        return false;
    }
    if (p >= 1.0)
    {
        std::cout << "  [polymer] p = " << std::fixed << std::setprecision(6) << p
                  << " >= 1 -- Xn = 1/(1-p) diverges; no chain statistics.\n"
                     "            (a step-growth reactor never reaches p = 1 in finite time)\n"
                     "===================================================================\n\n";
        return false;
    }
    if (p < 0.0)
    {
        std::cout << "  [polymer] p = " << p << " < 0 -- conversion is non-physical; "
                     "chain statistics skipped.\n"
                     "===================================================================\n\n";
        return false;
    }

    // -- Carothers / Flory closed forms -----------------------------------
    const scalar Xn  = 1.0 / (1.0 - p);
    const scalar Xw  = (1.0 + p) / (1.0 - p);
    const scalar Mn  = M0 / (1.0 - p);
    const scalar Mw  = M0 * (1.0 + p) / (1.0 - p);
    const scalar PDI = 1.0 + p;            // = Mw/Mn for the most-probable dist.

    kpis["p_conversion"] = p;
    kpis["Xn"]           = Xn;
    kpis["Xw"]           = Xw;
    kpis["Mn_kg_kmol"]   = Mn;
    kpis["Mw_kg_kmol"]   = Mw;
    kpis["PDI"]          = PDI;

    std::cout << std::fixed
              << "  p   (conversion of limiting group)        = "
              << std::setprecision(6) << p << "\n"
              << "  Xn  = 1/(1-p)                             = "
              << std::setprecision(3) << Xn << "\n"
              << "  Xw  = (1+p)/(1-p)                         = " << Xw << "\n"
              << "  Mn  = M0/(1-p)         (M0 = " << std::setprecision(3) << M0
              << " kg/kmol)  = " << std::setprecision(1) << Mn << " kg/kmol\n"
              << "  Mw  = M0(1+p)/(1-p)                       = " << Mw << " kg/kmol\n"
              << "  PDI = Mw/Mn = 1+p                         = "
              << std::setprecision(4) << PDI << "   (-> 2 as p -> 1)\n";

    if (p > 0.999)
        std::cout << "  [note] p > 0.999: Xn is steeply sensitive to the solver's "
                     "convergence\n         tolerance here -- read Xn as order-of-magnitude.\n";

    // -- Flory-Schulz distribution (batch / PFR only) ---------------------
    if (wantDist)
    {
        if (maxX < 1) maxX = 1;
        std::vector<scalar> xs, nx, wx;
        xs.reserve(maxX); nx.reserve(maxX); wx.reserve(maxX);
        const scalar one_mp = 1.0 - p;
        for (int x = 1; x <= maxX; ++x)
        {
            const scalar pe   = std::pow(p, x - 1);
            const scalar n_x  = one_mp * pe;               // mole fraction of x-mers
            const scalar w_x  = x * one_mp * one_mp * pe;  // weight fraction
            xs.push_back(static_cast<scalar>(x));
            nx.push_back(n_x);
            wx.push_back(w_x);
        }
        profile.xAxis            = "chainLength";
        profile.columns["chainLength"] = xs;
        profile.columns["n_x"]   = nx;     // most-probable (mole-fraction) dist.
        profile.columns["w_x"]   = wx;     // weight-fraction dist. (peaks ~ Xn)

        std::cout << "  Flory-Schulz distribution emitted: n(x)=(1-p)p^(x-1), "
                     "w(x)=x(1-p)^2 p^(x-1)\n"
                     "                                     for x = 1.." << maxX
                  << "  (peak of w(x) near x = Xn)\n";
        if (verbosity >= 3)
        {
            std::cout << "    x      n(x)         w(x)\n";
            for (int x = 1; x <= maxX && x <= 10; ++x)
                std::cout << "    " << std::setw(3) << x
                          << "   " << std::scientific << std::setprecision(4)
                          << std::setw(11) << nx[x - 1]
                          << "  " << std::setw(11) << wx[x - 1]
                          << std::fixed << "\n";
            if (maxX > 10) std::cout << "    ...  (" << maxX << " points total)\n";
        }
    }

    std::cout << "===================================================================\n\n";
    return true;
}

} // namespace PolymerKPIs
} // namespace Choupo
