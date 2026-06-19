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
    Choupo::DesignReport

Description
    Equipment sizing as a report object.  Runs the `sizing` PostProcessor
    over the result (vessel diameters / heights / wall thickness, heat-
    exchanger areas,... from each unit's KPIs + design rules) and writes
    `reports/design/sizing.csv`.

    The block body is the same `units ( { unitName; type; material;
    designRules {... } }... );` list the legacy postDict `sizing {... }`
    used --- this report absorbs it, so the postDict file is no longer
    needed for a sizing pass.

        design
        {
            units ( { unitName reactor; type stirredTank; material SS316;
                      designRules { L_over_D 2.5; pressureDesign 3.0; } } );
        }
\*---------------------------------------------------------------------------*/

#pragma once

#include "Report.H"

namespace Choupo {

class DesignReport : public Report
{
public:
    const std::string& type() const override { return type_; }
    void run(const DictPtr& dict, const ReportContext& ctx) override;

private:
    inline static const std::string type_ = "design";
};

} // namespace Choupo
