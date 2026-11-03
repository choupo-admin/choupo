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

#include "FlashSpec.H"

#include "core/Advisory.H"
#include "solver/Convergence.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/flash/SpecifiedFlash.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

int FlashSpec::run(const DictPtr& dict,
                   const ThermoPackage& globalThermo,
                   int verbosity)
{
    auto override = thermoForOp(dict);
    const ThermoPackage& thermo = override ? *override : globalThermo;
    const std::string opName = dict->lookupWordOrDefault("name", "?");
    const std::string who = "flashSpec '" + opName + "'";

    // ---- the feed ---------------------------------------------------------
    if (!dict->found("composition"))
        throw std::runtime_error(who + ": no `composition {}` -- a flash is a"
            " property of ONE feed and there is no default feed.");
    auto compDict = dict->subDict("composition");
    const std::size_t n = thermo.n();
    sVector z(n, 0.0);
    scalar zsum = 0.0;
    for (const auto& key : compDict->keys())
    {
        const std::size_t i = thermo.indexOf(key);
        z[i] = compDict->lookupScalar(key);
        zsum += z[i];
    }
    if (!(zsum > 0.0))
        throw std::runtime_error(who + ": the `composition {}` block is empty"
            " or sums to zero.");
    for (auto& v : z) v /= zsum;

    // ---- the specification -------------------------------------------------
    if (!dict->found("spec"))
        throw std::runtime_error(who + ": no `spec {}` -- declare `pair PH |"
            " PS | TVF | PVF;`, the held variable and the specified value.");
    auto sd = dict->subDict("spec");
    const std::string pairWord = sd->lookupWord("pair");
    const auto pair = flashState::specPairFromWord(pairWord);
    if (!pair)
        throw std::runtime_error(who + ": spec { pair " + pairWord + "; } is"
            " not a specification this engine solves.  Accepted: PH, PS, TVF,"
            " PVF.");

    flashState::FlashSpecification spec;
    spec.pair = *pair;
    const bool heldP = (*pair != flashState::SpecPair::TVF);
    const char* heldKey  = heldP ? "P" : "T";
    const char* otherKey = heldP ? "T" : "P";
    if (!sd->found(heldKey))
        throw std::runtime_error(who + ": spec { pair " + pairWord + "; }"
            " holds " + heldKey + " -- declare it (`" + heldKey + " <value>"
            " <unit>;`).");
    if (sd->found(otherKey))
        throw std::runtime_error(who + ": spec { pair " + pairWord + "; }"
            " declares " + otherKey + ", which is the UNKNOWN of this pair.  A"
            " state has two degrees of freedom and this specification already"
            " fixes both; to start the search somewhere, write `seed`.");
    if (heldP) spec.P = sd->lookupScalar("P", Dims::pressure);
    else       spec.T = sd->lookupScalar("T", Dims::temperature);

    const bool vfPair = (*pair == flashState::SpecPair::TVF
                      || *pair == flashState::SpecPair::PVF);
    const char* valueKey = vfPair ? "vaporFraction"
                         : (*pair == flashState::SpecPair::PS ? "S" : "H");
    for (const char* k : { "H", "S", "vaporFraction" })
        if (std::string(k) != valueKey && sd->found(k))
            throw std::runtime_error(who + ": spec { pair " + pairWord + "; }"
                " specifies " + valueKey + ", not `" + k + "`.");
    const bool hasValue = sd->found(valueKey);
    const bool hasFrom  = sd->found("targetFrom");
    if (hasValue == hasFrom)
        throw std::runtime_error(who + ": spec { pair " + pairWord + "; } needs"
            " exactly ONE of `" + valueKey + " <value>;`"
            + (vfPair ? "" : " and `targetFrom { T; P; }`")
            + (hasValue ? " -- both are declared." : " -- neither is."));
    if (hasFrom && vfPair)
        throw std::runtime_error(who + ": `targetFrom` gives the H or S of a"
            " reference state; a vapour-fraction specification takes"
            " `vaporFraction <0..1>;` directly.");

    //  H / S are J/mol and J/(mol K) numerically (Choupo's molar
    //  convention, core/Units.cpp); a raw number is read in those units.
    if (hasValue)
        spec.target = vfPair ? sd->lookupScalar(valueKey)
                    : (*pair == flashState::SpecPair::PS
                       ? sd->lookupScalar("S", Dims::molarEntropy)
                       : sd->lookupScalar("H", Dims::molarEnergy));
    if (sd->found("seed"))
        spec.seed = heldP ? sd->lookupScalar("seed", Dims::temperature)
                          : sd->lookupScalar("seed", Dims::pressure);

    if (dict->found("window"))
    {
        auto w = dict->subDict("window");
        for (const auto& k : w->keys())
            if (k != "Tmin" && k != "Tmax" && k != "Pmin" && k != "Pmax")
                throw std::runtime_error(who + ": window { " + k + " ...; } --"
                    " the window takes Tmin, Tmax, Pmin, Pmax only.");
        spec.Tmin = w->lookupScalarOrDefault("Tmin", spec.Tmin, Dims::temperature);
        spec.Tmax = w->lookupScalarOrDefault("Tmax", spec.Tmax, Dims::temperature);
        spec.Pmin = w->lookupScalarOrDefault("Pmin", spec.Pmin, Dims::pressure);
        spec.Pmax = w->lookupScalarOrDefault("Pmax", spec.Pmax, Dims::pressure);
    }
    bool defaulted = true;
    spec.controls = solver::readConvergenceControls(
        dict, "convergence",
        flashState::FlashSpecification::defaultControls(*pair), defaulted);
    spec.controlsDeclared = !defaulted;

    // ---- the reference state, priced on the same surface ------------------
    flashState::SpecifiedState ref;
    if (hasFrom)
    {
        auto fd = sd->subDict("targetFrom");
        const scalar Tr = fd->lookupScalar("T", Dims::temperature);
        const scalar Pr = fd->lookupScalar("P", Dims::pressure);
        ref = flashState::stateAtTP(thermo, z, Tr, Pr, spec.flash,
                                    *pair == flashState::SpecPair::PS);
        spec.target = (*pair == flashState::SpecPair::PS) ? ref.S : ref.H;
    }

    const auto st = flashState::specifiedFlash(thermo, z, spec, verbosity,
                                               /*wantS=*/true);

    // ---- report -------------------------------------------------------------
    scalar MW = 0.0;
    for (std::size_t i = 0; i < n; ++i) MW += z[i] * thermo.comp(i).MW();

    for (const auto& note : st.notes)
    {
        AdvisoryLog::instance().add("flashSpec", "warning", who, note);
        if (verbosity >= 1) std::cout << "  [flashSpec] " << note << "\n";
    }

    if (verbosity >= 2)
    {
        const auto fl = std::cout.flags();
        const auto pr = std::cout.precision();
        std::cout << "\n=========================  flashSpec: " << opName
                  << "  =========================\n"
                  << "  " << spec.controls.describe(
                         std::string("flashSpec.") + pairWord, defaulted) << "\n"
                  << "  Specification: (" << (heldP ? "P" : "T") << ", "
                  << valueKey << ")  "
                  << (heldP ? "P = " : "T = ") << std::setprecision(10)
                  << (heldP ? spec.P : spec.T) << (heldP ? " Pa" : " K")
                  << ",  " << valueKey << " = " << std::setprecision(12)
                  << spec.target
                  << (vfPair ? "" : (*pair == flashState::SpecPair::PS
                                     ? " J/(mol K)" : " J/mol")) << "\n";
        if (hasFrom)
            std::cout << "  " << valueKey << " taken from the reference state"
                      << " T = " << std::setprecision(10) << ref.T
                      << " K, P = " << ref.P << " Pa (vapour fraction "
                      << ref.vaporFraction << ", priced on the same surface)\n";
        std::cout << "  Route:      " << st.route << "\n"
                  << "  T          = " << std::setprecision(10) << st.T << " K\n"
                  << "  P          = " << std::setprecision(10) << st.P << " Pa\n"
                  << "  V/F        = " << std::setprecision(10) << st.vaporFraction << "\n"
                  << "  H          = " << std::setprecision(12) << st.H
                  << " J/mol   (" << std::setprecision(8) << st.H / MW << " kJ/kg)\n"
                  << "  S          = " << std::setprecision(12) << st.S
                  << " J/(mol K)   (" << std::setprecision(8) << st.S / MW
                  << " kJ/(kg K))\n";
        if (hasFrom)
            std::cout << "  H - H_ref  = " << std::setprecision(10)
                      << (st.H - ref.H) << " J/mol\n";
        std::cout << "  Component        z            x            y\n";
        for (std::size_t i = 0; i < n; ++i)
            if (z[i] > 0.0)
                std::cout << "  " << std::left << std::setw(14)
                          << thermo.comp(i).name() << std::right
                          << std::setprecision(8) << std::setw(12) << z[i]
                          << std::setw(13) << st.phases.x[i]
                          << std::setw(13) << st.phases.y[i] << "\n";
        std::cout << "  Verdict:    " << (st.report.converged ? "converged" : "NOT converged")
                  << " -- " << st.report.criterion << "\n"
                  << "              raw residual " << std::scientific
                  << std::setprecision(3) << st.report.rawInitial << " -> "
                  << st.report.rawFinal << " in " << st.report.iterations
                  << " iteration(s), " << st.flashes << " trial flash(es)\n"
                  << (st.onSaturationPlateau || st.flashes == 0
                      ? "  The state is a PURE fluid on its saturation curve,"
                        " priced on its saturated legs (PureSaturationPlateau.H)"
                        "\n  -- on the curve (T, P) cannot fix the split; the"
                        " vapour fraction does.\n"
                      : "  The state is ONE isothermal flash at the answer, priced"
                        " on the energy report's surface\n  (hOfState / sOfState;"
                        " the entropy's liquid leg is the partner of the liquid"
                        " enthalpy).\n")
                  << "=====================================================================\n\n";
        std::cout.flags(fl);
        std::cout.precision(pr);
    }

    diag_.clear();
    diag_["T"]             = st.T;
    diag_["P"]             = st.P;
    diag_["vaporFraction"] = st.vaporFraction;
    diag_["H"]             = st.H;
    if (std::isfinite(st.S)) diag_["S"] = st.S;
    headline_ = { "T", "P", "vaporFraction", "H" };
    if (std::isfinite(st.S)) headline_.push_back("S");
    diag_["H_per_mass"]    = st.H / MW;
    if (std::isfinite(st.S)) diag_["S_per_mass"] = st.S / MW;
    diag_["target"]        = spec.target;
    diag_["onSaturationPlateau"] = st.onSaturationPlateau ? 1.0 : 0.0;
    diag_["flashes"]       = st.flashes;
    diag_["iterations"]    = st.report.iterations;
    diag_["residual"]      = st.report.rawFinal;
    for (std::size_t i = 0; i < n; ++i)
        if (z[i] > 0.0)
        {
            diag_["x_" + thermo.comp(i).name()] = st.phases.x[i];
            diag_["y_" + thermo.comp(i).name()] = st.phases.y[i];
        }
    if (hasFrom)
    {
        diag_["ref_T"]             = ref.T;
        diag_["ref_P"]             = ref.P;
        diag_["ref_vaporFraction"] = ref.vaporFraction;
        diag_["ref_H"]             = ref.H;
        if (std::isfinite(ref.S)) diag_["ref_S"] = ref.S;
        diag_["dH_fromReference"]  = st.H - ref.H;
    }
    return 0;
}

} // namespace Choupo
