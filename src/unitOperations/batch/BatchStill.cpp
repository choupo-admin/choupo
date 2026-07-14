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

#include "BatchStill.H"
#include "streams/Composition.H"
#include "solver/NewtonND.H"
#include "unitOperations/saturation/BubblePoint.H"

#include <algorithm>
#include <cmath>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace Choupo {

void BatchStill::initialise(const DictPtr&       unitDict,
                            const ThermoPackage& thermo,
                            const DictPtr&       /*reactionsDict*/)
{
    thermo_ = &thermo;
    const std::size_t n = thermo.n();

    auto initDict = unitDict->subDict("initial");
    state_.T = initDict->lookupScalar("T");
    state_.P = initDict->lookupScalar("P");
    state_.V = initDict->lookupScalarOrDefault("V", 0.0);
    const scalar nTot = initDict->lookupScalar("totalMoles");

    state_.n.assign(n, 0.0);
    if (nTot > 0.0)
    {
        const sVector x = readComposition(initDict, thermo,
            "BatchStill '" + name_ + "' init");
        for (std::size_t i = 0; i < n; ++i) state_.n[i] = nTot * x[i];
    }
    // else: vessel starts empty --- the recipe layer will charge it
    // later via chargeFrom().  Skip the composition block entirely so
    // case files for empty-receiver vessels do not need a dummy
    // composition.

    auto opDict = unitDict->subDict("operation");
    P_op_   = opDict->lookupScalar("P");
    F_vap_  = opDict->lookupScalarOrDefault("F_vap", 0.0);   // kmol/s
    if (F_vap_ < 0.0)
        throw std::runtime_error("BatchStill: F_vap must be ≥ 0 (got "
            + std::to_string(F_vap_) + " kmol/s).  Use 0 to model a"
            " still that is off until the recipe turns it on.");

    // Seed the warm bubble-T BEFORE any solve -- the rectifier block below
    // runs an initial cascade, and the member's zero default put the very
    // first Newton at a 0 K seed (forum #87-P1: used before initialised).
    T_warm_ = state_.T;

    // ---- model slot (top level, next to `type` -- house convention) ------
    model_ = unitDict->lookupWordOrDefault("model", "rayleigh");
    if (model_ != "rayleigh" && model_ != "rectifier")
        throw std::runtime_error("BatchStill '" + name_ + "': model must be"
            " `rayleigh` (default) or `rectifier` (got '" + model_ + "')");
    if (model_ == "rectifier")
    {
        policy_ = opDict->lookupWordOrDefault("refluxPolicy", "constantReflux");
        if (policy_ != "constantReflux" && policy_ != "constantComposition")
            throw std::runtime_error("BatchStill '" + name_ + "': refluxPolicy"
                " must be `constantReflux` or `constantComposition` (got '"
                + policy_ + "')");
        nStages_ = static_cast<int>(opDict->lookupScalarOrDefault("nStages", 0.0));
        if (nStages_ < 0)
            throw std::runtime_error("BatchStill '" + name_ + "': nStages must"
                " be >= 0 (ideal stages ABOVE the pot; total condenser excluded)");

        if (policy_ == "constantReflux")
        {
            // XOR both ways (forum #85): the other policy's fields refuse here.
            for (const char* k : { "lightKey", "x_D_target", "refluxMax",
                                   "onRefluxLimit" })
                if (opDict->found(k))
                    throw std::runtime_error("BatchStill '" + name_ + "': `"
                        + std::string(k) + "` is constantComposition vocabulary"
                        " -- this operation declares refluxPolicy constantReflux");
            refluxRatio_ = opDict->lookupScalarOrDefault("refluxRatio", -1.0);
            if (refluxRatio_ < 0.0)
                throw std::runtime_error("BatchStill '" + name_ + "': model"
                    " rectifier requires refluxRatio >= 0 (constantReflux policy)");
        }
        else   // constantComposition (forum #85-3/4)
        {
            if (opDict->found("refluxRatio"))
                throw std::runtime_error("BatchStill '" + name_ + "': "
                    "`refluxRatio` is constantReflux vocabulary -- "
                    "constantComposition SOLVES R(t) to hold the target");
            if (nStages_ == 0)
                throw std::runtime_error("BatchStill '" + name_ + "': "
                    "constantComposition needs nStages >= 1 -- with no stages"
                    " x_D = y_pot regardless of R, so there is nothing to hold");
            const std::string lk = opDict->lookupWord("lightKey");
            bool found = false;
            for (std::size_t i = 0; i < n; ++i)
                if (thermo.comp(i).name() == lk)
                { lightKeyIdx_ = i; found = true; break; }
            if (!found)
                throw std::runtime_error("BatchStill '" + name_ + "': lightKey"
                    " '" + lk + "' is not a package component");
            xDTarget_  = opDict->lookupScalar("x_D_target");
            refluxMax_ = opDict->lookupScalar("refluxMax");
            if (xDTarget_ <= 0.0 || xDTarget_ >= 1.0)
                throw std::runtime_error("BatchStill '" + name_ + "': "
                    "x_D_target must lie in (0, 1) (got "
                    + std::to_string(xDTarget_) + ")");
            if (refluxMax_ <= 0.0)
                throw std::runtime_error("BatchStill '" + name_ + "': "
                    "refluxMax must be > 0");
            // Explicit terminal behaviour (forum #85-4): the only value today,
            // declared anyway so hitting the ceiling is never implicit.
            const std::string onLim =
                opDict->lookupWordOrDefault("onRefluxLimit", "stopDistillation");
            if (onLim != "stopDistillation")
                throw std::runtime_error("BatchStill '" + name_ + "': "
                    "onRefluxLimit supports `stopDistillation` only (got '"
                    + onLim + "') -- a general recipe `stop` action is a"
                    " design-forum matter");
        }

        // Glass-box announce (forum #85-1): in this model F_vap is the
        // internal BOILUP V; the receiver only ever sees the product D.
        if (policy_ == "constantReflux")
        {
            const scalar D = F_vap_ / (refluxRatio_ + 1.0);
            std::cout << "[batchStill " << name_ << "] model rectifier: boilup V = "
                      << F_vap_ << " kmol/s, R = " << refluxRatio_
                      << "  =>  D = V/(R+1) = " << D << " kmol/s, L = R*D = "
                      << (refluxRatio_ * D) << " kmol/s, nStages = " << nStages_
                      << " (+ total condenser)\n";
        }
        else
            std::cout << "[batchStill " << name_ << "] model rectifier: boilup V = "
                      << F_vap_ << " kmol/s, policy constantComposition"
                      " -- R(t) solved each step to hold x_D["
                      << thermo.comp(lightKeyIdx_).name() << "] = " << xDTarget_
                      << " (refluxMax " << refluxMax_ << ", onRefluxLimit"
                      " stopDistillation), nStages = " << nStages_
                      << " (+ total condenser)\n";
        if (nStages_ > 0 && refluxRatio_ == 0.0)
            std::cout << "[batchStill " << name_ << "] NOTE: R = 0 sends no"
                " liquid down the column -- the " << nStages_ << " stage(s)"
                " carry nothing and x_D = y_pot (equivalent to rayleigh)\n";
        // Solve the cascade ONCE at the charged state: the student sees the
        // initial distillate, and the trajectory header (fixed at t = 0)
        // gets its xD_/R/D columns from the first write.
        scalar nTot0 = 0.0;
        for (auto v : state_.n) nTot0 += v;
        if (nTot0 > 1.0e-20)
        {
            sVector x(n);
            for (std::size_t i = 0; i < n; ++i) x[i] = state_.n[i] / nTot0;
            auto r0 = BubblePoint::compute(*thermo_, x, P_op_, T_warm_);
            if (!r0.converged)
                throw std::runtime_error("BatchStill '" + name_ + "': initial"
                    " bubble-T failed (T_seed = " + std::to_string(T_warm_) + " K)");
            T_warm_ = r0.T;
            if (policy_ == "constantComposition")
            {
                // Feasibility is checked at the CHARGED state: an infeasible
                // target refuses the case up front (distinct diagnostics),
                // never a campaign that silently starts at its own ceiling.
                if (!solveRefluxFor_(r0.y, r0.T))
                    throw std::runtime_error("BatchStill '" + name_ + "': "
                        "x_D_target " + std::to_string(xDTarget_)
                        + " is UNREACHABLE from the initial charge even at"
                        " refluxMax " + std::to_string(refluxMax_)
                        + " (x_D[LK](refluxMax) falls short -- an azeotrope or"
                        " too few stages caps the cascade).  Lower the target,"
                        " add stages, or raise refluxMax.");
                xD_ = solveColumn_(r0.y, r0.T, refluxRatio_);
            }
            else
                xD_ = (refluxRatio_ > 0.0 && nStages_ > 0)
                    ? solveColumn_(r0.y, r0.T, refluxRatio_) : r0.y;
            std::cout << "[batchStill " << name_ << "] initial distillate: x_D = (";
            for (std::size_t i = 0; i < n; ++i)
                std::cout << (i ? " " : "") << thermo.comp(i).name() << " "
                          << xD_[i];
            std::cout << ")  at T_pot = " << r0.T << " K\n";
        }
    }

    state_.P = P_op_;                                       // sync
}

