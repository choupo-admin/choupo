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
    Choupo::ShellTubeHX

Description
    Sizing for a shell-and-tube heat exchanger (TEMA style).

    Inputs (from result.kpis[unitName]):
        Q_kW             — duty [kW]
    Inputs (from designRules):
        U                — overall heat-transfer coefficient [W/(m²·K)]
        LMTD             — log-mean temperature difference [K]
        pressureDesign   — design pressure [bar]
        material         — already passed in

    Output:
        A = Q / (U · LMTD)               [m²]
        approximate weight (TEMA shell + tubes scaled from Turton charts)
\*---------------------------------------------------------------------------*/

#pragma once

#include "EquipmentSize.H"

namespace Choupo {

class ShellTubeHX : public EquipmentSize
{
public:
    const std::string& type() const override { return type_; }

    EquipmentSizing size(const std::string&     unitName,
        const SimulationResult& result,
        const Material&         material,
        const DictPtr&          designRules) const override;

private:
    inline static const std::string type_ = "shellTubeHX";
};

} // namespace Choupo
