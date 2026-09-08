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

#include "AdsorbentRegistry.H"

#include "IsothermModel.H"
#include "core/Dictionary.H"
#include "core/RegistryScan.H"
#include "thermo/RecordResolver.H"

#include <filesystem>
#include <iostream>
#include <map>
#include <stdexcept>

namespace Choupo {

namespace fs = std::filesystem;

namespace {

std::map<std::string, Adsorbent>& registry()
{
    static std::map<std::string, Adsorbent> r;
    return r;
}

// Standards equilibria catalogue root, remembered by loadFrom so the
// case-local overlay in byName can fall back to it (announced).
std::string& standardsEquilibriaDir()
{
    static std::string d;
    return d;
}

// Attach every parameters/adsorption/equilibria/<name>/*.dat record to `a`.
void attachEquilibria(Adsorbent& a, const fs::path& dir)
{
    if (!fs::exists(dir)) return;
    for (auto& e : fs::directory_iterator(dir))
    {
        if (!e.is_regular_file()) continue;
        if (e.path().extension() != ".dat") continue;
        const std::string src = e.path().string();
        a.attachIsotherm(IsothermModel::New(Dictionary::fromFile(src), src),
                         src);
    }
}

} // anonymous namespace

void AdsorbentRegistry::loadFrom(const std::string& dataRoot)
{
    // Explicit builtin registration --- here, where the registry initialises,
    // never a static initialiser (the Choupo factory doctrine).
    IsothermModel::registerBuiltins();

    const fs::path eqRoot =
        fs::path(dataRoot) / "standards" / "parameters" / "adsorption"
                           / "equilibria";
    standardsEquilibriaDir() = eqRoot.string();

    // Adsorbent identities live in the flat data/standards/assets/ home
    // (Migration 4), filtered by `kind adsorbent`.  Sealing redesign: the case's
    // MIRRORED constant/assets/ is the case-local tier, scanned OVER the
    // catalogue so the case record wins by name; the standards scan is
    // fs::exists-guarded, so a SEALED case run with the catalogue HIDDEN reads
    // its own constant/assets/ ALONE.  Each adsorbent's per-species equilibria
    // come from the nearest case-local
    // constant/parameters/adsorption/equilibria/<name>/ (walking up), else the
    // standards catalogue -- absent when hidden, so a sealed case's equilibria
    // must be mirrored (bin/choupo-import's hidden validation proves it).
    const fs::path eqStd = fs::path(dataRoot) / "standards" / "parameters"
                         / "adsorption" / "equilibria";
    auto scan = [&](const fs::path& dir, records::ScanGuard& guard)
    {
        if (!fs::exists(dir)) return;
        for (auto& e : fs::directory_iterator(dir))
        {
            if (!e.is_regular_file()) continue;
            if (e.path().extension() != ".dat") continue;
            auto rec = Dictionary::fromFile(e.path().string());
            if (rec->lookupWordOrDefault("kind", "") != "adsorbent") continue;
            Adsorbent a;
            a.readIdentity(rec, e.path().string());
            fs::path eqDir = records::localRecord(
                "parameters/adsorption/equilibria/" + a.name());
            if (eqDir.empty()) eqDir = eqStd / a.name();
            attachEquilibria(a, eqDir);           // fs::exists-guarded inside
            guard.claim(a.name(), e.path().string());
            registry()[a.name()] = std::move(a);
        }
    };
    {
        records::ScanGuard guard("AdsorbentRegistry", "adsorbent");
        scan(fs::path(dataRoot) / "standards" / "assets", guard);
    }
    {
        //  ONE guard over EVERY case-local directory (2026-09-08): the
        //  nearest one walking up AND each `constant/assets` a level of this
        //  case's own geography carries.  A name is a record's identity
        //  across the whole case, so two sectors claiming it REFUSE naming
        //  both files -- they are the same tier and there is no defensible
        //  winner.  The standards scan above is a different tier and keeps
        //  its own guard, so a case-local record still overrides it, aloud.
        records::ScanGuard guard("AdsorbentRegistry", "adsorbent");
        for (const auto& d : records::localScanDirs("assets")) scan(d, guard);
    }
}

const Adsorbent& AdsorbentRegistry::byName(const std::string& name)
{
    // Case-local overlay: the NEAREST constant/adsorbents/<name>.dat walking
    // UP from the cwd ECLIPSES the standard entry whole --- the same fractal
    // cascade as membranes / components, announced loudly (no silent crutch):
    // an adsorbent is curated data the case may legitimately carry.  Its
    // isotherms come from the case-local
    // constant/parameters/adsorption/equilibria/<name>/ when present, else
    // from the standards catalogue (announced either way).
    {
        static std::map<std::string, Adsorbent> caseRegistry;
        auto cit = caseRegistry.find(name);
        if (cit != caseRegistry.end()) return cit->second;

        //  The LEGACY per-name home, `constant/adsorbents/<name>.dat`, read
        //  through the SAME one home as the flat `assets/` scan (2026-09-08)
        //  so both spellings reach a record at EVERY level of a sectored
        //  case.  Before this it walked only UP from the run directory, so a
        //  dryer's sieve declared in `PURIFICATION/constant/adsorbents/`
        //  was invisible while the identical record in `assets/` was found:
        //  one home reachable, its twin not, with nothing said.
        for (const fs::path& dir : records::localScanDirs("adsorbents"))
        {
            const fs::path p = dir.parent_path().parent_path();  // the LEVEL
            const fs::path cand = dir / (name + ".dat");
            if (fs::exists(cand))
            {
                IsothermModel::registerBuiltins();   // explicit, idempotent
                Adsorbent a;
                a.readIdentity(Dictionary::fromFile(cand.string()),
                               cand.string());
                const fs::path localEq = p / "constant" / "parameters"
                    / "adsorption" / "equilibria" / a.name();
                if (fs::exists(localEq))
                {
                    attachEquilibria(a, localEq);
                    std::cerr << "[overlay] adsorbent '" << name
                              << "' from case-local " << cand.string()
                              << " + equilibria " << localEq.string() << "\n";
                }
                else
                {
                    attachEquilibria(a, fs::path(standardsEquilibriaDir())
                                        / a.name());
                    std::cerr << "[overlay] adsorbent '" << name
                              << "' from case-local " << cand.string()
                              << " (isotherms from the standards catalogue)\n";
                }
                return caseRegistry.emplace(name, std::move(a)).first->second;
            }
        }
    }

    auto it = registry().find(name);
    if (it == registry().end())
    {
        std::string avail;
        for (const auto& kv : registry()) avail += " " + kv.first;
        throw std::runtime_error("AdsorbentRegistry: unknown adsorbent '"
            + name + "'.  Loaded:" + (avail.empty() ? " (none)" : avail));
    }
    return it->second;
}

std::vector<std::string> AdsorbentRegistry::availableNames()
{
    std::vector<std::string> v;
    v.reserve(registry().size());
    for (const auto& kv : registry()) v.push_back(kv.first);
    return v;
}

} // namespace Choupo
