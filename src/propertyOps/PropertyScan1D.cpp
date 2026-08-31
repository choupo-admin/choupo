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
#include "core/Advisory.H"

#include <algorithm>
#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
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
    {
        //  A DEFAULT THAT DECIDES THE RESOLUTION OF A PUBLISHED CURVE MUST SAY
        //  SO.  21 is a reasonable number and a silent one is still a choice
        //  the author did not make; `temperature01` reached it by writing
        //  `points 25;`, which nothing reads, and no line of output
        //  distinguished that from a case that meant 21.
        nPoints = 21;
        if (verbosity >= 1)
            std::cout << "  [scan] neither `n` nor `step` declared -- using the"
                         " default of " << nPoints << " points.\n";
    }

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
    //  PER-CURVE, not just a total.  A scan where a few points drop at the
    //  edges of a range is a legitimate scan with holes; one where a curve
    //  lost EVERY point produced no curve at all, and the two must not be
    //  reported by the same sentence.
    std::map<std::string, std::size_t> failedPerProp;
    std::map<std::string, std::string> firstReasonPerProp;

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

        //  Same sticky-flag trap as PropertyScan2D: the first property value
        //  below switches the stream to scientific and leaves it there, so
        //  the FIRST row printed its T as `280` and every row after it as
        //  `2.82000000e+02` -- one column, two renderings, decided by whether
        //  a property had been written yet.
        csv << std::scientific << std::setprecision(8) << varVal;
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
                ++failedPerProp[p];       // WHICH curve lost this point
                const std::string msg = e.what();
                if (std::find(reasons.begin(), reasons.end(), msg) == reasons.end())
                    reasons.push_back(msg);
                if (firstReasonPerProp.find(p) == firstReasonPerProp.end())
                    firstReasonPerProp[p] = msg;
            }
        }
        csv << "\n";
    }
    csv.close();

    //  TWO OUTCOMES, AND THEY ARE NOT THE SAME THING.
    //
    //  A curve that lost some points at the edges of its range is a scan with
    //  holes: the plotter drops them and the answer stands.  A curve that lost
    //  EVERY point produced NO CURVE AT ALL, and reporting both with one
    //  sentence -- "undefined over the range" -- hides the second inside the
    //  first.  Worse, the word is wrong for the commonest cause: a MISSING
    //  DATUM is not a property that is undefined there, it is a property that
    //  could not be asked.  `propertyPoint` already refuses such a case BY
    //  NAME; this op caught the same exception, wrote `nan`, and exited 0.
    //
    //  Found 2026-08-12 on a bootstrapped isopropanol: four points of four
    //  came back nan, the run ended "ASSUMPTIONS AND CAVEATS: none raised",
    //  and the exit code said success.  The note below was a bare `cout`, so
    //  it reached neither the caveat surface nor the result JSON.
    std::vector<std::string> emptyCurves;
    for (const auto& [prop, nBad] : failedPerProp)
        if (nBad >= nPoints) emptyCurves.push_back(prop);

    if (failures > 0 && verbosity >= 1)
    {
        //  Written out rather than crammed onto two lines: at one statement
        //  per line the `return` is visibly OUTSIDE the loop, which is what it
        //  has always been.  -Wmisleading-indentation was right to complain --
        //  the code was correct and read as though it were not.
        const std::size_t partial = failures
            - [&]
              {
                  std::size_t k = 0;
                  for (const auto& c : emptyCurves)
                      k += failedPerProp[c];
                  return k;
              }();
        if (partial > 0)
            std::cout << "  [note] " << partial << " property evaluation(s) "
                      << "were undefined at some points of the range (written "
                      << "as nan; the plotter drops them).\n";
        for (const auto& r : reasons)
            std::cout << "         - " << r << "\n";
    }

    //  The empty curves ride the ADVISORY LOG, not a bare cout: that is what
    //  puts them in the end-of-run caveat block and in the result JSON, where
    //  a reader who never watched the console still meets them.
    for (const auto& c : emptyCurves)
    {
        const std::string why = firstReasonPerProp.count(c)
                              ? firstReasonPerProp[c] : std::string("(no reason recorded)");
        AdvisoryLog::instance().add("refusal", "warning",
            "propertyScan1D -> " + outFile,
            "property '" + c + "' produced NO value at any of the "
            + std::to_string(nPoints) + " points -- this is not a curve with "
            "gaps, it is an absent curve.  Reason at the first point: " + why);
        if (verbosity >= 1)
            std::cout << "  [REFUSED] property '" << c << "': no value at any "
                      << "of the " << nPoints << " points -- the column in the "
                      << "CSV is entirely nan.\n             " << why << "\n";
    }

    if (verbosity >= 2)
        std::cout << "  Wrote " << nPoints << " rows to '" << outFile
                  << "'.\n=====================================================================\n\n";

    diag_.clear();
    diag_["n_points"]      = static_cast<scalar>(nPoints);
    diag_["n_failures"]    = static_cast<scalar>(failures);
    diag_["n_emptyCurves"] = static_cast<scalar>(emptyCurves.size());
    //  A scan that produced no curve did not succeed.  Exiting 0 with a file
    //  full of `nan` is the shape the corpus NaN guard exists to catch, and it
    //  was reachable here without ever tripping it.
    return emptyCurves.empty() ? 0 : 1;
}

} // namespace Choupo
