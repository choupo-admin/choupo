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

#include "HeatCapacityModel.H"
#include "core/RegistryRefusal.H"
#include "ChemSepCp16.H"
#include "PolynomialCp.H"
#include "RowlinsonBondi.H"
#include "NASA7Cp.H"
#include "NASA9Cp.H"

#include "thermo/RecordLaws.H"

#include <map>
#include <memory>
#include <stdexcept>

namespace Choupo {

std::map<std::string, HeatCapacityModel::Factory>& HeatCapacityModel::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void HeatCapacityModel::registerModel(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<HeatCapacityModel>
HeatCapacityModel::New(const DictPtr& dict)
{
    const std::string modelName = dict->lookupWord("model");
    auto it = registry().find(modelName);
    if (it == registry().end())
        throw std::runtime_error(registryRefusal::message(
            "heat-capacity model", modelName, registryRefusal::keysOf(registry())));
    return it->second(dict);
}

void HeatCapacityModel::registerBuiltins()
{
    //  U3 (C398): each type's form and coefficient units, in ONE place.
    recordLaws::declareForm("heatCapacity", "polynomial",
        "Cp/(J/(mol K)) = sum_i c_i (T/K)^i, i = 0, 1, 2, ...; c_i in J/(mol K^(i+1))");
    recordLaws::declareForm("heatCapacity", "chemsepCp16",
        "Cp/(J/(mol K)) = A + exp(B/(T/K) + C + D (T/K) + E (T/K)^2); A in J/(mol K),"
        " B in K, C dimensionless, D in 1/K, E in 1/K^2");
    recordLaws::declareForm("heatCapacity", "NASA7",
        "Cp/R = a1 + a2 T + a3 T^2 + a4 T^3 + a5 T^4 (T in K), two ranges `low` and `high`"
        " joined at Tcommon; a_k in K^-(k-1)");
    recordLaws::declareForm("heatCapacity", "NASA9",
        "Cp/R = a1 T^-2 + a2 T^-1 + a3 + a4 T + a5 T^2 + a6 T^3 + a7 T^4 (T in K), two ranges"
        " joined at Tcommon");
    recordLaws::declareForm("heatCapacity", "RowlinsonBondi",
        "Cp,L = Cp,ig + R [1.586 + 0.49/(1 - Tr) + omega (4.2775 + 6.3 (1 - Tr)^(1/3)/Tr"
        " + 0.4355/(1 - Tr))], Tr = T/Tc; no coefficients: Tc, omega and the record's"
        " ideal-gas law (the preferred one, or the case's pin)");
    registerModel("polynomial",
        [](const DictPtr& d) -> std::unique_ptr<HeatCapacityModel>
        { return std::make_unique<PolynomialCp>(d); });

    //  The predictive rung: a liquid Cp from Tc, omega and the ideal-gas Cp,
    //  with nothing measured.  See RowlinsonBondi.H for why it exists.
    registerModel("RowlinsonBondi",
        [](const DictPtr& d) -> std::unique_ptr<HeatCapacityModel>
        { return std::make_unique<RowlinsonBondi>(d); });
    //  ChemSep's equation form 16, read as published rather than refitted --
    //  356 imported records state their ideal-gas Cp in it.
    registerModel("chemsepCp16",
        [](const DictPtr& d) -> std::unique_ptr<HeatCapacityModel>
        { return std::make_unique<ChemSepCp16>(d); });
    registerModel("NASA7",
        [](const DictPtr& d) -> std::unique_ptr<HeatCapacityModel>
        { return std::make_unique<NASA7Cp>(d); });
    //  The NASA Glenn 9-coefficient form, read as NASA/TP-2002-211556
    //  publishes it (public domain) -- the clean primary for the combustion
    //  species once GRI-Mech's thermo file was ruled out (DEV.md 4c C164).
    registerModel("NASA9",
        [](const DictPtr& d) -> std::unique_ptr<HeatCapacityModel>
        { return std::make_unique<NASA9Cp>(d); });
}

bool HeatCapacityModel::hasModel(const std::string& name)
{
    return registry().count(name) > 0;
}

} // namespace Choupo
