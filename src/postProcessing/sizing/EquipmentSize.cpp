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

#include "EquipmentSize.H"
#include "CrystalliserSize.H"
#include "CycloneSize.H"
#include "CompressorSize.H"
#include "VesselSize.H"
#include "EvaporatorSize.H"
#include "ShellTubeHX.H"
#include "SprayDryerSize.H"
#include "StirredTank.H"

#include <stdexcept>

namespace Choupo {

std::map<std::string, EquipmentSize::Factory>& EquipmentSize::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void EquipmentSize::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<EquipmentSize> EquipmentSize::New(const std::string& type)
{
    auto it = registry().find(type);
    if (it == registry().end())
    {
        std::string avail;
        for (const auto& kv : registry()) avail += " " + kv.first;
        throw std::runtime_error("EquipmentSize: unknown type '" + type
            + "'.  Registered:" + (avail.empty() ? " (none)" : avail));
    }
    return it->second();
}

void EquipmentSize::registerBuiltins()
{
    registerType("stirredTank",
        []{ return std::make_unique<StirredTank>(); });
    registerType("shellTubeHX",
        []{ return std::make_unique<ShellTubeHX>(); });
    registerType("evaporator",
        []{ return std::make_unique<EvaporatorSize>(); });
    registerType("crystalliser",
        []{ return std::make_unique<CrystalliserSize>(); });
    registerType("sprayDryer",
        []{ return std::make_unique<SprayDryerSize>(); });
    registerType("cyclone",
        []{ return std::make_unique<CycloneSize>(); });
    registerType("compressor",
        []{ return std::make_unique<CompressorSize>(); });
    registerType("vessel",
        []{ return std::make_unique<VesselSize>(); });
}

} // namespace Choupo
