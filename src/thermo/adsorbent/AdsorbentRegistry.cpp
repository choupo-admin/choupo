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

    fs::path dir = fs::path(dataRoot) / "standards" / "adsorbents";
    if (!fs::exists(dir)) return;

    for (auto& e : fs::directory_iterator(dir))
    {
        if (!e.is_regular_file()) continue;
        if (e.path().extension() != ".dat") continue;
        Adsorbent a;
        a.readIdentity(Dictionary::fromFile(e.path().string()),
                       e.path().string());
        attachEquilibria(a, eqRoot / a.name());
        registry()[a.name()] = std::move(a);
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

        fs::path p = fs::current_path();
        for (int up = 0; up < 6; ++up)
        {
            const fs::path cand = p / "constant" / "adsorbents" / (name + ".dat");
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
            if (!p.has_parent_path()) break;
            p = p.parent_path();
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
