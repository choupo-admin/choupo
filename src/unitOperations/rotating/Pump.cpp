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

#include "Pump.H"
#include "PumpSelection.H"
#include "core/PropertySourceLog.H"
#include "thermo/LiquidPropertyDoor.H"
#include "solver/NewtonRaphson.H"
#include "core/Advisory.H"
#include "unitOperations/flash/StreamEquilibrium.H"   // the ONE inlet-phase reading

#include <cmath>
#include <cstdio>
#include <iomanip>
#include <iostream>
#include <map>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

int Pump::solve(const DictPtr& dict,
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
    sVector x(n, 0.0);
    scalar zsum = 0.0;
    for (const auto& key : compDict->keys())
    {
        x[thermo.indexOf(key)] = compDict->lookupScalar(key);
        zsum += x[thermo.indexOf(key)];
    }
    for (auto& v : x) v /= zsum;

    // ---- THE INLET MUST BE A LIQUID (DEV.md 4c C188 defect 2) ------------
    //  The model below is the incompressible one -- W = v dP / eta on the
    //  liquid molar volume -- and the outlet is published as a liquid.  The
    //  inlet's phase was never read, so a vapour or a two-phase feed was
    //  "pumped" on a liquid volume and came out liquid, at exit 0.  The rule
    //  is this unit's DECLARED acceptance (`Pump::acceptance()` below, item 5
    //  of C188), applied by the one function that writes such a refusal, on
    //  the inlet read as it MEANS (`resolvedInletVaporFraction`, inside
    //  `acceptanceInletOf`).  An authored inlet was already checked before the
    //  first unit ran; a produced one is checked here.
    {
        const std::string locus =
            "pump '" + (dict->name().empty() ? type() : dict->name()) + "'";
        checkAcceptance(*this, acceptanceInletOf(feedDict, x, thermo, locus,
                        acceptance()), thermo, locus);
    }

    // ---- Efficiency: typed (the default), ESTIMATED, or read off a CURVE ---
    //  DEV.md 4c C441, two levels of choosing a pump (PumpSelection.H).
    //  `efficiency estimated;` + `selection {}` -> Gulich Eq. (T3.9.1);
    //  `curve <name>;` -> the maker's record.  Neither key present: the typed
    //  `eta`, exactly as before (no existing case moves).
    const std::string who = dict->name().empty() ? type() : dict->name();
    const bool hasSel   = operDict->found("selection");
    const bool hasCurve = operDict->found("curve");
    const bool estEta   = operDict->found("efficiency");
    if (estEta && operDict->lookupWord("efficiency") != "estimated")
        throw std::runtime_error("pump '" + who + "': `efficiency " + operDict->lookupWord("efficiency")
            + ";` -- the only word is `estimated` (Gulich Eq. T3.9.1 from the duty and the speed; needs a"
              " `selection { speed ...; }` block).  A typed efficiency is `eta <value>;`.");
    if (estEta && operDict->found("eta"))
        throw std::runtime_error("pump '" + who + "': both `eta` and `efficiency estimated;` -- one"
            " efficiency: type it, or have it estimated.");
    if (estEta && !hasSel)
        throw std::runtime_error("pump '" + who + "': `efficiency estimated;` needs `selection { speed <n> rpm;"
            " impeller <class> | suctionSpecificSpeed <nss>; }` -- the correlation is a function of the specific"
            " speed, which needs the speed.");
    if (hasCurve && (hasSel || estEta || operDict->found("eta")))
        throw std::runtime_error("pump '" + who + "': a `curve` carries the head AND the efficiency AND the NPSH"
            " required; `eta`, `efficiency` and `selection` are the GENERIC level and are refused beside it.");
    scalar eta = 0.0;
    if (!estEta && !hasCurve)
    {
        eta = operDict->lookupScalar("eta");
        if (eta <= 0.0 || eta > 1.0)
            throw std::runtime_error(
                "Pump: eta must satisfy 0 < eta <= 1 (got "
                + std::to_string(eta) + ")");
    }

    // ---- Liquid density (incompressible): THE PROPERTY KERNEL ------------
    //   rho at the INLET state from the kernel's methods (C378 pilot,
    //   thermo/liquidProperty/): the method is resolved once per
    //   constituent set and the kernel records the use; v_mix = MW_mix / rho.
    //   A dissolved ion with no volume is no longer left out silently: the
    //   case declares `approximations { massWithoutVolume { ... } }` (mass
    //   kept, no volume, bounded), or the kernel refuses by name.
    scalar MW_mix = 0.0;                                // kg/kmol
    for (std::size_t i = 0; i < n; ++i) MW_mix += x[i] * thermo.comp(i).MW();
    liquidProperty::Request densityAsk;
    densityAsk.thermo = &thermo; densityAsk.T = T_in; densityAsk.P = P_in; densityAsk.x = x;
    const scalar rho   = liquidProperty::density(densityAsk).value;   // kg/m^3
    const scalar M_mix = MW_mix * 1.0e-3;               // kg/mol
    const scalar v_mix = M_mix / rho;                   // m^3/mol
    //  THE HEAT CAPACITY IS NOT A VOLUME QUESTION (C378 pilot review, PA-04).
    //  A dissolved ion carries no liquid enthalpy datum, so the liquid heat
    //  capacity below is the solvent's, per mole of solution -- the C146
    //  dilute-solution reading, decided as it was before the pilot: by the
    //  component being a dissolved ion without a liquid volume of its own
    //  (an aqueous bridge and no liquid-volume route in its record: no
    //  Vliq and no critical constants), and ANNOUNCED.  The case's volume
    //  hypothesis `massWithoutVolume` is read by the DENSITY only; it never
    //  moves this share (a declaration on a component with a liquid Cp left
    //  the density unchanged and raised dT by half before this was split).
    scalar x_ions = 0.0;
    std::string ions;
    for (std::size_t i = 0; i < n; ++i)
        if (x[i] > 0.0 && thermo.liquidVolumeRouteOf(i) == ThermoPackage::LiquidVolumeRoute::none && thermo.comp(i).hasAqueousMapping())
        {
            x_ions += x[i];
            ions   += (ions.empty() ? "" : " ") + thermo.comp(i).name();
        }
    if (x_ions > 0.0)
    {
        char b[240];
        std::snprintf(b, sizeof(b), "dissolved ion(s) (%s) carry no liquid enthalpy"
            " datum: the liquid heat capacity is the solvent's, per mole of solution"
            " (dilute-solution reading; ion mole fraction %.3g neglected)",
            ions.c_str(), static_cast<double>(x_ions));
        AdvisoryLog::instance().add("approximation", "info",
            "pump '" + (dict->name().empty() ? type() : dict->name()) + "'", b);
        if (verbosity >= 2) std::cout << "  [pump] " << b << "\n";
    }

    const scalar F_mol_s = F * 1000.0;                  // mol/s
    const scalar Q_vol   = F_mol_s * v_mix;             // m^3/s  (set by the feed)

    // ---- Specification: EXACTLY ONE of W_shaft | P_out | dP -------------
    //   For an incompressible liquid the pump relation is invertible in
    //   CLOSED FORM:
    //        ΔP = eta · W_shaft / Q_vol    <->    W_shaft = Q_vol · ΔP / eta
    //   so the discharge pressure is just as DIRECT a spec as the shaft
    //   power -- give one, the other falls out.  No DesignSpec, no iteration.
    //   Specifying P_out is the natural engineering case (a pump feeds a
    //   header of known pressure); specifying W_shaft is the "this motor,
    //   what do I get" case.  Both are honest, both one-shot.
    const bool hasW  = operDict->found("W_shaft");
    const bool hasP  = operDict->found("P_out");
    const bool hasDP = operDict->found("dP");
    const int  nSpec = (hasW ? 1 : 0) + (hasP ? 1 : 0) + (hasDP ? 1 : 0);
    if (hasCurve && nSpec != 0)
        throw std::runtime_error("pump '" + who + "': a pump on a declared `curve` sets its OWN head -- the"
            " pressure rise is the curve's H(Q) at the feed's flow, so `W_shaft`, `P_out` and `dP` are"
            " refused beside it (an over-specification).  Remove the spec; the discharge pressure and the"
            " shaft power are results.");
    if (estEta && hasW)
        throw std::runtime_error("pump '" + who + "': `efficiency estimated;` needs the pressure rise (`P_out` or"
            " `dP`): the efficiency is a function of the head, and with `W_shaft` given the head is itself a"
            " function of the efficiency.");
    if (!hasCurve && nSpec != 1)
        throw std::runtime_error(
            "Pump: specify EXACTLY ONE of 'W_shaft', 'P_out', or 'dP' in "
            "operation (got " + std::to_string(nSpec) + ").  W_shaft -> the "
            "pressure rise is the result; P_out / dP -> the shaft power is "
            "the result.  Both are closed-form for an incompressible liquid "
            "-- no DesignSpec needed.");

    scalar W_shaft = 0.0, dP = 0.0;
    std::string specMode;

    //  ---- LEVEL 1 inputs (the generic pump) and LEVEL 2 (the curve) ------
    //  Every number the selection prints is an ESTIMATE of Gulich's; each
    //  reading is announced.  Read here so the efficiency is known before
    //  the shaft power is.
    scalar n_rpm = 0.0, Qbep = Q_vol, nss = 0.0, porLo = pumpSelection::porLowDefault,
           porHi = pumpSelection::porHighDefault;
    std::string nssBasis, QbepBasis;
    scalar z_e = 0.0, c_e = 0.0, Hv_s = 0.0;
    pumpSelection::Curve curve;
    if (hasSel)
    {
        const DictPtr sel = operDict->subDict("selection");
        n_rpm = sel->lookupScalar("speed", Dims::inverseTime) * 60.0;
        if (!(n_rpm > 0.0))
            throw std::runtime_error("pump '" + who + "': selection { speed } must be positive.");
        if (sel->found("suctionSpecificSpeed") == sel->found("impeller"))
            throw std::runtime_error("pump '" + who + "': selection needs EXACTLY ONE of `impeller <class>;` (the"
                " lower limit of the Table D6.1 row, Gulich p. 320: the conservative end, a larger NPSH3) or"
                " `suctionSpecificSpeed <nss>;` (a maker's value).");
        if (sel->found("impeller"))
        {
            scalar lo = 0.0, hi = 0.0; std::string row;
            pumpSelection::suctionSpecificSpeedClass(sel->lookupWord("impeller"), lo, hi, row);
            nss = lo;
            char b[300];
            std::snprintf(b, sizeof b, "Table D6.1 (Gulich p. 320): %s: nss %.0f to %.0f, the lower limit taken",
                          row.c_str(), static_cast<double>(lo), static_cast<double>(hi));
            nssBasis = b;
        }
        else
        {
            nss = sel->lookupScalar("suctionSpecificSpeed");
            nssBasis = "declared by the case";
        }
        if (!(nss > 0.0))
            throw std::runtime_error("pump '" + who + "': the suction specific speed must be positive.");
        if (sel->found("Qbep"))
        {
            Qbep = sel->lookupScalar("Qbep", Dims::volumetricFlow);
            QbepBasis = "declared: the best-efficiency flow of the pump chosen";
        }
        else QbepBasis = "assumed equal to the duty flow (the pump is taken as chosen with its BEP at the duty)";
        if (sel->found("preferredRange"))
        {
            const auto r = sel->lookupList("preferredRange");
            if (r.size() != 2 || !(r[0] > 0.0 && r[1] > r[0]))
                throw std::runtime_error("pump '" + who + "': selection { preferredRange ( low high ); } -- two"
                    " ratios of Q/Qbep, 0 < low < high.");
            porLo = r[0]; porHi = r[1];
        }
    }
    if (operDict->found("suction"))
    {
        const DictPtr su = operDict->subDict("suction");
        z_e  = su->lookupScalarOrDefault("staticHead", 0.0);
        c_e  = su->lookupScalarOrDefault("inletVelocity", 0.0);
        Hv_s = su->lookupScalarOrDefault("lineLoss", 0.0);
    }
    if (hasCurve)
        curve = pumpSelection::readCurve(operDict->lookupWord("curve"), "pump '" + who + "'");

    if (hasCurve)                                       // the maker's head -> dP, eta from the curve
    {
        const auto pt = curve.at(Q_vol, "pump '" + who + "'");
        eta = pt.eta;
        dP  = rho * pumpSelection::g * pt.H;
        W_shaft = Q_vol * dP / eta;
        specMode = "curve `" + curve.name + "` (H, eta at the feed's flow) -> P_out, W_shaft (results)";
    }
    else if (hasW)                                      // power given -> dP result
    {
        W_shaft = operDict->lookupScalar("W_shaft", Dims::power);
        if (W_shaft <= 0.0)
            throw std::runtime_error("Pump: W_shaft must be positive.  Got "
                + std::to_string(W_shaft) + " W");
        dP = (Q_vol > 0.0) ? (eta * W_shaft / Q_vol) : 0.0;
        specMode = "W_shaft (given) -> P_out (result)";
    }
    else                                                // pressure given -> W result
    {
        dP = hasP ? (operDict->lookupScalar("P_out", Dims::pressure) - P_in)
                  :  operDict->lookupScalar("dP", Dims::pressure);
        if (dP <= 0.0)
            throw std::runtime_error(
                "Pump: the discharge pressure must EXCEED the inlet (a pump "
                "raises pressure).  Got dP = " + std::to_string(dP / 1.0e5)
                + " bar.  For a pressure let-down, use a 'valve'.");
        if (estEta)
        {
            //  Gulich Eq. (T3.9.1) at the duty: the head the pump must give
            //  fixes nq, nq and Q fix the efficiency; refused outside its window.
            const scalar H_duty = dP / (rho * pumpSelection::g);
            const scalar nqe = pumpSelection::specificSpeed(n_rpm, Qbep, H_duty);
            const std::string why = pumpSelection::efficiencyWindowRefusal(Qbep, nqe);
            if (!why.empty()) throw std::runtime_error("pump '" + who + "': " + why + ".");
            eta = pumpSelection::etaOptimum(Qbep, nqe);
        }
        W_shaft  = Q_vol * dP / eta;
        specMode = std::string(hasP ? "P_out" : "dP") + " (given) -> W_shaft (result)"
                 + (estEta ? "; eta ESTIMATED (Gulich Eq. T3.9.1)" : "");
    }

    // ---- Closed-form discharge ------------------------------------------
    const scalar P_out   = P_in + dP;
    const scalar w_real  = (F_mol_s > 0.0) ? (W_shaft / F_mol_s) : 0.0; // J/mol
    const scalar w_isen  = eta * w_real;                // useful v*dP part

    // Discharge temperature.
    //
    // Generic (incompressible) model: the USEFUL part of the work (w_isen =
    // v*dP) is stored as pressure and only the LOSS (w_real - w_isen) heats the
    // liquid, T_out = T_in + loss/Cp_liq.  This implicitly assumes h depends
    // only on T -- exact for a truly incompressible liquid whose enthalpy datum
    // has no pressure term.
    //
    // Pure-fluid (IF97 et al.) override: on a real fundamental-equation surface
    // the compressed-liquid enthalpy DOES carry the v*dP term, so the only
    // energy-consistent discharge state is the one whose ABSOLUTE enthalpy rose
    // by the full shaft work:  H_real(T_out, P_out) = H_real(T_in, P_in) +
    // w_real.  Solving that on the IF97 surface makes the pump's dH equal its
    // W_shaft to machine precision -- without it a closed IF97 loop carries a
    // pump-sized first-law residual (the incompressible model and IF97 disagree
    // on compressed-liquid h).  Additive: only fires for an effectively-pure
    // pure-fluid component; every existing (incompressible) pump case is
    // byte-identical.
    scalar T_out;
    bool pureRoute = false;
    {
        std::size_t dom = 0;
        for (std::size_t i = 1; i < n; ++i) if (x[i] > x[dom]) dom = i;
        pureRoute = thermo.hasPureFluid(dom)
                 && ThermoPackage::isEffectivelyPure(x, dom);
    }
    if (pureRoute)
    {
        //  A computed inlet its world places across the line beyond the band
        //  never reaches this point: the flowsheet refuses it at the hand-over
        //  (flashState::heldPhaseBeyondBandRefusal, review TD-04 / TD-17).
        const scalar h_target = thermo.H_real(T_in, P_in, x, DensityPhase::Liquid) + w_real;
        const std::string who = dict->name().empty() ? type() : dict->name();
        //  The liquid branch's upper end at P_out: T_sat(P_out) when the
        //  pure fluid has a saturation line there (set below), else the
        //  search's old ceiling.
        scalar T_liquidTop = 620.0;
        //  THE PUMP NEVER PUBLISHES AN OUTLET IT DID NOT FIND (2026-05-30
        //  rule, TD-04 follow-up).  Its model publishes a LIQUID: when the
        //  enthalpy the balance asks for lies above the saturated liquid's at
        //  P_out, the losses have heated the liquid past T_sat(P_out) and no
        //  liquid outlet exists.  Decided by enthalpy, not by where a Newton
        //  stopped; refused, never replaced by T_in.
        if (const auto i = thermo.pureFluidCarrying(x))
        {
            const PureFluidModel& pm = *thermo.pureFluidModel(*i);
            const auto w = pm.saturationWindow();
            //  Above the critical pressure there is no saturation line: T_sat
            //  is not asked (IF97 refuses it), the outlet is single-phase.
            const bool hasSatLine = P_out <= pm.p_sat(w.second - 1.0e-9);
            const scalar Ts = hasSatLine ? pm.T_sat(P_out) : 0.0;
            if (hasSatLine && Ts >= w.first && Ts < w.second)
            {
                const scalar hL = thermo.H_real(Ts, P_out, x, DensityPhase::Liquid);
                T_liquidTop = Ts;
                if (h_target > hL)
                {
                    char b[900];
                    std::snprintf(b, sizeof b, "pump '%s': no LIQUID outlet "
                        "carries the energy balance of inlet '%s'.  T_in = "
                        "%.10g K, P_out = "
                        "%.10g Pa, T_sat(P_out) = %.10g K; the balance asks "
                        "h = %.6f J/mol (inlet + shaft work at eta = %.6g) "
                        "against the saturated liquid's %.6f J/mol at P_out: "
                        "the losses heat the liquid past its saturation "
                        "temperature at the discharge pressure.  A pump model "
                        "publishes a liquid: raise the discharge pressure or "
                        "the efficiency; a flashing discharge is not this "
                        "unit's model.", who.c_str(),
                        feedDict->lookupWordOrDefault("streamName", "?").c_str(),
                        T_in, P_out, Ts,
                        h_target, eta, hL);
                    throw std::runtime_error(b);
                }
            }
        }
        auto f  = [&](scalar T){ return thermo.H_real(T, P_out, x, DensityPhase::Liquid) - h_target; };
        //  The central difference of 0.25 K as before; within 0.25 K of
        //  T_sat(P_out) a BACKWARD one, so the slope never asks the liquid
        //  above the search's upper bracket.
        auto df = [&](scalar T){
            const scalar d = 0.25;
            if (T + d > T_liquidTop) return (f(T) - f(T - d)) / d;
            return (f(T + d) - f(T - d)) / (2.0 * d);
        };
        //  THE SEARCH STAYS ON THE LIQUID BRANCH (C378 pilot round 2, the
        //  merge with the phase branch): the root lies in [T_in, T_sat(P_out)]
        //  -- f(T_in) < 0 because the shaft work exceeds v dP, f(T_sat) >= 0
        //  because the refusal above did not fire -- so that is the bracket.
        //  With the old bracket [274, 620] K and a start at T_in + 0.5 K, a
        //  discharge 0.9 K below its saturation line (550 K, dP 1 bar) sent
        //  the Newton across the line and the search did not converge, though
        //  the liquid root exists.  The finite-difference step is kept inside
        //  the bracket too.
        const scalar Tlo = T_in - 1.0e-6;
        const scalar Thi = T_liquidTop;
        solver::NROptions o;
        o.tolerance = 1.0e-4; o.maxIter = 60;
        o.lower = Tlo < Thi ? Tlo : 274.0; o.upper = Thi;
        o.bracket = true; o.monotoneIncreasing = true; o.maxStep = 50.0;
        const scalar T0 = std::min(T_in + 0.5, 0.5 * (T_in + Thi));
        auto r = solver::newton1D(f, df, T0, o);
        if (!r.converged)
            throw std::runtime_error("pump '" + who + "': the discharge "
                "search H_real(T_out, P_out) = h_in + w did not converge on "
                "the pure-fluid surface -- no outlet temperature is published "
                "in place of one it did not find");
        T_out = r.x;
    }
    else
    {
        // Liquid Cp from a finite difference of the liquid enthalpy.
        const scalar dT = 0.5;
        //  The dilute-solution reading of the volume above holds for the
        //  heat capacity too: dissolved ions carry no liquid enthalpy datum,
        //  so Cp is the solvent's, per mole of solution (C146, announced
        //  with the volume).  Without ions xCp IS x -- byte-identical.
        sVector xCp = x;
        scalar  solventShare = 1.0;
        if (x_ions > 0.0)
        {
            for (std::size_t i = 0; i < n; ++i)
                if (thermo.liquidVolumeRouteOf(i) == ThermoPackage::LiquidVolumeRoute::none && thermo.comp(i).hasAqueousMapping())
                    xCp[i] = 0.0;
            solventShare = 1.0 - x_ions;
            for (auto& v : xCp) v /= solventShare;
        }
        const scalar Cp_liq = solventShare *
            (thermo.Hliquid(T_in + dT, xCp) - thermo.Hliquid(T_in - dT, xCp))
            / (2.0 * dT);
        const scalar dT_rise = (Cp_liq > 0.0)
            ? (w_real - w_isen) / Cp_liq
          : 0.0;
        T_out = T_in + dT_rise;

        //  THE PUMP SOLVES THE STREAM BALANCE (DEV.md 4c C390).  The liquid
        //  enthalpy of the generic surface now carries the pressure term
        //  v (1 - alpha T) dP (ThermoPackage::liquidPressureLeg), so the
        //  discharge state is the one whose ABSOLUTE stream enthalpy rose by
        //  the full shaft work, H(T_out, P_out) = H(T_in, P_in) + w_real --
        //  what the pure-fluid branch above has always done -- and the
        //  unit's first law closes by construction.  The closed form above
        //  (only the loss heats the liquid) is the starting estimate and the
        //  FALLBACK, announced, for a stream with no enthalpy route (a
        //  dissolved salt with no liquid heat capacity).
        bool streamSolved = false;
        std::string streamWhy;
        try
        {
            const scalar h_target = thermo.H_stream_formation(T_in, P_in, 0.0, x) + w_real;
            auto f  = [&](scalar T){ return thermo.H_stream_formation(T, P_out, 0.0, x) - h_target; };
            auto df = [&](scalar T){
                const scalar d = 0.25;
                return (f(T + d) - f(T - d)) / (2.0 * d);
            };
            solver::NROptions o;
            o.tolerance = 1.0e-6; o.maxIter = 60;
            o.lower = T_in - 1.0e-6; o.upper = T_in + 300.0;
            o.bracket = true; o.monotoneIncreasing = true; o.maxStep = 50.0;
            auto r = solver::newton1D(f, df, T_out, o);
            if (r.converged && std::isfinite(r.x))
            {
                T_out = r.x;
                streamSolved = true;
            }
            else streamWhy = "the discharge search did not converge";
        }
        catch (const std::exception& e) { streamWhy = e.what(); }
        if (!streamSolved && verbosity >= 2)
            std::cout << "  [pump] the stream-enthalpy balance could not be solved ("
                      << streamWhy << "); the closed form (only the loss heats the"
                         " liquid) is kept\n";

        if (!streamSolved)
        //  NO SILENT CRUTCH (2026-05-30), applied to an ENERGY term rather
        //  than to a solver aid.  On this surface the liquid enthalpy is
        //  h(T) with NO pressure argument (`ThermoPackage::Hliquid(T, x)`),
        //  so of the shaft work only the LOSS has somewhere to go: it raises
        //  T above.  The USEFUL part, w_isen = eta * w_real = v*dP, is the
        //  term this surface cannot express -- for an incompressible liquid
        //  dh = Cp dT + v dP and the second term has no home here -- so the
        //  outlet stream does not carry it and the unit's own first law
        //  closes to (1 - eta) W_shaft.  The residual is then EXACTLY the
        //  pump's declared efficiency: `pump01_water` declares eta 0.65 and
        //  its plant-boundary residual is pinned at 65.0000 %.
        //
        //  The engine cannot decide whether that matters to this reader, so
        //  it ANNOUNCES and judges nothing -- the CatalystPellet posture.
        //  The remedy is a DECLARATION, not a flag: a pure-fluid method
        //  (`pureFluids { <component> { method ...; } }`) puts the pressure
        //  term back on the surface, and the pure route above then solves
        //  H_real(T_out, P_out) = H_real(T_in, P_in) + w_real, which makes
        //  dH equal W_shaft to machine precision.  `rankine02_water` takes
        //  that route and is in neither energy-debt ledger.
        {
            std::size_t dom = 0;
            for (std::size_t i = 1; i < n; ++i) if (x[i] > x[dom]) dom = i;
            //  THE NUMBER IS NOT IN THE SENTENCE: it already has a home.
            //  This unit publishes it as `W_hydraulic` and prints it on its
            //  own banner below, so repeating it here would be a second home
            //  for a value the first one owns -- and a value that ITERATES,
            //  since a pump inside an operating-point search is solved again
            //  at every trial.  The sentence states the RELATION and points
            //  at the published number.
            //
            //  MEASURED, and it corrects a guess made while writing this:
            //  taking the number out does NOT make the site line appear once
            //  under an outer driver.  `pumpSystem01_operating_point` prints
            //  it 13 times either way -- because that case runs 13 PASSES and
            //  each pass is a fresh functor with a fresh AdvisoryLog, so
            //  `isNew` is true again every time.  Its own `[driver]` line
            //  repeats exactly 13 times beside it.  One line per pass is this
            //  house's cadence, not a defect in this announcement; the
            //  end-of-run caveat block still reports ONE named pass
            //  (2026-09-07).
            const std::string message =
                "the liquid enthalpy on this thermophysical surface is h(T)"
                " with no pressure term, so the useful shaft work v*dP"
                " (= eta * W_shaft, this unit's `W_hydraulic` KPI) is"
                " NOT carried by the outlet stream -- only the loss"
                " (1 - eta) W_shaft raises its temperature.  This unit's"
                " first law therefore closes to (1 - eta) W_shaft and the"
                " plant-boundary residual it produces is exactly eta."
                "  Declare a pure-fluid method for '"
                + thermo.comp(dom).name() + "' (`pureFluids { "
                + thermo.comp(dom).name() + " { method <m>; } }`) to put the"
                " pressure term on the surface; the pump then solves for the"
                " discharge state whose ABSOLUTE enthalpy rose by the full"
                " shaft work.";

            const bool isNew = AdvisoryLog::instance().add(
                "model", "info", "pump (incompressible liquid route)", message);
            if (isNew && verbosity >= 2)
                std::cout << "  [pump] " << message << "\n";
        }
    }

    const scalar W_isen_kW = (W_shaft * eta) / 1000.0;

    // Pump head h = dP / (rho g), rho the kernel's (above).
    const scalar head_m = dP / (rho * 9.80665);

    // ---- THE SELECTION (C441): generic estimates, or the maker's curve ----
    //  NPSHA is the flowsheet's own: the inlet stream's pressure and
    //  temperature against the liquid's vapour pressure (Gulich Eq. T2.2.8,
    //  p. 52).  p_v is the Raoult bubble pressure sum x_i Psat_i(T_in), from
    //  the one door to the saturation curve; a dissolved ion with no curve is
    //  non-volatile.  An ESTIMATE for a non-ideal mixture, said so below.
    std::map<std::string, scalar> sel;
    std::vector<std::string> selLines;
    if (hasSel || hasCurve)
    {
        auto fmt = [](const char* f, double a, double b = 0.0, double c = 0.0, double d = 0.0)
        {
            char buf[420]; std::snprintf(buf, sizeof buf, f, a, b, c, d); return std::string(buf);
        };
        scalar p_v = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            if (x[i] <= 0.0) continue;
            if (thermo.hasSaturationCurve(i)) p_v += x[i] * thermo.Psat(i, T_in);
            else if (!thermo.comp(i).hasAqueousMapping())
                throw std::runtime_error("pump '" + who + "': no saturation curve for '" + thermo.comp(i).name()
                    + "', so the NPSH available cannot be formed (Gulich Eq. T2.2.8 needs p_v).");
        }
        const scalar npsha = pumpSelection::npshAvailable(P_in, p_v, rho, z_e, c_e, Hv_s);
        scalar npshReq = 0.0, qStar = 1.0;
        std::string tag;
        if (hasSel)
        {
            tag = "estimated";
            const scalar nq = pumpSelection::specificSpeed(n_rpm, Qbep, head_m);
            const std::string why = pumpSelection::efficiencyWindowRefusal(Qbep, nq);
            scalar etaOpt = 0.0;
            if (why.empty()) etaOpt = pumpSelection::etaOptimum(Qbep, nq);
            else if (estEta) throw std::runtime_error("pump '" + who + "': " + why + ".");
            npshReq = pumpSelection::npsh3FromNss(n_rpm, Qbep, nss);
            qStar = Q_vol / Qbep;
            selLines.push_back(fmt("  Duty:            Q = %.5g m3/h   H = %.4g m   speed = %.5g rpm", Q_vol * 3600.0, head_m, n_rpm));
            selLines.push_back("  Qbep:            " + fmt("%.5g m3/h", Qbep * 3600.0) + "   (" + QbepBasis + ")");
            selLines.push_back(fmt("  Specific speed:  nq = %.4g   [estimated: Gulich Eq. T3.4.15, p. 154; n sqrt(Q)/H^0.75, rpm, m3/s, m]", nq));
            if (why.empty())
            {
                const scalar band = pumpSelection::etaUncertainty(etaOpt);
                selLines.push_back(fmt("  Efficiency:      eta_opt = %.4f  +- %.3f   [estimated: Gulich Eq. T3.9.1 p. 163; band Eq. T3.9.10]", etaOpt, band)
                                   + (estEta ? "  -> USED for the shaft power" : "  (typed eta " + fmt("%.4f", eta) + " is the one used)"));
                sel["eta_estimated"] = etaOpt;
                sel["eta_uncertainty"] = band;
                if (std::fabs(qStar - 1.0) > 1.0e-9)
                    selLines.push_back("                   (the BEP value: the part-load / overload efficiency is not estimated)");
            }
            else selLines.push_back("  Efficiency:      not estimated -- " + why);
            selLines.push_back(fmt("  NPSH3 (BEP):     %.4g m   [estimated: nss = %.0f from ", npshReq, nss) + nssBasis
                               + "; Gulich Eq. 6.7 p. 320 inverted]");
            selLines.push_back("                   (at part load or overload the true NPSH3 is higher than the BEP value)");
            sel["nq"] = nq;
            sel["npsh3_m"] = npshReq;
            sel["suction_specific_speed"] = nss;
        }
        else
        {
            tag = "curve";
            const auto pt = curve.at(Q_vol, "pump '" + who + "'");
            npshReq = pt.NPSHr;
            selLines.push_back("  Curve:           `" + curve.name + "`  (" + curve.where + ", kind " + curve.kind + ")");
            if (curve.kind == "illustrative")
                selLines.push_back("                   ILLUSTRATIVE RECORD: constructed to teach, NOT a manufacturer's curve");
            selLines.push_back("                   source: " + curve.citation);
            selLines.push_back(fmt("  Curve range:     Q = %.5g .. %.5g m3/h  (taken at %.5g rpm, ", curve.Q.front() * 3600.0, curve.Q.back() * 3600.0, curve.speed_rpm)
                               + curve.fluid + "; no extrapolation)");
            selLines.push_back(fmt("  At the duty:     Q = %.5g m3/h   H = %.4g m   eta = %.4f   NPSHr = %.4g m   [read off the curve, linear between rows]", Q_vol * 3600.0, pt.H, pt.eta, pt.NPSHr));
            selLines.push_back("                   no viscosity or speed correction: head in metres is used as read (Gulich Ch. 13 not applied)");
            sel["npsh3_m"] = npshReq;
        }
        const scalar npshaMin = pumpSelection::npshaMinimum(npshReq);
        const scalar F_npsh = npsha / npshReq;
        selLines.push_back(fmt("  NPSHA:           %.4g m   [Gulich Eq. T2.2.8 p. 52: (P_in %.4g bar - p_v %.4g bar)/(rho g) + z_e + c_e^2/2g - H_v,s;", npsha, P_in / 1.0e5, p_v / 1.0e5)
                           + fmt(" z_e %.3g m, c_e %.3g m/s, H_v,s %.3g m; p_v the Raoult bubble pressure at T_in]", z_e, c_e, Hv_s));
        selLines.push_back(fmt("  NPSH margin:     F_NPSH = NPSHA/NPSH3 = %.3f;  minimum NPSHA = %.4g m (max of 1.25 NPSH3 and NPSH3 + 0.6 m, Gulich Table 6.2 p. 379)", F_npsh, npshaMin));
        selLines.push_back(npsha >= npshaMin ? "                   -> margin ADEQUATE for the Table 6.2 minimum (criterion C1; the u1-based rule needs the impeller, not asked)"
                                             : "                   -> margin BELOW the Table 6.2 minimum: raise the suction pressure, lower the line loss or the liquid temperature, or choose a pump of lower NPSH");
        if (hasSel)
        {
            const bool inPOR = qStar > porLo && qStar < porHi;
            selLines.push_back(fmt("  Operating region: q* = Q/Qbep = %.3f; preferred operation range %.2f < q* < %.2f ", qStar, porLo, porHi)
                               + (inPOR ? "-> INSIDE" : "-> OUTSIDE")
                               + "  [Gulich Sect. 10.9 p. 806: 0.85..1.1 is the contract example; the standards (API 610 / ISO 13709, Hydraulic Institute) fix their own]");
            sel["q_star"] = qStar;
            sel["in_preferred_range"] = inPOR ? 1.0 : 0.0;
        }
        else
        {
            sel["q_star"] = 0.0;
        }
        sel["npsha_m"] = npsha;
        sel["npsh_min_m"] = npshaMin;
        sel["npsh_margin"] = F_npsh;
        sel["p_vapour"] = p_v;
        sel["npsh_adequate"] = npsha >= npshaMin ? 1.0 : 0.0;
        if (hasCurve) sel.erase("q_star");
        const std::string msg = hasSel
            ? "pump selection ESTIMATED from Gulich (specific speed, efficiency, NPSH3 from the suction specific speed)"
              " -- a generic pump with no catalogue; every number marked `estimated` is a statistical value"
            : "pump on the case's declared curve `" + curve.name + "` (" + curve.kind + " record)";
        AdvisoryLog::instance().add("model", "info", "pump '" + who + "'", msg);
        if (verbosity >= 2)
        {
            std::cout << "\n---- Pump selection (" << (hasSel ? "generic, ESTIMATED" : "manufacturer's curve") << ") ----\n";
            for (const auto& l : selLines) std::cout << l << "\n";
        }
    }

    if (verbosity >= 2)
    {
        std::cout << "\n==============================  Pump Result  ========================\n"
                  << "  Spec mode:       " << specMode << "\n"
                  << "  Hardware:        W_shaft = " << std::fixed << std::setprecision(3)
                  << (W_shaft / 1000.0) << "  kW   |   eta = "
                  << std::setprecision(4) << eta << "\n"
                  << "  P_in:            " << std::fixed << std::setprecision(3)
                  << (P_in / 1.0e5)  << "  bar     T_in:        "
                  << std::setprecision(2) << T_in   << "  K  ( " << (T_in - 273.15)  << " degC )\n"
                  << "  P_out:           " << std::fixed << std::setprecision(3)
                  << (P_out / 1.0e5) << "  bar     T_out:       "
                  << std::setprecision(2) << T_out  << "  K  ( " << (T_out - 273.15) << " degC )\n"
                  << "  dP:              " << std::fixed << std::setprecision(3)
                  << (dP / 1.0e5) << "  bar       head ~ "
                  << std::setprecision(1) << head_m << " m\n"
                  << "  v_molar (liq):   " << std::scientific << std::setprecision(4)
                  << v_mix << "  m3/mol  (incompressible)\n"
                  << "  W_hydraulic:     " << std::fixed << std::setprecision(3)
                  << W_isen_kW << "  kW   (eta * W_shaft = useful v*dP)\n"
                  << "  dT (dissipation):" << std::fixed << std::setprecision(4)
                  << (T_out - T_in) << "  K   ((1-eta) W_shaft heats the liquid)\n"
                  << "=====================================================================\n\n";
    }

    // ---- Produced stream -------------------------------------------------
    produced_.clear();
    ProcessStream out;
    out.name = "out";
    out.F    = F;
    out.T    = T_out;
    out.P    = P_out;
    out.z    = x;
    out.vf   = 0.0;     // liquid
    produced_.push_back(out);

    // ---- KPIs -----------------------------------------------------------
    kpis_.clear();
    kpis_["W_shaft"]      = W_shaft;
    kpis_["W_shaft_kW"]   = W_shaft / 1000.0;
    kpis_["W_hydraulic"]  = W_shaft * eta;
    kpis_["eta"]          = eta;
    kpis_["P_in"]         = P_in;
    kpis_["P_out"]        = P_out;
    kpis_["dP"]           = dP;
    kpis_["head_m"]       = head_m;
    kpis_["T_in"]         = T_in;
    kpis_["T_out"]        = T_out;
    kpis_["dT"]           = T_out - T_in;
    kpis_["v_molar_liq"]  = v_mix;
    kpis_["F"]            = F;
    for (const auto& kv : sel) kpis_[kv.first] = kv.second;   // the selection block, only when asked

    return 0;
}

//  WHAT THE PUMP ACCEPTS (DEV.md 4c C188 item 5): a liquid, and nothing
//  else -- every component it is handed is pumped (its density is the
//  property kernel's; a component without a volume needs the case's
//  declared hypothesis massWithoutVolume, else the kernel refuses).
UnitAcceptance Pump::acceptance() const
{
    UnitAcceptance a;
    a.declared = true;
    a.phases.liquid = true;
    a.phases.vapour = false;
    a.phases.why = "The pump model is the incompressible one, W = v dP / eta"
        " on the LIQUID molar volume, and its outlet is a liquid; a vapour fed"
        " to it would be priced on a volume it does not have (and a real pump"
        " fed vapour loses its prime).";
    a.phases.remedy = "subcool the feed (a cooler, or a higher suction"
        " pressure) so it arrives liquid, or use a `compressor` for a gas.";
    return a;
}

} // namespace Choupo
