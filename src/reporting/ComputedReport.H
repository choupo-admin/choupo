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
    Choupo::ComputedReport

Description
    Computed post-processing variables.  Reads the flowsheetDict's
    top-level `variables {... }` block for entries of the COMPUTED form

        variables
        {
            A          100;                                  // plain $var (input)
            Q_total    { compute "evap1.Q + evap2.Q + evap3.Q"; unit kW; }
            economy    { compute "vapour_total.F / steam.F"; }
        }

    and evaluates each `compute` expression (via Choupo::evalExpr) AFTER the
    solve, against the SimulationResult.  Identifiers resolve in this order:

        <unit>.<kpi>     -- a KPI from result.kpis   (e.g. evap1.Q)
        <stream>.<field> -- T | P | F | vf           (e.g. feed.T)
        <name>           -- an earlier computed var, or a plain $variable

    Results are stored in `result.computed` (canonical SI) and written to
    `reports/computed/values.csv` (name, value SI, display value, unit).
    Plain (non-compute) variable entries are ignored here --- they are
    inputs the DesignSpec manipulates, not outputs.
\*---------------------------------------------------------------------------*/

#pragma once

#include "Report.H"

namespace Choupo {

class ComputedReport : public Report
{
public:
    const std::string& type() const override { return type_; }
    void run(const DictPtr& dict, const ReportContext& ctx) override;

private:
    inline static const std::string type_ = "computed";
};

} // namespace Choupo
