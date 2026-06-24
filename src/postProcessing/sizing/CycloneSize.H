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
    Choupo::CycloneSize

Description
    Sizing for a gas-solid cyclone.  The characteristic size is the inlet
    volumetric gas flow Q_gas [m^3/s], exposed by the cyclone unit-op as the
    `Q_gas` KPI.  Costed with a single-anchor power-law
    (Cp = Cp_ref*(Q/Q_ref)^n, n ~ 0.7), near-atmospheric -> F_P = 1.

    Inputs (from result.kpis[unitName]):
        Q_gas            -- inlet volumetric gas flow [m^3/s]
    Inputs (carried through for the record):
        bodyDiameter [m] (if present)
\*---------------------------------------------------------------------------*/

#pragma once

#include "EquipmentSize.H"

namespace Choupo {

class CycloneSize : public EquipmentSize
{
public:
    const std::string& type() const override { return type_; }

    EquipmentSizing size(const std::string&     unitName,
        const SimulationResult& result,
        const Material&         material,
        const DictPtr&          designRules) const override;

private:
    inline static const std::string type_ = "cyclone";
};

} // namespace Choupo
