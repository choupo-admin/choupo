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

#include "ShellTubeHX.H"

#include "thermo/utility/UtilityCatalogue.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <iostream>
#include <stdexcept>

namespace Choupo {

namespace {

//  THE ONE RECORD.  Every route below ends here, so the shell weight, the
//  five declared units and the field names have one home whichever way the
//  area was arrived at.
EquipmentSizing exchangerRecord(const std::string& unitName,
    scalar Q_kW, scalar U, scalar LMTD, scalar A, scalar pressureDesign,
    const Material& material, const std::string& basis)
{
    // Empirical weight ≈ 30 kg per m² (TEMA shell+tubes mid-range);
    // material factor scales linearly via density ratio (CS = 7850 kg/m³).
    const scalar weight = 30.0 * A * (material.density / 7850.0);

    EquipmentSizing d;
    d.unitName       = unitName;
    d.equipmentType  = "shellTubeHX";
    d.material       = material.name;
    d.basis          = basis;
    d.set("Q_kW",           Q_kW,           "kW");
    //  `W/m2/K`, NOT `W/(m2.K)` -- THE ONE SPELLING THE GRAMMAR CAN CARRY.
    //  Both name the same unit in `core/Units.cpp` at the same factor 1.0, so
    //  no number moves; but `(` and `)` are not word characters, so the
    //  tokenizer hands the parser `W/` and stops.  Until 2026-09-07 every
    //  heat-exchanger specification sheet therefore carried a `U` line that
    //  Choupo's OWN `Dictionary` refuses -- under a header saying "It is a
    //  Choupo dictionary: every value carries the unit it is in, named as the
    //  dict grammar names it".  `docs/ai/dict-syntax.md` states the rule in
    //  those words already ("the one parseable spelling -- forms like
    //  W/(m2.K) never survive the tokenizer"); this file had not read it.
    //  Found by the FIRST reader of a sheet, which is what
    //  `check_design_sheet`'s own blind-spot list said would find it.
    d.set("U",              U,              "W/m2/K");
    d.set("LMTD",           LMTD,           "K");
    d.set("A",              A,              "m2");
    d.set("pressureDesign", pressureDesign, "bar");
    d.set("weight",         weight,         "kg");
    //  NO TAG HERE.  A heater realises one exchanger and leaves the tag
    //  empty; `ColumnSize` stamps `condenser` / `reboiler` on the records it
    //  gets back, because naming the item is the CALLER's fact and not this
    //  rule's.
    return d;
}

//  A = Q / (U · LMTD).  Q in W; U·LMTD also in W/m².
scalar areaFromDuty(scalar Q_kW, scalar U, scalar LMTD)
{
    if (U <= 0.0 || LMTD <= 0.0)
        throw std::runtime_error("ShellTubeHX: U and LMTD must be > 0");
    return std::abs(Q_kW) * 1000.0 / (U * LMTD);   // m²
}

} // namespace


//  THREE ROUTES TO AN AREA, and the designRules say which (2026-10-07,
//  DEV.md 4c C44).  The question each route answers is "which temperatures
//  does this exchanger work across, and who knows them?" -- and a number the
//  RUN already knows must not be typed again beside it, because a typed copy
//  stands still while the flowsheet moves (re-tune a compressor and the
//  intercooler's inlet moves; a typed LMTD does not).
//
//    1. `U` + `LMTD` declared            -> A = Q/(U*LMTD), both author-set.
//       The original route, unchanged: every case that declares both is
//       sized exactly as before.
//    2. `U` + `utility <name>` declared  -> the LMTD is COMPUTED, counter-
//       current, from the unit's own published `T_in`/`T_out` and the
//       utility record's delivery/return temperatures
//       (data/standards/utilities/<name>.dat).  The process side is the
//       run's; the utility is the author's choice, NAMED, never typed as a
//       temperature.  Declaring `LMTD` as well REFUSES: two homes for one
//       number.  The LMTD is on TERMINAL temperatures, so a process side
//       that condenses along the way is approximated, and the basis says so.
//    3. none of `U`, `LMTD`, `utility`   -> a RATED exchanger: the unit
//       already has an area (a `heatExchanger` declares one and publishes
//       `area`, `U` and `LMTD`), so the sizer passes it through, as the
//       compressor sizer passes the shaft power.  A unit that publishes no
//       area refuses, naming the two declarations that would size it.
//
//  NOT closed here, named: a rated exchanger whose postDict ALSO declares
//  `U` + `LMTD` (route 1) is sized on the author's numbers and not on its
//  own area -- two homes for the area, which no gate reads.  Refusing that
//  would move the goldens of every case that has it; it is left as found.
std::vector<EquipmentSizing> ShellTubeHX::size(const std::string& unitName,
    const SimulationResult& result,
    const Material&         material,
    const DictPtr&          designRules) const
{
    auto kpiIt = result.kpis.find(unitName);
    if (kpiIt == result.kpis.end())
        throw std::runtime_error("ShellTubeHX: unit '" + unitName
            + "' has no KPIs in the simulation result");
    const auto& k = kpiIt->second;

    // Q in kW from heater KPIs.
    auto q_it = k.find("Q_kW");
    if (q_it == k.end())
        throw std::runtime_error("ShellTubeHX: unit '" + unitName
            + "' has no 'Q_kW' KPI — is it a Heater?");
    const scalar Q_kW = q_it->second;

    const bool hasU       = designRules->found("U");
    const bool hasLMTD    = designRules->found("LMTD");
    const bool hasUtility = designRules->found("utility");

    //  ---- route 1: both author-set (the original) ------------------------
    if (!hasUtility && (hasU || hasLMTD))
        return { sizeFromDuty(unitName, Q_kW, material, designRules) };

    //  ---- route 2: U author-set, LMTD from the run and a named utility ----
    if (hasUtility)
    {
        const std::string uName = designRules->lookupWord("utility");
        if (hasLMTD)
            throw std::runtime_error("ShellTubeHX: unit '" + unitName
                + "' declares BOTH `utility " + uName + ";` and `LMTD`.\n"
                "  The utility exists to COMPUTE the LMTD from the unit's own"
                " inlet/outlet temperatures; a typed LMTD beside it\n"
                "  is a second home for one number, and the two would disagree"
                " the first time the flowsheet moved.\n"
                "  Delete one of them: `utility` to let the run decide the"
                " temperatures, `LMTD` to declare the difference yourself.");
        if (!hasU)
            throw std::runtime_error("ShellTubeHX: unit '" + unitName
                + "' declares `utility " + uName + ";` but no `U`.  The"
                " utility fixes the temperature difference; the overall\n"
                "  coefficient is still the author's design assumption --"
                " declare `U <W/m2/K>;` in the same designRules.");
        const Utility& ut = UtilityCatalogue::byName(uName);
        auto tIn  = k.find("T_in");
        auto tOut = k.find("T_out");
        if (tIn == k.end() || tOut == k.end())
            throw std::runtime_error("ShellTubeHX: unit '" + unitName
                + "' publishes no `T_in`/`T_out` KPI, so the LMTD against"
                " utility '" + uName + "' cannot be computed.\n"
                "  Declare `LMTD <K>;` instead of `utility`, which makes the"
                " temperature difference the author's assumption.");
        const scalar Tpi = tIn->second, Tpo = tOut->second;
        const bool cooling = Q_kW < 0.0;
        //  Counter-current terminal differences, each signed so that a
        //  feasible exchanger has both positive: the process end that meets
        //  the utility's RETURN, and the end that meets its DELIVERY.
        const scalar dT1 = cooling ? Tpi - ut.T_out : ut.T_out - Tpi;
        const scalar dT2 = cooling ? Tpo - ut.T_in  : ut.T_in  - Tpo;
        if (dT1 <= 0.0 || dT2 <= 0.0)
        {
            char b[480];
            std::snprintf(b, sizeof(b),
                "ShellTubeHX: unit '%s' cannot be served by utility '%s':"
                " a %s duty with the process going %.2f -> %.2f K and the"
                " utility %.2f -> %.2f K gives terminal differences %.2f K"
                " and %.2f K -- a temperature cross.  Name a %s utility.",
                unitName.c_str(), uName.c_str(),
                cooling ? "cooling" : "heating",
                static_cast<double>(Tpi), static_cast<double>(Tpo),
                static_cast<double>(ut.T_in), static_cast<double>(ut.T_out),
                static_cast<double>(dT1), static_cast<double>(dT2),
                cooling ? "colder" : "hotter");
            throw std::runtime_error(b);
        }
        const scalar LMTD = (std::abs(dT1 - dT2) < 1.0e-9 * std::max(dT1, dT2))
            ? dT1 : (dT1 - dT2) / std::log(dT1 / dT2);
        const scalar U = designRules->lookupScalar("U");
        const scalar pressureDesign = designRules->lookupScalar("pressureDesign");
        char line[320];
        std::snprintf(line, sizeof(line),
            "  [basis] shellTubeHX '%s': LMTD %.6g K computed against utility"
            " %s (process %.2f -> %.2f K, utility %.2f -> %.2f K)\n",
            unitName.c_str(), static_cast<double>(LMTD), uName.c_str(),
            static_cast<double>(Tpi), static_cast<double>(Tpo),
            static_cast<double>(ut.T_in), static_cast<double>(ut.T_out));
        std::cout << line;
        return { exchangerRecord(unitName, Q_kW, U, LMTD,
                                 areaFromDuty(Q_kW, U, LMTD), pressureDesign,
                                 material,
            "A = Q/(U*LMTD), U author-set; LMTD counter-current on terminal"
            " temperatures, from the unit's own T_in/T_out and utility "
            + uName + "'s T_in/T_out") };
    }

    //  ---- route 3: a RATED exchanger, its own area passed through --------
    auto aIt = k.find("area");
    if (aIt == k.end())
        throw std::runtime_error("ShellTubeHX: unit '" + unitName
            + "' declares no `U`, `LMTD` or `utility` in its designRules and"
            " publishes no `area` of its own.\n"
            "  Declare either `U <W/m2/K>; LMTD <K>;` (both author-set) or"
            " `U <W/m2/K>; utility <name>;`\n"
            "  (the LMTD computed from the unit's temperatures and a utility"
            " record in data/standards/utilities/).");
    const scalar A = aIt->second;
    if (A <= 0.0)
        throw std::runtime_error("ShellTubeHX: unit '" + unitName
            + "' publishes a non-positive `area`; a rated exchanger cannot be"
              " passed through without one.");
    const scalar U    = k.count("U")    ? k.at("U")    : 0.0;
    const scalar LMTD = k.count("LMTD") ? k.at("LMTD") : 0.0;
    const scalar pressureDesign = designRules->lookupScalar("pressureDesign");
    return { exchangerRecord(unitName, Q_kW, U, LMTD, A, pressureDesign,
        material,
        "A = the unit's own rated area (pass-through); U and LMTD read from"
        " the unit, not declared") };
}


EquipmentSizing ShellTubeHX::sizeFromDuty(const std::string& unitName,
    scalar                  Q_kW,
    const Material&         material,
    const DictPtr&          designRules)
{
    const scalar U              = designRules->lookupScalar("U");        // W/(m²·K)
    const scalar LMTD           = designRules->lookupScalar("LMTD");      // K
    const scalar pressureDesign = designRules->lookupScalar("pressureDesign");

    return exchangerRecord(unitName, Q_kW, U, LMTD, areaFromDuty(Q_kW, U, LMTD),
        pressureDesign, material, "A = Q/(U*LMTD) with U and LMTD author-set");
}

} // namespace Choupo
