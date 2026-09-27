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

#include "EquilibriumReactor.H"
#include "TemperatureApproach.H"
#include "thermo/reaction/Reaction.H"
#include "core/Advisory.H"
#include "core/Dimensions.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <limits>
#include <sstream>
#include <stdexcept>

namespace Choupo {

int EquilibriumReactor::solve(const DictPtr&       dict,
                              const ThermoPackage& thermo,
                              int                  verbosity)
{
    const std::size_t n = thermo.n();
    constexpr scalar P_STD = 1.0e5;   // standard state (1 bar) -- the dG° datum

    auto feedDict = dict->subDict("feed");
    auto operDict = dict->subDict("operation");
    auto compDict = dict->subDict("composition");

    const scalar F_in   = feedDict->lookupScalar("F", Dims::molarFlow);   // kmol/s
    const scalar T_feed = feedDict->lookupScalar("T", Dims::temperature);
    const scalar P      = feedDict->lookupScalar("P", Dims::pressure);
    const scalar T      = operDict->lookupScalarOrDefault("T", T_feed);   // isothermal

    // ---- Inlet moles (kmol/s) from the feed composition -----------------
    sVector z(n, 0.0);
    { scalar s = 0.0;
      for (const auto& key : compDict->keys()) { z[thermo.indexOf(key)] = compDict->lookupScalar(key); }
      for (auto v : z) s += v;
      if (s > 0.0) for (auto& v : z) v /= s; }
    sVector n0(n, 0.0);
    for (std::size_t i = 0; i < n; ++i) n0[i] = z[i] * F_in;

    // ---- The SET of R reactions: stoichiometry nu_j + Kp_j(T) -----------
    //  Declared as `reactions ( r1 r2 ... );` on the unit -- the ONE multi-reaction
    //  grammar (batch/dynamic take the same); the Flowsheet resolves each name from
    //  constant/reactions into this dict list.  Stoichiometry lives in the library.
    if (!dict->hasDictList("reactions"))
        throw std::runtime_error("equilibriumReactor: needs a `reactions ( r1 r2 ... );` "
            "list of names defined in constant/reactions (each with a `stoichiometry` block)");
    auto rxnList = dict->lookupDictList("reactions");
    const std::size_t R = rxnList.size();
    if (R == 0)
        throw std::runtime_error("equilibriumReactor: the `reactions ( ... )` list is empty");

    std::vector<sVector>     nu(R, sVector(n, 0.0));
    std::vector<std::string> rname(R);
    sVector                  Kp(R, 0.0), lnKp(R, 0.0), dHrxn(R, 0.0), xiMax(R, 0.0);
    std::vector<bool>        dHok(R, true);   // this reaction's dH_rxn(T) was priced
    bool haveDuty = true;
    for (std::size_t j = 0; j < R; ++j)
    {
        rname[j] = rxnList[j]->lookupWordOrDefault("name", "rxn" + std::to_string(j + 1));
        for (const auto& s : rxnList[j]->lookupDictList("stoichiometry"))
            nu[j][thermo.indexOf(s->lookupWord("component"))] = s->lookupScalar("nu");

        const auto eq = Reaction::equilibrium(thermo, nu[j], T);         // Kp from dG°(T)
        Kp[j]   = eq.Kp;
        lnKp[j] = eq.lnKp;   // -dG/RT itself: exp may over/underflow, ln K does not

        // Forward limit (a reactant runs out) -- sets the start + the KPI conversion.
        scalar m = std::numeric_limits<scalar>::infinity();
        for (std::size_t i = 0; i < n; ++i)
            if (nu[j][i] < 0.0 && n0[i] > 0.0) m = std::min(m, n0[i] / (-nu[j][i]));
        xiMax[j] = std::isfinite(m) ? m : 0.0;

        try { for (std::size_t i = 0; i < n; ++i)
                  if (nu[j][i] != 0.0) dHrxn[j] += nu[j][i] * thermo.comp(i).h_pure_ig(T); }
        catch (const std::exception&) { haveDuty = false; dHok[j] = false; }
    }

    // ---- The temperature approach: DECLARED magnitudes (C11) -------------
    //  `operation.temperatureApproach <dT>;` is a GLOBAL magnitude; a
    //  reaction's own entry in constant/reactions may carry
    //  `temperatureApproach <dT>;`, which OVERRIDES the global one for that
    //  reaction alone (0 exempts it).  THE CASE DECLARES A MAGNITUDE; THE
    //  ENGINE ASSIGNS THE DIRECTION, per reaction, from that reaction's own
    //  thermicity as it runs (TemperatureApproach.H, the one home of the
    //  rule).  A negative value is not a sign to be judged but an invalid
    //  magnitude, refused by name.  Absent every key (or with every value
    //  0), nothing below runs and the solve is the one it always was.
    auto refuseNegative = [&](const std::string& where, scalar v)
    {
        std::ostringstream m;
        m << "equilibriumReactor: 'temperatureApproach' " << where
          << " must be a MAGNITUDE (>= 0 K); got " << v << ".  Declare the SIZE"
             " of the approach to equilibrium; the engine assigns its sign PER"
             " REACTION from that reaction's own thermochemistry -- Kp_j is"
             " evaluated at T + dT for a reaction that is exothermic as it runs"
             " and at T - dT for one that is endothermic as it runs -- and"
             " announces which it chose and why.  A real bed never crosses its"
             " own equilibrium curve, so the approach has no sign of its own to"
             " declare.";
        throw std::runtime_error(m.str());
    };
    const bool   dTglobalDeclared = operDict->found("temperatureApproach");
    const scalar dTglobal = dTglobalDeclared
                          ? operDict->lookupScalar("temperatureApproach") : 0.0;
    if (dTglobal < 0.0) refuseNegative("in operation{}", dTglobal);
    sVector           dTmag(R, dTglobal);
    std::vector<bool> dTonReaction(R, false);
    bool anyApproach = false;
    for (std::size_t j = 0; j < R; ++j)
    {
        if (rxnList[j]->found("temperatureApproach"))
        {
            dTmag[j] = rxnList[j]->lookupScalar("temperatureApproach");
            dTonReaction[j] = true;
            if (dTmag[j] < 0.0)
                refuseNegative("on reaction '" + rname[j] + "'", dTmag[j]);
        }
        if (dTmag[j] > 0.0) anyApproach = true;
    }

    // ---- The unknowns are ln n_i, not the extents (2026-09-27) -----------
    //  The equilibrium of a DECLARED reaction set is the point on the
    //  reaction subspace n = n0 + Sum_j nu_j xi_j where every declared
    //  residual g_j = ln Q_j - ln Kp_j vanishes.  Solving for the EXTENTS
    //  xi puts every amount behind a subtraction, n_i = n0_i - |nu_ij| xi_j,
    //  and a reaction that runs almost to completion leaves its limiting
    //  reactant as the difference of two nearly equal numbers: ammonia
    //  oxidation to NO at 1100 K (ln K 121.5) leaves NH3 near 1e-14 of the
    //  feed, which the old extent Newton could neither reach (it held every
    //  species above a 1e-12 floor) nor resolve (double precision carries
    //  16 digits of n0, not of what is left of it).  It stalled at residual
    //  17.86 and refused -- honest, but it was the formulation that failed,
    //  not the chemistry.
    //
    //  So the unknowns are x_i = ln n_i for every species a reaction touches
    //  (the LOGGED species), and the reaction subspace is written as what it
    //  is: the invariants of the declared set, W (n - n0) = 0, one row per
    //  vector w with nu w = 0 (for a COMPLETE set they are the element
    //  balances; for a subset there are more of them, one per closed
    //  pathway).  R equilibrium equations, L - R invariants, L unknowns:
    //    g_j = Sum_i nu_ij (x_i - ln n_tot + ln P/P0) - ln Kp_j  = 0
    //    h_k = Sum_i w_ki (exp(x_i) - n0_i) / F_in               = 0
    //  A species at 1e-30 of the feed is x = ln(1e-30 F), an ordinary number;
    //  no floor is held under any amount, and the equilibrium equation reads
    //  its logarithm directly.  The extents are RECOVERED afterwards by least
    //  squares on n - n0 (the KPIs, the duty and the approach probe read
    //  them).  Record: docs/design/an-equilibrium-that-runs-to-completion.md.
    auto molesAt = [&](const sVector& xi) -> sVector
    {
        sVector ni(n, 0.0);
        for (std::size_t i = 0; i < n; ++i)
        {
            scalar v = n0[i];
            for (std::size_t j = 0; j < R; ++j) v += nu[j][i] * xi[j];
            ni[i] = v;
        }
        return ni;
    };
    // A species is LOGGED (enters some ln y_i) iff any reaction touches it.
    std::vector<bool> logged(n, false);
    for (std::size_t j = 0; j < R; ++j)
        for (std::size_t i = 0; i < n; ++i)
            if (nu[j][i] != 0.0) logged[i] = true;
    std::vector<std::size_t> Lx;             // the logged species, in order
    scalar nInert = 0.0;                     // what no reaction touches
    for (std::size_t i = 0; i < n; ++i)
    {
        if (logged[i]) Lx.push_back(i);
        else           nInert += n0[i];
    }
    const std::size_t nL = Lx.size();
    std::vector<sVector> nuL(R, sVector(nL, 0.0));
    for (std::size_t j = 0; j < R; ++j)
        for (std::size_t a = 0; a < nL; ++a) nuL[j][a] = nu[j][Lx[a]];

    // ---- The declared set must be independent: checked on nu, up front --
    //  Rows are reduced IN DECLARED ORDER, so the reaction named is the first
    //  one the earlier ones already span -- a dependent set has no unique
    //  extent vector, and there is nothing to iterate on.  The reduced rows
    //  then give the invariants W (the null space of nu).
    std::vector<sVector>     E;              // reduced rows, pivot entry 1
    std::vector<std::size_t> pivCol;
    {
        scalar maxNu = 0.0;
        for (const auto& row : nuL) for (auto v : row) maxNu = std::max(maxNu, std::abs(v));
        for (std::size_t j = 0; j < R; ++j)
        {
            sVector r = nuL[j];
            for (std::size_t p = 0; p < E.size(); ++p)
            {
                const scalar f = r[pivCol[p]];
                if (f != 0.0) for (std::size_t a = 0; a < nL; ++a) r[a] -= f * E[p][a];
            }
            std::size_t c = nL;
            for (std::size_t a = 0; a < nL; ++a)
                if (std::abs(r[a]) > 1.0e-9 * std::max(maxNu, 1.0e-30)
                    && (c == nL || std::abs(r[a]) > std::abs(r[c]))) c = a;
            if (c == nL)
                throw std::runtime_error("equilibriumReactor: the reaction set is "
                    "LINEARLY DEPENDENT (reaction '" + rname[j] + "' is a combination "
                    "of the reactions declared before it) -- remove the redundant "
                    "reaction; a dependent set has no unique extent vector.");
            const scalar pv = r[c];
            for (auto& v : r) v /= pv;
            for (std::size_t p = 0; p < E.size(); ++p)          // keep E reduced
            {
                const scalar f = E[p][c];
                if (f != 0.0) for (std::size_t a = 0; a < nL; ++a) E[p][a] -= f * r[a];
            }
            E.push_back(r); pivCol.push_back(c);
        }
    }
    std::vector<sVector> W;                   // invariants, nu w = 0, max|w| = 1
    for (std::size_t f = 0; f < nL; ++f)
    {
        bool isPivot = false;
        for (auto c : pivCol) if (c == f) isPivot = true;
        if (isPivot) continue;
        sVector w(nL, 0.0);
        w[f] = 1.0;
        for (std::size_t p = 0; p < E.size(); ++p) w[pivCol[p]] = -E[p][f];
        scalar m = 0.0;
        for (auto v : w) m = std::max(m, std::abs(v));
        for (auto& v : w) v /= m;
        W.push_back(w);
    }
    const std::size_t nW = W.size();          // == nL - R
    const scalar Fs    = std::max(F_in, 1.0e-30);
    const scalar lnPP  = std::log(P / P_STD);
    sVector dnu(R, 0.0);
    for (std::size_t j = 0; j < R; ++j) for (auto v : nuL[j]) dnu[j] += v;

    //  Residual at x = ln n (logged species): g (ln units) then h (/F_in).
    struct State { sVector nLv; scalar ntot = 0.0; sVector F; bool finite = true; };
    auto evalAt = [&](const sVector& x) -> State
    {
        State s;
        s.nLv.assign(nL, 0.0);
        s.ntot = nInert;
        for (std::size_t a = 0; a < nL; ++a) { s.nLv[a] = std::exp(x[a]); s.ntot += s.nLv[a]; }
        s.F.assign(R + nW, 0.0);
        if (!(std::isfinite(s.ntot) && s.ntot > 0.0)) { s.finite = false; return s; }
        const scalar lnt = std::log(s.ntot);
        for (std::size_t j = 0; j < R; ++j)
        {
            scalar q = 0.0;
            for (std::size_t a = 0; a < nL; ++a)
                if (nuL[j][a] != 0.0) q += nuL[j][a] * (x[a] - lnt + lnPP);
            s.F[j] = q - lnKp[j];
        }
        for (std::size_t k = 0; k < nW; ++k)
        {
            scalar h = 0.0;
            for (std::size_t a = 0; a < nL; ++a) h += W[k][a] * (s.nLv[a] - n0[Lx[a]]);
            s.F[R + k] = h / Fs;
        }
        for (auto v : s.F) if (!std::isfinite(v)) s.finite = false;
        return s;
    };
    auto normInf = [](const sVector& v, std::size_t b, std::size_t e)
    {
        scalar m = 0.0;
        for (std::size_t k = b; k < e; ++k) m = std::max(m, std::abs(v[k]));
        return m;
    };

    // ---- The solve: an interior SEED, then Newton on x = ln n -------------
    //  A lambda because a declared approach solves TWICE: once at the
    //  physical T (the probe that tells each reaction which way it runs from
    //  this feed) and once on the shifted Kp.  Absent an approach it is
    //  called once.
    struct Solved { sVector xi; sVector niCur; scalar gNorm = 0.0; int iters = 0;
                    sVector lnN; };   // ln n of the logged species (0 elsewhere)
    auto solveExtents = [&]() -> Solved
    {
        // ---- The seed: every logged species needs a first logarithm ---------
        //  Forward AND backward limits per reaction (a feed missing a REACTANT is
        //  legitimate -- the reaction runs BACKWARD, xi_j < 0), 5 % of each, then
        //  a repair loop gives any still-empty species a 1e-6-of-feed foothold
        //  along a reaction that produces it.  `seedFoothold` is the level a
        //  SEED must clear to have a logarithm at all; it is a starting point,
        //  never a bound: the Newton below works in ln n and goes wherever the
        //  equilibrium is, far below it if that is where the answer lies.
        const scalar seedFoothold = 1.0e-12 * Fs;
        sVector xiMaxBack(R, 0.0);
        for (std::size_t j = 0; j < R; ++j)
        {
            scalar m = std::numeric_limits<scalar>::infinity();
            for (std::size_t i = 0; i < n; ++i)
                if (nu[j][i] > 0.0 && n0[i] > 0.0) m = std::min(m, n0[i] / nu[j][i]);
            xiMaxBack[j] = std::isfinite(m) ? m : 0.0;
        }
        sVector xiSeed(R, 0.0);
        for (std::size_t j = 0; j < R; ++j)
            xiSeed[j] = 0.05 * xiMax[j] - 0.05 * xiMaxBack[j];
        for (int pass = 0; pass < 32; ++pass)
        {
            const sVector ni = molesAt(xiSeed);
            bool interior = true;
            for (std::size_t i = 0; i < n; ++i)
                if (logged[i] && ni[i] <= seedFoothold) interior = false;
            if (interior) break;
            bool repaired = false;
            for (std::size_t i = 0; i < n && !repaired; ++i)
            {
                if (!logged[i] || ni[i] > seedFoothold) continue;
                for (std::size_t j = 0; j < R; ++j)
                    if (nu[j][i] != 0.0)
                    {
                        xiSeed[j] += (1.0e-6 * F_in + seedFoothold - ni[i]) / nu[j][i];
                        repaired = true;
                        break;
                    }
            }
            if (!repaired || pass == 31)
                throw std::runtime_error("equilibriumReactor: cannot construct an "
                    "interior starting point -- some participating species has zero "
                    "inventory and no reaction path can give it a foothold from this "
                    "feed.  Check the feed composition against the reaction set.");
        }
        sVector x(nL, 0.0);
        { const sVector ns = molesAt(xiSeed);
          for (std::size_t a = 0; a < nL; ++a) x[a] = std::log(ns[Lx[a]]); }

        // ---- Newton on ln n, analytic Jacobian, backtracking on ||F||^2 ------
        //  Converged when every declared ln Q_j is within 1e-10 of ln Kp_j AND
        //  every invariant closes to 1e-12 of the feed.  A step that overflows
        //  exp or does not decrease the merit is halved; forty halvings
        //  without a decrease is a genuine failure and THROWS (a warning that
        //  returns success let an infeasible network turn the corpus green,
        //  #87-P0).
        constexpr scalar tolG  = 1.0e-10;
        constexpr scalar tolH  = 1.0e-12;
        constexpr int    maxIt = 200;
        State  s = evalAt(x);
        if (!s.finite)
            throw std::runtime_error("equilibriumReactor: the seed gives a "
                "non-finite residual -- check the feed against the reaction set.");
        auto conv = [&](const State& st)
        { return normInf(st.F, 0, R) < tolG && normInf(st.F, R, R + nW) < tolH; };
        auto merit = [](const State& st)
        { scalar m = 0.0; for (auto v : st.F) m += v * v; return m; };
        int  iters = 0;
        bool converged = conv(s);
        for (int it = 0; it < maxIt && !converged; ++it, ++iters)
        {
            //  J: rows g_j then h_k, one column per logged species.
            std::vector<sVector> A(nL, sVector(nL, 0.0));
            for (std::size_t j = 0; j < R; ++j)
                for (std::size_t a = 0; a < nL; ++a)
                    A[j][a] = nuL[j][a] - dnu[j] * s.nLv[a] / s.ntot;
            for (std::size_t k = 0; k < nW; ++k)
                for (std::size_t a = 0; a < nL; ++a)
                    A[R + k][a] = W[k][a] * s.nLv[a] / Fs;
            sVector rhs(nL);
            for (std::size_t r = 0; r < nL; ++r) rhs[r] = -s.F[r];
            //  Gauss with partial pivoting; per-row scaled pivot test, because
            //  an h row carries n_i/F and a trace species makes its entries
            //  small without making the system singular.
            for (std::size_t k = 0; k < nL; ++k)
            {
                std::size_t piv = k;
                for (std::size_t r2 = k + 1; r2 < nL; ++r2)
                    if (std::abs(A[r2][k]) > std::abs(A[piv][k])) piv = r2;
                if (!(std::abs(A[piv][k]) > 0.0) || !std::isfinite(A[piv][k]))
                    throw std::runtime_error("equilibriumReactor: singular Jacobian "
                        "on ln n at iteration " + std::to_string(it) + " -- the "
                        "declared set and the feed leave a direction undetermined.");
                std::swap(A[piv], A[k]); std::swap(rhs[piv], rhs[k]);
                for (std::size_t r2 = k + 1; r2 < nL; ++r2)
                {
                    const scalar f = A[r2][k] / A[k][k];
                    if (f == 0.0) continue;
                    for (std::size_t c = k; c < nL; ++c) A[r2][c] -= f * A[k][c];
                    rhs[r2] -= f * rhs[k];
                }
            }
            sVector dx(nL, 0.0);
            for (std::size_t k = nL; k-- > 0;)
            {
                scalar v = rhs[k];
                for (std::size_t c = k + 1; c < nL; ++c) v -= A[k][c] * dx[c];
                dx[k] = v / A[k][k];
            }
            //  Step control on ln n, adapted from the control factor of
            //  Gordon & McBride's CEA (NASA RP-1311, 1994; CEA also caps by
            //  the change of ln n_total, omitted here): a SIGNIFICANT species (y > 1e-8)
            //  moves by at most a factor e^2 per iteration, in either
            //  direction; a TRACE species that rises may not rise past
            //  y = 1e-4 in one step; a trace species that falls is not held
            //  at all -- that is the whole point of solving in ln n.  The
            //  linear model of exp is only good near the iterate, and
            //  without this a strongly favoured reaction overshoots its
            //  products by orders of magnitude on the first step.  It
            //  shortens steps; it never bounds where the solution may lie.
            const scalar m0 = merit(s);
            scalar dlnt = 0.0;
            for (std::size_t a = 0; a < nL; ++a) dlnt += s.nLv[a] * dx[a];
            dlnt /= s.ntot;
            scalar lam = 1.0;
            for (std::size_t a = 0; a < nL; ++a)
            {
                const scalar y = s.nLv[a] / s.ntot;
                if (y > 1.0e-8)
                {
                    if (std::abs(dx[a]) > 0.0) lam = std::min(lam, 2.0 / std::abs(dx[a]));
                }
                else if (dx[a] - dlnt > 0.0)
                    lam = std::min(lam, std::abs((-std::log(y) - std::log(1.0e4))
                                                 / (dx[a] - dlnt)));
            }
            bool stepped = false;
            for (int bt = 0; bt < 40; ++bt, lam *= 0.5)
            {
                sVector xt = x;
                for (std::size_t a = 0; a < nL; ++a) xt[a] += lam * dx[a];
                const State st = evalAt(xt);
                if (!st.finite) continue;
                if (merit(st) <= (1.0 - 1.0e-4 * lam) * m0 || conv(st))
                {
                    x = xt; s = st; stepped = true;
                    break;
                }
            }
            if (!stepped)
                throw std::runtime_error("equilibriumReactor: Newton on ln n stalled "
                    "at residual " + std::to_string(std::max(normInf(s.F, 0, R),
                    normInf(s.F, R, R + nW))) + " (no descent step) -- the reaction "
                    "set may be infeasible at this T, P, feed.");
            converged = conv(s);
        }
        if (!converged)
            throw std::runtime_error("equilibriumReactor: did NOT converge in "
                + std::to_string(maxIt) + " iterations (residual "
                + std::to_string(std::max(normInf(s.F, 0, R), normInf(s.F, R, R + nW)))
                + ") -- refusing to publish a non-equilibrium state as a solution.  "
                "Check the reaction set against the feed at this T and P.");

        // ---- The outlet, and the extents recovered from it ------------------
        //  n_i = exp(x_i) for the logged species (a trace species is published
        //  at its own value, not as a difference), n0_i for the inert ones.
        //  The extents solve (nu D nu^T) xi = nu D (n - n0): n - n0 lies in the
        //  span of nu to the invariant tolerance, so any weighting returns the
        //  same extents up to round-off, and D = 1/(n + n0) picks WHICH
        //  round-off -- each species' change is weighted by its own size, so
        //  a trace product (methanol at 1e-10 in the complete set) sets its
        //  reaction's extent to its own sixteen digits instead of inheriting
        //  the absolute noise of the major species.
        sVector niCur = n0;
        for (std::size_t a = 0; a < nL; ++a) niCur[Lx[a]] = s.nLv[a];
        sVector D(nL, 0.0);
        for (std::size_t a = 0; a < nL; ++a)
            D[a] = 1.0 / std::max(s.nLv[a] + n0[Lx[a]], 1.0e-300);
        std::vector<sVector> M(R, sVector(R, 0.0));
        sVector b(R, 0.0);
        for (std::size_t j = 0; j < R; ++j)
        {
            for (std::size_t a = 0; a < nL; ++a)
                b[j] += nuL[j][a] * D[a] * (s.nLv[a] - n0[Lx[a]]);
            for (std::size_t l = 0; l < R; ++l)
                for (std::size_t a = 0; a < nL; ++a)
                    M[j][l] += nuL[j][a] * D[a] * nuL[l][a];
        }
        for (std::size_t k = 0; k < R; ++k)                    // M is SPD
        {
            std::size_t piv = k;
            for (std::size_t r2 = k + 1; r2 < R; ++r2)
                if (std::abs(M[r2][k]) > std::abs(M[piv][k])) piv = r2;
            std::swap(M[piv], M[k]); std::swap(b[piv], b[k]);
            for (std::size_t r2 = k + 1; r2 < R; ++r2)
            {
                const scalar f = M[r2][k] / M[k][k];
                for (std::size_t c = k; c < R; ++c) M[r2][c] -= f * M[k][c];
                b[r2] -= f * b[k];
            }
        }
        sVector xi(R, 0.0);
        for (std::size_t k = R; k-- > 0;)
        {
            scalar v = b[k];
            for (std::size_t c = k + 1; c < R; ++c) v -= M[k][c] * xi[c];
            xi[k] = v / M[k][k];
        }
        const scalar gN = std::max(normInf(s.F, 0, R), normInf(s.F, R, R + nW));
        sVector lnN(n, 0.0);
        for (std::size_t a = 0; a < nL; ++a) lnN[Lx[a]] = x[a];
        return Solved{ xi, niCur, gN, iters, lnN };
    };
    Solved sol = solveExtents();

    // ---- The direction of each reaction's approach, assigned HERE --------
    //  Read from the probe above: the extent a reaction reaches at the
    //  physical T says which way it RUNS from this feed, and the sign of
    //  (extent x dH_rxn as written) is its thermicity as it runs -- the same
    //  question `GibbsReactor::approachDirection` asks of the overall
    //  transformation, asked here of each declared reaction.  dH_rxn is on
    //  the ideal-gas rung, the SAME rung Kp_j is priced on, so by van 't Hoff
    //  its sign is exactly the sign of d ln Kp_j / dT: the shift always moves
    //  Kp_j against the direction the reaction runs.  The reactor stays
    //  ISOTHERMAL at T; only Kp_j moves.
    sVector T_Kp(R, T);
    if (anyApproach)
    {
        //  The unit's name reaches the advisory through the Flowsheet's frame
        //  (`where`); the locus names it too only when the dict carries it.
        const std::string locus = dict->found("name")
            ? "equilibriumReactor " + dict->lookupWord("name") : "equilibriumReactor";
        const scalar tinyXi = 1.0e-12 * std::max(F_in, 1.0e-30);
        //  Composed in its own stream: std::cout carries whatever format the
        //  unit before this one left on it (a Gibbs table leaves scientific).
        {
            std::ostringstream h;
            h << std::setprecision(6)
              << "  [equilibriumReactor] temperatureApproach: each declared"
                 " reaction's Kp is evaluated at a SHIFTED temperature; the"
                 " reactor stays isothermal at T = " << T << " K (outlet"
                 " state and duty at the physical T).  EMPIRICAL (calibrated,"
                 " never predicted); 0 = true equilibrium.\n";
            std::cout << h.str();
        }
        for (std::size_t j = 0; j < R; ++j)
        {
            if (!(dTmag[j] > 0.0))
            {
                //  Said, not skipped: beside shifted neighbours, an unshifted
                //  reaction is a choice the reader must be able to see.
                std::ostringstream z;
                z << std::setprecision(6)
                  << "          reaction '" << rname[j] << "': no approach ("
                  << (dTonReaction[j] ? "temperatureApproach 0 declared on the reaction"
                                      : "no global value, none on the reaction")
                  << ") -- Kp at the physical T = " << T << " K.\n";
                std::cout << z.str();
                continue;
            }
            const scalar xi0  = sol.xi[j];
            const bool   runs = std::abs(xi0) > tinyXi;
            const temperatureApproach::ApproachSign sgn = temperatureApproach::fromThermicity(
                (xi0 >= 0.0 ? 1.0 : -1.0) * dHrxn[j], dHok[j] && runs);
            T_Kp[j] = T + sgn.sign * dTmag[j];
            if (!(T_Kp[j] > 0.0))
            {
                std::ostringstream m;
                m << "equilibriumReactor: 'temperatureApproach' " << dTmag[j]
                  << " K on reaction '" << rname[j] << "' would evaluate Kp at "
                  << T_Kp[j] << " K, which is not a temperature.  The approach"
                     " must be smaller than the physical T = " << T << " K.";
                throw std::runtime_error(m.str());
            }
            const scalar Kp0 = Kp[j];
            const auto eqShift = Reaction::equilibrium(thermo, nu[j], T_Kp[j]);
            Kp[j]   = eqShift.Kp;
            lnKp[j] = eqShift.lnKp;

            std::ostringstream m;
            m << std::setprecision(6);
            m << "temperatureApproach " << dTmag[j] << " K on reaction '"
              << rname[j] << "' ("
              << (dTonReaction[j] ? "declared on the reaction" : "the unit's global value")
              << ") is a MAGNITUDE; the engine assigned its direction: ";
            if (sgn.determined)
            {
                m << "at the physical T = " << T << " K the reaction runs "
                  << (xi0 > 0.0 ? "FORWARD" : "BACKWARD")
                  << " from this feed (extent " << (xi0 * 3600.0)
                  << " kmol/h) and dH_rxn = " << (dHrxn[j] / 1000.0)
                  << " kJ/mol as written (ideal-gas rung, the rung Kp is priced"
                     " on), so it is " << (sgn.sign > 0 ? "EXOTHERMIC" : "ENDOTHERMIC")
                  << " as it runs and Kp is evaluated at T "
                  << (sgn.sign > 0 ? "+ " : "- ") << dTmag[j] << " K = "
                  << T_Kp[j] << " K (Kp " << Kp0 << " -> " << Kp[j] << ").";
            }
            else
            {
                m << "thermally UNDETERMINED ("
                  << (!dHok[j] ? "dH_rxn cannot be priced: a species lacks ideal-gas Cp data"
                      : !runs ? "the reaction does not run from this feed at the physical T"
                      : "dH_rxn = 0 exactly")
                  << "), so the direction takes the DEFAULT, T + " << dTmag[j]
                  << " K = " << T_Kp[j] << " K (Kp " << Kp0 << " -> " << Kp[j]
                  << "), and says so.";
            }
            m << "  Read per reaction, not jointly: in a COUPLED set a shift on"
                 " one reaction moves the extents of the others too.";
            std::cout << "          " << m.str() << "\n";
            AdvisoryLog::instance().add("model", sgn.determined ? "info" : "warning",
                                        locus, m.str());
        }
        sol = solveExtents();
    }
    const sVector& xi    = sol.xi;
    const scalar   gNorm = sol.gNorm;
    const int      iters = sol.iters;

    // ---- Outlet moles + composition -------------------------------------
    //  The solved amounts THEMSELVES: exp(ln n) for every logged species, the
    //  feed for the inert ones -- nothing is clamped or snapped, and nothing
    //  is recomputed as a difference.  ONE representation limit remains and
    //  it is said when it binds: a ln n below about -745 has no double, so
    //  that species leaves as exactly 0 and its logarithm is announced.
    sVector nOut = sol.niCur; scalar F_out = 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        F_out += nOut[i];
        if (logged[i] && !(nOut[i] > 0.0))
        {
            std::ostringstream m;
            m << std::setprecision(6) << "species '" << thermo.comp(i).name()
              << "' is at ln n = " << sol.lnN[i] << " (n in kmol/s) at"
                 " equilibrium: below the smallest double, so it is published"
                 " as exactly 0.  The equilibrium itself was solved on ln n and"
                 " is not affected; the stream table cannot carry the number.";
            std::cout << "  [equilibriumReactor] " << m.str() << "\n";
            AdvisoryLog::instance().add("model", "info",
                dict->found("name") ? "equilibriumReactor " + dict->lookupWord("name")
                                    : "equilibriumReactor", m.str());
        }
    }
    sVector zout(n, 0.0);
    if (F_out > 0.0) for (std::size_t i = 0; i < n; ++i) zout[i] = nOut[i] / F_out;

