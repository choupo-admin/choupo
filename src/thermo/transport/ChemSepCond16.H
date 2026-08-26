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
    Choupo::ChemSepCond16

Description
    Liquid thermal conductivity in ChemSep's equation form 16:

        k(T) = A + exp( B/T + C + D T + E T^2 )        [W/(m.K)]

    read from the component's own
    `liquidThermalConductivity { chemsepEq16 { A; B; C; D; E; Tmin; Tmax; } }`
    block, 420 of 431 imported records carrying it.

    IT IS THE SAME ALGEBRA AS ChemSepCp16 AND A DIFFERENT QUANTITY, and the
    two are deliberately NOT one class.  They live in different factories
    because a heat capacity and a thermal conductivity are selected
    separately, carry different units, and would have to be cast to each
    other to share code -- a shared base for "things shaped like eqno 16"
    would couple two model families through their arithmetic rather than
    their meaning.  Fourteen lines of duplicated `A + exp(...)` is the
    cheaper mistake.

    WHY THE PER-COMPONENT BLOCK DID NOT EXIST BEFORE.  SatoRiedel, the only
    liquid-conductivity model here until now, is PREDICTIVE: it needs MW, Tb
    and Tc and no fitted parameters at all.  Nothing had ever needed
    component-level conductivity data, so `Component` carried no accessor for
    it -- which is why this slice touches Component and the viscosity one did
    not.

SourceFiles
    ChemSepCond16.cpp

\*---------------------------------------------------------------------------*/

#pragma once

#include "LiquidConductivityModel.H"

namespace Choupo {

class ChemSepCond16 : public LiquidConductivityModel
{
public:
    explicit ChemSepCond16(const DictPtr& /*dict*/) {}

    const std::string& modelName() const override { return name_; }
    scalar conductivityLiquidPure(const Component& c, scalar T_K) const override;

private:
    inline static const std::string name_ = "chemsepEq16";
};

} // namespace Choupo
