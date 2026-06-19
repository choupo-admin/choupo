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
    ConversionReactor implementation (extent from a specified conversion)
\*---------------------------------------------------------------------------*/

#include "ConversionReactor.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

int ConversionReactor::solve(const DictPtr& dict,
                             const ThermoPackage& thermo,
                             int verbosity)
{
    auto feedDict = dict->subDict("feed");
    auto operDict = dict->subDict("operation");
    auto compDict = dict->subDict("composition");
    auto rxnDict  = dict->subDict("reaction");

    const scalar F_in = feedDict->lookupScalar("F", Dims::molarFlow);   // kmol/s
    const scalar T_feed = feedDict->lookupScalar("T", Dims::temperature);
    const scalar P      = feedDict->lookupScalar("P", Dims::pressure);
    // Isothermal: the reactor holds T_out = T (operation T overrides feed T).
    const scalar T = operDict->lookupScalarOrDefault("T", T_feed);

    const std::size_t n = thermo.n();
    sVector z(n, 0.0);
    scalar zsum = 0.0;
    for (const auto& key : compDict->keys())
    {
        std::size_t i = thermo.indexOf(key);
        z[i] = compDict->lookupScalar(key);
        zsum += z[i];
    }
    if (zsum > 0.0) for (auto& v : z) v /= zsum;

    // ---- Reaction stoichiometry (no kinetics) -----------------------
    sVector nu(n, 0.0);
    for (const auto& s : rxnDict->lookupDictList("stoichiometry"))
    {
        std::size_t i = thermo.indexOf(s->lookupWord("component"));
        nu[i] = s->lookupScalar("nu");
    }
    const std::string limiting = rxnDict->lookupWord("limitingReactant");
    const std::size_t iLim = thermo.indexOf(limiting);
    if (nu[iLim] >= 0.0)
        throw std::runtime_error("conversionReactor: limitingReactant '" + limiting
            + "' has non-negative nu -- it must be a reactant (nu < 0)");

    const scalar X = operDict->lookupScalar("conversion");   // fraction 0..1
    if (X < 0.0 || X > 1.0)
        throw std::runtime_error("conversionReactor: conversion must be in [0, 1] (got "
            + std::to_string(X) + ")");

    // Extent (kmol/s): the limiting reactant is converted by X.
    const scalar molesLim_in = z[iLim] * F_in;             // kmol/s in
    const scalar xi = X * molesLim_in / (-nu[iLim]);       // kmol/s  (nu<0)

    // Outlet by stoichiometry:  n_i,out = n_i,in + nu_i * xi
    sVector molesOut(n, 0.0);
    for (std::size_t i = 0; i < n; ++i)
    {
        molesOut[i] = z[i] * F_in + nu[i] * xi;
        if (molesOut[i] < 0.0 && molesOut[i] > -1e-12) molesOut[i] = 0.0; // tidy −0
        if (molesOut[i] < 0.0)
            throw std::runtime_error("conversionReactor: outlet moles of '"
                + thermo.comp(i).name() + "' went negative -- check stoichiometry "
                "and that the conversion is on the LIMITING reactant");
    }
    scalar F_out = 0.0;
    for (auto m : molesOut) F_out += m;
    sVector zout(n, 0.0);
    if (F_out > 0.0) for (std::size_t i = 0; i < n; ++i) zout[i] = molesOut[i] / F_out;

    // Heat of reaction at T (ideal-gas, elements datum); isothermal duty.
    // Skip if a participating species lacks the ideal-gas Cp data.
    scalar dHrxn = 0.0;       // J / mol of extent
    bool haveDuty = true;
    try
    {
        for (std::size_t i = 0; i < n; ++i)
            if (nu[i] != 0.0) dHrxn += nu[i] * thermo.comp(i).h_pure_ig(T);
    }
    catch (const std::exception&) { haveDuty = false; }
    const scalar Q_W = xi * 1000.0 * dHrxn;   // W (xi kmol/s -> mol/s ; <0 exothermic)

    // ---- Outlet stream (gas-phase reactor effluent) -----------------
    produced_.clear();
    ProcessStream s;
    s.name = "out";
    s.F = F_out; s.T = T; s.P = P; s.z = zout;
    s.vf = 1.0;                               // gas reactor; a downstream flash re-splits
    produced_.push_back(s);

    kpis_["conversion"]    = X;
    kpis_["extent_kmol_h"] = xi * 3600.0;
    kpis_["F_in_kmol_h"]   = F_in * 3600.0;
    kpis_["F_out_kmol_h"]  = F_out * 3600.0;
    kpis_["T"]             = T;
    if (haveDuty)
    {
        kpis_["dHrxn_kJ_per_mol"] = dHrxn / 1000.0;
        kpis_["Q_kW"]             = Q_W / 1000.0;
    }

    if (verbosity >= 2)
    {
        std::cout << "ConversionReactor:  limiting " << limiting
                  << "   X = " << std::fixed << std::setprecision(3) << X
                  << "   extent = " << std::setprecision(4) << (xi * 3600.0) << " kmol/h"
                  << "   (gas-basis, isothermal at " << T << " K)\n";
        if (haveDuty)
            std::cout << "  dH_rxn = " << std::setprecision(1) << (dHrxn / 1000.0)
                      << " kJ/mol   ->  duty Q = " << (Q_W / 1000.0) << " kW"
                      << (Q_W < 0 ? "  (exothermic; removed)\n\n" : "  (endothermic; added)\n\n");
        else
            std::cout << "  (duty not reported -- a species lacks ideal-gas Cp data)\n\n";
    }
    return 0;
}

} // namespace Choupo
