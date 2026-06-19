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
    Choupo::SweepDriver

Description
    1-D sensitivity sweep over one design variable.  Reads:

        type        sweep;
        parameter
        {
            target   units[0].operation.refluxRatio;
            range    ( 1.5  5.0 );
            nPoints  10;
        }
        responses (column01.T_top  column01.T_bottom  column01.V_strip );
        report
        {
            format   csv;
            file     sweep_results.csv;
        }

    For each value in the grid, the driver:
       1. clones the flowsheetDict template;
       2. writes the target path to the new value;
       3. runs the simulator pass;
       4. extracts the requested scalar responses
            (each response is a dotted "unitName.kpiName");
       5. accumulates rows.

    Result is written to a CSV file in the case directory (default
    `sweep_results.csv`) and summarised on stdout.

    2-D and N-D sweeps will arrive once a single 1-D works end-to-end.
\*---------------------------------------------------------------------------*/

#pragma once

#include "OuterDriver.H"

#include <string>
#include <vector>

namespace Choupo {

class SweepDriver : public OuterDriver
{
public:
    explicit SweepDriver(const DictPtr& outerDict);

    const std::string& type() const override { return type_; }
    int                run () override;

private:
    inline static const std::string type_ = "sweep";

    std::string              targetPath_;
    scalar                   rangeMin_ = 0.0;
    scalar                   rangeMax_ = 0.0;
    std::size_t              nPoints_  = 0;
    std::vector<std::string> responses_;
    std::string              reportFile_ = "sweep_results.csv";
};

} // namespace Choupo
