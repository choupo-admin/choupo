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
    reactorOutlet implementation -- see ReactorOutlet.H for the rule and why
    it has one home.
\*---------------------------------------------------------------------------*/

#include "ReactorOutlet.H"

#include "core/Advisory.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/flash/StreamEquilibrium.H"   // the ONE equilibrium home

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <iomanip>
#include <iostream>
#include <optional>
#include <string>

namespace Choupo {
namespace reactorOutlet {

namespace {

//  THE RESOLUTION, once: `outletState` (which announces) and `pricedOutlet`
//  (which a T-solve calls at every trial T, silently) read the SAME answer
//  from it, so the state a balance is solved on and the state the outlet is
//  published at cannot become two rules.
enum class Route { noVapourPhase, resolved, discarded, unresolved };

struct Resolution
{
    Route                        route = Route::noVapourPhase;
    scalar                       vf    = 0.0;
    std::optional<FlashSolution> fs;
    std::string                  deferred;
};

Resolution resolve(scalar               T,
                   scalar               P,
                   const sVector&       z,
                   scalar               vf_in,
                   const ThermoPackage& thermo,
                   const std::string&   locus)
{
    Resolution r;
    if (thermo.phasesOfType("vapor").empty())
    {
        r.vf = vf_in;
        return r;
    }
    bool discarded = false;
    r.fs = flashState::equilibriumAt(T, P, z, /*pinned=*/false, vf_in, thermo,
                                     locus, "model", &r.deferred, nullptr,
                                     &discarded);
    if (r.fs)           { r.route = Route::resolved;   r.vf = flashState::vapourFractionOf(*r.fs); }
    else if (discarded) { r.route = Route::discarded;  r.vf = 1.0; }
    else                { r.route = Route::unresolved; r.vf = vf_in; }
    return r;
}

//  The published-surface molar enthalpy [J/mol] of a resolution: the
//  `flashState::priceState` rule on an UNPINNED stream carrying `r.vf` --
//  the equilibrium phases of a split, else the one phase it resolved to.
scalar molarH(const Resolution& r, scalar T, scalar P, const sVector& z,
              const ThermoPackage& thermo)
{
    if (r.fs && flashState::isSplit(*r.fs))
        return flashState::hOfState(*r.fs, T, P, z, thermo);
    return thermo.H_stream_formation(T, P, r.vf, z);
}

} // namespace

OutletState outletState(scalar               T,
                        scalar               P,
                        const sVector&       zout,
                        bool                 pinned_in,
                        scalar               vf_in,
                        const ThermoPackage& thermo,
                        const std::string&   unitType,
                        const std::string&   unitName)
{
    OutletState o;
    const std::string locus = unitType + " '" + unitName + "' outlet";
    const Resolution r = resolve(T, P, zout, vf_in, thermo, locus);
    o.vf = r.vf;
    if (r.route == Route::noVapourPhase)
    {
        o.origin = "the package has no vapour phase; the inlet's vf stands";
        return o;
    }
    if (r.route == Route::resolved)
        o.origin = "resolved at its own (T, P, z)";
    else if (r.route == Route::discarded)
        o.origin = "the one fluid phase above every present Tc"
                   " (a two-phase root was discarded)";
    else
    {
        o.origin = "the inlet's vf, CARRIED: the outlet's own equilibrium"
                   " could not be resolved";
        const std::string& deferred = r.deferred;
        const std::string msg =
            "the outlet's own equilibrium at (T, P, z) could not be resolved,"
            " so it carries the inlet's vapour fraction"
            + (deferred.empty() ? std::string() : " -- " + deferred);
        if (AdvisoryLog::instance().addAnnouncedOnce(
                unitType + ".outletUnresolved." + unitName,
                "model", "warning", locus, msg))
            std::cerr << "[" << unitType << "] " << locus << ": " << msg << "\n";
    }

    //  The departure from a DECLARED inlet phase, said once.  Only a pinned
    //  SINGLE phase is a declaration of a phase (a pinned pure quality is a
    //  point on a saturation curve, and a product of another composition is
    //  not on it).
    const bool declaredSingle =
        pinned_in && (vf_in <= 1.0e-9 || vf_in >= 1.0 - 1.0e-9);
    if (declaredSingle && std::fabs(o.vf - vf_in) > 1.0e-9)
    {
        const std::string declared = (vf_in >= 0.5) ? "gas" : "liquid";
        const std::string msg =
            "the inlet DECLARES `phase " + declared + ";`, and that is a"
            " declaration about the inlet: the outlet, at another composition,"
            " is published at its own equilibrium at (T, P, z), which is not"
            " all " + declared + " -- its vapour fraction is printed with the"
            " unit.  If the reactor is meant to hold the " + declared
            + " phase, declare a pressure at which its product does";
        if (AdvisoryLog::instance().addAnnouncedOnce(
                unitType + ".departsFromDeclaredInletPhase." + unitName,
                "model", "info", locus, msg))
            std::cerr << "[" << unitType << "] " << locus << ": " << msg << "\n";
    }
    return o;
}

void printOutletState(const OutletState& o)
{
    const auto prec = std::cout.precision();
    std::cout << "  outlet vf = " << std::setprecision(6) << o.vf
              << "  (" << o.origin << ")\n";
    std::cout.precision(prec);
}

PricedState pricedOutlet(scalar               T,
                         scalar               P,
                         const sVector&       z,
                         scalar               F,
                         scalar               vf_in,
                         const ThermoPackage& thermo)
{
    const Resolution r = resolve(T, P, z, vf_in, thermo, "reactor trial outlet");
    PricedState s;
    s.vf = r.vf;
    s.H  = F * molarH(r, T, P, z, thermo);
    return s;
}

EnthalpyInversion temperatureOfEnthalpy(scalar               h,
                                        scalar               P,
                                        const sVector&       z,
                                        scalar               Tguess,
                                        scalar               vfGuess,
                                        scalar               vf_in,
                                        const ThermoPackage& thermo)
{
    const std::string locus = "reactor trial outlet";
    EnthalpyInversion inv;

    //  ---- one phase: a Newton on that phase's rung, confirmed -----------
    //  The inversion every evaluation took before C77, on the rung of the
    //  phase the PREVIOUS evaluation resolved to (never the inlet's), and
    //  then ONE resolution at the answer: the same single phase there means
    //  the published-surface enthalpy at that T IS this rung's, so `h` is
    //  matched on the surface the outlet will be priced on.
    scalar T1 = Tguess;
    const bool single = vfGuess <= 1.0e-9 || vfGuess >= 1.0 - 1.0e-9;
    if (single)
    {
        const scalar vfR = (vfGuess >= 0.5) ? 1.0 : 0.0;
        for (int it = 0; it < 40; ++it)
        {
            const scalar hk = thermo.H_stream_formation(T1, P, vfR, z);
            const scalar dT = 1.0e-3;
            const scalar cp = (thermo.H_stream_formation(T1 + dT, P, vfR, z) - hk) / dT;
            if (!(std::abs(cp) > 1.0e-12)) break;
            const scalar step = (h - hk) / cp;
            T1 += std::max(-50.0, std::min(50.0, step));       // damped
            if (T1 < 10.0) T1 = 10.0;
            if (std::abs(step) < 1.0e-7) break;
        }
        const Resolution r = resolve(T1, P, z, vf_in, thermo, locus);
        const bool split = r.fs && flashState::isSplit(*r.fs);
        if (!split && std::abs(r.vf - vfR) <= 1.0e-12)
        {
            inv.T  = T1;
            inv.vf = r.vf;
            return inv;
        }
    }

    //  ---- across a phase boundary: bracket on the published surface ------
    //  f(T) = h_published(T) - h rises with T (sensible heat, and the latent
    //  heat spread over a mixture's boiling range), so the root is bracketed
    //  by stepping outward from T1 and closed by Illinois false position.
    auto f = [&](scalar Tk, scalar& vfk) -> scalar
    {
        const Resolution r = resolve(Tk, P, z, vf_in, thermo, locus);
        vfk = r.vf;
        return molarH(r, Tk, P, z, thermo) - h;
    };
    const scalar Tmin = 10.0, Tmax = 6000.0;
    scalar vfa = 0.0, vfb = 0.0;
    scalar a = std::min(std::max(T1, Tmin), Tmax);
    scalar fa = f(a, vfa);
    if (fa == 0.0) { inv.T = a; inv.vf = vfa; return inv; }
    scalar step = 1.0;
    {
        scalar vfp = 0.0;
        const scalar fp = f(a + 1.0e-3, vfp);
        const scalar cp = (fp - fa) / 1.0e-3;
        if (cp > 1.0e-12) step = std::min(200.0, std::max(1.0, 1.5 * std::abs(fa) / cp));
    }
    scalar b = a, fb = fa;
    for (int k = 0; k < 60 && fa * fb > 0.0; ++k)
    {
        b = (fa > 0.0) ? a - step : a + step;
        if (b < Tmin) b = Tmin;
        if (b > Tmax) b = Tmax;
        fb = f(b, vfb);
        if (fa * fb > 0.0)
        {
            if (b <= Tmin || b >= Tmax) break;
            a = b; fa = fb; vfa = vfb; step *= 2.0;
        }
    }
    if (fa * fb > 0.0)
    {
        //  No sign change in [10, 6000] K: no temperature on this surface
        //  carries `h`.  Return the closer end, its gap stated.
        const bool useA = std::abs(fa) <= std::abs(fb);
        inv.T  = useA ? a : b;
        inv.vf = useA ? vfa : vfb;
        inv.unmatched_J_per_mol = useA ? fa : fb;
        return inv;
    }
    scalar c = a, fc = fa, vfc = vfa;
    int side = 0;
    for (int it = 0; it < 200; ++it)
    {
        c  = (a * fb - b * fa) / (fb - fa);
        if (!(c > std::min(a, b) && c < std::max(a, b))) c = 0.5 * (a + b);
        fc = f(c, vfc);
        if (fc == 0.0 || std::abs(b - a) < 1.0e-9) break;
        if (std::abs(fc) <= 1.0e-12 * std::max(1.0, std::abs(h))) break;
        if (fc * fb > 0.0)
        { b = c; fb = fc; if (side == -1) fa *= 0.5; side = -1; }
        else
        { a = c; fa = fc; if (side == +1) fb *= 0.5; side = +1; }
    }
    inv.T  = c;
    inv.vf = vfc;
    //  A residual far above the tolerance on a collapsed bracket is the JUMP
    //  of a pure fluid's enthalpy at its saturation temperature (the header).
    if (std::abs(fc) > 1.0e-6 * std::max(1.0, std::abs(h)))
        inv.unmatched_J_per_mol = fc;
    return inv;
}

void announceUnmatchedEnthalpy(const std::string& unitType,
                               const std::string& unitName,
                               const std::string& mode,
                               scalar             T_out,
                               scalar             unmatched_kW)
{
    const std::string locus = unitType + " '" + unitName + "' outlet";
    char buf[512];
    std::snprintf(buf, sizeof buf,
        "the %s energy balance found no outlet temperature at which the"
        " published state carries the enthalpy it conserved: it stops at"
        " T_out = %.4f K, %.6g kW short -- a pure product at its own"
        " saturation temperature, where (T, P) do not fix how much of it is"
        " vapour, so its published Q_kW carries that difference",
        mode.c_str(), T_out, unmatched_kW);
    if (AdvisoryLog::instance().addAnnouncedOnce(
            unitType + ".unmatchedEnthalpy." + unitName,
            "model", "warning", locus, buf))
        std::cerr << "[" << unitType << "] " << locus << ": " << buf << "\n";
}

} // namespace reactorOutlet
} // namespace Choupo
