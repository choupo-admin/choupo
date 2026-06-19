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
\*---------------------------------------------------------------------------*/

#include "ScheduleController.H"

#include <algorithm>
#include <stdexcept>

namespace Choupo {

void ScheduleController::initialise(const DictPtr&      ctrlDict,
                                    const UnitResolver& resolveUnit)
{
    auto actDict = ctrlDict->subDict("actuator");
    const std::string actUnitName = actDict->lookupWord("unit");
    mvKey_   = actDict->lookupWord("mv");
    actUnit_ = resolveUnit(actUnitName);
    if (!actUnit_)
        throw std::runtime_error("ScheduleController '" + name_ + "':"
            " actuator.unit '" + actUnitName + "' not found");

    auto schedList = ctrlDict->lookupDictList("schedule");
    if (schedList.empty())
        throw std::runtime_error("ScheduleController '" + name_ + "':"
            " schedule list is empty");

    entries_.clear();
    entries_.reserve(schedList.size());
    for (const auto& e : schedList)
    {
        const scalar t = e->lookupScalar("time");
        const scalar v = e->lookupScalar("value");
        entries_.emplace_back(t, v);
    }
    std::sort(entries_.begin(), entries_.end(),
              [](const auto& a, const auto& b) { return a.first < b.first; });

    // Prime the actuator with the first schedule entry whose time has
    // already elapsed at t = 0 (typically the entry at time 0 itself).
    // Done in update() — keep initialise side-effect free.
    lastMV_ = entries_.front().second;
}

void ScheduleController::update(scalar t, scalar /*dt*/)
{
    // Walk the (sorted) schedule, pick the latest entry with time <= t.
    scalar val = entries_.front().second;
    for (const auto& [tk, v] : entries_)
    {
        if (tk <= t + 1.0e-12) val = v;
        else                    break;
    }
    lastMV_ = val;
    actUnit_->setMV(mvKey_, val);
}

} // namespace Choupo
