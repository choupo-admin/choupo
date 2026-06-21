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

#include "CSTR.H"
#include "core/Constants.H"
#include "thermo/reaction/Reaction.H"
#include "solver/NewtonRaphson.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

int CSTR::solve(const DictPtr& dict,
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

    const std::size_t n = thermo.n();
    sVector z_in(n, 0.0);
    scalar zsum = 0.0;
    for (const auto& key : compDict->keys())
    {
        std::size_t i = thermo.indexOf(key);
        z_in[i] = compDict->lookupScalar(key);
        zsum   += z_in[i];
    }
    for (auto& v : z_in) v /= zsum;

    // ---- Reaction stoichiometry & kinetics --------------------------
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
    if (nu[iLim] >= 0.0)
        throw std::runtime_error("CSTR: limitingReactant '" + limiting
            + "' has non-negative ν -- must be a reactant");

    auto kinDict = rxnDict->subDict("kinetics");
    const std::string ktype = kinDict->lookupWord("type");
    if (ktype != "Arrhenius")
        throw std::runtime_error("CSTR: only kinetics 'Arrhenius' implemented (got '"
            + ktype + "')");
    const scalar A_pre = kinDict->lookupScalar("A");
    const scalar Ea    = kinDict->lookupScalar("Ea");

    const scalar k = Reaction::arrheniusRate(A_pre, Ea, T);

    // Optional reversible reaction:
    //   When `reversible true;` is set on the reaction, the reverse rate
    //   constant follows from detailed balance, k_rev = k_fwd / Kc, with Kc
    //   the concentration-basis equilibrium constant (Reaction::equilibriumKc).
    const bool reversible = rxnDict->lookupWordOrDefault("reversible", "false") == "true";
    scalar K_eq = 0.0;
    scalar k_rev = 0.0;
    if (reversible)
    {
        K_eq  = Reaction::equilibriumKc(thermo, nu, T);
        k_rev = k / K_eq;
    }

    // ---- Convert to mol/s for the inner arithmetic ------------------
    // Stream F is kmol/s SI; we use mol/s inside this routine
    // because the thermo's Cp / ΔH are reported per mole.
    const scalar F_in = F_in_kmols * 1000.0;         // mol/s
    sVector F_i_in(n);
    for (std::size_t i = 0; i < n; ++i) F_i_in[i] = z_in[i] * F_in;

    // Feed molar volume (m³/mol) — assumed constant inside reactor
    scalar V_mol_in = 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        if (thermo.comp(i).Vliq() <= 0.0)
            throw std::runtime_error("CSTR: component '" + thermo.comp(i).name()
                + "' has Vliq <= 0 -- needed for liquid concentration");
        V_mol_in += z_in[i] * thermo.comp(i).Vliq();
    }
    const scalar Q = F_in * V_mol_in;        // m³/s (feed volumetric flow)
    const scalar tau = V_R / Q;              // s    (residence time)

    if (verbosity >= 3)
    {
        std::cout << "Feed:        F = " << (F_in_kmols * 3600.0) << " kmol/h  ("
                  << F_in << " mol/s)\n"
                  << "Reactor:     V_R = " << V_R << " m³\n"
                  << "Temperature: T = " << T << " K\n"
                  << "Feed comp.:\n";
        for (std::size_t i = 0; i < n; ++i)
            std::cout << "  " << thermo.comp(i).name() << "  = " << z_in[i] << "\n";

        std::cout << "\nKinetics:\n"
                  << "  type:   Arrhenius"
                  << (reversible ? "  (reversible)\n" : "\n")
                  << "  k_fwd:  " << std::scientific << std::setprecision(4) << k
                  << "  (units depend on rate-law order)\n"
                  << "  A_pre:  " << A_pre << "\n"
                  << "  Ea:     " << Ea << "  J/mol\n";
        if (reversible)
        {
            const auto eq = Reaction::equilibrium(thermo, nu, T);
            std::cout << "  Kp(T):  " << std::scientific << std::setprecision(4)
                      << eq.Kp << "   Σν = " << std::showpos << eq.sumNu
                      << std::noshowpos << "\n"
                      << "  Kc(T):  " << eq.Kc
                      << "  (= Kp·(P°/RuT)^Σν, concentration basis)\n"
                      << "  k_rev = k_fwd / Kc = " << k_rev << "\n";
        }
        std::cout << "\nFeed v_mol  = " << std::scientific << V_mol_in
                  << " m³/mol\nVolumetric Q = " << Q << " m³/s\n"
                  << "Residence τ  = " << std::fixed << std::setprecision(4)
                  << tau << " s  (= " << (tau/60.0) << " min)\n\n";
    }

    // ---- Residual for Newton in ξ -----------------------------------
    // Irreversible:  g(ξ) = ξ - k V_R Π_j C_j(ξ)^β_j = 0
    // Reversible:    g(ξ) = ξ - (k_fwd · Π_react C^a - k_rev · Π_prod C^b) V_R
    //                (orders default to |ν| on each side when reversible)
    const scalar xi_max = F_i_in[iLim] / (-nu[iLim]);    // 100% forward conversion
    auto rate = [&](scalar xi)
    {
        scalar r_fwd = k;
        for (std::size_t j = 0; j < n; ++j)
        {
            if (order[j] == 0.0) continue;
            scalar Fj = F_i_in[j] + nu[j] * xi;
            if (Fj < 0.0) Fj = 0.0;
            scalar Cj = Fj / Q;
            r_fwd *= std::pow(Cj, order[j]);
        }
        if (!reversible) return r_fwd;
        // Reverse term: products are species with nu > 0; their kinetic
        // order on the reverse leg defaults to nu (mass-action) when not
        // overridden.  Reactants don't appear in the reverse rate.
        scalar r_rev = k_rev;
        for (std::size_t j = 0; j < n; ++j)
        {
            if (nu[j] <= 0.0) continue;
            scalar Fj = F_i_in[j] + nu[j] * xi;
            if (Fj < 0.0) Fj = 0.0;
            scalar Cj = Fj / Q;
            r_rev *= std::pow(Cj, nu[j]);   // mass-action on products
        }
        return r_fwd - r_rev;
    };
    auto g  = [&](scalar xi) { return xi - rate(xi) * V_R; };
    auto dg = [&](scalar xi)
    {
        const scalar h = std::max(1.0e-6 * xi_max, 1.0e-12);
        return (g(xi + h) - g(xi - h)) / (2.0 * h);
    };

    solver::NROptions nro;
    nro.tolerance          = 1.0e-9 * std::max(xi_max, 1.0);
    nro.maxIter            = 80;
    nro.lower              = 0.0;
    nro.upper              = 0.9999 * xi_max;
    nro.bracket            = true;
    nro.monotoneIncreasing = true;          // g(0) ≤ 0, g(ξ_max) > 0
    nro.maxStep            = 0.25 * xi_max;

    if (verbosity >= 3)
    {
        std::cout << "Newton in extent ξ  (ξ_max = " << std::scientific
                  << std::setprecision(4) << xi_max << " mol/s):\n"
                  << "   it       ξ [mol/s]       g(ξ)        dg/dξ          Δξ\n"
                  << "  ----  -----------  -------------  -------------  -------------\n";
    }
    nro.onIter = [this, verbosity](const solver::NRTrace& tr)
    {
        recordResidual(std::abs(tr.f));
        if (verbosity >= 3)
        {
            std::cout << "  " << std::setw(4) << tr.iteration
                      << "  " << std::scientific << std::setprecision(5)
                      << std::setw(11) << tr.x
                      << "  " << std::setw(13) << tr.f
                      << "  " << std::setw(13) << tr.dfdx
                      << "  " << std::setw(13) << tr.dx << "\n";
        }
    };

    auto r = solver::newton1D(g, dg, 0.5 * xi_max, nro);
    const scalar xi = r.x;

    // ---- Outlet composition & conversion ----------------------------
    sVector F_i_out(n);
    scalar  F_out = 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        F_i_out[i] = F_i_in[i] + nu[i] * xi;
        F_out += F_i_out[i];
    }
    sVector z_out(n);
    for (std::size_t i = 0; i < n; ++i) z_out[i] = F_i_out[i] / F_out;

    const scalar X = (F_i_in[iLim] - F_i_out[iLim]) / F_i_in[iLim];
    const scalar Da = k * tau;   // Damköhler number for a 1st-order reaction

    if (verbosity >= 2)
    {
    std::cout << "\n============================  CSTR Result  ===========================\n"
              << "  Converged:        " << (r.converged ? "yes" : "NO") << "\n"
              << "  Iterations:       " << r.iterations << "\n"
              << "  ξ (extent):       " << std::scientific << std::setprecision(5)
              << xi << " mol/s\n"
              << "  Conversion X(" << limiting << "):  "
              << std::fixed << std::setprecision(4) << (X * 100) << " %\n"
              << "  Damköhler (kτ):   " << std::fixed << std::setprecision(4)
              << Da << "\n"
              << "  τ (residence):    " << std::fixed << std::setprecision(4)
              << tau << " s  (= " << (tau/60.0) << " min)\n"
              << "  F_out (total):    " << std::fixed << std::setprecision(4)
              << (F_out * 3600.0 / 1000.0) << " kmol/h\n\n";

    std::cout << "  Component         z_in     z_out     F_in [kmol/h]  F_out [kmol/h]   ν\n"
              << "  ----------------------------------------------------------------------\n";
    for (std::size_t i = 0; i < n; ++i)
        std::cout << "  " << std::left << std::setw(14) << thermo.comp(i).name()
                  << std::right << std::fixed
                  << "  " << std::setprecision(5) << std::setw(7) << z_in[i]
                  << "  " << std::setprecision(5) << std::setw(7) << z_out[i]
                  << "  " << std::setprecision(4) << std::setw(13)
                  << (F_i_in[i]  * 3.6)
                  << "  " << std::setw(13) << (F_i_out[i] * 3.6)
                  << "  " << std::setprecision(1) << std::setw(5) << nu[i] << "\n";
    std::cout << "=====================================================================\n\n";
    }

    // ---- Produced stream ------------------------------------------------
    produced_.clear();
    ProcessStream out;
    out.name = "out";
    out.F    = F_out / 1000.0;              // mol/s -> kmol/s (canonical SI)
    out.T    = T;
    out.P    = 0.0;                          // liquid CSTR — P not tracked
    out.z    = z_out;
    out.vf   = 0.0;
    produced_.push_back(out);

    // ---- KPIs (published for outer drivers / post-processors) ----------
    kpis_.clear();
    kpis_["V_R"]            = V_R;
    kpis_["T"]              = T;
    kpis_["tau_s"]          = tau;
    kpis_["k"]              = k;
    kpis_["Da_kTau"]        = Da;
    kpis_["xi_mol_per_s"]   = xi;
    kpis_["X_limiting"]     = X;
    kpis_["F_in_kmol_h"]    = F_in_kmols * 3600.0;
    kpis_["F_out_kmol_h"]   = F_out * 3600.0 / 1000.0;

    return r.converged ? 0 : 1;
}

} // namespace Choupo
