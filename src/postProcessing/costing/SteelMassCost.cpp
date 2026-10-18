/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

#include "SteelMassCost.H"
#include "core/Advisory.H"

#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>

namespace Choupo {
namespace steelMassCost {

bool applies(const EquipmentSizing& dim)
{
    auto it = dim.costWords.find("costBasis");
    return it != dim.costWords.end() && it->second == "steelMass";
}

CostBreakdown cost(const EquipmentSizing& dim,
                   const Material&        mat,
                   const CostingModel&    model)
{
    const std::string who = dim.equipmentType + " '" + dim.itemId() + "'";
    auto pit = dim.costInputs.find("steelPrice");
    auto rit = dim.costWords.find("steelPriceReason");
    auto wit = dim.values.find("weight");
    if (pit == dim.costInputs.end())
        throw std::runtime_error(who + " is costed BY ITS STEEL MASS and no"
            " `steelPrice` is declared on its entry; Choupo carries no steel"
            " price and will not invent one.\n  Declare `steelPrice <EUR per"
            " kg>;` -- an INSTALLED price per kg of shell steel (no module"
            " factor is applied), in the currency this run totals in, today's"
            " money -- and `steelPriceReason \"...\";`.  Until then the total"
            " below is INCOMPLETE by exactly this vessel.");
    if (rit == dim.costWords.end() || rit->second.empty())
        throw std::runtime_error(who + " declares a `steelPrice` with no"
            " `steelPriceReason` -- a price is an assumption somebody chose;"
            " say why that one.  Until then the total below is INCOMPLETE by"
            " exactly this vessel.");
    if (wit == dim.values.end() || !(wit->second > 0.0))
        throw std::runtime_error(who + " is costed BY ITS STEEL MASS and its"
            " sizer published no positive `weight`.");
    const scalar price = pit->second;
    const scalar m_kg  = wit->second;
    if (!(price >= 0.0))
        throw std::runtime_error(who + " declares a negative `steelPrice` --"
            " nothing is priced from that.");
    const scalar Cp = price * m_kg;

    //  THE COMPARISON: the same item, without the steel-mass word, handed to
    //  the model the case selected.
    EquipmentSizing plain = dim;
    plain.costWords.erase("costBasis");
    const CostBreakdown ref = model.cost(plain, mat);
    auto rf = [&](const char* k) -> scalar {
        auto it = ref.factors.find(k);
        return it == ref.factors.end() ? 0.0 : it->second;
    };
    auto val = [&](const char* k) -> scalar {
        auto it = dim.values.find(k);
        return it == dim.values.end() ? 0.0 : it->second;
    };
    {
        std::ostringstream m;
        m << std::defaultfloat << std::setprecision(4)
          << "the " << model.type() << " vessel set, EXTRAPOLATED, would price"
             " this vessel at C_TM " << ref.totalModuleCost << " EUR (F_P "
          << rf("F_P") << " on a wall of " << val("t_wall") * 1000.0
          << " mm, t/R " << val("t_over_R") << "; the thin-wall formula and"
             " the pressure factor both assume t << R) -- a COMPARISON, NOT in"
             " the total, which takes the declared steel price: " << price
          << " EUR/kg x " << m_kg << " kg of shell = " << Cp << " EUR"
             " (installed, no index, no module factor)";
        std::cout << "  [comparison] " << who << ": " << m.str() << "\n";
        //  ONE caveat per unit, not per vessel: equal vessels carry the same
        //  sentence, so the entry is keyed on the UNIT and the log's own
        //  de-duplication keeps one (a block of ten identical lines is the
        //  wall of text the caveat block exists to prevent).
        AdvisoryLog::instance().add("costing", "info",
            dim.equipmentType + " '" + dim.unitName + "' (each item)", m.str());
    }

    CostBreakdown out;
    out.unitName        = dim.unitName;
    out.purchasedCost   = Cp;
    out.bareModuleCost  = Cp;
    out.totalModuleCost = Cp;
    //  THE FACTORS THAT ARE NOT APPLIED, STATED AS ONES (the catalyst row's
    //  rule): a blank would read as a factor the pass forgot.
    out.factors["F_M"]            = 1.0;
    out.factors["F_P"]            = 1.0;
    out.factors["B1"]             = 1.0;
    out.factors["B2"]             = 0.0;
    out.factors["C_TM_over_C_BM"] = 1.0;
    out.factors["S"]              = m_kg;
    out.factors["steelPrice"]     = price;    // the DECLARED input, republished
    //  The comparison, published under its own prefix: never a total.
    out.factors["comparison_C_p"]  = ref.purchasedCost;
    out.factors["comparison_C_BM"] = ref.bareModuleCost;
    out.factors["comparison_C_TM"] = ref.totalModuleCost;
    out.factors["comparison_F_P"]  = rf("F_P");
    //  The run's index rides along UNAPPLIED, as on the catalyst row.
    for (const auto& [k, v] : model.pricingFactors()) out.factors[k] = v;
    out.sizeKey     = "weight";
    out.correlation = "declared-unit-price";
    out.material    = mat.name + ", priced per kg of shell steel";
    out.currency    = ref.currency;
    return out;
}

} // namespace steelMassCost
} // namespace Choupo
