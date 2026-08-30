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

#include "ExplainProperty.H"
#include "core/Constants.H"
#include "thermo/ThermoPackage.H"
#include "thermo/equationOfState/EquationOfState.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

int ExplainProperty::run(const DictPtr& dict,
                         const ThermoPackage& globalThermo,
                         int verbosity)
{
    auto override = thermoForOp(dict);
    const ThermoPackage& thermo = override ? *override : globalThermo;

    const std::string opName = dict->lookupWordOrDefault("name", "?");
    const std::string prop   = dict->lookupWord("property");

    const bool wantS = (prop == "S_real" || prop == "S_ig");
    const bool wantH = (prop == "H_real" || prop == "H_ig");
    const bool wantResidual = (prop == "S_real" || prop == "H_real");
    if (!wantS && !wantH)
        throw std::runtime_error("explainProperty '" + opName
            + "': cannot explain '" + prop + "' -- this operation explains"
              " S_real, S_ig, H_real or H_ig today.  For a value without its"
              " ledger, propertyPoint computes the full set.");

    auto stateDict = dict->subDict("state");
    auto compDict  = stateDict->subDict("composition");
    const scalar T    = stateDict->lookupScalar("T", Dims::temperature);
    const scalar P_Pa = stateDict->lookupScalar("P", Dims::pressure);

    const std::size_t n = thermo.n();
    sVector z(n, 0.0);
    scalar zsum = 0.0;
    for (const auto& key : compDict->keys())
    {
        std::size_t i = thermo.indexOf(key);
        z[i] = compDict->lookupScalar(key);
        zsum += z[i];
    }
    for (auto& v : z) v /= zsum;

    //  A pureFluids{} fundamental-equation override answers S_real/H_real
    //  from the release's own surface, not from datum + integral -- this
    //  ledger would mislabel that route, so it refuses by name FIRST.
    //  (A flagged component that is present but MIXED refuses inside the
    //  engine itself, with its own remedy; that refusal propagates.)
    if (wantResidual)
        for (std::size_t i = 0; i < n; ++i)
            if (thermo.hasPureFluid(i) && z[i] > 1.0e-12
                && ThermoPackage::isEffectivelyPure(z, i))
                throw std::runtime_error("explainProperty '" + opName
                    + "': the state is effectively pure in '"
                    + thermo.comp(i).name() + "', which this case routes"
                      " through a pureFluids{} fundamental-equation package."
                      "  Its entropy/enthalpy come from the release's own"
                      " equation, not from the datum-plus-integral ledger"
                      " this operation explains -- explaining it here would"
                      " label the wrong derivation.  Ask at a mixed state,"
                      " or remove the pureFluids selection for this audit.");

    //  ---- the ledger: every number an engine call, or a difference of two.
    constexpr scalar P_ref = 1.0e5;    // the same 1 bar ThermoPackage::S_ig uses

    scalar pureLine = 0.0, mixingLine = 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        if (z[i] <= 0.0) continue;
        const Component& c = thermo.comp(i);
        if (wantS)
        {
            const scalar sPure = c.s_pure_ig(T);          // engine
            const scalar s298  = c.S298();                // the record's datum
            pureLine += z[i] * sPure;
            diag_["s298_" + c.name()]  = s298;
            diag_["dsCp_" + c.name()]  = sPure - s298;    // ∫cp/T, by difference
            diag_["s_ig_" + c.name()]  = sPure;
            if (z[i] > 1.0e-30)                            // the S_ig guard
                mixingLine -= constant::R * z[i] * std::log(z[i]);
        }
        else
        {
            const scalar hPure = c.h_pure_ig(T);          // engine
            const scalar hf298 = c.Hf298();               // the record's datum
            pureLine += z[i] * hPure;
            diag_["hf298_" + c.name()] = hf298;
            diag_["dhCp_" + c.name()]  = hPure - hf298;   // ∫cp, by difference
            diag_["h_ig_" + c.name()]  = hPure;
        }
    }
    const scalar pressureLine =
        wantS ? -constant::R * std::log(P_Pa / P_ref) : 0.0;

    const scalar idealEngine =
        wantS ? thermo.S_ig(T, P_Pa, z) : thermo.H_ig(T, z);
    const scalar idealRebuilt = pureLine + mixingLine + pressureLine;

    const scalar residual = !wantResidual ? 0.0
        : (wantS ? thermo.eos().S_residual(T, P_Pa, z)
                 : thermo.eos().H_residual(T, P_Pa, z));
    const scalar totalEngine = !wantResidual ? idealEngine
        : (wantS ? thermo.S_real(T, P_Pa, z) : thermo.H_real(T, P_Pa, z));
    const scalar totalRebuilt = idealEngine + residual;

    const scalar gapIdeal = std::abs(idealRebuilt - idealEngine);
    const scalar gapTotal = std::abs(totalRebuilt - totalEngine);

    //  The identity IS the claim.  A gap beyond round-off means this
    //  explanation and the engine disagree -- refuse rather than publish a
    //  confident wrong derivation.  The bound is relative with an absolute
    //  floor, because a total near zero (a cancelling H ledger) must not
    //  turn round-off into a refusal.
    auto tooBig = [](scalar gap, scalar ref)
    { return gap > 1.0e-10 * std::max(std::abs(ref), scalar(1.0)); };
    if (tooBig(gapIdeal, idealEngine))
        throw std::runtime_error("explainProperty '" + opName
            + "': the re-added ideal ledger (pure + mixing + pressure) does"
              " NOT reproduce the engine's assembled value (gap "
            + std::to_string(gapIdeal) + ") -- this explanation and"
              " ThermoPackage disagree, which is an engine or ledger defect,"
              " never something to publish as an explanation.");
    if (tooBig(gapTotal, totalEngine))
        throw std::runtime_error("explainProperty '" + opName
            + "': ideal + residual does NOT reproduce the engine's "
            + prop + " (gap " + std::to_string(gapTotal) + ") -- the package"
              " routed the total another way than this ledger describes;"
              " refusing rather than mislabel the derivation.");

    if (verbosity >= 2)
    {
        //  Save/restore the stream's format state: choupoProps' result-JSON
        //  emitter writes values under the AMBIENT precision (a recorded
        //  defect -- see the task note in the commit that added this op), so
        //  an op that leaves setprecision(1) behind truncates every number
        //  in the machine channel.  Found by this op's own first --record:
        //  the golden came back at one decimal.
        const auto savedFlags = std::cout.flags();
        const auto savedPrec  = std::cout.precision();
        const char* u = wantS ? "J/(mol*K)" : "J/mol";
        std::cout << "\n=======================  explainProperty: " << prop
                  << "  =======================\n"
                  << "  State: T = " << std::fixed << std::setprecision(2) << T
                  << " K,  P = " << (P_Pa / 1.0e5) << " bar\n\n"
                  << "  Per component (datum from standardThermochemistry;"
                     " integral from idealGasHeatCapacity,\n"
                  << "  closed form; the integral column is the engine's "
                  << (wantS ? "s_pure_ig(T) minus its own s_298" :
                              "h_pure_ig(T) minus its own dHf_298")
                  << "):\n";
        for (std::size_t i = 0; i < n; ++i)
        {
            if (z[i] <= 0.0) continue;
            const Component& c = thermo.comp(i);
            const scalar datum = wantS ? c.S298() : c.Hf298();
            const scalar whole = wantS ? c.s_pure_ig(T) : c.h_pure_ig(T);
            std::cout << "    " << std::setw(14) << std::left << c.name()
                      << std::right << std::fixed << std::setprecision(4)
                      << std::setw(14) << datum << "  +"
                      << std::setw(12) << (whole - datum) << "  ="
                      << std::setw(14) << whole << "  " << u << "\n";
        }
        std::cout << "\n  pure line      sum z_i * "
                  << (wantS ? "s" : "h") << "_i(T)          = "
                  << std::setw(14) << pureLine << "  " << u << "\n";
        if (wantS)
        {
            std::cout << "  mixing line    -R sum z_i ln z_i        = "
                      << std::setw(14) << mixingLine << "  " << u << "\n"
                      << "  pressure line  -R ln(P / 1 bar)         = "
                      << std::setw(14) << pressureLine << "  " << u << "\n";
        }
        else
        {
            std::cout << "  (ideal-gas enthalpy has NO mixing or pressure"
                         " line -- that asymmetry with S is the lesson)\n";
        }
        std::cout << "  ------------------------------------------------------------\n"
                  << "  " << (wantS ? "S_ig" : "H_ig")
                  << " (ThermoPackage assembly)         = "
                  << std::setw(14) << idealEngine
                  << "   re-added: " << idealRebuilt
                  << "   gap: " << std::scientific << std::setprecision(1)
                  << gapIdeal << std::fixed << std::setprecision(4) << "\n";
        if (wantResidual)
        {
            std::cout << "  residual (" << thermo.eos().modelName()
                      << " " << (wantS ? "S" : "H") << "_residual)"
                      << std::setw(14) << " = "
                      << std::setw(14) << residual << "  " << u << "\n"
                      << "  ------------------------------------------------------------\n"
                      << "  " << prop << "                              = "
                      << std::setw(14) << totalEngine
                      << "   gap: " << std::scientific << std::setprecision(1)
                      << gapTotal << std::fixed << "\n";
        }
        std::cout << "==========================================================================\n\n";
        std::cout.flags(savedFlags);
        std::cout.precision(savedPrec);
    }

    diag_["T"] = T;
    diag_["P"] = P_Pa;
    diag_["pure_line"]     = pureLine;
    if (wantS)
    {
        diag_["mixing_line"]   = mixingLine;
        diag_["pressure_line"] = pressureLine;
    }
    diag_[wantS ? "S_ig" : "H_ig"] = idealEngine;
    diag_["gap_ideal"] = gapIdeal;
    if (wantResidual)
    {
        diag_[wantS ? "S_R"    : "H_R"]    = residual;
        diag_[wantS ? "S_real" : "H_real"] = totalEngine;
        diag_["gap_total"] = gapTotal;
    }

    return 0;
}

} // namespace Choupo
