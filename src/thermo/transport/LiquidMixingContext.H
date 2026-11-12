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
Struct
    Choupo::LiquidMixingContext

Description
    What a LIQUID MIXING RULE may read from the package that calls it, and
    nothing more (DEV.md 4c C331).  The three rule families -- surface
    tension, liquid viscosity, liquid thermal conductivity -- turn the
    pure-component values the package has already evaluated at T into the
    mixture's value.  Some rules need more than the pure values:

      * Butler's surface tension needs the case's OWN activity model, at the
        bulk composition and at the surface composition it iterates;
      * Li's conductivity needs each component's liquid molar volume (the
        volume fractions), and Butler needs it at the normal boiling point
        (the molar area);
      * Filippov's needs the molar masses (mass fractions).

    The package hands those over as this struct -- two callables and the
    component list -- so a rule never sees ThermoPackage and cannot reach
    anything it was not given.  `gamma` is EMPTY when the package has no
    activity model; a rule that needs it says so and falls back by name.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <cstddef>
#include <functional>
#include <string>
#include <vector>

namespace Choupo {

class Component;

struct LiquidMixingContext
{
    // The package's components, in the order of every composition vector.
    const std::vector<Component>* components = nullptr;

    // Liquid activity coefficients gamma_i(T, x) of the case's own model
    // (the same call the gamma-phi K-value makes).  Empty = no model.
    std::function<sVector(scalar, const sVector&)> gamma;

    // The name of that activity model, for the announcement.
    std::string activityModelName;

    // Liquid molar volume of component i at T [m3/mol], by the SAME route
    // the package's liquid density takes for that component (its 25 C
    // `Vliq` anchored on Rackett, or bare Rackett, announced there).
    std::function<scalar(std::size_t, scalar)> molarVolume;
};

} // namespace Choupo
