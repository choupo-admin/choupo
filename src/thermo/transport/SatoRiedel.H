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
    Choupo::SatoRiedel

Description
    Sato-Riedel estimation of saturated-liquid thermal conductivity:

        λ_L = (1.1053 / √M) · [3 + 20(1 − T_r)^(2/3)]
                            / [3 + 20(1 − T_br)^(2/3)]     [W/(m·K)]
        T_r = T / T_c,  T_br = T_b / T_c,  M in g/mol

    Uses ONLY MW, T_b, T_c (already on Component) --- zero new data.  Very
    good for organic liquids (~5 % on benzene/toluene), but it badly
    UNDER-predicts water (anomalous hydrogen bonding: ~0.30 vs the real
    ~0.61 W/m·K) --- a deliberate teaching contrast for why the model is
    selectable.

    SOURCE, said honestly: this code was transcribed from Reid, Prausnitz &
    Poling, The Properties of Gases and Liquids, 4th ed. (1987), eq. 10-9.1,
    which names the method Sato-Riedel and carries the primary attributions
    (Riedel's 1951 papers; Sato's form via the 3rd edition).  Those
    primaries were NOT re-read for this slice, and the citation says so
    rather than restating them as if they had been.

    THE ANCHOR THE EQUATION SUPPLIES.  At T = T_b the numerator equals the
    denominator, so λ_L(T_b) = 1.1053 / √M EXACTLY, whatever T_c -- the
    form is normalised at the normal boiling point.  verify() checks that;
    it is arithmetic (a property of the transcription), and says so.
\*---------------------------------------------------------------------------*/

#pragma once

#include "LiquidConductivityModel.H"

namespace Choupo {

class SatoRiedel : public LiquidConductivityModel
{
public:
    explicit SatoRiedel(const DictPtr& /*dict*/) {}

    const std::string& modelName() const override { return name_; }
    const std::string& validityWindow() const override { return window_; }
    const std::string& citation() const override { return cite_; }
    scalar conductivityLiquidPure(const Component& c, scalar T_K) const override;
    CorrelationVerify verify() const override;

    static scalar kernel(scalar M_g_per_mol, scalar Tc_K, scalar Tb_K,
                         scalar T_K);                          // W/(m K)

private:
    inline static const std::string name_ = "SatoRiedel";
    inline static const std::string window_ =
        "saturated ORGANIC liquid, T < Tc (the (1 - Tr)^(2/3) term is "
        "undefined above); RPP reports it poor for water and other strongly "
        "hydrogen-bonded liquids, which is the teaching contrast it ships for";
    inline static const std::string cite_ =
        "Reid, Prausnitz & Poling, The Properties of Gases and Liquids, 4th "
        "ed. (1987), eq. 10-9.1 (the Sato-Riedel method) -- the ROUTE this "
        "code was transcribed from; its primary attributions were not "
        "re-read here and are not restated";
};

} // namespace Choupo
