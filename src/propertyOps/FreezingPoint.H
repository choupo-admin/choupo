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
    Choupo::FreezingPoint

Description
    Freezing-point curve T_f(m) of a single salt in water -- and THE WITNESS
    for the crystallising SolidPhase.  The equilibrium condition is chemical-
    potential equality between ICE and the solution's water:

        f_solid(T)  =  a_w(m, T) * Psat(T)

    The LEFT side is computed by an actual SolidPhase instance -- the same
    fEffective every future flash will call -- so this op is the first
    case-reachable consumer of the crystal (until now it was exercised only
    by check_ice_freezing's probe).  The RIGHT side is the Pitzer salt
    surface's water activity.  Dividing by Psat, the condition is the
    textbook  ln a_w = -dG_fus(T)/(R T),  but it is deliberately NOT coded
    that way: routing through SolidPhase means its refusals (no Hfus, no
    triple point) and its announced approximations (the neglected liquid/
    solid heat-capacity term; the sub-freezing Psat extrapolation) all fire
    on a real case.

    Solved by bisection on T in [Tt - 45 K, Tt + 0.5 K] per molality; a grid
    point whose bracket holds no root is REFUSED by name -- physically, the
    model has been pushed past any meaning (toward/beyond the eutectic the
    single-salt model does not contain), and continuing would print a number
    with no equilibrium behind it.

    Diagnostics: T_f and the depression at the grid ends, the dilute-limit
    slope against nu*K_f (water's DERIVED cryoscopic constant -- the closed
    loop: K_f was promoted on the condition that a consumer exist, SolidPhase
    became the consumer, and this op ties the two together on a case), and
    the AAD against a measured dataset via the standard `validation {}`
    block.

    Dictionary form:
        {
            name      fpd_nacl;
            type      freezingPoint;
            cation    Na;   anion Cl;
            molality  { from 0.1; to 2.0; n 20; }
            validation { dataset "constant/experiments/...dat"; series nacl; }
            output    { file fpd_nacl.csv; }
        }
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <string>

namespace Choupo {

class FreezingPoint : public PropertyOperation
{
public:
    const std::string& type() const override
    { static const std::string t = "freezingPoint"; return t; }

    int run(const DictPtr& dict, const ThermoPackage& thermo,
            int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override
    { return diag_; }

private:
    std::map<std::string, scalar> diag_;
};

} // namespace Choupo
