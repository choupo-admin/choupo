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
#include "CatalystPellet.H"
#include "PolymerKPIs.H"
#include "ReactorOutlet.H"
#include "ReactionHeat.H"
#include "core/Advisory.H"
#include "core/Constants.H"
#include "core/RegistryRefusal.H"
#include "core/Units.H"
#include "thermo/equationOfState/EquationOfState.H"
#include "thermo/reaction/ExpressionRate.H"
#include "thermo/reaction/ReactionRate.H"
#include "thermo/reaction/Reaction.H"
#include "thermo/utility/UtilityCatalogue.H"
#include "unitOperations/flash/StreamEquilibrium.H"
#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <map>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>
#include <memory>
namespace Choupo {

namespace {

// ---------------------------------------------------------------------------
//  A BED ON A DECLARED LAW (DEV.md 4c C67, 2026-10-12).  Until that day the
//  `pfr` carried a third rate law beside the factory -- Dyson & Simon's
//  ammonia synthesis rate, its constants compiled into the engine, selected
//  from a fixed word list.  The law now lives in the CASE (`type
//  expression;` in constant/reactions) and every law reaches this reactor
//  through ReactionRate::New; what the Dyson-Simon branch published about
//  the bed (the rate at both ends, the law's own equilibrium temperature and
//  the approach to it, the space velocity, the law's fugacity coefficients
//  against the package's) is published for ANY expression law that declares
//  what the number needs, under the names the branch used.
// ---------------------------------------------------------------------------

//  The stem of the rate KPIs and the profile column: the law's value in the
//  reaction-engineering unit, kmol per m3 (or kg) per HOUR, named for what it
//  is the rate OF.  `rate_in_kmolNH3_m3_h` for a law with `rateOf NH3;`.
std::string rateStem(const ExpressionRate& ex)
{
    const std::string per = (ex.declaredBasis() == "reactorVolume") ? "_m3_h" : "_kg_h";
    return (ex.rateOf() == "extent") ? "kmol" + per : "kmol" + ex.rateOf() + per;
}

//  The unit's name, for the outlet-state locus (the flowsheet names the dict).
std::string unitNameOf(const DictPtr& dict)
{
    return !dict->name().empty() ? dict->name()
                                 : dict->lookupWordOrDefault("name", "pfr");
}

} // namespace

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
    const scalar V_R        = bedVolume(operDict);

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

    // Inlet phase -- the INLET's, read to price the inlet and as the march's
    // first phase guess (C77).  It is NOT the outlet's: since C73
    // (2026-10-17) the product is published at its OWN equilibrium
    // (`reactorOutlet::outletState`), the old "the product leaves in the
    // phase it entered" having published a liquid feed's gas at vf = 0.
    // An UNPINNED authored feed is
    // resolved at its own (T, P, z), single phase included (R-E2; DEV.md
    // C33/C34); a produced feed keeps its producer's answer.
    const scalar vf_in = flashState::resolvedInletVaporFraction(feedDict, T,
        feedDict->lookupScalarOrDefault("P", 101325.0), z_in, thermo, "pfr inlet");

    // ---- MULTI-REACTION?  `reactions ( r1 r2 ... );` ------------------
    //  dF_i/dV = SUM_j nu_ij r_j(F), marched by the same RK4.  The single-
    //  reaction path below (`reaction <name>;`) is untouched.
    if (dict->hasDictList("reactions"))
        return solveMultiReaction(dict, thermo, verbosity, F_in_kmols, T,
                                  feedDict->lookupScalarOrDefault("P", 101325.0),
                                  V_R, vf_in, nSteps, z_in);

    auto rxnDict = dict->subDict("reaction");  refuseBedHydraulicsOnSinglePath(operDict);

    const scalar F_in_mol_s = F_in_kmols * 1000.0;                   // kmol/s -> mol/s

    // -- Stoichiometry / kinetics ----------------------------------------
    sVector nu   (n, 0.0);
    sVector order(n, 0.0);
    auto stoich = rxnDict->lookupDictList("stoichiometry");
    for (const auto& s : stoich)
    {
        std::size_t i = thermo.indexOf(s->lookupWord("component"));
        nu[i]    = s->lookupScalar("nu");
        order[i] = Reaction::forwardOrder(*s, nu[i],
            s->lookupWord("component"), "PFR");
    }
    const std::string limiting = rxnDict->lookupWord("limitingReactant");
    const std::size_t iLim = thermo.indexOf(limiting);

    auto kinDict = rxnDict->subDict("kinetics");
    if (kinDict->lookupWord("type") != "Arrhenius")
        throw std::runtime_error("PFR: the single-reaction path (`reaction <name>;`)"
            " is the liquid-basis isothermal power-law integrator and reads"
            " `kinetics { type Arrhenius; }` only (got '"
            + kinDict->lookupWord("type") + "').  Every other law -- LHHW,"
            " `type expression`, a law registered from the case's code/ -- is"
            " read on the multi-reaction path: declare the reaction in a"
            " `reactions ( <name> );` list (one element is fine), which is also"
            " the only path with `thermalMode adiabatic`.");
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

