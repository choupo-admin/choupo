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

#include "SignalController.H"

#include <stdexcept>

namespace Choupo {

void SignalController::initialise(const DictPtr&      ctrlDict,
                                  const UnitResolver& resolveUnit)
{
    // Actuator binding: the canonical `actuator { unit ...; mv ...; }` form,
    // OR the terse `target <mv>;` (the design's spelling) when a single unit
    // is implied via `actuator.unit` --- BOTH accepted.
    std::string actUnitName;
    if (ctrlDict->found("actuator"))
    {
        auto actDict = ctrlDict->subDict("actuator");
        actUnitName  = actDict->lookupWord("unit");
        mvKey_       = actDict->found("mv")
                     ? actDict->lookupWord("mv")
                     : actDict->lookupWord("target");
    }
    else
        throw std::runtime_error("SignalController '" + name_ + "':"
            " an `actuator { unit ...; mv ...; }` block is required");

    actUnit_ = resolveUnit(actUnitName);
    if (!actUnit_)
        throw std::runtime_error("SignalController '" + name_ + "':"
            " actuator.unit '" + actUnitName + "' not found");

    // Build the signal from its `signal {}` sub-dict.
    if (!ctrlDict->found("signal"))
        throw std::runtime_error("SignalController '" + name_ + "':"
            " a `signal { type ...; ... }` block is required");
    auto sigDict = ctrlDict->subDict("signal");
    const std::string stype = sigDict->lookupWord("type");
    signal_ = Signal::New(stype);
    signal_->initialise(sigDict);

    // Prime the actuator with the value at t = 0 so the unit's first step
    // already sees the signal (matches the schedule's t=0 priming).
    lastMV_ = signal_->value(0.0);
}

void SignalController::update(scalar t, scalar /*dt*/)
{
    const scalar v = signal_->value(t);
    lastMV_ = v;
    actUnit_->setMV(mvKey_, v);
}

} // namespace Choupo
