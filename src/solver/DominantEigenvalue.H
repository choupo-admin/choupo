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
Class
    Choupo::solver::DominantEigenvalue

Description
    The dominant eigenvalue method (DEM) for promoting the convergence of a
    fixed-point iteration

        X_{n+1} = F(X_n)

    beside Wegstein.  Implemented FROM THE PAPER: O. Orbach and C. M. Crowe,
    "Convergence promotion in the simulation of chemical processes with
    recycle -- the dominant eigenvalue method", Can. J. Chem. Eng. 49 (1971)
    509-513.  Equation and page numbers below are that paper's (the text
    below is Choupo's own wording, not the paper's).

    THE METHOD (p. 510).  Linearise the iteration, X_{n+1} = A X_n + b (Eq 9).
    If the largest eigenvalue lambda_1 of A has |lambda_1| < 1 (Eq 11), the
    iteration eventually becomes a geometric progression in the distance to
    the solution,

        X_n - X_s = c_1 Z_1 lambda_1^n                          (Eq 15)

    so the successive differences obey  dX_{n-1} = X_n - X_{n-1}
    = c_1 Z_1 (lambda_1 - 1) lambda_1^{n-1}                    (Eq 16).
    Whether Eq 15 holds is TESTED, not assumed: the apparent lambda_1 is
    the ratio of norms ||dX_n|| / ||dX_{n-1}|| = |lambda_1|     (Eq 17); if
    SUCCESSIVE apparent values are sufficiently close, Eq 15 is taken to
    hold.  The sign of lambda_1 comes from the ratio of components of dX_n
    and dX_{n-1} (p. 510).  The apparent solution is then

        X_s' = X_{n-1} + alpha (X_n - X_{n-1}) / (1 - lambda_1)  (Eq 18)

    with 0 < alpha <= 1 a damping factor "to suppress oscillation"; for
    lambda_1 < 0 the correction aims between X_n and X_{n-1}.  In this class
    X_{n-1} is the iterate x handed to step() and X_n = g(x) = gx.  At
    alpha = 1 Eq 18 equals g + lambda/(1-lambda) (g - x): EXACT in one step
    for a linear map whose error lies on one eigenvector (what the gate
    recomputes).  The algorithm (p. 511): iterate by direct substitution
    until Eq 15 is obeyed, make the move of Eq 18, "continue for at least
    three more iterations or until Eq 15 is again obeyed", and move again.
    A move disturbs the iteration, so a few direct steps are needed to regain
    the geometric progression.  The paper's runs (p. 511-512) took Eq 15 as
    obeyed when two successive apparent lambda_1 agreed within 0.5 % (the
    alkylation plant) and 1 % (the distillation column), and used
    alpha = 0.7 in both.  It also gives the TRUE error of the current
    iterate from the fractional change theta_n (Eqs 19-21):
    delta_n = theta_n |lambda_1| / (1 - lambda_1); note the paper's own
    numerical example for lambda_1 = -0.95 (theta = delta/0.90) does not
    follow from its Eq 21 (which gives delta/0.49), so Choupo prints the
    Eq-21 factor only for lambda_1 > 0 and never uses it to decide anything.

    WHAT IS TAKEN FROM THE PAPER, AND WHAT IS NOT.
      From the paper: Eq 17 (norm ratio), the sign from the components,
      the consistency test on successive lambda (default 1 %, the paper's
      looser value, declared as `recycleDELambdaTol`), Eq 18 with alpha
      (default 0.7, the paper's value, `recycleDEDamping`), the "at least
      three more iterations" rule (fixed, below), applying the move whenever
      the test is met.
      NOT in the paper, added here, each derived:
      (a) |lambda| <= lambdaMax (default 0.9, `recycleDELambdaMax`).  Eq 11
          requires |lambda_1| < 1 for the iteration to converge and Eq 18
          divides by 1 - lambda: as lambda -> 1 the correction is unbounded
          (the paper itself warns the correction "is large" there).  A
          measured lambda above the bound is not extrapolated.
      (b) the SIGN rule.  The paper reads the sign off "the ratio of
          components"; with a vector of unequal components that ratio is not
          one number, so the sign is that of <dX_n, dX_{n-1}> (the projection
          of one difference on the other), which equals the componentwise
          ratio's sign when the differences are parallel.
      (c) |cos(dX_n, dX_{n-1})| >= minCosine (default 0.9,
          `recycleDEMinCosine`).  The paper (Appendix B, p. 512-513)
          treats a COMPLEX dominant pair: the norm ratio still gives |lambda|
          but the differences ROTATE, and Eq 18 is then wrong; the paper's
          remedy needs iterates a half-period apart and is NOT implemented
          here.  Rotating differences make the cosine fall, so the move is
          refused (announced) rather than taken in a wrong direction.  A
          repeated dominant eigenvalue (Appendix A) is approached more
          slowly and passes the same tests when it does show a geometric
          progression.
      (d) the iterate counter restarts after every move (the moved point is
          not on the direct-substitution trajectory, and a ratio of two
          differences that straddle the move is meaningless); that is how
          "at least three more iterations" is realised: three differences
          (one apparent lambda from each of two consecutive pairs) are the
          least that can show two successive lambda close.
    Every move and every refusal is recorded in note(); the flowsheet loop
    prints it (a solver aid reports aloud).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <cstddef>
#include <functional>
#include <memory>
#include <string>

namespace Choupo::solver {

// The numbers the aid carries, each declared in solverDict (announced when
// defaulted by the caller).
struct DominantEigenvalueOptions
{
    scalar lambdaMax  = 0.9;    // (a) bound on |lambda|
    scalar minCosine  = 0.9;    // (c) parallel-differences bound
    scalar lambdaTol  = 0.01;   // paper p. 511: successive lambda within 0.5-1 %
    scalar alpha      = 0.7;    // paper Eq 18 damping, p. 511-512
};

// The common face of a recycle accelerator over the tear vector.
class FixedPointAccelerator
{
public:
    using Factory = std::function<std::unique_ptr<FixedPointAccelerator>(
        std::size_t n, const DominantEigenvalueOptions& o)>;
    virtual ~FixedPointAccelerator() = default;

    // x = current iterate, gx = g(x); returns the next iterate.
    virtual sVector step(const sVector& x, const sVector& gx) = 0;
    // One line describing what the LAST step did ("" = nothing to say).
    virtual std::string note() const { return std::string(); }

    static void registerType(const std::string& name, Factory f);
    static bool isRegistered(const std::string& name);
    static std::string registeredList();
    static std::unique_ptr<FixedPointAccelerator>
        New(const std::string& name, std::size_t n,
            const DominantEigenvalueOptions& o);
    static void registerBuiltins();
};

class DominantEigenvalue : public FixedPointAccelerator
{
public:
    DominantEigenvalue(std::size_t n, const DominantEigenvalueOptions& o);

    sVector step(const sVector& x, const sVector& gx) override;
    std::string note() const override { return note_; }

    int extrapolations() const { return nExtrap_; }
    int fallbacks()      const { return nFallback_; }

private:
    std::size_t n_;
    DominantEigenvalueOptions o_;
    sVector     dPrev_;
    int         count_ = 0;          // direct steps since the last move
    bool        haveLambda_ = false;
    scalar      lambdaPrev_ = 0.0;
    int         nExtrap_ = 0, nFallback_ = 0;
    std::string note_;
};

} // namespace Choupo::solver
