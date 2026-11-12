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
\*---------------------------------------------------------------------------*/

#include "LiquidViscosityMixingRule.H"
#include "core/Advisory.H"
#include "thermo/Component.H"
#include "thermo/ThermoAnnounce.H"

#include <cmath>
#include <iostream>
#include <map>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

namespace {

scalar logMoleAverage(const sVector& x, const sVector& pure)
{
    scalar lnmu = 0.0, xsum = 0.0;
    for (std::size_t i = 0; i < x.size(); ++i)
    {
        if (x[i] <= 0.0) continue;
        lnmu += x[i] * std::log(pure[i]);
        xsum += x[i];
    }
    if (xsum <= 0.0)
        throw std::runtime_error("ThermoPackage::viscosityLiquid: empty composition");
    return lnmu / xsum;
}

// ---- logMoleAverage --------------------------------------------------------
//  ln mu_m = sum x_i ln mu_i.  Silent, as it was before it had a name.
class LogMoleAverage : public LiquidViscosityMixingRule
{
public:
    explicit LogMoleAverage(const DictPtr& d)
    {
        if (d->found("interaction"))
            throw std::runtime_error("liquid viscosity: `interaction ( ... )`"
                " is read only by `mixingRule GrunbergNissan;` -- under"
                " logMoleAverage every G_ij is zero, so a declared pair would"
                " be a comment.  Select GrunbergNissan or remove the list.");
    }

    const std::string& ruleName() const override
    { static const std::string s = "logMoleAverage"; return s; }
    const std::string& citation() const override
    {
        static const std::string s = "Grunberg & Nissan, Nature 164 (1949)"
            " 799 with every G_ij = 0 (Poling 5ed eq. 9-13.1)";
        return s;
    }
    const std::string& validityWindow() const override
    {
        static const std::string s = "mixtures of similar, non-associating"
            " liquids; misses the viscosity maximum of water + alcohols by"
            " tens of percent";
        return s;
    }

    scalar mix(scalar, const sVector& x, const sVector& pure,
               const LiquidMixingContext&) const override
    {
        return std::exp(logMoleAverage(x, pure));      // Pa s
    }
};

// ---- GrunbergNissan --------------------------------------------------------
class GrunbergNissan : public LiquidViscosityMixingRule
{
public:
    struct Pair
    {
        std::string i, j;
        scalar A = 0.0, B = 0.0, C = 0.0, D = 0.0;
        scalar Tmin = 0.0, Tmax = 0.0;
        std::string source;
    };

    explicit GrunbergNissan(const DictPtr& d)
    {
        if (!d->found("interaction")) return;
        for (const auto& p : d->lookupDictList("interaction"))
        {
            Pair q;
            q.i = p->lookupWord("i");
            q.j = p->lookupWord("j");
            if (q.i == q.j)
                throw std::runtime_error("liquid viscosity (GrunbergNissan):"
                    " an interaction names '" + q.i + "' twice; G_ii = 0 by"
                    " definition (Poling 5ed eq. 9-13.2).");
            q.A = p->lookupScalar("A");
            q.B = p->lookupScalarOrDefault("B", 0.0);
            q.C = p->lookupScalarOrDefault("C", 0.0);
            q.D = p->lookupScalarOrDefault("D", 0.0);
            q.Tmin = p->lookupScalar("Tmin");
            q.Tmax = p->lookupScalar("Tmax");
            if (!p->found("source"))
                throw std::runtime_error("liquid viscosity (GrunbergNissan):"
                    " the interaction " + q.i + "-" + q.j + " states no"
                    " `source` -- a G_ij is a fit to measured mixture"
                    " viscosities, and the measurements it came from must be"
                    " named.");
            q.source = p->lookupWord("source");
            pairs_.push_back(q);
        }
    }

    const std::string& ruleName() const override
    { static const std::string s = "GrunbergNissan"; return s; }
    const std::string& citation() const override
    {
        static const std::string s = "Grunberg & Nissan, Nature 164 (1949)"
            " 799; Poling, Prausnitz & O'Connell, The Properties of Gases"
            " and Liquids, 5th ed. (2001), eqs. 9-13.1/9-13.2";
        return s;
    }
    const std::string& validityWindow() const override
    {
        static const std::string s = "each declared pair inside its own"
            " fitted temperature window (outside: announced, still"
            " returned); pairs without a declared G_ij mix as"
            " logMoleAverage";
        return s;
    }

