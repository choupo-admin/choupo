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
#include "ReactionHeat.H"
#include "core/Advisory.H"
#include "core/Constants.H"
#include "core/RegistryRefusal.H"
#include "core/Units.H"
#include "kinetics/AmmoniaSynthesisRate.H"
#include "thermo/equationOfState/EquationOfState.H"
#include "thermo/reaction/RateLaw.H"
#include "thermo/reaction/Reaction.H"

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

namespace Choupo {

namespace {

// ---------------------------------------------------------------------------
//  A DYSON-SIMON BED: the `kinetics { type dysonSimon1968; }` reaction of the
//  multi-reaction path, wired 2026-09-26 for stage D of the staged design
//  sequence (tutorials/plant/ammoniaStaged04_kinetic, DEV.md C8).
//
//  WHY IT IS NOT A `RateLaw`.  `thermo/reaction/RateLaw` lives in the thermo
//  band and may not include a unit-operation header; the Dyson-Simon object
//  lives under unitOperations/reactor/kinetics/ because it is a REACTOR's
//  rate, per cubic metre of catalyst BED.  So the selection happens here, in
//  the reactor, on the SAME `kinetics.type` word the RateLaw family reads --
//  and the accepted list is stated ONCE below, so a word neither knows is
//  refused with the whole list rather than with RateLaw's shorter one.
//
//  WHAT THE LAW NEEDS THAT THE POWER LAWS DO NOT:
//    * the PRESSURE, in atmospheres (Eqs 6-8 are written in atm) -- read from
//      the feed stream, refused when the feed carries none;
//    * WHICH component plays N2, H2 and NH3 -- DECLARED in `roles {}`, never
//      guessed from a name; everything else is inert to Eq 19;
//    * whether Eq 39's diffusion correction is applied -- a DECLARED word,
//      `effectivenessFactor intrinsic | dysonSimonEq39`, with no default.
//  And what it does NOT need: `catalystLoading` (Eq 19 is already per m3 of
//  bed -- a loading would convert a rate that needs no converting), a
//  power-law `order` on any reactant, and `reversible` (Eq 19 carries its
//  own reverse term).  Each of those is REFUSED by name, because a key the
//  engine does not read is a comment that looks like a declaration.
// ---------------------------------------------------------------------------
struct DysonSimonBed
{
    std::size_t iN2 = 0, iH2 = 0, iNH3 = 0;
    scalar      nuNH3 = 0.0;     // declared coefficient of the NH3 role (> 0)
    bool        eq39  = false;   // Eq 40 (xi from Eq 39 + Table I) vs Eq 19 alone
    scalar      dp_mm = 0.0;     // particle diameter in mm when eq39
    scalar      P_atm = 0.0;

