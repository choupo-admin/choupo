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

#include "unitOperations/flash/StreamEquilibrium.H"   // the ONE resolve-and-price home

#include <cmath>
#include <iomanip>
#include <iostream>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

namespace {

//  ---- THE DUTY IS PRICED ON THE SURFACE THE STREAMS ARE PRICED ON --------
//
//  THE DEFECT THIS EXISTS TO END (measured 2026-09-25).  Both terms of this
//  reactor's duty used to be sums of `h_pure_ig` -- IDEAL GAS -- while the
//  stream it produces is priced by the package, which may be a cubic EoS.
//  `ammoniaStaged01_yield` is the witness: its converter runs at 200 bar
//  under `fugacityModel SRK`, the energy report read dH = 53257.785726 kW
//  across it and the unit declared Q = 50979.639980 kW, a 104.468736 %
//  closure -- and that 2278.1457 kW gap was, to the last digit, the whole of
//  the plant's first-law residual (-2278.1394 kW, -1.3316 %).  Running the
//  SAME case with `fugacityModel idealGas` closed it at 100.00 % and
//  0.0000 kW, which is the proof that the gap is the departure function and
//  nothing else.  It is the family CLAUDE.md §6 names: THE STATE A UNIT
//  COMPUTES WITH IS NOT THE STATE ITS STREAMS CARRY -- here in its
//  simplest shape, two SURFACES for one unit, the shape `GibbsReactor` was
//  taken off on 2026-09-08 (Vitor's 1298dc0d5) and this unit was not.
//
//  WHY NOT SIMPLY `H_stream_formation`, which is what that commit used.
//  Because a third surface has been written since (2026-09-12, the feed
//  thermal-state slice): the energy report does NOT price a stream with
//  `H_stream_formation(T, P, vf, z)` when the stream has a two-phase split.
//  It resolves the state (`flashState::twoPhaseSplit`) and prices the
//  EQUILIBRIUM phases (`hOfState`), because the blend-by-z the other call
//  performs is exact only for a pure fluid -- the 5.509232 kW `column01`
//  paid for.  A duty that used the blend would agree with the report on
//  every single-phase stream and disagree on every two-phase one.  So this
//  asks the SAME question through the SAME call, and the two cannot part.
//
//  The three states this unit needs are priced by one function, and the
//  intermediate one is why the Hess split stays EXACT rather than becoming
//  an apportionment (ConversionReactor.H's own promise).
scalar priceState(scalar               T,
                  scalar               P,
                  const sVector&       z,
                  scalar               F,
                  bool                 pinned,
                  scalar               vfCarried,
                  const ThermoPackage& thermo,
                  const std::string&   locus,
                  std::vector<std::string>* notes)
{
    //  DEFERRED, NEVER LOGGED, and the reason is this unit's own (the
    //  `[rating]` comment that used to stand below): a recycle solves each
    //  unit against states it does not end on, so an advisory raised here
    //  reaches the result JSON of a CONVERGED run describing an inlet that
    //  run does not have.  The report raises the same note about the same
    //  stream at the answer, where it is true.  Here it is printed with the
    //  rest of the unit's console block, at the same verbosity, or not at all.
    std::string deferred;
    auto sp = flashState::twoPhaseSplit(T, P, z, pinned, vfCarried, thermo,
                                        locus, "model", &deferred);
    if (!deferred.empty() && notes) notes->push_back(locus + ": " + deferred);
    if (sp) return F * flashState::hOfState(*sp, T, P, z, thermo);
    //  Not a split: price the state the stream carries -- which is the
    //  `else` arm of `reporting/BalanceMath.H::streamH_elements`, verbatim.
    return F * thermo.H_stream_formation(T, P, vfCarried, z);
}

//  The whole duty, for both reaction paths.  ONE home: the single-reaction
//  and the multi-reaction branch differ only in how they reach `zout`.
struct ReactorDuty
{
    scalar Q_W      = 0.0;     //  H_out - H_in
    scalar Q_rxn_W  = 0.0;     //  H_out - H_mid   (the reaction, at T and P)
    scalar Q_sens_W = 0.0;     //  H_mid - H_in    (the FEED, heated to T)
    bool   ok       = false;
    std::vector<std::string> notes;
};

ReactorDuty reactorDuty(scalar               T,
                        scalar               T_feed,
                        scalar               P,
                        const sVector&       z,
                        scalar               F_in,
                        const sVector&       zout,
                        scalar               F_out,
                        bool                 pinned_in,
                        scalar               vf_in,
                        const ThermoPackage& thermo,
                        const std::string&   unitName)
{
    ReactorDuty d;
    const std::string inLocus  = "conversionReactor '" + unitName + "' inlet";
    const std::string outLocus = "conversionReactor '" + unitName + "' outlet";
    try
    {
        //  The INLET, on its own declared/resolved state.
        const scalar H_in  = priceState(T_feed, P, z, F_in,
                                        pinned_in, vf_in, thermo,
                                        inLocus, &d.notes);
        //  The FEED COMPOSITION carried to the reactor temperature.  It is
        //  not a stream and nothing else reads it; it exists so that the two
        //  published parts SUM to the duty identically instead of being
        //  apportioned.  When T_feed == T it is H_in to the last bit, so the
        //  sensible term is exactly zero -- the invariant the header states.
        const scalar H_mid = (T_feed == T)
                           ? H_in
                           : priceState(T, P, z, F_in, pinned_in, vf_in,
                                        thermo, inLocus, nullptr);
        //  The OUTLET, priced exactly as the stream this unit is about to
        //  publish will be priced: unpinned (this unit pins nothing) and
        //  carrying the inlet's vapour fraction (the F2 ruling below).
        const scalar H_out = priceState(T, P, zout, F_out,
                                        false, vf_in, thermo,
                                        outLocus, &d.notes);
        d.Q_sens_W = (H_mid - H_in)  * 1000.0;   //  kW -> W
        d.Q_rxn_W  = (H_out - H_mid) * 1000.0;
        d.Q_W      = (H_out - H_in)  * 1000.0;
        d.ok       = true;
    }
    catch (const std::exception&) { d.ok = false; }
    return d;
}

} // namespace

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
        return solveMultiReaction(dict, thermo, verbosity, F_in, T, T_feed, P,
                                  feedDict->lookupScalarOrDefault("vf", 1.0), z);

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

    //  THE DUTY IS AN ENTHALPY DIFFERENCE, NOT A HEAT OF REACTION.
    //
    //  `Q_kW` used to be xi * dH_rxn(T) and nothing else, so a reactor fed at
    //  389 K and held at 623 K reported a duty INVARIANT to its own feed
    //  temperature -- it answered "what does the reaction cost at T", which is
    //  not what a duty is.  Found on acetone03, where it read 470 kW against
    //  the paper's 960 kW and the gap was the feed nobody was heating.
    //
    //  What is computed now is the first law over the unit,
    //
    //      Q = H(outlet state) - H(inlet state),
    //
    //  published beside its two EXACT parts (Hess, not an apportionment):
    //  the reaction run at T_out, and the FEED heated from T_in to T_out.
    //  When T_in == T_out the sensible term is identically zero and Q is the
    //  reaction term alone.
    //
    //  EVERY H HERE IS THE PACKAGE'S (2026-09-25), through the one call the
    //  energy report uses on these same streams -- see the note at the head
    //  of this file.  Both terms used to be sums of `h_pure_ig`, so under a
    //  cubic EoS the unit and the report priced one reactor on two surfaces.
    //
    //  Skip the whole duty if ANY species present lacks an enthalpy route --
    //  the sensible term needs the inerts too, not just the reactants, so the
    //  balance is over everything that flows.
    //
    //  THE HEAT OF REACTION AND THE REACTION TERM OF THE DUTY ARE TWO
    //  DIFFERENT NUMBERS, and after 2026-09-25 they are two different numbers
    //  in the output as well.  `dH_rxn(T) = SUM nu_i h_i(T)` on the
    //  ideal-gas/formation rung is the DOCTRINE's definition (CLAUDE.md §5,
    //  ONE enthalpy base) and stays exactly as it was; `Q_reaction_kW` is what
    //  running that reaction costs THIS fluid at THIS (T, P), which under a
    //  cubic EoS is not the same thing.  They coincide, to the last digit,
    //  whenever the package is an ideal gas.
    const scalar vf_in     = feedDict->lookupScalarOrDefault("vf", 1.0);
    const bool   pinned_in = feedDict->lookupScalarOrDefault("phasePinned", 0.0) > 0.5;
    const std::string unitName = dict->lookupWordOrDefault("name", "conversionReactor");

    scalar dHrxn = 0.0;       // J / mol of extent
    bool   haveRxnHeat = true;
    try
    {
        for (std::size_t i = 0; i < n; ++i)
            if (nu[i] != 0.0) dHrxn += nu[i] * thermo.comp(i).h_pure_ig(T);
    }
    catch (const std::exception&) { haveRxnHeat = false; }

    const ReactorDuty duty = reactorDuty(T, T_feed, P, z, F_in, zout, F_out,
                                         pinned_in, vf_in, thermo, unitName);
    const bool   haveDuty = duty.ok;
    const scalar Q_rxn_W  = duty.Q_rxn_W;    // W (<0 exothermic)
    const scalar Q_sens_W = duty.Q_sens_W;   // W
    const scalar Q_W      = duty.Q_W;        // W

    // ---- Outlet stream ----------------------------------------------
    //  THE OUTLET CARRIES THE INLET'S PHASE STATE (ruled 2026-08-24, the
    //  benchmark's F2 posture question).  This unit is a stoichiometric
    //  bookkeeper with NO phase model: it used to hard-stamp vf = 1 ("gas
    //  reactor"), which made a perfectly-authored liquid-phase duty (the
    //  esterification at 350 K) show a spurious ENERGY BALANCE FAILED
    //  banner equal to the latent heat of the stamp -- the report priced
    //  an outlet vapour that never existed.  A unit that does not model
    //  phase must not INVENT one; it forwards what it was handed, and a
    //  downstream flash owns any split.  The DUTY is priced on exactly this
    //  state, by the rule the energy report will apply to this same stream
    //  (2026-09-25) -- so a liquid inlet no longer costs the ledger its
    //  latent heat, and the `[rating]` line that used to warn about that is
    //  gone with the thing it warned about.
    produced_.clear();
    ProcessStream s;
    s.name = "out";
    s.F = F_out; s.T = T; s.P = P; s.z = zout;
    s.vf = vf_in;                             // carried, never invented
    produced_.push_back(s);

    kpis_["conversion"]    = X;
    kpis_["extent_kmol_h"] = xi * 3600.0;
    kpis_["F_in_kmol_h"]   = F_in * 3600.0;
    kpis_["F_out_kmol_h"]  = F_out * 3600.0;
    kpis_["T"]             = T;
    if (haveRxnHeat) kpis_["dHrxn_kJ_per_mol"] = dHrxn / 1000.0;
    if (haveDuty)
    {
        kpis_["Q_kW"]             = Q_W / 1000.0;
        kpis_["Q_reaction_kW"]    = Q_rxn_W / 1000.0;
        kpis_["Q_sensible_kW"]    = Q_sens_W / 1000.0;
    }

    if (verbosity >= 2)
    {
        std::cout << "ConversionReactor:  limiting " << limiting
                  << "   X = " << std::fixed << std::setprecision(3) << X
                  << "   extent = " << std::setprecision(4) << (xi * 3600.0) << " kmol/h"
                  << "   (isothermal at " << T << " K)\n";
        if (haveRxnHeat)
            std::cout << "  dH_rxn = " << std::setprecision(1) << (dHrxn / 1000.0)
                      << " kJ/mol  (ideal-gas/formation rung -- the reaction's"
                         " own property)\n";
        if (haveDuty)
        {
            std::cout << "  duty Q = " << std::setprecision(1) << (Q_W / 1000.0)
                      << " kW" << (Q_W < 0 ? "  (net removed)\n" : "  (net added)\n");
            //  Print the split whenever the feed is NOT already at T: a single
            //  number cannot show that most of a duty is preheat.
            if (T_feed != T)
                std::cout << "    = reaction " << (Q_rxn_W / 1000.0) << " kW at "
                          << std::setprecision(2) << T << " K  +  sensible "
                          << std::setprecision(1) << (Q_sens_W / 1000.0)
                          << " kW heating the feed from " << std::setprecision(2)
                          << T_feed << " K\n";
            std::cout << "    priced on the package's own enthalpy surface --"
                         " the SAME rule the energy report prices these streams"
                         " with (resolve the state, then price it)\n";
            for (const auto& note : duty.notes)
                std::cout << "    [state] " << note << "\n";
            std::cout << "\n";
        }
        else
            std::cout << "  (duty not reported -- a species present has no"
                         " enthalpy route on the elements datum)\n\n";
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
                                          scalar               T_feed,
                                          scalar               P,
                                          scalar               vf_in,
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
    //  The per-reaction dH_rxn is the REACTION's own property and keeps the
    //  doctrine's rung (CLAUDE.md §5); the DUTY below is the first law over
    //  the unit on the package's own enthalpy surface.  See the note at the
    //  head of this file for why the two are different numbers and when they
    //  coincide.
    sVector dHrxn(R, 0.0);
    bool haveRxnHeat = true;
    try {
        for (std::size_t j = 0; j < R; ++j)
            for (std::size_t i = 0; i < n; ++i)
                if (nu[j][i] != 0.0) dHrxn[j] += nu[j][i] * thermo.comp(i).h_pure_ig(T);
    } catch (const std::exception&) { haveRxnHeat = false; }

    //  The duty, by the SAME one home the single-reaction path uses.  The two
    //  branches differ only in how they reached `zout`.
    auto feedDict2 = dict->subDict("feed");
    const bool pinned_in =
        feedDict2->lookupScalarOrDefault("phasePinned", 0.0) > 0.5;
    const std::string unitName =
        dict->lookupWordOrDefault("name", "conversionReactor");
    const ReactorDuty duty = reactorDuty(T, T_feed, P, z, F_in, zout, F_out,
                                         pinned_in, vf_in, thermo, unitName);
    const bool   haveDuty = duty.ok;
    const scalar Q_rxn_W  = duty.Q_rxn_W;
    const scalar Q_sens_W = duty.Q_sens_W;
    const scalar Q_W      = duty.Q_W;

    // ---- Outlet stream --------------------------------------------------
    produced_.clear();
    ProcessStream out;
    out.name = "out";
    //  Carried from the inlet, never invented -- the F2 ruling (see the
    //  single-reaction site's comment).
    out.F = F_out; out.T = T; out.P = P; out.z = zout; out.vf = vf_in;
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
        if (haveRxnHeat) kpis_["dHrxn_" + rname[j] + "_kJ_per_mol"] = dHrxn[j] / 1000.0;
    }
    if (haveDuty)
    {
        kpis_["Q_kW"]          = Q_W / 1000.0;
        kpis_["Q_reaction_kW"] = Q_rxn_W / 1000.0;
        kpis_["Q_sensible_kW"] = Q_sens_W / 1000.0;
    }

    if (verbosity >= 2)
    {
        std::cout << "ConversionReactor:  " << R << " reaction(s), extents SPECIFIED "
                  << "(isothermal at " << T << " K)\n";
        for (std::size_t j = 0; j < R; ++j)
            std::cout << "  " << std::setw(12) << std::left << rname[j] << std::right
                      << "  extent = " << std::fixed << std::setprecision(5)
                      << (xi[j] * 3600.0) << " kmol/h\n";
        if (haveDuty)
        {
            std::cout << "  net duty Q = " << std::setprecision(2) << (Q_W / 1000.0) << " kW"
                      << (Q_W < 0 ? "  (net removed)\n" : "  (net added)\n");
            if (T_feed != T)
                std::cout << "    = reaction " << (Q_rxn_W / 1000.0) << " kW at " << T
                          << " K  +  sensible " << (Q_sens_W / 1000.0)
                          << " kW heating the feed from " << T_feed << " K\n";
            std::cout << "    priced on the package's own enthalpy surface --"
                         " the SAME rule the energy report prices these streams"
                         " with (resolve the state, then price it)\n";
            for (const auto& note : duty.notes)
                std::cout << "    [state] " << note << "\n";
            std::cout << "\n";
        }
        else std::cout << "  (duty not reported -- a species present has no"
                          " enthalpy route on the elements datum)\n\n";
    }
    return 0;
}

} // namespace Choupo
