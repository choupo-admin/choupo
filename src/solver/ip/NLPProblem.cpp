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
    NLPProblem.cpp

Description
    The default Hessian of the Lagrangian (central differences of the analytic
    gradient) and the three reformulations declared in NLPProblem.H.
\*---------------------------------------------------------------------------*/

#include "solver/ip/NLPProblem.H"

#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace Choupo::solver
{

void NLPProblem::constraintBounds(sVector& cL, sVector& cU) const
{
    cL.assign(numConstraints(), 0.0);
    cU.assign(numConstraints(), 0.0);
}

namespace
{

//  g(x) = sigma grad f(x) + A(x)^T lambda, the gradient of the Lagrangian in x.
bool lagrangianGradient(const NLPProblem& p, const sVector& x, scalar sigma,
                        const sVector& lambda, sVector& g)
{
    sVector gf;
    DenseMatrix J;
    if (!p.objectiveGradient(x, gf) || !p.constraintJacobian(x, J)) return false;
    const std::size_t n = x.size();
    g.assign(n, 0.0);
    for (std::size_t i = 0; i < n; ++i) g[i] = sigma * gf[i];
    for (std::size_t j = 0; j < J.size(); ++j)
        for (std::size_t i = 0; i < n; ++i) g[i] += lambda[j] * J[j][i];
    //  A gradient holding NaN or inf is a failed evaluation, never a number to difference.
    for (std::size_t i = 0; i < n; ++i)
        if (!std::isfinite(g[i])) return false;
    return true;
}

} // namespace

bool NLPProblem::hessianLagrangian(const sVector& x, scalar sigma, const sVector& lambda,
                                   DenseMatrix& W) const
{
    //  Central differences of the analytic gradient of the Lagrangian:
    //  W[:, i] = (g(x_hi) - g(x_lo)) / (x_hi - x_lo), x_hi/lo = x +- h e_i,
    //  h = 1e-6 max(1, |x_i|) (truncation error h^2, round-off eps / h: both
    //  near 1e-10 of the gradient's scale), then symmetrised.  THE DIFFERENCE
    //  POINTS ARE CLAMPED TO THE BOUNDS (a point outside them is a point the
    //  problem may not be defined at: min x1 + x1^1.5 with x1 >= 0 gave NaN
    //  there), so next to a bound the difference is one-sided; a side whose
    //  gradient is not finite counts as a failed side and the other is used.
    sVector xL, xU;
    variableBounds(xL, xU);
    const std::size_t n = x.size();
    W.assign(n, sVector(n, 0.0));
    sVector g0;
    for (std::size_t i = 0; i < n; ++i)
    {
        const scalar h = 1.0e-6 * std::max(1.0, std::abs(x[i]));
        sVector xp = x, xm = x, gp, gm;
        xp[i] = std::min(x[i] + h, xU[i]);
        xm[i] = std::max(x[i] - h, xL[i]);
        const bool okp = xp[i] > x[i] && lagrangianGradient(*this, xp, sigma, lambda, gp);
        const bool okm = xm[i] < x[i] && lagrangianGradient(*this, xm, sigma, lambda, gm);
        if (okp && okm)
            for (std::size_t r = 0; r < n; ++r) W[r][i] = (gp[r] - gm[r]) / (xp[i] - xm[i]);
        else if (okp || okm)
        {
            if (g0.empty() && !lagrangianGradient(*this, x, sigma, lambda, g0)) return false;
            for (std::size_t r = 0; r < n; ++r)
                W[r][i] = okp ? (gp[r] - g0[r]) / (xp[i] - x[i]) : (g0[r] - gm[r]) / (x[i] - xm[i]);
        }
        else
            return false;
    }
    for (std::size_t r = 0; r < n; ++r)
        for (std::size_t c = 0; c < r; ++c) W[r][c] = W[c][r] = 0.5 * (W[r][c] + W[c][r]);
    return true;
}

// ---------------------------------------------------------------------------
//  EqualityForm
// ---------------------------------------------------------------------------

EqualityForm::EqualityForm(const NLPProblem& base)
    : base_(base), n_(base.numVariables()), m_(base.numConstraints())
{
    base.constraintBounds(cL_, cU_);
    rowSlack_.assign(m_, -1);
    for (std::size_t j = 0; j < m_; ++j)
        if (cL_[j] < cU_[j])
        {
            rowSlack_[j] = static_cast<long>(slackRow_.size());
            slackRow_.push_back(j);
        }
        else if (cL_[j] > cU_[j])
            throw std::runtime_error("NLPProblem: constraint row " + base.constraintName(j)
                                     + " has lower bound above its upper bound");
}

void EqualityForm::variableBounds(sVector& xL, sVector& xU) const
{
    base_.variableBounds(xL, xU);
    for (std::size_t j : slackRow_) { xL.push_back(cL_[j]); xU.push_back(cU_[j]); }
}

sVector EqualityForm::startingPoint() const
{
    sVector x = base_.startingPoint();
    sVector c;
    sVector s(slackRow_.size(), 0.0);
    //  The slacks are seeded with c(x0).  The user's start may lie outside the bounds (the
    //  collection's start of HS21 does), and a model may be undefined there: seed from the
    //  start CLAMPED to the bounds, so no evaluation is made outside them.
    sVector xl, xu;
    base_.variableBounds(xl, xu);
    sVector xc = x;
    for (std::size_t i = 0; i < n_; ++i) xc[i] = std::min(std::max(xc[i], xl[i]), xu[i]);
    if (!slackRow_.empty() && base_.constraints(xc, c))
        for (std::size_t k = 0; k < slackRow_.size(); ++k) s[k] = c[slackRow_[k]];
    x.insert(x.end(), s.begin(), s.end());
    return x;
}

bool EqualityForm::objective(const sVector& x, scalar& f) const
{
    return base_.objective(sVector(x.begin(), x.begin() + n_), f);
}

bool EqualityForm::objectiveGradient(const sVector& x, sVector& g) const
{
    if (!base_.objectiveGradient(sVector(x.begin(), x.begin() + n_), g)) return false;
    g.resize(x.size(), 0.0);
    return true;
}

bool EqualityForm::constraints(const sVector& x, sVector& c) const
{
    if (!base_.constraints(sVector(x.begin(), x.begin() + n_), c)) return false;
    for (std::size_t j = 0; j < m_; ++j)
        c[j] -= rowSlack_[j] >= 0 ? x[n_ + rowSlack_[j]] : cL_[j];
    return true;
}

bool EqualityForm::constraintJacobian(const sVector& x, DenseMatrix& J) const
{
    if (!base_.constraintJacobian(sVector(x.begin(), x.begin() + n_), J)) return false;
    for (std::size_t j = 0; j < m_; ++j)
    {
        J[j].resize(x.size(), 0.0);
        if (rowSlack_[j] >= 0) J[j][n_ + rowSlack_[j]] = -1.0;
    }
    return true;
}

bool EqualityForm::hessianLagrangian(const sVector& x, scalar sigma, const sVector& lambda,
                                     DenseMatrix& W) const
{
    DenseMatrix Wb;
    if (!base_.hessianLagrangian(sVector(x.begin(), x.begin() + n_), sigma, lambda, Wb)) return false;
    W.assign(x.size(), sVector(x.size(), 0.0));
    for (std::size_t i = 0; i < n_; ++i)
        for (std::size_t k = 0; k < n_; ++k) W[i][k] = Wb[i][k];
    return true;
}

std::string EqualityForm::variableName(std::size_t i) const
{
    if (i < n_) return base_.variableName(i);
    return "slack(" + base_.constraintName(slackRow_[i - n_]) + ")";
}

// ---------------------------------------------------------------------------
//  FixedVariables
// ---------------------------------------------------------------------------

FixedVariables::FixedVariables(const NLPProblem& base)
    : base_(base), n_(base.numVariables())
{
    sVector xL, xU;
    base.variableBounds(xL, xU);
    xFull_ = base.startingPoint();
    for (std::size_t i = 0; i < n_; ++i)
        if (xL[i] == xU[i]) xFull_[i] = xL[i];
        else free_.push_back(i);
}

sVector FixedVariables::expand(const sVector& xr) const
{
    sVector x = xFull_;
    for (std::size_t i = 0; i < free_.size(); ++i) x[free_[i]] = xr[i];
    return x;
}

void FixedVariables::variableBounds(sVector& xL, sVector& xU) const
{
    sVector l, u;
    base_.variableBounds(l, u);
    xL.clear();  xU.clear();
    for (std::size_t i : free_) { xL.push_back(l[i]); xU.push_back(u[i]); }
}

sVector FixedVariables::startingPoint() const
{
    sVector x;
    for (std::size_t i : free_) x.push_back(xFull_[i]);
    return x;
}

bool FixedVariables::objective(const sVector& x, scalar& f) const { return base_.objective(expand(x), f); }

bool FixedVariables::objectiveGradient(const sVector& x, sVector& g) const
{
    sVector gf;
    if (!base_.objectiveGradient(expand(x), gf)) return false;
    g.clear();
    for (std::size_t i : free_) g.push_back(gf[i]);
    return true;
}

bool FixedVariables::constraints(const sVector& x, sVector& c) const { return base_.constraints(expand(x), c); }

bool FixedVariables::constraintJacobian(const sVector& x, DenseMatrix& J) const
{
    DenseMatrix Jf;
    if (!base_.constraintJacobian(expand(x), Jf)) return false;
    J.assign(Jf.size(), sVector(free_.size(), 0.0));
    for (std::size_t j = 0; j < Jf.size(); ++j)
        for (std::size_t i = 0; i < free_.size(); ++i) J[j][i] = Jf[j][free_[i]];
    return true;
}

bool FixedVariables::hessianLagrangian(const sVector& x, scalar sigma, const sVector& lambda,
                                       DenseMatrix& W) const
{
    DenseMatrix Wf;
    if (!base_.hessianLagrangian(expand(x), sigma, lambda, Wf)) return false;
    W.assign(free_.size(), sVector(free_.size(), 0.0));
    for (std::size_t r = 0; r < free_.size(); ++r)
        for (std::size_t c = 0; c < free_.size(); ++c) W[r][c] = Wf[free_[r]][free_[c]];
    return true;
}

// ---------------------------------------------------------------------------
//  ScaledProblem
// ---------------------------------------------------------------------------

ScaledProblem::ScaledProblem(const NLPProblem& base, scalar objectiveScale, sVector rowScale)
    : base_(base), sf_(objectiveScale), sc_(std::move(rowScale))
{
}

void ScaledProblem::constraintBounds(sVector& cL, sVector& cU) const
{
    base_.constraintBounds(cL, cU);
    for (std::size_t j = 0; j < sc_.size(); ++j) { cL[j] *= sc_[j]; cU[j] *= sc_[j]; }
}

bool ScaledProblem::objective(const sVector& x, scalar& f) const
{
    if (!base_.objective(x, f)) return false;
    f *= sf_;
    return true;
}

bool ScaledProblem::objectiveGradient(const sVector& x, sVector& g) const
{
    if (!base_.objectiveGradient(x, g)) return false;
    for (scalar& v : g) v *= sf_;
    return true;
}

bool ScaledProblem::constraints(const sVector& x, sVector& c) const
{
    if (!base_.constraints(x, c)) return false;
    for (std::size_t j = 0; j < c.size(); ++j) c[j] *= sc_[j];
    return true;
}

bool ScaledProblem::constraintJacobian(const sVector& x, DenseMatrix& J) const
{
    if (!base_.constraintJacobian(x, J)) return false;
    for (std::size_t j = 0; j < J.size(); ++j)
        for (scalar& v : J[j]) v *= sc_[j];
    return true;
}

bool ScaledProblem::hessianLagrangian(const sVector& x, scalar sigma, const sVector& lambda,
                                      DenseMatrix& W) const
{
    //  sigma sf grad^2 f + sum (lambda_j sc_j) grad^2 c_j
    sVector lam(lambda.size());
    for (std::size_t j = 0; j < lam.size(); ++j) lam[j] = lambda[j] * sc_[j];
    return base_.hessianLagrangian(x, sigma * sf_, lam, W);
}

} // namespace Choupo::solver