    // ---- Isothermal duty: Σ_j xi_j dHrxn_j (elements datum) -------------
    scalar Q_W = 0.0;
    for (std::size_t j = 0; j < R; ++j) Q_W += xi[j] * 1000.0 * dHrxn[j];

    // ---- Outlet stream (gas-phase effluent; a downstream flash re-splits) --
    produced_.clear();
    ProcessStream out;
    out.name = "out"; out.F = F_out; out.T = T; out.P = P; out.z = zout; out.vf = 1.0;
    produced_.push_back(out);

    // ---- KPIs -----------------------------------------------------------
    kpis_["F_in_kmol_h"]    = F_in  * 3600.0;
    kpis_["F_out_kmol_h"]   = F_out * 3600.0;
    kpis_["T"]              = T;
    kpis_["nReactions"]     = static_cast<scalar>(R);
    kpis_["newtonResidual"]   = gNorm;
    kpis_["newtonIterations"] = static_cast<scalar>(iters);
    for (std::size_t j = 0; j < R; ++j)
    {
        kpis_["extent_" + rname[j] + "_kmol_h"] = xi[j] * 3600.0;
        //  Kp itself only where a double can carry it: the solve reads ln Kp,
        //  so a reaction with |ln Kp| beyond ~709 is solved all the same,
        //  and the KPI is withheld and SAID rather than published as inf/0.
        if (std::isfinite(Kp[j]) && Kp[j] > 0.0)
            kpis_["Kp_" + rname[j]] = Kp[j];
        else
        {
            std::ostringstream m;
            m << std::setprecision(6) << "reaction '" << rname[j] << "': ln Kp = "
              << lnKp[j] << " at " << T_Kp[j] << " K, beyond what a double"
                 " carries as Kp; the equilibrium was solved on ln Kp, and the"
                 " KPI Kp_" << rname[j] << " is not published.";
            std::cout << "  [equilibriumReactor] " << m.str() << "\n";
            AdvisoryLog::instance().add("model", "info",
                dict->found("name") ? "equilibriumReactor " + dict->lookupWord("name")
                                    : "equilibriumReactor", m.str());
        }
        if (xiMax[j] > 0.0)
            kpis_["conversion_" + rname[j]] = xi[j] / xiMax[j];
    }
    if (haveDuty) kpis_["Q_kW"] = Q_W / 1000.0;
    //  The approach, published only when one is ACTIVE (absent every key the
    //  KPI set is the one it always was).  `temperatureApproach_K` is the
    //  unit's declared GLOBAL magnitude, published only when one was declared
    //  -- unsigned, because here the sign is per reaction (gibbsReactor's KPI
    //  of the same name is SIGNED: one transformation, one sign).  The
    //  temperature each Kp was actually evaluated at is `T_Kp_<name>`, for
    //  every reaction including an exempt one, and T_Kp - T is that
    //  reaction's signed shift.
    if (anyApproach)
    {
        if (dTglobalDeclared) kpis_["temperatureApproach_K"] = dTglobal;
        for (std::size_t j = 0; j < R; ++j)
            kpis_["T_Kp_" + rname[j]] = T_Kp[j];
    }

