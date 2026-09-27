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
Function
    Choupo::GibbsMethod::solve

Description
    The constrained Gibbs minimisation WITH pure solid phases (commission
    C14, 2026-09-27: solid carbon in a steam reformer).

    THE PHYSICS.  A pure solid s (graphite) is its own phase: its chemical
    potential is its pure-solid standard potential, mu_s = g_s(T) --
    activity one, no mixing term -- and its amount n_s >= 0 may be zero.  At
    the constrained minimum of G the element potentials pi_k (= lambda_k/RT)
    price every species present, so a PRESENT solid satisfies

        sum_k pi_k A_ks  =  g_s(T) / RT              (ln a_s = 0)

    and an ABSENT one satisfies ln a_s = sum_k pi_k A_ks - g_s/RT <= 0: the
    fluid would not lower its Gibbs energy by depositing it.  So the test on
    the solid-FREE equilibrium decides the phase set exactly: ln a_s > 0
    there means the solid-free answer is NOT the minimum (a carbon activity
    above one -- a reformer that cokes); ln a_s <= 0 means it is.

    THE FORMULATION (the least invasive correct one).  The fluid methods are
    untouched and keep doing what they do: this file removes the solid's
    columns from the problem, hands the fluid method the element totals
    b - A_s n_s, and solves ONE scalar equation for n_s,

        r(n_s) = sum_k pi_k(b - A_s n_s) A_ks - g_s/RT = 0,

    by BISECTION.  r is monotone non-increasing in n_s for ANY solid: at
    fixed T and P the element potentials of an ideal fluid increase with the
    element totals (d pi/d b is positive semi-definite -- the inverse of the
    constrained Hessian), so dr/dn_s = -A_s^T (d pi/d b) A_s <= 0.  A
    monotone scalar residual bracketed at n_s = 0 (r > 0) and near the
    element-exhaustion bound (r < 0) cannot be missed, and each trial re-uses
    the proven fluid Newton -- the same nesting the element-potential method
    already uses for its one condensing liquid (ElementPotential.cpp, step 3).

    WHAT IS REFUSED, BY NAME (never a silent fallback):
      * a method that publishes no element potentials (`directMin`): the
        test above has nothing to read;
      * an element carried ONLY by the solid(s): the fluid problem would be
        singular in it;
      * TWO pure solids supersaturated at once: a multi-solid active set is
        not implemented, and choosing one would silently answer a different
        question.

    WHAT THE ENERGY SIDE MUST DO (in the reactor, not here): price n_s on
    the SOLID rung, `Component::h_formation(T, "solid")` -- the same leg the
    energy report applies to a stream's `s[]` -- and never `h_pure_ig`,
    which a pureSolid record refuses (the reference rung).

    ONE HOME WITH THE EQUILIBRIUM REACTOR (slice 2, 2026-09-27): what a pure
    solid IS, its rung, the appearance threshold, the verdict sentence and
    the KPI names live in `unitOperations/reactor/PureSolidPhase.H`, which
    `equilibriumReactor` reads too.
\*---------------------------------------------------------------------------*/

#include "GibbsMethod.H"

#include "thermo/Component.H"

#include <algorithm>
#include <cmath>
#include <initializer_list>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

namespace {

//  ln a_s = sum_k pi_k A_ks - g_s/RT, read off a fluid equilibrium.
scalar lnActivity(const GibbsProblem& p, const GibbsEquilibrium& e,
                  std::size_t s, scalar g_over_RT)
{
    scalar a = -g_over_RT;
    for (std::size_t k = 0; k < p.M(); ++k) a += e.pi[k] * p.A[k][s];
    return a;
}

} // namespace

scalar pureSolidEnthalpy_W(const GibbsProblem& p, const GibbsEquilibrium& eq,
                           scalar T)
{
    scalar H = 0.0;
    for (std::size_t i = 0; i < eq.nSolid.size() && i < p.N(); ++i)
        if (eq.nSolid[i] > 0.0)
            H += eq.nSolid[i]
               * pureSolidPhase::enthalpy(p.thermo->comp(p.compIdx[i]), T);
    return H;                          // mol/s x J/mol = W
}

