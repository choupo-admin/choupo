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
    Choupo::PSA

Description
    Pressure-swing adsorption as a steady FLOWSHEET unit operation: one feed
    in, two products out --- a high-pressure RAFFINATE (the light product,
    outputs[0]) and a low-pressure TAIL gas (the extract, outputs[1]).

    This is the equilibrium cyclic-steady-state ("equilibrium theory" /
    local-equilibrium) shortcut of Knaebel / LeVan / Sircar.  The bed is
    assumed isothermal and to reach equilibrium at each pressure level; the
    swing between P_high (adsorption) and P_low (regeneration) drives the
    separation.  Per species i, on the COMPETITIVE (extended) Langmuir
    isotherm of the named adsorbent:

        Dq_i = eta * [ q_i({y_j P_high}) - q_i({y_j P_low}) ]   [mol/kg]

    where eta in (0,1] is the equilibrium-utilisation / LUB derating
    (MANDATORY, default 0.80; eta=1 is the thermodynamic ceiling, printed as
    such).  The captured (swung-to-tail) flow of i is

        S_i = min( Dq_i * w * F , y_i,F * F )           (clamp announced)

    with w = bedCapacity [kg adsorbent per mol of feed throughput] --- the
    lumped throughput knob (cycle time / bed volume are deliberately collapsed
    into it).  Note eta is applied ONCE, in Dq_i.  A purge G = gamma*F drawn
    from the clean light product is swept countercurrent into the tail:

        n_i,R = y_i,F F - S_i - gamma F x_i,R     (raffinate, light product)
        n_i,T = S_i + gamma F x_i,R               (tail gas, extract)
        x_i,R = n_i,R / Sum_k n_k,R               (implicit -> fixed-point)

    A species with NO isotherm block adsorbs nothing (Dq=0 -> reports to the
    raffinate).  An optional blowdownLoss vents that fraction of light product
    with the tail (CORRECTION 3); if absent the report says the ~10-15 % loss
    is unmodelled.

    HARDWARE in, RESULTS out: a result-named key (recovery / purity / ...) in
    operation{} is REFUSED --- hitting a target is an outer-driver job.

    What this shortcut does NOT model is announced in the run header:
    breakthrough / cycle time / kinetics, thermal swing, IAST-level
    heterogeneity, hydraulics.  "All models are wrong, some useful."
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitOperation.H"

#include <map>
#include <optional>
#include <vector>

namespace Choupo {

class PSA : public UnitOperation
{
public:
    PSA() = default;

    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream>    producedStreams() const override { return out_;  }
    std::map<std::string, scalar> kpis()            const override { return kpis_; }
    std::optional<UnitProfile>    profile()         const override { return profile_; }

private:
    inline static const std::string type_ = "psa";

    std::vector<ProcessStream>    out_;
    std::map<std::string, scalar> kpis_;
    std::optional<UnitProfile>    profile_;
};

} // namespace Choupo
