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
    Choupo::BrockBird

Description
    Brock-Bird (1955) corresponding-states estimate for the liquid surface
    tension, in the Reid-Prausnitz-Poling form ("The Properties of Gases
    and Liquids", 4th ed., eq. 12-3.5/12-3.6):

        sigma = Pc^(2/3) * Tc^(1/3) * Q * (1 - Tr)^(11/9)        [dyn/cm]
        Q     = 0.1196 * [ 1 + Tbr*ln(Pc/1.01325) / (1 - Tbr) ] - 0.279

    with Pc in bar, Tc in K, Tr = T/Tc, Tbr = Tb/Tc (Tb the normal boiling
    point).  1 dyn/cm = 1 mN/m = 1e-3 N/m -- the result is converted to
    SI [N/m].  Needs only Tc, Pc, Tb -- data every fluid component already
    carries; no surface-tension-specific datum.  Typical accuracy a few
    percent for non-polar / slightly polar liquids, worse for strongly
    hydrogen-bonded ones (water) -- which is exactly why water is routed to
    the IF97 R1-76 kernel instead when flagged as a pure fluid.
\*---------------------------------------------------------------------------*/

#pragma once

#include "thermo/SurfaceTensionModel.H"

namespace Choupo {

class BrockBird : public SurfaceTensionModel
{
public:
    explicit BrockBird(const DictPtr& /*dict*/) {}

    const std::string& modelName() const override { return name_; }
    scalar sigmaPure(const Component& c, scalar T_K) const override;

private:
    inline static const std::string name_ = "BrockBird";
};

} // namespace Choupo