    // -- Net volumetric reaction rate (mol/(m^3.s)) at a flow state.  Hoisted
    //    above the profile sink so the profile can publish the limiting
    //    reactant's consumption rate at every stored point -- the Levenspiel
    //    ordinate 1/(-r_lim) is the CLASSROOM construction over this column,
    //    and the engine publishes the rate it already evaluates inside every
    //    RK4 stage rather than letting a view re-derive kinetics.
    // CATALYST LOADING -- the SAME conversion the multi-reaction path applies:
    // r[mol/(m3.s)] = 1000 * rho_cat[kg/m3] * r[mol/(g.s)].  Until 2026-08-30
    // only `reactions ( ... )` read this key on the PFR too; a per-gram rate
    // constant on the single-reaction grammar ran as if already volumetric.
    // (No monotone guard is needed here: the PFR integrates, it does not
    // root-find, so an autocatalytic law is simply integrated.)
    const scalar catLoad   = operDict->lookupScalarOrDefault("catalystLoading", 0.0);  // kg/m^3
    const scalar catFactor = (catLoad > 0.0) ? 1000.0 * catLoad : 1.0;
    announceUnresolvedPellet("pfr", catLoad, verbosity);

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
        if (!reversible) return catFactor * r;
        // Reverse leg: mass-action on the products (ν > 0).
        scalar r_rev = k_rev;
        for (std::size_t j = 0; j < n; ++j)
        {
            if (nu[j] <= 0.0) continue;
            scalar Cj = Fi[j] / Q;
            if (Cj < 0.0) Cj = 0.0;
            r_rev *= std::pow(Cj, nu[j]);
        }
        return catFactor * (r - r_rev);
    };

    // -- Profile sink: store V, F_i, X and -r_lim at every step so the GUI
    //    can plot axial profiles and the Levenspiel construction.
    //    nSteps+1 entries (inlet + every RK4 end).
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
    const std::string rateCol = "minus_r_" + limiting;
    profile_.columns[rateCol].reserve(nSteps + 1);
    const scalar F_lim_in = z_in[iLim] * F_in_mol_s;
    auto pushProfile = [&](scalar V, const sVector& Fcur)
    {
        profile_.columns["V"].push_back(V);
        for (std::size_t i = 0; i < n; ++i)
            profile_.columns["F_" + thermo.comp(i).name()].push_back(Fcur[i]);
        const scalar X_here = (F_lim_in - Fcur[iLim]) / F_lim_in;
        profile_.columns["X"].push_back(X_here);
        // Consumption rate of the limiting reactant, -r_lim = -nu_lim * r
        // (nu_lim < 0 for a reactant, so the published number is positive
        // while the reaction proceeds forward and NEGATIVE past equilibrium
        // on a reversible law -- the sign is information, not an error).
        profile_.columns[rateCol].push_back(-nu[iLim] * rate(Fcur));
    };
    pushProfile(0.0, F_i);
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
        // FRACTION-TO-BOUNDARY commit -- the multi-reaction path's own
        // mechanism (#106), adopted here 2026-08-30 when a stiff loading
        // probe drove the limiting reactant to -10x its feed in one coarse
        // step and X came out ABOVE 1 at exit 0.  When the increment would
        // cross zero, the WHOLE step is scaled so the limiting species
        // lands exactly at 0: stoichiometry preserved, mass conserved, an
        // O(dV) local error at the exhaustion point.  frac = 1 whenever no
        // crossing happens, so every resolved case is byte-identical.
        sVector dF(n);
        for (std::size_t i = 0; i < n; ++i)
            dF[i] = dV / 6.0 * (k1[i] + 2.0*k2[i] + 2.0*k3[i] + k4[i]);
        scalar frac = 1.0;
        for (std::size_t i = 0; i < n; ++i)
            if (dF[i] < 0.0 && F_i[i] + dF[i] < 0.0)
                frac = std::min(frac, F_i[i] / (-dF[i]));
        for (std::size_t i = 0; i < n; ++i)
        {
            F_i[i] += frac * dF[i];
            if (F_i[i] < 0.0) F_i[i] = 0.0;          // round-off dust only
        }

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

    // -- THE INTEGRATION MUST HAVE RESOLVED THE KINETICS ------------------
    //  An explicit RK4 asked to cross a rate transient in one coarse step
    //  overshoots: the limiting reactant lands materially NEGATIVE, the
    //  clamped rate then freezes it there, and X = (F_in - F)/F_in comes
    //  out ABOVE 1 -- found 2026-08-30 by a catalyst-loading probe that
    //  published X = 11.09 at exit 0 (the same case at nSteps 100000 gives
    //  X = 1 exactly).  A conversion no reactor can have must refuse, not
    //  be published.  The threshold is material, not round-off: a stable
    //  integration undershoots by O(machine), not by fractions of the feed.
    for (std::size_t i = 0; i < n; ++i)
        if (F_i[i] < -1.0e-6 * F_in_mol_s)
            throw std::runtime_error("PFR: the RK4 integration left '"
                + thermo.comp(i).name() + "' at a materially NEGATIVE flow ("
                + std::to_string(F_i[i]) + " mol/s against a feed of "
                + std::to_string(F_in_mol_s) + ") -- the axial steps are too coarse"
                  " for this rate (a stiff transient crossed in one step"
                  " overshoots and would publish a conversion above 1)."
                  "  Raise `nSteps` in the operation block until the profile"
                  " is resolved.");

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
    //  THE OUTLET MEANS ITS OWN EQUILIBRIUM (DEV.md 4c C73, 2026-10-17): its
    //  vapour fraction is resolved at its own (T, P, z_out) by the one home
    //  (`reactorOutlet::outletState`, ReactorOutlet.H), no longer copied from
    //  the inlet.  P is the feed's: this path has no bed hydraulics, and the
    //  flowsheet fills the outlet's P = 0 with its inlet's.
    const reactorOutlet::OutletState outSt = reactorOutlet::outletState(
        T, feedDict->lookupScalarOrDefault("P", 101325.0), z_out,
        feedDict->lookupScalarOrDefault("phasePinned", 0.0) > 0.5, vf_in,
        thermo, "pfr", unitNameOf(dict));
    reactorOutlet::printOutletState(outSt);   //  beside the result block above
    produced_.clear();
    ProcessStream out;
    out.name = "out";
    out.F    = F_out / 1000.0;              // mol/s -> kmol/s (canonical SI)
    out.T    = T;
    out.P    = 0.0;        // pressure not tracked (set by flowsheet)
    out.z    = z_out;
    out.vf   = outSt.vf;   // its own equilibrium (C73)
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
    // The PFR is isothermal (T_out = T_in = T); the heat it exchanges to hold T
    // is H_out - H_in on the ONE datum (C73: on the states the streams carry,
    // below).  The shared resolver still derives dH_rxn(T) = Σ νᵢ·hᵢ(T) from
    // the species' standardThermochemistry (and announces it); without a duty
    // the PFR's reaction heat leaked out of globalEnergyBoundary (the leak
    // CSTR/GibbsReactor plug).  Reported only when every species is priceable.
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
            //  `dHrxn_kJ_per_mol` stays the REACTION's own property, on the
            //  rung the inlet's phase names.  The DUTY is the enthalpy the two
            //  streams carry, priced by the rule the energy report applies to
            //  them (`flashState::priceState`) on exactly the state each one
            //  is published at -- the outlet's own equilibrium since C73.
            //  It was xi * dHrxn on the inlet's rung, which is that same
            //  difference only while the product stays in the inlet's phase:
            //  a liquid feed whose product leaves part vapour paid no latent
            //  heat (the conversionReactor rule of 2026-09-25, and the cstr's).
            kpis_["dHrxn_kJ_per_mol"] = dHrxn / 1000.0;
            try
            {
                const scalar P_feed =
                    feedDict->lookupScalarOrDefault("P", 101325.0);
                const bool pinned_in =
                    feedDict->lookupScalarOrDefault("phasePinned", 0.0) > 0.5;
                const scalar H_in_kW = flashState::priceState(T, P_feed, z_in,
                    F_in_kmols, pinned_in, vf_in, thermo, "pfr inlet", nullptr);
                const scalar H_out_kW = flashState::priceState(T, P_feed, z_out,
                    F_out / 1000.0, false, outSt.vf, thermo, "pfr outlet",
                    nullptr);
                kpis_["Q_kW"] = H_out_kW - H_in_kW;          // <0 exothermic
            }
            catch (const std::exception&) { /* no formation datum -- no duty */ }
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
    // must be re-evaluated at the LOCAL temperature (and, under Ergun, the
    // local pressure) at every RK4 stage.  Every law comes through the ONE
    // factory (thermo/reaction/ReactionRate) -- Arrhenius, LHHW, a `type
    // expression` written in the case, or a law a case's code/ registered --
    // and the marching scheme does not need to know which.
    auto operDict = dict->subDict("operation");
    std::vector<std::unique_ptr<ReactionRate>> law;
    law.reserve(R);
    RateOffer offer;
    offer.concentrationBasis = "F_i / Q, Q on the liquid basis F * sum z_i Vliq_i";
    //  A law that reads P gets the FEED's declared pressure, never the
    //  1 atm the reactor otherwise assumes for its phase resolution.
    if (!(dict->subDict("feed")->lookupScalarOrDefault("P", 0.0) > 0.0))
    {
        offer.pressure = false;
        offer.pressureAbsent = "the reactor's feed stream declares no P (or P = 0) --"
            " declare it on the inlet stream.";
    }
    for (std::size_t j = 0; j < R; ++j)
    {
        rname[j] = rxnList[j]->lookupWordOrDefault("name", "rxn" + std::to_string(j + 1));
        for (const auto& s : rxnList[j]->lookupDictList("stoichiometry"))
            nu[j][thermo.indexOf(s->lookupWord("component"))] = s->lookupScalar("nu");
        law.push_back(ReactionRate::New(rxnList[j], thermo,
                                        "PFR: reaction '" + rname[j] + "'", offer));
    }
    //  The laws written in the case, which publish what they declare.
    std::vector<std::size_t> exprLaws;
    for (std::size_t j = 0; j < R; ++j) if (law[j]->asExpression()) exprLaws.push_back(j);
    //  KPI names stay un-suffixed on a one-reaction bed (the names the
    //  Dyson-Simon branch published); with several reactions each carries its
    //  reaction's name.
    auto kpiName = [&](const std::string& stem, std::size_t j)
    { return R == 1 ? stem : stem + "_" + rname[j]; };

    // ---- THERMAL MODE -------------------------------------------------
    //  `isothermal` (default -- T imposed, duty a result), `adiabatic` (the
    //  reaction heats the stream: dT/dV = SUM_j (-dH_j) r_j / SUM_i F_i cp_i), or
    //  `heatExchange` (a jacket adds U a (T_c - T) per unit volume).  The
    //  temperature is marched WITH the species by the same RK4 -- a hot spot in
    //  an exothermic PFR is a RESULT you SEE in the axial profile, never a knob.
    const std::string tmode = operDict->lookupWordOrDefault("thermalMode", "isothermal");
    const bool isoT  = (tmode == "isothermal");
    const bool adiab = (tmode == "adiabatic");
    const bool hx    = (tmode == "heatExchange");
    if (!isoT && !adiab && !hx)
        throw std::runtime_error("PFR: thermalMode must be `isothermal`, `adiabatic` "
            "or `heatExchange` (got '" + tmode + "')");
    //  The coolant, the wall coefficient and the area per volume are read
    //  below, after the bed's geometry (the tubes give the area).  A key
    //  only `heatExchange` reads is refused in any other mode.
    if (!hx)
        for (const char* key : { "coolant", "wallHeatTransfer" })
            if (operDict->found(key))
                throw std::runtime_error(std::string("PFR: `operation.") + key
                    + "` is read only by `thermalMode heatExchange` (this bed is `"
                    + tmode + "`) -- a key nothing reads is refused, not ignored.");

    // CATALYST LOADING.  A heterogeneous rate constant is reported per gram of dry
    // catalyst; the bed converts it to a volumetric rate.  Absent => already volumetric.
    const scalar catLoad   = operDict->lookupScalarOrDefault("catalystLoading", 0.0);  // kg/m^3
    const scalar catFactor = (catLoad > 0.0) ? 1000.0 * catLoad : 1.0;
    //  The conversion is all it is: the pellet stays a POINT and eta = 1 is
    //  assumed.  Say so -- see reactor/CatalystPellet.H.
    announceUnresolvedPellet("pfr", catLoad, verbosity);
    for (std::size_t j = 0; j < R; ++j)
        law[j]->checkLoading(catLoad > 0.0, "PFR: reaction '" + rname[j] + "'");

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
    //  The liquid basis is read ONLY where a law reads concentrations: a
    //  reactor whose every law is in T, P and mole fractions (an expression
    //  law with no c[i] -- a gas bed) has no use for a liquid molar volume of
    //  hydrogen at 200 bar, so `tau_s` is not published for it, and the
    //  gas-basis figures below are instead.
    const scalar F_in = F_in_kmols * 1000.0;
    sVector F_i(n, 0.0);
    for (std::size_t i = 0; i < n; ++i) F_i[i] = z_in[i] * F_in;
    bool anyConcLaw = false;
    for (std::size_t j = 0; j < R; ++j) if (law[j]->needsConcentration()) anyConcLaw = true;
    scalar V_mol_in = 0.0;
    if (anyConcLaw)
        for (std::size_t i = 0; i < n; ++i)
        {
            if (thermo.comp(i).Vliq() <= 0.0)
                throw std::runtime_error("PFR: component '" + thermo.comp(i).name()
                    + "' has Vliq <= 0 -- needed for liquid concentration");
            V_mol_in += z_in[i] * thermo.comp(i).Vliq();
        }
    const scalar Q   = anyConcLaw ? F_in * V_mol_in : 0.0;
    const scalar tau = anyConcLaw ? V_R / Q : 0.0;

    // ---- THE BED'S GEOMETRY AND AN OPT-IN ERGUN PRESSURE DROP (C66) -------
    //  `operation.L_over_D` is the ONE home of the bed's slenderness: this
    //  unit publishes the cross-section it implies (D, L, A) and the `pfr`
    //  sizer (CatalystBedSize) READS it from here, refusing a second copy
    //  in its designRules.  `operation.pressureDrop { model Ergun; ... }`
    //  integrates dP/dz along the bed on that cross-section, with the
    //  particle of `operation.catalyst.particleDiameter` (the same particle
    //  Eq 39 reads -- one home).  Absent both keys nothing here runs and the
    //  bed is byte-identical to the constant-pressure march it always was.
    const BedHydraulics hyd = readBedHydraulics(operDict, thermo, V_R, verbosity);

    //  ---- HEAT EXCHANGE THROUGH THE WALL (thermalMode heatExchange) ------
    //  The legacy form (U, areaPerVolume, T_coolant) is read exactly as it
    //  always was; the C69 form (tubes, a wall correlation, a coolant with
    //  its own energy balance) only when its keys are declared.
    WallExchange wx;
    scalar MW_in = 0.0;                                   // kg/kmol
    for (std::size_t i = 0; i < n; ++i) MW_in += z_in[i] * thermo.comp(i).MW();
    if (hx) readWallExchange(wx, operDict, hyd, thermo, F_in_kmols * MW_in, verbosity);
    const scalar Uw = wx.Udecl;                           // W/(m^2.K)
    const scalar aV = wx.aV;                              // m^2/m^3
    const scalar Tc = wx.Tc_in;                           // K (constant coolant)
    //  A sensible coolant's temperature is one more marched state, after
    //  the enthalpy (and the pressure, when Ergun marches it).
    const std::size_t iTc = hyd.ergun ? n + 2 : n + 1;
    //  The local overall coefficient, on the inside area: the declared one,
    //  or the bed-side correlation at the local gas in series with the wall
    //  and the coolant film.  `res` receives the correlation's numbers.
    auto Uat = [&](scalar Tk, const sVector& zz,
                   BedWallHeatTransfer::Result* res) -> scalar
    {
        if (!wx.corr) return wx.Udecl;
        scalar MW = 0.0;
        for (std::size_t i = 0; i < n; ++i) MW += zz[i] * thermo.comp(i).MW();
        BedWallHeatTransfer::Context c;
        c.G      = wx.G;
        c.dp     = wx.dp;
        c.dt     = wx.dt;
        c.mu     = thermo.viscosityGas(Tk, zz);
        c.lambda = thermo.thermalConductivityGas(Tk, zz);
        c.cp     = thermo.Cp_ig(Tk, zz) / (1.0e-3 * MW);         // J/(kg K)
        const BedWallHeatTransfer::Result r = wx.corr->evaluate(c);
        if (res) *res = r;
        return 1.0 / (1.0 / r.U + wx.R_wall + wx.R_film);
    };

    //  The state a law is handed, at a point of the bed.
    //  `Fi` are molar flows in mol/s; the buffers must outlive the state.
    auto stateAt = [&](scalar Tk, scalar Pk, const sVector& Fi,
                       sVector& concBuf, sVector& xBuf) -> RateState
    {
        concBuf.assign(n, 0.0);
        xBuf.assign(n, 0.0);
        scalar Ft = 0.0;
        for (std::size_t i = 0; i < n; ++i) Ft += std::max(Fi[i], 0.0);
        for (std::size_t i = 0; i < n; ++i)
        {
            if (Ft > 0.0) xBuf[i] = std::max(Fi[i], 0.0) / Ft;
            if (anyConcLaw) concBuf[i] = std::max(Fi[i], 0.0) / Q;
        }
        RateState rs;
        rs.T = Tk; rs.P = Pk; rs.conc = &concBuf; rs.x = &xBuf;
        rs.amountPerKmol = 1000.0;                       // the march is in mol
        return rs;
    };

    // ---- A LAW WRITTEN IN THE CASE SAYS WHAT IT IS BEFORE THE BED MARCHES --
    //  The parsed formula, its source and the inlet evaluation, printed once;
    //  the sentences a reader must not lose ride AdvisoryLog into the
    //  end-of-run caveat block and the result JSON.
    std::map<std::string, scalar> bedInletKpis;
    for (std::size_t j : exprLaws)
    {
        const ExpressionRate& ex = *law[j]->asExpression();
        const std::string locus = "pfr (" + rname[j] + ", type expression)";
        sVector concIn, xIn;
        const RateState sIn = stateAt(T, P, F_i, concIn, xIn);
        const ExpressionRate::Detail din = ex.evaluate(sIn);
        (void) law[j]->netRate(thermo, sIn);       // announces a window / table once

        //  THE ACTIVITY SURFACE, said rather than assumed, when the law
        //  declares its own fugacity coefficients: a rate constant is
        //  meaningless without the activity model it was regressed with, so
        //  the law keeps ITS coefficients and the package's equation of state
        //  prices the streams; the two are compared at the inlet and the
        //  ratio is published, so the disagreement is a number.
        std::ostringstream actBanner;
        if (!ex.fugacityCoefficients().empty())
        {
            std::string eosNote;
            sVector phiPkg;
            if (thermo.hasEos())
            {
                try { phiPkg = thermo.eos().phi(T, P, z_in); } catch (const std::exception&) {}
                eosNote = thermo.eos().modelName();
            }
            std::ostringstream act;
            act << "the rate law prices its activities with its OWN fugacity"
                   " coefficients (definitions";
            for (const auto& kv : ex.fugacityCoefficients()) act << " " << kv.second;
            act << ", declared in the case with the rate constant they were"
                   " fitted with), not with this package's "
                << (eosNote.empty() ? std::string("equation of state") : eosNote)
                << ", which prices the streams and the enthalpy march";
            if (phiPkg.size() == n)
                act << "; the inlet ratio phi_law / phi_package is published"
                       " per species as the phi_law_over_pkg_*_in KPIs";
            act << ".";
            AdvisoryLog::instance().add("model", "info", locus, act.str());
            actBanner << act.str();
            if (phiPkg.size() == n)
            {
                actBanner << "  At the inlet:";
                for (const auto& kv : ex.fugacityCoefficients())
                {
                    const std::size_t i = thermo.indexOf(kv.first);
                    const scalar ratio = ex.valueOf(din, kv.second) / phiPkg[i];
                    bedInletKpis[kpiName("phi_law_over_pkg_" + kv.first + "_in", j)] = ratio;
                    actBanner << " " << std::fixed << std::setprecision(4) << ratio
                              << " (" << kv.first << ")";
                }
                actBanner << ".";
            }
        }
        AdvisoryLog::instance().add("model", "info", locus,
            "the rate is the case's declared formula (constant/reactions, `type"
            " expression`) evaluated at the BULK fluid: the engine applies no"
            " effectiveness factor of its own, so any diffusion correction is"
            " the formula's -- read its source and its caveats");
        for (const auto& c : ex.caveats())
            AdvisoryLog::instance().add("model", "info", locus, c);
        for (const auto& o : din.outside)
            AdvisoryLog::instance().add("model", "warning", locus, o);

        //  The banner is keyed on the VERBOSITY the flowsheet hands this pass
        //  (it lowers it on the silent tear iterations and restores it on the
        //  one it prints), never on whether an advisory was new: inside one
        //  simulator pass the log is not cleared between tear iterations.
        if (verbosity >= 2)
        {
            std::cout << "\n  [expression] " << rname[j] << " -- a rate law written in"
                         " the case (constant/reactions), as PARSED\n"
                      << ex.describe("    ")
                      << "    inlet:   T = " << std::fixed << std::setprecision(2) << T
                      << " K, P = " << std::setprecision(3) << P / units::atm_to_Pa
                      << " atm -> rate = " << std::setprecision(4)
                      << din.rateSI * 3600.0 << " " << rateStem(ex) << "\n";
            if (!actBanner.str().empty())
                std::cout << "    activities: " << actBanner.str() << "\n";
            for (const auto& o : din.outside) std::cout << "    " << o << "\n";
            for (const auto& m : din.interpolated) std::cout << "    [interpolated] " << m << "\n";
            for (const auto& c : ex.caveats()) std::cout << "    " << c << "\n";
            std::cout << "\n";
        }
    }

    // ENTHALPY FORMULATION.  The augmented state is  y = [ F_0 .. F_{n-1}, H ]
    // with H the TOTAL enthalpy flow [W] on the elements datum -- not T.  Why:
    // the heat of reaction and the sensible heat must be the SAME enthalpy
    // function, or an "adiabatic" reactor silently fails to conserve H.  So we
    // march H (dH/dV = 0 adiabatic; = U a (T_c - T) with a jacket) and RECOVER T
    // by inverting the stream enthalpy at each stage.  Then Q = 0 for an adiabatic
    // reactor BY CONSTRUCTION, and the reaction heat is whatever the thermo says.
    //  `Pk` is the LOCAL pressure: the inlet's on a constant-pressure bed,
    //  the Ergun-marched one when `pressureDrop` is declared.  An adiabatic
    //  bed conserves H across friction (no work, no heat, kinetic energy
    //  neglected), so T is recovered from H at the pressure the gas is at.
    //
    //  THE SURFACE H IS INVERTED ON (C77, 2026-10-17): the one the outlet is
    //  published and priced on -- the local (T, P, z) resolved at its own
    //  equilibrium and priced by the energy report's rule
    //  (`reactorOutlet::temperatureOfEnthalpy`), at EVERY point of the march,
    //  not only at the outlet.  It used to be the INLET's phase rung all
    //  along the bed, so a product that boiled (or condensed) inside it
    //  conserved an H that the published outlet, resolved at the T that rung
    //  gave, did not carry: an "adiabatic" bed with a duty.  Read along the
    //  axis, the bed is in LOCAL phase equilibrium at each point; the
    //  kinetics still read the liquid-basis concentrations they always read
    //  (a phase-aware rate -- a gas-phase rate in the vapour, a liquid one in
    //  the liquid -- is not modelled; the march says where the local state
    //  is two-phase only through the T it recovers).  While the state stays
    //  in one phase the inversion is the same Newton on that phase's rung it
    //  always was, confirmed by one resolution at the answer.
    scalar vf_lastGuess = vf_in;                   // the phase the last point resolved to
    scalar unmatched_last = 0.0;                   // J/mol, a pure fluid's jump only
    auto T_from_h = [&](scalar h_target, const sVector& zz, scalar Tguess,
                        scalar Pk) -> scalar
    {
        const reactorOutlet::EnthalpyInversion inv =
            reactorOutlet::temperatureOfEnthalpy(h_target, Pk, zz, Tguess,
                                                 vf_lastGuess, vf_in, thermo);
        vf_lastGuess   = inv.vf;
        unmatched_last = inv.unmatched_J_per_mol;
        return inv.T;
    };

    scalar T_lastGuess = T;                        // warm start across RK4 stages
    auto dydV = [&](const sVector& y) -> sVector
    {
        scalar Ftot = 0.0;
        for (std::size_t i = 0; i < n; ++i) Ftot += std::max(y[i], 0.0);
        sVector zz(n, 0.0);
        if (Ftot > 0.0) for (std::size_t i = 0; i < n; ++i) zz[i] = std::max(y[i], 0.0) / Ftot;

        const scalar Pk = hyd.ergun ? y[n + 1] : P;
        if (hyd.ergun && !(Pk > 0.0))
            throw std::runtime_error("PFR: the Ergun pressure drop has consumed"
                " the whole inlet pressure inside the bed -- this bed, at this"
                " L/D, particle and void fraction, cannot pass the flow it is"
                " given.  A shorter, wider bed (lower L_over_D), a larger"
                " particle or a radial-flow arrangement is the remedy, not a"
                " floor on the pressure.");
        const scalar Tk = isoT ? T
                               : T_from_h(y[n] / std::max(Ftot, 1.0e-30), zz, T_lastGuess, Pk);
        if (!isoT) T_lastGuess = Tk;

        sVector dy(y.size(), 0.0);
        sVector conc(n, 0.0);
        for (std::size_t i = 0; i < n; ++i) conc[i] = std::max(y[i], 0.0) / Q;
        RateState rs;
        rs.T = Tk; rs.P = Pk; rs.conc = &conc; rs.x = &zz;
        rs.amountPerKmol = 1000.0;                   // the march is in mol
        for (std::size_t j = 0; j < R; ++j)
        {
            const scalar rj = catFactor * law[j]->netRate(thermo, rs);         // mol/(m^3.s)
            for (std::size_t i = 0; i < n; ++i) dy[i] += nu[j][i] * rj;
        }
        // Enthalpy: conserved when adiabatic; a jacket adds U a (T_c - T) per volume.
        if (!hx || wx.legacy)
            dy[n] = (!isoT && hx) ? Uw * aV * (Tc - Tk) : 0.0;     // W/m^3
        else
        {
            //  C69: the local U, and a coolant that may change temperature.
            //  q is the heat INTO the process per bed volume; a sensible
            //  coolant takes -q: co-current it moves WITH V, counter-current
            //  AGAINST it, so its dT/dV changes sign.
            const scalar Tcl = wx.variable() ? y[iTc] : Tc;
            const scalar q   = Uat(Tk, zz, nullptr) * aV * (Tcl - Tk);
            dy[n] = q;
            if (wx.variable())
                dy[iTc] = (wx.mode == CoolantMode::coCurrent ? -q : q) / wx.mcp;
        }
        //  dP/dV = (dP/dz) / A: the bed's volume is its cross-section times
        //  its length, so a step dV is a length dV / A.
        if (hyd.ergun) dy[n + 1] = ergunGradient(hyd, thermo, Tk, Pk, zz, Ftot) / hyd.A;
        return dy;
    };

    // ---- RK4 march along the reactor volume, recording the axial profile ----
    profile_.columns.clear();
    sVector ergunViscous, ergunInertial;      // a declared-diameter bed only
    profile_.xAxis = "V";
    auto push = [&](scalar V, const sVector& y, scalar Tk)
    {
        profile_.columns["V"].push_back(V);
        for (std::size_t i = 0; i < n; ++i)
            profile_.columns["F_" + thermo.comp(i).name()].push_back(y[i]);
        profile_.columns["T"].push_back(Tk);
        if (hyd.ergun) profile_.columns["P"].push_back(y[n + 1]);
        if (hyd.ergun && hyd.diameterDeclared)
        {
            //  The two Ergun terms at this stored point, for the share the
            //  inertial one carries over the WHOLE bed (published below).
            scalar Ft = 0.0;
            for (std::size_t i = 0; i < n; ++i) Ft += std::max(y[i], 0.0);
            sVector zz(n, 0.0);
            if (Ft > 0.0) for (std::size_t i = 0; i < n; ++i) zz[i] = std::max(y[i], 0.0) / Ft;
            const ErgunTerms et = ergunTerms(hyd, thermo, Tk, y[n + 1], zz, Ft);
            ergunViscous.push_back(et.viscous);
            ergunInertial.push_back(et.inertial);
        }
        if (wx.variable()) profile_.columns["T_coolant"].push_back(y[iTc]);
        if (wx.corr)
        {
            //  The local overall coefficient the wall term used here.
            scalar Ft = 0.0;
            for (std::size_t i = 0; i < n; ++i) Ft += std::max(y[i], 0.0);
            sVector zz(n, 0.0);
            if (Ft > 0.0) for (std::size_t i = 0; i < n; ++i) zz[i] = std::max(y[i], 0.0) / Ft;
            profile_.columns["U"].push_back(Uat(Tk, zz, nullptr));
        }
        if (!exprLaws.empty())
        {
            //  The rate each declared law is running at, in kmol per m3 (or
            //  kg) per hour, at every stored point -- the collapse of the
            //  rate toward equilibrium is the axial fact a student should be
            //  able to plot.
            sVector cb, xb, Fk(y.begin(), y.begin() + n);
            const RateState rs = stateAt(Tk, hyd.ergun ? y[n + 1] : P, Fk, cb, xb);
            for (std::size_t j : exprLaws)
            {
                const ExpressionRate& ex = *law[j]->asExpression();
                profile_.columns[kpiName("r_" + ex.rateOf() + "_kmol_m3_h", j)]
                    .push_back(ex.evaluate(rs).rateSI * 3600.0);
            }
        }
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
        return T_from_h(yy[n] / std::max(Ftot, 1.0e-30), zz, T_lastGuess,
                        hyd.ergun ? yy[n + 1] : P);
    };

    sVector y((hyd.ergun ? n + 2 : n + 1) + (wx.variable() ? 1 : 0), 0.0);
    for (std::size_t i = 0; i < n; ++i) y[i] = F_i[i];
    if (hyd.ergun) y[n + 1] = P;                   // Pa, marched with the species
    // The inlet ENTHALPY FLOW [W] on the elements datum -- the conserved quantity.
    // Only needed (and only computable) when the reactor is NOT isothermal: a
    // fictitious species has no elements datum, and an isothermal run never asks.
    // Priced exactly as the published duty prices the inlet (the report's rule,
    // `flashState::priceState`), so a two-phase feed is its equilibrium phases
    // and the marched H and the duty start from one number (C77).
    const bool pinned_in = dict->subDict("feed")
        ->lookupScalarOrDefault("phasePinned", 0.0) > 0.5;
    y[n] = isoT ? 0.0 : flashState::priceState(T, P, z_in, F_in, pinned_in,
                                               vf_in, thermo, "pfr inlet", nullptr);
    const sVector y_in = y;

    scalar T_max = T, T_min = T, V_hot = 0.0;
    const scalar dV = V_R / nSteps;
    //  ONE MARCH from the bed inlet, `y` its initial state.  `record` keeps
    //  the profile and the extremes; a counter-current coolant's shooting
    //  marches (below) record nothing.  Every march starts its temperature
    //  guess at the feed's, so the same initial state gives the same march.
    auto march = [&](sVector y, bool record) -> sVector
    {
    T_lastGuess = T;
    vf_lastGuess = vf_in;
    if (record) { T_max = T; T_min = T; V_hot = 0.0;
                  ergunViscous.clear(); ergunInertial.clear(); push(0.0, y, T); }
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
        sVector dy(y.size());
        for (std::size_t i = 0; i < y.size(); ++i)
            dy[i] = dV / 6.0 * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]);
        scalar frac = 1.0;
        for (std::size_t i = 0; i < n; ++i)
            if (dy[i] < 0.0 && y[i] + dy[i] < 0.0)
                frac = std::min(frac, y[i] / (-dy[i]));
        for (std::size_t i = 0; i < y.size(); ++i) y[i] += frac * dy[i];
        for (std::size_t i = 0; i < n; ++i)
            if (y[i] < 0.0) y[i] = 0.0;              // round-off dust only
        if (!record) continue;
        const scalar Tnow = T_of(y);
        if (!isoT) { if (Tnow > T_max) { T_max = Tnow; V_hot = dV * (m + 1); }
                     if (Tnow < T_min) T_min = Tnow; }
        push(dV * (m + 1), y, Tnow);
    }
    return y;
    };

    //  ---- THE COOLANT'S BOUNDARY CONDITION ---------------------------------
    //  Co-current, constant or boiling: the coolant's state at the bed inlet
    //  is KNOWN, and one march is the answer.  Counter-current: the coolant
    //  ENTERS at the bed OUTLET, so its temperature at the bed inlet -- its
    //  own outlet -- is the unknown of a two-point boundary-value problem.
    //  It is SHOT: march with a guess, compare the coolant temperature the
    //  march arrives at at V_R with the declared T_in, and move the guess on
    //  a BRACKETED root (expanded outward from T_in until the residual
    //  changes sign, then Illinois false position).  Said aloud, with the
    //  number of marches and the final residual -- and with the fact that a
    //  counter-current cooled bed can have more than one steady state: this
    //  is the one the bracket found.
    int shootMarches = 0;
    if (wx.variable()) y[iTc] = wx.Tc_in;
    if (wx.mode == CoolantMode::counterCurrent)
    {
        auto residual = [&](scalar Tc0) -> scalar
        {
            sVector y0 = y;
            y0[iTc] = Tc0;
            ++shootMarches;
            const sVector yE = march(y0, false);
            const scalar r = yE[iTc] - wx.Tc_in;
            if (verbosity >= 3)
                std::cout << "    [coolant] shot " << shootMarches << ": coolant outlet "
                          << std::setprecision(10) << Tc0 << " K -> it would enter at "
                          << yE[iTc] << " K (residual " << r << " K)\n";
            if (!std::isfinite(r))
                throw std::runtime_error("PFR: counter-current coolant: the march"
                    " shot with a coolant outlet temperature of "
                    + std::to_string(Tc0) + " K returned a non-finite coolant"
                      " temperature at the bed outlet -- the bed ran away on this"
                      " guess.  Check the coolant flow, its cp and the wall"
                      " coefficient; no answer is published from a failed shot.");
            return r;
        };
        scalar a = wx.Tc_in, fa = residual(a);
        scalar b = a, fb = fa;
        scalar step = std::max(1.0, std::abs(fa));
        int expansions = 0;
        while (fa * fb > 0.0)
        {
            //  Tc(V_R) rises with the guess, so a positive residual means the
            //  guess is too high: step down, else up.
            b  = (fa > 0.0) ? a - step : a + step;
            if (b < 1.0) b = 1.0;
            fb = residual(b);
            if (fa * fb > 0.0) { a = b; fa = fb; step *= 2.0; }
            if (++expansions > 60 || (b <= 1.0 && fa * fb > 0.0))
                throw std::runtime_error("PFR: counter-current coolant: no"
                    " coolant outlet temperature was found that brings the"
                    " coolant in at its declared T_in = "
                    + std::to_string(wx.Tc_in) + " K (no sign change in "
                    + std::to_string(expansions) + " bracket expansions).  The"
                      " shooting problem has no root here -- an error in the"
                      " coolant's flow, cp or temperature is likelier than a"
                      " physical answer.");
        }
        const int expanded = expansions;
        //  Illinois false position on the bracket [a, b].
        int side = 0;
        scalar c = (fa == 0.0) ? a : b, fc = (fa == 0.0) ? fa : fb;
        for (int it = 0; it < 200 && fa != 0.0; ++it)
        {
            c  = (a * fb - b * fa) / (fb - fa);
            fc = residual(c);
            if (std::abs(fc) < 1.0e-9 || std::abs(b - a) < 1.0e-10) break;
            if (fc * fb > 0.0)
            { b = c; fb = fc; if (side == -1) fa *= 0.5; side = -1; }
            else
            { a = c; fa = fc; if (side == +1) fb *= 0.5; side = +1; }
        }
        y[iTc] = c;
        std::ostringstream os;
        os << std::setprecision(6)
           << "[coolant] counter-current: a two-point boundary-value problem."
              "  The coolant's outlet temperature (at the bed INLET) was SHOT"
              " until the coolant enters the bed outlet at its declared T_in = "
           << wx.Tc_in << " K: " << shootMarches << " marches (" << expanded
           << " bracket expansions from T_in, then Illinois false position),"
              " coolant outlet " << c << " K, residual " << fc << " K.  A"
              " counter-current cooled bed can have more than one steady"
              " state; this is the one the bracket found";
        AdvisoryLog::instance().add("model", "info", "pfr (coolant)", os.str());
        if (verbosity >= 2) std::cout << "  " << os.str() << "\n";
    }
    const scalar Tc_start = wx.variable() ? y[iTc] : 0.0;
    y = march(y, true);
    for (std::size_t i = 0; i < n; ++i) F_i[i] = y[i];
    const scalar T_out = T_of(y);
    const scalar unmatched_out = isoT ? 0.0 : unmatched_last;   // J/mol (C77)
    const scalar P_out = hyd.ergun ? y[n + 1] : P;

    // ---- Outlet -------------------------------------------------------
    scalar F_out = 0.0;
    for (std::size_t i = 0; i < n; ++i) F_out += F_i[i];
    sVector z_out(n, 0.0);
    if (F_out > 0.0) for (std::size_t i = 0; i < n; ++i) z_out[i] = F_i[i] / F_out;

    //  Its own equilibrium at (T_out, P_out, z_out) -- C73, the single-reaction
    //  site's comment.  The pressure is the one this outlet will carry: the
    //  Ergun-marched one when the bed declares a drop, else the feed's (which
    //  the flowsheet gives an outlet published at P = 0).
    const reactorOutlet::OutletState outSt = reactorOutlet::outletState(
        T_out, P_out, z_out, pinned_in, vf_in, thermo, "pfr", unitNameOf(dict));
    produced_.clear();
    ProcessStream out;
    out.name = "out";
    out.F  = F_out / 1000.0;                 // mol/s -> kmol/s
    out.T  = T_out;                          // a RESULT when non-isothermal
    out.P  = hyd.ergun ? P_out : 0.0;        // 0 = set by the flowsheet (the inlet's)
    out.z  = z_out;
    out.vf = outSt.vf;                       // its own equilibrium (C73)
    produced_.push_back(out);

    // ---- KPIs ---------------------------------------------------------
    kpis_.clear();
    kpis_["V_R"]          = V_R;
    kpis_["T"]            = T;
    if (anyConcLaw) kpis_["tau_s"] = tau;        // liquid basis, as the single path
    //  The bed's bulk density, where the rate is per kg of catalyst: the
    //  `pfr` sizer prices the charge from THIS number and refuses a second
    //  copy in its designRules (C69, one home).
    if (catLoad > 0.0) kpis_["catalystLoading"] = catLoad;
    publishBedHydraulics(hyd, thermo, T, P, T_out, P_out, z_in, z_out, F_in, F_out,
                         verbosity);
    //  THE SHARE OF THE BED'S DROP THE INERTIAL TERM CARRIES (C69), on a
    //  declared-diameter bed only (so no other bed's KPIs change).  At a
    //  fixed volume and a FROZEN axial state, the viscous term goes as u L
    //  ~ D^-4 and the inertial as u^2 L ~ D^-6, so the drop at another
    //  diameter D' is dP [(1 - s) (D/D')^4 + s (D/D')^6] -- the arithmetic
    //  a `converterShell` brackets its smallest admissible diameter on.  The
    //  share is a trapezoid over the stored points; the drop it splits is
    //  the MARCHED one, so at D' = D the scaling returns it exactly.
    if (hyd.ergun && hyd.diameterDeclared && ergunViscous.size() > 1)
    {
        scalar Iv = 0.0, Ii = 0.0;
        for (std::size_t k = 1; k < ergunViscous.size(); ++k)
        {
            Iv += 0.5 * (ergunViscous[k - 1]  + ergunViscous[k]);
            Ii += 0.5 * (ergunInertial[k - 1] + ergunInertial[k]);
        }
        if (Iv + Ii > 0.0) kpis_["ergunInertialShare_bed"] = Ii / (Iv + Ii);
    }
    kpis_["nReactions"]   = static_cast<scalar>(R);
    kpis_["nSteps"]       = static_cast<scalar>(nSteps);
    kpis_["F_in_kmol_h"]  = F_in_kmols * 3600.0;
    kpis_["F_out_kmol_h"] = F_out * 3600.0 / 1000.0;
    kpis_["T_out"]        = T_out;                 // RESULT when non-isothermal
    if (!isoT) { kpis_["T_max"] = T_max; kpis_["T_min"] = T_min;
                 kpis_["dT_rise"] = T_out - T; kpis_["hotSpot_dT"] = T_max - T; }
    //  ---- THE COOLED BED (C69): what the wall and the coolant did ----------
    //  Published only on the C69 route, so every other bed's KPIs are what
    //  they were.  The duty is read from the MARCHED enthalpy (the same
    //  integral the outlet temperature comes from); a sensible coolant's
    //  own balance, m cp (T_out - T_in), is published beside it, and the two
    //  agree to the march's round-off by construction (one RK4 integrates
    //  both from one integrand) -- the difference is published, not assumed.
    if (hx && !wx.legacy)
    {
        kpis_["areaPerVolume"] = aV;
        kpis_["A_wall_m2"]     = aV * V_R;
        kpis_["hotSpot_V_m3"]  = V_hot;
        if (hyd.hasGeometry) kpis_["hotSpot_z_m"] = V_hot / hyd.A;
        const scalar Tc_out = (wx.mode == CoolantMode::coCurrent)      ? y[iTc]
                            : (wx.mode == CoolantMode::counterCurrent) ? Tc_start
                            : wx.Tc_in;
        const scalar Qc_kW = -(y[n] - y_in[n]) / 1000.0;      // heat INTO the coolant
        kpis_["T_coolant_in"]  = wx.Tc_in;
        kpis_["T_coolant_out"] = Tc_out;
        kpis_["Q_coolant_kW"]  = Qc_kW;
        if (wx.variable())
        {
            kpis_["coolant_mdot_kg_s"]  = wx.mdot;
            kpis_["coolant_cp_J_kgK"]   = wx.cp;
            //  The coolant's own balance against the marched duty: equal to
            //  the march's round-off by construction, PRINTED rather than
            //  pinned (a golden on a round-off number pins the round-off).
            if (verbosity >= 2)
                std::cout << "  [coolant] its own balance m cp (T_out - T_in) = "
                          << std::scientific << std::setprecision(10)
                          << wx.mcp * (Tc_out - wx.Tc_in) / 1000.0 << " kW against the"
                             " marched duty " << Qc_kW << " kW\n" << std::fixed;
        }
        if (wx.mode == CoolantMode::counterCurrent)
        {
            kpis_["coolantShootingMarches"]    = static_cast<scalar>(shootMarches);
        }
        if (wx.corr)
        {
            //  Every number the coefficient was computed from, at the inlet:
            //  a reader (and the gate) can redo the correlation by hand.
            BedWallHeatTransfer::Result rin, rout;
            const scalar Uin  = Uat(T, z_in, &rin);
            const scalar Uout = Uat(T_out, z_out, &rout);
            scalar MWi = 0.0;
            for (std::size_t i = 0; i < n; ++i) MWi += z_in[i] * thermo.comp(i).MW();
            kpis_["U_in"]           = Uin;
            kpis_["U_out"]          = Uout;
            kpis_["U_bed_in"]       = rin.U;
            kpis_["Re_p_wall_in"]   = rin.Re;
            kpis_["Pr_wall_in"]     = rin.Pr;
            kpis_["Nu_wall_in"]     = rin.Nu;
            kpis_["G_tube_kg_m2_s"] = wx.G;
            kpis_["mu_gas_wall_in"]     = thermo.viscosityGas(T, z_in);
            kpis_["lambda_gas_wall_in"] = thermo.thermalConductivityGas(T, z_in);
            kpis_["cp_gas_wall_in"]     = thermo.Cp_ig(T, z_in) / (1.0e-3 * MWi);
            kpis_["R_wall_m2K_W"]   = wx.R_wall;
            kpis_["R_film_m2K_W"]   = wx.R_film;
            for (const auto* r : { &rin, &rout })
                if (!r->inValidity)
                {
                    const std::string msg = std::string("[wall] the bed-side coefficient ("
                        + wx.corr->type() + ") is EXTRAPOLATED at the bed ")
                        + (r == &rin ? "inlet" : "outlet") + ": " + r->validityNote
                        + " -- its stated window is " + wx.corr->validityWindow()
                        + "; the value is used, not clamped";
                    AdvisoryLog::instance().add("model", "warning", "pfr (wall)", msg);
                    if (verbosity >= 1) std::cout << "  " << msg << "\n";
                }
            if (verbosity >= 2)
                std::cout << "  [wall] U_w (bed side, " << wx.corr->type() << ") "
                          << std::fixed << std::setprecision(2) << rin.U
                          << " W/m2/K at the inlet (Re_p " << std::setprecision(1)
                          << rin.Re << ", Pr " << std::setprecision(3) << rin.Pr
                          << ", d_p/d_t " << std::setprecision(4) << wx.dp / wx.dt
                          << "); overall U " << std::setprecision(2) << Uin << " -> "
                          << Uout << " W/m2/K inlet -> outlet\n";
        }
        if (verbosity >= 2)
            std::cout << std::fixed << "  [coolant] " << std::setprecision(2)
                      << "T " << wx.Tc_in << " K in -> " << Tc_out << " K out;"
                      << " it takes " << std::setprecision(3) << Qc_kW
                      << " kW; hot spot " << std::setprecision(2) << T_max
                      << " K at V = " << std::setprecision(5) << V_hot << " m3"
                      << (hyd.hasGeometry ? " (z = " + std::to_string(V_hot / hyd.A) + " m)" : std::string())
                      << "\n";
    }
    sVector concK, xK, Fin_vec(n, 0.0);
    for (std::size_t i = 0; i < n; ++i) Fin_vec[i] = z_in[i] * F_in;
    const RateState inletState = stateAt(T, P, Fin_vec, concK, xK);
    for (std::size_t j = 0; j < R; ++j)
        if (law[j]->hasRateConstant())
            kpis_["k_" + rname[j]] = law[j]->rateConstant(thermo, inletState);  // at the INLET

    // ---- WHAT A BED ON A DECLARED LAW PUBLISHES BEYOND THE MARCH --------
    if (!exprLaws.empty())
    {
        kpis_.insert(bedInletKpis.begin(), bedInletKpis.end());

        //  Per-pass conversion of every reactant, and the outlet mole
        //  fraction of every product, of the declared laws.
        for (std::size_t j : exprLaws)
            for (std::size_t i = 0; i < n; ++i)
            {
                const std::string c = thermo.comp(i).name();
                if (nu[j][i] < 0.0)
                {
                    const scalar Fi_in = z_in[i] * F_in;
                    kpis_["X_" + c] = (Fi_in > 0.0) ? (Fi_in - F_i[i]) / Fi_in : 0.0;
                }
                else if (nu[j][i] > 0.0)
                    kpis_["y_" + c + "_out"] = z_out[i];
            }

        //  Space velocity on the NORMAL basis every published GHSV uses: m3 of
        //  gas at 0 degC and 1 atm, as an ideal gas (R T_n / P_n per mole, the
        //  ONE home in core/Constants.H), per m3 of bed per hour.  A gas-bed
        //  figure: published when no law reads a (liquid-basis) concentration.
        if (!anyConcLaw)
        {
            const scalar Vn_m3_per_mol = constant::R * constant::T_normal / constant::P_normal;
            kpis_["GHSV_normal_h"] = F_in * Vn_m3_per_mol * 3600.0 / V_R;
            //  Residence time on the ACTUAL inlet gas, priced by the package's
            //  own equation of state, where one exists to price it.
            if (thermo.hasEos())
            {
                try
                {
                    const scalar v_in = thermo.eos().molarVolume(T, P, z_in);   // m3/mol
                    if (v_in > 0.0) kpis_["tau_gas_s"] = V_R / (F_in * v_in);
                }
                catch (const std::exception&) {}
            }
        }

        sVector concOut, xOut;
        const RateState outState = stateAt(T_out, P_out, F_i, concOut, xOut);
        for (std::size_t j : exprLaws)
        {
            const ExpressionRate& ex = *law[j]->asExpression();
            const std::string locus = "pfr (" + rname[j] + ", type expression)";
            const scalar rin  = ex.evaluate(inletState).rateSI * 3600.0;
            const scalar rout = ex.evaluate(outState).rateSI * 3600.0;
            kpis_[kpiName("rate_in_"  + rateStem(ex), j)] = rin;
            kpis_[kpiName("rate_out_" + rateStem(ex), j)] = rout;

            //  THE APPROACH TO EQUILIBRIUM OF THE EFFLUENT, as US 5,352,428
            //  defines it: the T* at which the outlet gas would be at
            //  equilibrium under THIS LAW's own two legs, minus the actual
            //  outlet T.  Positive = short of equilibrium.  It is the law's
            //  equilibrium, NOT the package's Gibbs surface; a reader comparing
            //  it against a gibbsReactor must know which each is quoting.
            std::string approachNote;
            if (ex.hasLegs() && ex.hasEquilibriumWindow())
            {
                try
                {
                    const scalar Teq = ex.equilibriumTemperature(outState);
                    kpis_[kpiName("T_eq_outlet_K", j)] = Teq;
                    kpis_[kpiName("approach_K", j)]    = Teq - T_out;
                }
                catch (const std::exception& e)
                {
                    approachNote = std::string("approach_K NOT published: ") + e.what();
                    AdvisoryLog::instance().add("model", "warning", locus, approachNote);
                }
            }
            else
                approachNote = ex.hasLegs()
                    ? "approach_K not published: the law declares no"
                      " `equilibriumTemperatureWindow` to search its own"
                      " equilibrium in"
                    : "approach_K not published: the law declares a single `rate`,"
                      " not `forward` and `reverse` legs, so it has no own"
                      " equilibrium to approach";

            if (verbosity >= 2)
            {
                std::cout << "\n  [expression] " << rname[j] << " -- bed result\n"
                          << std::fixed;
                for (std::size_t i = 0; i < n; ++i)
                    if (nu[j][i] < 0.0)
                        std::cout << "    X(" << thermo.comp(i).name() << ")"
                                  << std::string(std::max<int>(1, 14 - int(thermo.comp(i).name().size())), ' ')
                                  << std::setprecision(4) << 100.0 * kpis_["X_" + thermo.comp(i).name()] << " %\n";
                std::cout << "    rate in -> out      " << std::setprecision(4) << rin
                          << " -> " << rout << " " << rateStem(ex);
                if (rout != 0.0)
                    std::cout << "  (ratio " << std::setprecision(1) << rin / rout << ")";
                std::cout << "\n";
                if (kpis_.count(kpiName("approach_K", j)))
                    std::cout << "    approach            outlet is at equilibrium (this law's own legs) at T* = "
                              << std::setprecision(2) << kpis_[kpiName("T_eq_outlet_K", j)] << " K, i.e. "
                              << std::setprecision(3) << kpis_[kpiName("approach_K", j)]
                              << " K above the actual outlet T (US 5,352,428's definition)\n";
                else
                    std::cout << "    approach            " << approachNote << "\n";
                if (kpis_.count("GHSV_normal_h"))
                    std::cout << "    GHSV (normal basis) " << std::setprecision(1) << kpis_["GHSV_normal_h"]
                              << " Nm3/(m3 bed h)  [0 degC, 1 atm, ideal gas -- a convention]\n";
                if (kpis_.count("tau_gas_s"))
                    std::cout << "    tau (actual gas)    " << std::setprecision(3) << kpis_["tau_gas_s"]
                              << " s  [inlet gas priced by the package's EoS]\n";
                std::cout << "\n";
            }
        }
    }
    try
    {
        //  Both ends priced by the rule the energy report applies to these
        //  very streams (`flashState::priceState`: resolve the state, price
        //  the equilibrium phases of a split), on the state each one carries
        //  -- the outlet's own equilibrium since C73 (2026-10-17).  The
        //  `H_stream_formation` blend this replaces agreed with the report on
        //  every single-phase stream and parted on a two-phase one.
        const scalar H_in_kW = flashState::priceState(T, P, z_in, F_in_kmols,
            pinned_in, vf_in, thermo, "pfr inlet", nullptr);
        scalar H_out_kW = 0.0;
        for (const auto& s : produced_)
            H_out_kW += flashState::priceState(s.T, P_out, s.z, s.F, false,
                s.vf, thermo, "pfr outlet", nullptr);
        kpis_["Q_kW"] = H_out_kW - H_in_kW;   // ~0 for an adiabatic reactor
    }
    catch (const std::exception&) { /* a species lacks formation data */ }
    //  The march conserves H on the surface the duty is priced on (C77), so
    //  the duty IS the marched wall heat: zero adiabatic.  An outlet whose
    //  enthalpy no T on that surface carries is a pure product on its
    //  saturation jump (ReactorOutlet.H) -- said.
    if (!isoT && kpis_.count("Q_kW") && unmatched_out != 0.0)
        reactorOutlet::announceUnmatchedEnthalpy("pfr", unitNameOf(dict),
            tmode, T_out, unmatched_out * F_out / 1000.0);   // J/mol x mol/s -> kW

    if (verbosity >= 2) reactorOutlet::printOutletState(outSt);
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
        //  ONE LINE PER REACTION, IN ITS OWN LAW'S WORDS (DEV.md 4c C66): each
        //  law states its own constant, or says it declares none -- a banner
        //  keyed on one model must never describe a model that is not running
        //  (the 2026-08-04 trap).
        for (std::size_t j = 0; j < R; ++j)
        {
            std::cout << "  " << std::left << std::setw(12) << rname[j] << std::right
                      << "  k(T_in) = " << std::scientific << std::setprecision(3);
            if (law[j]->hasRateConstant()) std::cout << kpis_["k_" + rname[j]];
            else                           std::cout << "(none declared)";
            std::cout << "   [" << law[j]->typeName() << "]";
            if (const ExpressionRate* ex = law[j]->asExpression())
                if (ex->hasRateConstant())
                    std::cout << "  (`" << ex->rateConstantName() << "` in "
                              << ex->rateConstantUnit() << ", as the law declares it)";
            std::cout << "\n" << std::fixed;
        }
        std::cout << "=====================================================================\n\n";
    }
    return 0;
}

