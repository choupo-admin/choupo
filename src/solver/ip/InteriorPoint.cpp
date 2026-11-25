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
File
    InteriorPoint.cpp

Description
    Algorithm A of Wachter & Biegler (2006) as Choupo runs it, and the
    reformulation pipeline around it.  See InteriorPoint.H.  The body of
    AlgorithmA::run() follows the pseudocode of docs/design/interior-point.md
    sec. 2.14 line by line; each step carries the name the pseudocode gives it.
\*---------------------------------------------------------------------------*/

#include "solver/ip/InteriorPoint.H"

#include "solver/ip/BarrierUpdate.H"
#include "solver/ip/DenseLDLT.H"
#include "solver/ip/Globalization.H"
#include "solver/ip/InertiaCorrection.H"
#include "solver/ip/LineSearch.H"
#include "solver/ip/Restoration.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <limits>
#include <memory>
#include <tuple>

namespace Choupo::solver
{

const char* statusName(IPStatus s)
{
    switch (s)
    {
        case IPStatus::Converged:         return "converged";
        case IPStatus::LocallyInfeasible: return "locally infeasible";
        case IPStatus::IterationLimit:    return "iteration limit";
        case IPStatus::RestorationFailed: return "restoration failed";
        case IPStatus::StepTooSmall:      return "step too small";
        case IPStatus::EvaluationFailed:  return "evaluation failed";
        case IPStatus::EarlyExit:         return "early exit";
    }
    return "?";
}

void IPParameters::print(std::ostream& os) const
{
    struct Row { const char* name; scalar value; const char* source; };
    const Row rows[] = {
        {"tol", tol, "L1 p. 9"}, {"mu0", mu0, "L1 p. 9"}, {"kappa_eps", kappaEps, "L1 p. 9"},
        {"kappa_mu", kappaMu, "L1 (7)"}, {"theta_mu", thetaMu, "L1 (7)"}, {"tau_min", tauMin, "L1 p. 9"},
        {"kappa_Sigma", kappaSigma, "L1 (16)"}, {"s_max", sMax, "L1 p. 3"},
        {"gamma_theta", gammaTheta, "L1 (18)"}, {"gamma_phi", gammaPhi, "L1 (18)"}, {"delta", delta, "L1 (19)"},
        {"s_theta", sTheta, "L1 (19)"}, {"s_phi", sPhi, "L1 (19)"}, {"eta_phi", etaPhi, "L1 (20)"},
        {"gamma_alpha", gammaAlpha, "L1 (23)"}, {"theta_max factor", thetaMaxFactor, "L1 p. 9"},
        {"theta_min factor", thetaMinFactor, "L1 p. 9"},
        {"dw_min", dwMin, "L1 p. 10"}, {"dw0_bar", dw0Bar, "L1 p. 10"}, {"dw_max", dwMax, "L1 p. 10"},
        {"dc_bar", dcBar, "L1 p. 10"}, {"kappa_w+_bar", kappaWPlusBar, "L1 p. 10"},
        {"kappa_w+", kappaWPlus, "L1 p. 10"}, {"kappa_w-", kappaWMinus, "L1 p. 10"},
        {"kappa_c", kappaC, "L1 p. 10"}, {"rho", rho, "L1 sec. 3.3.1"}, {"kappa_resto", kappaResto, "L1 sec. 3.3"},
        {"kappa_d", kappaD, "L1 sec. 3.7"}, {"bound relax", boundRelax, "L1 (35)"}, {"kappa_1", kappa1, "L1 (35)"},
        {"kappa_2", kappa2, "L1 (35)"}, {"lambda_max", lambdaMax, "L1 (36)"}, {"g_max", gMax, "L1 sec. 3.8"},
    };
    for (const Row& r : rows)
    {
        char b[160];
        std::snprintf(b, sizeof b, "    %-18s %-10.4g %s\n", r.name, r.value, r.source);
        os << b;
    }
    os << "    max iterations     " << maxIterations << "         Choupo's choice\n";
}

namespace
{

scalar infNorm(const sVector& v)
{
    scalar m = 0.0;
    for (scalar x : v) m = std::max(m, std::abs(x));
    return m;
}

scalar oneNorm(const sVector& v)
{
    scalar s = 0.0;
    for (scalar x : v) s += std::abs(x);
    return s;
}

bool allFinite(const sVector& v)
{
    for (scalar x : v) if (!std::isfinite(x)) return false;
    return true;
}

std::string sci(scalar v)
{
    char b[32];
    std::snprintf(b, sizeof b, "%.3e", v);
    return b;
}

//  L1 (35): the bounds relaxed by relax * max(1, |bound|) (so a bound is
//  never exactly active at a feasible point), infinite bounds left alone.
void relaxBounds(sVector& xL, sVector& xU, scalar relax)
{
    for (std::size_t i = 0; i < xL.size(); ++i)
    {
        if (std::isfinite(xL[i])) xL[i] -= relax * std::max(1.0, std::abs(xL[i]));
        if (std::isfinite(xU[i])) xU[i] += relax * std::max(1.0, std::abs(xU[i]));
    }
}

//  L1 (35): x0 moved to at least p_L above the lower bound and p_U below the
//  upper, p = min(kappa1 max(1,|bound|), kappa2 (width)).
void pushInside(sVector& x, const sVector& xL, const sVector& xU, const IPParameters& par)
{
    for (std::size_t i = 0; i < x.size(); ++i)
    {
        const bool lo = std::isfinite(xL[i]), up = std::isfinite(xU[i]);
        scalar pL = lo ? par.kappa1 * std::max(1.0, std::abs(xL[i])) : 0.0;
        scalar pU = up ? par.kappa1 * std::max(1.0, std::abs(xU[i])) : 0.0;
        if (lo && up)
        {
            pL = std::min(pL, par.kappa2 * (xU[i] - xL[i]));
            pU = std::min(pU, par.kappa2 * (xU[i] - xL[i]));
        }
        if (lo) x[i] = std::max(x[i], xL[i] + pL);
        if (up) x[i] = std::min(x[i], xU[i] - pU);
    }
}

// ===========================================================================
//  Algorithm A on an equality-form problem (c(x) = 0, simple bounds).
// ===========================================================================

class AlgorithmA
{
public:
    AlgorithmA(const NLPProblem& P, const IPOptions& opt)
        : P_(P), opt_(opt), par_(opt.par), n_(P.numVariables()), m_(P.numConstraints()),
          ic_(ldlt_, opt.par), filter_(opt.par), barrier_(opt.par)
    {
    }

