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
    Choupo::Atomizer

Description
    A spray-dryer ATOMIZER correlation: the device that breaks the liquid feed
    into droplets, returning the Sauter mean diameter d32 (and the width of the
    size distribution).  A selectable family, explicit-factory (registerType /
    New / registerBuiltins, called from UnitOperation::registerBuiltins) so a
    student sees exactly where each correlation comes from -- no auto-reg magic.

    Grammar (the SprayDryer reads it):
        operation { atomiser { model pressureNozzle; deltaP 5 bar; } }
    Absent -> the default `rotary` (Friedman) reading the legacy operation keys,
    so pre-atomiser-block cases stay byte-identical.

    The correlation reads the LIQUID properties (mu_L, sigma, rho_L -- ideally
    from the property layer with mixing rules) via `Feed`; the atomizer HARDWARE
    (wheel speed/diameter, injection pressure, air/liquid ratio) it reads from
    its own dict.  d32 is a RESULT (the credo: specify hardware, compute size).

    "All models are wrong, but some are useful": each correlation is an ALGEBRAIC
    fit (no CFD) and announces its source + validity envelope at run time.
    References: Lefebvre & McDonell, Atomization and Sprays 2nd ed. 2017
    (DOI 10.1201/9781315120911); Wang & Lefebvre 1987 (DOI 10.2514/3.22946);
    Lorenzetto & Lefebvre 1977 (DOI 10.2514/3.60742); Marshall 1954 (rotary);
    Rosin & Rammler 1933 (the size distribution).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <functional>
#include <map>
#include <memory>
#include <string>

namespace Choupo {

class Atomizer
{
public:
    // Liquid state the correlation needs (SI); ideally the SOLUTION values from
    // the property layer (mixing rules), not the pure solvent.
    struct Feed
    {
        scalar mFeed;   // liquid mass flow                     [kg/s]
        scalar rhoL;    // liquid density                       [kg/m^3]
        scalar muL;     // liquid dynamic viscosity             [Pa.s]
        scalar sigma;   // liquid surface tension               [N/m]
        scalar rhoGas;  // surrounding gas density              [kg/m^3]
        // Pressures (SI, Pa) -- the atomising pressure a pressure nozzle uses is
        // NOT a free knob: it is the FEED stream's pressure above the chamber
        // (the pump imposes pFeed; the nozzle drops it to pChamber).  0 -> the
        // atomiser falls back to its own `deltaP`.  (Information follows streams.)
        scalar pFeed    = 0.0;
        scalar pChamber = 0.0;
        scalar muGas    = 1.8e-5;   // gas dynamic viscosity [Pa.s] -- rotary windage
    };

    // d32 = Sauter mean diameter [m]; spread = Rosin-Rammler width q (higher =
    // narrower); power = a SHAFT power estimate [W] (0 if not modelled -- the note
    // says how it splits); a one-line human note on the source + validity (printed
    // by the dryer, peer to the surface-tension source line -- no silent crutch).
    struct DropletResult
    {
        scalar      d32   = 0.0;
        scalar      spread = 2.0;
        scalar      power = 0.0;    // shaft power estimate [W]
        std::string note;
    };

    virtual ~Atomizer() = default;

    virtual const std::string& name() const = 0;
    virtual DropletResult dropletSize(const Feed& feed) const = 0;

    // ---- Explicit factory (Choupo convention -- no auto-registration) --------
    using Factory = std::function<std::unique_ptr<Atomizer>(const DictPtr&)>;
    static void registerType(const std::string& name, Factory f);
    static std::unique_ptr<Atomizer> New(const DictPtr& dict);   // reads `model`
    static void registerBuiltins();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
