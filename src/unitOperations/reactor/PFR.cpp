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

#include "PFR.H"
#include "core/Constants.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

int PFR::solve(const DictPtr& dict,
               const ThermoPackage& thermo,
               int verbosity)
{
    auto feedDict = dict->subDict("feed");
    auto operDict = dict->subDict("operation");
    auto compDict = dict->subDict("composition");
    auto rxnDict  = dict->subDict("reaction");

    const scalar F_in_kmols = feedDict->lookupScalar("F",   Dims::molarFlow);
    const scalar T          = feedDict->lookupScalar("T",   Dims::temperature);
    const scalar V_R        = operDict->lookupScalar("V_R", Dims::volume);
    const int    nSteps  = static_cast<int>(operDict->lookupScalarOrDefault("nSteps", 100));
    const int    nWrite  = static_cast<int>(operDict->lookupScalarOrDefault("writeInterval", 0));

    const std::size_t n = thermo.n();

    // -- Feed -------------------------------------------------------------
    sVector z_in(n, 0.0);
    scalar zsum = 0.0;
    for (const auto& key : compDict->keys())
    {
        std::size_t i = thermo.indexOf(key);
        z_in[i] = compDict->lookupScalar(key);
        zsum   += z_in[i];
    }
    for (auto& v : z_in) v /= zsum;

    const scalar F_in_mol_s = F_in_kmols * 1000.0;                   // kmol/s -> mol/s

    // -- Stoichiometry / kinetics ----------------------------------------
    sVector nu   (n, 0.0);
    sVector order(n, 0.0);
    auto stoich = rxnDict->lookupDictList("stoichiometry");
    for (const auto& s : stoich)
    {
        std::size_t i = thermo.indexOf(s->lookupWord("component"));
        nu[i]    = s->lookupScalar("nu");
        order[i] = s->lookupScalarOrDefault("order", 0.0);
    }
    const std::string limiting = rxnDict->lookupWord("limitingReactant");
    const std::size_t iLim = thermo.indexOf(limiting);

    auto kinDict = rxnDict->subDict("kinetics");
    if (kinDict->lookupWord("type") != "Arrhenius")
        throw std::runtime_error("PFR: only Arrhenius kinetics implemented");
    const scalar A_pre = kinDict->lookupScalar("A");
    const scalar Ea    = kinDict->lookupScalar("Ea");
    const scalar k     = A_pre * std::exp(-Ea / (constant::R * T));

    // Optional reversible reaction: same detailed-balance closure
    // as the CSTR --- K_eq(T) = exp(-dG_rxn/RT) with dG = Σ νᵢ g_pure_ig_i(T),
    // and k_rev = k_fwd / K_eq.  The PFR is isothermal, so K_eq is evaluated
    // once; the reactor then relaxes toward the equilibrium conversion along
    // its length instead of running to 100 %.
    const bool reversible =
        rxnDict->lookupWordOrDefault("reversible", "false") == "true";
    scalar k_rev = 0.0;
    if (reversible)
    {
        scalar dG = 0.0;
        for (std::size_t i = 0; i < n; ++i)
            if (nu[i] != 0.0) dG += nu[i] * thermo.comp(i).g_pure_ig(T);
        const scalar K_eq = std::exp(-dG / (constant::R * T));
        k_rev = k / K_eq;
    }

    // -- Q from feed (liquid molar volume) --------------------------------
    scalar V_mol_in = 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        if (thermo.comp(i).Vliq() <= 0.0)
            throw std::runtime_error("PFR: component '" + thermo.comp(i).name()
                + "' missing Vliq — required for liquid concentration");
        V_mol_in += z_in[i] * thermo.comp(i).Vliq();
    }
    const scalar Q = F_in_mol_s * V_mol_in;          // m³/s

    // -- Initial molar flow vector ---------------------------------------
    sVector F_i(n);
    for (std::size_t i = 0; i < n; ++i) F_i[i] = z_in[i] * F_in_mol_s;

    // -- Profile sink: store V, F_i and X at every step so the GUI can
    //    plot axial profiles.  nSteps+1 entries (inlet + every RK4 end).
    profile_ = UnitProfile{};
    profile_.xAxis = "V";
    profile_.columns["V"]    = std::vector<scalar>{};
    profile_.columns["V"].reserve(nSteps + 1);
    for (std::size_t i = 0; i < n; ++i)
    {
        const std::string col = "F_" + thermo.comp(i).name();
        profile_.columns[col].reserve(nSteps + 1);
    }
    profile_.columns["X"].reserve(nSteps + 1);
    const scalar F_lim_in = z_in[iLim] * F_in_mol_s;
    auto pushProfile = [&](scalar V, const sVector& Fcur)
    {
        profile_.columns["V"].push_back(V);
        for (std::size_t i = 0; i < n; ++i)
            profile_.columns["F_" + thermo.comp(i).name()].push_back(Fcur[i]);
        const scalar X_here = (F_lim_in - Fcur[iLim]) / F_lim_in;
        profile_.columns["X"].push_back(X_here);
    };
    pushProfile(0.0, F_i);

    auto rate = [&](const sVector& Fi)
    {
        scalar r = k;
        for (std::size_t j = 0; j < n; ++j)
        {
            if (order[j] == 0.0) continue;
            scalar Cj = Fi[j] / Q;
            if (Cj < 0.0) Cj = 0.0;
            r *= std::pow(Cj, order[j]);
        }
        if (!reversible) return r;
        // Reverse leg: mass-action on the products (ν > 0).
        scalar r_rev = k_rev;
        for (std::size_t j = 0; j < n; ++j)
        {
            if (nu[j] <= 0.0) continue;
            scalar Cj = Fi[j] / Q;
            if (Cj < 0.0) Cj = 0.0;
            r_rev *= std::pow(Cj, nu[j]);
        }
        return r - r_rev;
    };
    auto dFdV = [&](const sVector& Fi)
    {
        scalar r = rate(Fi);
        sVector dF(n);
        for (std::size_t i = 0; i < n; ++i) dF[i] = nu[i] * r;
        return dF;
    };

    // -- Print header --------------------------------------------------
    const scalar dV = V_R / nSteps;
    std::cout << "Feed:        F = " << (F_in_kmols * 3600.0) << " kmol/h\n"
              << "Reactor:     V_R = " << V_R << " m³\n"
              << "Temperature: T = " << T << " K\n"
              << "Volumetric:  Q = " << std::scientific << std::setprecision(4)
              << Q << " m³/s\n"
              << "k(T) = " << k << "  (units depend on rate-law order)\n"
              << "Integrator:  RK4,  " << nSteps << " uniform steps,  dV = "
              << dV << " m³\n\n";

    const bool showTrace = (verbosity >= 4)
                        || (verbosity >= 3 && nWrite > 0);
    if (showTrace)
    {
        std::cout << "Axial profile (V [m³]   F_i [mol/s]...):\n  ";
        std::cout << std::setw(12) << "V";
        for (std::size_t i = 0; i < n; ++i)
            std::cout << "  " << std::setw(12) << thermo.comp(i).name();
        std::cout << "\n";
        std::cout << "  " << std::scientific << std::setprecision(5)
                  << std::setw(12) << 0.0;
        for (std::size_t i = 0; i < n; ++i)
            std::cout << "  " << std::setw(12) << F_i[i];
        std::cout << "\n";
    }

    // -- RK4 integration --------------------------------------------------
    auto axpy = [](const sVector& a, scalar c, const sVector& b)
    {
        sVector r(a.size());
        for (std::size_t i = 0; i < a.size(); ++i) r[i] = a[i] + c * b[i];
        return r;
    };

    for (int m = 0; m < nSteps; ++m)
    {
        auto k1 = dFdV(F_i);
        auto k2 = dFdV(axpy(F_i, 0.5 * dV, k1));
        auto k3 = dFdV(axpy(F_i, 0.5 * dV, k2));
        auto k4 = dFdV(axpy(F_i,       dV, k3));
        for (std::size_t i = 0; i < n; ++i)
            F_i[i] += dV / 6.0 * (k1[i] + 2.0*k2[i] + 2.0*k3[i] + k4[i]);

        const scalar V_here = dV * (m + 1);
        pushProfile(V_here, F_i);

        if (showTrace && nWrite > 0 && ((m+1) % nWrite == 0 || m+1 == nSteps))
        {
            std::cout << "  " << std::scientific << std::setprecision(5)
                      << std::setw(12) << V_here;
            for (std::size_t i = 0; i < n; ++i)
                std::cout << "  " << std::setw(12) << F_i[i];
            std::cout << "\n";
        }
    }

    // -- Outlet -----------------------------------------------------------
    scalar F_out = 0.0;
    for (std::size_t i = 0; i < n; ++i) F_out += F_i[i];

    sVector z_out(n);
    for (std::size_t i = 0; i < n; ++i) z_out[i] = F_i[i] / F_out;

    const scalar X         = (F_lim_in - F_i[iLim]) / F_lim_in;
    const scalar tau       = V_R / Q;
    const scalar Da        = k * tau;        // for 1st-order, Da = kτ
    const scalar X_exp_1st = 1.0 - std::exp(-Da);

    std::cout << "\n============================  PFR Result  ============================\n"
              << "  Damköhler (kτ): " << std::fixed << std::setprecision(4) << Da << "\n"
              << "  τ (residence):  " << tau << " s\n"
              << "  Conversion X(" << limiting << "):  "
              << std::setprecision(4) << (X * 100) << " %\n"
              << "  Analytical 1st-order check:  X = 1 - exp(-kτ) = "
              << (X_exp_1st * 100) << " %\n"
              << "  F_out (total):  " << std::fixed << std::setprecision(4)
              << (F_out * 3600.0 / 1000.0) << " kmol/h\n\n";

    std::cout << "  Component         z_in     z_out     F_in [kmol/h]  F_out [kmol/h]   ν\n"
              << "  ----------------------------------------------------------------------\n";
    for (std::size_t i = 0; i < n; ++i)
        std::cout << "  " << std::left << std::setw(14) << thermo.comp(i).name()
                  << std::right << std::fixed
                  << "  " << std::setprecision(5) << std::setw(7) << z_in[i]
                  << "  " << std::setprecision(5) << std::setw(7) << z_out[i]
                  << "  " << std::setprecision(4) << std::setw(13)
                  << (z_in[i] * F_in_kmols * 3600.0)
                  << "  " << std::setw(13) << (F_i[i] * 3.6)
                  << "  " << std::setprecision(1) << std::setw(5) << nu[i] << "\n";
    std::cout << "=====================================================================\n\n";

    // -- Produced stream --------------------------------------------------
    produced_.clear();
    ProcessStream out;
    out.name = "out";
    out.F    = F_out / 1000.0;              // mol/s -> kmol/s (canonical SI)
    out.T    = T;
    out.P    = 0.0;        // pressure not tracked (set by flowsheet)
    out.z    = z_out;
    out.vf   = 0.0;
    produced_.push_back(out);

    return 0;
}

} // namespace Choupo