    // What the integration SAW, gathered for the report: every RK4 stage
    // evaluates the law, so the sentences are collected here and said once.
    scalar      xiMin =  1.0e300, xiMax = -1.0e300;
    std::size_t nUnphysical = 0;
    std::string firstUnphysical;
    std::string interpolationNote;
};

const std::vector<std::string>& acceptedRateLawWords()
{
    static const std::vector<std::string> v = { "Arrhenius", "LHHW", "dysonSimon1968" };
    return v;
}

DysonSimonBed readDysonSimonBed(const DictPtr&       rxn,
                                const DictPtr&       operDict,
                                const DictPtr&       feedDict,
                                const ThermoPackage& thermo,
                                const sVector&       nuRow,
                                scalar               P_Pa,
                                const std::string&   who)
{
    DysonSimonBed b;
    auto kin = rxn->subDict("kinetics");

    for (const auto& key : kin->keys())
        if (key != "type" && key != "roles" && key != "effectivenessFactor")
            throw std::runtime_error(who + ": kinetics key `" + key + "` is not"
                " read by the dysonSimon1968 law -- its constants are the"
                " paper's own (AmmoniaSynthesisRate.cpp) and the block accepts"
                " exactly `type`, `roles {}` and `effectivenessFactor`.  A key"
                " the engine does not read is a comment; remove it.");
    if (rxn->found("reversible"))
        throw std::runtime_error(who + ": `reversible` has no meaning under"
            " dysonSimon1968 -- Equation 19 carries its own reverse term and"
            " vanishes exactly at Gillespie & Beattie's equilibrium (anchor A1"
            " of the law's self-check).  Remove the key.");
    for (const auto& s : rxn->lookupDictList("stoichiometry"))
        if (s->found("order"))
            throw std::runtime_error(who + ": stoichiometry entry '"
                + s->lookupWord("component") + "' declares a power-law `order`,"
                " which dysonSimon1968 does not read (its exponents are the"
                " paper's, 1.5 on hydrogen and the Temkin form on ammonia)."
                "  Remove it.");

    // Roles: WHICH component is N2, H2, NH3 -- declared, never inferred.
    if (!kin->found("roles"))
        throw std::runtime_error(who + ": dysonSimon1968 needs a `roles { N2"
            " <component>; H2 <component>; NH3 <component>; }` block naming"
            " which of this case's components play the law's three species."
            "  The engine will not guess them from names.");
    auto roles = kin->subDict("roles");
    for (const auto& key : roles->keys())
        if (key != "N2" && key != "H2" && key != "NH3")
            throw std::runtime_error(who + ": roles key `" + key + "` is not one"
                " of the law's three species (N2, H2, NH3); every other"
                " component is INERT to Equation 19 and needs no role.");
    b.iN2  = thermo.indexOf(roles->lookupWord("N2"));
    b.iH2  = thermo.indexOf(roles->lookupWord("H2"));
    b.iNH3 = thermo.indexOf(roles->lookupWord("NH3"));
    if (b.iN2 == b.iH2 || b.iN2 == b.iNH3 || b.iH2 == b.iNH3)
        throw std::runtime_error(who + ": two of the roles N2 / H2 / NH3 name"
            " the same component.");

    // The declared stoichiometry must BE ammonia synthesis, N2 + 3 H2 -> 2 NH3
    // up to a positive factor, and involve nothing else: the law is that
    // reaction's rate and no other's.
    b.nuNH3 = nuRow[b.iNH3];
    if (!(b.nuNH3 > 0.0))
        throw std::runtime_error(who + ": the NH3 role must be a PRODUCT"
            " (nu > 0) under dysonSimon1968; the law is written for the"
            " synthesis direction and its reverse term already carries"
            " decomposition.");
    const scalar f = b.nuNH3 / 2.0;
    const scalar tolNu = 1.0e-9 * b.nuNH3;
    if (std::abs(nuRow[b.iN2] + f) > tolNu || std::abs(nuRow[b.iH2] + 3.0 * f) > tolNu)
        throw std::runtime_error(who + ": the declared stoichiometry is not"
            " N2 + 3 H2 -> 2 NH3 (up to a positive factor): nu(N2) = "
            + std::to_string(nuRow[b.iN2]) + ", nu(H2) = "
            + std::to_string(nuRow[b.iH2]) + ", nu(NH3) = "
            + std::to_string(b.nuNH3) + ".  dysonSimon1968 is THAT reaction's"
            " rate and no other's.");
    for (std::size_t i = 0; i < nuRow.size(); ++i)
        if (i != b.iN2 && i != b.iH2 && i != b.iNH3 && nuRow[i] != 0.0)
            throw std::runtime_error(who + ": component '" + thermo.comp(i).name()
                + "' carries a non-zero nu, but dysonSimon1968 describes"
                  " N2 + 3 H2 -> 2 NH3 alone -- every other component is"
                  " INERT to it.");

    // The effectiveness route: a declared word, no default.
    if (!kin->found("effectivenessFactor"))
        throw std::runtime_error(who + ": dysonSimon1968 needs"
            " `effectivenessFactor intrinsic;` (Eq 19 alone -- the pellet"
            " correction UNPRICED, announced) or `effectivenessFactor"
            " dysonSimonEq39;` (Eq 40 -- Eq 39 with Table I, which needs"
            " `operation { catalyst { particleDiameter <length>; } }`)."
            "  There is no default: the two differ by the factor the paper"
            " calls xi, and a bed sized on the wrong one is wrong by it.");
    const std::string effWord = kin->lookupWord("effectivenessFactor");
    static const std::vector<std::string> effAccepted = { "intrinsic", "dysonSimonEq39" };
    if (std::find(effAccepted.begin(), effAccepted.end(), effWord) == effAccepted.end())
        throw std::runtime_error(who + ": " + registryRefusal::message(
            "dysonSimon1968 effectivenessFactor", effWord, effAccepted, "Accepted"));
    b.eq39 = (effWord == "dysonSimonEq39");

    const bool hasCatalystBlock = operDict->found("catalyst");
    if (b.eq39)
    {
        if (!hasCatalystBlock || !operDict->subDict("catalyst")->found("particleDiameter"))
            throw std::runtime_error(who + ": `effectivenessFactor dysonSimonEq39`"
                " forms Equation 40, and which branch of Eq 39 applies depends"
                " entirely on the particle size -- declare `operation {"
                " catalyst { particleDiameter <length>; } }` (6 to 10 mm is"
                " Table I's range; below 6 mm the authors need no correction;"
                " above 10 mm the law refuses).  No default particle exists.");
        b.dp_mm = 1000.0 * operDict->subDict("catalyst")
                                  ->lookupScalar("particleDiameter", Dims::length);
    }
    else if (hasCatalystBlock)
        throw std::runtime_error(who + ": `operation.catalyst` is declared but"
            " `effectivenessFactor intrinsic` reads no particle -- a declared"
            " value nothing reads is a comment that looks like a declaration."
            "  Either ask for `dysonSimonEq39` or remove the block.");

    if (operDict->found("catalystLoading"))
        throw std::runtime_error(who + ": `catalystLoading` is declared beside"
            " a dysonSimon1968 law.  Equation 19 is ALREADY per cubic metre of"
            " catalyst BED (the paper's own unit, kg-mol NH3 / m3 bed / h), so"
            " a loading would convert a rate that needs no converting -- and"
            " the bed volume this reactor integrates over IS the catalyst"
            " volume.  Remove the key.");

    if (!feedDict->found("P"))
        throw std::runtime_error(who + ": the feed stream carries no pressure,"
            " and dysonSimon1968 is written in ATMOSPHERES (Eqs 6-8) -- the"
            " rate cannot be formed without it.  Declare P on the inlet"
            " stream.");
    b.P_atm = P_Pa / units::atm_to_Pa;
    return b;
}

//  The gas Eq 19 is asked about, from the marched mole fractions.
AmmoniaRateContext dysonSimonContext(const DysonSimonBed& b, scalar T,
                                     const sVector& x)
{
    AmmoniaRateContext c;
    c.T_K   = T;
    c.P_atm = b.P_atm;
    c.x_N2  = x[b.iN2];
    c.x_H2  = x[b.iH2];
    c.x_NH3 = x[b.iNH3];
    //  Everything that is not one of the three roles is inert to the law.
    //  Formed as the complement so the four sum to 1 to round-off (the law
    //  refuses a composition that does not close, deliberately).
    c.x_inert = 1.0 - (c.x_N2 + c.x_H2 + c.x_NH3);
    if (c.x_inert < 0.0) c.x_inert = 0.0;
    c.particleDiameter_mm = b.dp_mm;
    return c;
}

//  ONE evaluation of the law on the bed's declared route, with what it said
//  gathered on the bed record (announced ONCE after the march, not once per
//  RK4 stage).
AmmoniaRateResult dysonSimonEvaluate(DysonSimonBed& b, scalar T, const sVector& x)
{
    const AmmoniaRateContext c = dysonSimonContext(b, T, x);
    AmmoniaRateResult r = b.eq39 ? DysonSimon1968::evaluate(c)
                                 : DysonSimon1968::evaluateIntrinsic(c);
    if (b.eq39)
    {
        b.xiMin = std::min(b.xiMin, r.xi);
        b.xiMax = std::max(b.xiMax, r.xi);
        for (const auto& a : r.announcements)
        {
            if (a.rfind("[unphysical]", 0) == 0)
            {
                if (b.nUnphysical == 0) b.firstUnphysical = a;
                ++b.nUnphysical;
            }
            else if (a.rfind("[interpolated]", 0) == 0)
                b.interpolationNote = a;
        }
    }
    return r;
}

//  Eq 19/40 is kg-mol NH3 per m3 of bed per HOUR; the march wants mol per m3
//  per SECOND per unit EXTENT of the declared reaction, so divide by the
//  declared nu(NH3) (2 for N2 + 3 H2 -> 2 NH3, 1 for the half-reaction).
scalar dysonSimonExtentRate(DysonSimonBed& b, scalar T, const sVector& x)
{
    return dysonSimonEvaluate(b, T, x).rate_kmolNH3_per_m3bed_h
         * (1000.0 / 3600.0) / b.nuNH3;
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
        order[i] = Reaction::forwardOrder(*s, nu[i],
            s->lookupWord("component"), "PFR");
    }
    const std::string limiting = rxnDict->lookupWord("limitingReactant");
    const std::size_t iLim = thermo.indexOf(limiting);

