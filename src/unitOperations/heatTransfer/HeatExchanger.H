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
    Choupo::HeatExchanger

Description
    Two-stream heat exchanger, solved by the effectiveness-NTU method ---
    the classic RATING problem: given the hardware (area + overall
    coefficient U), what comes out?

    Hardware-only operation block (the credo): `area` and `U` (plus an
    optional `flow counter|co`).  The outlet temperatures, the duty Q and
    the LMTD are RESULTS, never specs.  "I need T_hot_out = X" is a
    DesignSpec that manipulates `$area` (or `$U`) with a target on this
    unit's T_hot_out KPI.

    This is the TWO-STREAM exchanger (heat moves between two process
    streams); the single-stream `heater` (a furnished duty Q on one
    stream) is a separate, simpler unit.  The split is by the number of
    process streams, not by folklore.

    Method (eps-NTU, sensible heat, no phase change):

        C_h = m_h Cp_h,   C_c = m_c Cp_c        (heat-capacity rates, W/K)
        C_min = min, C_max = max, C_r = C_min/C_max
        NTU   = U A / C_min
        counter:  eps = (1 - e^{-NTU(1-C_r)}) / (1 - C_r e^{-NTU(1-C_r)})
        co:       eps = (1 - e^{-NTU(1+C_r)}) / (1 + C_r)
        Q     = eps C_min (T_h,in - T_c,in)
        T_h,out = T_h,in - Q/C_h,   T_c,out = T_c,in + Q/C_c

    ASSUMPTIONS (glass-box --- stated, not hidden):
      1. sensible heat only, no phase change (constant Cp per stream,
         evaluated at the inlet);
      2. counter-current by default (`flow co;` for co-current);
      3. no heat loss to surroundings (Q_hot = Q_cold).

    Inputs (hot  cold );   outputs (hotOut  coldOut );
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitOperation.H"

namespace Choupo {

class HeatExchanger : public UnitOperation
{
public:
    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream>    producedStreams() const override { return produced_; }
    std::map<std::string, scalar> kpis()            const override { return kpis_; }
    std::optional<UnitProfile>    profile()         const override { return profile_; }

private:
    inline static const std::string type_ = "heatExchanger";
    std::vector<ProcessStream>       produced_;
    std::map<std::string, scalar>    kpis_;
    std::optional<UnitProfile>       profile_;
};

} // namespace Choupo
