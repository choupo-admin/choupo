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

#include <algorithm>
#include <iomanip>
#include <iostream>
#include <map>
#include <sstream>

namespace Choupo {

CostingPass::CostingPass(const DictPtr& dict)
:   costingDict_(dict)
{}

int CostingPass::run(SimulationResult& result)
{
    if (result.sizings.empty())
    {
        //  TWO DIFFERENT SITUATIONS, AND THE OLD MESSAGE ASKED THE WRONG ONE.
        //  "did SizingPass run first?" is a question whose answer is usually
        //  YES: the pass ran, reported per unit why each one failed, and
        //  produced nothing.  Sending the reader to check whether it ran
        //  points them away from the report that already tells them.  The
        //  two states have different remedies and are now named apart.
        if (result.sizingAttempted)
            std::cerr << "CostingPass: nothing to cost -- SizingPass RAN and"
                         " sized no equipment.\n"
                         "  It reported the reason for each unit above (look"
                         " for `FAILED:` in the sizing table);\n"
                         "  costing prices sized equipment, so every unit that"
                         " failed to size is absent here too.\n"
                         "  Fix the sizing failures and the costs follow --"
                         " there is nothing to change in this block.\n";
        else
            std::cerr << "CostingPass: nothing to cost -- no SizingPass ran."
                         "  Costing prices SIZED equipment,\n"
                         "  so a `sizing {}` block must precede `costing {}`"
                         " in system/postDict.\n";
        return 1;
    }

    auto model = CostingModel::New(costingDict_);

    std::cout << "\n========================  Equipment Costing  =========================\n";
    std::cout << "  Method:  " << model->type()
              << "    Year:  " << costingDict_->lookupScalarOrDefault("year", 2026.0)
              << "    CEPCI: " << costingDict_->lookupScalarOrDefault("cepci", 820.0)
              << "\n\n";

    //  THE NAME COLUMN FITS THE NAMES.  Same rule and the same reason as the
    //  sizing table: a flattened plant's `SECTOR.unit` overflowed a fixed 14
    //  and ran into the equipment column on exactly the cases whose hierarchy
    //  these tables exist to show.  Floored at 14, so every case whose names
    //  already fit prints exactly what it printed before.
    std::size_t wName = 14;
    for (const auto& [uname, dim] : result.sizings)
    { (void)dim; wName = std::max(wName, uname.size() + 2); }

    std::cout << "  " << std::left
              << std::setw(int(wName)) << "unit"
              << std::setw(16) << "equipment"
              << std::setw(8)  << "F_M"
              << std::setw(8)  << "F_P"
              << std::setw(14) << "C_purchased"
              << std::setw(14) << "C_bare_mod"
              << std::setw(14) << "C_total_mod"
              << "\n  " << std::string(88 + wName - 14, '-') << "\n";

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
            cb.sector       = dim.sector;   // one origin: the flatten seam

            std::cout << "  " << std::left
                      << std::setw(int(wName)) << uname
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

    std::cout << "  " << std::string(88 + wName - 14, '-') << "\n  "
              //  The TOTALS label spans the unit AND equipment columns, so
              //  it tracks the name width rather than a literal 30.
              << std::left << std::setw(int(wName + 16))
              << (notCosted.empty() ? "TOTALS (EUR)" : "TOTALS (EUR) -- INCOMPLETE")
              << std::setw(16) << " "
              << std::setw(14) << std::fixed << std::setprecision(0) << totalPurchased
              << std::setw(14) << totalBareMod
              << std::setw(14) << totalModule << "\n";

    //  WHERE THE MONEY IS, BY SECTOR.  Capital allocation is the question a
    //  plant's hierarchy exists to answer -- "the extraction sector is 41 %
    //  of the capex" is the sentence a student takes away, and until now the
    //  only route to it was adding up dotted names by hand.
    //
    //  The block is printed ONLY when a hierarchy exists.  A flat case has no
    //  sectors, prints nothing extra, and its console output is unchanged.
    //  The shares are computed from the SAME accumulated `totalModule` the
    //  TOTALS line above prints, so the two can never disagree; when the set
    //  is incomplete the caveat below applies to both, which is why this
    //  block sits before it rather than after.
    {
        std::map<std::string, scalar> byP, byB, byT;
        std::map<std::string, int>    byN;
        bool anySector = false;
        for (const auto& [uname, cb] : result.costs)
        {
            (void)uname;
            if (!cb.sector.empty()) anySector = true;
            const std::string s = cb.sector.empty() ? "(no sector)" : cb.sector;
            byP[s] += cb.purchasedCost;
            byB[s] += cb.bareModuleCost;
            byT[s] += cb.totalModuleCost;
            byN[s] += 1;
        }
        if (anySector)
        {
            std::cout << "\n  ---- capital by sector ----\n  " << std::left
                      << std::setw(24) << "sector"
                      << std::setw(8)  << "units"
                      << std::setw(14) << "purchased"
                      << std::setw(14) << "bare module"
                      << std::setw(14) << "total module"
                      << "share of C_TM\n  " << std::string(88 + wName - 14, '-') << "\n";
            for (const auto& [s, tt] : byT)
            {
                //  A SHARE OF ZERO IS NOT ZERO PER CENT, it is a share of
                //  nothing; printing "0.0 %" for it would be a number with
                //  no arithmetic behind it.
                std::ostringstream share;
                if (totalModule > 0.0)
                    share << std::fixed << std::setprecision(1)
                          << 100.0 * tt / totalModule << " %";
                else
                    share << "(total is zero)";
                std::cout << "  " << std::left
                          << std::setw(24) << s
                          << std::setw(8)  << byN.at(s)
                          << std::setw(14) << std::fixed << std::setprecision(0)
                          << byP.at(s)
                          << std::setw(14) << byB.at(s)
                          << std::setw(14) << tt
                          << share.str() << "\n";
            }
        }
    }

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
    //  HOW EACH NUMBER WAS REACHED.  Everything above is a result; this is
    //  the arithmetic that produced it.  It exists because the table on its
    //  own is not defensible: `F_M 3.05` and `C_TM 166653` are two numbers,
    //  and the correlation, its size driver, the price index, the currency
    //  rate and the two module factors are five more decisions standing
    //  between them -- all of them already computed, none of them said.  A
    //  student asked "where does the bare-module factor 7.80 come from?"
    //  should be able to answer from their own output, not from the source.
    if (!result.costs.empty())
    {
        const auto& any = result.costs.begin()->second;
        const scalar cepci     = any.factors.count("cepci")
                               ? any.factors.at("cepci") : 0.0;
        const scalar cepci2001 = any.factors.count("cepci2001")
                               ? any.factors.at("cepci2001") : 0.0;
        const scalar fx        = any.factors.count("usdToEur")
                               ? any.factors.at("usdToEur") : 0.0;

        std::cout << "\n  ---- how each number above was reached ----\n"
                     "  C_p(2001 USD) = 10^( K1 + K2 log10 S + K3 (log10 S)^2 )"
                     "     [log-quadratic]\n"
                     "                 = Cp_ref (S/S_ref)^n                    "
                     "     [power-law, where declared]\n"
                     "  C_p           = C_p(2001) x CEPCI/CEPCI_2001 x EUR/USD\n"
                     "  C_BM          = C_p x ( B1 + B2 F_M F_P )\n"
                     "  C_TM          = 1.18 x C_BM      (contingency + fee)\n";
        std::cout << "  index: CEPCI " << std::fixed << std::setprecision(1)
                  << cepci << " / " << cepci2001;
        if (cepci2001 > 0.0)
            std::cout << " = " << std::setprecision(4) << cepci / cepci2001;
        std::cout << "     currency: " << std::setprecision(4) << fx
                  << " EUR/USD     basis: 2001 USD\n\n";

        std::cout << "  " << std::left
                  << std::setw(int(wName)) << "unit"
                  << std::setw(16) << "correlation"
                  << std::setw(20) << "size driver S"
                  << std::setw(26) << "coefficients"
                  << std::setw(12) << "B1, B2"
                  << "F_M (material)\n  " << std::string(103 + wName - 14, '-') << "\n";

        for (const auto& [uname, entry] : result.costs)
        {
            //  A STRUCTURED BINDING CANNOT BE CAPTURED BY A LAMBDA IN C++17
            //  -- it became legal only in C++20.  g++ accepts it as an
            //  extension and emscripten's clang does not, so writing
            //  `[&]{ ... cb.factors ... }` over `auto& [uname, cb]` compiles
            //  natively, passes the whole suite, and kills `make wasm`:
            //      error: reference to local binding 'cb' declared in
            //      enclosing function
            //  which is what took www.choupo.org three commits stale.  The
            //  ordinary reference below is capturable, and the trap is the
            //  same one CLAUDE.md §13 names: the WASM build is SEPARATE and
            //  is not in bin/runTests.
            const CostBreakdown& cb = entry;
            auto f = [&](const char* k) -> scalar {
                auto it = cb.factors.find(k);
                return it == cb.factors.end() ? 0.0 : it->second;
            };
            //  ENOUGH DIGITS TO REPRODUCE, and `std::fixed` with them.
            //  The first version of this block used setprecision() on a fresh
            //  stream, which is SIGNIFICANT digits, and printed `B1, B2 =
            //  2.2, 1.8` and `F_M = 3`.  A reader doing the arithmetic then
            //  gets 2.2 + 1.8 x 3 = 7.6 against the 7.801 that produced the
            //  total, is out by 2.6 %, and concludes THEY made the mistake.
            //  A provenance line too coarse to reproduce is worse than none:
            //  it invites a failed reproduction and blames the reader.
            std::ostringstream sz, co, bb, fm;
            sz << cb.sizeKey << " = " << std::fixed << std::setprecision(4)
               << f("S");
            if (cb.correlation == "power-law")
                //  Cp_ref runs to 1e5-1e6; four DECIMALS there is noise, so
                //  the power-law row keeps significant digits by design.
                co << std::setprecision(6) << f("Cp_ref") << ", "
                   << f("S_ref") << ", " << f("n_exp");
            else
                co << std::fixed << std::setprecision(4) << f("K1") << ", "
                   << f("K2") << ", " << f("K3");
            bb << std::fixed << std::setprecision(2) << f("B1") << ", "
               << f("B2");
            fm << std::fixed << std::setprecision(2) << f("F_M")
               << " (" << cb.material << ")";

            std::cout << "  " << std::left
                      << std::setw(int(wName)) << uname
                      << std::setw(16) << cb.correlation
                      << std::setw(20) << sz.str()
                      << std::setw(26) << co.str()
                      << std::setw(12) << bb.str()
                      << fm.str() << "\n";
        }
        //  WHERE THE COEFFICIENTS COME FROM -- named, because a formula with
        //  anonymous constants is still not checkable.  F_M is NOT listed
        //  here: it is a per-material datum and its own record carries its
        //  citation, which is the one home it should have.
        std::cout << "\n  K1-K3, B1, B2 and the 1.18: Turton et al., "
                     "\"Analysis, Synthesis and Design of\n"
                     "  Chemical Processes\", Appendix A (2001 USD basis).  "
                     "F_M is cited in its own\n  material record "
                     "(data/standards/assets/<material>.dat).\n";
    }
    std::cout << "=====================================================================\n\n";
    return failures;
}

} // namespace Choupo
