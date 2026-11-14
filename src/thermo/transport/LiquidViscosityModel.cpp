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

#include "LiquidViscosityModel.H"
#include "Andrade.H"
#include "ChemSepVisc101.H"
#include "Vogel.H"
#include "LiquidViscosityMixingRule.H"

#include "thermo/RecordLaws.H"

#include <map>
#include <memory>
#include <stdexcept>

namespace Choupo {

std::map<std::string, LiquidViscosityModel::Factory>& LiquidViscosityModel::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void LiquidViscosityModel::registerModel(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<LiquidViscosityModel> LiquidViscosityModel::New(const DictPtr& dict)
{
    if (!dict->found("model"))
        throw std::runtime_error("liquid viscosity: the block names no `model` -- the factory"
            " default (Andrade) was removed (DEV.md 4c C398, review row SL-04): a"
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
        throw std::runtime_error("LiquidViscosityModel: unknown model '" + name
            + "'.  Registered:" + (avail.empty() ? " (none)" : avail));
    }
    return it->second(dict);
}

void LiquidViscosityModel::registerBuiltins()
{
    //  U3 (C398): each type's form and coefficient units, in ONE place.
    for (const char* w : { "Andrade", "andrade" })
        recordLaws::declareForm("liquidViscosity", w, "ln(mu/(Pa s)) = A + B/(T/K); A dimensionless, B in K");
    for (const char* w : { "Vogel", "vogel" })
        recordLaws::declareForm("liquidViscosity", w, "ln(mu/(Pa s)) = A + B/(T/K - C); A dimensionless, B and C in K");
    recordLaws::declareForm("liquidViscosity", "chemsepEq101",
        "ln(mu/(Pa s)) = A + B/(T/K) + C ln(T/K) + D (T/K)^E; A, C, E dimensionless, B in K,"
        " D in K^-E");
    //  The DIPPR/ChemSep form 414 imported records state their
    //  viscosity in -- five parameters where Andrade has two.
    registerModel("chemsepEq101", [](const DictPtr& d) { return std::make_unique<ChemSepVisc101>(d); });
    registerModel("Andrade", [](const DictPtr& d) { return std::make_unique<Andrade>(d); });
    registerModel("andrade", [](const DictPtr& d) { return std::make_unique<Andrade>(d); });
    registerModel("Vogel",   [](const DictPtr& d) { return std::make_unique<Vogel>(d); });
    registerModel("vogel",   [](const DictPtr& d) { return std::make_unique<Vogel>(d); });
    //  The mixing rules of the same property (C331), registered with it:
    //  a package that reads this model also reads its `mixingRule`.
    LiquidViscosityMixingRule::registerBuiltins();
}

std::vector<std::string> LiquidViscosityModel::availableModels()
{
    std::vector<std::string> out;
    for (const auto& [k, _] : registry()) out.push_back(k);
    return out;
}

bool LiquidViscosityModel::hasModel(const std::string& name)
{
    return registry().count(name) > 0;
}

} // namespace Choupo
