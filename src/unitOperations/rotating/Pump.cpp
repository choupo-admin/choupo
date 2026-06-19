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
#include "solver/NewtonRaphson.H"

#include <cmath>
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

    // ---- Efficiency (always required) -----------------------------------
    const scalar eta = operDict->lookupScalar("eta");
    if (eta <= 0.0 || eta > 1.0)
        throw std::runtime_error(
            "Pump: eta must satisfy 0 < eta <= 1 (got "
            + std::to_string(eta) + ")");

    // ---- Liquid molar volume (incompressible) ---------------------------
    //   v_mix = Σ x_i v_liq,i   [m^3/mol].  Requires every component to
    //   carry Vliq in its.dat (liquids do).
    scalar v_mix = 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        const scalar vi = thermo.comp(i).Vliq();
        if (x[i] > 0.0 && vi <= 0.0)
            throw std::runtime_error(
                "Pump: component '" + thermo.comp(i).name()
                + "' has no liquid molar volume (Vliq) in its.dat --- "
                "required for the incompressible pump model");
        v_mix += x[i] * vi;
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
        const scalar h_target = thermo.H_real(T_in, P_in, x) + w_real;
        auto f  = [&](scalar T){ return thermo.H_real(T, P_out, x) - h_target; };
        auto df = [&](scalar T){
            const scalar d = 0.25;
            return (f(T + d) - f(T - d)) / (2.0 * d);
        };
        solver::NROptions o;
        o.tolerance = 1.0e-4; o.maxIter = 60; o.lower = 274.0; o.upper = 620.0;
        o.bracket = true; o.monotoneIncreasing = true; o.maxStep = 50.0;
        auto r = solver::newton1D(f, df, T_in + 0.5, o);
        T_out = r.converged ? r.x : T_in;
    }
    else
    {
        // Liquid Cp from a finite difference of the liquid enthalpy.
        const scalar dT = 0.5;
        const scalar Cp_liq =
            (thermo.Hliquid(T_in + dT, x) - thermo.Hliquid(T_in - dT, x))
            / (2.0 * dT);
        const scalar dT_rise = (Cp_liq > 0.0)
            ? (w_real - w_isen) / Cp_liq
          : 0.0;
        T_out = T_in + dT_rise;
    }

    const scalar W_isen_kW = (W_shaft * eta) / 1000.0;

    // Pump head h = dP / (rho g).  rho = MW_mix / v_mix, with
    // MW_mix in kg/mol (Component.MW() is kg/kmol -> /1000).
    scalar MW_mix = 0.0;                                // kg/kmol
    for (std::size_t i = 0; i < n; ++i) MW_mix += x[i] * thermo.comp(i).MW();
    const scalar rho = (v_mix > 0.0)
        ? (MW_mix / 1000.0) / v_mix                     // kg/m^3
      : 1000.0;
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

} // namespace Choupo
