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
    Choupo::LiquidDiffusivityModel

Description
    Abstract base for the infinite-dilution BINARY LIQUID diffusivity D°_AB
    of a solute A in a solvent B, the liquid counterpart of DiffusivityModel
    (gas, Fuller).  Built-ins register through the explicit-factory pattern.

    Selected in a sub-block of the thermoPackage `transport`:

        transport
        {
            liquidViscosity   { model Andrade; }
            liquidDiffusivity { model WilkeChang; }
        }

    Every liquid-diffusivity correlation needs the SOLVENT VISCOSITY, so the
    method receives it as an argument (ThermoPackage evaluates it from the
    liquid-viscosity model and passes it in) --- which is why a
    liquidViscosity model must be present alongside.  The solute molar volume
    comes from each component's Vliq.
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

class LiquidDiffusivityModel
{
public:
    virtual ~LiquidDiffusivityModel() = default;

    virtual const std::string& modelName() const = 0;

    // Infinite-dilution binary liquid diffusivity D°_AB [m²/s].
    //   solute      : component A (diffusing species)
    //   solvent     : component B (the continuous phase)
    //   muSolvent_PaS : solvent saturated-liquid viscosity at T [Pa·s]
    virtual scalar diffusivityLiquidBinary(const Component& solute,
                                           const Component& solvent,
                                           scalar T_K,
                                           scalar muSolvent_PaS) const = 0;

    // ---- Run-time selection (explicit registry) ------------------------
    using Factory = std::function<std::unique_ptr<LiquidDiffusivityModel>(const DictPtr&)>;

    static void registerModel(const std::string& name, Factory f);
    static std::unique_ptr<LiquidDiffusivityModel> New(const DictPtr& dict);
    static void registerBuiltins();
    static std::vector<std::string> availableModels();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
