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

#include "PropertyScanTernary.H"
#include "core/Constants.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/flash/IsothermalFlash.H"
#include "unitOperations/saturation/BubblePoint.H"

#include <algorithm>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

namespace {

// One categorical phase region per node, derived from the SAME fields the
// isothermalFlash unit op reads.  The classification mirrors the VLLE branch
// of IsothermalFlash::solveCore (src/unitOperations/flash/IsothermalFlash.cpp):
//   threePhase==true                       -> VLLE  (line ~618: V + Lα + Lβ)
//   regime "two-phase liquid (LL ..."      -> LL    (line ~590: two liquids)
//   regime "two-phase (VL ..."             -> VL    (line ~606: vapour + liquid)
//   regime "single liquid ..."             -> ONE_PHASE (line ~570)
// If those regime strings are ever reworded, update this lambda in lock-step.
struct Klass
{
    const char* region;
    int         id;
    scalar      bV, bA, bB;   // phase fractions (vapour, liquid-α, liquid-β)
};

Klass classify(const FlashSolution& sol)
{
    if (sol.threePhase)
    {
        const scalar bV = sol.betaVapor;
        const scalar bA = sol.V_over_F;            // β_α by the VLLE convention
        const scalar bB = 1.0 - bV - bA;
        return { "VLLE", 3, bV, bA, bB };
    }
    if (sol.regime.find("two-phase liquid") != std::string::npos)
    {
        const scalar bB = sol.V_over_F;            // a liquid fraction
        return { "LL", 2, 0.0, 1.0 - bB, bB };
    }
    if (sol.regime.find("two-phase") != std::string::npos)   // VL
    {
        const scalar bV = sol.V_over_F;
        return { "VL", 1, bV, 1.0 - bV, 0.0 };
    }
    return { "ONE_PHASE", 0, 0.0, 1.0, 0.0 };       // single liquid
}

} // namespace

