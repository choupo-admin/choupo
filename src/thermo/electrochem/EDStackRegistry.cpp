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
Class
    Choupo::EDStackRegistry

Description
    Implementation.  See EDStackRegistry.H.
\*---------------------------------------------------------------------------*/

#include "EDStackRegistry.H"
#include "core/Dictionary.H"
#include "core/RegistryRefusal.H"
#include "core/RegistryScan.H"
#include "thermo/RecordResolver.H"

#include <filesystem>
#include <map>
#include <stdexcept>

namespace Choupo {

namespace fs = std::filesystem;

namespace {

std::map<std::string, EDStack>& registry()
{
    static std::map<std::string, EDStack> r;
    return r;
}

} // anonymous namespace

void EDStackRegistry::loadFrom(const std::string& dataRoot)
{
    //  The same two tiers as MembraneModuleRegistry: the standards catalogue
    //  under its own guard, then every case-local constant/assets/ under one
    //  guard (a case record overrides the catalogue's by name, announced).
    //  Only `kind edStack` is this registry's; every other kind is another
    //  reader's and is skipped.
    auto scan = [](const fs::path& dir, records::ScanGuard& guard)
    {
        if (!fs::exists(dir)) return;
        for (auto& e : fs::directory_iterator(dir))
        {
            if (!e.is_regular_file()) continue;
            if (e.path().extension() != ".dat") continue;
            auto d = Dictionary::fromFile(e.path().string());
            if (d->lookupWordOrDefault("kind", "") != "edStack") continue;
            EDStack s;
            s.readFromDict(d, e.path().string());
            guard.claim(s.name(), e.path().string());
            registry()[s.name()] = std::move(s);
        }
    };
    {
        records::ScanGuard guard("EDStackRegistry", "electrodialysis stack");
        scan(fs::path(dataRoot) / "standards" / "assets", guard);
    }
    {
        records::ScanGuard guard("EDStackRegistry", "electrodialysis stack");
        for (const auto& d : records::localScanDirs("assets")) scan(d, guard);
    }
}

const EDStack& EDStackRegistry::byName(const std::string& name)
{
    auto it = registry().find(name);
    if (it == registry().end())
        throw std::runtime_error("EDStackRegistry: "
            + registryRefusal::message("electrodialysis stack", name,
                                       registryRefusal::keysOf(registry())));
    return it->second;
}

std::vector<std::string> EDStackRegistry::availableNames()
{
    return registryRefusal::keysOf(registry());
}

} // namespace Choupo
