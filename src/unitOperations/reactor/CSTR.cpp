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
#include "thermo/reaction/RateLaw.H"
#include "thermo/reaction/Reaction.H"
#include "solver/NewtonRaphson.H"
#include "solver/NewtonND.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

int CSTR::solve(const DictPtr& dict,
                const ThermoPackage& thermo,
                int verbosity)
{
    auto feedDict = dict->subDict("feed");
    auto operDict = dict->subDict("operation");
    auto compDict = dict->subDict("composition");
    // `reaction` is read AFTER the multi-reaction branch below: a multi-reaction
    // unit declares `reactions ( r1 r2 );` and carries no single `reaction`.

    const scalar F_in_kmols = feedDict->lookupScalar("F",   Dims::molarFlow);
    const scalar T          = feedDict->lookupScalar("T",   Dims::temperature);
    const scalar V_R        = operDict->lookupScalar("V_R", Dims::volume);

    // Inlet vapour fraction.  The flowsheet has already inferred the feed phase
    // at its own (T, P, z) and supplies it here.  A reactor is NOT a phase-
    // change device, so the product leaves in the SAME phase it entered: a gas-
    // phase reaction fed superheated vapour must report a VAPOUR product, not a
    // (silently liquid) vf = 0.  We inherit the inlet phase instead of asserting
    // liquid; an isothermal continuation does not invent a phase boundary.
    const scalar vf_in = feedDict->lookupScalarOrDefault("vf", 0.0);

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

    // ---- MULTI-REACTION?  `reactions ( r1 r2 ... );` -----------------
    //  R coupled design equations solved together; the single-reaction path
    //  below (`reaction <name>;`) is untouched (bracketed Newton-1D).
    if (dict->hasDictList("reactions"))
        return solveMultiReaction(dict, thermo, verbosity, F_in_kmols, T,
                                  feedDict->lookupScalarOrDefault("P", 101325.0),
                                  V_R, vf_in, z_in);

    auto rxnDict = dict->subDict("reaction");

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
    out.P    = 0.0;                          // P not tracked here — set by flowsheet
    out.z    = z_out;
    out.vf   = vf_in;                        // inherit the inlet phase (no phase change)
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

    // -- Reactor duty on the ELEMENTS datum (heat crossing the boundary) ----
    // The CSTR is isothermal (T_out = T_in = T), so the heat it must exchange
    // to hold T against the reaction enthalpy is, on the ONE datum (elements,
    // 25 C), simply H_out - H_in -- computed EXACTLY as the energy-balance
    // report sums stream enthalpy, so the per-unit and global plant-boundary
    // ledgers agree.  The flowsheet inherits the product P from the inlet, so
    // the feed P used here matches the P the report will see.  Mirrors the
    // GibbsReactor fix; without it an isothermal reactor's heat of reaction
    // leaks out of globalEnergyBoundary.csv (the ~8.6% hole on process05).
    {
        const scalar P_ref = feedDict->lookupScalarOrDefault("P", 101325.0);
        const scalar H_in_kW = F_in_kmols * thermo.H_stream_formation(T, P_ref, vf_in, z_in);
        scalar H_out_kW = 0.0;
        for (const auto& s : produced_)
            H_out_kW += s.F * thermo.H_stream_formation(s.T, P_ref, s.vf, s.z);
        kpis_["Q_kW"] = H_out_kW - H_in_kW;   // F[kmol/s]*h[kJ/kmol] = kW
    }

    return r.converged ? 0 : 1;
}

