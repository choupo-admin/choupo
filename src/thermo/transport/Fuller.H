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
    Choupo::Fuller

Description
    Fuller-Schettler-Giddings (1966) correlation for low-pressure binary
    gas diffusivity (Reid-Prausnitz-Poling, "The Properties of Gases and
    Liquids", 4th ed., eq. 11-4.4):

        D_AB = 1.43e-7 · T^1.75
               ─────────────────────────────────────────         [m²/s]
               P · M_AB^0.5 · ( Σv_A^{1/3} + Σv_B^{1/3} )²

        M_AB = 2 / (1/M_A + 1/M_B)                  [g/mol]
        P    in bar,   T in K,   Σv = diffusion volume [-]

    The diffusion volume Σv is a tabulated per-component constant (sum of
    atomic increments), carried on each Component as `diffusionVolume`.
    The simplest accurate gas-diffusivity correlation --- reproduces
    water-vapour-in-air D ≈ 2.5e-5 m²/s at 298 K, 1 bar.  (Chapman-Enskog,
    needing Lennard-Jones σ and ε/k, is a later, data-hungrier model.)
\*---------------------------------------------------------------------------*/

#pragma once

#include "DiffusivityModel.H"

namespace Choupo {

class Fuller : public DiffusivityModel
{
public:
    explicit Fuller(const DictPtr& /*dict*/) {}

    const std::string& modelName() const override { return name_; }
    scalar diffusivityGasBinary(const Component& a, const Component& b,
                                scalar T_K, scalar P_Pa) const override;

private:
    inline static const std::string name_ = "Fuller";
};

} // namespace Choupo
