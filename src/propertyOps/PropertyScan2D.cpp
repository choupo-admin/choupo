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

#include "PropertyScan2D.H"
#include "PropertyEvaluator.H"
#include "core/Constants.H"
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

namespace {

// Parse a `vary` sub-block into:  variable name, sweep dimensions,
// the [from, to] range and the number of points.  Shared between
// varyX and varyY so both axes follow the same syntax.
struct AxisSpec
{
    std::string variable;        // "T", "P", or "x[<comp>]"
    scalar      from = 0.0;
    scalar      to   = 0.0;
    std::size_t n    = 21;
    Dimensions  dims;            // dimensions of `from` / `to` (for unit-check)
};

AxisSpec parseAxis(const DictPtr& varyDict, const std::string& tag)
{
    AxisSpec ax;
    ax.variable = varyDict->lookupWord("variable");

    if      (ax.variable == "T") ax.dims = Dims::temperature;
    else if (ax.variable == "P") ax.dims = Dims::pressure;
    else if (ax.variable.rfind("x[", 0) == 0)
        ax.dims = Dims::dimensionless;
    else
        throw std::runtime_error("PropertyScan2D: " + tag
            + ".variable must be T, P, or x[<componentName>]; got '"
            + ax.variable + "'");

    ax.from = varyDict->lookupScalar("from", ax.dims);
    ax.to   = varyDict->lookupScalar("to",   ax.dims);

    if (varyDict->found("n"))
        ax.n = static_cast<std::size_t>(varyDict->lookupScalar("n"));
    else if (varyDict->found("step"))
    {
        const scalar step = varyDict->lookupScalar("step", ax.dims);
        ax.n = static_cast<std::size_t>(std::abs((ax.to - ax.from) / step)) + 1;
    }
    if (ax.n < 2)
        throw std::runtime_error("PropertyScan2D: " + tag + ".n must be >= 2");
    return ax;
}

// Resolve the partner component for an x[<comp>] axis from state.composition.
// Returns (sweepIdx, partnerIdx); both equal n() to flag "not an x[] axis".
struct AxisBinding
{
    std::size_t sweepIdx   = 0;
    std::size_t partnerIdx = 0;
    bool        isX        = false;
};

AxisBinding bindAxis(const AxisSpec& ax,
                     const ThermoPackage& thermo,
                     const sVector& x_ref)
{
    AxisBinding b;
    b.sweepIdx = b.partnerIdx = thermo.n();
    if (ax.variable.rfind("x[", 0) != 0) return b;

    const auto end = ax.variable.find(']');
    if (end == std::string::npos)
        throw std::runtime_error("PropertyScan2D: malformed x[...] in axis");
    const std::string compName = ax.variable.substr(2, end - 2);
    b.sweepIdx = thermo.indexOf(compName);
    for (std::size_t i = 0; i < thermo.n(); ++i)
        if (i != b.sweepIdx && x_ref[i] > 0.0) { b.partnerIdx = i; break; }
    if (b.partnerIdx == thermo.n())
        throw std::runtime_error("PropertyScan2D: x[" + compName
            + "] sweep needs a binary state (partner component must "
            "appear in state.composition with x > 0)");
    b.isX = true;
    return b;
}

scalar lerp(scalar a, scalar b, std::size_t k, std::size_t nPoints)
{
    if (nPoints <= 1) return a;
    return a + (b - a)
              * (static_cast<scalar>(k) / static_cast<scalar>(nPoints - 1));
}

} // anonymous namespace

