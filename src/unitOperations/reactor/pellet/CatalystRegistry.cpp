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

#include "CatalystRegistry.H"

#include "core/Dictionary.H"
#include "core/RegistryScan.H"
#include "thermo/RecordResolver.H"

#include <filesystem>
#include <map>
#include <stdexcept>

namespace Choupo {

namespace fs = std::filesystem;

namespace {

std::map<std::string, Catalyst>& registry()
{
    static std::map<std::string, Catalyst> r;
    return r;
}

} // anonymous namespace

void CatalystRegistry::loadFrom(const std::string& dataRoot)
{
    auto scan = [&](const fs::path& dir)
    {
        if (!fs::exists(dir)) return;
        records::ScanGuard guard("CatalystRegistry", "catalyst");
        for (auto& e : fs::directory_iterator(dir))
        {
            if (!e.is_regular_file()) continue;
            if (e.path().extension() != ".dat") continue;
            auto rec = Dictionary::fromFile(e.path().string());
            if (rec->lookupWordOrDefault("kind", "") != "catalyst") continue;
            Catalyst c;
            c.readIdentity(rec, e.path().string());
            guard.claim(c.name(), e.path().string());
            registry()[c.name()] = std::move(c);
        }
    };

    //  The standards scan is fs::exists-guarded, so a SEALED case run with the
    //  catalogue hidden reads its own constant/assets/ alone -- the same
    //  posture as AdsorbentRegistry.
    scan(fs::path(dataRoot) / "standards" / "assets");
    bool legacy = false;
    const fs::path local = records::localScanDir("assets", legacy);
    if (!local.empty()) scan(local);
}

const Catalyst& CatalystRegistry::byName(const std::string& name)
{
    auto it = registry().find(name);
    if (it == registry().end())
    {
        std::string avail;
        for (const auto& kv : registry()) avail += " " + kv.first;
        throw std::runtime_error("CatalystRegistry: unknown catalyst '" + name
            + "'.  Loaded:" + (avail.empty()
                ? " (none -- no `kind catalyst;` record was found in"
                  " data/standards/assets/ or in the case's constant/assets/."
                  "  The standards catalogue ships no catalyst pellet yet, so"
                  " a case declares its own: add"
                  " constant/assets/<name>.dat carrying `kind catalyst;` and a"
                  " catalyst{} block with geometry, its characteristic"
                  " dimension, epsilon_p and tau.)"
                : avail));
    }
    return it->second;
}

std::vector<std::string> CatalystRegistry::availableNames()
{
    std::vector<std::string> v;
    v.reserve(registry().size());
    for (const auto& kv : registry()) v.push_back(kv.first);
    return v;
}

} // namespace Choupo