    auto kinDict = rxnDict->subDict("kinetics");
    if (kinDict->lookupWord("type") == "dysonSimon1968")
        throw std::runtime_error("PFR: `kinetics { type dysonSimon1968; }` is"
            " read on the multi-reaction path only -- declare the reaction in"
            " a `reactions ( <name> );` list (one element is fine), which is"
            " also the only path with `thermalMode adiabatic`.  The single"
            " `reaction <name>;` path is the liquid-basis isothermal power-law"
            " integrator and cannot carry a gas-phase bed.");
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
    // law, LHHW or the Dyson-Simon bed -- the marching scheme does not need to
    // know which.  `law[j]` serves every reaction that is NOT a Dyson-Simon
    // bed; `bed[j]` the one that is (at most ONE per reactor: the law is one
    // reaction's rate, and a second copy of it would be the same reaction
    // declared twice).
    auto operDict = dict->subDict("operation");
    auto feedDict = dict->subDict("feed");
    std::vector<RateLaw>                      law(R);
    std::vector<std::optional<DysonSimonBed>> bed(R);
    std::size_t jBed = R;                    // index of the Dyson-Simon bed, if any
    for (std::size_t j = 0; j < R; ++j)
    {
        rname[j] = rxnList[j]->lookupWordOrDefault("name", "rxn" + std::to_string(j + 1));
        for (const auto& s : rxnList[j]->lookupDictList("stoichiometry"))
            nu[j][thermo.indexOf(s->lookupWord("component"))] = s->lookupScalar("nu");
        const std::string who  = "PFR: reaction '" + rname[j] + "'";
        const std::string word = rxnList[j]->subDict("kinetics")->lookupWord("type");
        const auto& accepted = acceptedRateLawWords();
        if (std::find(accepted.begin(), accepted.end(), word) == accepted.end())
            throw std::runtime_error(who + ": " + registryRefusal::message(
                "rate law (kinetics.type)", word, accepted, "Accepted"));
        if (word == "dysonSimon1968")
        {
            if (jBed != R)
                throw std::runtime_error(who + ": a second dysonSimon1968"
                    " reaction in one reactor -- the law is ammonia synthesis's"
                    " rate, and declaring it twice integrates the same reaction"
                    " twice.  One bed, one law.");
            bed[j] = readDysonSimonBed(rxnList[j], operDict, feedDict, thermo,
                                       nu[j], P, who);
            jBed = j;
        }
        else
            law[j] = RateLaw::fromDict(rxnList[j], thermo, who);
    }
    const bool hasBed = (jBed != R);

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
    const scalar Uw = hx ? operDict->lookupScalar("U") : 0.0;                 // W/(m^2.K)
    const scalar aV = hx ? operDict->lookupScalar("areaPerVolume") : 0.0;     // m^2/m^3
    const scalar Tc = hx ? operDict->lookupScalar("T_coolant", Dims::temperature) : 0.0;