// -----------------------------------------------------------------------
//  dn_i/dt = -F_vap · y_i*(T, x)
//
//  with x = n / Σn and (T, y*) from a bubble-T call on the current x.
//  If the pot is empty (Σn ≈ 0), all derivatives are zero --- nothing
//  left to vaporise.
// -----------------------------------------------------------------------
sVector BatchStill::derivatives_(const sVector& n_vec)
{
    const std::size_t n = n_vec.size();
    sVector dydt(n, 0.0);

    scalar nTot = 0.0;
    for (auto v : n_vec) nTot += std::max<scalar>(v, 0.0);
    if (nTot < 1.0e-20) return dydt;

    sVector x(n);
    for (std::size_t i = 0; i < n; ++i)
        x[i] = std::max<scalar>(n_vec[i], 0.0) / nTot;

    auto r = BubblePoint::compute(*thermo_, x, P_op_, T_warm_);
    if (!r.converged)
        throw std::runtime_error("BatchStill: bubble-T failed to converge"
            " (T_seed = " + std::to_string(T_warm_) + " K, |f| = "
            + std::to_string(r.residual) + ")");

    T_warm_ = r.T;  // update warm seed for the next call --- T changes
                    // smoothly with composition, so the previous answer
                    // is an excellent guess.

    // rayleigh: the pot vapour IS the product (D = F_vap, x_D = y*).
    // rectifier: the product is D = V/(R+1) of the CASCADE's distillate --
    // the pot loses D·x_D only; reflux returns the rest (forum #85-1).
    if (model_ == "rectifier")
    {
        if (refluxLimitReached_)
            return dydt;    // D = 0: the campaign idles to endTime (forum #85-4)
        const sVector xD = (refluxRatio_ > 0.0 && nStages_ > 0)
                         ? solveColumn_(r.y, r.T, refluxRatio_)
                         : r.y;                 // R=0 or no stages: x_D = y_pot
        const scalar D = F_vap_ / (refluxRatio_ + 1.0);
        for (std::size_t i = 0; i < n; ++i)
            dydt[i] = -D * xD[i];
        return dydt;
    }

    for (std::size_t i = 0; i < n; ++i)
        dydt[i] = -F_vap_ * r.y[i];

    return dydt;
}

