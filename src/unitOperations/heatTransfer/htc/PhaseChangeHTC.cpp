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
    Factory machinery for the PHASE-CHANGE HTC base.  Mirrors verbatim the
    explicit-factory pattern of HeatTransferCorrelation (registerType / New /
    availableTypes / registerBuiltins) -- no macros, no static-init magic; the
    builtins are registered explicitly.

    References for the v1 built-in (NusseltFilm):
      * Nusselt, W. (1916), Z. Ver. Dt. Ing. 60, 541-575 -- film theory.
      * Incropera & DeWitt, Fundamentals of Heat and Mass Transfer, Ch. 10,
        Examples 10.3 (vertical plate) and 10.4 (horizontal tube).
\*---------------------------------------------------------------------------*/

#include "PhaseChangeHTC.H"
#include "NusseltFilm.H"
#include "ZuberCHF.H"
#include "Rohsenow.H"

#include <stdexcept>

namespace Choupo {

std::map<std::string, PhaseChangeHTC::Factory>&
PhaseChangeHTC::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void PhaseChangeHTC::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<PhaseChangeHTC>
PhaseChangeHTC::New(const std::string& name)
{
    auto it = registry().find(name);
    if (it == registry().end())
    {
        std::string avail;
        for (const auto& kv : registry()) avail += " " + kv.first;
        throw std::runtime_error("PhaseChangeHTC::New: unknown model '"
            + name + "'.  Registered:" + (avail.empty() ? " (none)" : avail));
    }
    return it->second();
}

std::vector<std::string> PhaseChangeHTC::availableTypes()
{
    std::vector<std::string> v;
    for (const auto& kv : registry()) v.push_back(kv.first);
    return v;
}

void PhaseChangeHTC::registerBuiltins()
{
    registerType("NusseltFilm", []{ return std::make_unique<NusseltFilm>(); });
    registerType("ZuberCHF",    []{ return std::make_unique<ZuberCHF>(); });
    registerType("Rohsenow",    []{ return std::make_unique<Rohsenow>(); });
}

} // namespace Choupo