    IPResult run();

private:
    // ---- the iterate ----------------------------------------------------
    bool evaluateFunctions(const sVector& x, scalar& f, sVector& c);
    bool evaluateDerivatives();
    scalar theta(const sVector& c) const { return oneNorm(c); }
    bool barrierObjective(const sVector& x, scalar f, scalar& phi) const;
    void barrierGradient(sVector& g) const;
    sVector dualResidual() const;
    scalar unscaledViolation() const;

    struct KKTError { scalar dual = 0, primal = 0, compl_ = 0, E = 0; };
    KKTError kktError(scalar mu) const;

    // ---- start and steps -------------------------------------------------
    bool initialise();
    void initialMultipliers();
    void resetBoundMultipliers();
    void clipDuals();
    scalar fractionToBoundaryPrimal(const sVector& dx, scalar tau) const;
    scalar fractionToBoundaryDual(const sVector& dzL, const sVector& dzU, scalar tau) const;

    // ---- the phases of the iteration (named as in sec. 2.14) -----------------
    void updateBarrierParameter();
    bool computeStep(sVector& dx, sVector& dl, IPIterationRecord& rec);
    bool restoration(const std::string& reason, IPIterationRecord& rec);
    void finish(IPStatus s, const std::string& msg);

    const NLPProblem& P_;
    const IPOptions&  opt_;
    const IPParameters& par_;
    std::size_t n_, m_;

    DenseLDLT           ldlt_;
    InertiaCorrection   ic_;
    FilterGlobalization filter_;
    MonotoneBarrierUpdate barrier_;

    sVector xL_, xU_;
    std::vector<char> hasL_, hasU_;

    sVector x_, lambda_, zL_, zU_;
    scalar  f_ = 0.0;
    sVector gradF_, c_;
    DenseMatrix J_;
    scalar  mu_ = 0.0, tau_ = 0.99;
    scalar  thetaMin_ = 0.0, thetaMax_ = 0.0;
    std::size_t nBounds_ = 0;