// -----------------------------------------------------------------------
//  Quasi-steady rectifying cascade (forum #85-2): find the VECTOR x_D such
//  that, from the pot vapour y0 upward,
//      stage s liquid:   x_s = (V·y_{s-1} - D·x_D) / L      (section balance)
//      stage s vapour:   y_s = K(T_bub(x_s)) · x_s          (equilibrium)
//      total condenser:  x_D = y_N                          (closure)
//  Normalising by V:  D/V = 1/(R+1),  L/V = R/(R+1).  The balances are
//  satisfied EXACTLY by construction at every iterate (sum(x_s) = 1 follows
//  algebraically from sum(y)=sum(x_D)=1); the ONE declared residual is the
//  condenser closure max|y_N - x_D|.  Infeasible intermediates (a negative
//  stage composition) back the iterate off toward the last good point; a
//  cascade that cannot close in 200 sweeps throws with its residual.
// -----------------------------------------------------------------------
sVector BatchStill::solveColumn_(const sVector& y0, scalar T_pot, scalar R,
                                 bool* closed)
{
    if (closed) *closed = true;
    // R = 0 sends no liquid down the column: the stages carry nothing and
    // x_D = y0 exactly (also the feasibility grid's first sample -- the
    // section balance would otherwise divide by L = 0).
    if (R < 1.0e-12) return y0;

    const std::size_t nc = y0.size();
    const scalar Dv = 1.0 / (R + 1.0);                 // D/V
    const scalar Lv = R / (R + 1.0);                   // L/V

    if (stageT_.size() != static_cast<std::size_t>(nStages_))
        stageT_.assign(nStages_, T_pot);

    sVector xD = (xD_.size() == nc) ? xD_ : y0;        // warm start on x_D
    // Each stage's y carries the bubble-T Newton's own tolerance (1e-8 on
    // the T residual) and the noise compounds up the cascade -- 5e-7 sits
    // above that floor and far below any physical claim.
    constexpr scalar tol = 5.0e-7;

    // One upward sweep of the cascade: given a trial x_D, walk the section
    // balances + stage equilibria from the pot vapour to the top.  The
    // balances hold EXACTLY at every iterate; `feasible` reports a negative
    // stage composition (the trial x_D is outside the reachable set).
    auto sweep = [&](const sVector& xDtry, bool& feasible) -> sVector
    {
        sVector y = y0, xs(nc);
        feasible = true;
        for (int s = 0; s < nStages_; ++s)
        {
            for (std::size_t i = 0; i < nc; ++i)
            {
                xs[i] = (y[i] - Dv * xDtry[i]) / Lv;
                if (xs[i] < -1.0e-10) { feasible = false; return y; }
                if (xs[i] < 0.0) xs[i] = 0.0;          // round-off clamp only
            }
            auto rs = BubblePoint::compute(*thermo_, xs, P_op_, stageT_[s]);
            if (!rs.converged)
                throw std::runtime_error("BatchStill '" + name_ + "': stage "
                    + std::to_string(s + 1) + " bubble-T failed in the cascade"
                    " (T_seed = " + std::to_string(stageT_[s]) + " K)");
            stageT_[s] = rs.T;
            y = rs.y;
        }
        return y;
    };

    auto accept = [&](const sVector& v) -> sVector
    {
        scalar sum = 0.0;
        for (auto q : v) sum += q;
        if (std::abs(sum - 1.0) > 1.0e-8)
            throw std::runtime_error("BatchStill '" + name_ + "': cascade"
                " closed but sum(x_D) = " + std::to_string(sum)
                + " != 1 -- a balance leak, not a solution");
        xD_ = v;
        return v;
    };

    // ---- Phase 1: damped Picard on the condenser closure ----------------
    //  Contractive at moderate R (converges in a handful of sweeps).  At a
    //  LOW-R section balance (divide by L/V) or near the lean-pot pinch the
    //  map stops contracting -- that is phase 2's job, not more damping
    //  heuristics (two rounds of tuning proved they just move the failure).
    scalar omega = std::min(1.0, 2.0 * Lv);
    scalar resid = 1.0;
    for (int it = 0; it < 60; ++it)
    {
        bool feasible = true;
        const sVector y = sweep(xD, feasible);
        if (!feasible)
        {
            if (it == 0)
            {
                // The WARM start (last converged x_D, possibly from a very
                // different R during a policy bracket) sits outside this R's
                // reachable set -- restart from the pot vapour, which is
                // stage-1 feasible by construction, instead of crawling back.
                xD = y0;
                continue;
            }
            omega = std::max(0.5 * omega, 0.02);
            for (std::size_t i = 0; i < nc; ++i)
                xD[i] += omega * (y[i] - xD[i]);
            continue;
        }
        resid = 0.0;
        for (std::size_t i = 0; i < nc; ++i)
            resid = std::max(resid, std::abs(y[i] - xD[i]));
        if (resid < tol) return accept(y);
        omega = std::min(1.2 * omega, 1.0);
        for (std::size_t i = 0; i < nc; ++i)
            xD[i] += omega * (y[i] - xD[i]);
    }

    // ---- Phase 2: Newton on the closure g(x_D) = y_N(x_D) - x_D ---------
    //  Quadratic near the root, no contraction required; backtracking
    //  rejects infeasible / out-of-simplex trials via a penalty residual.
    //  fdStep sits well above the stages' 1e-8 noise so the FD Jacobian is
    //  differentiating physics, not round-off.
    auto F = [&](const sVector& v) -> sVector
    {
        for (auto q : v)
            if (!(q >= -1.0e-12 && q <= 1.0 + 1.0e-12))
                return sVector(nc, 1.0e3);
        bool feasible = true;
        const sVector y = sweep(v, feasible);
        if (!feasible) return sVector(nc, 1.0e3);
        sVector g(nc);
        for (std::size_t i = 0; i < nc; ++i) g[i] = y[i] - v[i];
        return g;
    };
    solver::NDOptions opts;
    opts.tolerance = tol;
    opts.maxIter   = 60;
    opts.fdStep    = 1.0e-5;
    const auto sol = solver::newtonND(F, xD, opts);
    if (sol.converged)
    {
        bool feasible = true;
        return accept(sweep(sol.x, feasible));   // the closed y_N, not the iterate
    }
    if (closed)
    {
        // Soft-fail for the policy bracket: at the feasibility PINCH (the
        // target on the edge of the reachable set) the closure root sits on
        // the infeasibility boundary and neither Picard nor Newton can
        // straddle it.  The caller reads this as "cannot hold reliably".
        *closed = false;
        return y0;
    }
    std::ostringstream oss;
    oss << "BatchStill '" << name_ << "': rectifying cascade did not close"
           " (Picard 60 sweeps then Newton " << sol.iterations
        << " iterations, ||g|| = " << std::scientific << sol.residual
        << ") -- check R/nStages against the mixture";
    throw std::runtime_error(oss.str());
}

