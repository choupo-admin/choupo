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
    Choupo::VaporPressureModel

Description
    Abstract base for pure-component vapour-pressure models  P_i^sat(T).
    Concrete models (Antoine, ExtendedAntoine, DIPPR101,...) register
    themselves through `VaporPressureModel::registerModel(name, factory)`.

    Selected at run-time via the dictionary entry

        vaporPressure
        {
            model           Antoine;          // factory key
            coefficients    (A B C);
            Trange          (Tmin Tmax);
        }
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <functional>
#include <map>
#include <memory>
#include <string>

namespace Choupo {

class VaporPressureModel
{
public:
    virtual ~VaporPressureModel() = default;

    // Saturation pressure in Pa at temperature T [K] (canonical SI
    //; was bar in earlier editions).
    virtual scalar Psat_Pa(scalar T_K) const = 0;

    // Optional temperature range (Tmin, Tmax) of validity.
    virtual std::pair<scalar, scalar> range() const = 0;

    virtual const std::string& modelName() const = 0;

    // ---- Factory -----------------------------------------------------------
    using Factory = std::function<std::unique_ptr<VaporPressureModel>(const DictPtr&)>;
    static void registerModel(const std::string& name, Factory f);
    static std::unique_ptr<VaporPressureModel> New(const DictPtr& dict);

    // Registers the built-in models (Antoine,...).  Call once at startup.
    static void registerBuiltins();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
