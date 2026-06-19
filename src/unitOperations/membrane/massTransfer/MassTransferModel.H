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
    Choupo::MassTransferModel

Description
    Selectable feed-channel mass-transfer (concentration-polarisation) model
    for the spiral-wound membrane module --- it supplies the film
    coefficient k_film [m/s] that sets how strongly the wall concentration
    c_m exceeds the bulk c_b (E = exp(J_w / k_film)).

    Explicit-factory pattern, like CycloneModel / EquationOfState: a
    `massTransfer { model <name>;... }` sub-block in the unit's operation
    picks the concrete model.  Built-ins:

        constant      --  k_film is the value given (the behaviour)
        SchockMiquel  --  Sherwood correlation for spacer-filled channels,
                          Sh = a Re^b Sc^c  ->  k_film = Sh D / d_h,
                          so k_film is COMPUTED from the local crossflow
                          hydraulics (and falls along the channel as the
                          retentate flow drops).  a/b/c are calibratable
                          (defaults 0.065 / 0.875 / 0.25, Schock & Miquel
                          1987); other spacer fits (Da Costa, Koutsou,
                          Guillen-Hoek) are the same form with different
                          coefficients.

    The unit op owns the geometry: it computes the crossflow velocity u and
    the hydraulic diameter d_h and passes them (with the fluid properties)
    in the context; the model is a thin "given the hydraulics, what is
    k_film".
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

// Local feed-channel hydraulics + fluid properties at one station.
struct MassTransferContext
{
    scalar u   = 0.0;   // crossflow (channel) velocity [m/s]
    scalar d_h = 0.0;   // hydraulic diameter of the spacer channel [m]
    scalar D   = 0.0;   // solute diffusivity [m^2/s]
    scalar mu  = 0.0;   // dynamic viscosity [Pa.s]
    scalar rho = 0.0;   // density [kg/m^3]
};

class MassTransferModel
{
public:
    using Factory = std::function<std::unique_ptr<MassTransferModel>()>;

    virtual ~MassTransferModel() = default;

    virtual const std::string& type() const = 0;

    // Read model-specific parameters from the `massTransfer {... }` block.
    virtual void readParameters(const DictPtr& /*massTransferDict*/) {}

    // Film mass-transfer coefficient k_film [m/s] at this station.
    virtual scalar kFilm(const MassTransferContext& c) const = 0;

    // ---- Factory ----
    static void registerType(const std::string& name, Factory f);
    static std::unique_ptr<MassTransferModel> New(const std::string& name);
    static std::vector<std::string> availableTypes();
    static void registerBuiltins();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
