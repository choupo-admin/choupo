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
    Generic scalar (1-D) Newton-Raphson root-finder with bracketed
    bisection fall-back.  Reused by every unit operation that has a
    single algebraic equation to solve.  A vector Newton (for n-D)
    will be added.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <functional>
#include <string>

namespace Choupo::solver {

struct NRTrace
{
    int    iteration;
    scalar x;
    scalar f;
    scalar dfdx;
    scalar dx;
};

struct NRResult
{
    scalar x;
    scalar residual;
    int    iterations;
    bool   converged;
};

struct NROptions
{
    scalar tolerance = 1.0e-8;
    int    maxIter   = 50;
    scalar lower     = 0.0;
    scalar upper     = 1.0;
    bool   bracket   = true;           // bisection fall-back if step exits bracket
    bool   monotoneIncreasing = false; // default: f decreasing (Rachford-Rice case)
    scalar maxStep   = 0.0;            // 0 => no damping; else |Δx| capped at maxStep
    std::function<void(const NRTrace&)> onIter;
};

NRResult newton1D(const std::function<scalar(scalar)>& f,
    const std::function<scalar(scalar)>& dfdx,
    scalar x0,
    const NROptions& opts
);

} // namespace Choupo::solver
