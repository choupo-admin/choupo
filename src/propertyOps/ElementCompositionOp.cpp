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

#include "propertyOps/ElementCompositionOp.H"

#include "thermo/ElementComposition.H"
#include "thermo/ThermoPackage.H"

#include <iostream>

namespace Choupo {

int ElementCompositionOp::run(const DictPtr& dict,
                              const ThermoPackage& thermo,
                              int verbosity)
{
    // (formula label, formula string) in declaration order.
    std::vector<std::pair<std::string, std::string>> jobs;
    if (dict->found("formulas"))
        for (const auto& f : dict->lookupWordList("formulas"))
            jobs.emplace_back(f, f);
    if (dict->found("components"))
        for (const auto& cn : dict->lookupWordList("components"))
        {
            bool hit = false;
            for (std::size_t i = 0; i < thermo.n(); ++i)
                if (thermo.comp(i).name() == cn)
                { jobs.emplace_back(cn, thermo.comp(i).formula()); hit = true; }
            if (!hit)
                throw std::runtime_error("elementalComposition: component '"
                    + cn + "' is not in the loaded set");
        }
    if (jobs.empty())
        throw std::runtime_error("elementalComposition: declare `formulas"
            " ( ... )` and/or `components ( ... )`");

    std::size_t nAvail = 0;
    if (verbosity >= 2)
        std::cout << "\n=========  elemental composition  =========\n";
    for (const auto& [label, formula] : jobs)
    {
        const auto ec = parseElementalFormula(formula);
        if (ec.available)
        {
            ++nAvail;
            if (verbosity >= 2)
            {
                std::cout << "  " << label << "  (" << formula << ")  ->  ";
                bool first = true;
                for (const auto& [sym, na] : ec.atoms)
                {
                    if (!first) std::cout << "  ";
                    std::cout << sym << " " << na;
                    first = false;
                }
                std::cout << "\n";
            }
            for (const auto& [sym, na] : ec.atoms)
                diag_[label + "_" + sym] = na;
        }
        else if (verbosity >= 1)
            std::cout << "  " << label << "  ->  UNAVAILABLE: " << ec.reason
                      << "\n";
    }
    if (verbosity >= 2)
        std::cout << "  " << nAvail << "/" << jobs.size()
                  << " formula(s) decomposed\n"
                  << "===========================================\n\n";
    diag_["formulas_total"]     = static_cast<scalar>(jobs.size());
    diag_["formulas_available"] = static_cast<scalar>(nAvail);
    return 0;
}

} // namespace Choupo
