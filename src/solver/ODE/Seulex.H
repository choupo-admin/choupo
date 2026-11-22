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
    Choupo::solver::Seulex

Description
    SEULEX: extrapolation of the LINEARLY-IMPLICIT EULER method with variable
    order (Hairer & Wanner, "Solving Ordinary Differential Equations II",
    2nd ed., Springer 1996, Section IV.9; Deuflhard 1985 for the method).
    The default stiff integrator of OpenFOAM's chemistry.  Theory Guide,
    sec:seulex has the equations as implemented.

    One step of size H from (t, y):

      1. for each column j = 1, 2, ... take n_j sub-steps of h_j = H/n_j of
             (I - h_j J) d_m = h_j ( f(t_m, y_m) + h_j df/dt ),
             y_{m+1} = y_m + d_m,                       T_{j,1} = y_{n_j},
         n_j = 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64;
      2. extrapolate in h (Aitken-Neville, an expansion in powers of h):
             T_{j,l} = T_{j,l-1} + (T_{j,l-1} - T_{j-1,l-1}) / (n_j/n_{j-l+1} - 1);
         T_{j,j} has order j;
      3. the error of column j is err_j = |T_{j,j} - T_{j,j-1}| (scaled), and
         ORDER and STEP are chosen to minimise the work per unit step
         (convergence window: columns k-1, k, k+1 around the target order k).

    The point against Rosenbrock23 / Rodas4: the method is NOT a Rosenbrock
    method whose order conditions need the exact Jacobian in W.  Each
    sub-step is a consistent linearly-implicit Euler step for ANY matrix J: a
    stale Jacobian costs the accuracy of the step -- seen by the convergence
    monitor theta -- not the correctness of the extrapolated result, which the
    error estimate still bounds.  So J is rebuilt only when theta says it has
    aged (ODEControls::jacobianRedo), where Rodas4 builds one every step.
    W = I - h_j J is factored once per column and step (h_j changes with H).
\*---------------------------------------------------------------------------*/

#pragma once

#include "ODEIntegrator.H"

namespace Choupo::solver
{

class Seulex : public ODEIntegrator
{
public:
    ODEStats integrate(sVector& y, scalar t0, scalar t1,
                       const DerivFn& f, const ODEControls& ctrl) const override;
    const std::string& name() const override { return name_; }

private:
    //  No state across integrate() calls: everything is local, so one
    //  instance is safe under `solver { threads N; }`.
    std::string name_ = "seulex";
};

} // namespace Choupo::solver
