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
    BarrierUpdate.cpp

Description
    The monotone barrier update, L1 eq. (7).  See BarrierUpdate.H.
\*---------------------------------------------------------------------------*/

#include "solver/ip/BarrierUpdate.H"

#include <algorithm>
#include <cmath>

namespace Choupo::solver
{

scalar MonotoneBarrierUpdate::next(scalar mu) const
{
    //  min(kappa_mu mu, mu^theta_mu): for mu above kappa_mu^(1/(theta_mu-1))
    //  (= 0.2^2 = 0.04) the linear term is the smaller; below it the power is.
    return std::max(floor(), std::min(p_.kappaMu * mu, std::pow(mu, p_.thetaMu)));
}

} // namespace Choupo::solver
