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
    Choupo::solver::EulerSI

    Semi-implicit (linearly-implicit) Euler -- the "hello, stiffness" method.
    One Newton-like solve per step but NO iteration:

        (I - h J) * dy = h * f(y),     y <- y + dy

    Unconditionally stable (A-stable), so it survives a stiff system where
    explicit Euler/RK4 blow up; only first-order accurate, so it is the
    pedagogical stepping stone to the second-order Rosenbrock23, not the
    production solver.  Fixed step = ctrl.hInit (whole interval if <= 0).
\*---------------------------------------------------------------------------*/

#pragma once

#include "ODEIntegrator.H"

namespace Choupo::solver
{

class EulerSI : public ODEIntegrator
{
public:
    ODEStats integrate(sVector& y, scalar t0, scalar t1,
                       const DerivFn& f, const ODEControls& ctrl) const override;
    const std::string& name() const override { return name_; }

private:
    inline static const std::string name_ = "EulerSI";
};

} // namespace Choupo::solver
