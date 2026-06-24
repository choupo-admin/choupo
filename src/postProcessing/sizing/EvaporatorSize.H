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
    Choupo::EvaporatorSize

Description
    Sizing for an evaporator effect.  The characteristic size is the
    heat-transfer area A [m^2], which the evaporator unit-op already exposes
    as the `A_m2` KPI (the area required to pass the boiling duty at the
    declared U and dT).  No mechanical wall calculation is performed here:
    the evaporator cost correlation (Turton App. A) is a function of area
    alone, near-atmospheric, so F_P = 1 and the area maps straight through to
    the Guthrie cost.

    Inputs (from result.kpis[unitName]):
        A_m2             -- heat-transfer area [m^2]   (falls back to `A`)
    Inputs (from designRules):
        pressureDesign   -- design pressure [bar]      (default 1, near-atm)

    Validity range (Turton App. A "evaporator", A in [10, 1000] m^2) is
    enforced in Guthrie as a WARN-don't-clamp, preserving the extrapolation
    teaching point.
\*---------------------------------------------------------------------------*/

#pragma once

#include "EquipmentSize.H"

namespace Choupo {

class EvaporatorSize : public EquipmentSize
{
public:
    const std::string& type() const override { return type_; }

    EquipmentSizing size(const std::string&     unitName,
        const SimulationResult& result,
        const Material&         material,
        const DictPtr&          designRules) const override;

private:
    inline static const std::string type_ = "evaporator";
};

} // namespace Choupo
