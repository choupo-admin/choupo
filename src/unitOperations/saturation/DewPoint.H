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
    Choupo::DewPoint

Description
    Dew-T calculation:  given vapour composition y and pressure P,
    find T such that  Σ y_i / K_i(T) = 1  (the first liquid drop).

    With non-ideal γ the K's depend on x, which is unknown a priori.
    We therefore wrap an outer composition loop (initial x = y) around
    the temperature search.  For ideal solution this collapses to one
    pass.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "solver/NewtonRaphson.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/UnitOperation.H"

#include <functional>
#include <string>

namespace Choupo {

class DewPoint : public UnitOperation
{
public:
    DewPoint() = default;

    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    //  THE SOLVER, REACHABLE WITHOUT THE UNIT.  Mirrors
    //  `BubblePoint::compute`, and exists for the same reason: a caller that
    //  needs a dew temperature -- the phase-envelope op is the first -- must
    //  not carry a second copy of the residual sum(y_i/K_i) = 1.  Two homes
    //  for one equation is the arity sin, and this one would drift silently:
    //  both copies would still converge, to slightly different curves.
    //
    //  `T_init = 0` lets the routine pick a mole-fraction-weighted Tb guess,
    //  exactly as the unit does.
    struct Result
    {
        scalar  T          = 0.0;   // dew-point temperature      [K]
        sVector x;                  // equilibrium liquid comp.   [-]
        int     outerIterations = 0;
        int     newtonIterations = 0;
        bool    converged  = false;
        scalar  compDelta  = 0.0;   // |dx|_2 at the last outer sweep
    };

    //  `onOuter(iteration, T, |dx|_2)` lets the UNIT keep its console trace
    //  and its residual history without the loop existing twice.  Absent, the
    //  routine is silent -- which is what the envelope op wants, since it
    //  calls this once per pressure step.
    using OuterTrace = std::function<void(int, scalar, scalar)>;

    static Result compute(const ThermoPackage& thermo,
                          const sVector&       y,
                          scalar               P,
                          scalar               T_init = 0.0,
                          const OuterTrace&    onOuter = nullptr,
                          const solver::NROptions* nroOverride = nullptr);

private:
    inline static const std::string type_ = "dewT";
};

} // namespace Choupo
