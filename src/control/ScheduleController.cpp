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

    // Delegate the staircase parse + math to StaircaseSignal (it reads the
    // SAME `schedule (...)` list and applies the identical ZOH walk, so the
    // emitted step train is byte-for-byte the legacy one).  An empty list
    // throws inside StaircaseSignal::initialise; wrap the message so the
    // controller name is still surfaced.
    try
    {
        staircase_.initialise(ctrlDict);
    }
    catch (const std::exception& e)
    {
        throw std::runtime_error("ScheduleController '" + name_ + "': "
            + e.what());
    }

    // Prime: the value at t = 0 (the front entry, identical to before).
    lastMV_ = staircase_.value(0.0);
}

void ScheduleController::update(scalar t, scalar /*dt*/)
{
    const scalar val = staircase_.value(t);
    lastMV_ = val;
    actUnit_->setMV(mvKey_, val);
}

} // namespace Choupo
