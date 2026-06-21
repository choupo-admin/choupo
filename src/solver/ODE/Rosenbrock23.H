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
    Choupo::solver::Rosenbrock23

    L-stable, linearly-implicit, embedded 2(3) Rosenbrock pair -- the "ode23s"
    of Shampine & Reichelt (SIAM J. Sci. Comput. 18 (1997) 1), the same family
    OpenFOAM ships for stiff chemistry.  One step from (t, y, h), with
    d = 1/(2+sqrt2), e32 = 6+sqrt2, and W = I - h*d*J:

        k1 = W^{-1} ( f(t,y)              + h*d*Td )
        k2 = W^{-1} ( f(t+h/2, y+h/2 k1)  - k1 ) + k1
        y* = y + h*k2
        k3 = W^{-1} ( f(t+h, y*) - e32 (k2 - f2) - 2 (k1 - f1) + h*d*Td )
        err = (h/6) (k1 - 2 k2 + k3)

    ONE Jacobian + ONE LU factorisation of W per step, THREE back-solves --
    no Newton iteration, no BDF history.  Second-order accurate, third-order
    error estimate -> adaptive step.  Per-component error scaling, per-row
    positivity step-rejection, and a printed stiffness verdict (verbosity>=3).
\*---------------------------------------------------------------------------*/

#pragma once

#include "ODEIntegrator.H"

namespace Choupo::solver
{

class Rosenbrock23 : public ODEIntegrator
{
public:
    ODEStats integrate(sVector& y, scalar t0, scalar t1,
                       const DerivFn& f, const ODEControls& ctrl) const override;
    const std::string& name() const override { return name_; }

private:
    inline static const std::string name_ = "Rosenbrock23";
};

} // namespace Choupo::solver