// ---------------------------------------------------------------------------
//  THE BED'S CROSS-SECTION AND ITS ERGUN PRESSURE DROP (DEV.md 4c C66).
//  Defined here, after the march that uses them, and declared in PFR.H --
//  see the description there for the rule, the equation and the source.
// ---------------------------------------------------------------------------
PFR::BedHydraulics PFR::readBedHydraulics(const DictPtr&       op,
                                          const ThermoPackage& thermo,
                                          scalar               V_R,
                                          int                  verbosity)
{
    BedHydraulics h;
    const bool hasPD = op->found("pressureDrop");
    h.hasGeometry = op->found("L_over_D");
    //  A bed of DECLARED DIAMETER (C69): the diameter is given -- inside a
    //  multibed converter it is the shell's, shared by every bed -- and the
    //  length follows from the volume.  A slenderness beside it would be a
    //  second home for the same cross-section.
    if (op->found("diameter"))
    {
        if (h.hasGeometry || op->found("tubes"))
            throw std::runtime_error("PFR: `operation.diameter` and `operation."
                + std::string(h.hasGeometry ? "L_over_D" : "tubes") + "` both"
                " describe the bed's cross-section -- a bed of declared diameter"
                " has its length from its volume, L = V_R / (pi D^2 / 4).  Keep"
                " one.");
        h.D = op->lookupScalar("diameter", Dims::length);
        if (!(h.D > 0.0))
            throw std::runtime_error("PFR: `operation.diameter` must be > 0.");
        h.diameterDeclared = true;
        h.hasGeometry      = true;
        h.A = 0.25 * constant::pi * h.D * h.D;
        h.L = V_R / h.A;
        h.L_over_D = h.L / h.D;
    }
    //  A MULTITUBULAR bed (C69): the tubes ARE the geometry.  A slenderness
    //  beside them would be a second geometry for the same bed.
    if (op->found("tubes"))
    {
        if (h.hasGeometry)
            throw std::runtime_error("PFR: `operation.tubes` and"
                " `operation.L_over_D` both describe the bed's geometry -- a"
                " multitubular bed's cross-section is its tubes' (N pi d_i^2 / 4)"
                " and its length theirs.  Delete `L_over_D`.");
        auto t = op->subDict("tubes");
        for (const auto& key : t->keys())
            if (key != "count" && key != "innerDiameter" && key != "length"
                && key != "wallThickness" && key != "wallConductivity")
                throw std::runtime_error("PFR: `operation.tubes." + key + "` is"
                    " not read.  The block accepts `count`, `innerDiameter`,"
                    " `length`, `wallThickness` and `wallConductivity`.");
        h.tubes  = true;
        h.nTubes = t->lookupScalar("count", Dims::dimensionless);
        h.D      = t->lookupScalar("innerDiameter", Dims::length);
        if (!(h.nTubes > 0.0) || !(h.D > 0.0))
            throw std::runtime_error("PFR: `tubes.count` and"
                " `tubes.innerDiameter` must be > 0.");
        const bool th = t->found("wallThickness"), tk = t->found("wallConductivity");
        if (th != tk)
            throw std::runtime_error("PFR: `tubes.wallThickness` and"
                " `tubes.wallConductivity` are declared together or not at all"
                " -- a wall resistance needs both, and one alone is a number"
                " nothing would read.");
        if (th)
        {
            h.dOuter = h.D + 2.0 * t->lookupScalar("wallThickness", Dims::length);
            h.wallK  = t->lookupScalar("wallConductivity", Dims::thermalCond);
            if (!(h.dOuter > h.D) || !(h.wallK > 0.0))
                throw std::runtime_error("PFR: `tubes.wallThickness` and"
                    " `tubes.wallConductivity` must be > 0.");
        }
        h.hasGeometry = true;
        h.A = 0.25 * constant::pi * h.D * h.D * h.nTubes;
        h.L = t->found("length") ? t->lookupScalar("length", Dims::length) : V_R / h.A;
        h.L_over_D = h.L / h.D;
    }
    if (hasPD && !h.hasGeometry)
        throw std::runtime_error("PFR: `operation.pressureDrop` integrates"
            " dP/dz along the bed, and a volume has no length: declare the"
            " bed's slenderness `operation.L_over_D` (D and L follow from it"
            " and V_R) or its `operation.diameter` (L follows).  It is the ONE"
            " home of that number -- the `pfr` sizer reads it from this unit"
            " and refuses a second copy.");
    if (h.hasGeometry && !h.tubes && !h.diameterDeclared)
    {
        h.L_over_D = op->lookupScalar("L_over_D", Dims::dimensionless);
        if (!(h.L_over_D > 0.0))
            throw std::runtime_error("PFR: `operation.L_over_D` must be > 0.");
        h.D = std::cbrt(4.0 * V_R / (constant::pi * h.L_over_D));
        h.A = 0.25 * constant::pi * h.D * h.D;
        h.L = h.L_over_D * h.D;
    }
    if (!hasPD) return h;

    auto pd = op->subDict("pressureDrop");
    for (const auto& key : pd->keys())
        if (key != "model" && key != "voidFraction" && key != "allowable")
            throw std::runtime_error("PFR: `operation.pressureDrop." + key
                + "` is not read.  The block accepts `model`, `voidFraction`"
                  " and `allowable`; the particle is `operation.catalyst."
                  "particleDiameter` (one home: the rate law's effectiveness"
                  " factor reads the same particle).");
    if (!pd->found("model"))
        throw std::runtime_error("PFR: `operation.pressureDrop` needs `model"
            " Ergun;` -- the one packed-bed correlation this reactor carries,"
            " named rather than defaulted.");
    static const std::vector<std::string> models = { "Ergun" };
    const std::string m = pd->lookupWord("model");
    if (std::find(models.begin(), models.end(), m) == models.end())
        throw std::runtime_error("PFR: " + registryRefusal::message(
            "pressureDrop model", m, models, "Accepted"));
    if (!pd->found("voidFraction"))
        throw std::runtime_error("PFR: `operation.pressureDrop` needs the"
            " bed's `voidFraction` -- the drop goes as (1-eps)/eps^3, so a"
            " default would choose the answer (0.36 vs 0.42 is a factor of"
            " two).  Declare it, and say where it came from.");
    h.eps = pd->lookupScalar("voidFraction", Dims::dimensionless);
    if (!(h.eps > 0.0) || !(h.eps < 1.0))
        throw std::runtime_error("PFR: `pressureDrop.voidFraction` must lie"
            " in (0, 1).");
    if (!op->found("catalyst") || !op->subDict("catalyst")->found("particleDiameter"))
        throw std::runtime_error("PFR: `operation.pressureDrop` needs the"
            " particle: declare `operation { catalyst { particleDiameter"
            " <length>; } }` (the Ergun equivalent-sphere diameter).  No"
            " default particle exists.");
    h.dp = op->subDict("catalyst")->lookupScalar("particleDiameter", Dims::length);
    if (!(h.dp > 0.0))
        throw std::runtime_error("PFR: `catalyst.particleDiameter` must be > 0.");
    if (pd->found("allowable"))
    {
        h.allowable = pd->lookupScalar("allowable", Dims::pressure);
        if (!(h.allowable > 0.0))
            throw std::runtime_error("PFR: `pressureDrop.allowable` must be > 0.");
    }
    if (!thermo.hasTransport())
        throw std::runtime_error("PFR: the Ergun pressure drop needs the gas"
            " VISCOSITY and this package declares no transport model -- add"
            " `transport { viscosity { model Chung; } }` to the"
            " thermoPhysPropDict.  None is assumed.");
    h.ergun = true;

    const std::string note =
        "[ergun] the bed's pressure drop is Ergun's (Chem. Eng. Prog. 48 (1952)"
        " 89) on the declared void fraction and particle: the particle is"
        " taken as Ergun's EQUIVALENT-SPHERE diameter, so a sieve size of"
        " irregular granules overstates it and the drop is a LOWER estimate;"
        " the gas viscosity is the package's dilute-gas model with NO"
        " dense-gas correction; the density is "
        + std::string(thermo.hasEos() ? "the package's equation of state"
                                      : "the IDEAL GAS (no equation of state is"
                                        " declared)")
        + "; the wall effect and any maldistribution are not modelled";
    AdvisoryLog::instance().add("model", "info", "pfr (Ergun)", note);
    if (verbosity >= 2) std::cout << "  " << note << "\n";
    return h;
}

