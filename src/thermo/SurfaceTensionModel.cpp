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

#include "SurfaceTensionModel.H"
#include "transport/BrockBird.H"
#include "transport/StoredCorrelation.H"
#include "transport/SurfaceTensionMixingRule.H"

#include "thermo/RecordLaws.H"

#include <map>
#include <memory>
#include <stdexcept>

namespace Choupo {

std::map<std::string, SurfaceTensionModel::Factory>&
SurfaceTensionModel::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void SurfaceTensionModel::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<SurfaceTensionModel>
SurfaceTensionModel::New(const DictPtr& dict)
{
    if (!dict->found("model"))
        throw std::runtime_error("surface tension: the block names no `model` -- the factory"
            " default (StoredCorrelation) was removed (DEV.md 4c C398, review row SL-04): a"
            " property block that names no model is either a liquid property"
            " block read per constituent from the records, or refused.  Write"
            " `model <word>;` -- registered:" + []
            {
                std::string s;
                for (const auto& kv : registry()) s += " " + kv.first;
                return s;
            }());
    const std::string name = dict->lookupWord("model");
    auto it = registry().find(name);
    if (it == registry().end())
    {
        std::string avail;
        for (const auto& kv : registry()) avail += " " + kv.first;
        throw std::runtime_error("SurfaceTensionModel: unknown model '" + name
            + "'.  Registered:" + (avail.empty() ? " (none)" : avail));
    }
    return it->second(dict);
}

void SurfaceTensionModel::registerBuiltins()
{
    //  U3 (C398): each type's form and coefficient units, in ONE place.
    recordLaws::declareForm("surfaceTension", "tauPower",
        "sigma/(N/m) = A tau^n + B tau^(n+1), tau = 1 - T/Tc with the block's own Tc in K;"
        " A and B in N/m, n dimensionless");
    for (const char* w : { "StoredCorrelation", "storedCorrelation" })
        recordLaws::declareForm("surfaceTension", w,
            "the record's tauPower law, else Brock-Bird for that component, announced");
    for (const char* w : { "BrockBird", "brockBird", "brockbird" })
        recordLaws::declareForm("surfaceTension", w,
            "PREDICTIVE: Brock-Bird corresponding states from Tc, Pc, Tb (Poling et al.,"
            " eq. 12-3.5); no record law");
    //  THE RECORD'S STORED FORM AS A LAW TYPE (C398 slice (b)): a bare
    //  surfaceTension block, or a named law of a block of several, is a law of
    //  type `tauPower`.  Unlike the legacy word StoredCorrelation it has no
    //  Brock-Bird fallback: a record without the block is refused by name.
    registerType("tauPower", [](const DictPtr& d) { return std::make_unique<StoredCorrelation>(d, false); });
    registerType("BrockBird", [](const DictPtr& d) { return std::make_unique<BrockBird>(d); });
    registerType("brockBird", [](const DictPtr& d) { return std::make_unique<BrockBird>(d); });
    registerType("brockbird", [](const DictPtr& d) { return std::make_unique<BrockBird>(d); });
    registerType("StoredCorrelation", [](const DictPtr& d) { return std::make_unique<StoredCorrelation>(d); });
    registerType("storedCorrelation", [](const DictPtr& d) { return std::make_unique<StoredCorrelation>(d); });
    //  The mixing rules of the same property (C331), registered with it:
    //  a package that reads this model also reads its `mixingRule`.
    SurfaceTensionMixingRule::registerBuiltins();
}

std::vector<std::string> SurfaceTensionModel::availableModels()
{
    std::vector<std::string> out;
    for (const auto& [k, _] : registry()) out.push_back(k);
    return out;
}

bool SurfaceTensionModel::hasModel(const std::string& name)
{
    return registry().count(name) > 0;
}

} // namespace Choupo
