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

/*---------------------------------------------------------------------------*\
  Joback — the Joback & Reid (1987) first-order group-contribution method,
  tabulated in Poling, Prausnitz & O'Connell, "The Properties of Gases and
  Liquids", 5th ed., Table 2-2.  Sums each group's tabulated contribution into
  Tb, Tc, Pc, Vc, dHf, dGf, Hvap and the ideal-gas Cp polynomial; omega is then
  backed out by the Lee-Kesler correlation from (Tb, Tc, Pc).
\*---------------------------------------------------------------------------*/

#ifndef Choupo_Joback_H
#define Choupo_Joback_H

#include "ConstantEstimator.H"

namespace Choupo {

class Joback : public ConstantEstimator
{
public:
    std::string method() const override
    {
        return "Joback group contribution (Joback & Reid 1987)";
    }
    ConstantEstimate estimate(const std::vector<GroupSpec>& groups,
                              bool& ok, std::string& error) const override;
    std::vector<std::string> knownGroups() const override;
};

} // namespace Choupo

#endif