int PropertyScanTernary::run(const DictPtr& dict,
                             const ThermoPackage& globalThermo,
                             int verbosity)
{
    // Per-op thermo override (same mechanism as PropertyScan1D/2D).
    auto override = thermoForOp(dict);
    const ThermoPackage& thermo = override ? *override : globalThermo;

    const std::size_t n = thermo.n();
    if (n != 3)
        throw std::runtime_error(
            "propertyScanTernary: needs EXACTLY 3 components in the "
            "thermoPackage; got " + std::to_string(n));

    // -- fixed flash state (T, P).  NO composition here --- the grid IS the
    //    composition; if a composition block is present it is ignored.
    auto stateDict = dict->subDict("state");
    const scalar T = stateDict->found("T")
                         ? stateDict->lookupScalar("T", Dims::temperature)
                       : 298.15;
    const scalar P_Pa = stateDict->found("P")
                            ? stateDict->lookupScalar("P", Dims::pressure)
                          : 1.0e5;
    const scalar P_bar = P_Pa / 1.0e5;     // FlashInput.P is in bar

    // -- grid resolution (intervals per triangle edge).
    std::size_t g = 24;
    if (dict->found("grid"))
    {
        auto gridDict = dict->subDict("grid");
        if (gridDict->found("n"))
            g = static_cast<std::size_t>(gridDict->lookupScalar("n"));
    }
    if (g < 3)
        throw std::runtime_error("propertyScanTernary: grid.n must be >= 3");

    // mode: "lle"/"vlle" (default) = phase-region map via the VLLE flash;
    //       "bubbleT"             = boiling-temperature surface via BubblePoint.
    const std::string mode = dict->found("mode") ? dict->lookupWord("mode") : "lle";

    // Optional work shard for parallel runs (each node is independent): only
    // outer rows with (i % shardN == shardK) are computed.  Round-robin keeps
    // the shards balanced across the triangle.  Default = the whole grid.
    std::size_t shardK = 0, shardN = 1;
    if (dict->found("shard"))
    {
        auto sh = dict->subDict("shard");
        if (sh->found("n")) shardN = std::max<std::size_t>(1, static_cast<std::size_t>(sh->lookupScalar("n")));
        if (sh->found("k")) shardK = static_cast<std::size_t>(sh->lookupScalar("k"));
    }
    const auto inShard = [&](std::size_t i) { return shardN <= 1 || (i % shardN) == shardK; };

    // ---- VLE boiling-temperature contour (no LL gap / phases block needed) ----
    if (mode == "bubbleT")
    {
        auto outDict = dict->subDict("output");
        const std::string outFile = outDict->lookupWord("file");
        std::ofstream csv(outFile);
        if (!csv.is_open())
            throw std::runtime_error("propertyScanTernary: cannot open '" + outFile + "'");
        csv << "x1,x2,x3,T_bubble\n";
        csv << std::scientific << std::setprecision(8);

        std::size_t nNodes = 0, failures = 0;
        for (std::size_t i = 0; i <= g; ++i)
        {
            if (!inShard(i)) continue;
            const scalar x1 = static_cast<scalar>(i) / static_cast<scalar>(g);
            for (std::size_t j = 0; j <= g - i; ++j)
            {
                const scalar x2 = static_cast<scalar>(j) / static_cast<scalar>(g);
                scalar x3 = 1.0 - x1 - x2;
                if (x3 < 0.0) { if (x3 < -1e-9) continue; x3 = 0.0; }
                // skip the 3 pure vertices (two fractions zero): trivial points.
                const int nz = (x1 > 1e-9) + (x2 > 1e-9) + (x3 > 1e-9);
                if (nz < 2) continue;
                const sVector x{ x1, x2, x3 };
                try
                {
                    const auto r = BubblePoint::compute(thermo, x, P_Pa);
                    if (!r.converged) { ++failures; continue; }
                    csv << x1 << "," << x2 << "," << x3 << "," << r.T << "\n";
                    ++nNodes;
                }
                catch (const std::exception&) { ++failures; }
            }
        }
        csv.close();
        if (verbosity >= 2)
            std::cout << "\n=========================  PropertyScanTernary (bubbleT)  ==========\n"
                      << "  T_bubble surface at P = " << P_bar << " bar,  grid n = " << g << "\n"
                      << "  nodes: " << nNodes << ",  failures: " << failures << "\n"
                      << "====================================================================\n";
        diag_["n_nodes"]  = static_cast<scalar>(nNodes);
        diag_["failures"] = static_cast<scalar>(failures);
        return 0;
    }

    if (mode != "lle" && mode != "vlle")
        throw std::runtime_error("propertyScanTernary: unknown mode '" + mode
                                 + "' (expected lle | vlle | bubbleT)");

    const std::size_t tieStride = dict->found("tieStride")
        ? std::max<std::size_t>(1, static_cast<std::size_t>(dict->lookupScalar("tieStride")))
        : 3;

    // -- output -----------------------------------------------------------
    auto outDict = dict->subDict("output");
    const std::string outFile = outDict->lookupWord("file");

    std::ofstream csv(outFile);
    if (!csv.is_open())
        throw std::runtime_error("propertyScanTernary: cannot open '"
                                 + outFile + "' for writing");

    csv << "x1,x2,x3,region,region_id,kind,tieline_id,"
           "beta_vapor,beta_alpha,beta_beta\n";
    csv << std::scientific << std::setprecision(8);

    // Reuse the flash path verbatim --- the diagram cannot disagree with a
    // single isothermalFlash because it IS the same solveCore.  `mode lle`
    // (solubility) uses the LIQUID-LIQUID flash: a clean binodal + tie-lines
    // with no spurious subcooled "vapour" (the extraction/decanter view).
    // `mode vlle` keeps the full vapour + 2-liquid classification.
    FlashOptions opts;
    opts.phaseSet  = (mode == "vlle") ? PhaseSet::VLLE : PhaseSet::LL;
    opts.verbosity = 0;                    // no per-node log spam

    std::size_t nNodes = 0, nVlle = 0, nLl = 0, nVl = 0, nOne = 0;
    std::size_t failures = 0, splitSeen = 0, nTie = 0;

    if (verbosity >= 2)
        std::cout << "\n=========================  PropertyScanTernary  ====================\n"
                  << "  T = " << T << " K,  P = " << P_bar << " bar\n"
                  << "  grid n = " << g << " (interior nodes), tieStride = " << tieStride << "\n"
                  << "  Output: " << outFile << "\n";

    auto writeNode = [&](scalar x1, scalar x2, scalar x3, const Klass& k)
    {
        csv << x1 << "," << x2 << "," << x3 << ","
            << k.region << "," << k.id << ",node,-1,"
            << k.bV << "," << k.bA << "," << k.bB << "\n";
    };
    auto writeTie = [&](const sVector& xp, const char* region, int id, long tieId)
    {
        csv << xp[0] << "," << xp[1] << "," << xp[2] << ","
            << region << "," << id << ",tie," << tieId
            << ",0,0,0\n";
    };

    // Interior simplex sweep: x1=i/g, x2=j/g, x3=1-x1-x2, all strictly > 0.
    for (std::size_t i = 1; i < g; ++i)
    {
        if (!inShard(i)) continue;
        const scalar x1 = static_cast<scalar>(i) / static_cast<scalar>(g);
        for (std::size_t j = 1; j < g - i; ++j)
        {
            const scalar x2 = static_cast<scalar>(j) / static_cast<scalar>(g);
            const scalar x3 = 1.0 - x1 - x2;
            if (x3 <= 0.0) continue;

            FlashInput in;
            in.F = 1.0;          // kmol/h (arbitrary --- result is intensive)
            in.T = T;
            in.P = P_Pa;        // FlashInput.P is in Pa (SI), not bar
            in.z = sVector{ x1, x2, x3 };

            FlashSolution sol;
            try
            {
                sol = IsothermalFlash::solveCore(in, thermo, opts);
            }
            catch (const std::exception&)
            {
                ++failures;
                continue;        // honest: skip, never fake a classification
            }

            const Klass k = classify(sol);
            writeNode(x1, x2, x3, k);
            ++nNodes;
            if      (k.id == 3) ++nVlle;
            else if (k.id == 2) ++nLl;
            else if (k.id == 1) ++nVl;
            else                ++nOne;

            // A liquid-liquid tie-line connects the two liquid compositions
            // (sol.x = α, sol.y = β).  Emit on a coarser stride so the
            // triangle is not swamped with one tie-line per node.
            const bool split = (k.id == 2 || k.id == 3);
            if (split)
            {
                if ((splitSeen % tieStride) == 0
                    && sol.x.size() == 3 && sol.y.size() == 3)
                {
                    const long tieId = static_cast<long>(nTie);
                    writeTie(sol.x, k.region, k.id, tieId);
                    writeTie(sol.y, k.region, k.id, tieId);
                    ++nTie;
                }
                ++splitSeen;
            }
        }
    }
    csv.close();

    if (verbosity >= 2)
        std::cout << "  nodes: " << nNodes
                  << "  (VLLE " << nVlle << ", LL " << nLl
                  << ", VL " << nVl << ", 1-phase " << nOne << ")"
                  << "  tie-lines: " << nTie
                  << "  failures: " << failures << "\n"
                  << "====================================================================\n";

    diag_["n_nodes"]    = static_cast<scalar>(nNodes);
    diag_["n_vlle"]     = static_cast<scalar>(nVlle);
    diag_["n_ll"]       = static_cast<scalar>(nLl);
    diag_["n_vl"]       = static_cast<scalar>(nVl);
    diag_["n_onephase"] = static_cast<scalar>(nOne);
    diag_["n_tielines"] = static_cast<scalar>(nTie);
    diag_["failures"]   = static_cast<scalar>(failures);

    return 0;
}

} // namespace Choupo
