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
    Choupo::EvaporativeDryer

Description
    Free-moisture (constant-rate) dryer --- removes FREE SURFACE water from a
    wet solid by evaporation into a hot-air stream.  The honest counterpart of
    SolidDryer: where SolidDryer models a HYGROSCOPIC material whose moisture is
    GAB-sorbed (equilibrium isotherm, falling-rate), this models a NON-sorbing
    solid (a crystalline inorganic such as Li2CO3) whose moisture is free
    surface water --- there is NO equilibrium isotherm, so NO `sorption {}`
    block is required or consulted.

    Two real streams (information follows the streams; no phantom duty): a wet
    solid (crystals in s[] + free water in the fluid flow F) and a hot-air
    stream.  The air BRINGS the heat (its sensible cooling) and CARRIES AWAY
    the moisture (a humid exhaust).  Free water evaporates until the FIRST of
    three honest limits binds:

        (1) all free water is gone            (X_final -> 0);
        (2) the exhaust air reaches saturation (a_w -> a_w_max, default 0.95)
            --- the constant-rate air-capacity limit;
        (3) the air cannot supply the latent + sensible heat (energy floor):
            the solid leaves at the GAS'S WET-BULB temperature T_wb, this
            model's floor (C35 item 7, 2026-10-05; it was the solid's feed
            temperature T_w until then), and ONLY the water the air can pay
            for there evaporates,
            [F_air cp_air (T_air - T_wb) - C_s (T_wb - T_w)] / lambda(T_wb),
            C_s the heat capacity flow of the solid and its free water.

    The outlet T is the FIRST root of the balance above the floor and below
    the moisture's critical temperature: the Watson latent heat vanishes at
    Tc, so close below it the balance has a second, spurious root, which a
    plain bisection on [floor, T_air] reached for a hot gas (672.28 K on the
    lithium plant's 950 K flue gas, DEV.md C35 item 11).  An answer with no
    root below Tc is refused by name.

    Saturation and the adiabatic outlet T are COUPLED (evaporation cools the
    air, which lowers its carrying capacity): solved self-consistently by a
    bisection on the removed water, inside the evaporation the air can pay
    for.  The limit ANNOUNCED is the one that binds the answer (2026-10-05:
    it used to be the one that would have bound had ALL the water left).

    The energy balance is this unit's own hand surface (constant air Cp at
    the air's inlet T, a Watson latent heat), NOT the formation surface the
    energy report prices on: the crystals of its shipped cases carry no
    formation datum (a salt's is ion-derived), so the report refuses their
    energy balance.  A heat capacity it must DEFAULT is announced.

        inputs  ( wetSolid  hotAir );   outputs ( drySolid  humidExhaust );
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitOperation.H"

#include <map>

namespace Choupo {

class EvaporativeDryer : public UnitOperation
{
public:
    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream>    producedStreams() const override { return produced_; }
    std::map<std::string, scalar> kpis()            const override { return kpis_; }

private:
    inline static const std::string type_ = "evaporativeDryer";
    std::vector<ProcessStream>       produced_;
    std::map<std::string, scalar>    kpis_;
};

} // namespace Choupo
