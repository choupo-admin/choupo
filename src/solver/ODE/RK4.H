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
    Choupo::solver::RK4

    Classical 4th-order explicit Runge-Kutta, fixed step.  The same scheme the
    batch reactors have always used (k1..k4, the 1/6 weighting), now behind the
    ODEIntegrator interface so it can be compared head-to-head with the stiff
    methods.  Fast and accurate on NON-stiff problems; on a stiff system it is
    stability-limited to tiny steps -- the lesson the stiffness meter makes
    visible.  Step = ctrl.hInit (whole interval if hInit <= 0).
\*---------------------------------------------------------------------------*/

#pragma once

#include "ODEIntegrator.H"

namespace Choupo::solver
{

class RK4 : public ODEIntegrator
{
public:
    ODEStats integrate(sVector& y, scalar t0, scalar t1,
                       const DerivFn& f, const ODEControls& ctrl) const override;
    const std::string& name() const override { return name_; }

private:
    inline static const std::string name_ = "RK4";
};

} // namespace Choupo::solver
