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
    Choupo::Latini

Description
    Latini et al. estimation of saturated-liquid thermal conductivity
    (Reid-Prausnitz-Poling, eq. 10-9.2):

        λ_L = A · (1 − T_r)^0.38 / T_r^{1/6}     [W/(m·K)]
        A   = A* · T_b^α / (M^β · T_c^γ)

    The four constants (A*, α, β, γ) are CHEMICAL-FAMILY dependent; the
    defaults here are the saturated-hydrocarbon set (A* = 0.00350, α = 1.2,
    β = 0.5, γ = 0.167).  They are read from the model's own sub-block, so a
    different family --- or a FitParameters calibration to the student's
    data --- just overrides them:

        liquidConductivity { model Latini; Astar 0.0346; alpha 1.2;
                             beta 1.0; gamma 0.167; }   // alcohols, e.g.

    The second, knob-rich member of the selectable liquid-conductivity
    family (cf. Choupo::SatoRiedel, which is parameter-free).
\*---------------------------------------------------------------------------*/

#pragma once

#include "LiquidConductivityModel.H"

namespace Choupo {

class Latini : public LiquidConductivityModel
{
public:
    explicit Latini(const DictPtr& dict);

    const std::string& modelName() const override { return name_; }
    scalar conductivityLiquidPure(const Component& c, scalar T_K) const override;

private:
    inline static const std::string name_ = "Latini";
    scalar Astar_;
    scalar alpha_;
    scalar beta_;
    scalar gamma_;
};

} // namespace Choupo
