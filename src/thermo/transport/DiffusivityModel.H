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
    Choupo::DiffusivityModel

Description
    Abstract base for low-pressure BINARY gas diffusivity D_AB, one family
    of the transport layer (parallel to viscosity and thermal
    conductivity).  Built-in correlations register through the usual
    explicit-factory pattern.

    Selected in a sub-block of the thermoPackage `transport`:

        transport
        {
            model        Chung;
            diffusivity  { model Fuller; }
        }

    A correlation gets the two Components (for MW and the diffusion volume
    Σv) plus T and P; mixture/effective-diffusivity rules (for >2
    components) are a later concern and live in ThermoPackage.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {

class Component;   // forward; the.cpp includes the full definition

class DiffusivityModel
{
public:
    virtual ~DiffusivityModel() = default;

    virtual const std::string& modelName() const = 0;

    // Binary low-pressure gas diffusivity D_AB [m²/s].
    virtual scalar diffusivityGasBinary(const Component& a, const Component& b,
                                        scalar T_K, scalar P_Pa) const = 0;

    // ---- Run-time selection (explicit registry) ------------------------
    using Factory = std::function<std::unique_ptr<DiffusivityModel>(const DictPtr&)>;

    static void registerModel(const std::string& name, Factory f);
    static std::unique_ptr<DiffusivityModel> New(const DictPtr& dict);
    static void registerBuiltins();
    static std::vector<std::string> availableModels();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
