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

#include "ElectricLoad.H"
#include "core/DisplayUnits.H"

#include <cmath>
#include <iomanip>
#include <iostream>

namespace Choupo {

int ElectricLoad::solve(const DictPtr& dict,
                        const ThermoPackage& /*thermo*/,
                        int verbosity)
{
    kpis_.clear();

    // The shaft power lands in `operation` via the energy wire's
    // `target W_shaft`.  Convention (matching turbine / compressor):
    //   - turbine declares `expression "-W_shaft"` on its output port,
    //     so a turbine extracting 5 kW publishes +5000 W on the wire;
    //   - the load reads it as a positive `W_shaft` here, meaning
    //     "shaft power flowing INTO the load".
    const DictPtr op = dict->found("operation") ? dict->subDict("operation")
                                                : DictPtr();
    const scalar W_shaft_in =
        (op && op->found("W_shaft")) ? op->lookupScalar("W_shaft", Dims::power)
                                     : 0.0;

    const scalar eta = (op && op->found("eta")) ? op->lookupScalar("eta") : 1.0;
    if (eta <= 0.0 || eta > 1.0)
        throw std::runtime_error("electricLoad '" +
            dict->lookupWordOrDefault("name", "?") +
            "': eta must be in (0, 1]; got " + std::to_string(eta));

    const scalar W_electric = W_shaft_in * eta;          // shipped to grid
    const scalar W_losses   = W_shaft_in * (1.0 - eta);  // dissipated as heat

    kpis_["W_shaft"]      = W_shaft_in;
    kpis_["W_shaft_kW"]   = W_shaft_in / 1000.0;
    kpis_["W_electric"]   = W_electric;
    kpis_["W_electric_kW"]= W_electric / 1000.0;
    kpis_["W_losses"]     = W_losses;
    kpis_["eta_generator"]= eta;

    if (verbosity >= 2)
    {
        std::cout << "  W_shaft_in   = " << std::fixed << std::setprecision(2)
                  << W_shaft_in / 1000.0 << " kW\n"
                  << "  eta_gen      = " << eta << "\n"
                  << "  W_electric   = " << W_electric / 1000.0 << " kW\n"
                  << "  W_losses     = " << W_losses   / 1000.0 << " kW\n";
    }

    return 0;
}

} // namespace Choupo