// -----------------------------------------------------------------------
//  constantComposition (forum #85-3): a BRACKETED solve of
//      f(R) = x_D[LK](R) - x_D_target      over [0, refluxMax],
//  never a bare Newton, preceded by a feasibility map: f is sampled on a
//  coarse grid first, and the solve only proceeds on an UNAMBIGUOUS single
//  sign change.  Distinct outcomes, none silent:
//    * f(0) >= 0  -> the target sits BELOW the column's floor at zero
//      reflux -- even R = 0 over-purifies.  Throws (a spec error).
//    * more than one sign change -> x_D(R) is non-monotone on the interval
//      (an azeotrope can do this).  Throws rather than jump branches.
//    * f(refluxMax) < 0 everywhere -> the ceiling cannot reach the target
//      from the CURRENT pot: returns false (the refluxLimit path; the
//      CALLER decides -- refuse at t=0, stop distilling mid-campaign).
//    * exactly one crossing -> bisection to |f| < 1e-6; refluxRatio_ set.
// -----------------------------------------------------------------------
bool BatchStill::solveRefluxFor_(const sVector& y0, scalar T_pot, scalar prevR)
{
    // Sample record: a cascade that cannot CLOSE at a trial R is an INVALID
    // sample, never a fabricated value (forum #87-P1: scoring it as f = -1
    // invented the topology of the physical function).
    struct FSample { scalar R; scalar f; bool valid; };
    auto sample = [&](scalar R) -> FSample
    {
        bool ok = true;
        const sVector v = solveColumn_(y0, T_pot, R, &ok);
        return { R, ok ? v[lightKeyIdx_] - xDTarget_ : 0.0, ok };
    };

    auto bisect = [&](scalar lo, scalar hi, scalar flo) -> bool
    {
        (void) flo;
        for (int it = 0; it < 60; ++it)
        {
            const scalar mid = 0.5 * (lo + hi);
            bool ok = true;
            const sVector v = solveColumn_(y0, T_pot, mid, &ok);
            if (!ok)
                throw std::runtime_error("BatchStill '" + name_ + "': the"
                    " cascade fails to CLOSE inside the certified bracket (R = "
                    + std::to_string(mid) + ") -- cannot hold the target"
                    " reliably here.");
            const scalar fm = v[lightKeyIdx_] - xDTarget_;
            if (std::abs(fm) < 1.0e-6) { refluxRatio_ = mid; return true; }
            (fm < 0.0 ? lo : hi) = mid;
        }
        refluxRatio_ = 0.5 * (lo + hi);
        return true;
    };

    if (prevR >= 0.0)
    {
        // Mid-campaign: walk an expanding bracket from the previous R.
        bool ok = true;
        sVector v = solveColumn_(y0, T_pot, prevR, &ok);
        if (!ok)
            throw std::runtime_error("BatchStill '" + name_ + "': the cascade"
                " fails to CLOSE at the operating R = " + std::to_string(prevR)
                + " -- cannot continue the policy from here.");
        scalar fPrev = v[lightKeyIdx_] - xDTarget_;
        if (std::abs(fPrev) < 1.0e-6) { refluxRatio_ = prevR; return true; }
        const bool up = fPrev < 0.0;             // pot leaned: R must rise
        scalar Ra = prevR, fa = fPrev;
        for (int k = 0; k < 40; ++k)
        {
            scalar Rb = up ? std::min(refluxMax_, Ra * 1.35 + 0.05)
                           : std::max(0.0,        Ra * 0.70);
            bool okb = true;
            const sVector vb = solveColumn_(y0, T_pot, Rb, &okb);
            if (!okb)
                throw std::runtime_error("BatchStill '" + name_ + "': the"
                    " cascade fails to CLOSE at R = " + std::to_string(Rb)
                    + " while walking the bracket -- refusing to guess"
                    " across the gap.");
            const scalar fb = vb[lightKeyIdx_] - xDTarget_;
            if (up ? (fb < fa - 1.0e-6) : (fb > fa + 1.0e-6))
                throw std::runtime_error("BatchStill '" + name_ + "': x_D[LK]"
                    " moves AGAINST R between R = " + std::to_string(Ra)
                    + " and R = " + std::to_string(Rb) + " -- non-monotone;"
                    " refusing to pick a branch silently.");
            if ((fa < 0.0) != (fb < 0.0))
                return up ? bisect(Ra, Rb, fa) : bisect(Rb, Ra, fb);
            Ra = Rb; fa = fb;
            if (up  && Ra >= refluxMax_) return false;       // ceiling: the limit path
            if (!up && Ra <= 0.0)
                throw std::runtime_error("BatchStill '" + name_ + "': the"
                    " target is exceeded even at R = 0 mid-campaign -- the"
                    " pot became RICHER than the spec allows for zero reflux"
                    " (unexpected for a simple still; check the recipe).");
        }
        throw std::runtime_error("BatchStill '" + name_ + "': bracket walk"
            " did not close on the target in 40 expansions.");
    }

    // Feasibility map: a coarse grid.  The floor is checked FIRST (f(0) is
    // the pot vapour, no cascade, always valid) so a below-the-floor target
    // gets ITS diagnostic.  Deliberately NOT refined toward R = 0: the
    // upward sweep is hypersensitive there (feasible x_D window ~(L/V)^N);
    // the robust fix is the downward (condenser-to-pot) sweep -- a future
    // unit needing a reusable dew-T kernel.
    constexpr int NG = 9;
    FSample s[NG];
    s[0] = sample(0.0);
    if (s[0].f >= 0.0)
        throw std::runtime_error("BatchStill '" + name_ + "': x_D_target "
            + std::to_string(xDTarget_) + " sits BELOW the column's floor at"
            " zero reflux (x_D[LK](R=0) = "
            + std::to_string(s[0].f + xDTarget_) + ") -- even R = 0"
            " over-purifies.  Raise the target or reduce nStages.");
    for (int k = 1; k < NG; ++k)
        s[k] = sample(refluxMax_ * scalar(k) / (NG - 1));

    // Classify the VALID samples only.  Rules (forum #87-P1):
    //  * count ALL sign changes between consecutive valid samples (both
    //    directions -- a rising-only count let a `- + -` grid pass as
    //    unambiguous);
    //  * an INVALID sample BETWEEN valid ones is an uncertifiable gap: the
    //    function may cross inside it, so refuse rather than guess.  A
    //    contiguous invalid TAIL at high R (the lean-pot pinch) is the one
    //    benign shape: it cannot hide a crossing below it being reported.
    int lastValid = 0;
    bool interiorGap = false;
    int nCross = 0, kc = -1;
    for (int k = 1; k < NG; ++k)
    {
        if (!s[k].valid) continue;
        if (lastValid != k - 1)
        {
            // there were invalid samples between two valid ones
            interiorGap = true;
        }
        if ((s[lastValid].f < 0.0) != (s[k].f < 0.0)) { ++nCross; kc = k; }
        lastValid = k;
    }
    if (nCross > 1)
        throw std::runtime_error("BatchStill '" + name_ + "': x_D[LK](R) is"
            " NON-MONOTONE on [0, refluxMax] (" + std::to_string(nCross)
            + " sign changes on the feasibility grid) -- refusing to pick a"
            " branch silently.");
    if (nCross == 0)
    {
        if (interiorGap)
            throw std::runtime_error("BatchStill '" + name_ + "': the cascade"
                " fails to CLOSE at interior points of [0, refluxMax] and no"
                " crossing is visible among the valid samples -- cannot"
                " certify whether the target is reachable.  Check nStages/"
                "refluxMax against the mixture.");
        return false;                          // ceiling can't reach the target
    }
    if (interiorGap)
        throw std::runtime_error("BatchStill '" + name_ + "': the feasibility"
            " grid has an uncertifiable gap (non-closing cascade) BELOW the"
            " detected crossing -- refusing to certify the branch.");
    // Monotonicity across the valid samples (slack = the bisection tolerance:
    // the samples carry ~1e-6 cascade noise, not physical wiggles).
    for (int k = 1; k < NG; ++k)
    {
        if (!s[k].valid) continue;
        int prev = k - 1;
        while (prev >= 0 && !s[prev].valid) --prev;
        if (prev >= 0 && s[k].f < s[prev].f - 1.0e-6)
            throw std::runtime_error("BatchStill '" + name_ + "': x_D[LK](R)"
                " DECREASES between R = " + std::to_string(s[prev].R) + " and R = "
                + std::to_string(s[k].R) + " on the feasibility grid --"
                " non-monotone; refusing to pick a branch silently.");
    }

    int klo = kc - 1;
    while (klo >= 0 && !s[klo].valid) --klo;
    scalar lo = s[klo].R, hi = s[kc].R;
    for (int it = 0; it < 60; ++it)
    {
        const scalar mid = 0.5 * (lo + hi);
        const FSample fm = sample(mid);
        if (!fm.valid)
            throw std::runtime_error("BatchStill '" + name_ + "': the cascade"
                " fails to CLOSE inside the certified bracket (R = "
                + std::to_string(mid) + ") -- cannot hold the target"
                " reliably here.");
        if (std::abs(fm.f) < 1.0e-6) { refluxRatio_ = mid; return true; }
        (fm.f < 0.0 ? lo : hi) = mid;
    }
    refluxRatio_ = 0.5 * (lo + hi);
    return true;
}

