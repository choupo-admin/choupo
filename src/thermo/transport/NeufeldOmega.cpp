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
\*---------------------------------------------------------------------------*/

#include "NeufeldOmega.H"

#include <cmath>
#include <string>

namespace Choupo {
namespace neufeld {

scalar omega22(scalar Tstar)
{
    //  The three terms in the order the paper prints them.  Do NOT
    //  rearrange: ChungViscosity's goldens pin this expression as written.
    return 1.16145 / std::pow(Tstar, 0.14874)
         + 0.52487 / std::exp(0.77320 * Tstar)
         + 2.16178 / std::exp(2.43787 * Tstar);
}

const std::string& citation()
{
    static const std::string c =
        "Neufeld, P. D., Janzen, A. R. and Aziz, R. A. (1972), J. Chem. Phys. "
        "57(3), 1100-1102 -- Omega(2,2)* fit, stated by its authors for "
        "0.3 <= T* <= 100";
    return c;
}

} // namespace neufeld
} // namespace Choupo
