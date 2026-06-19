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
    Choupo::BubblePoint

Description
    Bubble-T calculation:  given liquid composition x and pressure P,
    find T such that  Σ K_i(T, x) · x_i = 1  (the first vapour bubble).

    With ideal solution (γ = 1) the equation is monotone in T and is
    solved by a 1-D Newton-Raphson with bracket bisection fall-back.
    With NRTL/Wilson, the activity coefficients are evaluated at the
    *given* x (which does not change during the search), so the residual
    is still a one-variable function f(T).

    Bubble-P  (given x and T, find P)  would be analogous and is omitted
    here for brevity; in the Raoult limit it is simply
        P = Σ x_i γ_i(x,T) Psat_i(T)
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/UnitOperation.H"

#include <map>
#include <string>

namespace Choupo {

class BubblePoint : public UnitOperation
{
public:
    BubblePoint() = default;

    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::map<std::string, scalar> kpis() const override { return kpis_; }

    // Programmatic core, used internally by solve() and by clients that
    // need an in-process bubble-T evaluation without the UnitOperation
    // wrapper (notably BatchStill, which calls this once per RK4 stage
    // evaluation).  Returns the bubble temperature T_bubble and the
    // equilibrium vapour composition y.  Pass T_init = 0 to let the
    // routine pick a mole-fraction-weighted Tb guess.
    struct Result
    {
        scalar  T          = 0.0;   // bubble-point temperature  [K]
        sVector y;                  // vapour composition         [-]
        int     iterations = 0;
        bool    converged  = false;
        scalar  residual   = 0.0;
    };

    static Result compute(const ThermoPackage& thermo,
                          const sVector&       x,
                          scalar               P,
                          scalar               T_init = 0.0);

private:
    inline static const std::string type_ = "bubbleT";
    std::map<std::string, scalar>   kpis_;
};

} // namespace Choupo
