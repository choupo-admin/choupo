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

#include "MembraneRegistry.H"
#include "core/Dictionary.H"
#include "thermo/RecordResolver.H"

#include <filesystem>
#include <iostream>
#include <map>
#include <stdexcept>

namespace Choupo {

namespace fs = std::filesystem;

namespace {

std::map<std::string, Membrane>& registry()
{
    static std::map<std::string, Membrane> r;
    return r;
}

} // anonymous namespace

void MembraneRegistry::loadFrom(const std::string& dataRoot)
{
    // Migration 4: assets/ is the ONE flat home for physical kit; each record's
    // `kind` names its consumer.  This registry owns the solution-diffusion
    // membranes (kind RO | NF); every other kind (IEM, constructionMaterial,
    // adsorbent, ionExchangeResin) belongs to another reader -- skip, never
    // reject.  A record with NO kind in the shared folder is refused loudly.
    //
    // Sealing redesign: the case's MIRRORED constant/assets/ is the case-local
    // tier, scanned OVER the catalogue so the case record wins by name.  The
    // standards scan is fs::exists-guarded, so a SEALED case run with the
    // catalogue HIDDEN (empty dataRoot / relocated) reads its own constant/assets/
    // ALONE -- and the seal is proven complete by bin/choupo-import's
    // hidden-catalogue validation.
    auto scan = [](const fs::path& dir)
    {
        if (!fs::exists(dir)) return;
        for (auto& e : fs::directory_iterator(dir))
        {
            if (!e.is_regular_file()) continue;
            if (e.path().extension() != ".dat") continue;
            auto d = Dictionary::fromFile(e.path().string());
            const std::string kind = d->lookupWordOrDefault("kind", "");
            if (kind.empty())
                throw std::runtime_error("MembraneRegistry: asset '"
                    + e.path().string() + "' has no `kind` -- every record in the"
                    " shared assets/ home must declare its consumer (RO | NF | IEM"
                    " | constructionMaterial | adsorbent | ionExchangeResin)");
            if (kind != "RO" && kind != "NF") continue;
            Membrane m;
            m.readFromDict(d);
            if (m.name().empty())
                throw std::runtime_error("MembraneRegistry: file '"
                    + e.path().string() + "' has no `name` entry");
            registry()[m.name()] = std::move(m);
        }
    };
    scan(fs::path(dataRoot) / "standards" / "assets");
    bool legacy = false;
    const fs::path local = records::localScanDir("assets", legacy);
    if (!local.empty()) scan(local);
}

const Membrane& MembraneRegistry::byName(const std::string& name)
{
    // ONE home (Codex assets-audit 2026-07-18): a case-specific membrane is a
    // manifest-owned record in constant/assets/ (loadFrom scanned it OVER the
    // catalogue).  The legacy constant/membranes/ overlay leg is retired -- it
    // let a SEALED case open physical input its propertyManifest did not claim
    // (the assets/ vs membranes/ split with different per-ion B_s).
    auto it = registry().find(name);
    if (it == registry().end())
    {
        std::string avail;
        for (const auto& kv : registry()) avail += " " + kv.first;
        throw std::runtime_error("MembraneRegistry: unknown membrane '"
            + name + "'.  Loaded:" + (avail.empty() ? " (none)" : avail));
    }
    return it->second;
}

std::vector<std::string> MembraneRegistry::availableNames()
{
    std::vector<std::string> v;
    v.reserve(registry().size());
    for (const auto& kv : registry()) v.push_back(kv.first);
    return v;
}

} // namespace Choupo
