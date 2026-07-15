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

#include "SolutionRegistry.H"
#include "core/Dictionary.H"

#include <filesystem>
#include <map>
#include <stdexcept>

namespace Choupo {

namespace fs = std::filesystem;

namespace {

std::string key(const std::string& solute, const std::string& solvent)
{
    return solute + "-" + solvent;
}

std::map<std::string, SolutionPair>& registry()
{
    static std::map<std::string, SolutionPair> r;
    return r;
}

} // anonymous namespace

void SolutionRegistry::loadFrom(const std::string& dataRoot)
{
    fs::path dir = fs::path(dataRoot) / "standards" / "parameters" / "solution";
    if (!fs::exists(dir)) return;

    for (auto& e : fs::directory_iterator(dir))
    {
        if (!e.is_regular_file()) continue;
        if (e.path().extension() != ".dat") continue;
        auto d = Dictionary::fromFile(e.path().string());
        SolutionPair s;
        s.readFromDict(d);
        if (s.solute().empty() || s.solvent().empty())
            throw std::runtime_error("SolutionRegistry: file '"
                + e.path().string() + "' lacks `solute` or `solvent`");
        registry()[key(s.solute(), s.solvent())] = std::move(s);
    }
}

bool SolutionRegistry::has(const std::string& solute,
                           const std::string& solvent)
{
    return registry().count(key(solute, solvent)) > 0;
}

const SolutionPair& SolutionRegistry::byPair(const std::string& solute,
                                             const std::string& solvent)
{
    auto it = registry().find(key(solute, solvent));
    if (it == registry().end())
    {
        std::string avail;
        for (const auto& kv : registry()) avail += " " + kv.first;
        throw std::runtime_error("SolutionRegistry: no entry for solute '"
            + solute + "' in solvent '" + solvent + "'.  Loaded:"
            + (avail.empty() ? " (none)" : avail));
    }
    return it->second;
}

std::vector<std::string> SolutionRegistry::availableNames()
{
    std::vector<std::string> v;
    v.reserve(registry().size());
    for (const auto& kv : registry()) v.push_back(kv.first);
    return v;
}

} // namespace Choupo
