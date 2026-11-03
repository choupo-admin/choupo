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

#include "SpecifiedFlash.H"

#include "core/Advisory.H"
#include "solver/NewtonRaphson.H"
#include "unitOperations/flash/PureSaturationPlateau.H"
#include "unitOperations/flash/StreamEquilibrium.H"

#include <algorithm>
#include <cmath>
#include <functional>
#include <iomanip>
#include <iostream>
#include <limits>
#include <sstream>
#include <stdexcept>

namespace Choupo {
namespace flashState {

const char* specPairWord(SpecPair p)
{
    switch (p)
    {
        case SpecPair::PH:  return "PH";
        case SpecPair::PS:  return "PS";
        case SpecPair::TVF: return "TVF";
        case SpecPair::PVF: return "PVF";
    }
    return "?";
}

std::optional<SpecPair> specPairFromWord(const std::string& w)
{
    if (w == "PH")  return SpecPair::PH;
    if (w == "PS")  return SpecPair::PS;
    if (w == "TVF") return SpecPair::TVF;
    if (w == "PVF") return SpecPair::PVF;
    return std::nullopt;
}

FlashOptions FlashSpecification::defaultFlashOptions()
{
    FlashOptions o;
    o.tolerance      = 1.0e-12;   // Rachford-Rice
    o.compositionTol = 1.0e-12;   // the activity-coefficient outer loop
    o.maxOuterIter   = 500;
    o.verbosity      = 0;
    return o;
}

//  The documented defaults, one per kind of residual (the raw residual is
//  the verdict's channel -- see the header).  Each is two to three orders
//  above the noise of the flash it is taken on, and tight enough that the
//  recovered T or P agrees with the state it came from to ~1e-10 relative.
solver::ConvergenceControls FlashSpecification::defaultControls(SpecPair p)
{
    solver::ConvergenceControls c;
    c.relTol  = 0.0;
    c.maxIter = 100;
    switch (p)
    {
        case SpecPair::PH:  c.tolerance = 1.0e-6;  break;   // J/mol
        case SpecPair::PS:  c.tolerance = 1.0e-9;  break;   // J/(mol K)
        case SpecPair::TVF:
        case SpecPair::PVF: c.tolerance = 1.0e-11; break;   // vapour fraction
    }
    return c;
}

namespace {

constexpr scalar NaN = std::numeric_limits<scalar>::quiet_NaN();

std::string num(scalar v, int prec = 10)
{
    std::ostringstream os;
    os << std::setprecision(prec) << v;
    return os.str();
}

[[noreturn]] void refuse(SpecPair p, const std::string& why)
{
    throw std::runtime_error(std::string("specifiedFlash (")
        + specPairWord(p) + "): " + why);
}

//  A bracket [lo, hi] of an INCREASING f, found by stepping from x0 (step,
//  doubling) toward the sign change, never beyond [xmin, xmax].
struct Bracket
{
    bool   found = false;
    scalar lo = NaN, flo = NaN, hi = NaN, fhi = NaN;
    scalar fAtMin = NaN, fAtMax = NaN;      // for the refusal, when not found
};

Bracket bracketIncreasing(const std::function<scalar(scalar)>& f,
                          scalar x0, scalar step,
                          scalar xmin, scalar xmax)
{
    Bracket b;
    x0 = std::clamp(x0, xmin, xmax);
    scalar fx = f(x0);
    if (fx == 0.0) { b.found = true; b.lo = b.hi = x0; b.flo = b.fhi = 0.0; return b; }
    const int dir = (fx < 0.0) ? +1 : -1;
    scalar x = x0;
    for (int k = 0; k < 200; ++k)
    {
        const scalar xn = std::clamp(x + dir * step, xmin, xmax);
        const scalar fn = f(xn);
        if ((fn >= 0.0) != (fx >= 0.0))
        {
            b.found = true;
            if (dir > 0) { b.lo = x;  b.flo = fx; b.hi = xn; b.fhi = fn; }
            else         { b.lo = xn; b.flo = fn; b.hi = x;  b.fhi = fx; }
            return b;
        }
        if (xn == xmin || xn == xmax)
        {
            (dir > 0 ? b.fAtMax : b.fAtMin) = fn;
            (dir > 0 ? b.fAtMin : b.fAtMax) = (x0 == xmin || x0 == xmax) ? fx : NaN;
            return b;
        }
        x = xn; fx = fn; step *= 2.0;
    }
    return b;
}

struct Searcher
{
    const ThermoPackage&      thermo;
    const sVector&            z;
    const FlashSpecification& spec;
    int                       verbosity;
    int                       flashes = 0;
    std::string               discarded;

