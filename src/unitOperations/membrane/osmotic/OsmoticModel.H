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
    Choupo::OsmoticModel

Description
    Selectable osmotic-pressure model for the spiral-wound membrane: given a
    solute concentration it returns the osmotic pressure π [Pa].  The film /
    solution-diffusion solver uses Δπ = π(c_m) − π(c_p) (wall minus permeate)
    as the back-pressure that opposes the water flux.

    Explicit-factory pattern (parallel to MassTransferModel /
    PressureDropModel).  An `osmotic { model <name>;... }` sub-block in the
    unit's operation picks the model; without it `vanHoff` (the baseline) is used.  Built-ins:

        vanHoff  --  ideal/dilute:  π = ν R T c   (osmotic coefficient φ = 1)
        Pitzer   --  ion-interaction osmotic coefficient for a 1:1 salt,
                     π = φ(I) · ν R T c, with
                       φ = 1 − A_φ √I/(1+b√I) + m B^φ + m² C^φ,
                       B^φ = β⁰ + β¹ exp(−α√I),  I ≈ m ≈ c (1:1, dilute
                       molality).  Defaults are NaCl at 25 °C (β⁰ 0.0765,
                       β¹ 0.2664, C^φ 0.00127, A_φ 0.391, b 1.2, α 2.0);
                       calibratable.  For seawater NaCl φ ≈ 0.92 < 1, so
                       van't Hoff OVER-estimates π --- Pitzer relaxes it,
                       giving a higher flux/recovery.

    Scope: a single 1:1 electrolyte (the seawater-RO case); each solute is
    treated independently (no mixed-electrolyte θ/ψ terms).
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

struct OsmoticContext
{
    scalar c  = 0.0;    // solute concentration [kmol/m^3]
    scalar nu = 1.0;    // dissociation (van't Hoff factor)
    scalar T  = 298.15; // temperature [K]
};

class OsmoticModel
{
public:
    using Factory = std::function<std::unique_ptr<OsmoticModel>()>;

    virtual ~OsmoticModel() = default;

    virtual const std::string& type() const = 0;
    virtual void readParameters(const DictPtr& /*osmoticDict*/) {}

    // Osmotic pressure [Pa] of a solution at concentration c.
    virtual scalar osmoticPressure(const OsmoticContext& ctx) const = 0;

    // ---- Factory ----
    static void registerType(const std::string& name, Factory f);
    static std::unique_ptr<OsmoticModel> New(const std::string& name);
    static std::vector<std::string> availableTypes();
    static void registerBuiltins();

protected:
    // Gas constant in Pa·m³/(kmol·K) --- c [kmol/m³] · R · T → Pa.
    static constexpr scalar R_Pa_kmol = 8314.462618;

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
