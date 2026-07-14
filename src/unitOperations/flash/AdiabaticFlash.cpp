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

#include "AdiabaticFlash.H"
#include "solver/NewtonRaphson.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

int AdiabaticFlash::solve(const DictPtr& dict,
                          const ThermoPackage& thermo,
                          int verbosity)
{
    auto feedDict = dict->subDict("feed");
    auto operDict = dict->subDict("operation");
    auto compDict = dict->subDict("composition");

    const scalar F      = feedDict->lookupScalar("F",     Dims::molarFlow);
    const scalar Tfeed  = feedDict->lookupScalar("Tfeed", Dims::temperature);
    const scalar Pout   = operDict->lookupScalar("P",     Dims::pressure);
    const scalar Pfeed  = feedDict->lookupScalarOrDefault("Pfeed", Pout,
                                                          Dims::pressure);
    // The operation block carries ONLY hardware: outlet pressure P.  A duty
    // Q (an earlier optional setting) is GONE --- an adiabatic flash has
    // Q == 0 by definition; "flash with heat input" is a heater + flash
    // chain (the credo-pure way, separating the two physical pieces).  The
    // When every component has the elements datum, solve on the SAME canonical
    // surface published as stream H/H_kW.  Otherwise retain the sensible
    // surface as an announced data-limited fallback; the GUI will refuse an
    // elements-datum plant balance for that case rather than print a false one.
    const scalar Tref = Tfeed;

    const std::size_t n = thermo.n();
    sVector z(n, 0.0);
    scalar zsum = 0.0;
    for (const auto& key : compDict->keys())
    {
        std::size_t i = thermo.indexOf(key);
        z[i] = compDict->lookupScalar(key);
        zsum += z[i];
    }
    for (auto& v : z) v /= zsum;

    bool useFormation = true;
    for (std::size_t i = 0; i < n; ++i)
        if (!thermo.hasEnthalpyDatum(i)) { useFormation = false; break; }

    auto liquidH = [&](scalar T, scalar P, const sVector& x) -> scalar
    {
        return useFormation ? thermo.H_stream_formation(T, P, 0.0, x)
                            : thermo.Hliquid(T, x, Tref);
    };
    auto vapourH = [&](scalar T, scalar P, const sVector& y) -> scalar
    {
        return useFormation ? thermo.H_stream_formation(T, P, 1.0, y)
                            : thermo.Hvapour(T, y, Tref);
    };
    auto splitH = [&](scalar T, scalar P, const FlashSolution& sol) -> scalar
    {
        return (1.0 - sol.V_over_F) * liquidH(T, P, sol.x)
             +        sol.V_over_F  * vapourH(T, P, sol.y);
    };

    // The authored feed is a sub-cooled liquid.  On the canonical path this is
    // exactly the value that Flowsheet later publishes for the feed stream.
    const scalar Hin  = liquidH(Tfeed, Pfeed, z);
    const scalar Hreq = Hin;            // adiabatic: H_out = H_in

    std::cout << "Feed:       F = " << (F * 3600.0) << " kmol/h, T = " << Tfeed
              << " K, P = " << (Pfeed * 1.0e-5) << " bar\n"
              << "Outlet:     P = " << (Pout * 1.0e-5) << " bar  (adiabatic, Q = 0)\n"
              << "Enthalpy:   "
              << (useFormation ? "elements datum (same surface as stream H/H_kW)"
                               : "sensible fallback (missing elements datum)")
              << "\n";
    std::cout << "Feed composition (z):\n";
    for (std::size_t i = 0; i < n; ++i)
        std::cout << "  " << thermo.comp(i).name() << "  = " << z[i] << "\n";
    std::cout << "Inlet enthalpy H_in = " << std::scientific
              << std::setprecision(5) << Hin << " J/mol of feed\n\n";

    // Outer residual:  f(T) = H_out(T) - Hreq, where H_out comes from a
    // fully converged isothermal flash at (T, Pout, z).
    FlashOptions iopts;
    iopts.tolerance  = 1.0e-9;
    iopts.maxIter    = 60;
    iopts.verbosity  = (verbosity >= 4) ? 3 : 0;
    iopts.accelerator = OuterAccelerator::Wegstein;

    FlashSolution lastSol;

    auto flashAt = [&](scalar T) -> FlashSolution
    {
        FlashInput in;
        in.F = F; in.T = T; in.P = Pout; in.z = z;
        return IsothermalFlash::solveCore(in, thermo, iopts);
    };

    auto f = [&](scalar T)
    {
        lastSol = flashAt(T);
        scalar Hout = splitH(T, Pout, lastSol);
        return Hout - Hreq;
    };
    auto df = [&](scalar T)
    {
        const scalar dT = 0.5;
        scalar fph = f(T + dT);
        scalar fmh = f(T - dT);
        return (fph - fmh) / (2.0 * dT);
    };

    solver::NROptions nro;
    nro.tolerance          = 0.01;         // J/mol; keeps published H-flow closure negligible
    nro.maxIter            = 30;
    nro.lower              = 200.0;
    nro.upper              = 700.0;
    nro.bracket            = true;
    nro.monotoneIncreasing = true;         // d(H_out)/dT > 0 generally
    nro.maxStep            = 15.0;

    if (verbosity >= 3)
    {
        std::cout << "Outer Newton in T (energy balance):\n"
                  << "   it       T [K]       H_out-Hreq    dH/dT          ΔT\n"
                  << "  ----  -----------  -------------  -------------  -------------\n";
    }
    nro.onIter = [this, verbosity](const solver::NRTrace& tr)
    {
        recordResidual(std::abs(tr.f));
        if (verbosity >= 3)
        {
            std::cout << "  " << std::setw(4) << tr.iteration
                      << "  " << std::fixed << std::setprecision(4)
                      << std::setw(11) << tr.x
                      << "  " << std::scientific << std::setprecision(5)
                      << std::setw(13) << tr.f
                      << "  " << std::setw(13) << tr.dfdx
                      << "  " << std::setw(13) << tr.dx << "\n";
        }
    };

    auto r = solver::newton1D(f, df, Tfeed, nro);

    // Final flash at converged T
    lastSol = flashAt(r.x);
    scalar Hout = splitH(r.x, Pout, lastSol);

    // Outlet streams (liquid + vapor) at the converged T_out and the outlet P.
    // The products ARE the point of a flash -- emit them so the flowsheet
    // summary shows them (was the empty `outputs ( )` / "v0.7" gap).
    produced_.clear();
    {
        ProcessStream liq;
        liq.name = "liquid"; liq.F = F * (1.0 - lastSol.V_over_F);
        liq.T = r.x; liq.P = Pout; liq.z = lastSol.x; liq.vf = 0.0;
        produced_.push_back(liq);
        ProcessStream vap;
        vap.name = "vapor"; vap.F = F * lastSol.V_over_F;
        vap.T = r.x; vap.P = Pout; vap.z = lastSol.y; vap.vf = 1.0;
        produced_.push_back(vap);
    }

    std::cout << "\n========================  Adiabatic Flash Result  ===================\n"
              << "  Converged:     " << (r.converged ? "yes" : "NO") << "\n"
              << "  Outer iter.:   " << r.iterations << "\n"
              << "  T_out:         " << std::fixed << std::setprecision(4)
              << r.x << "  K  ( " << (r.x - 273.15) << " °C )\n"
              << "  ΔT (drop):     " << std::fixed << std::setprecision(2)
              << (Tfeed - r.x) << "  K\n"
              << "  H_in:          " << std::scientific << std::setprecision(5)
              << Hin << "  J/mol\n"
              << "  H_out:         " << Hout << "  J/mol\n"
              << "  Energy-balance residual: " << (Hout - Hin)
              << "  J/mol  (~0; adiabatic, Q = 0 by definition)\n"
              << "  Regime:        " << lastSol.regime << "\n"
              << "  V/F:           " << std::fixed << std::setprecision(6)
              << lastSol.V_over_F << "\n"
              << "  V flow:        " << (F * lastSol.V_over_F * 3600.0) << "  kmol/h\n"
              << "  L flow:        " << (F * (1.0 - lastSol.V_over_F) * 3600.0) << "  kmol/h\n\n";

    std::cout << "  Component         z          x          y          K\n"
              << "  -----------------------------------------------------------\n";
    for (std::size_t i = 0; i < n; ++i)
        std::cout << "  " << std::left << std::setw(14) << thermo.comp(i).name()
                  << std::right << std::fixed
                  << "  " << std::setprecision(6) << std::setw(8) << z[i]
                  << "  " << std::setprecision(6) << std::setw(8) << lastSol.x[i]
                  << "  " << std::setprecision(6) << std::setw(8) << lastSol.y[i]
                  << "  " << std::setprecision(4) << std::setw(8) << lastSol.K[i]
                  << "\n";
    std::cout << "====================================================================\n\n";

    return r.converged ? 0 : 1;
}

} // namespace Choupo
