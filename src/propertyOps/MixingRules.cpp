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

#include "MixingRules.H"
#include "core/Constants.H"
#include "thermo/ThermoPackage.H"
#include "thermo/equationOfState/EquationOfState.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

int MixingRules::run(const DictPtr& dict,
                     const ThermoPackage& globalThermo,
                     int verbosity)
{
    auto override = thermoForOp(dict);
    const ThermoPackage& thermo = override ? *override : globalThermo;

    const std::string opName = dict->lookupWordOrDefault("name", "?");

    auto stateDict = dict->subDict("state");
    auto compDict  = stateDict->subDict("composition");
    const scalar T    = stateDict->lookupScalar("T", Dims::temperature);
    const scalar P_Pa = stateDict->lookupScalar("P", Dims::pressure);

    const std::size_t n = thermo.n();
    sVector y(n, 0.0);
    scalar ysum = 0.0;
    for (const auto& key : compDict->keys())
    {
        std::size_t i = thermo.indexOf(key);
        y[i] = compDict->lookupScalar(key);
        ysum += y[i];
    }
    for (auto& v : y) v /= ysum;

    if (!thermo.hasEos())
        throw std::runtime_error("mixingRules '" + opName
            + "': the declared system prices no phase through an equation"
              " of state -- there is no a_mix here to decompose.  Declare a"
              " cubic (SRK / PengRobinson) in the case's equationOfState"
              " block to ask this question.");

    const EquationOfState& eos = thermo.eos();
    EquationOfState::MixingLedger lg;
    if (!eos.mixingLedger(T, y, lg))
        throw std::runtime_error("mixingRules '" + opName
            + "': the model '" + eos.modelName() + "' declares no van der"
              " Waals one-fluid mixing rule -- ideal gas has no a at all,"
              " and PC-SAFT mixes inside its segment dispersion sum, so"
              " this table would describe arithmetic the model does not"
              " run.  Declare SRK or PengRobinson to see the one-fluid"
              " decomposition.");

    //  ---- the re-addition: each pair term from the ledger's own numbers.
    //  For i < j the symmetric double sum contributes twice, so the pair's
    //  ADDITIVE term is 2·y_i·y_j·(1−k_ij)·√(a_i a_j); the diagonal is
    //  y_i²·a_i (k_ii = 0 by construction).  The published terms must sum
    //  back to the a_mix the hot path computed.
    scalar aRebuilt = 0.0, bRebuilt = 0.0;
    std::size_t pairsNonzeroKij = 0;
    for (std::size_t i = 0; i < n; ++i)
    {
        bRebuilt += y[i] * lg.b[i];
        for (std::size_t j = i; j < n; ++j)
        {
            const scalar mult = (i == j) ? 1.0 : 2.0;
            const scalar term = mult * y[i] * y[j]
                              * (1.0 - lg.kij[i][j])
                              * std::sqrt(lg.a[i] * lg.a[j]);
            aRebuilt += term;
            const std::string ni = thermo.comp(i).name();
            const std::string nj = thermo.comp(j).name();
            diag_["term_" + ni + "_" + nj] = term;
            if (i != j)
            {
                diag_["kij_" + ni + "_" + nj] = lg.kij[i][j];
                if (lg.kij[i][j] != 0.0) ++pairsNonzeroKij;
            }
        }
    }

    const scalar gapA = std::abs(aRebuilt - lg.a_mix);
    const scalar gapB = std::abs(bRebuilt - lg.b_mix);
    auto tooBig = [](scalar gap, scalar ref)
    { return gap > 1.0e-10 * std::max(std::abs(ref), scalar(1.0e-30)); };
    if (tooBig(gapA, lg.a_mix) || tooBig(gapB, lg.b_mix))
        throw std::runtime_error("mixingRules '" + opName
            + "': the re-added pair terms do NOT reproduce the engine's"
              " a_mix/b_mix (gaps " + std::to_string(gapA) + ", "
            + std::to_string(gapB) + ") -- this explanation and "
            + eos.modelName() + "::buildMix disagree, which is an engine or"
              " ledger defect, never something to publish as an"
              " explanation.");

    //  The dimensionless pair and the roots -- engine calls, so the reader
    //  can walk from the pair table into the cubic the flash solves.
    const scalar RT = constant::R * T;
    const scalar A  = lg.a_mix * P_Pa / (RT * RT);   // re-stated definition
    const scalar B  = lg.b_mix * P_Pa / RT;          // re-stated definition
    const scalar Zv = eos.Z(T, P_Pa, y);

    if (verbosity >= 2)
    {
        //  Save/restore the stream's format state: choupoProps' result-JSON
        //  emitter writes values under the AMBIENT precision (the recorded
        //  task-34 defect), so an op must leave the stream as it found it.
        const auto savedFlags = std::cout.flags();
        const auto savedPrec  = std::cout.precision();
        std::cout << "\n=======================  mixingRules: "
                  << eos.modelName()
                  << " one-fluid  =======================\n"
                  << "  State: T = " << std::fixed << std::setprecision(2)
                  << T << " K,  P = " << (P_Pa / 1.0e5) << " bar\n\n"
                  << "  Pure parameters (a_i in Pa*m^6/mol^2, b_i in"
                     " m^3/mol):\n" << std::scientific
                  << std::setprecision(6);
        for (std::size_t i = 0; i < n; ++i)
            std::cout << "    " << std::setw(14) << std::left
                      << thermo.comp(i).name() << std::right
                      << "  y = " << std::fixed << std::setprecision(4)
                      << y[i] << "   a = " << std::scientific
                      << std::setprecision(6) << lg.a[i]
                      << "   b = " << lg.b[i] << "\n";
        std::cout << "\n  Pair terms of a_mix = sum_i sum_j y_i y_j"
                     " (1 - kij) sqrt(a_i a_j)\n"
                  << "  (off-diagonal terms carry the symmetric factor"
                     " 2):\n";
        for (std::size_t i = 0; i < n; ++i)
            for (std::size_t j = i; j < n; ++j)
            {
                const std::string pairName =
                    thermo.comp(i).name() + "-" + thermo.comp(j).name();
                std::cout << "    " << std::setw(22) << std::left
                          << pairName << std::right << "  kij = "
                          << std::fixed << std::setprecision(4)
                          << lg.kij[i][j] << "   term = "
                          << std::scientific << std::setprecision(6)
                          << diag_["term_" + thermo.comp(i).name() + "_"
                                   + thermo.comp(j).name()] << "\n";
            }
        std::cout << "  ------------------------------------------------------------\n"
                  << "  a_mix (engine)   = " << lg.a_mix
                  << "   re-added: " << aRebuilt << "   gap: "
                  << std::setprecision(1) << gapA << "\n"
                  << std::setprecision(6)
                  << "  b_mix (engine)   = " << lg.b_mix
                  << "   re-added: " << bRebuilt << "   gap: "
                  << std::setprecision(1) << gapB << "\n\n"
                  << std::setprecision(6)
                  << "  A = a_mix*P/(RT)^2 = " << A
                  << "   B = b_mix*P/(RT) = " << B << "\n"
                  << "  Z (vapour root of the cubic) = " << std::fixed
                  << std::setprecision(6) << Zv << "\n"
                  << "==========================================================================\n\n";
        std::cout.flags(savedFlags);
        std::cout.precision(savedPrec);
    }

    diag_["T_K"]  = T;
    diag_["P_Pa"] = P_Pa;
    for (std::size_t i = 0; i < n; ++i)
    {
        const std::string ni = thermo.comp(i).name();
        diag_["y_" + ni] = y[i];
        diag_["a_" + ni] = lg.a[i];
        diag_["b_" + ni] = lg.b[i];
    }
    diag_["a_mix"] = lg.a_mix;
    diag_["b_mix"] = lg.b_mix;
    diag_["dadT_mix"] = lg.dadT_mix;
    diag_["A"] = A;
    diag_["B"] = B;
    diag_["Z_vapour"] = Zv;
    diag_["gap_a_mix"] = gapA;
    diag_["gap_b_mix"] = gapB;
    diag_["pairs_total"] = scalar(n * (n - 1) / 2);
    diag_["pairs_kij_nonzero"] = scalar(pairsNonzeroKij);

    return 0;
}

} // namespace Choupo
