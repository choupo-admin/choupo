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

#include "OuterDriver.H"
#include "DesignSpec.H"
#include "FitBinaryPair.H"
#include "GridSweepDriver.H"
#include "OptimizationDriver.H"
#include "SweepDriver.H"

#include <stdexcept>

namespace Choupo {

std::map<std::string, OuterDriver::Factory>& OuterDriver::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void OuterDriver::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<OuterDriver> OuterDriver::New(const DictPtr& dict)
{
    const std::string t = dict->lookupWord("type");
    auto it = registry().find(t);
    if (it == registry().end())
    {
        std::string avail;
        for (const auto& kv : registry()) avail += " " + kv.first;
        throw std::runtime_error("OuterDriver::New: unknown type '" + t
            + "'.  Registered:" + (avail.empty() ? " (none yet)" : avail));
    }
    return it->second(dict);
}

std::vector<std::string> OuterDriver::availableTypes()
{
    std::vector<std::string> v;
    v.reserve(registry().size());
    for (const auto& kv : registry()) v.push_back(kv.first);
    return v;
}

void OuterDriver::registerBuiltins()
{
    registerType("sweep",
        [](const DictPtr& d) -> std::unique_ptr<OuterDriver>
        { return std::make_unique<SweepDriver>(d); });

    registerType("gridSweep",
        [](const DictPtr& d) -> std::unique_ptr<OuterDriver>
        { return std::make_unique<GridSweepDriver>(d); });

    registerType("fitBinaryPair",
        [](const DictPtr& d) -> std::unique_ptr<OuterDriver>
        { return std::make_unique<FitBinaryPair>(d); });

    registerType("optimization",
        [](const DictPtr& d) -> std::unique_ptr<OuterDriver>
        { return std::make_unique<OptimizationDriver>(d); });

    registerType("designSpec",
        [](const DictPtr& d) -> std::unique_ptr<OuterDriver>
        { return std::make_unique<DesignSpec>(d); });
}

} // namespace Choupo
