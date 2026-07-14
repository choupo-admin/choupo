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

#include "Atomizer.H"
#include "RotaryAtomizer.H"
#include "PressureSwirlAtomizer.H"
#include "TwinFluidAtomizer.H"

#include <stdexcept>

namespace Choupo {

std::map<std::string, Atomizer::Factory>& Atomizer::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void Atomizer::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<Atomizer> Atomizer::New(const DictPtr& dict)
{
    // Default `rotary` so a legacy `operation{}` (no atomiser block, only the
    // wheel keys) resolves to Friedman -- byte-identical to the pre-library code.
    const std::string model = dict->lookupWordOrDefault("model", "rotary");
    auto it = registry().find(model);
    if (it == registry().end())
        throw std::runtime_error("Atomizer::New: unknown atomiser model '" + model
            + "'.  Available: rotary, pressureNozzle, twinFluid "
              "(register in Atomizer::registerBuiltins).");
    return it->second(dict);
}

void Atomizer::registerBuiltins()
{
    registerType("rotary",         [](const DictPtr& d){ return std::make_unique<RotaryAtomizer>(d);        });
    registerType("wheel",          [](const DictPtr& d){ return std::make_unique<RotaryAtomizer>(d);        }); // alias
    registerType("pressureNozzle", [](const DictPtr& d){ return std::make_unique<PressureSwirlAtomizer>(d); });
    registerType("pressureSwirl",  [](const DictPtr& d){ return std::make_unique<PressureSwirlAtomizer>(d); }); // alias
    registerType("twinFluid",      [](const DictPtr& d){ return std::make_unique<TwinFluidAtomizer>(d);     });
    registerType("airblast",       [](const DictPtr& d){ return std::make_unique<TwinFluidAtomizer>(d);     }); // alias
}

} // namespace Choupo