    Searcher(const ThermoPackage& t, const sVector& zz,
             const FlashSpecification& sp, int v)
        : thermo(t), z(zz), spec(sp), verbosity(v) {}

    //  ONE trial state.  A package that cannot answer, or a flash that does
    //  not converge, refuses the SPECIFICATION: there is no honest state to
    //  search around (adiabaticFlash's high-side rule is a modelling claim
    //  about the reactive path that a general specification has no grounds
    //  to make).
    FlashSolution flashAt(scalar T, scalar P)
    {
        ++flashes;
        FlashInput in; in.F = 1.0; in.T = T; in.P = P; in.z = z;
        FlashSolution fs;
        try
        {
            fs = flashDiscardingSupercriticalSplit(in, thermo, spec.flash,
                                                   discarded);
        }
        catch (const std::exception& e)
        {
            refuse(spec.pair, "the package could not answer the trial state"
                " T = " + num(T) + " K, P = " + num(P) + " Pa (" + e.what()
                + ").  The specification is refused rather than searched"
                " around: narrow the window (Tmin/Tmax, Pmin/Pmax) or move the"
                " seed into the package's range.");
        }
        if (!fs.converged)
            refuse(spec.pair, "the isothermal flash did not converge at the"
                " trial state T = " + num(T) + " K, P = " + num(P) + " Pa"
                " (regime '" + fs.regime + "', residual " + num(fs.residual)
                + ").");
        return fs;
    }
};

//  ln K of a PURE component on the package's own K at (T, P), x = y = z.
scalar lnKpure(const ThermoPackage& thermo, const sVector& z, std::size_t i,
               scalar T, scalar P)
{
    const sVector K = thermo.Kvec(T, P, z, z);
    if (i >= K.size() || !(K[i] > 0.0) || !std::isfinite(K[i]))
        return NaN;
    return std::log(K[i]);
}

//  The saturation temperature of a pure stream at P: ln K(T, P) = 0, the
//  root of an INCREASING ln K(T).  Nothing when the curve has no root in the
//  window, when the package's K does not move with T there (a single-root
//  cubic gives K = 1 identically, which is not a saturation curve), or when
//  the root lies at or above the component's declared Tc.
std::optional<scalar> pureSaturationT(const ThermoPackage& thermo,
                                      const sVector& z, std::size_t i,
                                      scalar P, scalar Tmin, scalar Tmax)
{
    if (thermo.isHenrySolute(i)) return std::nullopt;
    auto f = [&](scalar T) { return lnKpure(thermo, z, i, T, P); };
    auto df = [&](scalar T) { const scalar h = 1.0e-4;
                              return (f(T + h) - f(T - h)) / (2.0 * h); };
    try
    {
        const scalar Tb = thermo.comp(i).Tb();
        const scalar seed = (Tb > 0.0) ? Tb : 350.0;
        solver::NROptions o;
        o.tolerance = 1.0e-13; o.maxIter = 200;
        o.lower = Tmin; o.upper = Tmax; o.bracket = true;
        o.monotoneIncreasing = true; o.maxStep = 50.0;
        const auto r = solver::newton1D(f, df, seed, o);
        if (!r.converged || !std::isfinite(r.x)) return std::nullopt;
        const scalar slope = df(r.x);
        if (!std::isfinite(slope) || std::fabs(slope) < 1.0e-12) return std::nullopt;
        const scalar Tc = thermo.comp(i).Tc();
        if (Tc > 0.0 && r.x >= Tc) return std::nullopt;
        return r.x;
    }
    catch (const std::exception&) { return std::nullopt; }
}

//  The saturation pressure of a pure stream at T: ln K(T, e^u) = 0, the root
//  of a DECREASING ln K(u), u = ln P.  Same refusals as above.
std::optional<scalar> pureSaturationP(const ThermoPackage& thermo,
                                      const sVector& z, std::size_t i,
                                      scalar T, scalar Pmin, scalar Pmax)
{
    if (thermo.isHenrySolute(i)) return std::nullopt;
    const scalar Tc = thermo.comp(i).Tc();
    if (Tc > 0.0 && T >= Tc) return std::nullopt;
    auto f = [&](scalar u) { return lnKpure(thermo, z, i, T, std::exp(u)); };
    auto df = [&](scalar u) { const scalar h = 1.0e-6;
                              return (f(u + h) - f(u - h)) / (2.0 * h); };
    try
    {
        scalar seed = std::log(1.0e5);
        if (thermo.hasSaturationCurve(i))
        {
            const scalar ps = thermo.Psat(i, T);
            if (ps > 0.0 && std::isfinite(ps)) seed = std::log(ps);
        }
        solver::NROptions o;
        o.tolerance = 1.0e-13; o.maxIter = 200;
        o.lower = std::log(Pmin); o.upper = std::log(Pmax); o.bracket = true;
        o.monotoneIncreasing = false; o.maxStep = 2.0;
        const auto r = solver::newton1D(f, df, seed, o);
        if (!r.converged || !std::isfinite(r.x)) return std::nullopt;
        const scalar slope = df(r.x);
        if (!std::isfinite(slope) || std::fabs(slope) < 1.0e-12) return std::nullopt;
        return std::exp(r.x);
    }
    catch (const std::exception&) { return std::nullopt; }
}

scalar defaultTseed(const ThermoPackage& thermo, const sVector& z)
{
    scalar T0 = 0.0;
    for (std::size_t i = 0; i < z.size() && i < thermo.n(); ++i)
        T0 += z[i] * (thermo.comp(i).Tb() > 0.0 ? thermo.comp(i).Tb() : 350.0);
    return T0;
}

scalar defaultPseed(const ThermoPackage& thermo, const sVector& z, scalar T)
{
    scalar P0 = 0.0;
    for (std::size_t i = 0; i < z.size() && i < thermo.n(); ++i)
        if (z[i] > 0.0 && thermo.hasSaturationCurve(i))
        {
            try
            {
                const scalar ps = thermo.Psat(i, T);
                if (ps > 0.0 && std::isfinite(ps)) P0 += z[i] * ps;
            }
            catch (const std::exception&) {}
        }
    return (P0 > 0.0) ? P0 : 1.0e5;
}

//  The verdict, through the one decision of solver/Convergence.H.  `phi` and
//  `target` are the two terms the residual balances (its degenerate case:
//  the verdict falls to the raw residual, and the criterion says so).
solver::ResidualReport verdict(const solver::ConvergenceControls& c,
                               scalar rawInitial, scalar phi, scalar target,
                               int iterations)
{
    solver::ResidualReport rr;
    rr.iterations = iterations;
    const scalar r = phi - target;
    const auto nI = solver::normalizeResidual({ rawInitial }, { rawInitial, 0.0 });
    const auto nF = solver::normalizeResidual({ r }, { phi, target });
    rr.rawInitial  = std::fabs(rawInitial);
    rr.rawFinal    = std::fabs(r);
    rr.normInitial = nI.normalized;
    rr.normFinal   = nF.normalized;
    std::string crit;
    rr.converged = solver::convergedNow(c, rr.normInitial, rr.normFinal,
                                        rr.rawFinal, nF.degenerate, crit);
    rr.criterion = rr.converged ? crit
                 : (iterations >= c.maxIter ? solver::exhaustedCriterion(c)
                                            : solver::stalledCriterion());
    return rr;
}

scalar propertyOf(SpecPair p, const FlashSolution& fs, scalar T, scalar P,
                  const sVector& z, const ThermoPackage& thermo)
{
    return (p == SpecPair::PS) ? sOfState(fs, T, P, z, thermo)
                               : hOfState(fs, T, P, z, thermo);
}

//  A pure two-phase state on its curve with the vapour fraction q.
FlashSolution pureOnCurve(const sVector& z, scalar q)
{
    FlashSolution fs;
    fs.V_over_F  = q;
    fs.x         = z;
    fs.y         = z;
    fs.K.assign(z.size(), 1.0);
    fs.converged = true;
    fs.regime    = "pure component on its saturation curve (the vapour"
                   " fraction is the specification's, not the flash's)";
    return fs;
}

}  // namespace

SpecifiedState stateAtTP(const ThermoPackage& thermo, const sVector& z,
                         scalar T, scalar P, const FlashOptions& opts,
                         bool wantS)
{
    FlashSpecification spec;
    spec.flash = opts;
    Searcher s{ thermo, z, spec, 0 };
    SpecifiedState st;
    st.T = T; st.P = P;
    st.phases = s.flashAt(T, P);
    st.vaporFraction = vapourFractionOf(st.phases);
    st.H = hOfState(st.phases, T, P, z, thermo);
    if (wantS) st.S = sOfState(st.phases, T, P, z, thermo);
    st.route = "isothermal flash at (T, P)";
    st.flashes = s.flashes;
    if (!s.discarded.empty()) st.notes.push_back(s.discarded);
    return st;
}

SpecifiedState specifiedFlash(const ThermoPackage&      thermo,
                              const sVector&            z,
                              const FlashSpecification& spec,
                              int                       verbosity,
                              bool                      wantS)
{
    const SpecPair pair = spec.pair;
    const solver::ConvergenceControls ctl =
        spec.controlsDeclared ? spec.controls
                              : FlashSpecification::defaultControls(pair);
    const bool heldP = (pair != SpecPair::TVF);
    const scalar held = heldP ? spec.P : spec.T;
    if (!(held > 0.0) || !std::isfinite(held))
        refuse(pair, std::string("the held variable ") + (heldP ? "P" : "T")
            + " is missing or not positive.");
    if (!std::isfinite(spec.target))
        refuse(pair, "the specified value is missing.");
    const bool vfPair = (pair == SpecPair::TVF || pair == SpecPair::PVF);
    if (vfPair && (spec.target < 0.0 || spec.target > 1.0))
        refuse(pair, "the vapour fraction " + num(spec.target)
            + " lies outside [0, 1].");
    if (!(spec.Tmin > 0.0 && spec.Tmax > spec.Tmin)
        || !(spec.Pmin > 0.0 && spec.Pmax > spec.Pmin))
        refuse(pair, "the search window is empty (Tmin " + num(spec.Tmin)
            + ", Tmax " + num(spec.Tmax) + ", Pmin " + num(spec.Pmin)
            + ", Pmax " + num(spec.Pmax) + ").");
    const bool needS = wantS || pair == SpecPair::PS;

    Searcher srch{ thermo, z, spec, verbosity };
    SpecifiedState st;
    st.pair = pair;

    //  The entropy is the SPECIFICATION of a (P, S) flash and a by-product
    //  of every other: where the package has no entropy for the state (an
    //  electrolyte liquid, a precipitate), a (P, S) flash refuses and the
    //  others publish no S and say why -- never a neighbouring rung.
    auto optionalS = [&](const std::function<scalar()>& f) -> scalar
    {
        if (pair == SpecPair::PS) return f();
        try { return f(); }
        catch (const std::exception& e)
        {
            st.notes.push_back(std::string("the entropy of this state is not"
                " published: ") + e.what());
            return NaN;
        }
    };
    const auto sole = soleComponent(z);
    const scalar target = spec.target;

    //  The search is a WALK: its trial states' advisories are not about the
    //  answer (AdiabaticFlash's own frame, the same reason).  Closed before
    //  the answer is priced, which then speaks in full.
    AdvisoryFrame walk(std::string("specifiedFlash ") + specPairWord(pair)
                       + " search");

    auto trace = [&](int it, scalar x, scalar f)
    {
        if (verbosity < 3) return;
        const auto fl = std::cout.flags(); const auto pr = std::cout.precision();
        std::cout << "  [specifiedFlash " << specPairWord(pair) << "] it "
                  << std::setw(3) << it << "  " << (heldP ? "T = " : "P = ")
                  << std::setprecision(12) << x << (heldP ? " K" : " Pa")
                  << "   residual " << std::scientific << std::setprecision(4)
                  << f << "\n";
        std::cout.flags(fl); std::cout.precision(pr);
    };

    scalar T = heldP ? NaN : spec.T;
    scalar P = heldP ? spec.P : NaN;
    FlashSolution answer;
    bool   haveAnswer = false;   // the plateau and the pure curve build theirs
    scalar rawInitial = 0.0;
    int    iterations = 0;

    // ======================== (P, H) and (P, S) ==========================
    if (pair == SpecPair::PH || pair == SpecPair::PS)
    {
        scalar wLo = spec.Tmin, wHi = spec.Tmax;
        std::optional<scalar> legL, legV, Tsat;
        if (sole) Tsat = pureSaturationT(thermo, z, *sole, P, spec.Tmin, spec.Tmax);
        if (Tsat)
        {
            const SaturationLegs legs = (pair == SpecPair::PS)
                ? pureSaturationEntropyLegs(*Tsat, P, z, thermo)
                : pureSaturationLegs(*Tsat, P, z, thermo);
            if (target >= legs.hLiquid && target <= legs.hVapour)
            {
                //  THE PLATEAU: the state is two-phase at Tsat, its
                //  coordinate the vapour fraction (lever rule on the legs).
                const scalar q = (target - legs.hLiquid) / legs.latent();
                T = *Tsat;
                answer = pureOnCurve(z, q);
                haveAnswer = true;
                st.onSaturationPlateau = true;
                st.route = "pure-component saturation plateau: T = Tsat(P), the"
                           " vapour fraction from the lever rule on the"
                           " saturated legs (closed form, no search)";
                rawInitial = 0.0;     // closed form: there is no seed
            }
            else if (target < legs.hLiquid) { wHi = *Tsat; legL = legs.hLiquid; }
            else                            { wLo = *Tsat; legV = legs.hVapour; }
        }
        if (!haveAnswer)
        {
            //  f(T) = Phi(T) - target, increasing.  On a pure stream's single-
            //  phase side the window ends at Tsat and the end is the LEG (a
            //  flash ON the curve cannot say which side it is on).
            auto f = [&](scalar Tq) -> scalar
            {
                if (legL && Tq >= *Tsat) return *legL - target;
                if (legV && Tq <= *Tsat) return *legV - target;
                const FlashSolution fs = srch.flashAt(Tq, P);
                return propertyOf(pair, fs, Tq, P, z, thermo) - target;
            };
            scalar seed = std::isfinite(spec.seed) ? spec.seed
                        : (Tsat ? (legL ? *Tsat - 1.0 : *Tsat + 1.0)
                                : defaultTseed(thermo, z));
            seed = std::clamp(seed, wLo, wHi);
            rawInitial = f(seed);
            const Bracket b = bracketIncreasing(f, seed, 10.0, wLo, wHi);
            if (!b.found)
                refuse(pair, std::string("the specified ")
                    + (pair == SpecPair::PS ? "S = " + num(target) + " J/(mol K)"
                                            : "H = " + num(target) + " J/mol")
                    + " is not reached at P = " + num(P) + " Pa inside the"
                    " window [" + num(wLo) + ", " + num(wHi) + "] K (the"
                    " residual at the end the search reached: "
                    + num(std::isfinite(b.fAtMax) ? b.fAtMax : b.fAtMin)
                    + ").  Widen Tmin/Tmax if the state exists further out;"
                    " otherwise no equilibrium state at this pressure carries"
                    " that value.");
            const scalar x0 = (b.fhi - b.flo != 0.0)
                ? b.lo + (b.hi - b.lo) * (-b.flo) / (b.fhi - b.flo) : b.lo;
            auto df = [&](scalar Tq)
            {
                const scalar h = std::max(1.0e-5, 1.0e-7 * Tq);
                return (f(Tq + h) - f(Tq - h)) / (2.0 * h);
            };
            solver::NROptions o;
            o.tolerance = ctl.tolerance; o.maxIter = ctl.maxIter;
            o.lower = b.lo; o.upper = b.hi; o.bracket = true;
            o.monotoneIncreasing = true;
            o.onIter = [&](const solver::NRTrace& tr) { trace(tr.iteration, tr.x, tr.f); };
            const auto r = solver::newton1D(f, df, x0, o);
            T = r.x;
            iterations = r.iterations;
            st.route = Tsat ? std::string("pure component, single phase: ")
                              + (legL ? "liquid" : "vapour")
                              + " side of Tsat(P), bracketed Newton in T"
                            : "bracketed Newton in T over the isothermal flash";
        }
    }
    // ======================== (P, V/F) and (T, V/F) ======================
    else
    {
        const bool inT = (pair == SpecPair::PVF);
        const scalar beta = target;
        if (sole)
        {
            const auto sat = inT
                ? pureSaturationT(thermo, z, *sole, P, spec.Tmin, spec.Tmax)
                : pureSaturationP(thermo, z, *sole, T, spec.Pmin, spec.Pmax);
            if (!sat)
                refuse(pair, std::string("the pure component '")
                    + thermo.comp(*sole).name() + "' has no saturation "
                    + (inT ? "temperature at P = " + num(P) + " Pa"
                           : "pressure at T = " + num(T) + " K")
                    + " inside the window (above its critical point, a Henry"
                    " solute, or a K that does not cross 1): a vapour"
                    " fraction cannot be specified where no two phases"
                    " coexist.");
            (inT ? T : P) = *sat;
            answer = pureOnCurve(z, beta);
            haveAnswer = true;
            st.onSaturationPlateau = (beta > 0.0 && beta < 1.0);
            st.route = std::string("pure component on its saturation curve: ")
                     + (inT ? "Tsat(P)" : "Psat(T)") + " from ln K = 0, the"
                       " vapour fraction declared";
        }
        else
        {
            //  The unknown: T (PVF) or u = ln P (TVF), each made INCREASING.
            auto stateAt = [&](scalar x) -> FlashSolution
            {
                return inT ? srch.flashAt(x, P) : srch.flashAt(T, std::exp(x));
            };
            const scalar xmin = inT ? spec.Tmin : std::log(spec.Pmin);
            const scalar xmax = inT ? spec.Tmax : std::log(spec.Pmax);
            scalar seed = std::isfinite(spec.seed)
                ? (inT ? spec.seed : std::log(spec.seed))
                : (inT ? defaultTseed(thermo, z)
                       : std::log(defaultPseed(thermo, z, T)));
            seed = std::clamp(seed, xmin, xmax);
            const scalar step = inT ? 10.0 : 0.5;
            const bool boundary = (beta <= 0.0 || beta >= 1.0);

            //  Increasing residual: V/F rises with T and falls with P.
            auto g = [&](scalar x) -> scalar
            {
                const scalar v = vapourFractionOf(stateAt(x));
                if (!boundary) return inT ? (v - beta) : (beta - v);
                //  The edge of the band AS THE FLASH DRAWS IT: +1 on the side
                //  where the boundary phase has appeared, -1 on the other.
                const bool past = (beta <= 0.0) ? (inT ? v > 0.0 : v <= 0.0)
                                                : (inT ? v >= 1.0 : v < 1.0);
                return past ? 1.0 : -1.0;
            };
            rawInitial = g(seed);
            const Bracket b = bracketIncreasing(g, seed, step, xmin, xmax);
            if (!b.found)
                refuse(pair, "no state with vapour fraction " + num(beta)
                    + " at " + (inT ? "P = " + num(P) + " Pa" : "T = " + num(T) + " K")
                    + " inside the window " + (inT
                        ? "[" + num(spec.Tmin) + ", " + num(spec.Tmax) + "] K"
                        : "[" + num(spec.Pmin) + ", " + num(spec.Pmax) + "] Pa")
                    + ": the two-phase band is not crossed there.");
            if (!boundary)
            {
                const scalar x0 = (b.fhi - b.flo != 0.0)
                    ? b.lo + (b.hi - b.lo) * (-b.flo) / (b.fhi - b.flo) : b.lo;
                auto dg = [&](scalar x)
                {
                    const scalar h = inT ? std::max(1.0e-5, 1.0e-7 * x) : 1.0e-7;
                    return (g(x + h) - g(x - h)) / (2.0 * h);
                };
                solver::NROptions o;
                o.tolerance = ctl.tolerance; o.maxIter = ctl.maxIter;
                o.lower = b.lo; o.upper = b.hi; o.bracket = true;
                o.monotoneIncreasing = true;
                o.onIter = [&](const solver::NRTrace& tr)
                { trace(tr.iteration, inT ? tr.x : std::exp(tr.x), tr.f); };
                const auto r = solver::newton1D(g, dg, x0, o);
                (inT ? T : P) = inT ? r.x : std::exp(r.x);
                iterations = r.iterations;
                st.route = std::string("bracketed Newton on the flash's vapour"
                           " fraction in ") + (inT ? "T" : "ln P");
            }
            else
            {
                //  Bisection on the flash's own split predicate.  The residual
                //  handed to the verdict is the RELATIVE bracket width.
                scalar lo = b.lo, hi = b.hi;
                int k = 0;
                const scalar relTarget = (pair == SpecPair::PVF)
                    ? 1.0e-12 : 1.0e-12;
                for (; k < ctl.maxIter; ++k)
                {
                    const scalar width = inT ? (hi - lo) / std::fabs(hi) : (hi - lo);
                    trace(k, inT ? 0.5 * (lo + hi) : std::exp(0.5 * (lo + hi)), width);
                    if (width <= std::min(relTarget, ctl.tolerance * 10.0)) break;
                    const scalar mid = 0.5 * (lo + hi);
                    if (g(mid) > 0.0) hi = mid; else lo = mid;
                }
                iterations = k;
                //  The phases: from the side on which the boundary phase
                //  exists (the incipient vapour of a bubble point, the
                //  incipient liquid of a dew point); the vapour fraction is
                //  the specification's.
                const bool splitIsHi = (beta <= 0.0) ? inT : !inT;
                const scalar xs = splitIsHi ? hi : lo;
                FlashSolution fs = stateAt(xs);
                fs.V_over_F = beta;
                if (beta <= 0.0) fs.x = z; else fs.y = z;
                fs.regime = (beta <= 0.0) ? "bubble point (the edge of the"
                    " flash's two-phase band)" : "dew point (the edge of the"
                    " flash's two-phase band)";
                const scalar mid = 0.5 * (lo + hi);
                (inT ? T : P) = inT ? mid : std::exp(mid);
                answer = fs;
                haveAnswer = true;
                st.route = std::string("bisection in ") + (inT ? "T" : "ln P")
                         + " on the flash's split predicate ("
                         + (beta <= 0.0 ? "bubble" : "dew") + " point)";
                //  The verdict below is taken on the width, as a residual.
                const scalar width = inT ? (hi - lo) / std::fabs(hi) : (hi - lo);
                walk.close();
                st.phases = answer;
                st.T = T; st.P = P; st.vaporFraction = beta;
                st.H = hOfState(answer, T, P, z, thermo);
                if (needS) st.S = optionalS([&] { return sOfState(answer, T, P, z, thermo); });
                st.flashes = srch.flashes;
                solver::ConvergenceControls cw = ctl;
                cw.tolerance = std::max(ctl.tolerance, relTarget);
                st.report = verdict(cw, 1.0, width, 0.0, iterations);
                st.report.criterion = "bracket width (relative) on the flash's"
                    " split predicate: " + st.report.criterion;
                if (!st.report.converged)
                    refuse(pair, "the bisection on the band edge did not close"
                        " within maxIter " + std::to_string(ctl.maxIter)
                        + " (relative width " + num(width) + ").");
                if (!srch.discarded.empty()) st.notes.push_back(srch.discarded);
                return st;
            }
        }
    }

    walk.close();     // the search is over; what follows is the answer

    // ---- the answer, priced in full -------------------------------------
    if (!haveAnswer) answer = srch.flashAt(T, P);
    st.phases = answer;
    st.T = T;
    st.P = P;
    st.vaporFraction = haveAnswer ? answer.V_over_F : vapourFractionOf(answer);
    if (haveAnswer && sole)
    {
        //  A PURE state ON its curve is priced on the saturated legs (the
        //  pinned two-phase reading of PureSaturationPlateau.H), never at
        //  (T, P): on the curve a pure-fluid method answers one side of it,
        //  chosen by the last digits of P, and the latent heat is lost.
        const scalar q = answer.V_over_F;
        const SaturationLegs hl = pureSaturationLegs(T, P, z, thermo);
        st.H = hl.hLiquid + q * hl.latent();
        if (needS)
        {
            st.S = optionalS([&] {
                const SaturationLegs sl = pureSaturationEntropyLegs(T, P, z, thermo);
                return sl.hLiquid + q * sl.latent(); });
        }
    }
    else
    {
        st.H = hOfState(answer, T, P, z, thermo);
        if (needS) st.S = optionalS([&] { return sOfState(answer, T, P, z, thermo); });
    }
    st.flashes = srch.flashes;

    const scalar phi = (pair == SpecPair::PH) ? st.H
                     : (pair == SpecPair::PS) ? st.S
                     : st.vaporFraction;
    st.report = verdict(ctl, rawInitial, phi, target, iterations);
    if (!st.report.converged)
        refuse(pair, "the search did not meet its tolerance: residual "
            + num(st.report.rawFinal) + " against " + num(ctl.tolerance)
            + " after " + std::to_string(iterations) + " iteration(s) ("
            + st.report.criterion + ").  The state found is NOT published.");
    if (!srch.discarded.empty()) st.notes.push_back(srch.discarded);
    return st;
}

} // namespace flashState
} // namespace Choupo