PFR::ErgunTerms PFR::ergunTerms(const BedHydraulics& h, const ThermoPackage& thermo,
                                scalar T, scalar P, const sVector& z, scalar Ftot)
{
    const scalar vmol = thermo.hasEos() ? thermo.eos().molarVolume(T, P, z)
                                        : constant::R * T / P;      // m3/mol
    scalar MW = 0.0;                                                // kg/kmol
    for (std::size_t i = 0; i < z.size(); ++i) MW += z[i] * thermo.comp(i).MW();
    const scalar rho = 1.0e-3 * MW / vmol;                          // kg/m3
    const scalar u   = Ftot * vmol / h.A;                           // m/s, superficial
    const scalar mu  = thermo.viscosityGas(T, z);                   // Pa s
    const scalar e   = h.eps;
    const scalar a = 150.0 * (1.0 - e) * (1.0 - e) * mu / (e * e * e * h.dp * h.dp);
    const scalar b = 1.75 * (1.0 - e) * rho / (e * e * e * h.dp);
    ErgunTerms t;
    t.viscous  = a * u;
    t.inertial = b * u * u;
    return t;
}

scalar PFR::ergunGradient(const BedHydraulics& h, const ThermoPackage& thermo,
                          scalar T, scalar P, const sVector& z, scalar Ftot)
{
    const ErgunTerms t = ergunTerms(h, thermo, T, P, z, Ftot);
    return -(t.viscous + t.inertial);
}

