/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

#include "BedWallHeatTransfer.H"
#include "LiFinlayson.H"
#include "core/RegistryRefusal.H"

#include <stdexcept>

namespace Choupo {

std::map<std::string, BedWallHeatTransfer::Factory>& BedWallHeatTransfer::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void BedWallHeatTransfer::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<BedWallHeatTransfer> BedWallHeatTransfer::New(const std::string& name)
{
    auto it = registry().find(name);
    if (it == registry().end())
        throw std::runtime_error("BedWallHeatTransfer::New: "
            + registryRefusal::message("bed-to-wall heat-transfer correlation",
                  name, registryRefusal::keysOf(registry())));
    return it->second();
}

std::vector<std::string> BedWallHeatTransfer::availableTypes()
{
    return registryRefusal::keysOf(registry());
}

void BedWallHeatTransfer::registerBuiltins()
{
    registerType("LiFinlayson", []{ return std::make_unique<LiFinlayson>(); });
}

} // namespace Choupo
