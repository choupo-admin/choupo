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
    Dominant-eigenvalue extrapolation of a fixed-point iteration

        x_{k+1} = g(x_k)

    beside Wegstein.  SOURCE, stated honestly: Orbach & Crowe, Can. J. Chem.
    Eng. 49 (1971) 509 (the method), generalised by Crowe, AIChE J. 21 (1975)
    (GDEM).  Neither paper could be fetched when this file was written (the
    thesis scan was access-denied), so NOTHING below is typed from the paper:
    every formula and every safeguard is DERIVED here, and the gate holds the
    derivation to a recomputation.

    DERIVATION.  Near the fixed point x*, g(x) ~ x* + J (x - x*).  The error
    e_k = x_k - x* obeys e_{k+1} = J e_k, so the DIRECT-SUBSTITUTION
    differences d_k = x_{k+1} - x_k = J^k d_0 are the power-method sequence of
    J: for large k, d_{k+1} ~ lambda d_k with lambda the dominant eigenvalue.
    Least-squares estimate of lambda from two consecutive differences

        lambda = <d_k, d_{k-1}> / <d_{k-1}, d_{k-1}>

    (the Rayleigh-quotient form of the power-method ratio; it equals the
    signed norm ratio ||d_k||/||d_{k-1}|| when d_k is parallel to d_{k-1}).
    If only that mode survives, the remaining path is the geometric series
    d_k (lambda + lambda^2 + ...) = d_k lambda/(1 - lambda), so

        x* ~ g(x_k) + lambda/(1 - lambda) d_k     (EXACT in one step for a
                                                   linear map with one mode
                                                   excited)

    SAFEGUARDS, each derived rather than recalled:
      (1) three consecutive DIRECT points are required (two differences);
          an extrapolated point is not on the iteration's trajectory, so the
          history restarts after every extrapolation.
      (2) at least `interval` direct steps between two extrapolations; with a
          mode that is not yet isolated the estimate is noise, and a few
          power-method steps are what isolates it.
      (3) |lambda| <= lambdaMax (< 1): lambda -> 1 makes lambda/(1-lambda)
          unbounded (a divide by a small number), and lambda >= 1 means the
          map does not contract, so extrapolating is nonsense.  The bound is
          symmetric, so an oscillating map (lambda < 0) is accepted.
      (4) |cos(d_k, d_{k-1})| >= minCosine: the projection estimate is the
          ratio only if d_k is parallel to lambda d_{k-1}; a low cosine says
          SEVERAL modes are alive and a one-mode extrapolation would be
          wrong.  Fallback is direct substitution.
      (5) differences above a floor, or lambda is 0/0.
    Every extrapolation and every fallback is recorded in note(); the
    flowsheet loop prints it (a solver aid reports aloud).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <cstddef>
#include <functional>
#include <memory>
#include <string>

namespace Choupo::solver {

// The common face of a recycle accelerator over the tear vector.
class FixedPointAccelerator
{
public:
    // (n, a, b): a = lambdaMax, b = minCosine for DominantEigenvalue.
    using Factory = std::function<std::unique_ptr<FixedPointAccelerator>(
        std::size_t n, scalar a, scalar b)>;
    virtual ~FixedPointAccelerator() = default;

    // x = current iterate, gx = g(x); returns the next iterate.
    virtual sVector step(const sVector& x, const sVector& gx) = 0;
    // One line describing what the LAST step did ("" = nothing to say).
    virtual std::string note() const { return std::string(); }

    static void registerType(const std::string& name, Factory f);
    static bool isRegistered(const std::string& name);
    static std::string registeredList();
    static std::unique_ptr<FixedPointAccelerator>
        New(const std::string& name, std::size_t n, scalar a, scalar b);
    static void registerBuiltins();
};

class DominantEigenvalue : public FixedPointAccelerator
{
public:
    DominantEigenvalue(std::size_t n, scalar lambdaMax = 0.9,
                       scalar minCosine = 0.9, int interval = 3);

    sVector step(const sVector& x, const sVector& gx) override;
    std::string note() const override { return note_; }

    int extrapolations() const { return nExtrap_; }
    int fallbacks()      const { return nFallback_; }
    scalar lastLambda()  const { return lambda_; }

private:
    std::size_t n_;
    scalar      lambdaMax_;
    scalar      minCosine_;
    int         interval_;
    sVector     dPrev_;
    bool        havePrev_ = false;
    int         sinceExtrap_ = 0;
    int         nExtrap_ = 0, nFallback_ = 0;
    scalar      lambda_ = 0.0;
    std::string note_;
};

} // namespace Choupo::solver
