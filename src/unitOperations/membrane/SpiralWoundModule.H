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
    Choupo::SpiralWoundModule

Description
    A spiral-wound NF / RO module modelled as a 1-D plug-flow channel
    of length L and effective width W (= active area / L).  Feed
    enters at z = 0; permeate is collected on the low-pressure side
    of the membrane along the full length.

    State vector along z:
        Q_b(z)        bulk volumetric flow on the feed side  [m³/s]
        c_b,i(z)      bulk concentration of solute i         [kmol/m³]
        P_b(z)        feed-side pressure                     [bar]

    Physics at each z (the "local module" problem):

        J_w  =  A_w · (P_b − P_p  −  Δπ )                   water flux [m/s]
        J_s,i = B_s,i · (c_m,i − c_p,i )                    solute flux [kmol/(m²·s)]
        c_m,i / c_b,i   from film-model concentration polarisation
                        with mass-transfer coefficient k_film
        c_p,i = J_s,i / J_w                                   permeate composition
        Δπ   = R T  Σ_i  ν_i · (c_m,i − c_p,i)               van't Hoff

    Solute permeabilities B_s,i come from the Membrane database
    (see src/thermo/membrane/), keyed by component short-name.  Any
    solute the membrane has no entry for is treated as perfectly
    rejected (B_s = 0).  Water carries no B_s (it crosses by
    pressure-driven volume flux, not concentration-driven).

    Integration: classical RK4 along z, same scheme as the PFR (the
    independent variable is a length here, not time).  At each RK4
    stage an inner Newton-1D in J_w resolves the coupled
    flux–polarisation–osmotic-pressure non-linearity.

    Pressure drop along the feed channel uses a simple linear
    friction model dP/dz = (P_feed − P_outlet) / L from a
    user-supplied DP_total, sufficient for pedagogical
    accuracy.  A spacer-enhanced correlation is on the list.

    Hardware spec (two forms, never both):
      * `area` + `length` (+ `elements`) — explicit per-element area,
        the legacy spec (numerics untouched);
      * `moduleDiameter` (2.5 | 4 | 8 | 16 in, unit mandatory) +
        `nModules` — nominal 40-inch standard elements; per-module
        area from a hand table (catalogue-typical values, announced).
        `nModules` may be REAL (continuous, for optimisation drivers,
        announced); the fraction marches as a shorter last element.

    Optional `scaling {}` block (unit level, beside `operation`):
    at each module exit the BULK concentrate and the WALL composition
    (c_m — the module's own polarisation model) are speciated
    (electrolyte::SpeciationSolver, Davies; pH given or solved) and
    the SI of each requested mineral recorded.  Diagnostic only —
    never feeds back into the transport.  Emits a per-module profile
    (module, recovery_cum, I_bulk, pH_bulk, SI_<m>_bulk/_wall) that
    REPLACES the per-node z-profile, plus KPIs maxSI_<m>_wall,
    SI0_module_<m> (-1 = never) and SI0_recovery_<m>; the run report
    announces where each mineral first reaches SI = 0 at the wall.
    Requires an ionic water analysis (components = master ions +
    water); refuses loudly otherwise.

    Outputs (in `producedStreams()` order):
        [0] retentate    feed-side outlet at z = L (high pressure,
                          concentrated)
        [1] permeate     accumulated permeate over [0, L]
                          (P = P_permeate, composition is the
                          mass-weighted average of c_p(z))
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitOperation.H"

#include <map>
#include <vector>

namespace Choupo {

class SpiralWoundModule : public UnitOperation
{
public:
    SpiralWoundModule() = default;

    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream>      producedStreams() const override { return out_; }
    std::map<std::string, scalar>   kpis()            const override { return kpis_; }
    std::optional<UnitProfile>      profile()         const override { return profile_; }

private:
    inline static const std::string type_ = "spiralWoundModule";

    std::vector<ProcessStream>     out_;
    std::map<std::string, scalar>  kpis_;
    std::optional<UnitProfile>     profile_;

    // The inner J_w–c_m–c_p problem now lives behind the selectable
    // TransportModel factory (transport/TransportModel.H); the local
    // context + solution structs are defined there.
};

} // namespace Choupo
