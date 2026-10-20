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
Description
    THE REYNOLDS GRID OF A CORRELATION BENCH'S SWEEP (2026-10-20, DEV.md 4c
    C119).  `frictionBench` and `heatTransferBench` each accept an optional

        sweep
        {
            file            moodySweep.csv;   // written in the case directory
            ReMin           100;
            ReMax           1e8;
            pointsPerDecade 20;
            ...                               // the bench's own second axis
        }

    and evaluate every registered correlation on the same logarithmic grid
    of Reynolds numbers, Re_k = ReMin 10^(k / pointsPerDecade).  The grid has
    ONE home here so the two benches cannot space their points differently;
    a sweep is a set of the correlations' own answers, never a new number.

    Refused by name: a non-positive ReMin, ReMax <= ReMin, a pointsPerDecade
    below 1 or not a whole number, and a `file` aimed into data/standards/.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"
#include "thermo/RecordResolver.H"

#include <cmath>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {
namespace correlationSweep {

struct ReynoldsGrid
{
    std::string         file;   // the CSV the bench writes
    std::vector<scalar> Re;     // ReMin .. (at most) ReMax, log-spaced
};

inline ReynoldsGrid readReynoldsGrid(const DictPtr& sweep, const std::string& who)
{
    ReynoldsGrid g;
    g.file = sweep->lookupWord("file");
    records::refuseStandardsWrite(who, "file", g.file);

    const scalar ReMin = sweep->lookupScalar("ReMin");
    const scalar ReMax = sweep->lookupScalar("ReMax");
    const scalar ppd   = sweep->lookupScalar("pointsPerDecade");
    if (!(ReMin > 0.0))
        throw std::runtime_error(who + ": sweep.ReMin must be positive -- the "
            "grid is logarithmic and every correlation divides by Re.");
    if (!(ReMax > ReMin))
        throw std::runtime_error(who + ": sweep.ReMax must exceed sweep.ReMin.");
    if (!(ppd >= 1.0) || std::abs(ppd - std::round(ppd)) > 1.0e-12)
        throw std::runtime_error(who + ": sweep.pointsPerDecade must be a whole "
            "number >= 1.");

    const scalar lg0 = std::log10(ReMin);
    const int nSteps = static_cast<int>(
        std::floor(ppd * (std::log10(ReMax) - lg0) + 1.0e-9));
    for (int k = 0; k <= nSteps; ++k)
        g.Re.push_back(std::pow(10.0, lg0 + static_cast<scalar>(k) / ppd));
    return g;
}

} // namespace correlationSweep
} // namespace Choupo
