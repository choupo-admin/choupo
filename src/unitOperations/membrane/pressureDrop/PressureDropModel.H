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
    Choupo::PressureDropModel

Description
    Selectable feed-channel pressure-drop model for the spiral-wound module
    --- it supplies the local axial pressure gradient dP/dz [Pa/m], which
    lowers the feed-side driving pressure P_b(z) along the channel.

    Explicit-factory pattern (parallel to MassTransferModel / CycloneModel).
    A `pressureDrop { model <name>;... }` sub-block in the unit's operation
    picks the concrete model; without the block the legacy linear model is
    used (`dP_feed_total / L`, the behaviour).  Built-ins:

        constant      --  dP/dz = dP_total / L  (a fixed gradient)
        SchockMiquel  --  spacer friction:  dP/dz = lambda * rho u^2 / (2 d_h),
                          lambda = a Re^-b,  Re = rho u d_h / mu.
                          Defaults a = 6.23, b = 0.3 (Schock & Miquel 1987);
                          calibratable.  So dP/dz is COMPUTED from the local
                          crossflow velocity and falls along the channel as
                          the retentate flow drops.

    The MODULE owns the geometry (computes u and d_h, shared with the
    mass-transfer model) and passes them in the context.  Lives in the
    optional membrane.so.
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

struct PressureDropContext
{
    scalar u   = 0.0;   // crossflow (channel) velocity [m/s]
    scalar d_h = 0.0;   // hydraulic diameter [m]
    scalar mu  = 0.0;   // dynamic viscosity [Pa.s]
    scalar rho = 0.0;   // density [kg/m^3]
    scalar L   = 1.0;   // channel length [m]  (for the constant model)
};

class PressureDropModel
{
public:
    using Factory = std::function<std::unique_ptr<PressureDropModel>()>;

    virtual ~PressureDropModel() = default;

    virtual const std::string& type() const = 0;
    virtual void readParameters(const DictPtr& /*pressureDropDict*/) {}

    // Local axial pressure gradient dP/dz [Pa/m] at this station.
    virtual scalar dPdz(const PressureDropContext& c) const = 0;

    // ---- Factory ----
    static void registerType(const std::string& name, Factory f);
    static std::unique_ptr<PressureDropModel> New(const std::string& name);
    static std::vector<std::string> availableTypes();
    static void registerBuiltins();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