void BatchStill::setOperationParameter(const std::string& key, scalar value)
{
    if (key == "F_vap")
    {
        if (value < 0.0)
            throw std::runtime_error("BatchStill '" + name_ + "': F_vap"
                " must be ≥ 0 (got " + std::to_string(value) + ")");
        // A boilup change ends the constant-physics segment.
        if (value != F_vap_)
        {
            closeSegment_(lastTime_);
            F_vap_ = value;
            openSegment_(lastTime_);
            return;
        }
        F_vap_ = value;
        return;
    }
    if (key == "P")
    {
        if (value <= 0.0)
            throw std::runtime_error("BatchStill '" + name_ + "': P must"
                " be > 0 (got " + std::to_string(value) + ")");
        P_op_   = value;
        state_.P = value;
        return;
    }
    BatchUnitOperation::setOperationParameter(key, value);
}

void BatchStill::notifyStateChanged()
{
    // The warm bubble-T seed is no longer valid after a charge --- the
    // composition has jumped.  Re-seed from the current T (which the
    // base chargeFrom set by enthalpy equality).  The first
    // derivatives_ call after this will refine the seed.
    T_warm_ = state_.T;
    // A recipe charge/discharge is a segment boundary: the duty records'
    // pot state difference must stay purely distillative.
    closeSegment_(lastTime_);
    openSegment_(lastTime_);
}

