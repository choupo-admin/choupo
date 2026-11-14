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

#include "LiquidConductivityModel.H"
#include "ChemSepCond16.H"
#include "SatoRiedel.H"
#include "LiquidConductivityMixingRule.H"

#include "thermo/RecordLaws.H"

#include <map>
#include <memory>
#include <stdexcept>

namespace Choupo {

std::map<std::string, LiquidConductivityModel::Factory>& LiquidConductivityModel::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void LiquidConductivityModel::registerModel(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<LiquidConductivityModel> LiquidConductivityModel::New(const DictPtr& dict)
{
    if (!dict->found("model"))
        throw std::runtime_error("liquid thermal conductivity: the block names no `model` -- the factory"
            " default (SatoRiedel) was removed (DEV.md 4c C398, review row SL-04): a"
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
        throw std::runtime_error("LiquidConductivityModel: unknown model '" + name
            + "'.  Registered:" + (avail.empty() ? " (none)" : avail));
    }
    return it->second(dict);
}

void LiquidConductivityModel::registerBuiltins()
{
    //  U3 (C398): each type's form and coefficient units, in ONE place.
    recordLaws::declareForm("liquidThermalConductivity", "chemsepEq16",
        "k/(W/(m K)) = A + exp(B/(T/K) + C + D (T/K) + E (T/K)^2); A in W/(m K), B in K,"
        " C dimensionless, D in 1/K, E in 1/K^2");
    for (const char* w : { "SatoRiedel", "satoRiedel" })
        recordLaws::declareForm("liquidThermalConductivity", w,
            "PREDICTIVE: k/(W/(m K)) = (1.1053/sqrt(M/(g/mol))) [3 + 20 (1 - Tr)^(2/3)]"
            " / [3 + 20 (1 - Tbr)^(2/3)] from Tc, Tb, M; no record law");
    //  The measured rung: ChemSep form 16, 420 of 431 records.
    registerModel("chemsepEq16", [](const DictPtr& d) { return std::make_unique<ChemSepCond16>(d); });
    registerModel("SatoRiedel", [](const DictPtr& d) { return std::make_unique<SatoRiedel>(d); });
    registerModel("satoRiedel", [](const DictPtr& d) { return std::make_unique<SatoRiedel>(d); });
    //  The mixing rules of the same property (C331), registered with it:
    //  a package that reads this model also reads its `mixingRule`.
    LiquidConductivityMixingRule::registerBuiltins();
}

std::vector<std::string> LiquidConductivityModel::availableModels()
{
    std::vector<std::string> out;
    for (const auto& [k, _] : registry()) out.push_back(k);
    return out;
}

bool LiquidConductivityModel::hasModel(const std::string& name)
{
    return registry().count(name) > 0;
}

} // namespace Choupo
