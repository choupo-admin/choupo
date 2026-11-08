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
\*---------------------------------------------------------------------------*/

#include "SRK.H"

#include <memory>
#include <vector>

namespace Choupo {

namespace {
    // SRK universal constants.
    constexpr scalar OMEGA_A = 0.42747;
    constexpr scalar OMEGA_B = 0.08664;

    scalar soave_m(scalar omega)
    {
        //  THE SLOPE IS GRABOSKI & DAUBERT's REFIT, NOT SOAVE's PRINTED ONE
        //  (DEV.md 4c C131, family a -- an attribution correction; no number
        //  changed).  Soave, Chem. Eng. Sci. 27 (1972) 1197, printed
        //      m = 0.480 + 1.574 w - 0.176 w^2 ;
        //  the coefficients below are Graboski & Daubert, Ind. Eng. Chem.
        //  Process Des. Dev. 17 (1978) 443, refitted to API vapour pressures.
        //  They differ most for the LIGHT components: by 5.1e-3 in m at w = 0
        //  (CH4 4.8e-3, N2 4.2e-3, H2 at w = -0.22 1.1e-2), crossing near
        //  w = 0.32 and differing by 1.1e-3 at w = 0.6.  This comment used to
        //  credit Soave 1972, and the Theory Guide's footnote calls Soave's
        //  own form the "rounded" one, which inverts the history.  Whether to
        //  run Soave's form (the one a kij regressed on the original SRK was
        //  fitted with) is a model choice put to Vitor in the C131 report.
        return 0.48508 + 1.55171 * omega - 0.15613 * omega * omega;
    }

    std::vector<scalar> slopes(const std::vector<Component>& comps)
    {
        std::vector<scalar> m;
        m.reserve(comps.size());
        for (const auto& c : comps) m.push_back(soave_m(c.omega()));
        return m;
    }
}

SRK::SRK(const std::vector<Component>& comps,
         const std::vector<std::vector<scalar>>& kij)
  : CubicEoS("SRK", Constants{ OMEGA_A, OMEGA_B, 0.0, 1.0 }, comps,
             slopes(comps), kij)
{}

std::unique_ptr<EquationOfState>
SRK::fromDict(const DictPtr& eosDict, const std::vector<Component>& comps)
{
    return std::make_unique<SRK>(comps, readKij("SRK", eosDict, comps));
}

} // namespace Choupo