    // CATALYST LOADING.  A heterogeneous rate constant is reported per gram of dry
    // catalyst; the bed converts it to a volumetric rate.  Absent => already volumetric.
    const scalar catLoad   = operDict->lookupScalarOrDefault("catalystLoading", 0.0);  // kg/m^3
    const scalar catFactor = (catLoad > 0.0) ? 1000.0 * catLoad : 1.0;
    //  The conversion is all it is: the pellet stays a POINT and eta = 1 is
    //  assumed.  Say so -- see reactor/CatalystPellet.H.
    announceUnresolvedPellet("pfr", catLoad, verbosity);

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
    //  The liquid basis is read ONLY where a concentration law needs it: a
    //  reactor whose every reaction is a Dyson-Simon bed is a GAS bed whose
    //  rate is in T, P and mole fractions, and a liquid molar volume of
    //  hydrogen at 200 bar is a number with no meaning there -- so `tau_s` is
    //  not published for it, and the gas-basis figures below are instead.
    const scalar F_in = F_in_kmols * 1000.0;
    sVector F_i(n, 0.0);
    for (std::size_t i = 0; i < n; ++i) F_i[i] = z_in[i] * F_in;
    bool anyConcLaw = false;
    for (std::size_t j = 0; j < R; ++j) if (!bed[j]) anyConcLaw = true;
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

