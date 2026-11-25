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
    NLPProblem.H

Description
    The nonlinear program the interior-point optimizer solves, and three
    reformulations of it that the optimizer applies before it starts
    (docs/design/interior-point.md sec. 2.1, 2.11 and 3.2; Theory Guide
    sec:ip-barrier).

    THE PROBLEM.   min f(x)   s.t.   cL <= c(x) <= cU,   xL <= x <= xU
    with f and c twice differentiable.  A row with cL = cU is an equality, a
    row with cL < cU an inequality (either side may be infinite); a bound may
    be infinite.  Derivatives are the problem's: the gradient of f and the
    Jacobian of c analytic (the caller writes them), the Hessian of the
    Lagrangian
        W = sigma grad^2 f + sum_j lambda_j grad^2 c_j
    analytic too when the problem overrides hessianLagrangian() and says so
    with hasExactHessian(), otherwise FINITE DIFFERENCES OF THE ANALYTIC
    GRADIENT of the Lagrangian (central, 2n gradient evaluations).  The
    optimizer prints which of the two it used.  The objective weight sigma is
    1 in an ordinary step and 0 in the restoration phase, whose Hessian is
    that of the constraints alone.

    SIGN OF THE MULTIPLIERS.  The Lagrangian is f + lambda^T c (Wachter &
    Biegler 2006, eq. (4)), so the stationarity condition is
        grad f + A lambda - zL + zU = 0,    A = grad c  (n x m),
    with zL, zU >= 0 the multipliers of the lower and upper bounds.

    THE THREE REFORMULATIONS (each a NLPProblem over another one, so that the
    interior-point loop sees only equalities and simple bounds):
      EqualityForm      an inequality row cL <= c_j <= cU becomes
                        c_j(x) - s_j = 0 with the slack s_j in [cL, cU]
                        (L1 sec. 4); an equality row c_j = b becomes c_j - b = 0.
      FixedVariables    a variable with xL = xU is removed (L1 sec. 3.4).
      ScaledProblem     f and each c_j multiplied by a factor <= 1 chosen so
                        that no gradient at the start exceeds gMax (L1 sec. 3.8).
    L1 = Wachter & Biegler, Math. Prog. 106 (2006) 25-57, read as the
    preprint (design record sec. 1).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <cstddef>
#include <limits>
#include <string>
#include <vector>

namespace Choupo::solver
{

//- A bound that is not there.
constexpr scalar kInf = std::numeric_limits<scalar>::infinity();

//- Dense row-major matrix: M[i][j].
using DenseMatrix = std::vector<sVector>;

class NLPProblem
{
public:
    virtual ~NLPProblem() = default;

    virtual std::string name() const { return "nlp"; }

    virtual std::size_t numVariables() const = 0;     //- n
    virtual std::size_t numConstraints() const = 0;   //- m (rows of c, equalities and inequalities)

    //- Bounds on x; kInf / -kInf where absent.
    virtual void variableBounds(sVector& xL, sVector& xU) const = 0;

    //- Bounds on c(x); the default is c(x) = 0 on every row.
    virtual void constraintBounds(sVector& cL, sVector& cU) const;

    virtual sVector startingPoint() const = 0;

    //  Each evaluation returns false when it FAILS (a NaN, a thermodynamic
    //  routine that refuses, a log of a negative number); the optimizer
    //  rejects the trial point and halves the step (L1, after Algorithm A).
    virtual bool objective(const sVector& x, scalar& f) const = 0;
    virtual bool objectiveGradient(const sVector& x, sVector& g) const = 0;
    virtual bool constraints(const sVector& x, sVector& c) const = 0;
    //- J[j][i] = d c_j / d x_i, m rows of n.
    virtual bool constraintJacobian(const sVector& x, DenseMatrix& J) const = 0;

    //- W = sigma grad^2 f + sum_j lambda_j grad^2 c_j  (n x n, symmetric).
    //  Default: central finite differences of sigma grad f + A^T lambda.
    virtual bool hessianLagrangian(const sVector& x, scalar sigma, const sVector& lambda,
                                   DenseMatrix& W) const;
    virtual bool hasExactHessian() const { return false; }

    virtual std::string variableName(std::size_t i) const { return "x" + std::to_string(i + 1); }
    virtual std::string constraintName(std::size_t j) const { return "c" + std::to_string(j + 1); }
};

//- General rows -> equalities plus slacks.  Variables are (x, s) with one
//  slack per INEQUALITY row, appended after x; c'_j = c_j - b_j (equality) or
//  c_j - s_k (inequality), every c'_j = 0.
class EqualityForm : public NLPProblem
{
public:
    explicit EqualityForm(const NLPProblem& base);

