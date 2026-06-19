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

#include "DynamicUnitOperation.H"
#include "DynamicCSTR.H"

#include <stdexcept>

namespace Choupo {

std::map<std::string, DynamicUnitOperation::Factory>&
DynamicUnitOperation::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void DynamicUnitOperation::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<DynamicUnitOperation>
DynamicUnitOperation::New(const std::string& type)
{
    auto it = registry().find(type);
    if (it == registry().end())
    {
        std::string avail;
        for (const auto& kv : registry()) avail += " " + kv.first;
        throw std::runtime_error("DynamicUnitOperation::New: unknown type '"
            + type + "'.  Registered:" + (avail.empty() ? " (none yet)" : avail));
    }
    return it->second();
}

std::vector<std::string> DynamicUnitOperation::availableTypes()
{
    std::vector<std::string> v;
    v.reserve(registry().size());
    for (const auto& kv : registry()) v.push_back(kv.first);
    return v;
}

void DynamicUnitOperation::registerBuiltins()
{
    registerType("dynamicCSTR",
        []() -> std::unique_ptr<DynamicUnitOperation>
        { return std::make_unique<DynamicCSTR>(); });
}

// ---- Default MV/CV: throw -----------------------------------------------
void DynamicUnitOperation::setMV(const std::string& key, scalar /*value*/)
{
    throw std::runtime_error("DynamicUnitOperation '" + name_ + "' (type "
        + type() + "): does not expose MV '" + key + "'");
}

scalar DynamicUnitOperation::getCV(const std::string& key) const
{
    throw std::runtime_error("DynamicUnitOperation '" + name_ + "' (type "
        + type() + "): does not expose CV '" + key + "'");
}

} // namespace Choupo
