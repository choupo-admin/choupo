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

#include "Valve.H"
#include "unitOperations/flash/IsothermalFlash.H"
#include "solver/NewtonRaphson.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

int Valve::solve(const DictPtr& dict,
                 const ThermoPackage& thermo,
                 int verbosity)
{
    auto feedDict = dict->subDict("feed");
    auto operDict = dict->subDict("operation");
    auto compDict = dict->subDict("composition");

    const scalar F     = feedDict->lookupScalar("F",     Dims::molarFlow);
    const scalar Tfeed = feedDict->lookupScalar("Tfeed", Dims::temperature);
    const scalar Pfeed = feedDict->lookupScalar("Pfeed", Dims::pressure);
    const scalar Pout  = operDict->lookupScalar("P",     Dims::pressure);

    // A valve only DROPS pressure (it is a restriction, not a machine).
    // Mirror FLOWTRAN's pump-pressure guard: warn but do not abort, so the
    // student sees the inconsistency without losing the run.
    if (Pout >= Pfeed)
        std::cerr << "WARNING: valve outlet P (" << (Pout * 1.0e-5)
                  << " bar) >= inlet P (" << (Pfeed * 1.0e-5)
                  << " bar).  A valve can only DROP pressure --- to raise it,"
                     " use a pump (liquid) or compressor (gas).\n";

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

    // Isenthalpic: H_out = H_in.  Feed taken as sub-cooled liquid at Tfeed;
    // anchoring Tref = Tfeed makes H_in == 0, so the outer residual is
    // exactly H_out(T) at the downstream pressure.
    const scalar Tref = Tfeed;
    const scalar Hin   = thermo.Hliquid(Tfeed, z, Tref);   // = 0 by construction
    const scalar Hreq  = Hin;

    std::cout << "Feed:       F = " << (F * 3600.0) << " kmol/h, T = " << Tfeed
              << " K, P = " << (Pfeed * 1.0e-5) << " bar  (liquid)\n"
              << "Outlet:     P = " << (Pout * 1.0e-5)
              << " bar  (isenthalpic throttle, W = 0, Q = 0)\n";

    FlashOptions iopts;
    iopts.tolerance   = 1.0e-9;
    iopts.maxIter     = 60;
    iopts.verbosity   = (verbosity >= 4) ? 3 : 0;
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
        return thermo.Hmixture(T, lastSol.V_over_F, lastSol.x, lastSol.y, Tref)
             - Hreq;
    };
    auto df = [&](scalar T)
    {
        const scalar dT = 0.5;
        return (f(T + dT) - f(T - dT)) / (2.0 * dT);
    };

    solver::NROptions nro;
    nro.tolerance          = 1.0;          // J/mol
    nro.maxIter            = 30;
    nro.lower              = 200.0;
    nro.upper              = 700.0;
    nro.bracket            = true;
    nro.monotoneIncreasing = true;
    nro.maxStep            = 15.0;

    if (verbosity >= 3)
    {
        std::cout << "\nOuter Newton in T_out (isenthalpic balance):\n"
                  << "   it       T [K]       H_out-H_in    dH/dT          ΔT\n"
                  << "  ----  -----------  -------------  -------------  -------------\n";
    }
    nro.onIter = [this, verbosity](const solver::NRTrace& tr)
    {
        recordResidual(std::abs(tr.f));
        if (verbosity >= 3)
            std::cout << "  " << std::setw(4) << tr.iteration
                      << "  " << std::fixed << std::setprecision(4)
                      << std::setw(11) << tr.x
                      << "  " << std::scientific << std::setprecision(5)
                      << std::setw(13) << tr.f
                      << "  " << std::setw(13) << tr.dfdx
                      << "  " << std::setw(13) << tr.dx << "\n";
    };

    auto r = solver::newton1D(f, df, Tfeed, nro);
    lastSol = flashAt(r.x);
    const scalar Tout = r.x;
    const scalar vf   = lastSol.V_over_F;

    std::cout << "\n============================  Valve Result  ==========================\n"
              << "  Converged:     " << (r.converged ? "yes" : "NO") << "\n"
              << "  P_in:          " << std::fixed << std::setprecision(3)
              << (Pfeed * 1.0e-5) << "  bar\n"
              << "  P_out:         " << (Pout * 1.0e-5) << "  bar   <- spec\n"
              << "  ΔP (drop):     " << ((Pfeed - Pout) * 1.0e-5) << "  bar\n"
              << "  T_in:          " << std::fixed << std::setprecision(2)
              << Tfeed << "  K  ( " << (Tfeed - 273.15) << " °C )\n"
              << "  T_out:         " << Tout << "  K  ( " << (Tout - 273.15)
              << " °C )   <- result\n"
              << "  ΔT:            " << (Tout - Tfeed) << "  K\n"
              << "  Regime:        " << lastSol.regime << "\n"
              << "  vf (V/F):      " << std::fixed << std::setprecision(6)
              << vf << "   <- result\n"
              << "======================================================================\n\n";

    // -- Produced stream: ONE combined outlet (phases NOT separated) -------
    produced_.clear();
    ProcessStream out;
    out.name = "out";
    out.F    = F;
    out.T    = Tout;
    out.P    = Pout;
    out.z    = z;        // overall composition unchanged across a valve
    out.vf   = vf;
    produced_.push_back(out);

    // -- KPIs --------------------------------------------------------------
    kpis_.clear();
    kpis_["P_in"]  = Pfeed;
    kpis_["P_out"] = Pout;
    kpis_["dP"]    = Pfeed - Pout;
    kpis_["T_in"]  = Tfeed;
    kpis_["T_out"] = Tout;
    kpis_["dT"]    = Tout - Tfeed;
    kpis_["vf"]    = vf;
    kpis_["F"]     = F;

    return r.converged ? 0 : 1;
}

} // namespace Choupo
