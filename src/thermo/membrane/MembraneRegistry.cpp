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
    fs::path dir = fs::path(dataRoot) / "standards" / "assets";
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
}

const Membrane& MembraneRegistry::byName(const std::string& name)
{
    // Case-local overlay: the NEAREST `constant/membranes/<name>.dat` walking
    // UP from the cwd ECLIPSES the standard entry whole -- the same fractal
    // cascade as components / electrolyte catalogues, and announced loudly
    // (no silent crutch): a membrane is sample-specific data the case may
    // legitimately carry (a self-contained case ships its own element).
    {
        static std::map<std::string, Membrane> caseRegistry;
        auto cit = caseRegistry.find(name);
        if (cit != caseRegistry.end()) return cit->second;

        fs::path p = fs::current_path();
        for (int up = 0; up < 6; ++up)
        {
            const fs::path cand = p / "constant" / "membranes" / (name + ".dat");
            if (fs::exists(cand))
            {
                Membrane m;
                m.readFromDict(Dictionary::fromFile(cand.string()));
                std::cerr << "[overlay] membrane '" << name
                          << "' from case-local " << cand.string() << "\n";
                return caseRegistry.emplace(name, std::move(m)).first->second;
            }
            if (!p.has_parent_path()) break;
            p = p.parent_path();
        }
    }

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
