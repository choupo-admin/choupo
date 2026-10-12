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
#include "unitOperations/flash/StreamEquilibrium.H"
#include "thermo/PricedDensity.H"
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

    // Isenthalpic: H_out = H_in -- ON THE SURFACE THE REPORT PRICES ON.
    //
    // THE FEED'S OWN VAPOUR FRACTION, read rather than assumed (2026-09-02).
    // This priced the inlet as a sub-cooled liquid unconditionally and printed
    // "(liquid)" in the banner whatever arrived; a valve fed vapour or a
    // two-phase stream solved for the wrong outlet temperature at exit 0.
    //
    // ONE SURFACE, THE REPORT'S (2026-10-11, DEV.md 4c C65 item d).  Until
    // then both ends were priced on the unit's OWN surface: `Hliquid` /
    // `Hvapour` / `Hmixture` at Tref = T_feed -- a Watson latent heat and an
    // IDEAL-GAS vapour with no pressure term -- while the energy report
    // prices the very same two streams on the formation surface of the
    // package, departure functions included.  So `H_out = H_in` held on a
    // surface nobody else reads, and the report found what was left:
    // letdown01_ammonia_flashing's ValveLP -39.50 kW (liquid ammonia flashed
    // 20 bar -> 1 atm; the Watson latent against the package's), and its gas
    // valve +0.44 kW -- the JOULE-THOMSON effect a throttle exists to show,
    // absent because an ideal-gas vapour has no pressure term.  The family
    // CLAUDE.md 6 names: THE STATE A UNIT COMPUTES WITH IS NOT THE STATE ITS
    // STREAMS CARRY, in its simplest shape -- two surfaces for one unit.
    //
    // Both ends now go through `flashState::priceState` (StreamEquilibrium.H),
    // the call the report's own rule is: resolve the state, price the
    // EQUILIBRIUM phases when it is a split, else the carried phase -- never a
    // quality blend at the overall z.  On an ideal-gas package with an
    // ideal liquid this is the same physics as before up to the Watson-vs-
    // formation latent heat; on a cubic EoS a gas valve now cools.
    //
    //  An UNPINNED inlet means its own equilibrium (R-E2); read in this
    //  unit's own thermo world, single phase included (DEV.md C33).
    const std::string who = "valve '" + (dict->name().empty() ? type()
                                                               : dict->name()) + "'";
    const bool   pinnedFeed = feedDict->lookupScalarOrDefault("phasePinned", 0.0) > 0.5;
    const scalar vfFeed = flashState::resolvedInletVaporFraction(
        feedDict, Tfeed, Pfeed, z, thermo, "valve inlet");
    //  J/mol: `priceState` returns F x (kJ/kmol), so F = 1 is per mole.
    const scalar Hin   = flashState::priceState(Tfeed, Pfeed, z, 1.0,
                                                pinnedFeed, vfFeed, thermo,
                                                who + " inlet", nullptr);
    const scalar Hreq  = Hin;

    std::cout << "Feed:       F = " << (F * 3600.0) << " kmol/h, T = " << Tfeed
              << " K, P = " << (Pfeed * 1.0e-5) << " bar, vf = " << vfFeed << "\n"
              << "Outlet:     P = " << (Pout * 1.0e-5)
              << " bar  (isenthalpic throttle, W = 0, Q = 0)\n";

    FlashOptions iopts;
    iopts.tolerance   = 1.0e-9;
    iopts.maxIter     = 60;
    iopts.verbosity   = (verbosity >= 4) ? 3 : 0;
    iopts.accelerator = OuterAccelerator::Wegstein;

    //  A two-phase root above every present component's Tc is not a split:
    //  the outlet is the single fluid phase, and the discard is said once,
    //  after the search (the one home, StreamEquilibrium.H -- C34).
    FlashSolution lastSol;
    std::string   scDiscarded;
    auto flashAt = [&](scalar T) -> FlashSolution
    {
        FlashInput in;
        in.F = F; in.T = T; in.P = Pout; in.z = z;
        return flashState::flashDiscardingSupercriticalSplit(in, thermo, iopts,
                                                             scDiscarded);
    };
    auto f = [&](scalar T)
    {
        lastSol = flashAt(T);
        //  The OUTLET priced exactly as the stream this unit publishes will
        //  be: unpinned, carrying the vapour fraction of this search's own
        //  flash (the report resolves it at the same (T, P, z)).
        const scalar b  = lastSol.V_over_F;
        const scalar vf = (b <= 1.0e-9) ? 0.0 : (b >= 1.0 - 1.0e-9) ? 1.0 : b;
        return flashState::priceState(T, Pout, z, 1.0, false, vf, thermo,
                                      who + " outlet", nullptr)
             - Hreq;
    };
    auto df = [&](scalar T)
    {
        //  1 mK, not 0.5 K (2026-10-11, C65 item d).  A central difference
        //  across a whole kelvin straddles the bubble point of a nearly pure
        //  liquid, where the slope jumps by the latent heat, and the Newton
        //  then CREEPS (ValveLP: 34 iterations, each closing ~20 % of the
        //  gap).  Inside one phase region the difference is the slope.
        const scalar dT = 1.0e-3;
        return (f(T + dT) - f(T - dT)) / (2.0 * dT);
    };

    solver::NROptions nro;
    //  1e-6 J/mol, not 1 J/mol (2026-10-11, C65 item d).  The residual is
    //  PER MOLE, so its kW is the tolerance times the flow: 1 J/mol on
    //  letdown01's ValveLP (0.81 kmol/s) left 0.77 kW unattributed in the
    //  energy report, which checks the unit's balance on its own streams.
    nro.tolerance          = 1.0e-6;       // J/mol
    //  200, not 30 (2026-10-11, DEV.md 4c C64).  A nearly pure liquid
    //  throttled below its vapour pressure -- liquid ammonia, 20 bar ->
    //  1 atm -- puts the root on the steep, kinked stretch of H(T) where
    //  the whole latent heat is taken over a fraction of a kelvin.  The
    //  central difference across 1 K straddles that kink, so the Newton
    //  creeps (measured: 40 iterations to 1 J/mol on
    //  letdown01_ammonia_flashing's ValveLP) and 30 refused a run that
    //  converges.  A case that converged within 30 takes exactly the
    //  same iterates and is byte-identical.
    nro.maxIter            = 200;
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
    scDiscarded.clear();    // say it only if the ANSWER is a discarded root
    lastSol = flashAt(r.x);
    const scalar Tout = r.x;
    const scalar vf   = lastSol.V_over_F;
    flashState::reportSupercriticalDiscard(scDiscarded, "valve", "valve outlet",
                                           verbosity);

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

    // -- What the throttle does to the SPACE the stream occupies ----------
    //
    //  Added 2026-10-11 (DEV.md 4c C64, the pressure-letdown EduTool).  A
    //  liquid let down across its bubble pressure leaves the valve as a
    //  two-phase mixture, and the volume it occupies grows -- by an order of
    //  magnitude or more when the outlet pressure is low -- which is why the
    //  outlet of a flashing letdown is a velocity, erosion and noise problem
    //  and not only a temperature one.  The page that teaches it must not
    //  type a density into TypeScript, so the valve publishes the volumetric
    //  flow it already has every number for: the phase split (the flash at
    //  each end) and the package's own phase densities
    //  (`ThermoPackage::density`, the ONE home -- the liquid by the record's
    //  Vliq anchored on Rackett, the vapour by the EoS).
    //
    //  HOMOGENEOUS, NO SLIP: Q = m_L/rho_L + m_V/rho_V, the phases moving
    //  together.  A liquid carrying dissolved gases above their critical
    //  temperature (H2 and N2 in liquid ammonia) is priced over the
    //  components that HAVE a liquid density (`pricedDensity`, the same
    //  choice the storage tank makes), said once per run.  When a density
    //  cannot be had the volumetric KPIs are NOT published and the reason is
    //  printed -- a missing number, never a guessed one.  Nothing above this
    //  block reads it, so T_out and vf are untouched.
    try
    {
        auto molarMass = [&](const sVector& c)                  // kg/kmol
        {
            scalar m = 0.0, s = 0.0;
            for (std::size_t i = 0; i < n; ++i)
                if (i < c.size() && c[i] > 0.0)
                { m += c[i] * thermo.comp(i).MW(); s += c[i]; }
            return s > 0.0 ? m / s : 0.0;
        };
        auto liquidRho = [&](scalar T, scalar P, const sVector& x)
        {
            const auto sel = pricedDensity::select(thermo, T, P, x,
                                                   DensityPhase::Liquid);
            if (!(sel.keptFraction > 0.0))
                throw std::runtime_error("no component of the liquid has a"
                                         " liquid density");
            static bool announced = false;
            if (sel.droppedFraction > 0.0 && !announced)
            {
                std::cout << "[valve] liquid density priced without "
                          << sel.dropped << " (mole fraction "
                          << std::scientific << std::setprecision(3)
                          << sel.droppedFraction << std::fixed
                          << "): no liquid density exists for them at "
                          << T << " K; their mass is carried at the density"
                             " of the rest\n";
                announced = true;
            }
            return thermo.density(T, P, sel.zPriced, DensityPhase::Liquid);
        };
        //  One end of the valve: mass flow [kg/s] and volumetric flow
        //  [m3/s], with the phase densities it was built from.
        struct End { scalar m = 0, Q = 0, rhoL = 0, rhoV = 0, xMass = 0; };
        auto endOf = [&](scalar T, scalar P, scalar beta,
                         const sVector& x, const sVector& y)
        {
            End e;
            const scalar mV = beta > 0.0 ? beta * F * molarMass(y) : 0.0;
            const scalar mL = beta < 1.0 ? (1.0 - beta) * F * molarMass(x) : 0.0;
            e.m = mL + mV;
            if (mL > 0.0) { e.rhoL = liquidRho(T, P, x);  e.Q += mL / e.rhoL; }
            if (mV > 0.0)
            {
                e.rhoV = thermo.density(T, P, y, DensityPhase::Vapour);
                e.Q += mV / e.rhoV;
            }
            e.xMass = e.m > 0.0 ? mV / e.m : 0.0;
            if (!(e.Q > 0.0) || !std::isfinite(e.Q))
                throw std::runtime_error("non-physical volumetric flow");
            return e;
        };
        constexpr scalar edge = 1.0e-12;
        End in;
        if (vfFeed <= edge)          in = endOf(Tfeed, Pfeed, 0.0, z, z);
        else if (vfFeed >= 1 - edge) in = endOf(Tfeed, Pfeed, 1.0, z, z);
        else
        {
            FlashInput fin; fin.F = F; fin.T = Tfeed; fin.P = Pfeed; fin.z = z;
            std::string scIn;
            const FlashSolution s =
                flashState::flashDiscardingSupercriticalSplit(fin, thermo,
                                                              iopts, scIn);
            in = endOf(Tfeed, Pfeed, s.V_over_F, s.x, s.y);
        }
        if (lastSol.liquidLiquid || lastSol.threePhase)
            throw std::runtime_error("the outlet holds a second liquid, which"
                                     " this homogeneous volume does not price");
        const End out = (vf <= edge) ? endOf(Tout, Pout, 0.0, z, z)
                      : (vf >= 1 - edge) ? endOf(Tout, Pout, 1.0, z, z)
                      : endOf(Tout, Pout, vf, lastSol.x, lastSol.y);

        kpis_["massFlow"]     = in.m;
        kpis_["Q_in"]         = in.Q;
        kpis_["Q_out"]        = out.Q;
        kpis_["rho_in"]       = in.m / in.Q;
        kpis_["rho_out"]      = out.m / out.Q;
        kpis_["volumeRatio"]  = out.Q / in.Q;
        kpis_["x_mass_out"]   = out.xMass;
        if (out.rhoL > 0.0) kpis_["rho_L_out"] = out.rhoL;
        if (out.rhoV > 0.0) kpis_["rho_V_out"] = out.rhoV;

        std::cout << "  Volume (homogeneous, no slip):\n"
                  << std::scientific << std::setprecision(5)
                  << "    Q_in   = " << in.Q  << " m3/s   rho_in  = "
                  << std::fixed << std::setprecision(3) << in.m / in.Q
                  << " kg/m3\n"
                  << std::scientific << std::setprecision(5)
                  << "    Q_out  = " << out.Q << " m3/s   rho_out = "
                  << std::fixed << std::setprecision(3) << out.m / out.Q
                  << " kg/m3\n"
                  << "    Q_out/Q_in = " << std::setprecision(3)
                  << out.Q / in.Q << "   vapour mass fraction out = "
                  << std::setprecision(6) << out.xMass << "\n\n";
    }
    catch (const std::exception& e)
    {
        std::cout << "  [valve] volumetric flow NOT published: " << e.what()
                  << "\n\n";
    }

    return r.converged ? 0 : 1;
}

} // namespace Choupo