    scalar mix(scalar T, const sVector& x, const sVector& pure,
               const LiquidMixingContext& ctx) const override
    {
        const std::vector<Component>& comps = *ctx.components;
        if (announceOnce("mixing:mu:GrunbergNissan"))
            std::cout << "[mixing] liquid viscosity: Grunberg-Nissan, ln mu ="
                         " sum x_i ln mu_i + sum_{i<j} x_i x_j G_ij, G_ij(T, x)"
                         " = A + B/T + (C + D/T)(x_i - x_j) from each declared"
                         " pair (Poling 5ed eq. 9-13.1)\n";
        const std::size_t N = x.size();
        scalar xsum = 0.0;
        for (std::size_t k = 0; k < N; ++k) if (x[k] > 0.0) xsum += x[k];
        scalar lnmu = logMoleAverage(x, pure);
        //  Which present pairs have a declared G.
        for (std::size_t a = 0; a < N; ++a)
        {
            if (x[a] <= 0.0) continue;
            for (std::size_t b = a + 1; b < N; ++b)
            {
                if (x[b] <= 0.0) continue;
                const std::string& na = comps[a].name();
                const std::string& nb = comps[b].name();
                const Pair* hit = nullptr;
                bool swapped = false;
                for (const auto& q : pairs_)
                {
                    if (q.i == na && q.j == nb) { hit = &q; break; }
                    if (q.i == nb && q.j == na) { hit = &q; swapped = true; break; }
                }
                if (!hit)
                {
                    if (announceOnce("mixing:mu:GN:noPair:" + na + "-" + nb))
                        std::cout << "[mixing] liquid viscosity: no measured"
                                     " G_ij declared for " << na << "-" << nb
                                  << " -- that pair mixes with G = 0 (the"
                                     " logMoleAverage result for it)\n";
                    continue;
                }
                const std::size_t ii = swapped ? b : a, jj = swapped ? a : b;
                const scalar xi = x[ii] / xsum, xj = x[jj] / xsum;
                const scalar G = hit->A + hit->B / T
                               + (hit->C + hit->D / T) * (xi - xj);
                lnmu += xi * xj * G;
                if (announceOnce("mixing:mu:GN:pair:" + hit->i + "-" + hit->j))
                    std::cout << "[mixing] liquid viscosity: G(" << hit->i
                              << "," << hit->j << ") = " << hit->A << " + "
                              << hit->B << "/T + (" << hit->C << " + "
                              << hit->D << "/T)(x_" << hit->i << " - x_"
                              << hit->j << "), fitted " << hit->Tmin << "-"
                              << hit->Tmax << " K -- " << hit->source << "\n";
                if (T < hit->Tmin || T > hit->Tmax)
                    AdvisoryLog::instance().add(
                        "validity", "warning",
                        "pair '" + hit->i + "-" + hit->j + "'",
                        "Grunberg-Nissan G_ij evaluated at T = "
                        + std::to_string(T) + " K, OUTSIDE its fitted range ("
                        + std::to_string(hit->Tmin) + " "
                        + std::to_string(hit->Tmax)
                        + ") -- extrapolated, still returned");
            }
        }
        return std::exp(lnmu);                          // Pa s
    }

private:
    std::vector<Pair> pairs_;
};

} // anonymous namespace

std::map<std::string, LiquidViscosityMixingRule::Factory>&
LiquidViscosityMixingRule::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void LiquidViscosityMixingRule::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<LiquidViscosityMixingRule>
LiquidViscosityMixingRule::New(const DictPtr& dict)
{
    const std::string name = dict->lookupWordOrDefault("mixingRule", "GrunbergNissan");
    auto it = registry().find(name);
    if (it == registry().end())
    {
        std::string avail;
        for (const auto& kv : registry()) avail += " " + kv.first;
        throw std::runtime_error("LiquidViscosityMixingRule: unknown mixingRule '"
            + name + "'.  Registered:" + (avail.empty() ? " (none)" : avail));
    }
    return it->second(dict);
}

void LiquidViscosityMixingRule::registerBuiltins()
{
    registerType("logMoleAverage", [](const DictPtr& d) { return std::make_unique<LogMoleAverage>(d); });
    registerType("GrunbergNissan", [](const DictPtr& d) { return std::make_unique<GrunbergNissan>(d); });
}

std::vector<std::string> LiquidViscosityMixingRule::availableRules()
{
    std::vector<std::string> out;
    for (const auto& [k, _] : registry()) out.push_back(k);
    return out;
}

} // namespace Choupo