void PFR::publishBedHydraulics(const BedHydraulics& h, const ThermoPackage& thermo,
                               scalar T_in, scalar P_in, scalar T_out, scalar P_out,
                               const sVector& z_in, const sVector& z_out,
                               scalar F_in_mols, scalar F_out_mols, int verbosity)
{
    if (!h.hasGeometry) return;
    if (h.tubes)
    {
        //  A multitubular bed publishes its TUBES, never an `L_over_D`: that
        //  KPI is the slenderness the `pfr` sizer wraps ONE cylinder around,
        //  and a bundle of tubes is not one cylinder (C69).
        kpis_["nTubes"]   = h.nTubes;
        kpis_["d_tube_m"] = h.D;
        kpis_["L_tube_m"] = h.L;
        kpis_["A_bed_m2"] = h.A;
        if (h.dOuter > 0.0) kpis_["d_tube_outer_m"] = h.dOuter;
    }
    else
    {
    kpis_["L_over_D"] = h.L_over_D;
    kpis_["D_bed_m"]  = h.D;
    //  Published ONLY when the diameter was declared: the sizer builds the
    //  shell on it, and a converterShell holds its beds to ONE diameter.
    if (h.diameterDeclared) kpis_["D_bed_declared_m"] = h.D;
    kpis_["L_bed_m"]  = h.L;
    kpis_["A_bed_m2"] = h.A;
    }
    if (!h.ergun) return;

    //  The inlet's regime, for the reader: the superficial velocity, the
    //  particle Reynolds number Re_p = rho u dp / (mu (1 - eps)) (Ergun's own
    //  abscissa) and the share of the drop the INERTIAL term carries.
    auto regime = [&](scalar T, scalar P, const sVector& z, scalar F,
                      scalar& u, scalar& Re, scalar& inertial,
                      scalar& rho, scalar& mu)
    {
        const scalar vmol = thermo.hasEos() ? thermo.eos().molarVolume(T, P, z)
                                            : constant::R * T / P;
        scalar MW = 0.0;
        for (std::size_t i = 0; i < z.size(); ++i) MW += z[i] * thermo.comp(i).MW();
        rho = 1.0e-3 * MW / vmol;
        mu  = thermo.viscosityGas(T, z);
        u = F * vmol / h.A;
        Re = rho * u * h.dp / (mu * (1.0 - h.eps));
        const scalar e = h.eps;
        const scalar a = 150.0 * (1.0 - e) * (1.0 - e) * mu / (e * e * e * h.dp * h.dp);
        const scalar b = 1.75 * (1.0 - e) * rho / (e * e * e * h.dp);
        inertial = b * u * u / (a * u + b * u * u);
    };
    scalar u_in, Re_in, in_in, u_out, Re_out, in_out, rho_in, mu_in, rho_out, mu_out;
    regime(T_in, P_in, z_in, F_in_mols, u_in, Re_in, in_in, rho_in, mu_in);
    regime(T_out, P_out, z_out, F_out_mols, u_out, Re_out, in_out, rho_out, mu_out);
    //  The two properties the drop was priced on, at the inlet: a reader (and
    //  the gate) can redo Ergun's arithmetic from published numbers.
    kpis_["rho_gas_in"] = rho_in;
    kpis_["mu_gas_in"]  = mu_in;

    const scalar dP = P_in - P_out;
    kpis_["dP_bed_bar"]          = dP / 1.0e5;
    kpis_["P_out_bar"]           = P_out / 1.0e5;
    kpis_["u_superficial_in"]    = u_in;
    kpis_["u_superficial_out"]   = u_out;
    kpis_["Re_p_in"]             = Re_in;
    kpis_["ergunInertialShare_in"] = in_in;
    if (h.allowable > 0.0)
    {
        kpis_["dP_over_allowable"] = dP / h.allowable;
        if (dP > h.allowable)
        {
            std::ostringstream os;
            os << std::fixed << std::setprecision(3)
               << "the bed loses " << dP / 1.0e5 << " bar, ABOVE the declared"
                  " allowable " << h.allowable / 1.0e5 << " bar (x"
               << dP / h.allowable << ").  ";
            if (h.diameterDeclared)
                os << "At a fixed volume u and L both go as 1/D^2, so the drop"
                      " falls as D^-4 (viscous) to D^-6 (inertial): a wider bed"
                      " (a larger `diameter`), a larger particle or a bed the"
                      " gas crosses RADIALLY is the remedy; nothing here"
                      " reduces it";
            else
                os << "At a fixed volume both u and L go"
                  " as (L/D)^(2/3), so the drop goes as u^2 L ~ (L/D)^2: a"
                  " lower L_over_D, a larger particle or a bed the gas crosses"
                  " RADIALLY (through its thickness, not its length) is the"
                  " remedy; nothing here reduces it";
            AdvisoryLog::instance().add("model", "warning", "pfr (Ergun)", os.str());
            if (verbosity >= 1) std::cout << "  [ergun] WARNING: " << os.str() << "\n";
        }
    }
    if (verbosity >= 2)
        std::cout << "\n  [ergun] bed hydraulics ("
                  << (h.tubes ? "per tube: " + std::to_string(h.nTubes)
                                + " parallel tubes, L/d_t "
                              : h.diameterDeclared
                              ? std::string("straight cylinder of V_R at the"
                                            " declared diameter, L/D ")
                              : std::string("straight cylinder of V_R at L/D "))
                  << std::fixed << std::setprecision(2) << h.L_over_D << ")\n"
                  << "    D = " << std::setprecision(3) << h.D << " m, L = " << h.L
                  << " m, A = " << h.A << " m2;  eps = " << h.eps << ", dp = "
                  << std::setprecision(2) << 1000.0 * h.dp << " mm\n"
                  << "    u (superficial) " << std::setprecision(4) << u_in << " -> "
                  << u_out << " m/s;  Re_p(in) = " << std::setprecision(1) << Re_in
                  << ", inertial share of the drop " << std::setprecision(3) << in_in << "\n"
                  << "    P " << std::setprecision(4) << P_in / 1.0e5 << " -> "
                  << P_out / 1.0e5 << " bar:  dP = " << dP / 1.0e5 << " bar";
    if (verbosity >= 2 && h.allowable > 0.0)
        std::cout << "  (allowable " << h.allowable / 1.0e5 << " bar, declared)";
    if (verbosity >= 2) std::cout << "\n\n";
}

