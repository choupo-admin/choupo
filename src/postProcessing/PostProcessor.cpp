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

#include "PostProcessor.H"
#include "CostingPass.H"
#include "SizingPass.H"
#include "costing/CostingModel.H"
#include "sizing/EquipmentSize.H"

#include <stdexcept>

namespace Choupo {

std::map<std::string, PostProcessor::Factory>& PostProcessor::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void PostProcessor::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<PostProcessor>
PostProcessor::New(const std::string& type, const DictPtr& params)
{
    auto it = registry().find(type);
    if (it == registry().end())
    {
        std::string avail;
        for (const auto& kv : registry()) avail += " " + kv.first;
        throw std::runtime_error("PostProcessor::New: unknown type '" + type
            + "'.  Registered:" + (avail.empty() ? " (none yet)" : avail));
    }
    return it->second(params);
}

std::vector<std::string> PostProcessor::availableTypes()
{
    std::vector<std::string> v;
    v.reserve(registry().size());
    for (const auto& kv : registry()) v.push_back(kv.first);
    return v;
}

std::vector<std::unique_ptr<PostProcessor>>
PostProcessor::buildChain(const DictPtr& postDict)
{
    std::vector<std::unique_ptr<PostProcessor>> chain;
    for (const auto& key : postDict->keys())
    {
        // Each top-level entry of postDict is the *type* of a pass; the
        // associated sub-dict is the pass-specific configuration.
        auto sub = postDict->subDict(key);
        chain.push_back(PostProcessor::New(key, sub));
    }
    return chain;
}

void PostProcessor::registerBuiltins()
{
    // Sizing- and costing-related dependencies live in their own
    // factory tables; ensure those are populated too.
    EquipmentSize::registerBuiltins();
    CostingModel ::registerBuiltins();

    registerType("sizing",
        [](const DictPtr& d) -> std::unique_ptr<PostProcessor>
        { return std::make_unique<SizingPass>(d); });

    registerType("costing",
        [](const DictPtr& d) -> std::unique_ptr<PostProcessor>
        { return std::make_unique<CostingPass>(d); });
}

} // namespace Choupo
