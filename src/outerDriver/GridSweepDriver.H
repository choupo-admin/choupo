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
    Choupo::GridSweepDriver

Description
    2-D sensitivity sweep over TWO design variables on a regular grid --- the
    sibling of SweepDriver (1-D).  Powers the What-if's two-knob CONTOUR (e.g.
    the flash V/F envelope over T x P).  Reads:

        type        gridSweep;
        parameters
        (
            { target  units[0].operation.T;  range (355 385);       nPoints 7; }
            { target  units[0].operation.P;  range (50000 200000);  nPoints 7; }
        )
        responses ( flashDrum.V_over_F );
        report { format csv; file gridsweep_TP.csv; }

    Ranges are RAW canonical SI (same convention as SweepDriver / flash06 ---
    the dict parser does not apply a named unit to a list).  The driver runs a
    nested loop (A outer, B inner) and writes ONE row per grid point:

        point,<targetA>,<targetB>,<resp1>,<resp2>,...

    A point that fails to converge still emits its row with the response cells
    set to `nan` --- never skipped, never fabricated (the honest-hole rule, so
    the contour shows a real gap rather than an interpolated lie).
\*---------------------------------------------------------------------------*/

#pragma once

#include "OuterDriver.H"

#include <string>
#include <vector>

namespace Choupo {

class GridSweepDriver : public OuterDriver
{
public:
    explicit GridSweepDriver(const DictPtr& outerDict);

    const std::string& type() const override { return type_; }
    int                run () override;

    // One swept axis (public so the file-local reader helper can return it).
    struct Axis
    {
        std::string target;
        scalar      min = 0.0;
        scalar      max = 0.0;
        std::size_t n   = 0;
    };

private:
    inline static const std::string type_ = "gridSweep";

    Axis                     a_;   // outer
    Axis                     b_;   // inner
    std::vector<std::string> responses_;
    std::string              reportFile_ = "gridsweep_results.csv";
};

} // namespace Choupo
