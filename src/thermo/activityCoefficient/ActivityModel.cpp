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

#include "ActivityModel.H"
#include "IdealSolution.H"
#include "NRTL.H"
#include "UNIFAC.H"
#include "UNIQUAC.H"
#include "Wilson.H"
#include "ElectrolyteActivity.H"
#include "thermo/Component.H"

#include <stdexcept>

namespace Choupo {

std::map<std::string, ActivityModel::Factory>& ActivityModel::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void ActivityModel::registerModel(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<ActivityModel>
ActivityModel::New(const DictPtr& dict,
                     const std::vector<Component>& components)
{
    const std::string modelName = dict->lookupWord("model");
    auto it = registry().find(modelName);
    if (it == registry().end())
        throw std::runtime_error("Unknown activity model '" + modelName + "'");
    return it->second(dict, components);
}

// Component LABELS from the resolved components -- for the name-only models that
// need only labels for their pair lookups (NRTL/UNIFAC/UNIQUAC).  Models that
// need component DATA (Wilson's Vliq, the salt's electrolyte{}) take the whole
// vector and self-configure in their constructors -- no post-construction dance.
static std::vector<std::string> namesOf(const std::vector<Component>& comps)
{
    std::vector<std::string> ns; ns.reserve(comps.size());
    for (const auto& c : comps) ns.push_back(c.name());
    return ns;
}

void ActivityModel::registerBuiltins()
{
    registerModel("ideal",
        [](const DictPtr&, const std::vector<Component>& comps)
            -> std::unique_ptr<ActivityModel>
        { return std::make_unique<IdealSolution>(comps.size()); });

    registerModel("NRTL",
        [](const DictPtr& d, const std::vector<Component>& comps)
            -> std::unique_ptr<ActivityModel>
        { return std::make_unique<NRTL>(d, namesOf(comps)); });

    registerModel("Wilson",
        [](const DictPtr& d, const std::vector<Component>& comps)
            -> std::unique_ptr<ActivityModel>
        { return std::make_unique<Wilson>(d, comps); });   // self-sets molar volumes

    // Electrolyte activity (pitzer / eNRTL) is NO LONGER an activityModel option:
    // an electrolyte case SELECTS a propertyPackage and the ThermoPackageBuilder
    // assembles the ElectrolyteActivity directly (the legacy configure()/(comps,model)
    // ctor path was retired 2026-06-30).  A thermoPackage `activityModel { model
    // pitzer; }` now fails loudly at ActivityModel::New -- which is correct.

    registerModel("UNIFAC",
        [](const DictPtr& d, const std::vector<Component>& comps)
            -> std::unique_ptr<ActivityModel>
        { return std::make_unique<UNIFAC>(d, namesOf(comps)); });

    registerModel("UNIQUAC",
        [](const DictPtr& d, const std::vector<Component>& comps)
            -> std::unique_ptr<ActivityModel>
        { return std::make_unique<UNIQUAC>(d, namesOf(comps)); });
}

} // namespace Choupo