    std::size_t k_ = 0, evaluations_ = 0;
    IPResult res_;
    IPTrace  trace_;
    bool     done_ = false;
};

bool AlgorithmA::evaluateFunctions(const sVector& x, scalar& f, sVector& c)
{
    ++evaluations_;
    if (!P_.objective(x, f) || !P_.constraints(x, c)) return false;
    return std::isfinite(f) && allFinite(c);
}

bool AlgorithmA::evaluateDerivatives()
{
    if (!P_.objectiveGradient(x_, gradF_) || !P_.constraintJacobian(x_, J_)) return false;
    if (!allFinite(gradF_)) return false;
    for (const sVector& row : J_) if (!allFinite(row)) return false;
    return true;
}

bool AlgorithmA::barrierObjective(const sVector& x, scalar f, scalar& phi) const
{
    //  phi_mu = f - mu sum ln(x - xL) - mu sum ln(xU - x), plus the damping
    //  kappa_d mu (distance to the bound) on a variable with ONE bound (L1 sec. 3.7).
    phi = f;
    for (std::size_t i = 0; i < n_; ++i)
    {
        if (hasL_[i])
        {
            const scalar s = x[i] - xL_[i];
            if (!(s > 0.0)) return false;
            phi -= mu_ * std::log(s);
            if (!hasU_[i]) phi += par_.kappaD * mu_ * s;
        }
        if (hasU_[i])
        {
            const scalar s = xU_[i] - x[i];
            if (!(s > 0.0)) return false;
            phi -= mu_ * std::log(s);
            if (!hasL_[i]) phi += par_.kappaD * mu_ * s;
        }
    }
    return std::isfinite(phi);
}

void AlgorithmA::barrierGradient(sVector& g) const
{
    g = gradF_;
    for (std::size_t i = 0; i < n_; ++i)
    {
        if (hasL_[i])
        {
            g[i] -= mu_ / (x_[i] - xL_[i]);
            if (!hasU_[i]) g[i] += par_.kappaD * mu_;
        }
        if (hasU_[i])
        {
            g[i] += mu_ / (xU_[i] - x_[i]);
            if (!hasL_[i]) g[i] -= par_.kappaD * mu_;
        }
    }
}

sVector AlgorithmA::dualResidual() const
{
    //  grad f + A lambda - zL + zU
    sVector r = gradF_;
    for (std::size_t j = 0; j < m_; ++j)
        for (std::size_t i = 0; i < n_; ++i) r[i] += J_[j][i] * lambda_[j];
    for (std::size_t i = 0; i < n_; ++i) r[i] += -zL_[i] + zU_[i];
    return r;
}

scalar AlgorithmA::unscaledViolation() const
{
    scalar v = 0.0;
    for (std::size_t j = 0; j < m_; ++j)
        v = std::max(v, std::abs(c_[j]) / (opt_.rowScale ? (*opt_.rowScale)[j] : 1.0));
    return v;
}

AlgorithmA::KKTError AlgorithmA::kktError(scalar mu) const
{
    //  L1 (5)-(6): E_mu = max( ||dual||_inf / s_d, ||c||_inf, ||compl - mu||_inf / s_c ),
    //  s_d and s_c >= 1 grow with the average multiplier above s_max.
    const scalar sumZ = oneNorm(zL_) + oneNorm(zU_);
    const scalar sd = std::max(par_.sMax, (oneNorm(lambda_) + sumZ) / static_cast<scalar>(m_ + std::max<std::size_t>(nBounds_, 1))) / par_.sMax;
    const scalar sc = nBounds_ ? std::max(par_.sMax, sumZ / static_cast<scalar>(nBounds_)) / par_.sMax : 1.0;
    KKTError e;
    e.dual = infNorm(dualResidual()) / sd;
    e.primal = infNorm(c_);
    scalar cm = 0.0;
    for (std::size_t i = 0; i < n_; ++i)
    {
        if (hasL_[i]) cm = std::max(cm, std::abs((x_[i] - xL_[i]) * zL_[i] - mu));
        if (hasU_[i]) cm = std::max(cm, std::abs((xU_[i] - x_[i]) * zU_[i] - mu));
    }
    e.compl_ = cm / sc;
    e.E = std::max({e.dual, e.primal, e.compl_});
    return e;
}

void AlgorithmA::resetBoundMultipliers()
{
    //  z = mu / slack (so that slack * z = mu), inside the clipping window.
    for (std::size_t i = 0; i < n_; ++i)
    {
        zL_[i] = hasL_[i] ? mu_ / (x_[i] - xL_[i]) : 0.0;
        zU_[i] = hasU_[i] ? mu_ / (xU_[i] - x_[i]) : 0.0;
    }
}

void AlgorithmA::initialMultipliers()
{
    //  L1 (36): lambda minimising || grad f - zL + zU + A lambda ||_2, from the
    //  symmetric system [I A; A^T 0] (w, lambda) = (-(grad f - zL + zU), 0).
    //  Dropped (lambda = 0) when the system is singular or the result exceeds lambda_max.
    lambda_.assign(m_, 0.0);
    if (m_ == 0) return;
    DenseMatrix K(n_ + m_, sVector(n_ + m_, 0.0));
    for (std::size_t i = 0; i < n_; ++i) K[i][i] = 1.0;
    for (std::size_t j = 0; j < m_; ++j)
        for (std::size_t i = 0; i < n_; ++i) K[n_ + j][i] = K[i][n_ + j] = J_[j][i];
    sVector rhs(n_ + m_, 0.0);
    for (std::size_t i = 0; i < n_; ++i) rhs[i] = -(gradF_[i] - zL_[i] + zU_[i]);
    DenseLDLT ls;
    const Inertia in = ls.factor(K);
    if (!ls.ok() || in != Inertia{n_, m_, 0}) return;
    SolveReport rep;
    const sVector sol = ls.solve(rhs, rep);
    sVector lam(sol.begin() + n_, sol.end());
    if (allFinite(lam) && infNorm(lam) <= par_.lambdaMax) lambda_ = lam;
}

void AlgorithmA::clipDuals()
{
    //  L1 (16): mu/(kappaSigma slack) <= z <= kappaSigma mu / slack.
    for (std::size_t i = 0; i < n_; ++i)
    {
        if (hasL_[i])
        {
            const scalar s = x_[i] - xL_[i];
            zL_[i] = std::min(std::max(zL_[i], mu_ / (par_.kappaSigma * s)), par_.kappaSigma * mu_ / s);
        }
        if (hasU_[i])
        {
            const scalar s = xU_[i] - x_[i];
            zU_[i] = std::min(std::max(zU_[i], mu_ / (par_.kappaSigma * s)), par_.kappaSigma * mu_ / s);
        }
    }
}

scalar AlgorithmA::fractionToBoundaryPrimal(const sVector& dx, scalar tau) const
{
    //  L1 (15): the largest alpha in (0,1] with x + alpha dx >= xL + (1-tau)(x - xL)
    //  and <= xU - (1-tau)(xU - x).
    scalar a = 1.0;
    for (std::size_t i = 0; i < n_; ++i)
    {
        if (hasL_[i] && dx[i] < 0.0) a = std::min(a, -tau * (x_[i] - xL_[i]) / dx[i]);
        if (hasU_[i] && dx[i] > 0.0) a = std::min(a, tau * (xU_[i] - x_[i]) / dx[i]);
    }
    return a;
}

scalar AlgorithmA::fractionToBoundaryDual(const sVector& dzL, const sVector& dzU, scalar tau) const
{
    //  L1 (15) for z: z + alpha dz >= (1 - tau) z.
    scalar a = 1.0;
    for (std::size_t i = 0; i < n_; ++i)
    {
        if (hasL_[i] && dzL[i] < 0.0) a = std::min(a, -tau * zL_[i] / dzL[i]);
        if (hasU_[i] && dzU[i] < 0.0) a = std::min(a, -tau * zU_[i] / dzU[i]);
    }
    return a;
}

bool AlgorithmA::initialise()
{
    //  Before the first iteration (sec. 2.11): bounds relaxed, x0 pushed
    //  inside, z0 = 1, lambda0 by least squares.
    P_.variableBounds(xL_, xU_);
    if (opt_.relaxBounds) relaxBounds(xL_, xU_, par_.boundRelax);
    hasL_.assign(n_, 0);  hasU_.assign(n_, 0);
    nBounds_ = 0;
    for (std::size_t i = 0; i < n_; ++i)
    {
        hasL_[i] = std::isfinite(xL_[i]);
        hasU_[i] = std::isfinite(xU_[i]);
        nBounds_ += (hasL_[i] ? 1 : 0) + (hasU_[i] ? 1 : 0);
    }
    x_ = P_.startingPoint();
    if (opt_.pushStartInside) pushInside(x_, xL_, xU_, par_);

    mu_ = opt_.muStart > 0.0 ? opt_.muStart : par_.mu0;
    if (!evaluateFunctions(x_, f_, c_) || !evaluateDerivatives())
    {
        finish(IPStatus::EvaluationFailed, "the starting point could not be evaluated");
        return false;
    }
    zL_.assign(n_, 0.0);  zU_.assign(n_, 0.0);
    for (std::size_t i = 0; i < n_; ++i) { zL_[i] = hasL_[i] ? 1.0 : 0.0; zU_[i] = hasU_[i] ? 1.0 : 0.0; }
    initialMultipliers();
    return true;
}

void AlgorithmA::updateBarrierParameter()
{
    //  A-3: while E_mu <= kappa_eps mu, lower mu by the monotone rule (7),
    //  recompute tau, and reset the filter to {theta >= theta_max} (21).
    for (;;)
    {
        if (!(kktError(mu_).E <= par_.kappaEps * mu_)) break;
        const scalar next = barrier_.next(mu_);
        if (!(next < mu_)) break;                       //- already at tol/10
        trace_.event("mu " + sci(mu_) + " -> " + sci(next) + " by (7): E_mu <= kappa_eps mu");
        mu_ = next;
        tau_ = std::max(par_.tauMin, 1.0 - mu_);
        filter_.reset(thetaMax_);
    }
}

void AlgorithmA::finish(IPStatus s, const std::string& msg)
{
    res_.status = s;
    res_.message = msg;
    done_ = true;
}

bool AlgorithmA::computeStep(sVector& dx, sVector& dl, IPIterationRecord& rec)
{
    //  A-4: the primal-dual system (13) with Algorithm IC.
    DenseMatrix W;
    if (!P_.hessianLagrangian(x_, 1.0, lambda_, W))
    {
        finish(IPStatus::EvaluationFailed, "the Hessian of the Lagrangian could not be evaluated");
        return false;
    }
    for (const sVector& row : W)
        for (scalar w : row)
            if (!std::isfinite(w))
            {
                finish(IPStatus::EvaluationFailed, "the Hessian of the Lagrangian holds a non-finite entry");
                return false;
            }
    sVector gphi;
    barrierGradient(gphi);

    DenseMatrix K(n_ + m_, sVector(n_ + m_, 0.0));
    for (std::size_t r = 0; r < n_; ++r)
        for (std::size_t c = 0; c < n_; ++c) K[r][c] = W[r][c];
    for (std::size_t i = 0; i < n_; ++i)                      //- Sigma = ZL/(x-xL) + ZU/(xU-x)
    {
        if (hasL_[i]) K[i][i] += zL_[i] / (x_[i] - xL_[i]);
        if (hasU_[i]) K[i][i] += zU_[i] / (xU_[i] - x_[i]);
    }
    for (std::size_t j = 0; j < m_; ++j)
        for (std::size_t i = 0; i < n_; ++i) K[n_ + j][i] = K[i][n_ + j] = J_[j][i];

    sVector rhs(n_ + m_, 0.0);
    for (std::size_t i = 0; i < n_; ++i)
    {
        rhs[i] = gphi[i];
        for (std::size_t j = 0; j < m_; ++j) rhs[i] += J_[j][i] * lambda_[j];
        rhs[i] = -rhs[i];
    }
    for (std::size_t j = 0; j < m_; ++j) rhs[n_ + j] = -c_[j];

    const InertiaCorrectionResult ic = ic_.correct(K, n_, m_, mu_, k_, rhs);
    res_.factorisations += ic.factorisations;
    for (const std::string& note : ic.notes) trace_.event(note);
    rec.dw = ic.dw;  rec.dc = ic.dc;  rec.inertia = ic.inertia;
    if (ic.dw > 0.0 || ic.dc > 0.0) ++res_.inertiaCorrections;
    if (!ic.ok) return false;                 //- IC-6: the caller starts the restoration phase

    dx.assign(ic.solution.begin(), ic.solution.begin() + n_);
    dl.assign(ic.solution.begin() + n_, ic.solution.end());
    return allFinite(dx) && allFinite(dl);
}

bool AlgorithmA::restoration(const std::string& reason, IPIterationRecord& rec)
{
    //  A-9: restoration phase.  Returns true when the regular iteration can resume.
    const scalar thetaK = theta(c_);
    scalar phiK = 0.0;
    barrierObjective(x_, f_, phiK);
    if (!opt_.allowRestoration)
    {
        finish(IPStatus::RestorationFailed, reason + " (no restoration inside the restoration problem)");
        return false;
    }
    if (thetaK <= par_.tol)
    {
        finish(IPStatus::RestorationFailed, reason + ", and the restoration phase was called at a feasible point (theta "
                                              + sci(thetaK) + " <= tol): no step reduces the barrier objective");
        return false;
    }
    ++res_.restorations;
    trace_.event("restoration entered: " + reason + "; theta " + sci(thetaK));
    filter_.augment(thetaK, phiK);                       //- the failed point joins the filter (22)

    auto exitTest = [&](const sVector& xr) -> bool
    {
        scalar f = 0.0, phi = 0.0;
        sVector c;
        if (!evaluateFunctions(xr, f, c)) return false;
        if (!barrierObjective(xr, f, phi)) return false;
        const scalar th = theta(c);
        return !filter_.inFilter(th, phi) && th <= par_.kappaResto * thetaK;
    };
    const RestorationOutcome out = runRestoration(P_, xL_, xU_, x_, mu_, par_, exitTest, opt_.rowScale);
    trace_.event(out.note + " (" + std::to_string(out.innerIterations) + " inner iterations)");

    if (out.kind == RestorationOutcome::Kind::LocallyInfeasible)
    {
        res_.infeasibleRows = out.violatedRows;
        std::string rows;
        for (std::size_t i = 0; i < out.violatedRows.size() && i < 6; ++i)
            rows += (i ? "; " : "") + out.violatedRows[i];
        finish(IPStatus::LocallyInfeasible,
               "a local minimum of the constraint violation was reached (||c||_1 = " + sci(out.theta)
                   + "; rows still violated: " + rows + "): the problem may be infeasible, or feasible elsewhere from another start");
        x_ = out.x;
        return false;
    }
    if (out.kind == RestorationOutcome::Kind::Failed)
    {
        finish(IPStatus::RestorationFailed, reason + "; " + out.note);
        return false;
    }

    //  Recovered: the new point, its multipliers re-estimated.
    x_ = out.x;
    if (!evaluateFunctions(x_, f_, c_) || !evaluateDerivatives())
    {
        finish(IPStatus::EvaluationFailed, "evaluation failed at the point the restoration phase returned");
        return false;
    }
    resetBoundMultipliers();
    initialMultipliers();
    rec.type = "resto";
    return true;
}

IPResult AlgorithmA::run()
{
    trace_.live = opt_.log;
    if (!initialise())
    {
        //  The start could not be evaluated: the result still carries a DEFINED x (the
        //  start, projected by initialise() where it got that far), never an empty vector.
        if (res_.x.size() != n_) res_.x = x_.size() == n_ ? x_ : sVector(n_, 0.0);
        res_.trace = trace_;
        return res_;
    }
    //  The filter's first corner theta >= theta_max (21) and theta_min (L1 p. 9).
    const scalar theta0 = theta(c_);
    thetaMax_ = par_.thetaMaxFactor * std::max(1.0, theta0);
    thetaMin_ = par_.thetaMinFactor * std::max(1.0, theta0);
    tau_ = std::max(par_.tauMin, 1.0 - mu_);
    filter_.reset(thetaMax_);
    trace_.header();

    std::size_t tinySteps = 0;
    for (k_ = 0;; ++k_)
    {
        //  A-2: convergence test E_0 <= tol (and the unscaled infeasibility too).
        const KKTError e0 = kktError(0.0);
        res_.kktError = e0.E;
        if (e0.E <= par_.tol && unscaledViolation() <= par_.tol)
        {
            finish(IPStatus::Converged, "E_0 = " + sci(e0.E) + " <= tol " + sci(par_.tol));
            break;
        }
        if (k_ >= par_.maxIterations)
        {
            finish(IPStatus::IterationLimit, "iteration limit " + std::to_string(par_.maxIterations) + " reached with E_0 = " + sci(e0.E));
            break;
        }

        //  A-3: barrier parameter.
        updateBarrierParameter();
        scalar phiK = 0.0;
        if (!barrierObjective(x_, f_, phiK))
        {
            finish(IPStatus::EvaluationFailed, "the iterate left the bounds (a numerical failure of the barrier objective)");
            break;
        }
        const KKTError eMu = kktError(mu_);

        IPIterationRecord rec;
        rec.iteration = k_;  rec.mu = mu_;  rec.phi = phiK;  rec.theta = theta(c_);
        rec.infDu = eMu.dual;  rec.compl_ = eMu.compl_;  rec.filterSize = filter_.size();

        //  A-4: the search direction (Algorithm IC), or its failure.
        sVector dx, dl;
        bool stepOk = computeStep(dx, dl, rec);
        if (done_) break;
        bool needRestoration = !stepOk;
        std::string reason = "the inertia correction failed (dw above dw_max)";

        sVector dzL(n_, 0.0), dzU(n_, 0.0);
        scalar alphaMax = 0.0, alphaZ = 0.0, gradPhiDx = 0.0;
        sVector xTrial, cTrial;
        scalar fTrial = 0.0;
        LineSearchResult ls;

        if (stepOk)
        {
            rec.dxNorm = infNorm(dx);
            //  dz from (12), fraction to the boundary from (15).
            for (std::size_t i = 0; i < n_; ++i)
            {
                if (hasL_[i]) dzL[i] = mu_ / (x_[i] - xL_[i]) - zL_[i] - zL_[i] / (x_[i] - xL_[i]) * dx[i];
                if (hasU_[i]) dzU[i] = mu_ / (xU_[i] - x_[i]) - zU_[i] + zU_[i] / (xU_[i] - x_[i]) * dx[i];
            }
            alphaMax = fractionToBoundaryPrimal(dx, tau_);
            alphaZ = fractionToBoundaryDual(dzL, dzU, tau_);
            sVector gphi;
            barrierGradient(gphi);
            for (std::size_t i = 0; i < n_; ++i) gradPhiDx += gphi[i] * dx[i];

            //  A-5: the filter line search.
            FilterGlobalization::Current cur{rec.theta, phiK, gradPhiDx, thetaMin_};
            auto trial = [&](scalar alpha, scalar& th, scalar& ph) -> bool
            {
                xTrial = x_;
                for (std::size_t i = 0; i < n_; ++i) xTrial[i] += alpha * dx[i];
                if (!evaluateFunctions(xTrial, fTrial, cTrial)) return false;
                if (!barrierObjective(xTrial, fTrial, ph)) return false;
                th = theta(cTrial);
                return true;
            };
            ls = backtrackingLineSearch(filter_, cur, alphaMax, trial);
            rec.lineSearchTrials = ls.trials;
            if (!ls.accepted)
            {
                needRestoration = true;
                reason = "the line search found no acceptable step (alpha below alpha_min)";
            }
        }

        if (needRestoration)
        {
            if (!restoration(reason, rec)) break;
            rec.alphaPr = 0.0;  rec.alphaDu = 0.0;
            rec.filterSize = filter_.size();
            trace_.record(rec);
            if (opt_.earlyExit && opt_.earlyExit(x_)) { finish(IPStatus::EarlyExit, "the exit test fired"); break; }
            continue;
        }

        //  A-6, A-7: accept the trial point, update the multipliers.
        if (ls.verdict == FilterGlobalization::Verdict::AcceptTheta)
            filter_.augment(rec.theta, phiK);                    //- (22), with phi_mu
        scalar relStep = 0.0;
        for (std::size_t i = 0; i < n_; ++i)
            relStep = std::max(relStep, std::abs(ls.alpha * dx[i]) / (1.0 + std::abs(x_[i])));
        x_ = xTrial;  f_ = fTrial;  c_ = cTrial;
        for (std::size_t j = 0; j < m_; ++j) lambda_[j] += ls.alpha * dl[j];
        for (std::size_t i = 0; i < n_; ++i) { zL_[i] += alphaZ * dzL[i]; zU_[i] += alphaZ * dzU[i]; }
        clipDuals();                                              //- (16)
        if (!evaluateDerivatives())
        {
            finish(IPStatus::EvaluationFailed, "the derivatives could not be evaluated at an accepted point");
            break;
        }
        rec.alphaPr = ls.alpha;  rec.alphaDu = alphaZ;
        rec.type = ls.verdict == FilterGlobalization::Verdict::AcceptPhi ? "phi" : "theta";
        rec.filterSize = filter_.size();
        trace_.record(rec);

        if (opt_.earlyExit && opt_.earlyExit(x_)) { finish(IPStatus::EarlyExit, "the exit test fired"); break; }

        //  L1 sec. 3.9: steps of the order of the round-off at the smallest mu stop the run.
        if (relStep <= par_.tinyStepFactor * std::numeric_limits<scalar>::epsilon() && mu_ <= barrier_.floor() * (1.0 + 1e-12))
        {
            if (++tinySteps >= 2)
            {
                finish(IPStatus::StepTooSmall, "the steps fell to the round-off level at the smallest mu with E_0 = " + sci(kktError(0.0).E));
                break;
            }
        }
        else
            tinySteps = 0;
    }

    res_.x = x_;  res_.lambda = lambda_;  res_.zLower = zL_;  res_.zUpper = zU_;
    res_.objective = f_;
    res_.iterations = trace_.rows.size();
    res_.evaluations = evaluations_;
    res_.trace = trace_;
    return res_;
}

} // namespace

IPResult InteriorPoint::algorithmA(const NLPProblem& problem, const IPOptions& options)
{
    AlgorithmA a(problem, options);
    return a.run();
}

// ===========================================================================
//  The pipeline around Algorithm A
// ===========================================================================

IPResult InteriorPoint::solve(const NLPProblem& user, const IPOptions& options)
{
    const IPParameters& par = options.par;
    const std::size_t nUser = user.numVariables(), mUser = user.numConstraints();
    std::ostream* os = options.log;

    EqualityForm eq(user);                 //- rows -> equalities plus slacks
    FixedVariables fx(eq);                 //- xL = xU removed
    const NLPProblem* core = &fx;

    if (os)
    {
        sVector xl, xu;
        user.variableBounds(xl, xu);
        std::size_t nb = 0;
        for (std::size_t i = 0; i < nUser; ++i) nb += (std::isfinite(xl[i]) ? 1 : 0) + (std::isfinite(xu[i]) ? 1 : 0);
        *os << "Choupo-IP: primal-dual interior-point filter line search (Wachter & Biegler 2006, Algorithm A)\n"
            << "  problem " << user.name() << ": " << nUser << " variables, " << mUser << " constraint rows ("
            << eq.numSlacks() << " inequalities -> slacks), " << nb << " finite bounds, "
            << fx.numFixed() << " fixed variables removed\n"
            << "  Hessian of the Lagrangian: "
            << (user.hasExactHessian() ? "analytic" : "finite differences of the analytic gradient (2n gradient evaluations)") << "\n"
            << "  linear algebra: denseLDLT (Bunch-Kaufman), pivots below " << DenseLDLT::kZeroFraction
            << " of their column's scale are zero; solves refined, backward error limit " << kBackwardErrorLimit << "\n"
            << "  barrier update: monotone; globalization: filter; no second-order correction (slice A3)\n"
            << "  parameters:\n";
        par.print(*os);
    }

    //  Scaling (sec. 2.11, L1 sec. 3.8): f and each row scaled DOWN so that its
    //  gradient at the (pushed) start is at most g_max.
    std::unique_ptr<ScaledProblem> scaled;
    if (options.scaling)
    {
        sVector xl, xu;
        fx.variableBounds(xl, xu);
        if (options.relaxBounds) relaxBounds(xl, xu, par.boundRelax);
        sVector x0 = fx.startingPoint();
        pushInside(x0, xl, xu, par);
        sVector g;
        DenseMatrix J;
        if (fx.objectiveGradient(x0, g) && fx.constraintJacobian(x0, J))
        {
            const scalar gn = infNorm(g);
            scalar sf = gn > par.gMax ? par.gMax / gn : 1.0;
            sVector sc(J.size(), 1.0);
            std::size_t nScaled = 0;
            for (std::size_t j = 0; j < J.size(); ++j)
            {
                { const scalar jn = infNorm(J[j]); sc[j] = jn > par.gMax ? par.gMax / jn : 1.0; }
                if (sc[j] < 1.0) ++nScaled;
            }
            if (sf < 1.0 || nScaled > 0)
            {
                scaled = std::make_unique<ScaledProblem>(fx, sf, sc);
                core = scaled.get();
                if (os)
                    *os << "  scaling: objective x " << sci(sf) << ", " << nScaled
                        << " constraint rows scaled down (gradient above g_max = " << par.gMax << " at the start)\n";
            }
        }
    }

    IPOptions o = options;
    if (scaled) o.rowScale = &scaled->rowScale();
    IPResult core_r = InteriorPoint::algorithmA(*core, o);

    //  Map back to the caller's variables and rows.
    const scalar sf = scaled ? scaled->objectiveScale() : 1.0;
    IPResult r = core_r;
    const sVector xEq = fx.expand(core_r.x);
    r.x.assign(xEq.begin(), xEq.begin() + nUser);
    sVector xl, xu;
    user.variableBounds(xl, xu);
    for (std::size_t i = 0; i < nUser; ++i) r.x[i] = std::min(std::max(r.x[i], xl[i]), xu[i]);   //- honour the ORIGINAL bounds

    r.lambda.assign(mUser, 0.0);
    for (std::size_t j = 0; j < mUser && j < core_r.lambda.size(); ++j)
        r.lambda[j] = core_r.lambda[j] * (scaled ? scaled->rowScale()[j] : 1.0) / sf;
    //  Bound multipliers of the caller's variables (the free ones; a removed
    //  variable's multiplier is not computed and is reported 0).
    r.zLower.assign(nUser, 0.0);
    r.zUpper.assign(nUser, 0.0);
    {
        std::size_t k = 0;
        sVector l, u;
        eq.variableBounds(l, u);
        for (std::size_t i = 0; i < l.size(); ++i)
        {
            if (l[i] == u[i]) continue;                //- a removed variable
            if (i < nUser && k < core_r.zLower.size())
            {
                r.zLower[i] = core_r.zLower[k] / sf;
                r.zUpper[i] = core_r.zUpper[k] / sf;
            }
            ++k;
        }
    }
    scalar f = 0.0;
    sVector c;
    if (user.objective(r.x, f)) r.objective = f;
    r.constraintViolation = 0.0;
    if (user.constraints(r.x, c))
    {
        sVector cl, cu;
        user.constraintBounds(cl, cu);
        for (std::size_t j = 0; j < mUser; ++j)
            r.constraintViolation = std::max({r.constraintViolation, cl[j] - c[j], c[j] - cu[j]});
    }

    if (os)
    {
        *os << "Result: " << statusName(r.status) << " -- " << r.message << "\n"
            << "  iterations " << r.iterations << ", inertia corrections " << r.inertiaCorrections
            << ", restorations " << r.restorations << ", factorisations " << r.factorisations << "\n"
            << "  objective " << sci(r.objective) << ", constraint violation " << sci(r.constraintViolation)
            << ", E_0 (scaled) " << sci(r.kktError) << "\n";
        if (r.status == IPStatus::Converged)
        {
            *os << "  active bounds (multiplier > 1e-6, shadow price of the bound):\n";
            for (std::size_t i = 0; i < nUser; ++i)
            {
                if (r.zLower[i] > 1e-6) *os << "    " << user.variableName(i) << " >= " << sci(xl[i]) << "   z = " << sci(r.zLower[i]) << "\n";
                if (r.zUpper[i] > 1e-6) *os << "    " << user.variableName(i) << " <= " << sci(xu[i]) << "   z = " << sci(r.zUpper[i]) << "\n";
            }
            *os << "  constraint multipliers (shadow prices):\n";
            for (std::size_t j = 0; j < mUser; ++j)
                *os << "    " << user.constraintName(j) << "   lambda = " << sci(r.lambda[j]) << "\n";
        }
        for (const std::string& row : r.infeasibleRows) *os << "  violated: " << row << "\n";
    }
    return r;
}

} // namespace Choupo::solver
