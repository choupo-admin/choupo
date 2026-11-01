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

#include "MembraneModuleRegistry.H"
#include "FeedSpacer.H"
#include "core/Advisory.H"
#include "core/Dictionary.H"
#include "core/RegistryRefusal.H"
#include "core/RegistryScan.H"
#include "thermo/RecordResolver.H"

#include <filesystem>
#include <iostream>
#include <map>
#include <set>
#include <stdexcept>

namespace Choupo {

namespace fs = std::filesystem;

namespace {

std::map<std::string, MembraneModule>& registry()
{
    static std::map<std::string, MembraneModule> r;
    return r;
}

//  The tier each registered name was last read from: "local" (data/local/
//  assets), "standards" (data/standards/assets) or "case" (constant/assets).
std::map<std::string, std::string>& tierMap()
{
    static std::map<std::string, std::string> t;
    return t;
}

} // anonymous namespace

void MembraneModuleRegistry::loadFrom(const std::string& dataRoot)
{
    //  The same two tiers as MembraneRegistry: the standards catalogue under
    //  its own guard, then every case-local constant/assets/ under one guard
    //  (a case record overrides the catalogue's by name, announced).  Only
    //  `kind membraneModule` is this registry's; every other kind is another
    //  reader's and is skipped.  A record with NO kind is refused by
    //  MembraneRegistry, which scans the same folder first -- one refusal.
    //
    //  THE FEED SPACERS RIDE THE SAME SCAN (C146, 2026-10-24): `kind
    //  feedSpacer` is the net an element is wound with, named by the element
    //  record (`feedSpacer <name>;`) or by a case, and read by this one scan
    //  into FeedSpacerRegistry -- so every binary that loads the modules
    //  loads their spacers, with no second call in any main.
    auto scan = [](const fs::path& dir, records::ScanGuard& guard,
                   records::ScanGuard& spacerGuard, const char* tier)
    {
        if (!fs::exists(dir)) return;
        for (auto& e : fs::directory_iterator(dir))
        {
            if (!e.is_regular_file()) continue;
            if (e.path().extension() != ".dat") continue;
            auto d = Dictionary::fromFile(e.path().string());
            const std::string kind = d->lookupWordOrDefault("kind", "");
            if (kind == "feedSpacer")
            {
                FeedSpacer s;
                s.readFromDict(d, e.path().string());
                spacerGuard.claim(s.name(), e.path().string());
                FeedSpacerRegistry::add(std::move(s));
                continue;
            }
            if (kind != "membraneModule" && kind != "membraneClass") continue;
            MembraneModule m;
            if (kind == "membraneClass")
                m.readClassFromDict(d, e.path().string());   // C189 slice 3
            else
                m.readFromDict(d, e.path().string());
            guard.claim(m.name(), e.path().string());
            const std::string nm = m.name();
            //  A higher tier replacing a lower one's name: a local record
            //  that a standards record takes the place of is SHADOWED, said.
            const auto prior = tierMap().find(nm);
            if (prior != tierMap().end() && prior->second == "local"
             && std::string(tier) == "standards")
                std::cerr << "[shadowed] membrane module '" << nm << "': a data/local/"
                             "assets record exists but the data/standards/ one is used"
                             " instead (standards beats local; local fills gaps).\n";
            tierMap()[nm] = tier;
            registry()[nm] = std::move(m);
        }
    };
    //  THE THREE TIERS, lowest precedence first (DEV.md 4c C189 slice 5, the
    //  data/local decision): data/local/assets/ (gitignored, the importer's
    //  home, bin/choupo-import-membranes) < data/standards/assets/ < the
    //  case's constant/assets/.  Components have read data/local since
    //  2026-07-13 with `standards beats local; local fills gaps`; a module
    //  record is the same kind of curated-or-not fact, and the importer
    //  writes ONLY there, so without this tier an imported catalogue was
    //  invisible until a human copied each record into every case.  Reading
    //  it costs a student nothing he did not already accept for components:
    //  a name that exists in both tiers takes the standards record
    //  ([shadowed], announced), and a local record that is USED is announced
    //  `[local] ... UNVERIFIED` by byName.  A sealed run passes no data root
    //  and so never reads this tier.
    tierMap().clear();
    if (!dataRoot.empty())
    {
        records::ScanGuard guard("MembraneModuleRegistry", "membrane module");
        records::ScanGuard sg("FeedSpacerRegistry", "feed spacer");
        scan(fs::path(dataRoot) / "local" / "assets", guard, sg, "local");
    }
    {
        records::ScanGuard guard("MembraneModuleRegistry", "membrane module");
        records::ScanGuard sg("FeedSpacerRegistry", "feed spacer");
        scan(fs::path(dataRoot) / "standards" / "assets", guard, sg, "standards");
    }
    {
        records::ScanGuard guard("MembraneModuleRegistry", "membrane module");
        records::ScanGuard sg("FeedSpacerRegistry", "feed spacer");
        for (const auto& d : records::localScanDirs("assets"))
            scan(d, guard, sg, "case");
    }
    //  A FUNCTIONAL CLASS names its element by reference (C189 slice 3):
    //  adopted here, after BOTH tiers are loaded, so the order of a directory
    //  scan and the tier the element lives in cannot matter.  An element no
    //  tier carries refuses through the one refusal sentence.
    for (auto& [nm, m] : registry())
    {
        if (!m.isFunctionalClass()) continue;
        const auto it = registry().find(m.element());
        if (it == registry().end())
            throw std::runtime_error("membrane class '" + nm + "' ("
                + m.sourcePath() + "): `element " + m.element() + ";` -- "
                + registryRefusal::message("membrane module", m.element(),
                                           registryRefusal::keysOf(registry())));
        m.adoptElement(it->second);
    }
}

const MembraneModule& MembraneModuleRegistry::byName(const std::string& name)
{
    auto it = registry().find(name);
    if (it == registry().end())
        throw std::runtime_error("MembraneModuleRegistry: "
            + registryRefusal::message("membrane module", name,
                                       registryRefusal::keysOf(registry())));
    if (tierMap()[name] == "local")
        if (AdvisoryLog::instance().addAnnouncedOnce("localModule:" + name,
                "provenance", "warning", "membrane module '" + name + "'",
                "read from data/local/ -- UNVERIFIED, not part of the curated"
                " catalogue"))
            std::cerr << "[local] membrane module '" << name << "': loaded from"
                         " data/local/ -- UNVERIFIED; a student must review the"
                         " record against its data sheet and promote it to"
                         " data/standards/ before the result is trusted.\n";
    return it->second;
}

std::string MembraneModuleRegistry::tierOf(const std::string& name)
{
    const auto it = tierMap().find(name);
    return it == tierMap().end() ? std::string() : it->second;
}

std::vector<std::string> MembraneModuleRegistry::availableNames()
{
    return registryRefusal::keysOf(registry());
}

} // namespace Choupo
