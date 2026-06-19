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
    Choupo::Scheibel

Description
    Scheibel (1954) infinite-dilution liquid diffusivity --- a Wilke-Chang
    variant that drops the empirical solvent association factor φ in favour
    of the solvent/solute molar-volume ratio (Reid-Prausnitz-Poling, eq.
    11-9.5):

        D°_AB [cm²/s] = K · T / (η_B · V_A^{1/3})
        K = 8.2e-8 · [ 1 + (3 V_B / V_A)^{2/3} ]

        η_B : solvent viscosity [cP]   (passed in)
        V_A : solute molar volume  [cm³/mol]  (solute Vliq)
        V_B : solvent molar volume [cm³/mol]  (solvent Vliq)

    Returns m²/s.  The second, association-free member of the selectable
    liquid-diffusivity family (cf. Choupo::WilkeChang) --- useful when no
    reliable association factor is available.
\*---------------------------------------------------------------------------*/

#pragma once

#include "LiquidDiffusivityModel.H"

namespace Choupo {

class Scheibel : public LiquidDiffusivityModel
{
public:
    explicit Scheibel(const DictPtr& /*dict*/) {}

    const std::string& modelName() const override { return name_; }
    scalar diffusivityLiquidBinary(const Component& solute,
                                   const Component& solvent,
                                   scalar T_K,
                                   scalar muSolvent_PaS) const override;

private:
    inline static const std::string name_ = "Scheibel";
};

} // namespace Choupo
