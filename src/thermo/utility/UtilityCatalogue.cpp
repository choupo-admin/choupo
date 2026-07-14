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

#include "UtilityCatalogue.H"
#include "core/Dictionary.H"

#include <filesystem>
#include <limits>
#include <map>
#include <stdexcept>

namespace Choupo {

namespace fs = std::filesystem;

namespace {

std::map<std::string, Utility>& registry()
{
    static std::map<std::string, Utility> r;
    return r;
}

Utility readUtilityFile(const fs::path& file)
{
    auto d = Dictionary::fromFile(file.string());
    Utility u;
    u.name       = d->lookupWordOrDefault("utility", file.stem().string());
    u.tier       = d->lookupWordOrDefault("tier", "heating");
    u.mechanism  = d->lookupWordOrDefault("mechanism", "sensible");

    if (u.tier != "heating" && u.tier != "cooling" && u.tier != "power")
        throw std::runtime_error("Utility '" + u.name +
            "': tier must be 'heating', 'cooling' or 'power', got '" + u.tier + "'");
    if (u.mechanism != "condensation"
     && u.mechanism != "sensible"
     && u.mechanism != "evaporation"
     && u.mechanism != "electrical")
        throw std::runtime_error("Utility '" + u.name +
            "': mechanism must be 'condensation', 'sensible', 'evaporation' or "
            "'electrical', got '" + u.mechanism + "'");

    if (d->found("components"))
        u.componentsList = d->lookupWordList("components");

    u.state = d->lookupWordOrDefault("state", "liquid");

    u.P     = d->lookupScalarOrDefault("P",     0.0);
    u.T_in  = d->lookupScalarOrDefault("T_in",  0.0);
    u.T_out = d->lookupScalarOrDefault("T_out", 0.0);

    u.dutyPerKg = d->lookupScalarOrDefault("dutyPerKg", 0.0);
    u.cost      = d->lookupScalarOrDefault("cost",     0.0);
    u.costYear  = static_cast<int>(d->lookupScalarOrDefault("costYear", 0.0));
    u.driveEfficiency = d->lookupScalarOrDefault("driveEfficiency", 1.0);

    u.description = d->lookupWordOrDefault("description", "");
    return u;
}

} // anonymous namespace

void UtilityCatalogue::loadFrom(const std::string& dataRoot)
{
    fs::path dir = fs::path(dataRoot) / "standards" / "utilities";
    if (!fs::exists(dir)) return;

    for (auto& e : fs::directory_iterator(dir))
    {
        if (!e.is_regular_file()) continue;
        if (e.path().extension() != ".dat") continue;
        Utility u = readUtilityFile(e.path());
        registry()[u.name] = u;
    }
}

const Utility& UtilityCatalogue::byName(const std::string& name)
{
    auto it = registry().find(name);
    if (it == registry().end())
    {
        std::string avail;
        for (const auto& kv : registry()) avail += " " + kv.first;
        throw std::runtime_error("UtilityCatalogue: unknown utility '"
            + name + "'.  Loaded:" + (avail.empty() ? " (none)" : avail));
    }
    return it->second;
}

bool UtilityCatalogue::has(const std::string& name)
{
    return registry().find(name) != registry().end();
}

std::vector<std::string> UtilityCatalogue::availableNames()
{
    std::vector<std::string> v;
    v.reserve(registry().size());
    for (const auto& kv : registry()) v.push_back(kv.first);
    return v;
}

const Utility* UtilityCatalogue::pickForDuty(bool heating, scalar T,
                                             scalar dTmin)
{
    const Utility* best = nullptr;
    scalar bestMargin = std::numeric_limits<scalar>::infinity();
    for (const auto& name : availableNames())
    {
        const Utility& u = byName(name);
        if (heating && u.tier != "heating") continue;
        if (!heating && u.tier != "cooling") continue;
        if (u.dutyPerKg <= 0.0) continue;
        scalar margin;
        if (heating) { if (u.T_in < T + dTmin) continue; margin = u.T_in - T; }
        else         { if (u.T_in > T - dTmin) continue; margin = T - u.T_in; }
        if (margin < bestMargin) { bestMargin = margin; best = &u; }
    }
    return best;
}

} // namespace Choupo
