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

#include "Phase.H"
#include "LiquidPhase.H"
#include "SolidPhase.H"
#include "VaporPhase.H"

#include <stdexcept>

namespace Choupo {

std::map<std::string, Phase::Factory>& Phase::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void Phase::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<Phase> Phase::New(const DictPtr& dict,
    const std::vector<std::string>& names,
    const std::vector<Component>& comps)
{
    const std::string t = dict->lookupWord("type");
    auto it = registry().find(t);
    if (it == registry().end())
    {
        std::string avail;
        for (const auto& kv : registry()) avail += " " + kv.first;
        throw std::runtime_error("Phase::New: unknown type '" + t
            + "'.  Available:" + avail);
    }
    return it->second(dict, names, comps);
}

void Phase::registerBuiltins()
{
    registerType("vapor",
        [](const DictPtr& d, const std::vector<std::string>& names,
           const std::vector<Component>& comps) -> std::unique_ptr<Phase>
        { return std::make_unique<VaporPhase>(d, names, comps); });

    registerType("liquid",
        [](const DictPtr& d, const std::vector<std::string>& names,
           const std::vector<Component>& comps) -> std::unique_ptr<Phase>
        { return std::make_unique<LiquidPhase>(d, names, comps); });

    registerType("solid",
        [](const DictPtr& d, const std::vector<std::string>& names,
           const std::vector<Component>& comps) -> std::unique_ptr<Phase>
        { return std::make_unique<SolidPhase>(d, names, comps); });
}

} // namespace Choupo