// ---- Energy ledger (phase (c)): per-segment duty records ------------------

void BatchStill::noteTimeAdvanced(scalar t)
{
    lastTime_ = t;
    if (!timeSeen_)
    {
        timeSeen_ = true;
        openSegment_(t);
        return;
    }
    if (state_.T > segTmax_) segTmax_ = state_.T;
}

scalar BatchStill::phaseH_(const sVector& nv, scalar T, scalar vf)
{
    scalar nTot = 0.0;
    for (auto v : nv) nTot += v;
    if (nTot <= 0.0 || !thermo_) return 0.0;
    sVector z(thermo_->n(), 0.0);
    for (std::size_t i = 0; i < thermo_->n() && i < nv.size(); ++i)
    {
        z[i] = nv[i] / nTot;
        if (z[i] > 0.0 && !thermo_->hasEnthalpyDatum(i))
        {
            const std::string why = "no enthalpy datum for '"
                + thermo_->comp(i).name() + "'";
            if (std::find(segMissing_.begin(), segMissing_.end(), why)
                == segMissing_.end())
                segMissing_.push_back(why);
            segPoisoned_ = true;
            return 0.0;
        }
    }
    try
    {
        return thermo_->H_stream_formation(T, P_op_ > 0.0 ? P_op_ * 1.0e5 : 1.0e5,
                                 vf, z) * nTot;   // J/mol * kmol = kJ
    }
    catch (const std::exception& ex)
    {
        const std::string why =
            std::string("enthalpy evaluation failed: ") + ex.what();
        if (std::find(segMissing_.begin(), segMissing_.end(), why)
            == segMissing_.end())
            segMissing_.push_back(why);
        segPoisoned_ = true;
        return 0.0;
    }
}

void BatchStill::openSegment_(scalar t)
{
    segStart_    = t;
    segN0_       = state_.n;
    segT0_       = state_.T;
    segVapH_     = 0.0;
    segLiqH_     = 0.0;
    segLatent_   = 0.0;
    segCondTop_  = 0.0;
    segTmax_     = state_.T;
    segCondTmin_ = 0.0;             // no condensing package yet
    segPoisoned_ = false;
    segMissing_.clear();
}

