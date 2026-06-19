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

#include "PropertyScan1D.H"
#include "PropertyEvaluator.H"
#include "thermo/ThermoPackage.H"

#include <algorithm>
#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

int PropertyScan1D::run(const DictPtr& dict,
                        const ThermoPackage& globalThermo,
                        int verbosity)
{
    // Per-op thermo override (the `thermo {}` block on the operation,
    // when present, REPLACES the matching model sub-dicts of the global
    // thermoPackage for this run).  This is how multi-model comparisons
    // work --- e.g. one op with SRK and one with PR on the same axes.
    auto override = thermoForOp(dict);
    const ThermoPackage& thermo = override ? *override : globalThermo;

    // -- vary block --------------------------------------------------------
    auto varyDict = dict->subDict("vary");
    const std::string variable = varyDict->lookupWord("variable");

    // Determine dimensions of the swept variable, so the parser checks
    // units against expectation.
    Dimensions varDims;
    if      (variable == "T") varDims = Dims::temperature;
    else if (variable == "P") varDims = Dims::pressure;
    else if (variable.rfind("x[", 0) == 0)
        varDims = Dims::dimensionless;
    else
        throw std::runtime_error("PropertyScan1D: 'variable' must be T, P, "
                                 "or x[<componentName>]; got '" + variable + "'");

    const scalar from_val = varyDict->lookupScalar("from", varDims);
    const scalar to_val   = varyDict->lookupScalar("to",   varDims);

    std::size_t nPoints = 0;
    if (varyDict->found("n"))
        nPoints = static_cast<std::size_t>(varyDict->lookupScalar("n"));
    else if (varyDict->found("step"))
    {
        const scalar step = varyDict->lookupScalar("step", varDims);
        nPoints = static_cast<std::size_t>(std::abs((to_val - from_val) / step)) + 1;
    }
    else
        nPoints = 21;        // sensible default

    if (nPoints < 2)
        throw std::runtime_error("PropertyScan1D: need n >= 2 points");

    // -- state block -------------------------------------------------------
    auto stateDict = dict->subDict("state");
    auto compDict  = stateDict->subDict("composition");

    const std::size_t n = thermo.n();
    sVector x_ref(n, 0.0);
    scalar xsum = 0.0;
    for (const auto& key : compDict->keys())
    {
        x_ref[thermo.indexOf(key)] = compDict->lookupScalar(key);
        xsum += x_ref[thermo.indexOf(key)];
    }
    for (auto& v : x_ref) v /= xsum;

    // Default T, P from the state block; the swept variable overrides
    // the corresponding default at each grid point.
    scalar T_ref = stateDict->found("T")
                       ? stateDict->lookupScalar("T", Dims::temperature)
                     : 298.15;
    scalar P_ref = stateDict->found("P")
                       ? stateDict->lookupScalar("P", Dims::pressure)
                     : 1.0e5;

    // For x[<comp>] sweeps, the SECOND component is whatever else has
    // composition --- typically a binary, so the sweep walks x_i and
    // x_j = 1 - x_i.  We identify the partner from x_ref.
    std::size_t sweepCompIdx = n;
    std::size_t partnerIdx   = n;
    if (variable.rfind("x[", 0) == 0)
    {
        const auto end = variable.find(']');
        if (end == std::string::npos)
            throw std::runtime_error("PropertyScan1D: malformed x[...] in "
                                     "vary.variable");
        const std::string compName = variable.substr(2, end - 2);
        sweepCompIdx = thermo.indexOf(compName);
        // The partner is the component with x > 0 other than sweepCompIdx.
        for (std::size_t i = 0; i < n; ++i)
            if (i != sweepCompIdx && x_ref[i] > 0.0) { partnerIdx = i; break; }
        if (partnerIdx == n)
            throw std::runtime_error("PropertyScan1D: x[" + compName
                + "] sweep needs a binary state (the partner component "
                "must appear in the state.composition with x > 0)");
    }

    // -- properties list ---------------------------------------------------
    auto propWords = dict->lookupWordList("properties");
    if (propWords.empty())
        throw std::runtime_error("PropertyScan1D: 'properties' list is empty");

    // -- output block ------------------------------------------------------
    auto outDict = dict->subDict("output");
    const std::string outFile = outDict->lookupWord("file");

    std::ofstream csv(outFile);
    if (!csv.is_open())
        throw std::runtime_error("PropertyScan1D: cannot open '"
                                 + outFile + "' for writing");

    // CSV header --- swept variable first, then properties.
    csv << variable;
    for (const auto& p : propWords) csv << "," << p;
    csv << "\n";

    // -- Sweep loop --------------------------------------------------------
    if (verbosity >= 2)
    {
        std::cout << "\n=========================  PropertyScan1D  =========================\n"
                  << "  Sweep:   " << variable
                  << "  from " << from_val << "  to " << to_val
                  << "  ( " << nPoints << " points )\n"
                  << "  Output:  " << outFile << "\n"
                  << "  Properties:";
        for (const auto& p : propWords) std::cout << "  " << p;
        std::cout << "\n";
    }

    std::size_t failures = 0;
    std::vector<std::string> reasons;   // distinct failure messages, for an honest note
    for (std::size_t k = 0; k < nPoints; ++k)
    {
        const scalar t = (nPoints == 1)
            ? 0.0
          : static_cast<scalar>(k) / static_cast<scalar>(nPoints - 1);
        const scalar varVal = from_val + t * (to_val - from_val);

        scalar T = T_ref, P_Pa = P_ref;
        sVector x = x_ref;

        if      (variable == "T") T    = varVal;
        else if (variable == "P") P_Pa = varVal;
        else if (sweepCompIdx < n)
        {
            x[sweepCompIdx] = varVal;
            x[partnerIdx]   = 1.0 - varVal;
        }

        csv << varVal;
        for (const auto& p : propWords)
        {
            // Resilient per-property eval (mirrors PropertyScan2D): a property
            // undefined for one component (e.g. Psat of a radical with no
            // vaporPressure) writes `nan` and is dropped by the plotter, instead
            // of aborting the whole scan and killing every other curve.
            try
            {
                const scalar v = propertyOps::evaluateProperty(p, thermo, T, P_Pa, x);
                csv << "," << std::scientific << std::setprecision(8) << v;
            }
            catch (const std::exception& e)
            {
                csv << ",nan";
                ++failures;
                const std::string msg = e.what();
                if (std::find(reasons.begin(), reasons.end(), msg) == reasons.end())
                    reasons.push_back(msg);
            }
        }
        csv << "\n";
    }
    csv.close();

    if (failures > 0 && verbosity >= 1)
    {
        std::cout << "  [note] " << failures << " property evaluation(s) were "
                  << "undefined over the range (written as nan; the plotter drops them).\n";
        for (const auto& r : reasons)
            std::cout << "         - " << r << "\n";
    }

    if (verbosity >= 2)
        std::cout << "  Wrote " << nPoints << " rows to '" << outFile
                  << "'.\n=====================================================================\n\n";

    diag_.clear();
    diag_["n_points"]   = static_cast<scalar>(nPoints);
    diag_["n_failures"] = static_cast<scalar>(failures);
    return 0;
}

} // namespace Choupo
