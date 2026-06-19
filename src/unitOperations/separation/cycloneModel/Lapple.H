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
    Choupo::Lapple

Description
    Classic Lapple (1951) cyclone collection model.
        d50 = sqrt( 9 μ b / (2 π N_e v_i (ρ_p − ρ_g)) ),   b = D_c/4
        η(d) = 1 / (1 + (d50/d)^2)
    The grade-efficiency exponent is fixed at 2 by Lapple's residence-time
    argument.  Simple, transparent, the textbook default.  See Perry's
    Handbook; Coulson & Richardson vol. 2.
\*---------------------------------------------------------------------------*/

#pragma once

#include "CycloneModel.H"

namespace Choupo {

class Lapple : public CycloneModel
{
public:
    const std::string& type() const override { return type_; }
    scalar gradeEfficiency(scalar d, const CycloneContext& c) const override;
    scalar cutDiameter(const CycloneContext& c) const override;
private:
    inline static const std::string type_ = "Lapple";
};

} // namespace Choupo