void BatchStill::closeSegment_(scalar t)
{
    if (!timeSeen_) return;

    bool material = false;
    for (std::size_t i = 0; i < state_.n.size() && i < segN0_.size(); ++i)
        if (state_.n[i] != segN0_[i]) { material = true; break; }
    const bool activity = material || segVapH_ != 0.0 || segLatent_ != 0.0
                       || segCondTop_ != 0.0 || segPoisoned_;
    if (!activity && t <= segStart_ + 1.0e-12) return;   // empty echo
    if (!activity) return;   // idled (e.g. post-refluxLimit): no duty story

    // Pot enthalpy difference across the segment (liquid, both endpoints
    // at their own committed T -- an exact state difference).
    const scalar H0 = phaseH_(segN0_,    segT0_,    0.0);
    const scalar HF = phaseH_(state_.n,  state_.T,  0.0);

    SimulationResult::EnergyRecord reb, cond;
    reb.tStart  = cond.tStart = segStart_;
    reb.tEnd    = cond.tEnd   = t;
    reb.unit    = cond.unit   = name_;
    reb.kind    = "reboiler";
    cond.kind   = "condenser";
    // Worst-case service ends: the hot utility must beat the HOTTEST pot
    // state of the segment; the coolant must get below the COLDEST
    // condensing temperature seen (0 = no package: unknown, -1).
    reb.T_service_K  = std::max(segTmax_, state_.T);
    cond.T_service_K = (segCondTmin_ > 0.0) ? segCondTmin_ : -1.0;

    if (segPoisoned_)
    {
        reb.E_valid  = cond.E_valid  = false;
        reb.E_missing = cond.E_missing = segMissing_;
        reb.basis  = "still duty UNAVAILABLE: unpriceable segment";
        cond.basis = reb.basis;
    }
    else if (model_ == "rectifier")
    {
        // Physical condenser at the top-stage T; the reboiler closes the
        // box first law exactly as the residual (the hand-off liquid
        // leaves at the pot T -- the material model's own simplification,
        // declared here, not hidden).
        cond.E_kJ    = -segCondTop_;
        cond.E_valid = true;
        cond.basis   = "total condenser: Q = -Sum V*dt*[h_vap - h_liq]"
                       "(T_top, x_D), top-stage T, elements datum";
        reb.E_kJ     = (HF - H0) + segLiqH_ + segCondTop_;
        reb.E_valid  = true;
        reb.basis    = "reboiler: box first law residual, Q_reb = dH_pot"
                       " + Sum n_pkg*h_liq(T_pkg) - Q_cond (product hand-off"
                       " at pot T, the material model's convention)";
    }
    else
    {
        reb.E_kJ     = (HF - H0) + segVapH_;
        reb.E_valid  = true;
        reb.basis    = "reboiler: first law over the pot, Q = dH_pot +"
                       " Sum n_pkg*h_vap(T_pkg, y_pkg), package-by-package,"
                       " elements datum";
        cond.E_kJ    = -segLatent_;
        cond.E_valid = true;
        cond.basis   = "condenser: Q = -Sum n_pkg*[h_vap - h_liq](T_pkg),"
                       " condensing each shed package at its hand-off T";
    }
    energyLog_.push_back(std::move(reb));
    energyLog_.push_back(std::move(cond));
}

std::vector<SimulationResult::EnergyRecord>
BatchStill::energyRecords(scalar tEnd)
{
    closeSegment_(tEnd);
    return energyLog_;
}

void BatchStill::step(scalar t, scalar dt)
{
    const std::size_t n = state_.n.size();

    // constantComposition: R is a CONTROL input updated once per step at the
    // committed state and held through the RK4 substeps (a first-order-in-dt
    // discretisation of the policy -- announced here, never hidden).  When
    // the bracketed solve reports the ceiling cannot reach the target any
    // more, distillation STOPS (D = 0) and the campaign idles to endTime
    // with the status on the trajectory (forum #85-4) -- never a magic
    // termination, never silent.
    if (model_ == "rectifier" && policy_ == "constantComposition"
        && !refluxLimitReached_)
    {
        scalar nTotC = 0.0;
        for (auto v : state_.n) nTotC += v;
        if (nTotC > 1.0e-20)
        {
            sVector x(n);
            for (std::size_t i = 0; i < n; ++i) x[i] = state_.n[i] / nTotC;
            auto rc = BubblePoint::compute(*thermo_, x, P_op_, T_warm_);
            if (!rc.converged)
                throw std::runtime_error("BatchStill '" + name_ + "': bubble-T"
                    " failed at the policy step (T_seed = "
                    + std::to_string(T_warm_) + " K)");
            T_warm_ = rc.T;
            if (!solveRefluxFor_(rc.y, rc.T, refluxRatio_))
            {
                refluxLimitReached_ = true;
                tLimit_ = t;
                std::cout << "[batchStill " << name_ << "] refluxMax "
                          << refluxMax_ << " can no longer hold x_D["
                          << thermo_->comp(lightKeyIdx_).name() << "] = "
                          << xDTarget_ << " (pot too lean) at t = " << t
                          << " s -- onRefluxLimit stopDistillation: D = 0,"
                          " the campaign idles to endTime\n";
            }
        }
    }

    sVector y0 = state_.n;

    auto axpy = [](const sVector& x, scalar a, const sVector& y) {
        sVector r(x.size());
        for (std::size_t i = 0; i < x.size(); ++i) r[i] = x[i] + a * y[i];
        return r;
    };

    auto k1 = derivatives_(y0);
    auto k2 = derivatives_(axpy(y0, 0.5 * dt, k1));
    auto k3 = derivatives_(axpy(y0, 0.5 * dt, k2));
    auto k4 = derivatives_(axpy(y0,       dt, k3));

    for (std::size_t i = 0; i < n; ++i)
        y0[i] += dt / 6.0 * (k1[i] + 2.0*k2[i] + 2.0*k3[i] + k4[i]);

    // Capture the vapour removed this step (n_before - n_after >= 0) into the
    // buffer, so a `dischargeTo` receiver can collect the condensed distillate
    //.  state_.n still holds the pre-step values here.
    if (vapourBuf_.size() != n) vapourBuf_.assign(n, 0.0);
    for (std::size_t i = 0; i < n; ++i)
    {
        const scalar removed = state_.n[i] - std::max<scalar>(y0[i], 0.0);
        if (removed > 0.0) vapourBuf_[i] += removed;
    }

    for (std::size_t i = 0; i < n; ++i)
        state_.n[i] = std::max<scalar>(y0[i], 0.0);

    // Refresh the recorded T (one final bubble-T call --- cheap, makes
    // the trajectory CSV report the current pot temperature).
    scalar nTot = 0.0;
    for (auto v : state_.n) nTot += v;
    if (nTot > 1.0e-20)
    {
        sVector x(n);
        for (std::size_t i = 0; i < n; ++i) x[i] = state_.n[i] / nTot;
        auto r = BubblePoint::compute(*thermo_, x, P_op_, T_warm_);
        if (r.converged)
        {
            state_.T = r.T; T_warm_ = r.T;
            // Record the INSTANTANEOUS distillate at the committed state for
            // the trajectory + KPIs (the receiver accumulates the mean -- two
            // different compositions, forum #85-6).
            if (model_ == "rectifier" && !refluxLimitReached_)
            {
                xD_ = (refluxRatio_ > 0.0 && nStages_ > 0)
                    ? solveColumn_(r.y, r.T, refluxRatio_) : r.y;
                // Energy ledger (phase (c)): the PHYSICAL condenser
                // condenses the whole boilup V (not D) at the top-stage T.
                // O(dt) quadrature on V*dh -- the same first-order-in-dt
                // discretisation the policy itself uses, declared in the
                // record basis via the residual-reboiler construction.
                if (timeSeen_ && F_vap_ > 0.0 && !xD_.empty())
                {
                    const scalar T_top =
                        (refluxRatio_ > 1.0e-12 && nStages_ > 0)
                            ? stageT_[static_cast<std::size_t>(nStages_) - 1]
                            : r.T;
                    sVector nD(xD_.size());
                    for (std::size_t i = 0; i < xD_.size(); ++i)
                        nD[i] = xD_[i] * F_vap_ * dt;    // kmol of vapour V
                    const scalar Hv = phaseH_(nD, T_top, 1.0);
                    const scalar Hl = phaseH_(nD, T_top, 0.0);
                    if (!segPoisoned_)
                    {
                        segCondTop_ += (Hv - Hl);
                        if (segCondTmin_ == 0.0 || T_top < segCondTmin_)
                            segCondTmin_ = T_top;
                    }
                }
            }
        }
    }
}

