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

#include "MaterialRegistry.H"
#include "core/Dictionary.H"
#include "thermo/RecordResolver.H"

#include <filesystem>
#include <map>
#include <stdexcept>

namespace Choupo {

namespace fs = std::filesystem;

namespace {

std::map<std::string, Material>& registry()
{
    static std::map<std::string, Material> r;
    return r;
}

Material readMaterialFile(const fs::path& file)
{
    auto d = Dictionary::fromFile(file.string());
    Material m;
    m.name    = d->lookupWordOrDefault("name", file.stem().string());
    m.density = d->lookupScalar("density");
    m.F_M     = d->lookupScalarOrDefault("F_M",     1.0);
    m.sigma_y = d->lookupScalarOrDefault("sigma_y", 0.0);
    m.maxT    = d->lookupScalarOrDefault("maxT",    0.0);
    m.maxP    = d->lookupScalarOrDefault("maxP",    0.0);
    m.thermalConductivity =
        d->lookupScalarOrDefault("thermalConductivity", 0.0);
    return m;
}

} // anonymous namespace

void MaterialRegistry::loadFrom(const std::string& dataRoot)
{
    // Construction materials live in the flat data/standards/assets/ home
    // (Migration 4), filtered by `kind constructionMaterial`.  Sealing redesign:
    // the case's MIRRORED constant/assets/ is the case-local tier, scanned OVER
    // the catalogue so the case record wins by name.  The standards scan is
    // fs::exists-guarded, so a SEALED case run with the catalogue HIDDEN (empty
    // dataRoot / relocated) reads its own constant/assets/ ALONE -- and the seal
    // is proven complete by bin/choupo-import's hidden-catalogue validation.
    auto scan = [](const fs::path& dir)
    {
        if (!fs::exists(dir)) return;
        for (auto& e : fs::directory_iterator(dir))
        {
            if (!e.is_regular_file()) continue;
            if (e.path().extension() != ".dat") continue;
            auto d = Dictionary::fromFile(e.path().string());
            if (d->lookupWordOrDefault("kind", "") != "constructionMaterial")
                continue;
            Material m = readMaterialFile(e.path());
            registry()[m.name] = m;
        }
    };
    scan(fs::path(dataRoot) / "standards" / "assets");
    bool legacy = false;
    const fs::path local = records::localScanDir("assets", legacy);
    if (!local.empty()) scan(local);
}

const Material& MaterialRegistry::byName(const std::string& name)
{
    auto it = registry().find(name);
    if (it == registry().end())
    {
        std::string avail;
        for (const auto& kv : registry()) avail += " " + kv.first;
        throw std::runtime_error("MaterialRegistry: unknown material '"
            + name + "'.  Loaded:" + (avail.empty() ? " (none)" : avail));
    }
    return it->second;
}

std::vector<std::string> MaterialRegistry::availableNames()
{
    std::vector<std::string> v;
    v.reserve(registry().size());
    for (const auto& kv : registry()) v.push_back(kv.first);
    return v;
}

} // namespace Choupo
