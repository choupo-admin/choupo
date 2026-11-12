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

#include "LiquidConductivityMixingRule.H"
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

// ---- massFractionAverage ---------------------------------------------------
//  lambda_m = sum w_i lambda_i.  Silent, as it was before it had a name.
class MassFractionAverage : public LiquidConductivityMixingRule
{
public:
    explicit MassFractionAverage(const DictPtr&) {}

    const std::string& ruleName() const override
    { static const std::string s = "massFractionAverage"; return s; }
    const std::string& citation() const override
    {
        static const std::string s = "the arithmetic mass-fraction average;"
            " Poling 5ed sec. 10-12: mixtures conduct less than it predicts";
        return s;
    }
    const std::string& validityWindow() const override
    {
        static const std::string s = "components of similar conductivity;"
            " overestimates water + organic mixtures";
        return s;
    }

    scalar mix(scalar, const sVector& x, const sVector& pure,
               const LiquidMixingContext& ctx) const override
    {
        const std::vector<Component>& comps = *ctx.components;
        scalar Mbar = 0.0;
        for (std::size_t i = 0; i < x.size(); ++i)
            if (x[i] > 0.0) Mbar += x[i] * comps[i].MW();
        if (Mbar <= 0.0)
            throw std::runtime_error("ThermoPackage::thermalConductivityLiquid: empty composition");
        scalar k = 0.0;
        for (std::size_t i = 0; i < x.size(); ++i)
        {
            if (x[i] <= 0.0) continue;
            const scalar w = x[i] * comps[i].MW() / Mbar;
            k += w * pure[i];
        }
        return k;                                       // W/(m K)
    }
};

// ---- Filippov --------------------------------------------------------------
class Filippov : public LiquidConductivityMixingRule
{
public:
    explicit Filippov(const DictPtr&) {}

    const std::string& ruleName() const override
    { static const std::string s = "Filippov"; return s; }
    const std::string& citation() const override
    {
        static const std::string s = "Filippov, Vest. Mosk. Univ. Ser. Fiz."
            " Mat. Estestv. Nauk 10 (1955) 67; Poling 5ed eq. 10-12.1;"
            " Perry 9ed eq. 2-113";
        return s;
    }
    const std::string& validityWindow() const override
    {
        static const std::string s = "BINARY liquid mixtures; 4 to 8 %"
            " expected (Perry 9ed sec. 2)";
        return s;
    }

    scalar mix(scalar, const sVector& x, const sVector& pure,
               const LiquidMixingContext& ctx) const override
    {
        const std::vector<Component>& comps = *ctx.components;
        std::vector<std::size_t> P;
        for (std::size_t i = 0; i < x.size(); ++i) if (x[i] > 0.0) P.push_back(i);
        if (P.empty())
            throw std::runtime_error("ThermoPackage::thermalConductivityLiquid: empty composition");
        if (P.size() == 1) return pure[P[0]];
        if (P.size() > 2)
            throw std::runtime_error("liquid thermal conductivity: the"
                " Filippov rule is for BINARY mixtures (Poling 5ed eq."
                " 10-12.1: \"not suitable for multicomponent mixtures\"), and "
                + std::to_string(P.size()) + " components are present."
                "  Select `mixingRule Li;`, which takes any number.");
        if (announceOnce("mixing:lambda:Filippov"))
            std::cout << "[mixing] liquid thermal conductivity: Filippov,"
                         " lambda = w1 l1 + w2 l2 - 0.72 w1 w2 |l2 - l1|"
                         " (Poling 5ed eq. 10-12.1)\n";
        const std::size_t a = P[0], b = P[1];
        const scalar ma = x[a] * comps[a].MW(), mb = x[b] * comps[b].MW();
        const scalar wa = ma / (ma + mb), wb = mb / (ma + mb);
        return wa * pure[a] + wb * pure[b]
             - 0.72 * wa * wb * std::fabs(pure[b] - pure[a]);   // W/(m K)
    }
};

// ---- Li --------------------------------------------------------------------
class Li : public LiquidConductivityMixingRule
{
public:
    explicit Li(const DictPtr&) {}

    const std::string& ruleName() const override
    { static const std::string s = "Li"; return s; }
    const std::string& citation() const override
    {
        static const std::string s = "Li, AIChE J. 22 (1976) 927; Perry 9ed"
            " eq. 2-114";
        return s;
    }
    const std::string& validityWindow() const override
    {
        static const std::string s = "liquid mixtures of any number of"
            " components; 4 to 8 % expected (Perry 9ed sec. 2)";
        return s;
    }

    scalar mix(scalar T, const sVector& x, const sVector& pure,
               const LiquidMixingContext& ctx) const override
    {
        if (!ctx.molarVolume)
            throw std::runtime_error("liquid thermal conductivity (Li): the"
                " package offers no liquid molar volume for the volume"
                " fractions.");
        if (announceOnce("mixing:lambda:Li"))
            std::cout << "[mixing] liquid thermal conductivity: Li, lambda ="
                         " sum_i sum_j phi_i phi_j 2 l_i l_j/(l_i + l_j), phi"
                         " the volume fractions from the package's liquid"
                         " molar volumes (Li 1976; Perry 9ed eq. 2-114)\n";
        const std::size_t N = x.size();
        sVector phi(N, 0.0);
        scalar vsum = 0.0;
        for (std::size_t i = 0; i < N; ++i)
        {
            if (x[i] <= 0.0) continue;
            phi[i] = x[i] * ctx.molarVolume(i, T);
            vsum  += phi[i];
        }
        if (!(vsum > 0.0))
            throw std::runtime_error("ThermoPackage::thermalConductivityLiquid: empty composition");
        scalar k = 0.0;
        for (std::size_t i = 0; i < N; ++i)
        {
            if (x[i] <= 0.0) continue;
            for (std::size_t j = 0; j < N; ++j)
            {
                if (x[j] <= 0.0) continue;
                k += (phi[i] / vsum) * (phi[j] / vsum)
                   * 2.0 * pure[i] * pure[j] / (pure[i] + pure[j]);
            }
        }
        return k;                                       // W/(m K)
    }
};

} // anonymous namespace

std::map<std::string, LiquidConductivityMixingRule::Factory>&
LiquidConductivityMixingRule::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void LiquidConductivityMixingRule::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<LiquidConductivityMixingRule>
LiquidConductivityMixingRule::New(const DictPtr& dict)
{
    const std::string name = dict->lookupWordOrDefault("mixingRule", "Li");
    auto it = registry().find(name);
    if (it == registry().end())
    {
        std::string avail;
        for (const auto& kv : registry()) avail += " " + kv.first;
        throw std::runtime_error("LiquidConductivityMixingRule: unknown mixingRule '"
            + name + "'.  Registered:" + (avail.empty() ? " (none)" : avail));
    }
    return it->second(dict);
}

void LiquidConductivityMixingRule::registerBuiltins()
{
    registerType("massFractionAverage", [](const DictPtr& d) { return std::make_unique<MassFractionAverage>(d); });
    registerType("Filippov",            [](const DictPtr& d) { return std::make_unique<Filippov>(d); });
    registerType("Li",                  [](const DictPtr& d) { return std::make_unique<Li>(d); });
}

std::vector<std::string> LiquidConductivityMixingRule::availableRules()
{
    std::vector<std::string> out;
    for (const auto& [k, _] : registry()) out.push_back(k);
    return out;
}

} // namespace Choupo
