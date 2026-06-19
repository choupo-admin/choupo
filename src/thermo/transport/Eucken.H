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
    Choupo::Eucken

Description
    Eucken (1913) estimate for low-pressure gas thermal conductivity
    (Reid-Prausnitz-Poling, "The Properties of Gases and Liquids", 4th
    ed., eq. 10-3.2):

        λ = (Cp_ig + 5R/4) · μ / M                       [W/(m·K)]

    where Cp_ig is the molar ideal-gas heat capacity [J/(mol·K)], μ the
    pure-component gas viscosity [Pa·s], and M the molar mass [kg/mol].
    Uses ONLY quantities already available (Cp from the component's
    idealGasHeatCapacity block, μ from the viscosity model) --- zero new
    component data.  Reproduces N2 (~0.026), CO2 (~0.017) thermal
    conductivity at 300 K to a few percent --- the simplest defensible
    correlation.  (The modified Eucken splits translational/internal
    contributions for better accuracy; left as a future model.)
\*---------------------------------------------------------------------------*/

#pragma once

#include "ThermalConductivityModel.H"

namespace Choupo {

class Eucken : public ThermalConductivityModel
{
public:
    explicit Eucken(const DictPtr& /*dict*/) {}

    const std::string& modelName() const override { return name_; }
    scalar conductivityGasPure(const Component& c, scalar T_K,
                               scalar mu_pure,
                               scalar cp_ig_pure) const override;

private:
    inline static const std::string name_ = "Eucken";
};

} // namespace Choupo
