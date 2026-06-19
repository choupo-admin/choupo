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
    Choupo::UtilityAllocationReport

Description
    The "Q + end-allocation" report (controlDict reports { utilityAllocation
    { } }).  It reads each unit's DUTY (the `Q` KPI, + = heating, - =
    cooling) and ALLOCATES it to a plant utility chosen by temperature
    level --- utility targeting, the pinch-analysis way:

      * a heating duty at process T needs a heating utility hot enough
        (T_in >= T + dTmin);
      * a cooling duty needs a coolant cold enough (T_in <= T - dTmin);
      * among the feasible utilities, the one with the TIGHTEST temperature
        margin is picked (the lowest-grade service that still works ---
        don't waste HP steam on a low-T duty).

    For each allocated duty it converts |Q| into a utility MASS flow
    (|Q| / dutyPerKg), a thermal load (MW) and a cost (€/h, from the
    catalogue's €/GJ).  Totals are aggregated per utility.

    This is the SIMPLE default: heat stays a bare duty on the unit (no
    utility stream wired into the flowsheet); the utilities are sized once,
    at the end, from the duties.  Genuine process streams that carry heat
    (a multi-effect's vapour) stay in the flowsheet as streams --- they are
    not duties and do not appear here.

    Option (in the report's sub-dict):
        dTmin   <K>;    minimum approach temperature (default 10 K)
\*---------------------------------------------------------------------------*/

#pragma once

#include "Report.H"
#include "core/SimulationResult.H"

#include <string>
#include <vector>

namespace Choupo {

// Size a plant utility for every unallocated heat duty by temperature
// level (the pinch-style pick), flagging duties already carried by a
// utility stream or a heat-link.  The single source of truth, called by
// the report (CSV/console) AND the application (to fill the result JSON so
// the GUI sees the same numbers).  `dTmin` is the minimum approach [K].
std::vector<UtilityAllocation>
allocateUtilities(const SimulationResult& result, const DictPtr& flowsheet, scalar dTmin = 10.0);

class UtilityAllocationReport : public Report
{
public:
    const std::string& type() const override { return type_; }
    void run(const DictPtr& dict, const ReportContext& ctx) override;

private:
    inline static const std::string type_ = "utilityAllocation";
};

} // namespace Choupo
