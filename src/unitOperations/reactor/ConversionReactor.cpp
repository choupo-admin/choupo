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
#include <string>
#include <vector>

namespace Choupo {

int ConversionReactor::solve(const DictPtr& dict,
                             const ThermoPackage& thermo,
                             int verbosity)
{
    auto feedDict = dict->subDict("feed");
    auto operDict = dict->subDict("operation");
    auto compDict = dict->subDict("composition");
    // `reaction` is read AFTER the multi-reaction branch below.

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

    // ---- MULTI-REACTION?  `reactions ( r1 r2 ... );` -----------------
    //  Each reaction's extent is SPECIFIED (a conversion or a direct extent);
    //  the single-reaction path below is untouched.
    if (dict->hasDictList("reactions"))
        return solveMultiReaction(dict, thermo, verbosity, F_in, T, P, z);

    auto rxnDict = dict->subDict("reaction");

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

// ---------------------------------------------------------------------------
//  MULTI-REACTION conversion reactor.  There is NO solver: the R extents are
//  INPUTS, one per reaction, given either as a fractional `conversion` of that
//  reaction's limitingReactant (referenced to the FEED amount) or as a direct
//  `extent`.  Outlet by stoichiometry,  n_i = n_i0 + SUM_j nu_ij xi_j.  This is
//  the honest gas-phase reactor for a PARALLEL network whose split you know from
//  the catalyst (selectivity as a SPEC), where you have no rate data to give a
//  cstr/pfr and no equilibrium to give an equilibriumReactor.
// ---------------------------------------------------------------------------
int ConversionReactor::solveMultiReaction(const DictPtr&       dict,
                                          const ThermoPackage& thermo,
                                          int                  verbosity,
                                          scalar               F_in,
                                          scalar               T,
                                          scalar               P,
                                          const sVector&       z)
{
    const std::size_t n = thermo.n();
    auto rxnList = dict->lookupDictList("reactions");
    const std::size_t R = rxnList.size();
    if (R == 0) throw std::runtime_error("conversionReactor: `reactions ( ... )` is empty");

    // Per-reaction stoichiometry + name.
    std::vector<sVector>     nu(R, sVector(n, 0.0));
    std::vector<std::string> rname(R), rlim(R);
    for (std::size_t j = 0; j < R; ++j)
    {
        rname[j] = rxnList[j]->lookupWordOrDefault("name", "rxn" + std::to_string(j + 1));
        for (const auto& s : rxnList[j]->lookupDictList("stoichiometry"))
            nu[j][thermo.indexOf(s->lookupWord("component"))] = s->lookupScalar("nu");
        rlim[j] = rxnList[j]->lookupWordOrDefault("limitingReactant", "");
    }

    // The SPEC: one entry per reaction, `{ reaction <name>; conversion <X>; }`
    // or `{ reaction <name>; extent <kmol/s>; }`.
    auto operDict = dict->subDict("operation");
    if (!operDict->hasDictList("conversions"))
        throw std::runtime_error("conversionReactor: a multi-reaction unit needs an "
            "operation `conversions ( { reaction <name>; conversion <0..1>; } ... )` "
            "list -- one entry per reaction (or `extent <kmol/s>` instead)");
    sVector xi(R, 0.0);
    std::vector<char> given(R, 0);
    for (const auto& c : operDict->lookupDictList("conversions"))
    {
        const std::string rn = c->lookupWord("reaction");
        std::size_t j = R;
        for (std::size_t q = 0; q < R; ++q) if (rname[q] == rn) { j = q; break; }
        if (j == R)
            throw std::runtime_error("conversionReactor: conversions entry names reaction '"
                + rn + "', which is not in the `reactions ( ... )` list");

        if (c->found("extent"))
            xi[j] = c->lookupScalar("extent");            // kmol/s (SI, canonical)
        else if (c->found("conversion"))
        {
            if (rlim[j].empty())
                throw std::runtime_error("conversionReactor: reaction '" + rn
                    + "' has a `conversion` spec but no `limitingReactant` in "
                      "constant/reactions -- give an `extent` instead");
            const std::size_t iLim = thermo.indexOf(rlim[j]);
            if (nu[j][iLim] >= 0.0)
                throw std::runtime_error("conversionReactor: reaction '" + rn
                    + "': limitingReactant '" + rlim[j] + "' has nu >= 0");
            const scalar X = c->lookupScalar("conversion");
            if (X < 0.0 || X > 1.0)
                throw std::runtime_error("conversionReactor: reaction '" + rn
                    + "': conversion must be in [0,1]");
            // Fraction of the FEED amount of the limiting reactant consumed BY THIS reaction.
            xi[j] = X * (z[iLim] * F_in) / (-nu[j][iLim]);
        }
        else
            throw std::runtime_error("conversionReactor: conversions entry for '" + rn
                + "' gives neither `conversion` nor `extent`");
        given[j] = 1;
    }
    for (std::size_t j = 0; j < R; ++j)
        if (!given[j])
            throw std::runtime_error("conversionReactor: no conversion/extent given for "
                "reaction '" + rname[j] + "'");

    // ---- Outlet by stoichiometry ---------------------------------------
    sVector molesOut(n, 0.0); scalar F_out = 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        scalar v = z[i] * F_in;
        for (std::size_t j = 0; j < R; ++j) v += nu[j][i] * xi[j];
        if (v < -1.0e-12 * std::max(1.0, F_in))
            throw std::runtime_error("conversionReactor: outlet moles of '"
                + thermo.comp(i).name() + "' went negative -- the specified conversions "
                "over-consume it (they are NOT independent when reactions share a reactant)");
        molesOut[i] = std::max(0.0, v);
        F_out += molesOut[i];
    }
    sVector zout(n, 0.0);
    if (F_out > 0.0) for (std::size_t i = 0; i < n; ++i) zout[i] = molesOut[i] / F_out;

    // ---- Heat of reaction on the elements datum (per reaction) ----------
    sVector dHrxn(R, 0.0);
    bool haveDuty = true;
    try {
        for (std::size_t j = 0; j < R; ++j)
            for (std::size_t i = 0; i < n; ++i)
                if (nu[j][i] != 0.0) dHrxn[j] += nu[j][i] * thermo.comp(i).h_pure_ig(T);
    } catch (const std::exception&) { haveDuty = false; }
    scalar Q_W = 0.0;
    for (std::size_t j = 0; j < R; ++j) Q_W += xi[j] * 1000.0 * dHrxn[j];

    // ---- Outlet stream --------------------------------------------------
    produced_.clear();
    ProcessStream out;
    out.name = "out";
    out.F = F_out; out.T = T; out.P = P; out.z = zout; out.vf = 1.0;
    produced_.push_back(out);

    // ---- KPIs -----------------------------------------------------------
    kpis_.clear();
    kpis_["F_in_kmol_h"]  = F_in  * 3600.0;
    kpis_["F_out_kmol_h"] = F_out * 3600.0;
    kpis_["T"]            = T;
    kpis_["nReactions"]   = static_cast<scalar>(R);
    for (std::size_t j = 0; j < R; ++j)
    {
        kpis_["extent_" + rname[j] + "_kmol_h"] = xi[j] * 3600.0;
        if (haveDuty) kpis_["dHrxn_" + rname[j] + "_kJ_per_mol"] = dHrxn[j] / 1000.0;
    }
    if (haveDuty) kpis_["Q_kW"] = Q_W / 1000.0;

    if (verbosity >= 2)
    {
        std::cout << "ConversionReactor:  " << R << " reaction(s), extents SPECIFIED "
                  << "(isothermal at " << T << " K)\n";
        for (std::size_t j = 0; j < R; ++j)
            std::cout << "  " << std::setw(12) << std::left << rname[j] << std::right
                      << "  extent = " << std::fixed << std::setprecision(5)
                      << (xi[j] * 3600.0) << " kmol/h\n";
        if (haveDuty)
            std::cout << "  net duty Q = " << std::setprecision(2) << (Q_W / 1000.0) << " kW"
                      << (Q_W < 0 ? "  (exothermic; removed)\n\n" : "  (endothermic; added)\n\n");
        else std::cout << "  (duty not reported -- a species lacks ideal-gas Cp data)\n\n";
    }
    return 0;
}

} // namespace Choupo
