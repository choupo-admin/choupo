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

#include <cmath>
#include <stdexcept>

namespace Choupo {

std::vector<EquipmentSizing> ShellTubeHX::size(const std::string& unitName,
    const SimulationResult& result,
    const Material&         material,
    const DictPtr&          designRules) const
{
    auto kpiIt = result.kpis.find(unitName);
    if (kpiIt == result.kpis.end())
        throw std::runtime_error("ShellTubeHX: unit '" + unitName
            + "' has no KPIs in the simulation result");

    // Q in kW from heater KPIs.
    auto q_it = kpiIt->second.find("Q_kW");
    if (q_it == kpiIt->second.end())
        throw std::runtime_error("ShellTubeHX: unit '" + unitName
            + "' has no 'Q_kW' KPI — is it a Heater?");

    return { sizeFromDuty(unitName, q_it->second, material, designRules) };
}


EquipmentSizing ShellTubeHX::sizeFromDuty(const std::string& unitName,
    scalar                  Q_kW,
    const Material&         material,
    const DictPtr&          designRules)
{
    const scalar U              = designRules->lookupScalar("U");        // W/(m²·K)
    const scalar LMTD           = designRules->lookupScalar("LMTD");      // K
    const scalar pressureDesign = designRules->lookupScalar("pressureDesign");

    if (U <= 0.0 || LMTD <= 0.0)
        throw std::runtime_error("ShellTubeHX: U and LMTD must be > 0");

    // A = Q / (U · LMTD).  Q in W; U·LMTD also in W/m².
    const scalar A = std::abs(Q_kW) * 1000.0 / (U * LMTD);   // m²

    // Empirical weight ≈ 30 kg per m² (TEMA shell+tubes mid-range);
    // material factor scales linearly via density ratio (CS = 7850 kg/m³).
    const scalar weight = 30.0 * A * (material.density / 7850.0);

    EquipmentSizing d;
    d.unitName       = unitName;
    d.equipmentType  = "shellTubeHX";
    d.material       = material.name;
    d.basis          = "A = Q/(U*LMTD) with U and LMTD author-set";
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

} // namespace Choupo