// ---------------------------------------------------------------------------
//  THE BED VOLUME: ONE HOME FOR THE LENGTH (DEV.md 4c C69).  A multitubular
//  bed that declares its tubes' length HAS a volume, N pi d_i^2 / 4 L, and a
//  `V_R` beside it would be a second home for the same number.  Without a
//  length (or without tubes) the volume is the declared `V_R`, read exactly
//  as it always was.
// ---------------------------------------------------------------------------
scalar PFR::bedVolume(const DictPtr& op)
{
    if (op->found("tubes") && op->subDict("tubes")->found("length"))
    {
        if (op->found("V_R"))
            throw std::runtime_error("PFR: `operation.V_R` and"
                " `operation.tubes.length` both fix the bed's volume (V_R = N"
                " pi d_i^2 / 4 L).  Declare ONE: the tube length (and the volume"
                " follows), or V_R (and the length follows).");
        auto t = op->subDict("tubes");
        const scalar N = t->lookupScalar("count", Dims::dimensionless);
        const scalar d = t->lookupScalar("innerDiameter", Dims::length);
        const scalar L = t->lookupScalar("length", Dims::length);
        if (!(N > 0.0) || !(d > 0.0) || !(L > 0.0))
            throw std::runtime_error("PFR: `tubes.count`, `tubes.innerDiameter`"
                " and `tubes.length` must be > 0.");
        return 0.25 * constant::pi * d * d * N * L;
    }
    return op->lookupScalar("V_R", Dims::volume);
}

