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
Namespace
    Choupo::temperatureApproach

Description
    THE SIGN RULE OF A TEMPERATURE APPROACH, in ONE place.

    Vitor's ruling, 2026-09-26: "O delta T e dado sempre positivo e tu e que
    vais atribuir sinal dependendo da reacao quimica."  A case declares
    `temperatureApproach` as a MAGNITUDE; the engine assigns the direction
    from the thermicity of the transformation AS IT RUNS from the feed:

        exothermic  (dH < 0)  ->  the equilibrium is evaluated at T + |dT|
        endothermic (dH > 0)  ->  the equilibrium is evaluated at T - |dT|
        undetermined          ->  T + |dT|, an ANNOUNCED default

    Why that direction: by van 't Hoff, d ln K / dT = dH / (R T^2), so a
    HIGHER evaluation temperature lowers K for an exothermic transformation
    and a LOWER one lowers K for an endothermic transformation.  Both push
    the computed answer back against the direction the transformation runs:
    the reported outlet falls SHORT of equilibrium, which is what a real bed
    does.  A real bed never crosses its own equilibrium curve, so the
    approach has no sign of its own to declare.

    Two readers of the rule, and they differ only in WHAT transformation
    they read the thermicity of:

      gibbsReactor / gibbsMap  (stoichiometry-free)  the OVERALL
          transformation from the feed to its equilibrium at T -- the only
          extent a species-list reactor has
          (`GibbsReactor::approachDirection`).
      equilibriumReactor  (declared reactions)  EACH declared reaction, in
          the direction it runs from the feed at the physical T: the sign of
          (extent_j at dT = 0) x (dH_j as written).

    Both hand the number to `fromThermicity` below, so the rule itself
    cannot drift between them.  Only the SIGN of the argument is read.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <string>

namespace Choupo {
namespace temperatureApproach {

struct ApproachSign
{
    int         sign       = +1;              // +1: T + |dT|;  -1: T - |dT|
    bool        determined = false;           // false -> +1 is an ANNOUNCED default
    std::string word       = "undetermined";  // "exothermic" | "endothermic" | "undetermined"
};

//- The rule.  `dH_asItRuns` is the enthalpy change of the transformation in
//  the direction it actually runs (any unit; only its sign is read).
//  `determinable` is false when the caller could not establish that the
//  transformation runs at all (no conversion, an unconverged probe, a
//  reaction enthalpy the package cannot price): the default then applies.
inline ApproachSign fromThermicity(scalar dH_asItRuns, bool determinable)
{
    ApproachSign s;
    s.determined = determinable && dH_asItRuns != 0.0;
    if (s.determined)
    {
        s.sign = (dH_asItRuns < 0.0) ? +1 : -1;
        s.word = (s.sign > 0) ? "exothermic" : "endothermic";
    }
    return s;
}

} // namespace temperatureApproach
} // namespace Choupo
