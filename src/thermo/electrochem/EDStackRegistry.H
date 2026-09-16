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
    Choupo::EDStackRegistry

Description
    Singleton lookup for EDStack records (`kind edStack;` in the flat
    assets/ home), loaded after `loadFrom(root)` from the main application.
    Same shape as MembraneModuleRegistry -- one registry per kind-of-thing.
    It is NOT folded into the `kind IEM` reader: a membrane pair knows
    nothing about the stack it is built into, and a stack knows nothing
    about the membranes' resistance.
\*---------------------------------------------------------------------------*/

#pragma once

#include "EDStack.H"

#include <string>
#include <vector>

namespace Choupo {

class EDStackRegistry
{
public:
    static void loadFrom(const std::string& dataRoot);

    //- The record, or a refusal through registryRefusal::message naming the
    //  registered stacks.
    static const EDStack& byName(const std::string& name);

    static std::vector<std::string> availableNames();
};

} // namespace Choupo
