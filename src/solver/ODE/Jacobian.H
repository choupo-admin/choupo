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
    Jacobian.H

Description
    Finite-difference Jacobian J[i][j] = d f_i / d y_j of a packed
    derivative functor, with PER-COMPONENT perturbation so a trace radical at
    1e-10 and the bath gas at 1e0 are both differentiated meaningfully:

        eps_j = sqrt(machine_eps) * max(|y_j|, typ_j)

    Forward differences (n+1 functor evaluations): a linearly-implicit stiff
    solver tolerates an approximate Jacobian, so the cheaper one-sided formula
    is the right trade.  Also the partial w.r.t. t (df/dt), one extra eval --
    zero for autonomous chemistry but kept for generality.
\*---------------------------------------------------------------------------*/

#pragma once

#include "ODEIntegrator.H"
#include "solver/BlockTridiagonal.H"
#include "core/Types.H"

#include <vector>

namespace Choupo::solver
{

// J[i][j] = d f_i / d y_j by forward differences (f0 = f(t,y) supplied).
std::vector<sVector> fdJacobianODE(const DerivFn&  f,
                                   scalar          t,
                                   const sVector&  y,
                                   const sVector&  f0,
                                   const sVector&  typ);

//- The COLORED (Curtis-Powell-Reid) forward-difference Jacobian of a
//  DECLARED block-tridiagonal structure, returned as the three block bands
//  in block order, plus the entries of every NARROW border row (one that
//  reads at most three consecutive blocks, so each colored pass perturbs at
//  most one of its columns): narrowR[i][(b - first)*nv + k] is
//  d g_row / d y(block b, slot k) for narrow[i].  A WIDE border row sees the
//  SUM of a pass's perturbations and is not returned (the integrator closes
//  it by a directional difference).
struct ColoredODEJacobian
{
    BlockBands           bands;
    std::vector<sVector> narrowR;
    long                 evals = 0;   // f evaluations (nv * min(3, nBlocks))
};

ColoredODEJacobian fdJacobianODEColored(
    const DerivFn&                                   f,
    scalar                                           t,
    const sVector&                                   y,
    const sVector&                                   f0,
    const sVector&                                   typ,
    const ODEBlockStructure&                         s,
    const std::vector<ODEBlockStructure::BorderRead>& narrow);

// df/dt by a forward difference (zero for an autonomous f).
sVector fdDfDt(const DerivFn& f, scalar t, const sVector& y,
               const sVector& f0, scalar tScale);

} // namespace Choupo::solver