// ---------------------------------------------------------------------------
//  MULTI-REACTION CSTR.  R coupled steady design equations,
//        g_j(xi) = xi_j - r_j(xi) V_R = 0,     F_i = F_i0 + SUM_j nu_ij xi_j,
//  solved TOGETHER by the multivariate Newton (finite-difference Jacobian).
//  Each reaction carries its own Arrhenius kinetics and, optionally, a reverse
//  leg by detailed balance (k_rev = k_fwd / Kc).  This is what makes SELECTIVITY
//  modellable -- series (A->B->C) and parallel (A->B, A->C) networks, where a
//  single-reaction reactor cannot express the competition at all.
// ---------------------------------------------------------------------------
int CSTR::solveMultiReaction(const DictPtr&       dict,
                             const ThermoPackage& thermo,
                             int                  verbosity,
                             scalar               F_in_kmols,
                             scalar               T,
                             scalar               P,
                             scalar               V_R,
                             scalar               vf_in,
                             const sVector&       z_in)
{
    const std::size_t n = thermo.n();
    auto rxnList = dict->lookupDictList("reactions");
    const std::size_t R = rxnList.size();
    if (R == 0) throw std::runtime_error("CSTR: the `reactions ( ... )` list is empty");

    std::vector<sVector>     nu(R, sVector(n, 0.0));
    std::vector<std::string> rname(R);
    // The RATE LAW is parsed once and evaluated at whatever temperature the
    // solver is currently trying -- in a non-isothermal CSTR that is the UNKNOWN
    // outlet temperature.  Power law or LHHW, the reactor does not care.
    std::vector<RateLaw> law;
    law.reserve(R);
    for (std::size_t j = 0; j < R; ++j)
    {
        rname[j] = rxnList[j]->lookupWordOrDefault("name", "rxn" + std::to_string(j + 1));
        for (const auto& s : rxnList[j]->lookupDictList("stoichiometry"))
            nu[j][thermo.indexOf(s->lookupWord("component"))] = s->lookupScalar("nu");
        law.push_back(RateLaw::fromDict(rxnList[j], thermo,
                                        "CSTR: reaction '" + rname[j] + "'"));
    }

    // ---- THERMAL MODE -------------------------------------------------
    //  `isothermal` (default -- T imposed, duty a result), `adiabatic`, or
    //  `heatExchange` (a jacket of conductance UA removing U A (T - T_c)).
    //  NON-ISOTHERMAL: the outlet T becomes an UNKNOWN, solved WITH the extents.
    //  There is NO dH_rxn source term: on the ELEMENTS datum the heat of reaction
    //  already lives inside H, so the energy equation is simply
    //      H_out(T, xi) = H_in + Q_external.
    //  This is where a CSTR shows MULTIPLICITY -- up to three steady states.  The
    //  Newton lands on ONE of them, chosen by `T_guess`; sweep it to find them all.
    auto operDict = dict->subDict("operation");
    const std::string tmode = operDict->lookupWordOrDefault("thermalMode", "isothermal");
    const bool isoT  = (tmode == "isothermal");
    const bool adiab = (tmode == "adiabatic");
    const bool hx    = (tmode == "heatExchange");
    if (!isoT && !adiab && !hx)
        throw std::runtime_error("CSTR: thermalMode must be `isothermal`, `adiabatic` "
            "or `heatExchange` (got '" + tmode + "')");
    const scalar UA = hx ? operDict->lookupScalar("UA") : 0.0;               // W/K
    const scalar Tc = hx ? operDict->lookupScalar("T_coolant", Dims::temperature) : 0.0;
    const scalar Tguess = operDict->lookupScalarOrDefault("T_guess", T, Dims::temperature);

    // CATALYST LOADING.  A heterogeneous rate constant is reported per gram of dry
    // catalyst, not per cubic metre of reactor.  Declare the bulk loading and the
    // reactor converts:  r[mol/(m3.s)] = 1000 . rho_cat[kg/m3] . r[mol/(g.s)].
    // Absent (the homogeneous case) the rate is already volumetric.
    const scalar catLoad   = operDict->lookupScalarOrDefault("catalystLoading", 0.0);  // kg/m^3
    const scalar catFactor = (catLoad > 0.0) ? 1000.0 * catLoad : 1.0;

    if (!isoT)
        for (std::size_t j = 0; j < R; ++j)
            for (std::size_t i = 0; i < n; ++i)
                if (nu[j][i] != 0.0)
                {
                    try { (void) thermo.comp(i).h_pure_ig(T); }
                    catch (const std::exception&)
                    {
                        throw std::runtime_error("CSTR: thermalMode `" + tmode + "` needs the "
                            "elements datum on every reacting species -- '"
                            + thermo.comp(i).name() + "' has no `standardThermochemistry` block "
                            "(a fictitious species carries none; use thermalMode isothermal)");
                    }
                }

    // Inlet (mol/s) + the liquid-basis volumetric flow (as the single path).
    const scalar F_in = F_in_kmols * 1000.0;
    sVector F_i_in(n, 0.0);
    for (std::size_t i = 0; i < n; ++i) F_i_in[i] = z_in[i] * F_in;
    scalar V_mol_in = 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        if (thermo.comp(i).Vliq() <= 0.0)
            throw std::runtime_error("CSTR: component '" + thermo.comp(i).name()
                + "' has Vliq <= 0 -- needed for liquid concentration");
        V_mol_in += z_in[i] * thermo.comp(i).Vliq();
    }
    const scalar Q   = F_in * V_mol_in;      // m^3/s
    const scalar tau = V_R / Q;              // s

    // Inlet enthalpy flow [W] on the ELEMENTS datum -- only when non-isothermal.
    const scalar H_in_W = isoT ? 0.0 : F_in * thermo.H_stream_formation(T, P, vf_in, z_in);

    scalar lastRes = 0.0;
    bool  converged = true;
    int   nIter = 0;

    // Outlet molar flows from a set of extents.
    auto flowsOf = [&](const sVector& xi)
    {
        sVector Fi(n, 0.0);
        for (std::size_t i = 0; i < n; ++i)
        {
            scalar v = F_i_in[i];
            for (std::size_t j = 0; j < R; ++j) v += nu[j][i] * xi[j];
            Fi[i] = std::max(v, 0.0);
        }
        return Fi;
    };

    // The R design equations at a FIXED temperature.  At fixed T the residual is
    // monotone in each extent (the rate falls as its reactant is consumed), so a
    // Newton from xi = 0 lands on the one root.  All the difficulty of a
    // non-isothermal CSTR lives in the temperature, not here.
    auto extentsAt = [&](scalar Tk, bool& okOut)
    {
        auto res = [&](const sVector& xi) -> sVector
        {
            const sVector Fi = flowsOf(xi);
            sVector conc(n, 0.0), xx(n, 0.0);
            scalar Ftot = 0.0;
            for (std::size_t i = 0; i < n; ++i) { conc[i] = Fi[i] / Q; Ftot += Fi[i]; }
            if (Ftot > 0.0) for (std::size_t i = 0; i < n; ++i) xx[i] = Fi[i] / Ftot;

            sVector g(R, 0.0);
            for (std::size_t j = 0; j < R; ++j)
                g[j] = xi[j] - catFactor * law[j].netRate(thermo, Tk, conc, xx) * V_R;
            return g;
        };
        solver::NDOptions o;
        o.tolerance = 1.0e-14 * std::max(F_in, 1.0);
        o.maxIter   = 200;
        const auto sl = solver::newtonND(res, sVector(R, 0.0), o);
        okOut = sl.converged;
        lastRes = sl.residual;
        nIter  += sl.iterations;
        return sl.x;
    };

    sVector xi(R, 0.0);
    scalar  T_out = T;
    std::vector<scalar> roots;

    if (isoT)
    {
        bool ok = false;
        xi = extentsAt(T, ok);
        converged = ok;
        recordResidual(lastRes);
        if (!ok && verbosity >= 1)
            std::cout << "  [cstr] WARNING: the multi-reaction Newton did not converge "
                         "(residual " << lastRes << ")\n";
    }
    else
    {
        // The energy residual, with the extents eliminated:  the textbook
        // "heat generated" vs "heat removed" balance, written as one function of T.
        //
        //     phi(T) = H_out(T, xi(T)) - H_in - Q_ext(T)          [W]
        //
        // There is NO dH_rxn source term: on the ELEMENTS datum the heat of
        // reaction already lives inside H.  phi may have up to THREE roots -- the
        // extinguished, unstable and ignited steady states of a non-isothermal
        // CSTR.  We do not pretend otherwise: we SCAN, report every root we find,
        // and hand back the one nearest T_guess.
        auto phi = [&](scalar Tk) -> scalar
        {
            bool ok = false;
            const sVector x = extentsAt(Tk, ok);
            const sVector Fi = flowsOf(x);
            scalar Ftot = 0.0;
            for (std::size_t i = 0; i < n; ++i) Ftot += Fi[i];
            sVector zz(n, 0.0);
            if (Ftot > 0.0) for (std::size_t i = 0; i < n; ++i) zz[i] = Fi[i] / Ftot;
            const scalar Hout = Ftot * thermo.H_stream_formation(Tk, P, vf_in, zz);
            const scalar Qext = hx ? UA * (Tc - Tk) : 0.0;
            return Hout - H_in_W - Qext;
        };

        // The bracket must span EVERY possible steady state, so it cannot stop at
        // the first sign change: the ignited branch may sit far above.  The
        // physical ceiling is the temperature reached at COMPLETE conversion --
        // beyond it there is no chemical energy left to spend.  Probe the extents
        // at a temperature where the rates are certainly reactant-limited, then
        // close the enthalpy balance on that saturated composition.
        scalar Tlo = std::min(T, hx ? Tc : T) - 25.0;
        if (Tlo < 50.0) Tlo = 50.0;

        bool okSat = false;
        const sVector xiSat = extentsAt(std::max(T, hx ? Tc : T) + 1000.0, okSat);
        const sVector FiSat = flowsOf(xiSat);
        scalar FtotSat = 0.0;
        for (std::size_t i = 0; i < n; ++i) FtotSat += FiSat[i];
        sVector zSat(n, 0.0);
        if (FtotSat > 0.0) for (std::size_t i = 0; i < n; ++i) zSat[i] = FiSat[i] / FtotSat;

        scalar Tad = std::max(T, hx ? Tc : T);
        for (int it = 0; it < 80; ++it)
        {
            auto fOf = [&](scalar Tt)
            {
                return FtotSat * thermo.H_stream_formation(Tt, P, vf_in, zSat)
                     - H_in_W - (hx ? UA * (Tc - Tt) : 0.0);
            };
            const scalar f = fOf(Tad), dT = 1.0e-3;
            const scalar df = (fOf(Tad + dT) - f) / dT;
            if (std::abs(df) < 1.0e-12) break;
            const scalar step = std::max(-100.0, std::min(100.0, -f / df));
            Tad += step;
            if (Tad < Tlo) Tad = Tlo;
            if (Tad > 3000.0) { Tad = 3000.0; break; }
            if (std::abs(step) < 1.0e-6) break;
        }
        scalar Thi = std::max(std::max(T, hx ? Tc : T), Tad) + 25.0;
        if (Thi > 3000.0) Thi = 3000.0;

        if (verbosity >= 3)
            std::cout << "  [cstr] scanning the energy balance on T in ["
                      << Tlo << ", " << Thi << "] K for steady states  "
                      << "(ceiling = complete conversion at " << Tad << " K)\n";

        // Scan for sign changes, then bisect each one.  ~1 K resolution.
        const int nScan = std::min(1000, std::max(120, int(Thi - Tlo)));
        scalar Tp = Tlo, fp = phi(Tlo);
        for (int k = 1; k <= nScan; ++k)
        {
            const scalar Tq = Tlo + (Thi - Tlo) * scalar(k) / scalar(nScan);
            const scalar fq = phi(Tq);
            if (fp == 0.0) roots.push_back(Tp);
            else if (fp * fq < 0.0)
            {
                scalar a = Tp, b = Tq, fa = fp;
                for (int it = 0; it < 100; ++it)
                {
                    const scalar m = 0.5 * (a + b), fm = phi(m);
                    if (fa * fm <= 0.0) b = m; else { a = m; fa = fm; }
                    if (b - a < 1.0e-9) break;
                }
                roots.push_back(0.5 * (a + b));
            }
            Tp = Tq; fp = fq;
        }

        if (roots.empty())
        {
            if (verbosity >= 1)
                std::cout << "  [cstr] WARNING: no steady state found on T in ["
                          << Tlo << ", " << Thi << "] K -- reporting T_guess\n";
            T_out = Tguess;
        }
        else
        {
            T_out = roots[0];
            for (const scalar r : roots)
                if (std::abs(r - Tguess) < std::abs(T_out - Tguess)) T_out = r;
        }
        bool ok = false;
        xi = extentsAt(T_out, ok);
        converged = ok && !roots.empty();
        recordResidual(lastRes);

        if (verbosity >= 2)
        {
            std::cout << "  [cstr] steady state" << (roots.size() == 1 ? "" : "s")
                      << " found: " << roots.size();
            if (!roots.empty())
            {
                std::cout << "  (";
                for (std::size_t k = 0; k < roots.size(); ++k)
                    std::cout << (k ? ", " : "") << roots[k] << " K";
                std::cout << ")";
            }
            if (roots.size() > 1)
                std::cout << "  -- MULTIPLICITY; reporting the one nearest T_guess = " << Tguess << " K";
            std::cout << "\n";
        }
    }

    // ---- Outlet -------------------------------------------------------
    sVector F_i_out(n, 0.0); scalar F_out = 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        scalar v = F_i_in[i];
        for (std::size_t j = 0; j < R; ++j) v += nu[j][i] * xi[j];
        F_i_out[i] = std::max(0.0, v);
        F_out     += F_i_out[i];
    }
    sVector z_out(n, 0.0);
    if (F_out > 0.0) for (std::size_t i = 0; i < n; ++i) z_out[i] = F_i_out[i] / F_out;

    produced_.clear();
    ProcessStream out;
    out.name = "out";
    out.F  = F_out / 1000.0;                 // mol/s -> kmol/s
    out.T  = T_out;                          // a RESULT when non-isothermal
    out.P  = 0.0;                            // set by the flowsheet
    out.z  = z_out;
    out.vf = vf_in;                          // no phase change in a reactor
    produced_.push_back(out);

    // ---- KPIs ---------------------------------------------------------
    kpis_.clear();
    kpis_["V_R"]            = V_R;
    kpis_["T"]              = T;
    kpis_["tau_s"]          = tau;
    kpis_["nReactions"]     = static_cast<scalar>(R);
    kpis_["newtonResidual"] = lastRes;
    kpis_["F_in_kmol_h"]    = F_in_kmols * 3600.0;
    kpis_["F_out_kmol_h"]   = F_out * 3600.0 / 1000.0;
    kpis_["T_out"] = T_out;
    if (!isoT)
    {
        kpis_["dT_rise"]      = T_out - T;
        kpis_["T_guess"]      = Tguess;
        kpis_["steadyStates"] = scalar(roots.size());   // 3 means multiplicity
    }
    for (std::size_t j = 0; j < R; ++j)
    {
        kpis_["xi_" + rname[j] + "_mol_per_s"] = xi[j];
        kpis_["k_"  + rname[j]] = law[j].kForward(T_out);
    }
    // Duty from the ENTHALPY BALANCE on the formation datum (one reaction-heat
    // resolver -- never a per-reaction dH_rxn key).
    try
    {
        const scalar H_in_kW = F_in_kmols * thermo.H_stream_formation(T, P, vf_in, z_in);
        scalar H_out_kW = 0.0;
        for (const auto& s : produced_)
            H_out_kW += s.F * thermo.H_stream_formation(s.T, P, s.vf, s.z);
        kpis_["Q_kW"] = H_out_kW - H_in_kW;
    }
    catch (const std::exception&) { /* a species lacks formation data -- no duty */ }

    if (verbosity >= 2)
    {
        std::cout << "\n=================  CSTR (multi-reaction) Result  ====================\n"
                  << "  Reactions:        " << R << "   (Newton " << nIter
                  << " it, residual " << std::scientific << std::setprecision(2)
                  << lastRes << ")\n" << std::fixed << std::setprecision(5)
                  << "  V_R = " << V_R << " m^3    tau = " << std::setprecision(2)
                  << tau << " s    F_out = " << std::setprecision(4)
                  << (F_out * 3.6 / 1000.0) << " kmol/h\n";
        if (catLoad > 0.0)
            std::cout << "  catalyst:         " << std::fixed << std::setprecision(1)
                      << catLoad << " kg/m^3 bulk  (rate constants are per gram of catalyst)\n";
        std::cout << "  thermalMode:      " << tmode;
        if (!isoT) std::cout << "   T_in = " << std::setprecision(2) << T
                             << " K -> T_out = " << T_out << " K   (dT = "
                             << (T_out - T) << " K, landed from T_guess = " << Tguess << " K)";
        std::cout << "\n";
        for (std::size_t j = 0; j < R; ++j)
            std::cout << "  " << std::left << std::setw(12) << rname[j] << std::right
                      << "  k(T_out) = " << std::scientific << std::setprecision(3)
                      << law[j].kForward(T_out)
                      << "   xi = " << xi[j] << " mol/s"
                      << "   [" << law[j].typeName() << "]\n" << std::fixed;
        std::cout << "=====================================================================\n\n";
    }
    return converged ? 0 : 1;
}

} // namespace Choupo
