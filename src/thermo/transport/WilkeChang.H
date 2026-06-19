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
    Choupo::WilkeChang

Description
    Wilke-Chang (1955) infinite-dilution liquid diffusivity of solute A in
    solvent B (Reid-Prausnitz-Poling, eq. 11-9.1):

        D°_AB [cm²/s] = 7.4e-8 · (φ_B · M_B)^{1/2} · T
                                 / (η_B · V_A^{0.6})

        φ_B : solvent association factor (water 2.6, methanol 1.9,
              ethanol 1.5, unassociated 1.0) --- `associationFactor` on
              the solvent's.dat
        M_B : solvent molar mass [g/mol]
        η_B : solvent viscosity [cP]   (passed in, from the liquidViscosity model)
        V_A : solute molar volume at its normal boiling point [cm³/mol]
              (taken here from the solute's Vliq)

    Returns m²/s.  The default, association-aware member of the selectable
    liquid-diffusivity family; ~±15 % typical accuracy (e.g. ethanol in
    water at 25 °C: ~1.5e-9 vs the measured ~1.2e-9 m²/s).
\*---------------------------------------------------------------------------*/

#pragma once

#include "LiquidDiffusivityModel.H"

namespace Choupo {

class WilkeChang : public LiquidDiffusivityModel
{
public:
    explicit WilkeChang(const DictPtr& /*dict*/) {}

    const std::string& modelName() const override { return name_; }
    scalar diffusivityLiquidBinary(const Component& solute,
                                   const Component& solvent,
                                   scalar T_K,
                                   scalar muSolvent_PaS) const override;

private:
    inline static const std::string name_ = "WilkeChang";
};

} // namespace Choupo
