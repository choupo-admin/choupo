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
#include "thermo/reaction/Reaction.H"
#include "core/Dimensions.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <limits>
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
    bool haveDuty = true;
    for (std::size_t j = 0; j < R; ++j)
    {
        rname[j] = rxnList[j]->lookupWordOrDefault("name", "rxn" + std::to_string(j + 1));
        for (const auto& s : rxnList[j]->lookupDictList("stoichiometry"))
            nu[j][thermo.indexOf(s->lookupWord("component"))] = s->lookupScalar("nu");

        const auto eq = Reaction::equilibrium(thermo, nu[j], T);         // Kp from dG°(T)
        Kp[j]   = eq.Kp;
        lnKp[j] = std::log(std::max(1.0e-300, eq.Kp));

        // Forward limit (a reactant runs out) -- sets the start + the KPI conversion.
        scalar m = std::numeric_limits<scalar>::infinity();
        for (std::size_t i = 0; i < n; ++i)
            if (nu[j][i] < 0.0 && n0[i] > 0.0) m = std::min(m, n0[i] / (-nu[j][i]));
        xiMax[j] = std::isfinite(m) ? m : 0.0;

        try { for (std::size_t i = 0; i < n; ++i)
                  if (nu[j][i] != 0.0) dHrxn[j] += nu[j][i] * thermo.comp(i).h_pure_ig(T); }
        catch (const std::exception&) { haveDuty = false; }
    }

    // ---- Equilibrium residual: g_j(xi) = ln Q_j - ln Kp_j ---------------
    //   n_i(xi) = n_i0 + Sum_j nu_ij xi_j EXACTLY -- no floors: flooring a
    //   negative inventory silently changes the equation being solved
    //   (design forum #87-P0).  The residual is only ever EVALUATED at
    //   interior points; feasibility n(xi) >= 0 is enforced by the Newton's
    //   fraction-to-boundary step limit below, never by clamping.
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
    const scalar interiorEps = 1.0e-12 * std::max(F_in, 1.0e-30);
    auto isInterior = [&](const sVector& ni) -> bool
    {
        for (std::size_t i = 0; i < n; ++i)
            if (logged[i] && ni[i] <= interiorEps) return false;
        return true;
    };
    auto residualAt = [&](const sVector& ni) -> sVector
    {
        scalar ntot = 0.0;
        for (auto v : ni) ntot += v;
        sVector g(R, 0.0);
        for (std::size_t j = 0; j < R; ++j)
        {
            scalar q = 0.0;
            for (std::size_t i = 0; i < n; ++i)
                if (nu[j][i] != 0.0) q += nu[j][i] * std::log(ni[i] / ntot * P / P_STD);
            g[j] = q - lnKp[j];
        }
        return g;
    };
    auto normInf = [](const sVector& v) { scalar m = 0.0;
        for (auto x : v) m = std::max(m, std::abs(x)); return m; };

    // ---- Interior start: every logged species needs a foothold ----------
    //  Forward AND backward limits per reaction (a feed missing a REACTANT is
    //  legitimate -- the reaction runs BACKWARD, xi_j < 0; the old 10 %-forward
    //  start put such a species at n = 0 and the floored log solved a
    //  different problem).  Then a repair loop nudges any still-empty species
    //  along a reaction that produces it.
    sVector xiMaxBack(R, 0.0);
    for (std::size_t j = 0; j < R; ++j)
    {
        scalar m = std::numeric_limits<scalar>::infinity();
        for (std::size_t i = 0; i < n; ++i)
            if (nu[j][i] > 0.0 && n0[i] > 0.0) m = std::min(m, n0[i] / nu[j][i]);
        xiMaxBack[j] = std::isfinite(m) ? m : 0.0;
    }
    sVector xi(R, 0.0);
    for (std::size_t j = 0; j < R; ++j)
        xi[j] = 0.05 * xiMax[j] - 0.05 * xiMaxBack[j];
    for (int pass = 0; pass < 32; ++pass)
    {
        const sVector ni = molesAt(xi);
        if (isInterior(ni)) break;
        bool repaired = false;
        for (std::size_t i = 0; i < n && !repaired; ++i)
        {
            if (!logged[i] || ni[i] > interiorEps) continue;
            for (std::size_t j = 0; j < R; ++j)
                if (nu[j][i] != 0.0)
                {
                    // Move reaction j in the direction that CREATES species i,
                    // by enough to give it a 1e-6-of-feed foothold.
                    xi[j] += (1.0e-6 * F_in + interiorEps - ni[i]) / nu[j][i];
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

    // ---- Damped Newton with EXACT linear feasibility ---------------------
    //  n(xi) is linear in xi, so the largest feasible step along dxi has a
    //  closed form; the fraction-to-boundary rule (tau = 0.99) keeps every
    //  iterate strictly interior -- the residual is never evaluated at a
    //  clamped point, and the solved equation is the real one.  A singular
    //  Jacobian pivot names the LINEARLY DEPENDENT reaction set instead of
    //  producing garbage; non-convergence THROWS (a warning that returns
    //  success let an infeasible network turn the corpus green, #87-P0).
    constexpr scalar tolG   = 1.0e-10;
    constexpr int    maxIt  = 200;
    sVector niCur = molesAt(xi);
    sVector g     = residualAt(niCur);
    scalar  gNorm = normInf(g);
    int     iters = 0;
    bool    converged = (gNorm < tolG);
    for (int it = 0; it < maxIt && !converged; ++it, ++iters)
    {
        // FD Jacobian, evaluated at interior points only (step direction is
        // flipped toward the interior when the forward probe would leave it).
        std::vector<sVector> J(R, sVector(R, 0.0));
        for (std::size_t j = 0; j < R; ++j)
        {
            scalar h = 1.0e-7 * std::max(std::abs(xi[j]), 1.0e-3 * F_in);
            sVector xp = xi; xp[j] += h;
            if (!isInterior(molesAt(xp))) { h = -h; xp[j] = xi[j] + h; }
            if (!isInterior(molesAt(xp)))
                throw std::runtime_error("equilibriumReactor: reaction '"
                    + rname[j] + "' cannot move in EITHER direction from the "
                    "current iterate -- the feasible region is degenerate "
                    "(check the reaction set against the feed).");
            const sVector gp = residualAt(molesAt(xp));
            for (std::size_t r2 = 0; r2 < R; ++r2) J[r2][j] = (gp[r2] - g[r2]) / h;
        }
        // Gauss elimination WITH a pivot check: a vanishing pivot means the
        // reaction set is linearly dependent (two rows of nu span the same
        // direction) -- name it, never divide by it.
        std::vector<sVector> A = J;
        sVector rhs(R);
        for (std::size_t r2 = 0; r2 < R; ++r2) rhs[r2] = -g[r2];
        scalar maxA = 0.0;
        for (const auto& row : A) for (auto v : row) maxA = std::max(maxA, std::abs(v));
        for (std::size_t k = 0; k < R; ++k)
        {
            std::size_t piv = k;
            for (std::size_t r2 = k + 1; r2 < R; ++r2)
                if (std::abs(A[r2][k]) > std::abs(A[piv][k])) piv = r2;
            if (std::abs(A[piv][k]) < 1.0e-12 * std::max(maxA, 1.0e-30))
                throw std::runtime_error("equilibriumReactor: the reaction set is "
                    "LINEARLY DEPENDENT (singular Jacobian pivot at reaction '"
                    + rname[k] + "') -- remove the redundant reaction; a dependent "
                    "set has no unique extent vector.");
            std::swap(A[piv], A[k]); std::swap(rhs[piv], rhs[k]);
            for (std::size_t r2 = k + 1; r2 < R; ++r2)
            {
                const scalar f = A[r2][k] / A[k][k];
                for (std::size_t c = k; c < R; ++c) A[r2][c] -= f * A[k][c];
                rhs[r2] -= f * rhs[k];
            }
        }
        sVector dxi(R, 0.0);
        for (std::size_t k = R; k-- > 0;)
        {
            scalar s = rhs[k];
            for (std::size_t c = k + 1; c < R; ++c) s -= A[k][c] * dxi[c];
            dxi[k] = s / A[k][k];
        }
        // Fraction-to-boundary: n(xi + a*dxi) = n(xi) + a*(Nu dxi) is linear,
        // so the exact feasible ceiling is a closed form over the decreasing
        // species; tau = 0.99 keeps the iterate strictly interior.
        scalar aMax = 1.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            if (!logged[i]) continue;
            scalar dn = 0.0;
            for (std::size_t j = 0; j < R; ++j) dn += nu[j][i] * dxi[j];
            if (dn < 0.0) aMax = std::min(aMax, 0.99 * (niCur[i] - interiorEps) / (-dn));
        }
        // Backtracking on ||g||: accept the first step that DECREASES the
        // residual; twelve halvings without decrease = a genuine failure.
        scalar a = std::max(std::min(1.0, aMax), 0.0);
        bool stepped = false;
        for (int bt = 0; bt < 12 && a > 0.0; ++bt, a *= 0.5)
        {
            sVector xt = xi;
            for (std::size_t j = 0; j < R; ++j) xt[j] += a * dxi[j];
            const sVector nt = molesAt(xt);
            if (!isInterior(nt)) continue;
            const sVector gt = residualAt(nt);
            const scalar  gn = normInf(gt);
            if (gn < gNorm || gn < tolG)
            {
                xi = xt; niCur = nt; g = gt; gNorm = gn; stepped = true;
                break;
            }
        }
        if (!stepped)
            throw std::runtime_error("equilibriumReactor: Newton stalled at "
                "residual " + std::to_string(gNorm) + " (no feasible descent "
                "step) -- the reaction set may be infeasible at this T, P, feed.");
        converged = (gNorm < tolG);
    }
    if (!converged)
        throw std::runtime_error("equilibriumReactor: did NOT converge in "
            + std::to_string(maxIt) + " iterations (residual "
            + std::to_string(gNorm) + ") -- refusing to publish a "
            "non-equilibrium state as a solution.  Check the reaction set "
            "against the feed at this T and P.");

    // ---- Outlet moles + composition -------------------------------------
    //  EXACT linear combination -- the interior Newton guarantees n >= 0, so
    //  there is nothing to clamp (a clamp here silently altered mass,
    //  #87-P0).  Only sub-round-off noise is snapped, and a genuine negative
    //  is a solver bug that must SURFACE, not be laundered.
    sVector nOut(n, 0.0); scalar F_out = 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        scalar v = n0[i];
        for (std::size_t j = 0; j < R; ++j) v += nu[j][i] * xi[j];
        if (v < -1.0e-9 * std::max(F_in, 1.0e-30))
            throw std::runtime_error("equilibriumReactor: internal error -- "
                "converged extents give negative moles of '"
                + thermo.comp(i).name() + "' (" + std::to_string(v)
                + " kmol/s); the feasibility guard failed.");
        nOut[i] = std::max(v, 0.0);            // sub-round-off snap only
        F_out  += nOut[i];
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
        kpis_["Kp_" + rname[j]]                 = Kp[j];
        if (xiMax[j] > 0.0)
            kpis_["conversion_" + rname[j]] = xi[j] / xiMax[j];
    }
    if (haveDuty) kpis_["Q_kW"] = Q_W / 1000.0;

    if (verbosity >= 2)
    {
        std::cout << "EquilibriumReactor:  " << R << " reaction(s) to SIMULTANEOUS "
                  << "equilibrium at " << T << " K, " << (P / 1.0e5) << " bar  (Newton "
                  << iters << " it, residual " << std::scientific
                  << std::setprecision(2) << gNorm << ")\n" << std::fixed;
        for (std::size_t j = 0; j < R; ++j)
            std::cout << "  " << std::setw(10) << std::left << rname[j]
                      << "  Kp = " << std::setprecision(4) << std::scientific << Kp[j]
                      << std::fixed << "   extent = " << std::setprecision(4)
                      << (xi[j] * 3600.0) << " kmol/h\n";
        if (haveDuty)
            std::cout << "  duty Q = " << std::setprecision(2) << (Q_W / 1000.0) << " kW"
                      << (Q_W < 0 ? "  (net exothermic; removed)\n\n"
                                  : "  (net endothermic; added)\n\n");
        else std::cout << "  (duty not reported -- a species lacks ideal-gas Cp data)\n\n";
    }
    return 0;
}

} // namespace Choupo