    // ---- THE DYSON-SIMON BED SAYS WHAT IT IS BEFORE IT MARCHES ---------
    //  Citation, window, route and the inlet evaluation, printed once; the
    //  three sentences a reader must not lose ride AdvisoryLog into the
    //  end-of-run caveat block and the result JSON.
    std::map<std::string, scalar> bedInletKpis;
    if (hasBed)
    {
        DysonSimonBed& b = *bed[jBed];
        const std::string locus = "pfr (dysonSimon1968)";
        const AmmoniaRateResult rin = dysonSimonEvaluate(b, T, z_in);

        //  THE ACTIVITY SURFACE, said rather than assumed.  Eq 19's constants
        //  were fitted with the activities of Eqs 3-8 -- Dyson & Simon's OWN
        //  fugacity-coefficient correlations -- and a rate constant is
        //  meaningless without the activity model it was regressed with
        //  (RateLaw.H says so of every law).  So the bed prices its activities
        //  with the paper's gammas and NOT with this package's equation of
        //  state, which prices the streams and the adiabatic enthalpy march.
        //  The two are compared at the inlet and the ratio is published, so
        //  the size of the disagreement is a number and not a suspicion.
        std::string eosNote;
        sVector phiPkg;
        if (thermo.hasEos())
        {
            try { phiPkg = thermo.eos().phi(T, P, z_in); } catch (const std::exception&) {}
            eosNote = thermo.eos().modelName();
        }
        //  The ADVISORY carries the fact and names where the numbers are; the
        //  numbers themselves stay in the banner and the KPIs.  An advisory
        //  that quoted them would differ in its fourth decimal from one outer
        //  pass to the next and stack up as "different" sentences in the
        //  caveat block (measured: two copies under a DesignSpec).
        std::ostringstream act;
        act << "the rate law prices its activities with its OWN fugacity"
               " coefficients (Eqs 6-8, the ones its rate constant was fitted"
               " with), not with this package's "
            << (eosNote.empty() ? std::string("equation of state") : eosNote)
            << ", which prices the streams and the enthalpy march";
        if (phiPkg.size() == n)
        {
            act << "; the inlet ratio gamma_law / phi_package is published"
                   " per species as the phi_law_over_pkg_*_in KPIs";
            bedInletKpis["phi_law_over_pkg_N2_in"]  = rin.gamma_N2  / phiPkg[b.iN2];
            bedInletKpis["phi_law_over_pkg_H2_in"]  = rin.gamma_H2  / phiPkg[b.iH2];
            bedInletKpis["phi_law_over_pkg_NH3_in"] = rin.gamma_NH3 / phiPkg[b.iNH3];
        }
        act << ".";
        AdvisoryLog::instance().add("model", "info", locus, act.str());
        std::ostringstream actBanner;
        actBanner << act.str();
        if (phiPkg.size() == n)
            actBanner << "  At the inlet: " << std::fixed << std::setprecision(4)
                      << rin.gamma_N2  / phiPkg[b.iN2]  << " (N2), "
                      << rin.gamma_H2  / phiPkg[b.iH2]  << " (H2), "
                      << rin.gamma_NH3 / phiPkg[b.iNH3] << " (NH3).";

        std::string routeMsg;
        if (b.eq39)
        {
            std::ostringstream rm;
            rm << "Equation 40: Eq 19 times the diffusion correction xi of Eq 39"
                  " + Table I, on a " << std::fixed << std::setprecision(2)
               << b.dp_mm << " mm particle -- " << rin.xiRoute;
            routeMsg = rm.str();
        }
        else
            routeMsg = "Equation 19 ALONE (`effectivenessFactor intrinsic`): the"
                " effectiveness factor is taken as 1 and that is UNPRICED, not"
                " found -- the paper's own diffusion correction (Eq 39, Table I,"
                " 6-10 mm particles) exists in this engine and was not applied."
                "  xi multiplies the rate, so a bed sized on this route is"
                " undersized by whatever xi would have been; declare"
                " `effectivenessFactor dysonSimonEq39` with a particle to price"
                " it (the pellet as a modelled object is the rung beyond this"
                " one).";
        AdvisoryLog::instance().add("model", "info", locus, routeMsg);
        AdvisoryLog::instance().add("model", "info", locus,
                                    AmmoniaRateResult::freshCatalystCaveat());
        for (const auto& a : rin.announcements)
            if (a.rfind("[window]", 0) == 0)
                AdvisoryLog::instance().add("model", "warning", locus, a);

        //  The banner is keyed on the VERBOSITY the flowsheet hands this pass
        //  (it lowers it on the silent tear iterations and restores it on
        //  the one it prints), never on whether the advisory was new: inside
        //  one simulator pass the log is not cleared between tear iterations,
        //  so "new" was false exactly on the iteration the reader sees --
        //  measured, the banner never reached the DesignSpec's log at all.
        if (verbosity >= 2)
        {
            std::cout << "\n  [dysonSimon1968] " << rname[jBed] << " -- bed on the"
                         " Dyson & Simon (1968) rate law\n"
                      << "    source:  " << DysonSimon1968::citation() << "\n"
                      << "    window:  " << DysonSimon1968::validityWindow() << "\n"
                      << "    route:   " << routeMsg << "\n"
                      << "    inlet:   T = " << std::fixed << std::setprecision(2) << T
                      << " K, P = " << std::setprecision(3) << b.P_atm << " atm, x(N2) "
                      << std::setprecision(5) << z_in[b.iN2] << ", x(H2) " << z_in[b.iH2]
                      << ", x(NH3) " << z_in[b.iNH3] << " -> V3 = " << std::setprecision(4)
                      << rin.rateIntrinsic_kmolNH3_per_m3bed_h << " kmol NH3/(m3 bed h)";
            if (b.eq39) std::cout << ", xi = " << rin.xi << ", Eq 40 = "
                                  << rin.rate_kmolNH3_per_m3bed_h;
            std::cout << "\n    activities: " << actBanner.str() << "\n";
            for (const auto& a : rin.announcements)
                std::cout << "    " << a << "\n";
            std::cout << "    " << AmmoniaRateResult::freshCatalystCaveat() << "\n\n";
        }
    }

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
            const scalar rj = bed[j]
                ? dysonSimonExtentRate(*bed[j], Tk, zz)                          // mol/(m^3 bed.s)
                : catFactor * law[j].netRate(thermo, Tk, conc, zz);              // mol/(m^3.s)
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
        if (hasBed)
        {
            //  The rate the bed is running at, in the paper's own unit, at
            //  every stored point -- the collapse of the rate toward
            //  equilibrium is the axial fact a student should be able to plot.
            scalar Ftot = 0.0;
            for (std::size_t i = 0; i < n; ++i) Ftot += std::max(y[i], 0.0);
            sVector zz(n, 0.0);
            if (Ftot > 0.0) for (std::size_t i = 0; i < n; ++i) zz[i] = std::max(y[i], 0.0) / Ftot;
            const AmmoniaRateResult r = dysonSimonEvaluate(*bed[jBed], Tk, zz);
            profile_.columns["r_NH3_kmol_m3_h"].push_back(r.rate_kmolNH3_per_m3bed_h);
            if (bed[jBed]->eq39) profile_.columns["xi"].push_back(r.xi);
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
    if (anyConcLaw) kpis_["tau_s"] = tau;        // liquid basis, as the single path
    kpis_["nReactions"]   = static_cast<scalar>(R);
    kpis_["nSteps"]       = static_cast<scalar>(nSteps);
    kpis_["F_in_kmol_h"]  = F_in_kmols * 3600.0;
    kpis_["F_out_kmol_h"] = F_out * 3600.0 / 1000.0;
    kpis_["T_out"]        = T_out;                 // RESULT when non-isothermal
    if (!isoT) { kpis_["T_max"] = T_max; kpis_["T_min"] = T_min;
                 kpis_["dT_rise"] = T_out - T; kpis_["hotSpot_dT"] = T_max - T; }
    for (std::size_t j = 0; j < R; ++j)
        kpis_["k_" + rname[j]] = bed[j]
            ? dysonSimonEvaluate(*bed[j], T, z_in).k                            // Eq 18 at the INLET T
            : law[j].kForward(T);                                               // at the INLET T

    // ---- WHAT A DYSON-SIMON BED PUBLISHES BEYOND THE MARCH -------------
    if (hasBed)
    {
        DysonSimonBed& b = *bed[jBed];
        const std::string locus = "pfr (dysonSimon1968)";
        kpis_.insert(bedInletKpis.begin(), bedInletKpis.end());

        //  Per-pass conversion of the N2 role and the outlet ammonia.
        const scalar N2_in = z_in[b.iN2] * F_in;
        kpis_["X_N2"]       = (N2_in > 0.0) ? (N2_in - F_i[b.iN2]) / N2_in : 0.0;
        kpis_["y_NH3_out"]  = z_out[b.iNH3];

        //  The rate at both ends, in the paper's unit: how far the bed has
        //  collapsed toward equilibrium is that ratio.
        const AmmoniaRateResult rin  = dysonSimonEvaluate(b, T,     z_in);
        const AmmoniaRateResult rout = dysonSimonEvaluate(b, T_out, z_out);
        kpis_["rate_in_kmolNH3_m3_h"]  = rin.rate_kmolNH3_per_m3bed_h;
        kpis_["rate_out_kmolNH3_m3_h"] = rout.rate_kmolNH3_per_m3bed_h;

        //  THE APPROACH TO EQUILIBRIUM OF THE EFFLUENT, as US 5,352,428
        //  defines it and as `equilibriumTemperatureOf` computes it: the T* at
        //  which the outlet gas would be at equilibrium under THIS LAW's own
        //  Ka (Gillespie & Beattie) and its own gammas -- minus the actual
        //  outlet T.  Positive = short of equilibrium.  It is measured against
        //  the rate law's equilibrium, NOT the package's Gibbs surface; the two
        //  disagree by a fraction of a percent in x(NH3) here, and a reader
        //  comparing this number against a gibbsReactor must know which
        //  equilibrium each is quoting.
        std::string approachNote;
        try
        {
            const AmmoniaRateContext cOut = dysonSimonContext(b, T_out, z_out);
            //  THE BRACKET IS SEARCHED, NOT GUESSED, AND IT IS CAPPED.  A gas
            //  carrying little ammonia is at equilibrium only far above its
            //  actual temperature (a 1.8 % NH3 gas at 200 bar: above 1100 K),
            //  so the upper end walks up in 100 K steps until Eq 19's
            //  imbalance changes sign.  The cap is the correlations' own:
            //  Eq 8's polynomial gamma(NH3) turns NEGATIVE near 1650 K and a
            //  negative activity makes the sign test meaningless, so the walk
            //  stops at 1500 K and the KPI is then honestly absent, announced.
            auto imbalance = [&](scalar Tq) -> scalar
            {
                AmmoniaRateContext cc = cOut;
                cc.T_K = Tq;
                const AmmoniaRateResult rq = DysonSimon1968::evaluateIntrinsic(cc);
                return rq.forwardTerm - rq.reverseTerm;
            };
            const scalar Tlo = std::max(300.0, T_out - 500.0);
            scalar Thi = T_out + 100.0;
            const scalar Tcap = 1500.0;
            const bool loPositive = imbalance(Tlo) > 0.0;
            while (Thi < Tcap && (imbalance(Thi) > 0.0) == loPositive) Thi += 100.0;
            const scalar Teq = DysonSimon1968::equilibriumTemperatureOf(cOut, Tlo, std::min(Thi, Tcap));
            kpis_["T_eq_outlet_K"] = Teq;
            kpis_["approach_K"]    = Teq - T_out;
        }
        catch (const std::exception& e)
        {
            approachNote = std::string("approach_K NOT published: ") + e.what();
            AdvisoryLog::instance().add("model", "warning", locus, approachNote);
        }

        //  Space velocity on the NORMAL basis every published ammonia GHSV
        //  uses: cubic metres of gas at 0 degC and 1 atm, as an ideal gas
        //  (R T_n / P_n per mole -- a convention, computed, not typed), per
        //  cubic metre of bed per hour.  Stage C's `spaceVelocity` is on the
        //  ACTUAL gas volume; this KPI is the one to set beside a datasheet.
        const scalar Vn_m3_per_mol = constant::R * 273.15 / units::atm_to_Pa;
        kpis_["GHSV_normal_h"] = F_in * Vn_m3_per_mol * 3600.0 / V_R;

        //  Residence time on the ACTUAL inlet gas, priced by the package's own
        //  equation of state, where one exists to price it.
        if (thermo.hasEos())
        {
            try
            {
                const scalar v_in = thermo.eos().molarVolume(T, P, z_in);   // m3/mol
                if (v_in > 0.0) kpis_["tau_gas_s"] = V_R / (F_in * v_in);
            }
            catch (const std::exception&) {}
        }

        if (b.eq39)
        {
            kpis_["xi_min"] = b.xiMin;
            kpis_["xi_max"] = b.xiMax;
            if (!b.interpolationNote.empty())
            {
                //  The law's own sentence quotes the two column values at the
                //  composition it was asked about, which differ per RK4 stage
                //  and per outer pass; the advisory states the FACT once and
                //  points at the KPIs that carry the numbers.
                std::ostringstream im;
                im << "[interpolated] Eq 39's effectiveness factor was LINEARLY"
                      " INTERPOLATED in pressure between two of Table I's three"
                      " columns at " << std::fixed << std::setprecision(3)
                   << b.P_atm << " atm -- Table I has no form in pressure, so"
                      " the interpolation is Choupo's choice and not the"
                      " paper's; the resulting xi along the bed is published as"
                      " xi_min / xi_max.";
                AdvisoryLog::instance().add("model", "info", locus, im.str());
            }
            if (b.nUnphysical > 0)
                AdvisoryLog::instance().add("model", "warning", locus,
                    "Eq 39 returned an effectiveness factor outside (0, 1] at "
                    + std::to_string(b.nUnphysical) + " of the evaluations the"
                    " march made, UNCLAMPED (first: " + b.firstUnphysical + ")");
        }

        if (verbosity >= 2)
        {
            std::cout << "\n  [dysonSimon1968] bed result\n"
                      << std::fixed
                      << "    X(N2 role)          " << std::setprecision(4) << (100.0 * kpis_["X_N2"]) << " %\n"
                      << "    y(NH3) out          " << std::setprecision(6) << z_out[b.iNH3] << "\n"
                      << "    rate in -> out      " << std::setprecision(4) << rin.rate_kmolNH3_per_m3bed_h
                      << " -> " << rout.rate_kmolNH3_per_m3bed_h << " kmol NH3/(m3 bed h)";
            if (rout.rate_kmolNH3_per_m3bed_h != 0.0)
                std::cout << "  (ratio " << std::setprecision(1)
                          << rin.rate_kmolNH3_per_m3bed_h / rout.rate_kmolNH3_per_m3bed_h << ")";
            std::cout << "\n";
            if (kpis_.count("approach_K"))
                std::cout << "    approach            outlet is at equilibrium (this law's own Ka) at T* = "
                          << std::setprecision(2) << kpis_["T_eq_outlet_K"] << " K, i.e. "
                          << std::setprecision(3) << kpis_["approach_K"]
                          << " K above the actual outlet T (US 5,352,428's definition)\n";
            else
                std::cout << "    approach            " << approachNote << "\n";
            std::cout << "    GHSV (normal basis) " << std::setprecision(1) << kpis_["GHSV_normal_h"]
                      << " Nm3/(m3 bed h)  [0 degC, 1 atm, ideal gas -- a convention]\n";
            if (kpis_.count("tau_gas_s"))
                std::cout << "    tau (actual gas)    " << std::setprecision(3) << kpis_["tau_gas_s"]
                          << " s  [inlet gas priced by the package's EoS]\n";
            if (b.eq39)
                std::cout << "    xi along the bed    " << std::setprecision(4) << b.xiMin
                          << " .. " << b.xiMax << "\n";
            std::cout << "\n";
        }
    }
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
