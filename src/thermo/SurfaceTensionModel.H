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
    Choupo::SurfaceTensionModel

Description
    Abstract base for liquid-vapour SURFACE-TENSION correlations -- a
    genuinely NEW property KIND in Choupo (no surface-tension accessor
    existed before this).  It earns its own base because sigma(T) is not a
    channel of any existing model (it is neither an h/s channel, a Psat
    curve, a gamma, nor an EoS departure).

    Built-in correlations register through the usual explicit-factory
    pattern (registerType / New / availableModels / registerBuiltins) --
    NO auto-registration macros, mirroring every other Choupo model base.

    Selected in the thermoPackage transport/thermo block:

        surfaceTension { model BrockBird; }

    The pure-component method takes a Component so a corresponding-states
    correlation can read Tc / Pc / Tb directly; the mixture rule (a simple
    mole-fraction average in v1) lives in ThermoPackage::surfaceTension.

    A PURE-FLUID component flagged with a fundamental-equation package
    (e.g. water + IF97) is routed to that package's own sigma(T) instead,
    upstream in ThermoPackage -- this generic correlation is the fallback
    for everything else.
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

class Component;   // forward; the .cpp includes the full definition

class SurfaceTensionModel
{
public:
    virtual ~SurfaceTensionModel() = default;

    virtual const std::string& modelName() const = 0;

    // Pure-component liquid surface tension [N/m] at temperature T [K].
    virtual scalar sigmaPure(const Component& c, scalar T_K) const = 0;

    // ---- Run-time selection (explicit registry) ------------------------
    using Factory = std::function<std::unique_ptr<SurfaceTensionModel>(const DictPtr&)>;

    static void registerType(const std::string& name, Factory f);
    static std::unique_ptr<SurfaceTensionModel> New(const DictPtr& dict);
    static void registerBuiltins();
    static std::vector<std::string> availableModels();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
