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
#include "thermo/activityCoefficient/ActivityModel.H"
#include "solver/NewtonRaphson.H"
#include "unitOperations/flash/StreamEquilibrium.H"

#include "core/Advisory.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace Choupo {
namespace rotating {

namespace {

//  The equilibrium split of the discharge state, or nullopt when it is dry
//  (single phase) or the working fluid is a pure-fluid package.
std::optional<FlashSolution> outletSplit(const ThermoPackage& thermo,
                                         scalar T, scalar P_Pa,
                                         const sVector& y)
{
    std::size_t dom = 0;
    for (std::size_t i = 1; i < y.size(); ++i) if (y[i] > y[dom]) dom = i;
    if (thermo.hasPureFluid(dom) && ThermoPackage::isEffectivelyPure(y, dom))
        return std::nullopt;
    //  A DRY DISCHARGE SKIPS THE FLASH (C493 cost).  The flash's own first
    //  question (`IsothermalFlash::solveCore`, the "incipient liquid" seed) is
    //  the dew sum  S = sum z_i / K_i  on the package's ideal K (Psat/P, or the
    //  Wilson estimate under phi-phi -- the very seeds that block builds).  A
    //  state far on the dry side of it, S < kDryDewSum, cannot be a split, so
    //  the flash is not run and the answer is the one it would have returned:
    //  single-phase vapour.  Anything the screen cannot price (a K that is not
    //  finite and positive, a refusal) falls through to the flash.
    {
        constexpr scalar kDryDewSum = 0.5;
        bool   priced = true;
        //  The screen prices K by Raoult (gamma = 1).  Under gamma-phi with a
        //  non-ideal activity model that K can be wrong by a factor gamma
        //  (NRTL tau = -3: gamma = 0.12, a true dew sum 2.8 against a screened
        //  0.3), so the screen is not applied: the flash is run.
        if (thermo.vleWorld() != "phiPhi" && thermo.hasActivity()
            && thermo.activity().modelName() != "ideal")
            priced = false;
        sVector K0(thermo.n(), 1.0);
        try
        {
            if (thermo.vleWorld() == "phiPhi")
            {
                for (std::size_t i = 0; i < thermo.n(); ++i)
                {
                    if (y[i] <= 0.0) continue;
                    const auto& c = thermo.comp(i);
                    if (!(c.Tc() > 0.0 && c.Pc() > 0.0)) { priced = false; break; }
                    K0[i] = (c.Pc() * 1.0e5 / P_Pa)
                          * std::exp(5.373 * (1.0 + c.omega())
                                     * (1.0 - c.Tc() / T));
                }
            }
            else
            {
                K0 = thermo.Kvec_Raoult(T, P_Pa, &y);
            }
        }
        catch (const std::exception&) { priced = false; }
        if (priced)
        {
            scalar S = 0.0;
            for (std::size_t i = 0; i < thermo.n(); ++i)
            {
                if (y[i] <= 0.0) continue;
                if (!(std::isfinite(K0[i]) && K0[i] > 0.0)) { priced = false; break; }
                S += y[i] / K0[i];
            }
            if (priced && S < kDryDewSum) return std::nullopt;
        }
    }
    std::string deferred;     // advisories belong to the converged state
    return flashState::twoPhaseSplit(T, P_Pa, y, /*pinned=*/false,
                                     /*vfCarried=*/1.0, thermo,
                                     "rotating outlet", "model", &deferred);
}

} // namespace

scalar outletH(const ThermoPackage& thermo, scalar T, scalar P_Pa,
               const sVector& y)
{
    if (auto sp = outletSplit(thermo, T, P_Pa, y))
        return flashState::hOfState(*sp, T, P_Pa, y, thermo);
    return thermo.H_real(T, P_Pa, y);
}

scalar outletS(const ThermoPackage& thermo, scalar T, scalar P_Pa,
               const sVector& y)
{
    if (auto sp = outletSplit(thermo, T, P_Pa, y))
        return flashState::sOfState(*sp, T, P_Pa, y, thermo);
    return thermo.S_real(T, P_Pa, y);
}

OutletPhase outletPhase(const ThermoPackage& thermo, scalar T, scalar P_Pa,
                        const sVector& y)
{
    OutletPhase ph;
    if (auto sp = outletSplit(thermo, T, P_Pa, y))
    {
        ph.condenses = true;
        ph.vf = sp->V_over_F;
        scalar mw = 0.0, sx = 0.0;
        for (std::size_t i = 0; i < sp->x.size() && i < thermo.n(); ++i)
        {
            mw += sp->x[i] * thermo.comp(i).MW();
            sx += sp->x[i];
        }
        ph.condMW = sx > 0.0 ? mw / sx : 0.0;
    }
    return ph;
}

void announceCondensing(const std::string& machine, const std::string& unit,
                        scalar F_kmol_s, scalar T, scalar P_Pa,
                        const OutletPhase& ph)
{
    if (!ph.condenses) return;
    const scalar kg_s = F_kmol_s * (1.0 - ph.vf) * ph.condMW;
    std::ostringstream m;
    m << "the discharge CONDENSES at " << std::fixed << std::setprecision(2)
      << T << " K, " << std::setprecision(4) << (P_Pa / 1.0e5)
      << " bar: V/F = " << ph.vf << ", condensate " << std::scientific
      << std::setprecision(4) << kg_s << " kg/s (the values of the pass that"
         " first raised this; a recycle re-solves them and the stream table"
         " carries the converged state).  The outlet is priced on its"
         " equilibrium phases, the surface the energy report uses, and"
         " published as a two-phase stream (DEV.md 4c C493)";
    if (AdvisoryLog::instance().addAnnouncedOnce(
            "rotatingCondenses:" + machine + ":" + unit, "model", "info",
            machine + " '" + unit + "'", m.str()))
        std::cout << "  [" << machine << "] '" << unit << "': " << m.str()
                  << ".\n";
}

scalar solveT_for_S(const ThermoPackage& thermo, scalar s_target,
                    scalar P_Pa, const sVector& y, scalar T_guess,
                    scalar tol)
{
    auto f  = [&](scalar T) { return outletS(thermo, T, P_Pa, y) - s_target; };
    auto df = [&](scalar T) {
        const scalar dT = 0.5;
        return (f(T + dT) - f(T - dT)) / (2.0 * dT);
    };
    solver::NROptions o;
    o.tolerance          = tol;          // J/(mol*K)
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
    auto f  = [&](scalar T) { return outletH(thermo, T, P_Pa, y) - h_target; };
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
        return outletH(thermo, T_isen_warm, P_out, y) - h_out_isen_target;
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
    //  T_isen_warm holds the root at the LAST pressure the outer Newton
    //  evaluated, which is a finite-difference neighbour of P_out (the
    //  derivative's P +- dP), not P_out itself: published as is it satisfied
    //  S(T, P_out) = S_in only to ~0.01 J/(mol K).  Re-solve at P_out.
    T_isen_warm    = solveT_for_S(thermo, s_in, r.x, y, T_isen_warm, 1.0e-9);
    res.T_out_isen = T_isen_warm;
    res.T_out      = solveT_for_H(thermo, h_out_real_target, res.P_out, y,
                                  T_isen_warm);
    res.vf         = outletPhase(thermo, res.T_out, res.P_out, y).vf;
    res.converged  = true;
    return res;
}

} // namespace rotating
} // namespace Choupo
