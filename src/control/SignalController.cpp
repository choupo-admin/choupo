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

#include <algorithm>
#include <iostream>
#include <stdexcept>

namespace Choupo {

void SignalController::initialise(const DictPtr&      ctrlDict,
                                  const UnitResolver& resolveUnit)
{
    // Actuator binding: the canonical `actuator { unit ...; mv ...; }` form,
    // OR the terse `target <mv>;` (the design's spelling) when a single unit
    // is implied via `actuator.unit` --- BOTH accepted.
    std::string actUnitName;
    bool viaInletField = false;
    if (ctrlDict->found("actuator"))
    {
        auto actDict = ctrlDict->subDict("actuator");
        actUnitName  = actDict->lookupWord("unit");
        if (actDict->found("inletField"))
        {
            // Inlet-face targeting (forum #100.4/#101/#103): the field
            // names the unit's INLET quantity -- the only legal
            // disturbance surface (an outlet actuator is not even
            // expressible).  T/F sugar to the historical MV names;
            // dotted fields (moleFraction.<c>, componentMolarFlow.<c>)
            // pass through to the unit's MV surface.
            const std::string f = actDict->lookupWord("inletField");
            viaInletField = true;
            if      (f == "T") mvKey_ = "T_in";
            else if (f == "F") mvKey_ = "F_in";
            else               mvKey_ = f;
        }
        else
            mvKey_ = actDict->found("mv")
                   ? actDict->lookupWord("mv")
                   : actDict->lookupWord("target");
    }
    else
        throw std::runtime_error("SignalController '" + name_ + "':"
            " an `actuator { unit ...; mv|inletField ...; }` block is"
            " required");

    actUnit_ = resolveUnit(actUnitName);
    if (!actUnit_)
        throw std::runtime_error("SignalController '" + name_ + "':"
            " actuator.unit '" + actUnitName + "' not found");

    // Validate the target BEFORE integrating (forum #103): the unit, the
    // field and (for dotted fields) the component must all exist.
    {
        const auto mvs = actUnit_->availableMVs();
        if (std::find(mvs.begin(), mvs.end(), mvKey_) == mvs.end())
        {
            std::string avail;
            for (const auto& m : mvs) avail += " " + m;
            throw std::runtime_error("SignalController '" + name_ + "':"
                " unit '" + actUnitName + "' has no MV '" + mvKey_
                + "'.  Available:" + avail);
        }
    }
    if (viaInletField)
    {
        // Announce the semantics ALOUD: the Signal value is the ABSOLUTE
        // target quantity (the convention every existing MV already uses),
        // never a deviation -- and the composition fields state what they
        // hold constant.
        std::cout << "  [SignalController " << name_ << "] inletField '"
                  << mvKey_ << "' on unit '" << actUnitName << "': the"
                  " Signal value is the ABSOLUTE ";
        if (mvKey_.rfind("moleFraction.", 0) == 0)
            std::cout << "inlet mole fraction (others renormalised"
                         " proportionally, TOTAL molar flow held)";
        else if (mvKey_.rfind("componentMolarFlow.", 0) == 0)
            std::cout << "component molar flow [kmol/s] (other components'"
                         " flows held; F_in and z_in re-derived)";
        else if (mvKey_ == "T_in")
            std::cout << "inlet temperature [K]";
        else
            std::cout << "inlet total molar flow [kmol/s]"
                         " (composition preserved)";
        std::cout << "\n";
    }

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