int PropertyScan2D::run(const DictPtr& dict,
                        const ThermoPackage& globalThermo,
                        int verbosity)
{
    // Per-op thermo override (the `thermo {}` block on the operation,
    // when present, REPLACES the matching model sub-dicts).  Same
    // mechanism as in PropertyScan1D / PropertyPoint.
    auto override = thermoForOp(dict);
    const ThermoPackage& thermo = override ? *override : globalThermo;

    // -- Axes --------------------------------------------------------------
    const AxisSpec axX = parseAxis(dict->subDict("varyX"), "varyX");
    const AxisSpec axY = parseAxis(dict->subDict("varyY"), "varyY");

    if (axX.variable == axY.variable)
        throw std::runtime_error(
            "PropertyScan2D: varyX and varyY must use different variables");

    // -- state -------------------------------------------------------------
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

    scalar T_ref = stateDict->found("T")
                       ? stateDict->lookupScalar("T", Dims::temperature)
                     : 298.15;
    scalar P_ref = stateDict->found("P")
                       ? stateDict->lookupScalar("P", Dims::pressure)
                     : 1.0e5;

    const AxisBinding bindX = bindAxis(axX, thermo, x_ref);
    const AxisBinding bindY = bindAxis(axY, thermo, x_ref);
    if (bindX.isX && bindY.isX)
        throw std::runtime_error(
            "PropertyScan2D: sweeping x on BOTH axes is not supported in a "
            "binary state (would force x_sweepY = 1 - x_sweepX out of the "
            "grid).  Use one axis for x[<comp>] and the other for T or P.");

    // -- properties --------------------------------------------------------
    auto propWords = dict->lookupWordList("properties");
    if (propWords.empty())
        throw std::runtime_error("PropertyScan2D: 'properties' list is empty");

    // -- output ------------------------------------------------------------
    auto outDict = dict->subDict("output");
    const std::string outFile = outDict->lookupWord("file");

    std::ofstream csv(outFile);
    if (!csv.is_open())
        throw std::runtime_error("PropertyScan2D: cannot open '"
                                 + outFile + "' for writing");

    csv << axX.variable << "," << axY.variable;
    for (const auto& p : propWords) csv << "," << p;
    csv << "\n";

    if (verbosity >= 2)
    {
        std::cout << "\n=========================  PropertyScan2D  =========================\n"
                  << "  varyX:   " << axX.variable
                  << "  from " << axX.from << " to " << axX.to
                  << "  ( " << axX.n << " points )\n"
                  << "  varyY:   " << axY.variable
                  << "  from " << axY.from << " to " << axY.to
                  << "  ( " << axY.n << " points )\n"
                  << "  Output:  " << outFile << "   ("
                  << (axX.n * axY.n) << " rows)\n"
                  << "  Properties:";
        for (const auto& p : propWords) std::cout << "  " << p;
        std::cout << "\n";
    }

    // -- Grid loop ---------------------------------------------------------
    // Outer loop: varyX  (slow axis --- pandas pivot reads X as the index
    // column, Y as the columns).  Inner loop: varyY.
    std::size_t failures = 0;
    for (std::size_t ix = 0; ix < axX.n; ++ix)
    {
        const scalar xVal = lerp(axX.from, axX.to, ix, axX.n);
        for (std::size_t iy = 0; iy < axY.n; ++iy)
        {
            const scalar yVal = lerp(axY.from, axY.to, iy, axY.n);

            scalar T = T_ref, P_Pa = P_ref;
            sVector x = x_ref;

            auto applyAxis = [&](const AxisSpec& ax,
                                 const AxisBinding& b, scalar val)
            {
                if      (ax.variable == "T") T = val;
                else if (ax.variable == "P") P_Pa = val;
                else if (b.isX)
                {
                    x[b.sweepIdx]   = val;
                    x[b.partnerIdx] = 1.0 - val;
                }
            };
            applyAxis(axX, bindX, xVal);
            applyAxis(axY, bindY, yVal);

            csv << xVal << "," << yVal;
            for (const auto& p : propWords)
            {
                try
                {
                    const scalar v = propertyOps::evaluateProperty(p, thermo, T, P_Pa, x);
                    csv << "," << std::scientific << std::setprecision(8) << v;
                }
                catch (const std::exception&)
                {
                    csv << ",nan";
                    ++failures;
                }
            }
            csv << "\n";
        }
    }
    csv.close();

    if (verbosity >= 2)
    {
        std::cout << "  Wrote " << (axX.n * axY.n) << " rows to '"
                  << outFile << "'";
        if (failures > 0)
            std::cout << "   (" << failures
                      << " property evaluations returned NaN --- check thermo limits)";
        std::cout << "\n=====================================================================\n\n";
    }

    diag_.clear();
    diag_["n_x"]      = static_cast<scalar>(axX.n);
    diag_["n_y"]      = static_cast<scalar>(axY.n);
    diag_["n_points"] = static_cast<scalar>(axX.n * axY.n);
    diag_["failures"] = static_cast<scalar>(failures);
    return 0;
}

} // namespace Choupo
