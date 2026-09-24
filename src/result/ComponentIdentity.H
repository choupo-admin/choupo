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
Function
    Choupo::stampComponentIdentity

Description
    THE ONE HOME for the identity of the component set a run loaded: the
    names, the molar masses and the thermo coverage, copied from the
    assembled ThermoPackage onto the SimulationResult before emission.

    WHY IT IS A FUNCTION AND NOT THREE LINES IN A main().  It WAS three
    lines in a main() -- choupoSolve's -- and only that one.  Four binaries
    emit a SimulationResult (choupoSolve, choupoBatch, and choupoCtrl and
    choupoSemiContinuous through src/dynamicDriver/), and three of them
    published a result whose `components` array was EMPTY and whose
    `componentMolarMass` map was absent, although each had the thermo
    package in scope at the very statement that built the result.  Nothing
    refused, because an absent map is exactly how the emitter spells "this
    application did not populate it" -- so every reader downstream simply
    saw a run with no components in it and had no way to tell that from a
    run that genuinely had none.  The molar mass of the loaded components
    is ONE fact about ONE package; it had one home and needed four, which
    is the arity sin in the shape this project keeps closing.

    choupoProps is the exception, and it is a REASON rather than an
    oversight: it does not build a SimulationResult at all (its result
    channel is the per-operation `operationResults[]` block, and its ops
    each publish the substance they are about).  There is no object here
    for it to stamp, so it is not a caller and must not be made one.

    WHAT IT DOES NOT DO.  It reads the package and copies; it estimates
    nothing, defaults nothing and refuses nothing.  A component whose
    record carries no molar mass contributes no entry, and the absence goes
    on meaning what it meant -- the readers that consume the map already
    treat a missing key as "not available here" (ResultEmitter skips the
    derived mass flow, the GUI keeps the run's own molar unit).
\*---------------------------------------------------------------------------*/

#ifndef Choupo_ComponentIdentity_H
#define Choupo_ComponentIdentity_H

namespace Choupo
{

class ThermoPackage;
struct SimulationResult;

//- Copy the loaded component set's names, molar masses [kg/kmol] and thermo
//  coverage from `thermo` onto `r`.  Appends nothing that `thermo` does not
//  carry; called once per pass, immediately before result emission.
void stampComponentIdentity(SimulationResult& r, const ThermoPackage& thermo);

}   // namespace Choupo

#endif
