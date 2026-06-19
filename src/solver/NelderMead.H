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
Namespace
    Choupo::solver

Description
    Nelder-Mead simplex direct-search for unconstrained minimisation:

        minimise   f(x),     f: R^n -> R

    The algorithm maintains a simplex of n+1 vertices in R^n.  At each
    iteration it identifies the worst vertex and tries, in order:

        1. reflection      x_r = x_c + alpha (x_c - x_worst)
        2. expansion       x_e = x_c + gamma (x_r - x_c)         (if x_r good)
        3. contraction     x_o = x_c + rho   (x_worst - x_c)     (if x_r bad)
        4. shrink toward best                                    (last resort)

    where x_c is the centroid of all vertices except the worst.

    The classic coefficients are
        alpha = 1.0,  gamma = 2.0,  rho = 0.5,  sigma = 0.5.

    Stopping
        - simplex diameter ||x_i - x_best|| < tolX  for every i, OR
        - range of f over the simplex < tolF, OR
        - maxIter reached.

    Bounds (box constraints) are honoured by **clipping** any candidate
    vertex back into [lo, hi] before evaluation.  This is the simplest
    pedagogical choice; sophisticated handling (penalty, augmented
    Lagrangian) belongs in a future SQP/IP wrapper.

    No derivatives, no external library — fits the project's hand-rolled
    numerics policy.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <functional>
#include <string>

namespace Choupo::solver {

struct NMTrace
{
    int     iteration;
    sVector xBest;
    scalar  fBest;
    scalar  fWorst;
    scalar  simplexSize;     // max ||x_i - x_best||
    std::string move;        // "reflect" | "expand" | "contract" | "shrink" | "init"
};

struct NMResult
{
    sVector x;               // best vertex
    scalar  f;               // f at best vertex
    int     iterations;
    int     evaluations;
    bool    converged;       // true if tolX or tolF was satisfied
    std::string reason;      // human-readable stop reason
};

struct NMOptions
{
    // Stopping criteria
    scalar  tolX            = 1.0e-6;       // simplex diameter tolerance (relative to span(bounds))
    scalar  tolF            = 1.0e-6;       // f-range tolerance (relative to |fBest|)
    int     maxIter         = 200;

    // Standard Nelder-Mead coefficients
    scalar  alpha           = 1.0;          // reflection
    scalar  gamma           = 2.0;          // expansion
    scalar  rho             = 0.5;          // contraction
    scalar  sigma           = 0.5;          // shrink toward best

    // Initial simplex generation: along each axis,
    //   x_i = x0 + step_i * e_i,    step_i = simplexInitFactor * |x0_i|  (or absStep if x0_i == 0)
    scalar  simplexInitFactor = 0.05;
    scalar  absStep          = 0.01;

    // Per-iteration callback (for logging, CSV, plotting)
    std::function<void(const NMTrace&)> onIter;
};

// Run Nelder-Mead on f starting from x0, with optional bounds [lo, hi].
// If lo/hi are empty, the search is unconstrained; otherwise every
// evaluation point is clipped element-wise into [lo, hi].
NMResult nelderMead(const std::function<scalar(const sVector&)>& f,
    const sVector&                               x0,
    const sVector&                               lo,        // empty == no lower bound
    const sVector&                               hi,        // empty == no upper bound
    const NMOptions&                             opts);

} // namespace Choupo::solver