    if (verbosity >= 2)
    {
        //  The format is SET here, not inherited: a unit printed before this
        //  one (a Gibbs table) leaves std::cout in scientific notation, and
        //  the temperature then read "5.2500e+02 K".  Fixed/4 is what every
        //  corpus case already printed, so none of their outputs moves.
        std::cout << std::fixed << std::setprecision(4)
                  << "EquilibriumReactor:  " << R << " reaction(s) to SIMULTANEOUS "
                  << "equilibrium at " << T << " K, " << (P / 1.0e5) << " bar  (Newton "
                  << iters << " it, residual " << std::scientific
                  << std::setprecision(2) << gNorm << ")\n" << std::fixed;
        for (std::size_t j = 0; j < R; ++j)
        {
            std::cout << "  " << std::setw(10) << std::left << rname[j]
                      << "  Kp = " << std::setprecision(4) << std::scientific << Kp[j]
                      << std::fixed << "   extent = " << std::setprecision(4)
                      << (xi[j] * 3600.0) << " kmol/h";
            if (anyApproach)   // only then does the evaluation T differ from T
                std::cout << "   (Kp at " << std::setprecision(2) << T_Kp[j] << " K)";
            std::cout << "\n";
        }
        if (haveDuty)
            std::cout << "  duty Q = " << std::setprecision(2) << (Q_W / 1000.0) << " kW"
                      << (Q_W < 0 ? "  (net exothermic; removed)\n\n"
                                  : "  (net endothermic; added)\n\n");
        else std::cout << "  (duty not reported -- a species lacks ideal-gas Cp data)\n\n";
    }
    return 0;
}

} // namespace Choupo
