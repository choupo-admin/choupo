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

#include "ShortcutColumn.H"
#include "unitOperations/saturation/BubblePoint.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

int ShortcutColumn::solve(const DictPtr& dict,
                          const ThermoPackage& thermo,
                          int verbosity)
{
    // ---- Feed ----------------------------------------------------------
    auto feed = dict->subDict("feed");
    auto comp = dict->subDict("composition");
    const scalar F  = feed->lookupScalar("F", Dims::molarFlow);
    const scalar Tf = feed->lookupScalar("T", Dims::temperature);
    const scalar P  = feed->lookupScalar("P", Dims::pressure);
    const scalar vf = feed->lookupScalarOrDefault("vf", 0.0);

    const std::size_t n = thermo.n();
    sVector z(n, 0.0);
    {
        scalar s = 0.0;
        for (const auto& k : comp->keys()) z[thermo.indexOf(k)] = comp->lookupScalar(k);
        for (auto v : z) s += v;
        if (s > 0.0) for (auto& v : z) v /= s;
    }

    // ---- Operation -----------------------------------------------------
    auto oper = dict->subDict("operation");
    const std::size_t iLK = thermo.indexOf(oper->lookupWord("lightKey"));
    const std::size_t iHK = thermo.indexOf(oper->lookupWord("heavyKey"));
    const scalar rLK = oper->lookupScalar("recoveryLK");   // LK fraction to distillate
    const scalar rHK = oper->lookupScalar("recoveryHK");   // HK fraction to distillate
    if (rLK <= 0.0 || rLK >= 1.0 || rHK <= 0.0 || rHK >= 1.0)
        throw std::runtime_error("ShortcutColumn: recoveryLK / recoveryHK must be in (0,1)");

    // ---- Relative volatilities at the feed bubble point -----------------
    auto bub = BubblePoint::compute(thermo, z, P, Tf);
    const scalar Tref = bub.converged ? bub.T : Tf;
    const sVector K = thermo.Kvec(Tref, P, z, bub.y);
    const scalar Khk = K[iHK];
    if (!(Khk > 0.0))
        throw std::runtime_error("ShortcutColumn: heavy-key K-value is zero "
            "(is the heavy key non-volatile?)");
    sVector alpha(n, 0.0);
    for (std::size_t i = 0; i < n; ++i) alpha[i] = K[i] / Khk;   // α_i,HK
    const scalar aLK = alpha[iLK];
    if (aLK <= 1.0)
        throw std::runtime_error("ShortcutColumn: light key is not more "
            "volatile than the heavy key (α_LK,HK <= 1) --- check the keys.");

    // ---- Fenske: N_min and the non-key distribution --------------------
    const scalar Nmin = std::log((rLK / (1.0 - rLK)) * ((1.0 - rHK) / rHK))
                      / std::log(aLK);
    // d_i / b_i = (rHK/(1-rHK)) · α_i^{N_min};  d_i + b_i = F z_i
    sVector d(n, 0.0), b(n, 0.0);
    const scalar hkRatio = rHK / (1.0 - rHK);
    for (std::size_t i = 0; i < n; ++i)
    {
        const scalar fi = F * z[i];
        const scalar ratio = hkRatio * std::pow(alpha[i], Nmin);
        d[i] = fi * ratio / (1.0 + ratio);
        b[i] = fi - d[i];
    }
    scalar D = 0.0, B = 0.0;
    for (std::size_t i = 0; i < n; ++i) { D += d[i]; B += b[i]; }
    sVector xD(n, 0.0), xB(n, 0.0);
    for (std::size_t i = 0; i < n; ++i)
    {
        if (D > 0.0) xD[i] = d[i] / D;
        if (B > 0.0) xB[i] = b[i] / B;
    }

    // ---- Underwood: root θ in (1, α_LK), then R_min --------------------
    const scalar q = 1.0 - vf;                          // liquid fraction of feed
    auto gU = [&](scalar th) {
        scalar s = 0.0;
        for (std::size_t i = 0; i < n; ++i) s += alpha[i] * z[i] / (alpha[i] - th);
        return s - (1.0 - q);
    };
    // Bisection between the HK (α=1) and LK volatilities, off the poles.
    scalar lo = 1.0 + 1.0e-6, hi = aLK - 1.0e-6, theta = 0.5 * (lo + hi);
    {
        scalar glo = gU(lo), ghi = gU(hi);
        if (glo * ghi > 0.0) theta = 0.5 * (lo + hi);   // fallback (no sign change)
        else
            for (int it = 0; it < 200; ++it)
            {
                theta = 0.5 * (lo + hi);
                const scalar g = gU(theta);
                if (std::abs(g) < 1.0e-10) break;
                if (glo * g < 0.0) { hi = theta; } else { lo = theta; glo = g; }
            }
    }
    scalar Rmin = 0.0;
    for (std::size_t i = 0; i < n; ++i) Rmin += alpha[i] * xD[i] / (alpha[i] - theta);
    Rmin -= 1.0;
    if (Rmin < 0.0) Rmin = 0.0;

    // ---- Operating reflux: refluxRatio OR refluxFactor (= R/R_min) -----
    scalar R;
    if (oper->found("refluxRatio"))      R = oper->lookupScalar("refluxRatio");
    else if (oper->found("refluxFactor")) R = oper->lookupScalar("refluxFactor") * Rmin;
    else                                  R = 1.3 * Rmin;          // sensible default
    if (R <= Rmin)
        throw std::runtime_error("ShortcutColumn: operating reflux R = "
            + std::to_string(R) + " <= R_min = " + std::to_string(Rmin)
            + " --- infeasible; increase refluxRatio.");

    // ---- Gilliland (Molokanov): actual stage count N ------------------
    const scalar X = (R - Rmin) / (R + 1.0);
    const scalar Y = 1.0 - std::exp((1.0 + 54.4 * X) / (11.0 + 117.2 * X)
                                    * (X - 1.0) / std::sqrt(X));
    const scalar N = (Y + Nmin) / (1.0 - Y);

    // ---- Kirkbride: feed-stage location -------------------------------
    //  N_R/N_S = [ (z_HK/z_LK)·(x_LK,B/x_HK,D)^2·(B/D) ]^0.206
    scalar feedStage = 0.0;
    if (xD[iHK] > 0.0 && z[iLK] > 0.0)
    {
        const scalar inside = (z[iHK] / z[iLK])
                            * std::pow(xB[iLK] / xD[iHK], 2.0)
                            * (B / D);
        const scalar NR_NS = std::pow(std::max(inside, 1.0e-12), 0.206);
        const scalar N_S = N / (1.0 + NR_NS);
        feedStage = N - N_S;                  // counted from the top
    }

    // ---- Streams -------------------------------------------------------
    produced_.clear();
    ProcessStream dist; dist.name = "distillate";
    dist.F = D; dist.T = Tref; dist.P = P; dist.z = xD; dist.vf = 0.0;
    ProcessStream bot;  bot.name = "bottoms";
    bot.F = B;  bot.T = Tref; bot.P = P; bot.z = xB; bot.vf = 0.0;
    produced_.push_back(dist);
    produced_.push_back(bot);

    // ---- KPIs ----------------------------------------------------------
    kpis_.clear();
    kpis_["N_min"]        = Nmin;
    kpis_["R_min"]        = Rmin;
    kpis_["N_theoretical"]= N;
    kpis_["R"]            = R;
    kpis_["feed_stage"]   = feedStage;
    kpis_["alpha_LK_HK"]  = aLK;
    kpis_["theta"]        = theta;
    kpis_["D"]            = D;
    kpis_["B"]            = B;
    kpis_["x_D_LK"]       = xD[iLK];
    kpis_["x_B_HK"]       = xB[iHK];

    // ---- Report --------------------------------------------------------
    if (verbosity >= 2)
    {
        std::cout << "\n==================  Shortcut Column (FUG)  =======================\n"
                  << "  Keys: LK = " << thermo.comp(iLK).name()
                  << ",  HK = " << thermo.comp(iHK).name()
                  << "   (α_LK,HK = " << std::fixed << std::setprecision(3) << aLK
                  << " at " << std::setprecision(1) << Tref << " K)\n"
                  << "  Recoveries to distillate:  LK " << std::setprecision(3) << rLK
                  << ",  HK " << rHK << "\n"
                  << "  Fenske    N_min = " << std::setprecision(2) << Nmin << "\n"
                  << "  Underwood R_min = " << Rmin << "  (θ = " << std::setprecision(3)
                  << theta << ")\n"
                  << "  Operating R     = " << std::setprecision(2) << R
                  << "  (R/R_min = " << std::setprecision(2) << (R / std::max(Rmin,1e-9)) << ")\n"
                  << "  Gilliland N     = " << std::setprecision(1) << N
                  << " theoretical stages,  feed at stage " << std::setprecision(1)
                  << feedStage << " (from top)\n"
                  << "  D = " << std::scientific << std::setprecision(4) << D
                  << " kmol/s,  B = " << B << " kmol/s\n"
                  << "  Assumptions: constant alpha (feed bubble pt), sharp split,\n"
                  << "               ideal stages.  No azeotropes.\n"
                  << "==================================================================\n\n";
    }
    return 0;
}

} // namespace Choupo
