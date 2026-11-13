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

#include "DensityMethod.H"

#include "IdealMixing.H"
#include "PureFluidLeaf.H"
#include "RecordVolumeLeaf.H"
#include "thermo/ThermoPackage.H"

#include <map>
#include <memory>
#include <stdexcept>

namespace Choupo {
namespace liquidProperty {

std::map<std::string, DensityMethod::Factory>& DensityMethod::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void DensityMethod::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<DensityMethod> DensityMethod::New(const std::string& name, const Binding& b)
{
    const auto it = registry().find(name);
    if (it == registry().end())
    {
        std::string avail;
        for (const auto& kv : registry()) avail += " " + kv.first;
        throw std::runtime_error("DensityMethod::New: unknown liquid-density method '"
            + name + "'.  Registered:" + (avail.empty() ? std::string(" (none)") : avail));
    }
    return it->second(b);
}

std::vector<std::string> DensityMethod::availableTypes()
{
    std::vector<std::string> out;
    for (const auto& kv : registry()) out.push_back(kv.first);
    return out;
}

//  Every method of the liquid density, in one place a student can read.
void DensityMethod::registerBuiltins()
{
    //  ONE registered leaf for the record's volume: its route (anchored
    //  Rackett, flat, bare Rackett) is a FACT of the record, read by the
    //  package's one home, and the leaf's id names it.
    registerType("recordVolume", [](const Binding& b)
        { return std::make_unique<RecordVolumeLeaf>(b,
              static_cast<int>(b.thermo->liquidVolumeRouteOf(b.set.at(0)))); });
    registerType("pureFluid", [](const Binding& b)
        { return std::make_unique<PureFluidLeaf>(b, PureFluidLeaf::Kind::caseSelection); });
    registerType("idealMixing", [](const Binding& b)
        { return std::make_unique<IdealMixing>(b); });
}

} // namespace liquidProperty
} // namespace Choupo
