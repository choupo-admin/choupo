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
#include "core/PropertySourceLog.H"
#include "thermo/LiquidPropertyDoor.H"
#include "solver/NewtonRaphson.H"
#include "core/Advisory.H"
#include "unitOperations/flash/StreamEquilibrium.H"   // the ONE inlet-phase reading

#include <cmath>
#include <cstdio>
#include <iomanip>
#include <iostream>
#include <stdexcept>

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

    // ---- Efficiency (always required) -----------------------------------
    const scalar eta = operDict->lookupScalar("eta");
    if (eta <= 0.0 || eta > 1.0)
        throw std::runtime_error(
            "Pump: eta must satisfy 0 < eta <= 1 (got "
            + std::to_string(eta) + ")");

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
    //  (an aqueous bridge and no `Vliq`), and ANNOUNCED.  The case's volume
    //  hypothesis `massWithoutVolume` is read by the DENSITY only; it never
    //  moves this share (a declaration on a component with a liquid Cp left
    //  the density unchanged and raised dT by half before this was split).
    scalar x_ions = 0.0;
    std::string ions;
    for (std::size_t i = 0; i < n; ++i)
        if (x[i] > 0.0 && thermo.comp(i).Vliq() <= 0.0 && thermo.comp(i).hasAqueousMapping())
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
    if (nSpec != 1)
        throw std::runtime_error(
            "Pump: specify EXACTLY ONE of 'W_shaft', 'P_out', or 'dP' in "
            "operation (got " + std::to_string(nSpec) + ").  W_shaft -> the "
            "pressure rise is the result; P_out / dP -> the shaft power is "
            "the result.  Both are closed-form for an incompressible liquid "
            "-- no DesignSpec needed.");

    scalar W_shaft = 0.0, dP = 0.0;
    std::string specMode;
    if (hasW)                                           // power given -> dP result
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
        W_shaft  = Q_vol * dP / eta;
        specMode = std::string(hasP ? "P_out" : "dP") + " (given) -> W_shaft (result)";
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
            const scalar Ts = pm.T_sat(P_out);
            if (Ts >= w.first && Ts < w.second
                && P_out <= pm.p_sat(w.second - 1.0e-9))
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
                if (thermo.comp(i).Vliq() <= 0.0 && thermo.comp(i).hasAqueousMapping())
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