GibbsEquilibrium GibbsMethod::solve(const GibbsProblem& p, scalar T,
                                    const IterHook& onIter) const
{
    const ThermoPackage& thermo = *p.thermo;
    const std::size_t    M = p.M(), N = p.N();

    std::vector<std::size_t> solid, fluid;
    for (std::size_t i = 0; i < N; ++i)
    {
        if (pureSolidPhase::isPureSolid(thermo.comp(p.compIdx[i])))
            solid.push_back(i);
        else
            fluid.push_back(i);
    }
    if (solid.empty()) return equilibrium(p, T, onIter);     // the unchanged path

    const auto nameOf = [&](std::size_t i) -> std::string
        { return thermo.comp(p.compIdx[i]).name(); };

    if (fluid.empty())
        throw std::runtime_error("GibbsReactor: every declared species is a"
            " pure solid -- there is no fluid phase to equilibrate with.");

    //  The fluid sub-problem: the same elements, the fluid species' columns.
    GibbsProblem fp;
    fp.thermo = p.thermo;
    fp.P = p.P;
    fp.dTapproach = p.dTapproach;
    fp.b = p.b;
    fp.A.assign(M, std::vector<scalar>(fluid.size(), 0.0));
    for (std::size_t f = 0; f < fluid.size(); ++f)
    {
        const std::size_t i = fluid[f];
        for (std::size_t k = 0; k < M; ++k) fp.A[k][f] = p.A[k][i];
        fp.nIn.push_back(p.nIn[i]);
        fp.compIdx.push_back(p.compIdx[i]);
        fp.condensable.push_back(p.condensable[i]);
    }
    for (std::size_t k = 0; k < M; ++k)
    {
        bool inFluid = false;
        for (std::size_t f = 0; f < fluid.size(); ++f)
            if (fp.A[k][f] != 0.0) inFluid = true;
        if (!inFluid)
            throw std::runtime_error("GibbsReactor: element #"
                + std::to_string(k + 1) + " of `elements` is carried ONLY by"
                " pure-solid species -- the fluid equilibrium would be singular"
                " in it.  Declare a fluid species that carries it.");
    }

    //  The solid's standard potential at the CHEMISTRY temperature: the
    //  fluid methods evaluate g/RT at T + dTapproach (ElementPotential.cpp),
    //  so the solid is priced there too, or the test would compare two
    //  temperatures.  The solid rung, never the ideal-gas one.
    const scalar Tchem = T + p.dTapproach;
    std::vector<scalar> gS(N, 0.0);
    for (std::size_t s : solid)
        gS[s] = pureSolidPhase::gOverRT(thermo.comp(p.compIdx[s]), Tchem);

    //  Map a fluid answer back onto the full species list.
    auto expand = [&](const GibbsEquilibrium& e, const std::vector<scalar>& nS)
    {
        GibbsEquilibrium full = e;
        full.nGas.assign(N, 0.0);
        full.nLiq.assign(N, 0.0);
        for (std::size_t f = 0; f < fluid.size(); ++f)
        {
            full.nGas[fluid[f]] = (f < e.nGas.size()) ? e.nGas[f] : 0.0;
            full.nLiq[fluid[f]] = (f < e.nLiq.size()) ? e.nLiq[f] : 0.0;
        }
        full.nSolid = nS;
        return full;
    };
    auto requirePi = [&](const GibbsEquilibrium& e)
    {
        if (e.pi.size() != M)
            throw std::runtime_error("GibbsReactor: a pure solid phase is"
                " declared (" + nameOf(solid.front()) + ") but the method '"
                + name() + "' publishes no element potentials, so whether the"
                " solid appears cannot be decided.  Use `model"
                " elementPotential;` or `model reactiveFlash;`.");
    };

    // 1. The solid-FREE equilibrium, and the test on it.
    const GibbsEquilibrium e0 = equilibrium(fp, T, onIter);
    std::vector<scalar> nS(N, 0.0);
    if (!e0.converged) return expand(e0, nS);
    requirePi(e0);

    std::vector<GibbsEquilibrium::SolidVerdict> verdicts;
    std::vector<std::size_t> supersaturated;
    for (std::size_t s : solid)
    {
        GibbsEquilibrium::SolidVerdict v;
        v.i = s;
        v.lnActivityWithout = lnActivity(p, e0, s, gS[s]);
        v.lnActivity        = v.lnActivityWithout;
        verdicts.push_back(v);
        if (v.lnActivityWithout > pureSolidPhase::kLnActivityAppears)
            supersaturated.push_back(s);
    }
    if (supersaturated.empty())
    {
        GibbsEquilibrium out = expand(e0, nS);
        out.solids = verdicts;
        return out;                   // every solid absent: the fluid IS the answer
    }
    if (supersaturated.size() > 1)
    {
        std::ostringstream m;
        m << "GibbsReactor: " << supersaturated.size() << " pure solid phases"
             " are supersaturated at once (";
        for (std::size_t a = 0; a < supersaturated.size(); ++a)
            m << (a ? ", " : "") << nameOf(supersaturated[a]);
        m << ") -- a multi-solid active set is not implemented, and picking"
             " one would answer a different question.  Declare only the solid"
             " the exercise is about.";
        throw std::runtime_error(m.str());
    }

    // 2. ONE solid present: bisect n_s on the monotone residual.
    const std::size_t c = supersaturated.front();
    scalar nMax = -1.0;
    for (std::size_t k = 0; k < M; ++k)
        if (p.A[k][c] > 0.0)
        {
            const scalar lim = p.b[k] / p.A[k][c];
            nMax = (nMax < 0.0) ? lim : std::min(nMax, lim);
        }

    GibbsEquilibrium trial;
    int evaluations = 0;
    auto r = [&](scalar n) -> scalar
    {
        GibbsProblem q = fp;
        for (std::size_t k = 0; k < M; ++k) q.b[k] = p.b[k] - p.A[k][c] * n;
        trial = equilibrium(q, T, {});
        ++evaluations;
        if (!trial.converged)
        {
            std::ostringstream m;
            m << "GibbsReactor: the fluid equilibrium did not converge while"
                 " depositing solid " << nameOf(c) << " (n_s = " << n
              << " mol/s); no answer is published.";
            throw std::runtime_error(m.str());
        }
        requirePi(trial);
        return lnActivity(p, trial, c, gS[c]);
    };

    //  Bracket: r(0) > 0 is known; walk toward the exhaustion bound, where
    //  the fluid runs out of the solid's element and ln a_s -> -infinity.
    scalar lo = 0.0, hi = -1.0;
    for (scalar gap : { 0.5, 0.1, 1.0e-2, 1.0e-3, 1.0e-4, 1.0e-6, 1.0e-8, 1.0e-10 })
    {
        const scalar n = nMax * (1.0 - gap);
        if (r(n) < 0.0) { hi = n; break; }
        lo = n;
    }
    if (hi < 0.0)
        throw std::runtime_error("GibbsReactor: pure solid " + nameOf(c)
            + " stays supersaturated up to 1 - 1e-10 of the element-exhaustion"
              " bound -- the fluid cannot be brought to a_s = 1; no answer is"
              " published.");

    scalar n = 0.5 * (lo + hi);
    for (int it = 0; it < 200; ++it)
    {
        n = 0.5 * (lo + hi);
        const scalar rn = r(n);
        if (std::abs(rn) < 1.0e-11 || (hi - lo) < 1.0e-15 * nMax) break;
        if (rn > 0.0) lo = n; else hi = n;
    }
    //  `trial` holds the fluid at the last evaluated n.
    nS[c] = n;
    GibbsEquilibrium out = expand(trial, nS);

    // 3. The phase set is re-tested AT the answer: the present solid sits at
    //    a = 1 and every other declared solid must be undersaturated there.
    for (auto& v : verdicts)
    {
        v.lnActivity = lnActivity(p, trial, v.i, gS[v.i]);
        v.present    = (v.i == c);
        v.bisections = v.present ? evaluations : 0;
        if (!v.present && v.lnActivity > pureSolidPhase::kLnActivityAppears)
            throw std::runtime_error("GibbsReactor: depositing " + nameOf(c)
                + " leaves " + nameOf(v.i) + " supersaturated -- a"
                  " multi-solid active set is not implemented.");
    }
    out.solids = verdicts;
    return out;
}

} // namespace Choupo