    std::string name() const override { return base_.name(); }
    std::size_t numVariables() const override { return n_ + slackRow_.size(); }
    std::size_t numConstraints() const override { return m_; }
    void variableBounds(sVector& xL, sVector& xU) const override;
    sVector startingPoint() const override;
    bool objective(const sVector& x, scalar& f) const override;
    bool objectiveGradient(const sVector& x, sVector& g) const override;
    bool constraints(const sVector& x, sVector& c) const override;
    bool constraintJacobian(const sVector& x, DenseMatrix& J) const override;
    bool hessianLagrangian(const sVector& x, scalar sigma, const sVector& lambda,
                           DenseMatrix& W) const override;
    bool hasExactHessian() const override { return base_.hasExactHessian(); }
    std::string variableName(std::size_t i) const override;
    std::string constraintName(std::size_t j) const override { return base_.constraintName(j); }

    std::size_t numSlacks() const { return slackRow_.size(); }

private:
    const NLPProblem& base_;
    std::size_t n_, m_;
    sVector cL_, cU_;
    std::vector<std::size_t> slackRow_;   //- slackRow_[k] = the row of slack k
    std::vector<long>        rowSlack_;   //- rowSlack_[j] = slack index of row j, or -1
};

//- Removes the variables with xL = xU (their value is the bound).
class FixedVariables : public NLPProblem
{
public:
    explicit FixedVariables(const NLPProblem& base);

    bool any() const { return free_.size() != n_; }
    std::size_t numFixed() const { return n_ - free_.size(); }
    //- The full x from the reduced one.
    sVector expand(const sVector& xr) const;

    std::string name() const override { return base_.name(); }
    std::size_t numVariables() const override { return free_.size(); }
    std::size_t numConstraints() const override { return base_.numConstraints(); }
    void variableBounds(sVector& xL, sVector& xU) const override;
    void constraintBounds(sVector& cL, sVector& cU) const override { base_.constraintBounds(cL, cU); }
    sVector startingPoint() const override;
    bool objective(const sVector& x, scalar& f) const override;
    bool objectiveGradient(const sVector& x, sVector& g) const override;
    bool constraints(const sVector& x, sVector& c) const override;
    bool constraintJacobian(const sVector& x, DenseMatrix& J) const override;
    bool hessianLagrangian(const sVector& x, scalar sigma, const sVector& lambda,
                           DenseMatrix& W) const override;
    bool hasExactHessian() const override { return base_.hasExactHessian(); }
    std::string variableName(std::size_t i) const override { return base_.variableName(free_[i]); }
    std::string constraintName(std::size_t j) const override { return base_.constraintName(j); }

private:
    const NLPProblem& base_;
    std::size_t n_;
    sVector xFull_;                       //- the start, with the fixed values in place
    std::vector<std::size_t> free_;       //- free_[i] = original index of reduced variable i
};

//- f' = sf f and c'_j = sc_j c_j.  Multipliers of the scaled problem relate to
//  the original by lambda_j = lambda'_j sc_j / sf and z = z' / sf.
class ScaledProblem : public NLPProblem
{
public:
    ScaledProblem(const NLPProblem& base, scalar objectiveScale, sVector rowScale);

    scalar objectiveScale() const { return sf_; }
    const sVector& rowScale() const { return sc_; }

    std::string name() const override { return base_.name(); }
    std::size_t numVariables() const override { return base_.numVariables(); }
    std::size_t numConstraints() const override { return base_.numConstraints(); }
    void variableBounds(sVector& xL, sVector& xU) const override { base_.variableBounds(xL, xU); }
    void constraintBounds(sVector& cL, sVector& cU) const override;
    sVector startingPoint() const override { return base_.startingPoint(); }
    bool objective(const sVector& x, scalar& f) const override;
    bool objectiveGradient(const sVector& x, sVector& g) const override;
    bool constraints(const sVector& x, sVector& c) const override;
    bool constraintJacobian(const sVector& x, DenseMatrix& J) const override;
    bool hessianLagrangian(const sVector& x, scalar sigma, const sVector& lambda,
                           DenseMatrix& W) const override;
    bool hasExactHessian() const override { return base_.hasExactHessian(); }
    std::string variableName(std::size_t i) const override { return base_.variableName(i); }
    std::string constraintName(std::size_t j) const override { return base_.constraintName(j); }

private:
    const NLPProblem& base_;
    scalar sf_;
    sVector sc_;
};

} // namespace Choupo::solver
