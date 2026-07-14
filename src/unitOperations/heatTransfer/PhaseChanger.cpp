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

#include "PhaseChanger.H"
#include "unitOperations/flash/IsothermalFlash.H"
#include "unitOperations/heatTransfer/htc/PhaseChangeHTC.H"
#include "materials/MaterialRegistry.H"
#include "solver/NewtonRaphson.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

namespace {

// Saturation temperature [K] at pressure P for the dome-crossing solve.
//   * pure-fluid route (IF97 et al., effectively-pure flagged component):
//       the kernel's Tsat(P) -- closed form, frozen.
//   * generic route: invert the DOMINANT component's vapour-pressure curve
//       Psat_dom(T) = P by bisection (a pure / dominant-component dome).
// For a genuine multicomponent mixture the dome has WIDTH in T (bubble..dew),
// so the saturated / quality targets are solved on the flash directly and this
// single Tsat is used only as a bracket centre.
scalar saturationT(const ThermoPackage& thermo, scalar P_Pa, const sVector& z)
{
    // Dominant component.
    std::size_t dom = 0;
    for (std::size_t i = 1; i < thermo.n(); ++i)
        if (z[i] > z[dom]) dom = i;

    if (thermo.hasPureFluid(dom) && ThermoPackage::isEffectivelyPure(z, dom))
        return thermo.pureFluid(dom).T_sat(P_Pa);

    if (!thermo.comp(dom).hasVaporPressure())
        throw std::runtime_error(
            "phaseChanger: dominant component '" + thermo.comp(dom).name()
            + "' has no vapour-pressure model -- cannot locate the saturation "
              "dome.  Add an Antoine block to its .dat or flag a pureFluids "
              "kernel.");

    const auto& vp = thermo.comp(dom).vp();
    scalar lo = 150.0, hi = 1200.0;
    for (int it = 0; it < 90; ++it)
    {
        const scalar mid = 0.5 * (lo + hi);
        if (vp.Psat_Pa(mid) < P_Pa) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
}

// Dome-aware molar enthalpy [J/mol] of the flashed state at (T, P).  Uses the
// EQUILIBRIUM phase compositions weighted by the split -- the very enthalpies
// the produced liquid / vapour streams carry (mirrors the flash duty kernel).
scalar streamEnthalpy(const ThermoPackage& thermo, const FlashSolution& sol,
                      scalar T, scalar P, const sVector& z)
{
    const scalar bV = sol.V_over_F;
    if (bV <= 1.0e-9)  return thermo.H_stream_formation(T, P, 0.0, z);
    if (bV >= 1.0 - 1.0e-9) return thermo.H_stream_formation(T, P, 1.0, z);
    return (1.0 - bV) * thermo.H_stream_formation(T, P, 0.0, sol.x)
         +        bV  * thermo.H_stream_formation(T, P, 1.0, sol.y);
}

} // anonymous namespace

int PhaseChanger::solve(const DictPtr& dict,
                        const ThermoPackage& thermo,
                        int verbosity)
{
    auto feedDict = dict->subDict("feed");
    auto operDict = dict->subDict("operation");
    auto compDict = dict->subDict("composition");

    const scalar F    = feedDict->lookupScalar("F", Dims::molarFlow);
    const scalar T_in = feedDict->lookupScalar("T", Dims::temperature);
    const scalar P_in = feedDict->lookupScalar("P", Dims::pressure);

    const std::size_t n = thermo.n();
    sVector z(n, 0.0);
    scalar zsum = 0.0;
    for (const auto& key : compDict->keys())
    {
        const std::size_t i = thermo.indexOf(key);
        z[i] = compDict->lookupScalar(key);
        zsum += z[i];
    }
    if (zsum <= 0.0)
        throw std::runtime_error("phaseChanger: feed composition is empty");
    for (auto& v : z) v /= zsum;

    // ---- Outlet pressure: held from inlet unless set explicitly ----------
    const scalar P_out = operDict->found("P")
                       ? operDict->lookupScalar("P", Dims::pressure)
                       : P_in;

    // =====================================================================
    //  SEVENTH resolution: `model geometry;` -- a film-condensation HTC
    //  builds the duty FROM the surface geometry + a coolant, instead of one
    //  of the six outlet-coordinate specs.  Gated behind the model word so
    //  the six existing spec modes (and their goldens) stay byte-stable.
    // =====================================================================
    const std::string model = dict->lookupWordOrDefault("model", "");
    if (model == "geometry")
    {
        return solveGeometry(operDict, thermo, verbosity,
                             F, T_in, P_in, P_out, z);
    }

    // ---- Pick EXACTLY ONE outlet coordinate (DOF guard) ------------------
    const bool hasQ      = operDict->found("Q");
    const bool hasState  = operDict->found("outletState");
    const bool hasQual   = operDict->found("outletQuality");
    const bool hasSup    = operDict->found("superheat");
    const bool hasSub    = operDict->found("subcool");
    const bool hasToutK  = operDict->found("outletT");

    const int nCoord = (hasQ ? 1 : 0) + (hasState ? 1 : 0) + (hasQual ? 1 : 0)
                     + (hasSup ? 1 : 0) + (hasSub ? 1 : 0) + (hasToutK ? 1 : 0);
    if (nCoord != 1)
        throw std::runtime_error(
            "phaseChanger: pick exactly ONE outlet coordinate among "
            "Q | outletState | outletQuality | superheat | subcool | outletT; "
            "P is held (or set P).  The rest are results.  (got "
            + std::to_string(nCoord) + " coordinates)");

    // ---- A flash at (T, P_out) over z (reused everywhere) ----------------
    auto flashAt = [&](scalar T) -> FlashSolution
    {
        FlashInput in; in.F = 1.0; in.T = T; in.P = P_out; in.z = z;
        FlashOptions opts; opts.verbosity = 0;
        return IsothermalFlash::solveCore(in, thermo, opts);
    };

    // Dominant component + pure-dome detection.  On a PURE / dominant-component
    // dome the saturation plateau is a single T = Tsat with vf as the free
    // coordinate (H spans [h_f, h_g] at constant T).  A multicomponent dome has
    // WIDTH in T (bubble..dew), so vf(T) is smooth there.  The two need
    // different solves for the duty and vapour-fraction targets.
    std::size_t domIdx = 0;
    for (std::size_t i = 1; i < n; ++i) if (z[i] > z[domIdx]) domIdx = i;
    const bool pureDome = ThermoPackage::isEffectivelyPure(z, domIdx);

    // Temperature floor for the outer Newton.  A pure-fluid kernel (IF97) has a
    // hard low-T validity edge (the triple point); keep the search inside it so
    // a bisection probe never reaches into the kernel's forbidden region.
    scalar T_floor = 150.0;
    if (thermo.hasPureFluid(domIdx) && pureDome)
        T_floor = 274.0;

    // ---- Inlet enthalpy [J/mol] (flash the feed at its own state) --------
    const scalar vf_in_decl = feedDict->lookupScalarOrDefault("vf", -1.0);
    scalar H_in;
    {
        FlashInput fin; fin.F = 1.0; fin.T = T_in; fin.P = P_in; fin.z = z;
        FlashOptions fopts; fopts.verbosity = 0;
        FlashSolution fsol = IsothermalFlash::solveCore(fin, thermo, fopts);
        H_in = streamEnthalpy(thermo, fsol, T_in, P_in, z);
    }

    // ---- Resolve the single coordinate -> (T_out, mode label) ------------
    scalar T_out = T_in;
    std::string specMode;       // human label for the report
    bool selfTarget = false;    // true = Q solved to hit the unit's own outlet
    // On a PURE / dominant-component dome the saturation plateau is a single
    // T = Tsat and vf is the FREE coordinate -- a flash at Tsat returns an
    // AMBIGUOUS vf (it lands on whichever side it converges to).  When a
    // vapour-fraction target is requested on a pure dome we therefore CARRY
    // the requested vf forward explicitly rather than reading it back.  -1 =
    // not forced (read vf from the converged flash, the normal case).
    scalar vf_forced = -1.0;

    if (hasQ)
    {
        const scalar Q_W       = operDict->lookupScalar("Q", Dims::power);
        const scalar F_mol_s   = F * 1000.0;
        const scalar Q_per_mol = Q_W / F_mol_s;
        const scalar H_target  = H_in + Q_per_mol;
        specMode = "Q (given) -> T_out, vf_out (results)";

        // PURE dome: the target enthalpy may land ON the plateau (H_target in
        // [h_f, h_g] at Tsat), where T is fixed and vf is the free coordinate.
        // A single Newton on T cannot represent that (H(T) is a step at Tsat),
        // so test the plateau FIRST; only outside it do we Newton on T in the
        // single-phase region.
        bool resolved = false;
        if (pureDome)
        {
            const scalar Tsat = saturationT(thermo, P_out, z);
            // Saturated-liquid / saturated-vapour enthalpies bracketing the
            // plateau.  Evaluated with a tiny step INTO the two-phase region so
            // the dome-aware split (h = (1-vf)h_f + vf h_g) is exercised --
            // H_stream at exactly vf = 1 on the saturation line would read the
            // LIQUID branch (p == psat routes to region 1) and miss the latent
            // heat.  The linear extrapolation back to vf = 0 / 1 recovers the
            // true endpoints.
            const scalar eps  = 1.0e-4;
            const scalar h_lo = thermo.H_stream_formation(Tsat, P_out, eps,       z);
            const scalar h_hi = thermo.H_stream_formation(Tsat, P_out, 1.0 - eps, z);
            const scalar h_f  = (h_lo - eps * h_hi) / (1.0 - 2.0 * eps);
            const scalar h_g  = (h_hi - eps * h_lo) / (1.0 - 2.0 * eps);
            if (H_target >= h_f - 1.0e-3 && H_target <= h_g + 1.0e-3)
            {
                T_out     = Tsat;
                vf_forced = std::clamp((H_target - h_f) / (h_g - h_f), 0.0, 1.0);
                resolved  = true;
            }
        }

        if (!resolved)
        {
            // Single-phase region (sub-cooled liquid or super-heated vapour):
            // H(T) is smooth and monotone increasing -> Newton on T.
            auto f  = [&](scalar T) {
                return streamEnthalpy(thermo, flashAt(T), T, P_out, z) - H_target;
            };
            auto df = [&](scalar T) {
                const scalar dT = 0.25;
                return (f(T + dT) - f(T - dT)) / (2.0 * dT);
            };
            solver::NROptions o;
            o.tolerance = 1.0; o.maxIter = 60; o.lower = T_floor; o.upper = 1500.0;
            o.bracket = true; o.monotoneIncreasing = true; o.maxStep = 60.0;
            o.onIter = [this](const solver::NRTrace& tr){ recordResidual(std::abs(tr.f)); };
            auto r = solver::newton1D(f, df, T_in, o);
            if (!r.converged)
                throw std::runtime_error("phaseChanger: duty-mode Newton on "
                    "T_out did not converge (check Q / F are physical)");
            T_out = r.x;
        }
    }
    else if (hasToutK)
    {
        T_out = operDict->lookupScalar("outletT", Dims::temperature);
        specMode = "outletT (given) -> Q (result)";
        selfTarget = true;
    }
    else if (hasSup || hasSub)
    {
        const scalar Tsat = saturationT(thermo, P_out, z);
        if (hasSup)
        {
            const scalar dK = operDict->lookupScalar("superheat");
            T_out = Tsat + dK;
            specMode = "superheat (given) -> Q (result)";
        }
        else
        {
            const scalar dK = operDict->lookupScalar("subcool");
            T_out = Tsat - dK;
            specMode = "subcool (given) -> Q (result)";
        }
        selfTarget = true;
    }
    else  // hasState or hasQual -> a vapour-fraction target
    {
        scalar vf_target = 0.0;
        if (hasQual)
        {
            vf_target = operDict->lookupScalar("outletQuality");
            if (vf_target < 0.0 || vf_target > 1.0)
                throw std::runtime_error("phaseChanger: outletQuality must be "
                    "in [0,1] (got " + std::to_string(vf_target) + ")");
            specMode = "outletQuality (given) -> Q (result)";
        }
        else
        {
            const std::string st = operDict->lookupWord("outletState");
            if (st == "saturatedVapour")        vf_target = 1.0;
            else if (st == "saturatedLiquid")   vf_target = 0.0;
            else if (st == "subcooledLiquid" || st == "superheatedVapour")
            {
                // These are single-phase states OUTSIDE the dome -- they need a
                // delta (subcool / superheat) to be located.  Refuse loudly
                // rather than silently snap to the dome edge.
                throw std::runtime_error(
                    "phaseChanger: outletState '" + st + "' is OUTSIDE the dome "
                    "and needs a distance from saturation -- use 'superheat "
                    "<K>;' (for superheatedVapour) or 'subcool <K>;' (for "
                    "subcooledLiquid) instead, which set the coordinate "
                    "directly.");
            }
            else
                throw std::runtime_error(
                    "phaseChanger: unknown outletState '" + st + "' (supported: "
                    "saturatedVapour, saturatedLiquid; for the single-phase "
                    "states use superheat / subcool)");
            specMode = "outletState " + st + " (given) -> Q (result)";
        }
        selfTarget = true;

        // For a PURE / dominant-component dome the saturation plateau is at a
        // single T = Tsat and vf is the free coordinate there (vf(T) is a step,
        // not smooth -- Newton-on-T would fail).  Set T at Tsat directly.  For a
        // genuine multicomponent dome (width in T), Newton on T for
        // vf(T) = target is well-posed (bubble..dew).
        if (pureDome)
        {
            T_out     = saturationT(thermo, P_out, z);
            vf_forced = vf_target;   // vf is the free coordinate at Tsat
        }
        else
        {
            // vf(T) for a multicomponent mixture rises monotonically from 0
            // (below the bubble point) to 1 (above the dew point) over the dome.
            // OUTSIDE the dome it is dead-flat (0 or 1), so a Newton started off
            // the dome stalls on a zero derivative.  Scan for the narrow
            // sign-changing bracket FIRST, then drive Newton (with bisection
            // fall-back) inside it.
            auto fvf = [&](scalar T){ return flashAt(T).V_over_F - vf_target; };
            auto dvf = [&](scalar T){
                const scalar dT = 0.1;
                return (fvf(T + dT) - fvf(T - dT)) / (2.0 * dT);
            };

            const scalar Tc = saturationT(thermo, P_out, z);   // dome centre
            scalar lo = -1.0, hi = -1.0;
            scalar Tprev = Tc - 120.0, fprev = fvf(Tprev);
            const scalar dT_scan = 2.0;
            for (scalar T = Tprev + dT_scan; T <= Tc + 120.0; T += dT_scan)
            {
                const scalar fcur = fvf(T);
                if (fprev * fcur <= 0.0) { lo = Tprev; hi = T; break; }
                Tprev = T; fprev = fcur;
            }
            if (lo < 0.0)
                throw std::runtime_error("phaseChanger: could not bracket the "
                    "vapour-fraction target on the dome (quality unreachable at "
                    "this P?)");

            solver::NROptions o;
            o.tolerance = 1.0e-7; o.maxIter = 80;
            o.lower = lo; o.upper = hi;
            o.bracket = true; o.monotoneIncreasing = true;
            o.maxStep = (hi - lo);
            o.onIter = [this](const solver::NRTrace& tr){ recordResidual(std::abs(tr.f)); };
            auto r = solver::newton1D(fvf, dvf, 0.5 * (lo + hi), o);
            if (!r.converged)
                throw std::runtime_error("phaseChanger: vf-target Newton on "
                    "T_out did not converge");
            T_out = r.x;
        }
    }

    // ---- Final flashed outlet state at (T_out, P_out) --------------------
    FlashSolution sol = flashAt(T_out);
    scalar vf_out, H_out;
    if (vf_forced >= 0.0)
    {
        // Pure dome: vf is the free coordinate at Tsat.  Build the saturated
        // mixture enthalpy from the dome-aware H_stream (h = (1-vf)h_f + vf h_g,
        // which the IF97 / generic two-phase route handles internally).
        vf_out = std::clamp(vf_forced, 0.0, 1.0);
        H_out  = thermo.H_stream_formation(T_out, P_out, vf_out, z);
    }
    else
    {
        vf_out = std::clamp(sol.V_over_F, 0.0, 1.0);
        H_out  = streamEnthalpy(thermo, sol, T_out, P_out, z);
    }

    // ---- Duty (always a RESULT) -----------------------------------------
    const scalar Q_W  = F * 1000.0 * (H_out - H_in);    // W
    const scalar Q_kW = Q_W / 1000.0;

    // Latent / sensible split: the latent share is the part associated with
    // the vapour-fraction change across the unit; the rest is sensible.
    scalar vf_in_eff;
    {
        FlashSolution fs = flashAt(T_in);   // feed re-flashed at the SAME P_out
        // (use the genuine inlet state if declared single-phase)
        vf_in_eff = (vf_in_decl >= 0.0) ? std::clamp(vf_in_decl, 0.0, 1.0)
                                        : std::clamp(fs.V_over_F, 0.0, 1.0);
    }
    // Latent duty: vaporise/condense the changed fraction at saturation.
    // h_g - h_f is the molar latent heat at Tsat -- evaluated with a tiny step
    // INTO the two-phase region (the same reason as the plateau bracket: vf = 1
    // exactly on the saturation line would read the liquid branch).
    const scalar Tsat = saturationT(thermo, P_out, z);
    scalar latent_kW = 0.0;
    {
        const scalar eps  = 1.0e-4;
        const scalar h_lo = thermo.H_stream_formation(Tsat, P_out, eps,       z);
        const scalar h_hi = thermo.H_stream_formation(Tsat, P_out, 1.0 - eps, z);
        const scalar latent_molar = (h_hi - h_lo) / (1.0 - 2.0 * eps);
        const scalar dvf = vf_out - vf_in_eff;
        latent_kW = F * 1000.0 * dvf * latent_molar / 1000.0;
    }
    const scalar sensible_kW = Q_kW - latent_kW;

    // ---- Direction + regime label ---------------------------------------
    std::string regime;
    if (vf_out <= 1.0e-6)            regime = "subcooled / saturated liquid";
    else if (vf_out >= 1.0 - 1.0e-6) regime = "superheated / saturated vapour";
    else                             regime = "wet (two-phase, 0 < vf < 1)";

    std::string role;
    if      (Q_W >  1.0e-6) role = (vf_out >= 1.0 - 1.0e-6 ? "boiler"
                                    : (vf_out > 1.0e-6 ? "partial boiler" : "heater"));
    else if (Q_W < -1.0e-6) role = (vf_out <= 1.0e-6 ? "condenser"
                                    : (vf_out < 1.0 - 1.0e-6 ? "partial condenser" : "cooler"));
    else                    role = "isenthalpic (no duty)";

    // ---- Report ----------------------------------------------------------
    if (verbosity >= 2)
    {
        std::cout << "\n==========================  PhaseChanger Result  ====================\n"
                  << "  Spec mode:       " << specMode << "\n";
        if (selfTarget)
            std::cout << "  SELF-TARGET:     Q was SOLVED to land the outlet on the\n"
                      << "                   declared spec (built-in inverse solve; no\n"
                      << "                   outerDict / variables needed).\n";
        std::cout << "  Role:            " << role << "\n"
                  << "  Outlet regime:   " << regime << "\n"
                  << "  P_out:           " << std::fixed << std::setprecision(4)
                  << (P_out / 1.0e5) << "  bar  ("
                  << (operDict->found("P") ? "set" : "held from inlet") << ")\n"
                  << "  Tsat(P_out):     " << std::fixed << std::setprecision(3)
                  << Tsat << "  K  ( " << (Tsat - 273.15) << " degC )\n"
                  << "  T_in:            " << std::fixed << std::setprecision(3)
                  << T_in  << "  K  ( " << (T_in  - 273.15) << " degC )\n"
                  << "  T_out:           " << std::fixed << std::setprecision(3)
                  << T_out << "  K  ( " << (T_out - 273.15) << " degC )"
                  << (selfTarget ? "  <- result" : "  <- result") << "\n"
                  << "  vf_in:           " << std::fixed << std::setprecision(5)
                  << vf_in_eff << "\n"
                  << "  vf_out:          " << std::fixed << std::setprecision(5)
                  << vf_out << "   <- result\n"
                  << "  H_in:            " << std::scientific << std::setprecision(5)
                  << H_in  << "  J/mol\n"
                  << "  H_out:           " << H_out << "  J/mol\n"
                  << "  DUTY (result):   " << std::fixed << std::setprecision(4)
                  << Q_kW << "  kW    (+ = added, - = removed)\n"
                  << "     latent:       " << std::fixed << std::setprecision(4)
                  << latent_kW   << "  kW\n"
                  << "     sensible:     " << std::fixed << std::setprecision(4)
                  << sensible_kW << "  kW\n"
                  << "=====================================================================\n\n";
    }

    // ---- Produced stream -------------------------------------------------
    produced_.clear();
    ProcessStream out;
    out.name = "out";
    out.F    = F;
    out.T    = T_out;
    out.P    = P_out;
    out.z    = z;
    out.vf   = vf_out;
    produced_.push_back(out);

    // ---- KPIs ------------------------------------------------------------
    kpis_.clear();
    kpis_["Q"]           = Q_W;            // SI canonical (W), the RESULT duty
    kpis_["Q_kW"]        = Q_kW;
    kpis_["Q_latent_kW"] = latent_kW;
    kpis_["Q_sensible_kW"] = sensible_kW;
    kpis_["T_in"]        = T_in;
    kpis_["T_out"]       = T_out;
    kpis_["Tsat"]        = Tsat;
    kpis_["vf_in"]       = vf_in_eff;
    kpis_["vf_out"]      = vf_out;
    kpis_["F"]           = F;
    kpis_["P"]           = P_out;

    return 0;
}

// ===========================================================================
//  model geometry  --  film-condensation HTC -> duty
// ===========================================================================
//
//  The duty is NOT specified: it EMERGES from the condensing film coefficient
//  (Nusselt 1916 laminar film), the wall, and the coolant, exactly as a real
//  condenser does.  The condensing-side dT_film = Tsat - T_wall and the
//  coolant-side dT both depend on the (unknown) wall temperature, so we solve
//  a 1-D energy balance at the wall:
//
//      f(T_wall) = h_pc(dT_film) * dT_film  -  U_rest * (T_wall - T_cool) = 0
//      dT_film   = Tsat - T_wall
//      1/U_rest  = 1/h_coolant + t_wall / k_wall   (per unit area)
//
//  h_pc is the Nusselt film coefficient evaluated at the CURRENT dT_film with
//  the film properties at T_f = (Tsat + T_wall)/2 (re-evaluated each iter).
//  The root is bracketed in (T_cool, Tsat) -> robust (bisection fall-back).
//  This whole solve sits inside ONE flash evaluation -- it is NOT interleaved
//  with the recycle tear.  Then Q = h_pc * A * dT_film and the outlet is the
//  dome-flash at that Q (the existing duty path).
//
//  References: Nusselt (1916); Incropera & DeWitt, Fund. of Heat & Mass
//  Transfer, Ch. 10 (Ex. 10.3 vertical plate, Ex. 10.4 horizontal tube).
//
int PhaseChanger::solveGeometry(const DictPtr& operDict,
                                const ThermoPackage& thermo,
                                int verbosity,
                                scalar F, scalar T_in, scalar P_in,
                                scalar P_out, const sVector& z)
{
    const std::size_t n = thermo.n();

    // -- BOILING branch.  A `boiling { ... }` block routes the geometry-mode
    //    duty through the Rohsenow nucleate-boiling flux (student-supplied
    //    surface-fluid C_sf + citation -- no default, +/-100% scatter) with
    //    the Zuber CHF as the HARD burnout ceiling.  The condensation branch
    //    (NusseltFilm) continues below for a `coolant{}` block.
    if (operDict->found("boiling"))
        return solveBoilingGeometry(operDict, thermo, verbosity,
                                    F, T_in, P_in, P_out, z);

    if (!operDict->found("geometry"))
        throw std::runtime_error("phaseChanger(geometry): a `geometry { ... }` "
            "block is required (orientation, charLength/tubeOD, tubeL, nTubes, "
            "wall).");
    if (!operDict->found("coolant"))
        throw std::runtime_error("phaseChanger(geometry): a `coolant { T_in; h; }` "
            "block is required (the cold-side temperature and film coefficient).");

    auto g    = operDict->subDict("geometry");
    auto cool = operDict->subDict("coolant");

    // -- geometry -----------------------------------------------------------
    const std::string orientation =
        g->lookupWordOrDefault("orientation", "horizontalTube");
    const bool horiz = (orientation == "horizontalTube");

    // Characteristic length: tube DIAMETER for a horizontal tube, the vertical
    // HEIGHT (tubeL / charLength) for a vertical surface.
    scalar charLength = 0.0, tubeOD = 0.0, tubeID = 0.0, tubeL = 0.0;
    const int nTubes = static_cast<int>(g->lookupScalarOrDefault("nTubes", 1.0));
    if (horiz)
    {
        tubeOD = g->lookupScalar("tubeOD", Dims::length);
        charLength = tubeOD;
        tubeL = g->lookupScalar("tubeL", Dims::length);
        // Inner diameter from an explicit tubeID, else from a wall thickness.
        if (g->found("tubeID")) tubeID = g->lookupScalar("tubeID", Dims::length);
        else if (g->found("wallThickness"))
            tubeID = tubeOD - 2.0 * g->lookupScalar("wallThickness", Dims::length);
        else tubeID = tubeOD;   // thin-wall: handled below (t_wall ~ 0)
    }
    else
    {
        // vertical plate / tube: charLength is the height.
        charLength = g->found("charLength")
            ? g->lookupScalar("charLength", Dims::length)
            : g->lookupScalar("tubeL", Dims::length);
        tubeL = charLength;
        if (g->found("tubeOD")) tubeOD = g->lookupScalar("tubeOD", Dims::length);
        if (g->found("tubeID")) tubeID = g->lookupScalar("tubeID", Dims::length);
        else if (tubeOD > 0.0 && g->found("wallThickness"))
            tubeID = tubeOD - 2.0 * g->lookupScalar("wallThickness", Dims::length);
    }
    if (charLength <= 0.0 || tubeL <= 0.0 || nTubes <= 0)
        throw std::runtime_error("phaseChanger(geometry): need charLength/tubeOD"
            " > 0, tubeL > 0, nTubes > 0.");

    // Heat-transfer AREA (outside, condensing side).
    scalar area = 0.0;
    if (horiz || tubeOD > 0.0)
        area = M_PI * tubeOD * tubeL * static_cast<scalar>(nTubes);
    else
    {
        // a bare vertical plate: width * height (plateWidth optional, default 1 m).
        const scalar w = g->lookupScalarOrDefault("plateWidth", 1.0);
        area = w * charLength * static_cast<scalar>(nTubes);
    }
    if (area <= 0.0)
        throw std::runtime_error("phaseChanger(geometry): computed area <= 0"
            " (give tubeOD for a tube, or plateWidth for a vertical plate).");

    // Wall conductivity: explicit `wallK` or `wall <material>;`.
    scalar k_wall = 0.0;
    if (g->found("wallK")) k_wall = g->lookupScalar("wallK");
    else if (g->found("wall"))
    {
        const std::string mat = g->lookupWord("wall");
        k_wall = MaterialRegistry::byName(mat).thermalConductivity;
        if (k_wall <= 0.0)
            throw std::runtime_error("phaseChanger(geometry): material '" + mat
                + "' carries no thermalConductivity -- add it to"
                  " data/standards/materials/" + mat + ".dat or give `wallK`.");
    }
    else throw std::runtime_error("phaseChanger(geometry): give `wallK` or"
        " `wall <material>;` in the geometry block.");

    // Wall resistance per unit (outside) area: t_wall / k_wall.  Use the
    // cylindrical form when an inner diameter is known, the flat-plate form
    // otherwise.
    scalar R_wall = 0.0;
    bool haveTubeGeom = false; scalar r_o_saved = 0.0, r_i_saved = 1.0;
    if (tubeOD > 0.0 && tubeID > 0.0 && tubeID < tubeOD)
    {
        const scalar r_o = 0.5 * tubeOD, r_i = 0.5 * tubeID;
        R_wall = r_o * std::log(r_o / r_i) / k_wall;     // on outside area
        haveTubeGeom = true; r_o_saved = r_o; r_i_saved = r_i;
    }
    else if (g->found("wallThickness"))
        R_wall = g->lookupScalar("wallThickness", Dims::length) / k_wall;
    // else thin-wall: R_wall = 0 (the condensing/coolant films dominate).

    // -- coolant ------------------------------------------------------------
    const scalar T_cool   = cool->lookupScalar("T_in", Dims::temperature);
    const scalar h_cool   = cool->lookupScalar("h", Dims::heatTransfer_h);
    if (h_cool <= 0.0)
        throw std::runtime_error("phaseChanger(geometry): coolant `h` must be > 0.");
    // pass-9 (student): R_wall was outside-area-referenced but R_cool was not
    // -- two conventions under one 'Resistances (outside area)' label.  The
    // coolant film is INSIDE the tubes (a Dittus-Boelter-class h), so on the
    // outside area it carries A_o/A_i = r_o/r_i.
    scalar R_cool = 1.0 / h_cool;
    if (haveTubeGeom) R_cool *= r_o_saved / r_i_saved;
    const scalar U_rest   = 1.0 / (R_cool + R_wall);     // everything but the film

    // -- condensation model -------------------------------------------------
    PhaseChangeHTC::registerBuiltins();   // idempotent
    const std::string pcModel = operDict->found("condensation")
        ? operDict->subDict("condensation")->lookupWordOrDefault("model", "NusseltFilm")
        : "NusseltFilm";
    auto pc = PhaseChangeHTC::New(pcModel);
    if (operDict->found("condensation"))
        pc->readParameters(operDict->subDict("condensation"));

    // -- saturation + latent heat (the existing idioms) ---------------------
    const scalar Tsat = saturationT(thermo, P_out, z);
    if (T_cool >= Tsat)
        throw std::runtime_error("phaseChanger(geometry): coolant T_in (" +
            std::to_string(T_cool) + " K) is not below Tsat (" +
            std::to_string(Tsat) + " K) -- no condensation driving force.");

    // Molar mass (kg/kmol) for the per-mass film properties / latent heat.
    scalar Mbar = 0.0;
    for (std::size_t i = 0; i < n; ++i)
        if (z[i] > 0.0) Mbar += z[i] * thermo.comp(i).MW();
    if (Mbar <= 0.0)
        throw std::runtime_error("phaseChanger(geometry): empty composition.");
    const scalar M_kg_per_mol = Mbar / 1000.0;           // kg/kmol -> kg/mol

    // Latent heat h_fg [J/kg] from the dome-aware H_stream eps-step at Tsat
    // (the SAME idiom the spec-mode latent split uses: vf=1 exactly would read
    // the liquid branch and miss the latent heat).
    scalar h_fg_mass = 0.0;
    {
        const scalar eps  = 1.0e-4;
        const scalar h_lo = thermo.H_stream_formation(Tsat, P_out, eps,       z);
        const scalar h_hi = thermo.H_stream_formation(Tsat, P_out, 1.0 - eps, z);
        const scalar latent_molar = (h_hi - h_lo) / (1.0 - 2.0 * eps); // J/mol
        h_fg_mass = latent_molar / M_kg_per_mol;          // J/kg
    }

    // Saturated-vapour density at Tsat (rho_v) -- constant over the iteration.
    const scalar rho_v = thermo.density(Tsat, P_out, z, DensityPhase::Vapour);

    // Film properties at T_f = (Tsat + T_wall)/2 -> the per-iteration evaluator.
    auto filmProps = [&](scalar T_wall, PhaseChangeContext& ctx)
    {
        const scalar T_f = 0.5 * (Tsat + T_wall);
        ctx.orientation = orientation;
        ctx.charLength  = charLength;
        ctx.gravity     = 9.81;
        ctx.rho_v       = rho_v;
        ctx.h_fg        = h_fg_mass;
        ctx.dT_film     = Tsat - T_wall;
        // Surface tension (saturation line, at Tsat).  UNUSED by NusseltFilm
        // (condensation) -- wired here so the context the boiling path shares
        // is always populated when it CAN be (pure-fluid R1-76 or a transport
        // surfaceTension block); harmless and best-effort for condensation.
        if (thermo.hasSurfaceTension() || !thermo.pureFluidSelections().empty())
        {
            try { ctx.sigma = thermo.surfaceTension(Tsat, z); }
            catch (const std::exception&) { ctx.sigma = 0.0; }
        }
        ctx.rho_l       = thermo.density(T_f, P_out, z, DensityPhase::Liquid);
        ctx.lambda_l    = thermo.thermalConductivityLiquid(T_f, z);
        ctx.mu_l        = thermo.viscosityLiquid(T_f, z);
        // mass cp: molar Cp_liquid / M.
        scalar cp_molar = 0.0;
        for (std::size_t i = 0; i < n; ++i)
            if (thermo.comp(i).hasCpLiquid())
                cp_molar += z[i] * thermo.comp(i).cpLiquid().Cp(T_f);
        ctx.cp_l = (M_kg_per_mol > 0.0) ? cp_molar / M_kg_per_mol : 0.0;
    };

    auto h_pc_at = [&](scalar T_wall) -> PhaseChangeResult
    {
        PhaseChangeContext ctx;
        filmProps(T_wall, ctx);
        return pc->evaluate(ctx);
    };

    // -- wall-T inner iteration (bracketed Newton in (T_cool, Tsat)) --------
    //   f(T_wall) = q_cond(T_wall) - q_cool(T_wall)
    //   q_cond = h_pc(dT_film) * dT_film,   q_cool = U_rest * (T_wall - T_cool)
    // q_cond decreases with T_wall (dT_film -> 0), q_cool increases -> f is
    // monotone DECREASING with a single root in (T_cool, Tsat).
    auto fwall = [&](scalar T_wall) -> scalar
    {
        const scalar dT_film = Tsat - T_wall;
        const scalar q_cond  = h_pc_at(T_wall).h * dT_film;
        const scalar q_cool  = U_rest * (T_wall - T_cool);
        return q_cond - q_cool;
    };
    auto dfwall = [&](scalar T_wall)
    {
        const scalar dT = 0.05;
        scalar lo = std::max(T_cool + 1.0e-4, T_wall - dT);
        scalar hi = std::min(Tsat - 1.0e-4, T_wall + dT);
        return (fwall(hi) - fwall(lo)) / (hi - lo);
    };

    solver::NROptions o;
    o.tolerance = 1.0e-3;            // residual is a heat flux [W/m^2]
    o.maxIter   = 80;
    o.lower     = T_cool + 1.0e-3;
    o.upper     = Tsat   - 1.0e-3;
    o.bracket   = true;
    o.monotoneIncreasing = false;   // f decreasing in T_wall
    o.maxStep   = (Tsat - T_cool);
    o.onIter = [this](const solver::NRTrace& tr){ recordResidual(std::abs(tr.f)); };

    // Per-iteration glass-box trace (printed in the SEE).
    struct IterRow { int it; scalar T_wall, dT_film, h_cond, residual; };
    std::vector<IterRow> trace;
    o.onIter = [&](const solver::NRTrace& tr)
    {
        recordResidual(std::abs(tr.f));
        const scalar dT_film = Tsat - tr.x;
        trace.push_back({tr.iteration, tr.x, dT_film,
                         h_pc_at(tr.x).h, tr.f});
    };

    const scalar Tw0 = 0.5 * (T_cool + Tsat);
    auto rwall = solver::newton1D(fwall, dfwall, Tw0, o);
    if (!rwall.converged)
        throw std::runtime_error("phaseChanger(geometry): wall-temperature "
            "iteration did not converge (check coolant T_in/h vs Tsat).");

    const scalar T_wall  = rwall.x;
    const scalar dT_film = Tsat - T_wall;
    const PhaseChangeResult film = h_pc_at(T_wall);
    const scalar h_cond = film.h;
    const scalar R_film = 1.0 / h_cond;                  // condensing-film resist.

    // -- duty (the RESULT) from the converged film -------------------------
    const scalar Q_cond_W = h_cond * area * dT_film;     // > 0 leaving the steam

    // -- outlet = the dome-flash at duty -Q (condensing removes heat) -------
    // Reuse the existing duty path: flash the feed enthalpy minus the removed
    // duty.  Compute H_in, the target H_out, then locate the outlet state.
    auto flashAt = [&](scalar T) -> FlashSolution
    {
        FlashInput in; in.F = 1.0; in.T = T; in.P = P_out; in.z = z;
        FlashOptions opts; opts.verbosity = 0;
        return IsothermalFlash::solveCore(in, thermo, opts);
    };
    scalar H_in;
    {
        FlashInput fin; fin.F = 1.0; fin.T = T_in; fin.P = P_in; fin.z = z;
        FlashOptions fopts; fopts.verbosity = 0;
        FlashSolution fsol = IsothermalFlash::solveCore(fin, thermo, fopts);
        H_in = streamEnthalpy(thermo, fsol, T_in, P_in, z);
    }
    const scalar F_mol_s   = F * 1000.0;                 // kmol/s -> mol/s
    const scalar Q_per_mol = -Q_cond_W / F_mol_s;        // heat REMOVED < 0
    const scalar H_target  = H_in + Q_per_mol;

    // Dome-aware outlet (same logic as the duty spec mode).
    std::size_t domIdx = 0;
    for (std::size_t i = 1; i < n; ++i) if (z[i] > z[domIdx]) domIdx = i;
    const bool pureDome = ThermoPackage::isEffectivelyPure(z, domIdx);

    scalar T_out = T_in, vf_out = 0.0, H_out = H_target;
    bool resolved = false;
    {
        const scalar eps  = 1.0e-4;
        const scalar h_lo = thermo.H_stream_formation(Tsat, P_out, eps,       z);
        const scalar h_hi = thermo.H_stream_formation(Tsat, P_out, 1.0 - eps, z);
        const scalar h_f  = (h_lo - eps * h_hi) / (1.0 - 2.0 * eps);
        const scalar h_g  = (h_hi - eps * h_lo) / (1.0 - 2.0 * eps);
        if (pureDome && H_target >= h_f - 1.0e-3 && H_target <= h_g + 1.0e-3)
        {
            T_out  = Tsat;
            vf_out = std::clamp((H_target - h_f) / (h_g - h_f), 0.0, 1.0);
            H_out  = thermo.H_stream_formation(T_out, P_out, vf_out, z);
            resolved = true;
        }
    }
    if (!resolved)
    {
        auto f  = [&](scalar T) {
            return streamEnthalpy(thermo, flashAt(T), T, P_out, z) - H_target;
        };
        auto df = [&](scalar T) {
            const scalar dT = 0.25;
            return (f(T + dT) - f(T - dT)) / (2.0 * dT);
        };
        scalar T_floor = 150.0;
        if (thermo.hasPureFluid(domIdx) && pureDome) T_floor = 274.0;
        solver::NROptions of;
        of.tolerance = 1.0; of.maxIter = 60; of.lower = T_floor; of.upper = 1500.0;
        of.bracket = true; of.monotoneIncreasing = true; of.maxStep = 60.0;
        auto r = solver::newton1D(f, df, T_in, of);
        if (!r.converged)
            throw std::runtime_error("phaseChanger(geometry): outlet dome-flash "
                "did not converge.");
        T_out  = r.x;
        FlashSolution sol = flashAt(T_out);
        vf_out = std::clamp(sol.V_over_F, 0.0, 1.0);
        H_out  = streamEnthalpy(thermo, sol, T_out, P_out, z);
    }

    const scalar Q_W  = F_mol_s * (H_out - H_in);        // RESULT duty (signed)
    const scalar Q_kW = Q_W / 1000.0;

    // -- resistances + which controls (on outside area) --------------------
    std::string controlling;
    if (R_film >= R_wall && R_film >= R_cool)      controlling = "condensing film";
    else if (R_cool >= R_wall)                     controlling = "coolant-side";
    else                                           controlling = "wall";

    // -- U*A*LMTD cross-check (coolant assumed isothermal at T_cool here:
    //    the coolant-side is modelled by its film h, not a counter-flow rise) -
    const scalar U_overall = 1.0 / (R_film + R_wall + R_cool);
    const scalar dT_overall = Tsat - T_cool;             // condensing side is iso-T
    const scalar Q_UAdT_W = U_overall * area * dT_overall;

    // ---- SEE (verbosity >= 2) -------------------------------------------
    if (verbosity >= 2)
    {
        std::cout << "\n===========  PhaseChanger (geometry -> film condensation)  ==========\n"
                  << std::fixed
                  << "  Condensation model:  " << pc->type() << "   ["
                  << pc->validityWindow() << "]\n"
                  << "  Orientation:         " << orientation
                  << "   (char length = " << std::setprecision(4) << charLength
                  << " m)\n"
                  << "  Area (outside):      " << std::setprecision(4) << area
                  << " m^2   (" << nTubes << " x  pi D L)\n"
                  << "  Tsat(P_out):         " << std::setprecision(3) << Tsat
                  << " K  ( " << (Tsat - 273.15) << " degC )\n"
                  << "  h_fg @ Tsat:         " << std::setprecision(1)
                  << (h_fg_mass / 1000.0) << " kJ/kg\n"
                  << "  -- wall-temperature iteration (q_cond == q_cool) --\n"
                  << "      it      T_wall      dT_film     h_cond       residual\n";
        for (const auto& r : trace)
            std::cout << "     " << std::setw(3) << r.it
                      << "   " << std::setprecision(3) << std::setw(9) << r.T_wall
                      << "   " << std::setw(9) << r.dT_film
                      << "   " << std::setprecision(1) << std::setw(9) << r.h_cond
                      << "   " << std::scientific << std::setprecision(3)
                      << std::setw(11) << r.residual << std::fixed << "\n";
        std::cout << "     CONVERGED: T_wall = " << std::setprecision(3) << T_wall
                  << " K,  dT_film = " << dT_film << " K\n"
                  << "  Condensing film:     h = " << std::setprecision(1) << h_cond
                  << " W/(m^2.K),  Re_film = " << std::setprecision(2)
                  << film.Re_film << "  (" << film.regime << ")\n";
        if (!film.valid)
            std::cout << "     WARN: " << film.validityNote << "\n";
        std::cout << "  Coolant side:        T_in = " << std::setprecision(3)
                  << T_cool << " K,  h = " << std::setprecision(1) << h_cool
                  << " W/(m^2.K)\n"
                  << "  Resistances (outside area, m^2.K/W):\n"
                  << "     R_film = " << std::scientific << std::setprecision(3)
                  << R_film << ",  R_wall = " << R_wall
                  << ",  R_coolant = " << R_cool << "\n"
                  << "     controlling resistance: " << controlling << "\n"
                  << std::fixed
                  << "  DUTY (result):       " << std::setprecision(4) << Q_kW
                  << " kW   (- = heat removed by condensation)\n"
                  << "     cross-check U*A*dT = " << std::setprecision(4)
                  << (Q_UAdT_W / 1000.0) << " kW  (U = " << std::setprecision(1)
                  << U_overall << " W/(m^2.K), dT = " << std::setprecision(2)
                  << dT_overall << " K)\n"
                  << "  Outlet:              T_out = " << std::setprecision(3)
                  << T_out << " K,  vf_out = " << std::setprecision(5) << vf_out
                  << "\n"
                  << "=====================================================================\n\n";
    }

    // ---- Produced stream -------------------------------------------------
    produced_.clear();
    ProcessStream out;
    out.name = "out";
    out.F = F; out.T = T_out; out.P = P_out; out.z = z; out.vf = vf_out;
    produced_.push_back(out);

    // ---- KPIs ------------------------------------------------------------
    kpis_.clear();
    kpis_["Q"]                = Q_W;
    kpis_["Q_kW"]             = Q_kW;
    kpis_["T_in"]             = T_in;
    kpis_["T_out"]            = T_out;
    kpis_["Tsat"]             = Tsat;
    kpis_["T_wall"]           = T_wall;
    kpis_["dT_film"]          = dT_film;
    kpis_["h_condensation"]   = h_cond;
    kpis_["Re_film"]          = film.Re_film;
    kpis_["R_film"]           = R_film;
    kpis_["R_wall"]           = R_wall;
    kpis_["R_coolant"]        = R_cool;
    // controllingResistance numeric code: 0 = film, 1 = coolant, 2 = wall.
    kpis_["controllingResistanceCode"] =   // categorical: 0=condensing film, 1=wall, 2=coolant (renamed pass-5: a bare 0 beside real resistances read as zero ohms)
          (controlling == "condensing film") ? 0.0
        : (controlling == "coolant-side")    ? 1.0 : 2.0;
    kpis_["area"]             = area;
    kpis_["vf_out"]           = vf_out;
    kpis_["vf_in"]            = 1.0;   // geometry mode condenses a vapour feed
    kpis_["F"]                = F;
    kpis_["P"]                = P_out;
    kpis_["U_overall"]        = U_overall;
    kpis_["Q_UAdT_kW"]        = Q_UAdT_W / 1000.0;

    return 0;
}

// ===========================================================================
//  model geometry + boiling{}  --  Rohsenow nucleate flux -> duty, Zuber CHF
// ===========================================================================
//
//  A heated SURFACE (the wall outside-fed by a heating medium) boils a
//  saturated pool.  The duty EMERGES from the nucleate-boiling flux, exactly
//  as a real reboiler's does -- but the nucleate flux is +/-100% uncertain
//  (C_sf is surface-finish lab data), so the design is governed by the RELIABLE
//  Zuber CHF ceiling, and a design above CHF is HARD-REFUSED (burnout).
//
//  RE-DERIVED root-find (NOT the condensation bracket -- the physics is
//  inverted: boiling super-heats, condensation sub-cools, and q_boil is the
//  CUBE of the wall superheat, a convex INCREASING limb):
//
//      f(T_surface) = q_boil(dT_excess)  -  q_heat(T_medium - T_surface) = 0
//      dT_excess    = T_surface - Tsat          (the wall superheat)
//      q_boil       = Rohsenow nucleate flux ~ dT_excess^3   (increasing+convex)
//      q_heat       = U_rest (T_medium - T_surface)          (decreasing)
//   -> f is monotone INCREASING in T_surface with a single root in
//      (Tsat, T_medium); newton1D bracketed there, maxStep capped at the span
//      (a pure Newton overshoots the cubic limb).
//
//  References: Rohsenow (1952); Zuber (1959) CHF; Incropera & DeWitt Ch.10
//  (Table 10.1 C_sf, the nucleate worked example, the CHF anchor).
//
int PhaseChanger::solveBoilingGeometry(const DictPtr& operDict,
                                       const ThermoPackage& thermo,
                                       int verbosity,
                                       scalar F, scalar T_in, scalar P_in,
                                       scalar P_out, const sVector& z)
{
    const std::size_t n = thermo.n();

    if (!operDict->found("geometry"))
        throw std::runtime_error("phaseChanger(geometry,boiling): a "
            "`geometry { ... }` block is required (orientation, tubeOD, tubeL, "
            "nTubes, wall).");
    if (!operDict->found("heatingMedium"))
        throw std::runtime_error("phaseChanger(geometry,boiling): a "
            "`heatingMedium { T_in; h; }` block is required (the hot-side "
            "temperature and film coefficient -- the sign-flipped twin of the "
            "condenser's coolant{}).");

    auto g    = operDict->subDict("geometry");
    auto boil = operDict->subDict("boiling");
    auto heat = operDict->subDict("heatingMedium");

    // -- geometry (mirrors the condensation reader) -------------------------
    const std::string orientation =
        g->lookupWordOrDefault("orientation", "horizontalTube");
    const bool horiz = (orientation == "horizontalTube");

    scalar charLength = 0.0, tubeOD = 0.0, tubeID = 0.0, tubeL = 0.0;
    const int nTubes = static_cast<int>(g->lookupScalarOrDefault("nTubes", 1.0));
    if (horiz)
    {
        tubeOD = g->lookupScalar("tubeOD", Dims::length);
        charLength = tubeOD;
        tubeL = g->lookupScalar("tubeL", Dims::length);
        if (g->found("tubeID")) tubeID = g->lookupScalar("tubeID", Dims::length);
        else if (g->found("wallThickness"))
            tubeID = tubeOD - 2.0 * g->lookupScalar("wallThickness", Dims::length);
        else tubeID = tubeOD;
    }
    else
    {
        charLength = g->found("charLength")
            ? g->lookupScalar("charLength", Dims::length)
            : g->lookupScalar("tubeL", Dims::length);
        tubeL = charLength;
        if (g->found("tubeOD")) tubeOD = g->lookupScalar("tubeOD", Dims::length);
        if (g->found("tubeID")) tubeID = g->lookupScalar("tubeID", Dims::length);
        else if (tubeOD > 0.0 && g->found("wallThickness"))
            tubeID = tubeOD - 2.0 * g->lookupScalar("wallThickness", Dims::length);
    }
    if (charLength <= 0.0 || tubeL <= 0.0 || nTubes <= 0)
        throw std::runtime_error("phaseChanger(geometry,boiling): need "
            "charLength/tubeOD > 0, tubeL > 0, nTubes > 0.");

    scalar area = 0.0;
    if (horiz || tubeOD > 0.0)
        area = M_PI * tubeOD * tubeL * static_cast<scalar>(nTubes);
    else
    {
        const scalar w = g->lookupScalarOrDefault("plateWidth", 1.0);
        area = w * charLength * static_cast<scalar>(nTubes);
    }
    if (area <= 0.0)
        throw std::runtime_error("phaseChanger(geometry,boiling): computed "
            "area <= 0 (give tubeOD for a tube, or plateWidth for a plate).");

    // Wall conductivity + outside-area resistance (same idiom as condensation).
    scalar k_wall = 0.0;
    if (g->found("wallK")) k_wall = g->lookupScalar("wallK");
    else if (g->found("wall"))
    {
        const std::string mat = g->lookupWord("wall");
        k_wall = MaterialRegistry::byName(mat).thermalConductivity;
        if (k_wall <= 0.0)
            throw std::runtime_error("phaseChanger(geometry,boiling): material '"
                + mat + "' carries no thermalConductivity -- add it to "
                "data/standards/materials/" + mat + ".dat or give `wallK`.");
    }
    else throw std::runtime_error("phaseChanger(geometry,boiling): give `wallK` "
        "or `wall <material>;` in the geometry block.");

    scalar R_wall = 0.0;
    if (tubeOD > 0.0 && tubeID > 0.0 && tubeID < tubeOD)
    {
        const scalar r_o = 0.5 * tubeOD, r_i = 0.5 * tubeID;
        R_wall = r_o * std::log(r_o / r_i) / k_wall;
    }
    else if (g->found("wallThickness"))
        R_wall = g->lookupScalar("wallThickness", Dims::length) / k_wall;

    // -- heating medium (the sign-flipped twin of coolant{}) ----------------
    const scalar T_med = heat->lookupScalar("T_in", Dims::temperature);
    const scalar h_med = heat->lookupScalar("h", Dims::heatTransfer_h);
    if (h_med <= 0.0)
        throw std::runtime_error("phaseChanger(geometry,boiling): heatingMedium "
            "`h` must be > 0.");
    const scalar R_med  = 1.0 / h_med;
    const scalar U_rest = 1.0 / (R_med + R_wall);    // everything but the boiling

    // -- boiling model + the REFUSAL-TO-DEFAULT C_sf / citation -------------
    const std::string boilModel = boil->lookupWordOrDefault("model", "Rohsenow");
    // Citation is MANDATORY (provenance for the surface-finish C_sf) -- the
    // correlation cannot check a string, so the caller enforces it here.
    if (!boil->found("citation"))
        throw std::runtime_error(
            "phaseChanger(geometry,boiling): boiling{} needs a `citation \"...\";`"
            " -- the surface-fluid C_sf is surface-finish lab data (+/-100%), so"
            " its source MUST be stated; e.g. citation \"Incropera & DeWitt Tab"
            " 10.1, water-copper polished\";");
    const std::string citation = boil->lookupWord("citation");
    // C_sf: REFUSE if absent (no default).  Read raw (dimensionless).
    if (!boil->found("Csf"))
        throw std::runtime_error(
            "Rohsenow nucleate boiling needs a surface-fluid C_sf (no default --"
            " it is surface-finish lab data, +/-100%); supply `Csf <value>;` and"
            " a `citation \"...\";` in the boiling{} block; e.g. water-copper"
            " Csf 0.013 from Incropera & DeWitt Table 10.1.");
    const scalar C_sf = boil->lookupScalar("Csf");
    // Prandtl exponent s: 1.0 water / 1.7 others (the case states it).
    const scalar s_exp = boil->lookupScalarOrDefault("s", 1.0);

    PhaseChangeHTC::registerBuiltins();   // idempotent
    auto boilHTC = PhaseChangeHTC::New(boilModel);
    auto chfHTC  = PhaseChangeHTC::New("ZuberCHF");

    // -- saturation + latent heat (the existing idioms) ---------------------
    const scalar Tsat = saturationT(thermo, P_out, z);
    if (T_med <= Tsat)
        throw std::runtime_error("phaseChanger(geometry,boiling): heatingMedium "
            "T_in (" + std::to_string(T_med) + " K) is not above Tsat (" +
            std::to_string(Tsat) + " K) -- no boiling driving force.");

    // Surface tension at Tsat (MANDATORY for boiling -- both Rohsenow & Zuber).
    if (!thermo.hasSurfaceTension() && thermo.pureFluidSelections().empty())
        throw std::runtime_error("phaseChanger(geometry,boiling): boiling needs "
            "surface tension sigma -- add `transport { surfaceTension { model "
            "BrockBird; } }` to the thermoPackage, or flag a pure-fluid kernel "
            "(IF97 supplies sigma via IAPWS R1-76).");
    const scalar sigma = thermo.surfaceTension(Tsat, z);

    // Molar mass + latent heat per kg (same idiom as condensation).
    scalar Mbar = 0.0;
    for (std::size_t i = 0; i < n; ++i)
        if (z[i] > 0.0) Mbar += z[i] * thermo.comp(i).MW();
    if (Mbar <= 0.0)
        throw std::runtime_error("phaseChanger(geometry,boiling): empty composition.");
    const scalar M_kg_per_mol = Mbar / 1000.0;
    scalar h_fg_mass = 0.0;
    {
        const scalar eps  = 1.0e-4;
        const scalar h_lo = thermo.H_stream_formation(Tsat, P_out, eps,       z);
        const scalar h_hi = thermo.H_stream_formation(Tsat, P_out, 1.0 - eps, z);
        const scalar latent_molar = (h_hi - h_lo) / (1.0 - 2.0 * eps);
        h_fg_mass = latent_molar / M_kg_per_mol;
    }

    // Saturated densities at Tsat.  The pure-fluid (IF97) density route resolves
    // its region from (T,P) and is PHASE-BLIND -- exactly ON the saturation line
    // (T = Tsat, P = Psat) both phases would read the same region.  Nudge a
    // hair off the line to land on the correct branch: rho_v just ABOVE Tsat
    // (region 2, vapour), rho_l just BELOW (region 1, liquid).  The generic
    // (non-pure-fluid) route honours the DensityPhase argument and is unaffected
    // by the +/-eps.  (Same idiom as the dome-aware H_stream eps-step.)
    const scalar dTsat = 0.05;   // 50 mK off the line -- enough to switch region
    const scalar rho_v = thermo.density(Tsat + dTsat, P_out, z, DensityPhase::Vapour);
    const scalar rho_l = thermo.density(Tsat - dTsat, P_out, z, DensityPhase::Liquid);

    // Liquid film properties just below Tsat (saturated liquid -- pool boiling).
    const scalar mu_l     = thermo.viscosityLiquid(Tsat - dTsat, z);
    const scalar lambda_l = thermo.thermalConductivityLiquid(Tsat - dTsat, z);
    // Liquid mass-cp at Tsat.  Prefer the pure-fluid kernel (IF97 cp_molar on
    // the saturated-liquid line) when the dominant component is flagged; else
    // the component cpLiquid model.  cp_l is LOAD-BEARING for Rohsenow (the
    // cube of cp_l dT_excess) -- a zero cp would silently zero the flux, so
    // refuse loudly if neither source is available.
    scalar cp_l = 0.0;
    {
        std::size_t dom = 0;
        for (std::size_t i = 1; i < n; ++i) if (z[i] > z[dom]) dom = i;
        if (thermo.hasPureFluid(dom)
            && ThermoPackage::isEffectivelyPure(z, dom))
        {
            // Saturated-LIQUID cp: evaluate just below Tsat (region 1), since
            // exactly on the line the IF97 region is ambiguous.
            const scalar T_liq = Tsat - dTsat;
            const scalar p_sat = thermo.pureFluid(dom).p_sat(T_liq);
            cp_l = thermo.pureFluid(dom).cp_molar(T_liq, p_sat) / M_kg_per_mol;
        }
        else
        {
            scalar cp_molar = 0.0;
            for (std::size_t i = 0; i < n; ++i)
                if (thermo.comp(i).hasCpLiquid())
                    cp_molar += z[i] * thermo.comp(i).cpLiquid().Cp(Tsat);
            cp_l = (M_kg_per_mol > 0.0) ? cp_molar / M_kg_per_mol : 0.0;
        }
    }
    if (cp_l <= 0.0)
        throw std::runtime_error("phaseChanger(geometry,boiling): liquid cp is "
            "unavailable (need a cpLiquid model in the component .dat, or a "
            "pure-fluid kernel) -- Rohsenow's q ~ (cp_l dT_excess)^3 needs it.");

    // A boiling context at a trial surface temperature.
    auto boilCtx = [&](scalar T_surface) -> PhaseChangeContext
    {
        PhaseChangeContext ctx;
        ctx.orientation = orientation;
        ctx.charLength  = charLength;
        ctx.gravity     = 9.81;
        ctx.rho_l       = rho_l;
        ctx.rho_v       = rho_v;
        ctx.lambda_l    = lambda_l;
        ctx.mu_l        = mu_l;
        ctx.cp_l        = cp_l;
        ctx.h_fg        = h_fg_mass;
        ctx.sigma       = sigma;
        ctx.dT_excess   = T_surface - Tsat;   // the wall superheat (NOT dT_film)
        ctx.C_sf        = C_sf;
        ctx.n_exp       = s_exp;
        return ctx;
    };

    auto q_boil_at = [&](scalar T_surface) -> scalar
    {
        return boilHTC->evaluate(boilCtx(T_surface)).q_flux;
    };

    // -- Zuber CHF (constant -- no dT dependence) ---------------------------
    const scalar q_CHF = chfHTC->evaluate(boilCtx(Tsat + 1.0)).q_CHF;

    // -- surface-T inner iteration: q_boil(dT_excess) == q_heat -------------
    //   f(T_surface) = q_boil - U_rest (T_med - T_surface), INCREASING + convex
    auto fsurf = [&](scalar T_surface) -> scalar
    {
        const scalar q_b = q_boil_at(T_surface);
        const scalar q_h = U_rest * (T_med - T_surface);
        return q_b - q_h;
    };
    auto dfsurf = [&](scalar T_surface)
    {
        const scalar dT = 0.05;
        scalar lo = std::max(Tsat + 1.0e-4, T_surface - dT);
        scalar hi = std::min(T_med - 1.0e-4, T_surface + dT);
        return (fsurf(hi) - fsurf(lo)) / (hi - lo);
    };

    struct IterRow { int it; scalar T_surface, dT_excess, q_boil, residual; };
    std::vector<IterRow> trace;
    solver::NROptions o;
    o.tolerance = 1.0e-3;            // residual is a heat flux [W/m^2]
    o.maxIter   = 80;
    o.lower     = Tsat  + 1.0e-3;
    o.upper     = T_med - 1.0e-3;
    o.bracket   = true;
    o.monotoneIncreasing = true;    // q_boil rises (cube), q_heat falls -> f up
    o.maxStep   = (T_med - Tsat);   // cap: pure Newton overshoots the cubic limb
    o.onIter = [&](const solver::NRTrace& tr)
    {
        recordResidual(std::abs(tr.f));
        trace.push_back({tr.iteration, tr.x, tr.x - Tsat,
                         q_boil_at(tr.x), tr.f});
    };

    const scalar Ts0 = Tsat + 0.25 * (T_med - Tsat);   // a low-superheat start
    auto rsurf = solver::newton1D(fsurf, dfsurf, Ts0, o);
    if (!rsurf.converged)
        throw std::runtime_error("phaseChanger(geometry,boiling): surface-"
            "temperature iteration did not converge (check heatingMedium "
            "T_in/h vs Tsat).");

    const scalar T_surface = rsurf.x;
    const scalar dT_excess = T_surface - Tsat;
    const PhaseChangeResult boilRes = boilHTC->evaluate(boilCtx(T_surface));
    const scalar q_nucleate = boilRes.q_flux;
    const scalar margin     = (q_CHF > 0.0) ? q_nucleate / q_CHF : 0.0;

    // The +/-100% scatter band [q/2, 2q] (C_sf +/-25% cubed).
    const scalar q_lo = 0.5 * q_nucleate;
    const scalar q_hi = 2.0 * q_nucleate;

    // -- HARD-REFUSE above CHF (burnout) -- ModelBoundaryAudit refuse style --
    if (q_nucleate >= q_CHF)
        throw std::runtime_error(
            "phaseChanger(geometry,boiling): design flux q''=" +
            std::to_string(q_nucleate / 1.0e6) + " MW/m^2 exceeds Zuber CHF "
            "q''_max=" + std::to_string(q_CHF / 1.0e6) + " MW/m^2 by " +
            std::to_string((margin - 1.0) * 100.0) + "% -- BURNOUT; a pool "
            "boiler cannot operate above CHF; reduce dT_excess, area, or "
            "heating-medium T.");

    // -- duty (the RESULT) from the converged nucleate flux ----------------
    const scalar Q_boil_W = q_nucleate * area;       // > 0 added to the pool

    // -- outlet = the dome-flash at duty +Q (boiling adds heat) ------------
    auto flashAt = [&](scalar T) -> FlashSolution
    {
        FlashInput in; in.F = 1.0; in.T = T; in.P = P_out; in.z = z;
        FlashOptions opts; opts.verbosity = 0;
        return IsothermalFlash::solveCore(in, thermo, opts);
    };
    scalar H_in;
    {
        FlashInput fin; fin.F = 1.0; fin.T = T_in; fin.P = P_in; fin.z = z;
        FlashOptions fopts; fopts.verbosity = 0;
        FlashSolution fsol = IsothermalFlash::solveCore(fin, thermo, fopts);
        H_in = streamEnthalpy(thermo, fsol, T_in, P_in, z);
    }
    const scalar F_mol_s   = F * 1000.0;
    const scalar Q_per_mol = +Q_boil_W / F_mol_s;    // heat ADDED > 0
    const scalar H_target  = H_in + Q_per_mol;

    std::size_t domIdx = 0;
    for (std::size_t i = 1; i < n; ++i) if (z[i] > z[domIdx]) domIdx = i;
    const bool pureDome = ThermoPackage::isEffectivelyPure(z, domIdx);

    scalar T_out = T_in, vf_out = 0.0, H_out = H_target;
    bool resolved = false;
    {
        const scalar eps  = 1.0e-4;
        const scalar h_lo = thermo.H_stream_formation(Tsat, P_out, eps,       z);
        const scalar h_hi = thermo.H_stream_formation(Tsat, P_out, 1.0 - eps, z);
        const scalar h_f  = (h_lo - eps * h_hi) / (1.0 - 2.0 * eps);
        const scalar h_g  = (h_hi - eps * h_lo) / (1.0 - 2.0 * eps);
        if (pureDome && H_target >= h_f - 1.0e-3 && H_target <= h_g + 1.0e-3)
        {
            T_out  = Tsat;
            vf_out = std::clamp((H_target - h_f) / (h_g - h_f), 0.0, 1.0);
            H_out  = thermo.H_stream_formation(T_out, P_out, vf_out, z);
            resolved = true;
        }
    }
    if (!resolved)
    {
        auto f  = [&](scalar T) {
            return streamEnthalpy(thermo, flashAt(T), T, P_out, z) - H_target;
        };
        auto df = [&](scalar T) {
            const scalar dT = 0.25;
            return (f(T + dT) - f(T - dT)) / (2.0 * dT);
        };
        scalar T_floor = 150.0;
        if (thermo.hasPureFluid(domIdx) && pureDome) T_floor = 274.0;
        solver::NROptions of;
        of.tolerance = 1.0; of.maxIter = 60; of.lower = T_floor; of.upper = 1500.0;
        of.bracket = true; of.monotoneIncreasing = true; of.maxStep = 60.0;
        auto r = solver::newton1D(f, df, T_in, of);
        if (!r.converged)
            throw std::runtime_error("phaseChanger(geometry,boiling): outlet "
                "dome-flash did not converge.");
        T_out  = r.x;
        FlashSolution sol = flashAt(T_out);
        vf_out = std::clamp(sol.V_over_F, 0.0, 1.0);
        H_out  = streamEnthalpy(thermo, sol, T_out, P_out, z);
    }

    const scalar Q_W  = F_mol_s * (H_out - H_in);    // RESULT duty (signed +)
    const scalar Q_kW = Q_W / 1000.0;

    // ---- SEE (verbosity >= 2): CHF LEADING; superheat SPELLED OUT --------
    if (verbosity >= 2)
    {
        auto toMW = [](scalar q){ return q / 1.0e6; };
        std::cout << "\n===========  PhaseChanger (geometry -> pool boiling)  ==============\n"
                  << std::fixed
                  << "  -- boiling (pool, heated " << orientation << ") --\n"
                  << "  Tsat " << std::setprecision(1) << (Tsat - 273.15)
                  << " C   T_surface " << std::setprecision(1)
                  << (T_surface - 273.15) << " C   wall superheat dT_excess = "
                     "T_surface-Tsat = " << std::setprecision(1) << dT_excess
                  << " K\n"
                  << "  regime      " << boilRes.regime << "\n"
                  << "  q_CHF       " << std::setprecision(2) << toMW(q_CHF)
                  << " MW/m^2   [Zuber, RELIABLE +/-15%]   <- design ceiling\n"
                  << "  q_" << boilModel << "  " << std::setprecision(2)
                  << toMW(q_nucleate) << " MW/m^2   [INDICATIVE +/-100% : "
                  << boilModel << ", C_sf surface-finish lab data]\n"
                  << "  q scatter   [" << std::setprecision(2) << toMW(q_lo)
                  << ", " << toMW(q_hi) << "] MW/m^2   (C_sf +/-25% -> flux x2; "
                     "q ~ dT_excess^3 amplifies it)\n"
                  << "  CHF margin  q/q_CHF = " << std::setprecision(2) << margin
                  << "   " << (margin < 1.0 ? "SAFE (below burnout)"
                                            : "BURNOUT") << "\n"
                  << "  C_sf        " << std::setprecision(4) << C_sf
                  << "  [STUDENT-SUPPLIED; " << citation << "]\n"
                  << "  -- the cube: q ~ (dT_excess / C_sf)^3 -- a modest C_sf "
                     "error is amplified threefold --\n"
                  << "  Area (outside):      " << std::setprecision(4) << area
                  << " m^2   (" << nTubes << " x  pi D L)\n"
                  << "  h_fg @ Tsat:         " << std::setprecision(1)
                  << (h_fg_mass / 1000.0) << " kJ/kg\n"
                  << "  Heating medium:      T_in = " << std::setprecision(2)
                  << (T_med - 273.15) << " C,  h = " << std::setprecision(1)
                  << h_med << " W/(m^2.K)\n"
                  << "  -- surface-temperature iteration (q_boil == q_heat) --\n"
                  << "      it   T_surface     dT_excess     q_boil[MW/m2]   residual\n";
        for (const auto& r : trace)
            std::cout << "     " << std::setw(3) << r.it
                      << "   " << std::setprecision(2) << std::setw(9)
                      << (r.T_surface - 273.15)
                      << "   " << std::setw(9) << r.dT_excess
                      << "   " << std::setprecision(4) << std::setw(11)
                      << toMW(r.q_boil)
                      << "   " << std::scientific << std::setprecision(3)
                      << std::setw(11) << r.residual << std::fixed << "\n";
        std::cout << "  DUTY (result):       " << std::setprecision(4) << Q_kW
                  << " kW   (+ = heat added by boiling)\n"
                  << "  Outlet:              T_out = " << std::setprecision(3)
                  << T_out << " K,  vf_out = " << std::setprecision(5) << vf_out
                  << "\n"
                  << "=====================================================================\n\n";
    }

    // ---- Produced stream -------------------------------------------------
    produced_.clear();
    ProcessStream out;
    out.name = "out";
    out.F = F; out.T = T_out; out.P = P_out; out.z = z; out.vf = vf_out;
    produced_.push_back(out);

    // ---- KPIs ------------------------------------------------------------
    kpis_.clear();
    kpis_["Q"]            = Q_W;
    kpis_["Q_kW"]         = Q_kW;
    kpis_["T_in"]         = T_in;
    kpis_["T_out"]        = T_out;
    kpis_["Tsat"]         = Tsat;
    kpis_["T_surface"]    = T_surface;
    kpis_["dT_excess"]    = dT_excess;
    kpis_["q_nucleate"]   = q_nucleate;     // W/m^2
    kpis_["q_CHF"]        = q_CHF;          // W/m^2
    kpis_["chf_margin"]   = margin;
    // regime numeric code: 0 = nucleate (the only regime v1 reaches; film
    // boiling is refused via the CHF guard before it can occur).
    kpis_["regime"]       = 0.0;
    kpis_["area"]         = area;
    kpis_["vf_out"]       = vf_out;
    kpis_["vf_in"]        = 0.0;            // boiling mode boils a liquid feed
    kpis_["F"]            = F;
    kpis_["P"]            = P_out;

    return 0;
}

} // namespace Choupo
