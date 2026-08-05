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

#include "CostingPass.H"
#include "core/Advisory.H"
#include "costing/CostingModel.H"
#include "materials/MaterialRegistry.H"

#include <iomanip>
#include <iostream>

namespace Choupo {

CostingPass::CostingPass(const DictPtr& dict)
:   costingDict_(dict)
{}

int CostingPass::run(SimulationResult& result)
{
    if (result.sizings.empty())
    {
        std::cerr << "CostingPass: result.sizings is empty — did SizingPass run first?\n";
        return 1;
    }

    auto model = CostingModel::New(costingDict_);

    std::cout << "\n========================  Equipment Costing  =========================\n";
    std::cout << "  Method:  " << model->type()
              << "    Year:  " << costingDict_->lookupScalarOrDefault("year", 2026.0)
              << "    CEPCI: " << costingDict_->lookupScalarOrDefault("cepci", 820.0)
              << "\n\n";

    std::cout << "  " << std::left
              << std::setw(14) << "unit"
              << std::setw(16) << "equipment"
              << std::setw(8)  << "F_M"
              << std::setw(8)  << "F_P"
              << std::setw(14) << "C_purchased"
              << std::setw(14) << "C_bare_mod"
              << std::setw(14) << "C_total_mod"
              << "\n  " << std::string(88, '-') << "\n";

    scalar totalPurchased  = 0.0;
    scalar totalBareMod    = 0.0;
    scalar totalModule     = 0.0;
    int    failures = 0;
    std::vector<std::string> notCosted;

    for (const auto& [uname, dim] : result.sizings)
    {
        try {
            const auto& mat = MaterialRegistry::byName(dim.material);
            auto cb         = model->cost(dim, mat);
            cb.unitName     = uname;

            std::cout << "  " << std::left
                      << std::setw(14) << uname
                      << std::setw(16) << dim.equipmentType
                      << std::setw(8)  << std::fixed << std::setprecision(2)
                      << cb.factors.at("F_M")
                      << std::setw(8)  << cb.factors.at("F_P")
                      << std::setw(14) << std::fixed << std::setprecision(0)
                      << cb.purchasedCost
                      << std::setw(14) << cb.bareModuleCost
                      << std::setw(14) << cb.totalModuleCost
                      << "\n";

            totalPurchased += cb.purchasedCost;
            totalBareMod   += cb.bareModuleCost;
            totalModule    += cb.totalModuleCost;
            result.costs[uname] = std::move(cb);
        }
        catch (const std::exception& e)
        {
            std::cerr << "  " << uname << "  FAILED: " << e.what() << "\n";
            ++failures;
            notCosted.push_back(uname);
        }
    }

    std::cout << "  " << std::string(88, '-') << "\n  "
              << std::left << std::setw(30)
              << (notCosted.empty() ? "TOTALS (EUR)" : "TOTALS (EUR) -- INCOMPLETE")
              << std::setw(16) << " "
              << std::setw(14) << std::fixed << std::setprecision(0) << totalPurchased
              << std::setw(14) << totalBareMod
              << std::setw(14) << totalModule << "\n";

    //  A TOTAL OVER AN INCOMPLETE SET SAYS SO (AS6).  The failures were
    //  counted and returned, and BOTH call sites threw the count away -- so a
    //  unit whose material is not in the registry simply dropped out of
    //  TOTALS and costs.csv, and FCI / NPV / IRR were computed as if the most
    //  expensive item did not exist.  Exit 0, `converged/` written, one
    //  FAILED: line on stderr that a sweep then discarded (AS7).
    //
    //  A returned count nobody reads is not a report.  The label travels with
    //  the NUMBER instead, because that is what a reader takes away -- and it
    //  names the units, since "incomplete" without saying what is missing
    //  cannot be acted on.
    if (!notCosted.empty())
    {
        std::cout << "  ^ this total OMITS " << notCosted.size()
                  << " unit(s) that could not be costed:";
        for (const auto& u : notCosted) std::cout << " " << u;
        std::cout << "\n    Any FCI / NPV / IRR derived from it is computed"
                     " over an incomplete equipment set.\n";
        AdvisoryLog::instance().add("costing", "warning", "incomplete-total",
                                    "costing total omits " +
                                    std::to_string(notCosted.size()) +
                                    " unit(s) that could not be costed");
    }
    std::cout << "=====================================================================\n\n";
    return failures;
}

} // namespace Choupo
