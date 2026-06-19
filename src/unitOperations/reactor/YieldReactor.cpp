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
-------------------------------------------------------------------------------
Description
    YieldReactor implementation (outlet from mass yields; overall mass closes)
\*---------------------------------------------------------------------------*/

#include "YieldReactor.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

int YieldReactor::solve(const DictPtr& dict,
                        const ThermoPackage& thermo,
                        int verbosity)
{
    auto feedDict = dict->subDict("feed");
    auto operDict = dict->subDict("operation");
    auto compDict = dict->subDict("composition");

    const scalar F_in   = feedDict->lookupScalar("F", Dims::molarFlow);   // kmol/s
    const scalar T_feed = feedDict->lookupScalar("T", Dims::temperature);
    const scalar P      = feedDict->lookupScalar("P", Dims::pressure);
    const scalar vf_in  = feedDict->lookupScalarOrDefault("vf", 1.0);
    // Isothermal: the reactor holds T_out = T (operation T overrides feed T).
    const scalar T = operDict->lookupScalarOrDefault("T", T_feed);

    const std::size_t n = thermo.n();

    // ---- Inlet composition & per-component MOLAR inflow -------------------
    sVector z(n, 0.0);
    scalar zsum = 0.0;
    for (const auto& key : compDict->keys())
    {
        std::size_t i = thermo.indexOf(key);
        z[i] = compDict->lookupScalar(key);
        zsum += z[i];
    }
    if (zsum > 0.0) for (auto& v : z) v /= zsum;

    sVector molesIn(n, 0.0);
    scalar  M_in = 0.0;                       // total inlet MASS flow [kg/s]
    for (std::size_t i = 0; i < n; ++i)
    {
        molesIn[i] = z[i] * F_in;             // kmol/s
        M_in += molesIn[i] * thermo.comp(i).MW();   // kmol/s * kg/kmol = kg/s
    }
    if (M_in <= 0.0)
        throw std::runtime_error("yieldReactor: inlet mass flow is zero -- "
            "check the feed F and composition");

    // ---- Yields (mass of product i per unit total feed mass) -------------
    // The outlet is defined purely by the yield distribution; the overall MASS
    // balance closes because the yields are taken on a normalised basis
    // (Sum = 1), so outlet mass == inlet mass.
    sVector yield(n, 0.0);
    scalar  ysum = 0.0;
    const auto yieldList = operDict->lookupDictList("yields");
    if (yieldList.empty())
        throw std::runtime_error("yieldReactor: empty `yields ( ... );` list -- "
            "declare at least one { component <name>; yield <kg/kg>; }");
    for (const auto& y : yieldList)
    {
        const std::string comp = y->lookupWord("component");
        const std::size_t i = thermo.indexOf(comp);
        const scalar v = y->lookupScalar("yield");
        if (v < 0.0)
            throw std::runtime_error("yieldReactor: yield of '" + comp
                + "' is negative (" + std::to_string(v) + ")");
        yield[i] += v;
        ysum += v;
    }
    if (ysum <= 0.0)
        throw std::runtime_error("yieldReactor: the yields sum to zero -- "
            "nothing is produced");

    // No silent crutch: if the yields do not sum to 1, renormalise and SAY SO.
    const bool renormalised = std::abs(ysum - 1.0) > 1e-9;
    if (renormalised)
        for (auto& v : yield) v /= ysum;

    // ---- Outlet by mass yield, converted to moles ------------------------
    sVector molesOut(n, 0.0);
    scalar  M_out = 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        const scalar mass_i = yield[i] * M_in;          // kg/s of product i
        M_out += mass_i;
        const scalar MW_i = thermo.comp(i).MW();
        if (mass_i > 0.0 && MW_i <= 0.0)
            throw std::runtime_error("yieldReactor: component '"
                + thermo.comp(i).name() + "' has no molar mass (MW) -- "
                "cannot convert its mass yield to moles");
        molesOut[i] = (MW_i > 0.0) ? mass_i / MW_i : 0.0;   // kmol/s
    }
    scalar F_out = 0.0;
    for (auto m : molesOut) F_out += m;
    sVector zout(n, 0.0);
    if (F_out > 0.0) for (std::size_t i = 0; i < n; ++i) zout[i] = molesOut[i] / F_out;

    // ---- Heat of reaction from the elements/formation datum --------------
    // dHrxn = Sum_out(n_i h_f(T)) - Sum_in(n_i h_f(T)).  Every species carries
    // its own Hf298, so the reaction heat emerges naturally.  Honest reporting:
    // if ANY participating species lacks formation data, skip the duty.
    const std::string targetPhase = (vf_in >= 0.5) ? "gas" : "liquid";
    scalar H_in = 0.0, H_out = 0.0;          // W (J/s) on each side, formation datum
    bool   haveDuty = true;
    try
    {
        for (std::size_t i = 0; i < n; ++i)
        {
            if (molesIn[i]  > 0.0) H_in  += molesIn[i]  * 1000.0 * thermo.comp(i).h_formation(T, targetPhase);
            if (molesOut[i] > 0.0) H_out += molesOut[i] * 1000.0 * thermo.comp(i).h_formation(T, targetPhase);
        }
    }
    catch (const std::exception&) { haveDuty = false; }
    const scalar Q_W = H_out - H_in;         // W ; <0 exothermic (heat removed)

    // ---- Outlet stream ---------------------------------------------------
    produced_.clear();
    ProcessStream s;
    s.name = "out";
    s.F = F_out; s.T = T; s.P = P; s.z = zout;
    s.vf = vf_in;                            // hold the feed phase; a downstream flash re-splits
    produced_.push_back(s);

    kpis_["F_in_kmol_h"]   = F_in  * 3600.0;
    kpis_["F_out_kmol_h"]  = F_out * 3600.0;
    kpis_["M_in_kg_h"]     = M_in  * 3600.0;
    kpis_["M_out_kg_h"]    = M_out * 3600.0;
    kpis_["T"]             = T;
    if (haveDuty)
        kpis_["Q_kW"] = Q_W / 1000.0;

    if (verbosity >= 2)
    {
        std::cout << "YieldReactor:  feed " << std::fixed << std::setprecision(2)
                  << (M_in * 3600.0) << " kg/h  ->  product "
                  << (M_out * 3600.0) << " kg/h   (mass-conserving, isothermal at "
                  << std::setprecision(1) << T << " K)\n";
        if (renormalised)
            std::cout << "  NOTE: supplied yields summed to " << std::setprecision(4)
                      << ysum << " (not 1) -- renormalised so the mass balance closes\n";
        if (haveDuty)
            std::cout << "  duty Q = " << std::setprecision(1) << (Q_W / 1000.0) << " kW"
                      << (Q_W < 0 ? "  (exothermic; removed)\n\n" : "  (endothermic; added)\n\n");
        else
            std::cout << "  (duty not reported -- a species lacks formation/Cp data)\n\n";
    }
    return 0;
}

} // namespace Choupo
