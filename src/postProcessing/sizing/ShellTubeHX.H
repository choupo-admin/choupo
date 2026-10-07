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
        T_in, T_out      — process temperatures [K]   (route 2 only)
        area, U, LMTD    — a rated unit's own values  (route 3 only)
    Inputs (from designRules), ONE of four routes:
        1. U + LMTD      — both author-set [W/(m²·K)], [K]
        2. U + utility   — U author-set; the LMTD computed counter-current
                           from the unit's T_in/T_out and the named utility
                           record's T_in/T_out (declaring LMTD too refuses)
        3. neither       — a rated exchanger: its own published `area`
                           passed through (refuses if it publishes none)
        4. design {}     — a Kern thermal and hydraulic DESIGN (2026-10-07,
                           DEV.md 4c C48): the bundle and the fouling
                           declared, the tube count SOLVED, U a result, the
                           films from htc/ShellTubeDesign (the kernel the
                           heatExchanger unit uses); `U`/`LMTD` beside it
                           refuse.  See ShellTubeHX.cpp, "ROUTE 4".
        pressureDesign   — design pressure [bar], every route
        material         — already passed in

    Output:
        A = Q / (U · LMTD) [m²], the unit's own area on route 3, or the
        INSTALLED area of the design on route 4 (with the whole design)
        approximate weight (TEMA shell + tubes scaled from Turton charts)
\*---------------------------------------------------------------------------*/

#pragma once

#include "EquipmentSize.H"

#include <vector>

namespace Choupo {

class ShellTubeHX : public EquipmentSize
{
public:
    const std::string& type() const override { return type_; }

    std::vector<EquipmentSizing> size(const std::string& unitName,
        const SimulationResult& result,
        const Material&         material,
        const DictPtr&          designRules) const override;

    //  THE EXCHANGER RULE, REACHABLE BY A UNIT THAT IS NOT A HEATER.
    //
    //  `size()` above resolves the duty from the `Q_kW` KPI a heater
    //  publishes and then applies A = Q/(U*LMTD) with the author's U and
    //  LMTD.  A distillation column publishes TWO duties under two other
    //  names (`Q_condenser_kW`, `Q_reboiler_kW`) and realises TWO
    //  exchangers, so `ColumnSize` must reach the same rule with a duty it
    //  resolved itself.
    //
    //  Writing A = Q/(U*LMTD) a second time inside `ColumnSize` would be a
    //  second home for the correlation, the shell weight, the basis sentence
    //  and the five declared units -- and the two would drift the first time
    //  either was touched.  The rule lives HERE, once; `size()` is the
    //  KPI-resolving door onto it and this is the duty-resolving one.
    //
    //  `Q_kW` is signed as the unit published it (a condenser's duty is
    //  negative); the area uses its magnitude, exactly as `size()` does.
    static EquipmentSizing sizeFromDuty(const std::string& unitName,
        scalar                  Q_kW,
        const Material&         material,
        const DictPtr&          designRules);

private:
    inline static const std::string type_ = "shellTubeHX";
};

} // namespace Choupo
