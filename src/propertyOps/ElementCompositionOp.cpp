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
    // Component jobs resolve through THE component-level resolver
    // (formula first, then a declared elementalComposition{} block) and
    // print source + completeness -- the same semantics every balance uses.
    std::vector<std::size_t> compJobs;
    if (dict->found("components"))
        for (const auto& cn : dict->lookupWordList("components"))
        {
            bool hit = false;
            for (std::size_t i = 0; i < thermo.n(); ++i)
                if (thermo.comp(i).name() == cn)
                { compJobs.push_back(i); hit = true; }
            if (!hit)
                throw std::runtime_error("elementalComposition: component '"
                    + cn + "' is not in the loaded set");
        }
    if (jobs.empty() && compJobs.empty())
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
    for (const auto ci : compJobs)
    {
        const auto& c = thermo.comp(ci);
        const auto er = elementalCompositionOf(c);
        const char* src =
            er.source == ElementalResolution::Source::formula
                ? "formula"
          : er.source == ElementalResolution::Source::declaredMassFraction
                ? "declaredMassFraction"
          : er.source == ElementalResolution::Source::declaredFormulaUnit
                ? "declaredFormulaUnit" : "none";
        const char* comp2 =
            er.completeness == ElementalResolution::Completeness::full
                ? "full"
          : er.completeness == ElementalResolution::Completeness::partial
                ? "PARTIAL" : "UNAVAILABLE";
        if (er.completeness
            == ElementalResolution::Completeness::unavailable)
        {
            if (verbosity >= 1)
                std::cout << "  " << c.name() << "  [component]  ->  "
                          << comp2 << ": " << er.reason << "\n";
            continue;
        }
        ++nAvail;
        if (verbosity >= 2)
        {
            std::cout << "  " << c.name() << "  [component, " << src
                      << ", " << comp2 << "]  ->  ";
            bool first = true;
            for (const auto& [sym, na] : er.atoms)
            {
                if (!first) std::cout << "  ";
                std::cout << sym << " " << na;
                first = false;
            }
            if (er.unaccountedMassFraction > 0.0)
                std::cout << "  (unaccounted "
                          << er.unaccountedMassFraction << " kg/kg)";
            std::cout << "\n";
        }
        for (const auto& [sym, na] : er.atoms)
            diag_[c.name() + "_" + sym] = na;
    }
    if (verbosity >= 2)
        std::cout << "  " << nAvail << "/" << (jobs.size() + compJobs.size())
                  << " decomposed\n"
                  << "===========================================\n\n";
    diag_["formulas_total"]     =
        static_cast<scalar>(jobs.size() + compJobs.size());
    diag_["formulas_available"] = static_cast<scalar>(nAvail);
    return 0;
}

} // namespace Choupo