std::vector<std::pair<std::string, scalar>> BatchStill::trajectoryExtras() const
{
    if (model_ != "rectifier" || !thermo_ || xD_.empty()) return {};
    std::vector<std::pair<std::string, scalar>> out;
    for (std::size_t i = 0; i < xD_.size(); ++i)
        out.emplace_back("xD_" + thermo_->comp(i).name(), xD_[i]);
    out.emplace_back("R", refluxRatio_);
    out.emplace_back("D", refluxLimitReached_
                          ? 0.0 : F_vap_ / (refluxRatio_ + 1.0));
    if (policy_ == "constantComposition")
        out.emplace_back("refluxLimitReached", refluxLimitReached_ ? 1.0 : 0.0);
    return out;
}

std::map<std::string, scalar> BatchStill::kpis() const
{
    if (model_ != "rectifier" || !thermo_) return {};
    std::map<std::string, scalar> k;
    for (std::size_t i = 0; i < xD_.size(); ++i)
        k["xD_" + thermo_->comp(i).name() + "_final"] = xD_[i];
    k["R_final"] = refluxRatio_;
    k["V_boilup"] = F_vap_;
    k["D_product"] = refluxLimitReached_ ? 0.0 : F_vap_ / (refluxRatio_ + 1.0);
    if (policy_ == "constantComposition")
    {
        k["refluxLimitReached"] = refluxLimitReached_ ? 1.0 : 0.0;
        if (refluxLimitReached_) k["t_refluxLimit"] = tLimit_;
    }
    return k;
}

std::vector<SimulationResult::TimelineEvent> BatchStill::statusEvents() const
{
    if (!refluxLimitReached_ || !thermo_) return {};
    std::ostringstream d;
    d << name_ << ": refluxMax " << refluxMax_ << " can no longer hold x_D["
      << thermo_->comp(lightKeyIdx_).name() << "] = " << xDTarget_
      << " -- stopDistillation (D = 0)";
    return { { tLimit_, "status", "refluxLimitReached", d.str(), "", name_, "" } };
}

BatchState BatchStill::takeContinuousDischarge()
{
    const std::size_t n = state_.n.size();
    if (vapourBuf_.size() != n) vapourBuf_.assign(n, 0.0);
    BatchState out;
    out.n = vapourBuf_;          // the condensed distillate accumulated so far
    out.T = state_.T;            // ~ the vapour/pot temperature
    out.P = P_op_;
    // Energy ledger: price THIS package at ITS hand-off T, both phases --
    // the vapour enthalpy feeds the reboiler's first law, the vap-liq
    // difference is the condensation duty (phase (c)).
    scalar nTot = 0.0;
    for (auto v : out.n) nTot += v;
    if (nTot > 0.0 && timeSeen_)
    {
        const scalar Hv = phaseH_(out.n, out.T, 1.0);
        const scalar Hl = phaseH_(out.n, out.T, 0.0);
        if (!segPoisoned_)
        {
            segVapH_   += Hv;
            segLiqH_   += Hl;
            segLatent_ += (Hv - Hl);
            if (model_ != "rectifier"
                && (segCondTmin_ == 0.0 || out.T < segCondTmin_))
                segCondTmin_ = out.T;
        }
    }
    std::fill(vapourBuf_.begin(), vapourBuf_.end(), 0.0);   // hand it off
    return out;
}

} // namespace Choupo
