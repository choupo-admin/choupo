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
#include "PolymerKPIs.H"
#include "ReactionHeat.H"
#include "core/Constants.H"
#include "thermo/reaction/RateLaw.H"
#include "thermo/reaction/Reaction.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <optional>
#include <stdexcept>

namespace Choupo {

int PFR::solve(const DictPtr& dict,
               const ThermoPackage& thermo,
               int verbosity)
{
    auto feedDict = dict->subDict("feed");
    auto operDict = dict->subDict("operation");
    auto compDict = dict->subDict("composition");
    // `reaction` is read AFTER the multi-reaction branch: a multi-reaction unit
    // declares `reactions ( r1 r2 );` and carries no single `reaction`.

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

    // ---- MULTI-REACTION?  `reactions ( r1 r2 ... );` ------------------
    //  dF_i/dV = SUM_j nu_ij r_j(F), marched by the same RK4.  The single-
    //  reaction path below (`reaction <name>;`) is untouched.
    if (dict->hasDictList("reactions"))
        return solveMultiReaction(dict, thermo, verbosity, F_in_kmols, T,
                                  feedDict->lookupScalarOrDefault("P", 101325.0),
                                  V_R, vf_in, nSteps, z_in);

    auto rxnDict = dict->subDict("reaction");

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
    const scalar k     = Reaction::arrheniusRate(A_pre, Ea, T);

    // Optional reversible reaction: same detailed-balance closure as the
    // CSTR --- k_rev = k_fwd / Kc with Kc the concentration-basis equilibrium
    // constant (Reaction::equilibriumKc).  The PFR is isothermal, so Kc is
    // evaluated once; the reactor then relaxes toward the equilibrium
    // conversion along its length instead of running to 100 %.
    const bool reversible =
        rxnDict->lookupWordOrDefault("reversible", "false") == "true";
    scalar k_rev = 0.0;
    if (reversible)
    {
        const scalar K_eq = Reaction::equilibriumKc(thermo, nu, T);
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

    if (reversible && verbosity >= 3)
    {
        const auto eq = Reaction::equilibrium(thermo, nu, T);
        std::cout << "Reversible:  Kp = " << std::scientific << std::setprecision(4)
                  << eq.Kp << "   Σν = " << std::showpos << eq.sumNu << std::noshowpos
                  << "   Kc = " << eq.Kc
                  << "  (= Kp·(P°/RuT)^Σν)\n"
                  << "             k_rev = k_fwd / Kc = " << k_rev << "\n\n";
    }

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
    out.vf   = vf_in;      // inherit the inlet phase (no phase change)
    produced_.push_back(out);

    // -- KPIs (published for outer drivers / post-processors) -------------
    kpis_.clear();
    kpis_["V_R"]          = V_R;
    kpis_["T"]            = T;
    kpis_["tau_s"]        = tau;
    kpis_["Da_kTau"]      = Da;
    kpis_["X_limiting"]   = X;
    kpis_["F_out_kmol_h"] = F_out * 3600.0 / 1000.0;

    // -- Reactor duty on the ELEMENTS/formation datum --------------------
    // The PFR is isothermal (T_out = T_in = T), so the heat it must exchange to
    // hold T against the reaction enthalpy is dH_rxn(T)·ξ on the ONE datum.  The
    // shared resolver derives dH_rxn(T) = Σ νᵢ·hᵢ(T) from the species'
    // standardThermochemistry (and announces it); without this the PFR's reaction heat
    // leaked out of globalEnergyBoundary (the leak CSTR/GibbsReactor already
    // plug).  Reported only when every reacting species carries formation data.
    {
        std::vector<std::size_t> rcomps;
        sVector                  rnu;
        for (std::size_t i = 0; i < n; ++i)
            if (nu[i] != 0.0) { rcomps.push_back(i); rnu.push_back(nu[i]); }

        const std::string targetPhase = (vf_in >= 0.5) ? "gas" : "liquid";
        std::string heatSource;
        const scalar dHrxn = reactionHeat(thermo, rcomps, rnu, T, targetPhase,
            std::nullopt, "PFR", verbosity, heatSource);

        if (heatSource == "formation")
        {
            // Extent ξ [mol/s] from the limiting reactant's conversion.
            const scalar xi_mol_s = (F_lim_in - F_i[iLim]) / (-nu[iLim]);
            kpis_["dHrxn_kJ_per_mol"] = dHrxn / 1000.0;
            kpis_["Q_kW"]             = xi_mol_s * dHrxn / 1000.0;  // <0 exothermic
        }
    }

    // -- Optional step-growth polymer statistics --------------------------
    //  An opt-in `polymer { mode stepGrowth; M0 ...; }` sub-dict turns the
    //  reactor's conversion p into Carothers/Flory chain statistics.  The
    //  PFR is uniform-residence-time, so the Flory-Schulz distribution
    //  (PDI = 1+p) is physically valid here (unlike a CSTR).  Absent block
    //  -> nothing changes (the keyed parser ignores it).
    if (rxnDict->found("polymer"))
    {
        auto polyDict = rxnDict->subDict("polymer");
        const std::string mode =
            polyDict->lookupWordOrDefault("mode", "stepGrowth");
        if (mode != "stepGrowth")
            throw std::runtime_error("PFR: polymer mode '" + mode
                + "' not supported (chain-growth is a future slice); "
                  "use 'stepGrowth'");
        const scalar M0 = polyDict->lookupScalar("M0", Dims::molarMass);
        const int maxX  = static_cast<int>(
            polyDict->lookupScalarOrDefault("maxChainLength", 100));
        const bool wantDist =
            polyDict->lookupWordOrDefault("distribution", "true") == "true";
        //  p = conversion of the limiting functional group (single source
        //  of truth: the reactor's own X).
        PolymerKPIs::addStepGrowthKPIs(kpis_, profile_, X, M0,
                                       maxX, wantDist, verbosity);
    }

    return 0;
}

// ---------------------------------------------------------------------------
//  MULTI-REACTION PFR.  An initial-value problem, no Newton:
//        dF_i/dV = SUM_j nu_ij r_j(F),
//  marched by the SAME RK4 as the single-reaction path.  Each reaction carries
//  its own Arrhenius kinetics and, optionally, a reverse leg by detailed balance
//  (k_rev = k_fwd / Kc).  A SERIES network is where the PFR earns its keep: with
//  no back-mixing the intermediate is not fed back to the over-reaction, so a PFR
//  yields MORE of it than a CSTR of the same residence time.
// ---------------------------------------------------------------------------
int PFR::solveMultiReaction(const DictPtr&       dict,
                            const ThermoPackage& thermo,
                            int                  verbosity,
                            scalar               F_in_kmols,
                            scalar               T,
                            scalar               P,
                            scalar               V_R,
                            scalar               vf_in,
                            int                  nSteps,
                            const sVector&       z_in)
{
    const std::size_t n = thermo.n();
    auto rxnList = dict->lookupDictList("reactions");
    const std::size_t R = rxnList.size();
    if (R == 0) throw std::runtime_error("PFR: the `reactions ( ... )` list is empty");

    std::vector<sVector>     nu(R, sVector(n, 0.0));
    std::vector<std::string> rname(R);
    // The RATE LAW is parsed once, never frozen: in a non-isothermal reactor it
    // must be re-evaluated at the LOCAL temperature at every RK4 stage.  Power
    // law or LHHW -- the marching scheme does not need to know which.
    std::vector<RateLaw> law;
    law.reserve(R);
    for (std::size_t j = 0; j < R; ++j)
    {
        rname[j] = rxnList[j]->lookupWordOrDefault("name", "rxn" + std::to_string(j + 1));
        for (const auto& s : rxnList[j]->lookupDictList("stoichiometry"))
            nu[j][thermo.indexOf(s->lookupWord("component"))] = s->lookupScalar("nu");
        law.push_back(RateLaw::fromDict(rxnList[j], thermo,
                                        "PFR: reaction '" + rname[j] + "'"));
    }

    // ---- THERMAL MODE -------------------------------------------------
    //  `isothermal` (default -- T imposed, duty a result), `adiabatic` (the
    //  reaction heats the stream: dT/dV = SUM_j (-dH_j) r_j / SUM_i F_i cp_i), or
    //  `heatExchange` (a jacket adds U a (T_c - T) per unit volume).  The
    //  temperature is marched WITH the species by the same RK4 -- a hot spot in
    //  an exothermic PFR is a RESULT you SEE in the axial profile, never a knob.
    auto operDict = dict->subDict("operation");
    const std::string tmode = operDict->lookupWordOrDefault("thermalMode", "isothermal");
    const bool isoT  = (tmode == "isothermal");
    const bool adiab = (tmode == "adiabatic");
    const bool hx    = (tmode == "heatExchange");
    if (!isoT && !adiab && !hx)
        throw std::runtime_error("PFR: thermalMode must be `isothermal`, `adiabatic` "
            "or `heatExchange` (got '" + tmode + "')");
    const scalar Uw = hx ? operDict->lookupScalar("U") : 0.0;                 // W/(m^2.K)
    const scalar aV = hx ? operDict->lookupScalar("areaPerVolume") : 0.0;     // m^2/m^3
    const scalar Tc = hx ? operDict->lookupScalar("T_coolant", Dims::temperature) : 0.0;

    // CATALYST LOADING.  A heterogeneous rate constant is reported per gram of dry
    // catalyst; the bed converts it to a volumetric rate.  Absent => already volumetric.
    const scalar catLoad   = operDict->lookupScalarOrDefault("catalystLoading", 0.0);  // kg/m^3
    const scalar catFactor = (catLoad > 0.0) ? 1000.0 * catLoad : 1.0;

    // Phase-aware molar heat capacity (the reactor is liquid-basis via Vliq).
    // The reaction enthalpy stays on the ideal-gas formation datum (as everywhere
    // in Choupo) -- for a liquid-phase reaction that neglects the mixing/vaporisation
    // corrections; announced, not hidden.

    // A non-isothermal reactor needs the heat of reaction, hence the elements
    // datum on EVERY reacting species.  Refuse LOUDLY and EARLY rather than let
    // h_pure_ig throw deep inside the RK4 -- a fictitious species (no elements)
    // simply cannot carry an energy balance.
    if (!isoT)
        for (std::size_t j = 0; j < R; ++j)
            for (std::size_t i = 0; i < n; ++i)
                if (nu[j][i] != 0.0)
                {
                    try { (void) thermo.comp(i).h_pure_ig(T); }
                    catch (const std::exception&)
                    {
                        throw std::runtime_error("PFR: thermalMode `" + tmode + "` needs the "
                            "heat of reaction, so every reacting species needs a "
                            "`standardThermochemistry` block -- '" + thermo.comp(i).name()
                            + "' has none (a fictitious species carries no elements datum; "
                              "use thermalMode isothermal, or a real species)");
                    }
                }

    // Inlet (mol/s) + liquid-basis volumetric flow (as the single path).
    const scalar F_in = F_in_kmols * 1000.0;
    sVector F_i(n, 0.0);
    for (std::size_t i = 0; i < n; ++i) F_i[i] = z_in[i] * F_in;
    scalar V_mol_in = 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        if (thermo.comp(i).Vliq() <= 0.0)
            throw std::runtime_error("PFR: component '" + thermo.comp(i).name()
                + "' has Vliq <= 0 -- needed for liquid concentration");
        V_mol_in += z_in[i] * thermo.comp(i).Vliq();
    }
    const scalar Q   = F_in * V_mol_in;
    const scalar tau = V_R / Q;

    // ENTHALPY FORMULATION.  The augmented state is  y = [ F_0 .. F_{n-1}, H ]
    // with H the TOTAL enthalpy flow [W] on the elements datum -- not T.  Why:
    // the heat of reaction and the sensible heat must be the SAME enthalpy
    // function, or an "adiabatic" reactor silently fails to conserve H.  So we
    // march H (dH/dV = 0 adiabatic; = U a (T_c - T) with a jacket) and RECOVER T
    // by inverting the stream enthalpy at each stage.  Then Q = 0 for an adiabatic
    // reactor BY CONSTRUCTION, and the reaction heat is whatever the thermo says.
    auto T_from_h = [&](scalar h_target, const sVector& zz, scalar Tguess) -> scalar
    {
        scalar Tk = Tguess;                        // h(T) is monotone (cp > 0)
        for (int it = 0; it < 40; ++it)
        {
            const scalar h  = thermo.H_stream_formation(Tk, P, vf_in, zz);
            const scalar dT = 1.0e-3;
            const scalar cp = (thermo.H_stream_formation(Tk + dT, P, vf_in, zz) - h) / dT;
            if (std::abs(cp) < 1.0e-12) break;
            const scalar step = (h_target - h) / cp;
            Tk += std::max(-50.0, std::min(50.0, step));       // damped
            if (std::abs(step) < 1.0e-7) break;
        }
        return Tk;
    };

    scalar T_lastGuess = T;                        // warm start across RK4 stages
    auto dydV = [&](const sVector& y) -> sVector
    {
        scalar Ftot = 0.0;
        for (std::size_t i = 0; i < n; ++i) Ftot += std::max(y[i], 0.0);
        sVector zz(n, 0.0);
        if (Ftot > 0.0) for (std::size_t i = 0; i < n; ++i) zz[i] = std::max(y[i], 0.0) / Ftot;

        const scalar Tk = isoT ? T
                               : T_from_h(y[n] / std::max(Ftot, 1.0e-30), zz, T_lastGuess);
        if (!isoT) T_lastGuess = Tk;

        sVector dy(n + 1, 0.0);
        sVector conc(n, 0.0);
        for (std::size_t i = 0; i < n; ++i) conc[i] = std::max(y[i], 0.0) / Q;
        for (std::size_t j = 0; j < R; ++j)
        {
            const scalar rj = catFactor * law[j].netRate(thermo, Tk, conc, zz);   // mol/(m^3.s)
            for (std::size_t i = 0; i < n; ++i) dy[i] += nu[j][i] * rj;
        }
        // Enthalpy: conserved when adiabatic; a jacket adds U a (T_c - T) per volume.
        dy[n] = (!isoT && hx) ? Uw * aV * (Tc - Tk) : 0.0;     // W/m^3
        return dy;
    };

    // ---- RK4 march along the reactor volume, recording the axial profile ----
    profile_.columns.clear();
    profile_.xAxis = "V";
    auto push = [&](scalar V, const sVector& y, scalar Tk)
    {
        profile_.columns["V"].push_back(V);
        for (std::size_t i = 0; i < n; ++i)
            profile_.columns["F_" + thermo.comp(i).name()].push_back(y[i]);
        profile_.columns["T"].push_back(Tk);
    };
    auto axpy = [](const sVector& a, scalar c, const sVector& b)
    {
        sVector r(a.size());
        for (std::size_t i = 0; i < a.size(); ++i) r[i] = a[i] + c * b[i];
        return r;
    };

    // T at the current state, recovered from the ENTHALPY (elements datum).
    auto T_of = [&](const sVector& yy) -> scalar
    {
        if (isoT) return T;
        scalar Ftot = 0.0;
        for (std::size_t i = 0; i < n; ++i) Ftot += std::max(yy[i], 0.0);
        sVector zz(n, 0.0);
        if (Ftot > 0.0) for (std::size_t i = 0; i < n; ++i) zz[i] = std::max(yy[i], 0.0) / Ftot;
        return T_from_h(yy[n] / std::max(Ftot, 1.0e-30), zz, T_lastGuess);
    };

    sVector y(n + 1, 0.0);
    for (std::size_t i = 0; i < n; ++i) y[i] = F_i[i];
    // The inlet ENTHALPY FLOW [W] on the elements datum -- the conserved quantity.
    // Only needed (and only computable) when the reactor is NOT isothermal: a
    // fictitious species has no elements datum, and an isothermal run never asks.
    y[n] = isoT ? 0.0 : F_in * thermo.H_stream_formation(T, P, vf_in, z_in);

    scalar T_max = T, T_min = T;
    const scalar dV = V_R / nSteps;
    push(0.0, y, T);
    for (int m = 0; m < nSteps; ++m)
    {
        auto k1 = dydV(y);
        auto k2 = dydV(axpy(y, 0.5 * dV, k1));
        auto k3 = dydV(axpy(y, 0.5 * dV, k2));
        auto k4 = dydV(axpy(y,       dV, k3));
        // FRACTION-TO-BOUNDARY commit: when the RK4 increment would drive a
        // reactant below zero (complete conversion inside one step), the
        // WHOLE increment is scaled so the limiting species lands exactly
        // at 0 -- stoichiometry preserved, mass conserved.  The old
        // per-species clamp CREATED matter (+0.216% F_out on an equimolar
        // reaction in pfr04: reactants raised to 0 while products kept the
        // overshoot -- found by the #106 golden scrutiny).  For a cooled
        // PFR the wall term of that one sub-step scales with the same
        // fraction (an O(dV) local error at the exhaustion point);
        // adiabatic and isothermal paths are exact.
        sVector dy(n + 1);
        for (std::size_t i = 0; i <= n; ++i)
            dy[i] = dV / 6.0 * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]);
        scalar frac = 1.0;
        for (std::size_t i = 0; i < n; ++i)
            if (dy[i] < 0.0 && y[i] + dy[i] < 0.0)
                frac = std::min(frac, y[i] / (-dy[i]));
        for (std::size_t i = 0; i <= n; ++i) y[i] += frac * dy[i];
        for (std::size_t i = 0; i < n; ++i)
            if (y[i] < 0.0) y[i] = 0.0;              // round-off dust only
        const scalar Tnow = T_of(y);
        if (!isoT) { if (Tnow > T_max) T_max = Tnow; if (Tnow < T_min) T_min = Tnow; }
        push(dV * (m + 1), y, Tnow);
    }
    for (std::size_t i = 0; i < n; ++i) F_i[i] = y[i];
    const scalar T_out = T_of(y);

    // ---- Outlet -------------------------------------------------------
    scalar F_out = 0.0;
    for (std::size_t i = 0; i < n; ++i) F_out += F_i[i];
    sVector z_out(n, 0.0);
    if (F_out > 0.0) for (std::size_t i = 0; i < n; ++i) z_out[i] = F_i[i] / F_out;

    produced_.clear();
    ProcessStream out;
    out.name = "out";
    out.F  = F_out / 1000.0;                 // mol/s -> kmol/s
    out.T  = T_out;                          // a RESULT when non-isothermal
    out.P  = 0.0;                            // set by the flowsheet
    out.z  = z_out;
    out.vf = vf_in;
    produced_.push_back(out);

    // ---- KPIs ---------------------------------------------------------
    kpis_.clear();
    kpis_["V_R"]          = V_R;
    kpis_["T"]            = T;
    kpis_["tau_s"]        = tau;
    kpis_["nReactions"]   = static_cast<scalar>(R);
    kpis_["nSteps"]       = static_cast<scalar>(nSteps);
    kpis_["F_in_kmol_h"]  = F_in_kmols * 3600.0;
    kpis_["F_out_kmol_h"] = F_out * 3600.0 / 1000.0;
    kpis_["T_out"]        = T_out;                 // RESULT when non-isothermal
    if (!isoT) { kpis_["T_max"] = T_max; kpis_["T_min"] = T_min;
                 kpis_["dT_rise"] = T_out - T; kpis_["hotSpot_dT"] = T_max - T; }
    for (std::size_t j = 0; j < R; ++j)
        kpis_["k_" + rname[j]] = law[j].kForward(T);                            // at the INLET T
    try
    {
        const scalar H_in_kW = F_in_kmols * thermo.H_stream_formation(T, P, vf_in, z_in);
        scalar H_out_kW = 0.0;
        for (const auto& s : produced_)
            H_out_kW += s.F * thermo.H_stream_formation(s.T, P, s.vf, s.z);
        kpis_["Q_kW"] = H_out_kW - H_in_kW;   // ~0 for an adiabatic reactor
    }
    catch (const std::exception&) { /* a species lacks formation data */ }

    if (verbosity >= 2)
    {
        std::cout << "\n==================  PFR (multi-reaction) Result  ====================\n"
                  << "  Reactions:        " << R << "   (RK4, " << nSteps << " steps)\n"
                  << std::fixed << std::setprecision(5)
                  << "  V_R = " << V_R << " m^3    tau = " << std::setprecision(2)
                  << tau << " s    F_out = " << std::setprecision(4)
                  << (F_out * 3.6 / 1000.0) << " kmol/h\n";
        std::cout << "  thermalMode:      " << tmode;
        if (!isoT) std::cout << "   T_in = " << std::setprecision(2) << T
                             << " K -> T_out = " << T_out << " K"
                             << "   (peak " << T_max << " K, hot spot +"
                             << (T_max - T) << " K)";
        std::cout << "\n";
        for (std::size_t j = 0; j < R; ++j)
            std::cout << "  " << std::left << std::setw(12) << rname[j] << std::right
                      << "  k(T_in) = " << std::scientific << std::setprecision(3)
                      << law[j].kForward(T)
                      << "   [" << law[j].typeName() << "]\n" << std::fixed;
        std::cout << "=====================================================================\n\n";
    }
    return 0;
}

} // namespace Choupo
