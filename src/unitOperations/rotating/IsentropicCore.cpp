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

#include "IsentropicCore.H"
#include "core/Constants.H"
#include "solver/NewtonRaphson.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {
namespace rotating {

scalar solveT_for_S(const ThermoPackage& thermo, scalar s_target,
                    scalar P_Pa, const sVector& y, scalar T_guess)
{
    auto f  = [&](scalar T) { return thermo.S_real(T, P_Pa, y) - s_target; };
    auto df = [&](scalar T) {
        const scalar dT = 0.5;
        return (f(T + dT) - f(T - dT)) / (2.0 * dT);
    };
    solver::NROptions o;
    o.tolerance          = 1.0e-4;       // J/(mol*K)
    o.maxIter            = 50;
    o.lower              = 100.0;
    o.upper              = 2500.0;
    o.bracket            = true;
    o.monotoneIncreasing = true;
    o.maxStep            = 200.0;
    auto r = solver::newton1D(f, df, T_guess, o);
    if (!r.converged)
        throw std::runtime_error(
            "rotating: inner Newton on T(S) did not converge "
            "(discharge state outside the EoS comfort range --- check "
            "W_shaft / F / eta are physically reasonable)");
    return r.x;
}

scalar solveT_for_H(const ThermoPackage& thermo, scalar h_target,
                    scalar P_Pa, const sVector& y, scalar T_guess)
{
    auto f  = [&](scalar T) { return thermo.H_real(T, P_Pa, y) - h_target; };
    auto df = [&](scalar T) {
        const scalar dT = 0.5;
        return (f(T + dT) - f(T - dT)) / (2.0 * dT);
    };
    // Inner h-Newton tolerance.  The legacy generic-EoS path keeps the
    // historical 1 J/mol (byte-stable goldens).  A PURE-FLUID (IF97) working
    // fluid -- the closed-power-cycle case -- gets a tighter 1e-3 J/mol so the
    // discharge enthalpy matches W_shaft closely enough that a closed loop
    // closes the first law to <1e-6 of the boiler duty.  Additive: no existing
    // turbine/compressor case routes through a pure-fluid kernel, so every
    // legacy golden is untouched.
    bool pureRoute = false;
    {
        std::size_t dom = 0;
        for (std::size_t i = 1; i < y.size(); ++i) if (y[i] > y[dom]) dom = i;
        pureRoute = thermo.hasPureFluid(dom)
                 && ThermoPackage::isEffectivelyPure(y, dom);
    }
    solver::NROptions o;
    o.tolerance          = pureRoute ? 1.0e-3 : 1.0;   // J/mol
    o.maxIter            = 50;
    o.lower              = 100.0;
    o.upper              = 2500.0;
    o.bracket            = true;
    o.monotoneIncreasing = true;
    o.maxStep            = 200.0;
    auto r = solver::newton1D(f, df, T_guess, o);
    if (!r.converged)
        throw std::runtime_error(
            "rotating: inner Newton on T(H) did not converge");
    return r.x;
}

DischargeResult solveDischarge(const ThermoPackage& thermo,
                               scalar T_in, scalar P_in, const sVector& y,
                               scalar h_in, scalar s_in,
                               scalar w_real_per_mol,
                               scalar w_isen_per_mol,
                               bool   expansion,
                               int    verbosity)
{
    DischargeResult res;

    const scalar h_out_isen_target = h_in + w_isen_per_mol;
    const scalar h_out_real_target = h_in + w_real_per_mol;

    // Initial guess for P_out via the cold ideal-gas relation.
    const scalar Cp_in = thermo.Cp_ig(T_in, y);
    const scalar gamma = Cp_in / (Cp_in - constant::R);
    const scalar T_isen_guess0 = T_in + w_isen_per_mol / Cp_in;
    scalar P_out_guess0 =
        P_in * std::pow(std::max(T_isen_guess0 / T_in, 1.0e-3),
                        gamma / (gamma - 1.0));
    // Keep the guess on the right side of P_in.
    if (expansion && P_out_guess0 >= P_in) P_out_guess0 = 0.5 * P_in;
    if (!expansion && P_out_guess0 <= P_in) P_out_guess0 = 2.0 * P_in;

    scalar T_isen_warm = std::max(T_isen_guess0, 120.0);

    auto outerResidual = [&](scalar P_out) {
        T_isen_warm = solveT_for_S(thermo, s_in, P_out, y, T_isen_warm);
        return thermo.H_real(T_isen_warm, P_out, y) - h_out_isen_target;
    };
    auto outerDeriv = [&](scalar P_out) {
        const scalar dP = std::max(P_out * 1.0e-4, 100.0);
        return (outerResidual(P_out + dP) - outerResidual(P_out - dP))
             / (2.0 * dP);
    };

    solver::NROptions oo;
    oo.tolerance = 1.0;            // J/mol
    oo.maxIter   = 60;
    oo.bracket   = true;
    if (expansion)
    {
        oo.lower              = 1.0e2;     // never below ~1 mbar
        oo.upper              = P_in;      // turbine: P_out < P_in
        oo.monotoneIncreasing = true;      // H(T_isen(P),P) rises with P
        oo.maxStep            = 0.5 * P_in;
    }
    else
    {
        oo.lower              = P_in;      // compressor: P_out > P_in
        oo.upper              = 1.0e9;     // 10000 bar ceiling
        oo.monotoneIncreasing = true;
        oo.maxStep            = P_in;
    }

    if (verbosity >= 3)
    {
        std::cout << (expansion ? "Turbine" : "Compressor")
                  << ": outer Newton on P_out (isentropic match):\n"
                  << "   it    P_out_trial [bar]    residual [J/mol]\n"
                  << "  ----  ---------------------  -----------------\n";
    }
    oo.onIter = [&](const solver::NRTrace& tr)
    {
        res.outerIters = tr.iteration;
        if (verbosity >= 3)
            std::cout << "  " << std::setw(4) << tr.iteration
                      << "  " << std::fixed << std::setprecision(4)
                      << std::setw(21) << (tr.x / 1.0e5)
                      << "  " << std::scientific << std::setprecision(5)
                      << std::setw(17) << tr.f << "\n";
    };

    auto r = solver::newton1D(outerResidual, outerDeriv, P_out_guess0, oo);
    if (!r.converged) return res;     // converged stays false

    res.P_out      = r.x;
    res.T_out_isen = T_isen_warm;
    res.T_out      = solveT_for_H(thermo, h_out_real_target, res.P_out, y,
                                  T_isen_warm);
    res.converged  = true;
    return res;
}

} // namespace rotating
} // namespace Choupo
