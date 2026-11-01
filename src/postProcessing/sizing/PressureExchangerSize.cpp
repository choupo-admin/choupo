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

#include "PressureExchangerSize.H"
#include "MaterialLimits.H"
#include "TrainSplit.H"
#include "core/Dimensions.H"

#include <cmath>
#include <stdexcept>

namespace Choupo {

std::vector<EquipmentSizing> PressureExchangerSize::size(
    const std::string&      unitName,
    const SimulationResult& result,
    const Material&         material,
    const DictPtr&          designRules) const
{
    auto kpiIt = result.kpis.find(unitName);
    if (kpiIt == result.kpis.end())
        throw std::runtime_error("PressureExchanger: unit '" + unitName
            + "' has no KPIs in the simulation result");
    const auto& k = kpiIt->second;
    auto need = [&](const char* key) -> scalar
    {
        auto it = k.find(key);
        if (it == k.end())
            throw std::runtime_error("PressureExchanger: unit '" + unitName
                + "' has no '" + key + "' KPI -- nothing to size (is it a"
                " pressureExchanger?)");
        return it->second;
    };
    //  A PLANT OF N IDENTICAL TRAINS (C199): the unit ran at plant flow, so
    //  each train sees 1/N of every flow and of the booster duty; the
    //  pressures are the same.  N = 0 is the unit sized whole, as before.
    const int N = trainSplit::trainsOf(result, designRules,
                                       "PressureExchanger '" + unitName + "'");
    const scalar share    = N > 0 ? 1.0 / N : 1.0;
    const scalar Q_LP     = need("Q_LPin_m3h") * share;  // m3/h, the rated side
    const scalar Q_HP     = need("Q_HPin_m3h") * share;
    const scalar Q_HPout  = need("Q_HPout_m3h") * share;
    const scalar Q_LPout  = need("Q_LPout_m3h") * share;
    const scalar dP_HP    = need("dP_HP_bar");
    const scalar dP_LP    = need("dP_LP_bar");
    const scalar booster  = need("boosterDuty_kW") * share;  // hydraulic, eta_pump = 1
    const scalar P_HPin   = need("P_HPin") / 1.0e5;      // bar
    const scalar P_HPout  = need("P_HPout") / 1.0e5;

    //  THE RATED FLOW IS A MAKER'S DATUM, declared with its source; there is
    //  no default and no built-in table of models.
    if (!designRules->found("ratedFlowPerUnit"))
        throw std::runtime_error("PressureExchanger: unit '" + unitName
            + "' -- `designRules { ratedFlowPerUnit <value> m3/h; source"
            " \"...\"; }` is REQUIRED and absent.  The flow one rotary unit is"
            " rated for is the maker's number (the ERI PX-Q300 class is of the"
            " order of 50-68 m3/h per unit); declare it, and where it came"
            " from.");
    const scalar rated_m3s = designRules->lookupScalar("ratedFlowPerUnit",
                                                       Dims::volumetricFlow);
    const scalar rated = rated_m3s * 3600.0;             // m3/h
    if (!(rated > 0.0))
        throw std::runtime_error("PressureExchanger: unit '" + unitName
            + "' -- `ratedFlowPerUnit` must be positive; got "
            + std::to_string(rated) + " m3/h.");
    if (!designRules->found("source"))
        throw std::runtime_error("PressureExchanger: unit '" + unitName
            + "' -- `designRules { source \"...\"; }` is REQUIRED beside"
            " `ratedFlowPerUnit`: a maker's rated flow is cited, never typed"
            " bare.");
    const std::string source = designRules->lookupWord("source");

    //  THE COUNT: the one number this sizer computes.
    const scalar rotors = std::ceil(Q_LP / rated - 1.0e-12);
    if (!(rotors >= 1.0))
        throw std::runtime_error("PressureExchanger: unit '" + unitName
            + "' -- the low-pressure feed is " + std::to_string(Q_LP)
            + " m3/h; no rotor is needed for no flow.");

    //  THE DESIGN PRESSURE: declared, or the high-pressure inlet read from the
    //  unit (a fact of the run, not an assumption; the basis says which).
    //  Declared WITH its unit (`pressureDesign 70 bar;`): read in Pa and
    //  published in bar, the unit every other sheet's `pressureDesign` is in.
    const bool pDeclared = designRules->found("pressureDesign");
    const scalar P_des = pDeclared
        ? designRules->lookupScalar("pressureDesign", Dims::pressure) / 1.0e5
        : P_HPin;

    //  THE MAKER'S PRESSURE LIMIT AND FLOW WINDOW (C199), both optional and
    //  both DECLARED with the entry's `source`: a device is not rated above
    //  its limit, so the operating high-pressure inlet and the design
    //  pressure above it REFUSE by name -- the same posture as a material's
    //  maxP -- and so does a per-rotor flow under the minimum of the maker's
    //  window, since the maker rates no operation there.  It is the SIZER
    //  that checks, not the unit: the limit belongs to the device model the
    //  array is built of, and the unit's physics does not depend on it.
    //  Absent, nothing is checked.
    scalar pRating = 0.0, flowMin = 0.0;
    if (designRules->found("pressureRating"))
    {
        pRating = designRules->lookupScalar("pressureRating", Dims::pressure) / 1.0e5;
        if (!(pRating > 0.0))
            throw std::runtime_error("PressureExchanger: unit '" + unitName
                + "' -- `pressureRating` must be positive.");
        if (P_HPin > pRating + 1e-9 || P_des > pRating + 1e-9)
            throw std::runtime_error("PressureExchanger: unit '" + unitName
                + "' -- the high-pressure inlet is " + std::to_string(P_HPin)
                + " bar and the design pressure " + std::to_string(P_des)
                + " bar, above the device's declared pressure rating of "
                + std::to_string(pRating) + " bar (" + source + ").  The maker"
                  " rates no operation there: lower the pressure, or declare"
                  " the rating of the device that carries it.");
    }
    if (designRules->found("minFlowPerUnit"))
    {
        flowMin = designRules->lookupScalar("minFlowPerUnit",
                                            Dims::volumetricFlow) * 3600.0;
        if (!(flowMin > 0.0) || flowMin > rated)
            throw std::runtime_error("PressureExchanger: unit '" + unitName
                + "' -- `minFlowPerUnit` must be positive and not above"
                  " `ratedFlowPerUnit`.");
        if (Q_LP / rotors < flowMin - 1e-9)
            throw std::runtime_error("PressureExchanger: unit '" + unitName
                + "' -- each rotor would see " + std::to_string(Q_LP / rotors)
                + " m3/h, under the maker's minimum of "
                + std::to_string(flowMin) + " m3/h: fewer, larger devices"
                  " are needed, or a smaller model.");
    }

    EquipmentSizing d;
    d.unitName       = unitName;
    d.equipmentType  = "pressureExchanger";
    d.material       = material.name;
    d.basis          = "rotors = ceil(Q_LP / ratedFlowPerUnit) in parallel, each"
        " seeing 1/rotors of every flow at the same pressures; the rated flow"
        " per unit is a DECLARED maker's datum (" + source + "); the HP and LP"
        " pressure drops, the recovered pressure and the HYDRAULIC booster duty"
        " (eta_pump = 1) are read from the unit; pressureDesign "
        + (pDeclared ? std::string("declared") : std::string("= the HP inlet"
          " pressure read from the unit (declare `pressureDesign` to set it)"))
        + "; NOT costed -- no Turton set covers a rotary pressure exchanger";

    d.set("rotors",            rotors,          "-");
    d.set("ratedFlowPerUnit",  rated,           "m3/h");
    d.set("flowPerRotor",      Q_LP / rotors,   "m3/h");
    d.set("Q_LP",              Q_LP,            "m3/h");
    d.set("Q_HP",              Q_HP,            "m3/h");
    d.set("Q_HPout",           Q_HPout,         "m3/h");
    d.set("Q_LPout",           Q_LPout,         "m3/h");
    d.set("P_HPin",            P_HPin,          "bar");
    d.set("P_HPout",           P_HPout,         "bar");
    d.set("dP_HP",             dP_HP,           "bar");
    d.set("dP_LP",             dP_LP,           "bar");
    d.set("P_recovered",       need("P_recovered_bar"), "bar");
    d.set("boosterPower",      booster,         "kW");
    d.set("efficiency",        need("efficiency"), "-");
    d.set("mixing",            need("mixing"),  "-");
    d.set("leakage",           need("leakage"), "-");
    d.set("salinityIncrease",  need("feedSalinityIncrease"), "-");
    d.set("pressureDesign",    P_des,           "bar");
    //  A published design pressure is compared with the housing material's
    //  rating like every other one (DEV.md 4c C86).
    materialLimits::pressure("pressureExchanger '" + d.itemId() + "'", material,
                             P_des);

    //  NOT COSTED, verified against `Turton::coeffsFor`'s own list before this
    //  sentence was written: stirredTank, vessel, shellTubeHX, evaporator,
    //  crystalliser, sprayDryer, cyclone, compressor, storageTank, and the
    //  tray stack by its own route.  A rotary ceramic pressure exchanger is
    //  none of them, and pricing it on a neighbour's correlation would convert
    //  "uncosted" into "falsely costed".
    d.notCostedBecause = "no Turton cost set covers a rotary pressure exchanger;"
        " price it as a declared quote (`costing { quotes ( { unit " + unitName
        + "; ... } ) }`, DEV.md 4c C98)";

    if (pRating > 0.0) d.set("pressureRating", pRating, "bar");
    if (flowMin > 0.0) d.set("minFlowPerUnit", flowMin, "m3/h");

    //  ONE ITEM: the array is one piece of equipment for the sheet; its rotor
    //  count is a size on it, not a sibling per rotor.  UNLESS the plant is
    //  built in trains (C199): then ONE ARRAY PER TRAIN, identical, each
    //  tagged, with the plant totals beside the per-train numbers.
    if (N == 0) return { d };
    d.set("rotorsPlant", rotors * N, "-");
    d.basis += "; per TRAIN: the plant's flows divided by the " + std::to_string(N)
        + " declared identical trains (" + result.trains.source + ")";
    std::vector<EquipmentSizing> out;
    for (int k = 1; k <= N; ++k)
    {
        EquipmentSizing t = d;
        trainSplit::stamp(t, k, N);
        out.push_back(std::move(t));
    }
    return out;
}

} // namespace Choupo