// ---------------------------------------------------------------------------
//  HEAT EXCHANGE THROUGH THE BED WALL (thermalMode heatExchange).  See the
//  description in PFR.H for the grammar; every refusal names its remedy.
// ---------------------------------------------------------------------------
void PFR::readWallExchange(WallExchange& w, const DictPtr& op,
                           const BedHydraulics& h, const ThermoPackage& thermo,
                           scalar massFlow_kg_s, int verbosity)
{
    const bool hasCoolant = op->found("coolant");
    const bool hasCorr    = op->found("wallHeatTransfer");

    //  ---- the LEGACY form, read exactly as before ----------------------
    if (!hasCoolant && !hasCorr && !h.tubes)
    {
        w.legacy = true;
        w.Udecl  = op->lookupScalar("U");                                   // W/(m^2.K)
        w.aV     = op->lookupScalar("areaPerVolume");                       // m^2/m^3
        w.Tc_in  = op->lookupScalar("T_coolant", Dims::temperature);
        return;
    }

    //  ---- the area per volume: the tubes', or the declared one ---------
    if (h.tubes)
    {
        if (op->found("areaPerVolume"))
            throw std::runtime_error("PFR: `operation.areaPerVolume` beside"
                " `operation.tubes`: a tube of inner diameter d_i has 4/d_i of"
                " wall per volume of bed, so the number is the tubes' and a"
                " second copy could disagree.  Delete `areaPerVolume`.");
        w.aV = 4.0 / h.D;
    }
    else
        w.aV = op->lookupScalar("areaPerVolume");

    //  ---- the coolant ----------------------------------------------------
    if (hasCoolant && op->found("T_coolant"))
        throw std::runtime_error("PFR: `operation.T_coolant` beside"
            " `operation.coolant {}`: the coolant's temperature is"
            " `coolant.T_in` -- one home.  Delete `T_coolant`.");
    if (!hasCoolant)
    {
        if (hasCorr)
            throw std::runtime_error("PFR: `operation.wallHeatTransfer` computes"
                " the BED side of the wall; the coolant side needs its own film,"
                " declared in `operation.coolant { film <W/m2/K>; ... }`, and the"
                " coolant block also says how the coolant flows.  Declare it.");
        w.mode  = CoolantMode::constant;
        w.Tc_in = op->lookupScalar("T_coolant", Dims::temperature);
    }
    else
    {
        auto c = op->subDict("coolant");
        for (const auto& key : c->keys())
            if (key != "arrangement" && key != "T_in" && key != "flow"
                && key != "cp" && key != "utility" && key != "film")
                throw std::runtime_error("PFR: `operation.coolant." + key + "` is"
                    " not read.  The block accepts `arrangement`, `T_in`, `flow`,"
                    " `cp` or `utility`, and `film`.");
        static const std::vector<std::string> arr =
            { "coCurrent", "counterCurrent", "boiling" };
        if (!c->found("arrangement"))
            throw std::runtime_error("PFR: `operation.coolant` needs its"
                " `arrangement` -- coCurrent, counterCurrent or boiling.  How the"
                " coolant flows changes the hot spot; it is named, not defaulted.");
        const std::string a = c->lookupWord("arrangement");
        if (std::find(arr.begin(), arr.end(), a) == arr.end())
            throw std::runtime_error("PFR: " + registryRefusal::message(
                "coolant arrangement", a, arr, "Accepted"));
        w.mode  = (a == "coCurrent")      ? CoolantMode::coCurrent
                : (a == "counterCurrent") ? CoolantMode::counterCurrent
                                          : CoolantMode::boiling;
        w.Tc_in = c->lookupScalar("T_in", Dims::temperature);
        if (w.mode == CoolantMode::boiling)
        {
            for (const char* key : { "flow", "cp", "utility" })
                if (c->found(key))
                    throw std::runtime_error(std::string("PFR: `coolant.") + key
                        + "` is not read by a BOILING coolant: it stays at `T_in`"
                          " whatever it takes (the latent heat absorbs the duty),"
                          " so its flow and heat capacity change nothing here.");
        }
        else
        {
            w.mdot = c->lookupScalar("flow", Dims::massFlow);
            if (!(w.mdot > 0.0))
                throw std::runtime_error("PFR: `coolant.flow` must be > 0.");
            if (c->found("cp") == c->found("utility"))
                throw std::runtime_error("PFR: a sensible coolant needs its heat"
                    " capacity from ONE place: `coolant.cp <J/kg/K>;` or `coolant."
                    "utility <record>;` (the record's mean cp, dutyPerKg / |T_in -"
                    " T_out|) -- declare exactly one.");
            if (c->found("cp"))
            {
                w.cp     = c->lookupScalar("cp", Dims::heatCapacity);
                w.cpFrom = "declared";
            }
            else
            {
                const std::string un = c->lookupWord("utility");
                const Utility& u = UtilityCatalogue::byName(un);
                const scalar dT = std::abs(u.T_in - u.T_out);
                if (u.mechanism != "sensible" || !(dT > 0.0) || !(u.dutyPerKg > 0.0))
                    throw std::runtime_error("PFR: `coolant.utility " + un + "` is"
                        " a '" + u.mechanism + "' utility; only a SENSIBLE record"
                        " (a temperature drop and a duty per kg) gives a mean cp."
                        "  A boiling coolant is `arrangement boiling;`.");
                w.cp     = u.dutyPerKg / dT;
                w.cpFrom = "utility " + un;
                std::ostringstream os;
                os << "[coolant] cp = " << w.cp << " J/kg/K, the MEAN heat"
                      " capacity of utility record '" << un << "' (dutyPerKg "
                   << u.dutyPerKg << " J/kg over its " << dT << " K loop): one"
                      " number for the whole coolant path, taken from a record"
                      " whose loop temperatures are not this coolant's";
                AdvisoryLog::instance().add("model", "info", "pfr (coolant)", os.str());
                if (verbosity >= 2) std::cout << "  " << os.str() << "\n";
            }
            if (!(w.cp > 0.0))
                throw std::runtime_error("PFR: the coolant's cp must be > 0.");
            w.mcp = w.mdot * w.cp;
        }
    }

    //  ---- the wall coefficient: declared, or computed ------------------
    if (hasCorr && op->found("U"))
        throw std::runtime_error("PFR: `operation.U` (an OVERALL coefficient,"
            " declared) beside `operation.wallHeatTransfer` (the bed side of one,"
            " computed): the two answer the same question.  Delete one -- a"
            " declared U is the whole wall, film and coolant included.");
    if (!hasCorr)
    {
        w.Udecl = op->lookupScalar("U", Dims::heatTransfer_h);
        if (!(w.Udecl > 0.0))
            throw std::runtime_error("PFR: `operation.U` must be > 0.");
        if (hasCoolant && op->subDict("coolant")->found("film"))
            throw std::runtime_error("PFR: `coolant.film` beside a declared"
                " `operation.U`: the declared U is the OVERALL coefficient and"
                " already holds the coolant's film.  Delete the film, or compute"
                " the bed side with `wallHeatTransfer` and keep it.");
        return;
    }

    auto wh = op->subDict("wallHeatTransfer");
    for (const auto& key : wh->keys())
        if (key != "model")
            throw std::runtime_error("PFR: `operation.wallHeatTransfer." + key
                + "` is not read.  The block names the correlation (`model`); the"
                  " particle's size and shape live in `operation.catalyst`.");
    if (!wh->found("model"))
        throw std::runtime_error("PFR: `operation.wallHeatTransfer` needs `model"
            " <name>;` -- the correlation is named, never defaulted.");
    if (!h.tubes)
        throw std::runtime_error("PFR: `operation.wallHeatTransfer` correlates"
            " the coefficient of a packed TUBE on the particle-to-tube diameter"
            " ratio; declare the tubes (`operation.tubes { count;"
            " innerDiameter; ... }`).");
    if (!op->found("catalyst") || !op->subDict("catalyst")->found("particleDiameter"))
        throw std::runtime_error("PFR: `operation.wallHeatTransfer` reads the"
            " particle: declare `operation { catalyst { particleDiameter"
            " <length>; shape sphere|cylinder; } }` (6 V_p / A_p).");
    if (!thermo.hasTransport() || !thermo.hasThermalConductivity())
        throw std::runtime_error("PFR: `operation.wallHeatTransfer` needs the"
            " gas VISCOSITY and THERMAL CONDUCTIVITY, and this package declares "
            + std::string(thermo.hasTransport() ? "no conductivity model"
                                                : "no transport model")
            + " -- add `transport { viscosity { model Chung; }"
              " thermalConductivity { model Eucken; } }` to the"
              " thermoPhysPropDict.  None is assumed.");
    auto cat = op->subDict("catalyst");
    w.corr = BedWallHeatTransfer::New(wh->lookupWord("model"));
    w.corr->readParticle(cat, "PFR");
    w.dp = cat->lookupScalar("particleDiameter", Dims::length);
    w.dt = h.D;
    w.G  = massFlow_kg_s / h.A;
    auto c = op->subDict("coolant");
    if (!c->found("film"))
        throw std::runtime_error("PFR: the coolant's film coefficient is"
            " needed in series with the bed side: declare `coolant { film"
            " <W/m2/K>; }` and say where it came from.  No coolant correlation"
            " is wired (the shell side of a reactor is a design of its own).");
    const scalar hc = c->lookupScalar("film", Dims::heatTransfer_h);
    if (!(hc > 0.0))
        throw std::runtime_error("PFR: `coolant.film` must be > 0.");
    //  Wall and film on the INSIDE area: the coolant's on d_i/d_o of its
    //  own (outside) area, the wall's cylindrical resistance.
    const scalar dO = (h.dOuter > 0.0) ? h.dOuter : h.D;
    w.R_film = (h.D / dO) / hc;
    w.R_wall = (h.dOuter > 0.0) ? h.D * std::log(h.dOuter / h.D) / (2.0 * h.wallK) : 0.0;

    const auto v = w.corr->verify();
    std::ostringstream os;
    os << "[wall] the bed-side coefficient is " << w.corr->type() << ": "
       << w.corr->citation() << "; window " << w.corr->validityWindow()
       << "; in series with "
       << (h.dOuter > 0.0 ? std::string("the tube wall")
                          : std::string("NO tube-wall resistance (no wallThickness"
                                        " / wallConductivity declared)"))
       << " and the DECLARED coolant film.  Anchor (" << v.kind << "): "
       << v.anchor << ", deviation " << std::scientific << std::setprecision(2)
       << v.dev << " -- an arithmetic anchor proves a transcription, not the"
          " physics";
    AdvisoryLog::instance().add("model", "info", "pfr (wall)", os.str());
    if (verbosity >= 2) std::cout << "  " << os.str() << "\n" << std::fixed;
}

void PFR::refuseBedHydraulicsOnSinglePath(const DictPtr& op)
{
    for (const char* key : { "pressureDrop", "L_over_D", "diameter", "tubes",
                             "coolant", "wallHeatTransfer" })
        if (op->found(key))
            throw std::runtime_error(std::string("PFR: `operation.") + key
                + "` is read by the MULTI-reaction path only (`reactions ("
                  " <name> );`), which marches the gas bed's pressure with its"
                  " species; the single-reaction path (`reaction <name>;`)"
                  " integrates a liquid-basis volume with no cross-section."
                  "  Declare the reaction as a one-entry `reactions` list.");
}

} // namespace Choupo
