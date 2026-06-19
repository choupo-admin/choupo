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
    Choupo::Evaporator

Description
    Single-effect evaporator -- modelled as a *physical equipment*,
    not a degree-of-freedom puzzle.  The unit op has the shape every
    chem-eng student carries in their head:

                          heating vapour (T_steam)
                                  |
                                  v
                          +---------------+
              feed --->   |   evaporator  +---> solvent vapour
              liquid      |   (area, U)   |
                          +-------+-------+
                                  |
                                  v
                          concentrated liquid    +   condensate

    The user specifies the *physical* parameters of the equipment
    (heat-exchange `area`, overall HTC `U`) and the operating
    `P`; the simulator iterates V/F until the energy balance
    closes against the geometric Q = U.A.dT.  All other quantities
    (V/F, Q, T_boil, F_steam) come out as RESULTS, not inputs.

    If the student wants a target that is not a natural input of
    the equipment ("V/F = 0.5", "x_3 = 0.25", "A_1 = A_2 = A_3"),
    that is the job of an outer DesignSpec controller --- the
    A block that manipulates one or more inputs until a
    constraint on the outputs is met.

Inputs (flowsheetDict `inputs (feed heatingSteam );`)

    1.  feed              process liquid: F, T, P, composition
    2.  heatingSteam      heating-side stream; only T (and P) are
                          read.  F is computed by the unit op from
                          the energy balance and reported as a KPI;
                          the value the user puts on this stream's
                          F is informational (set to 0).

Operation block

    operation
    {
        P     0.8 bar;          // process-side pressure
        area  100 m^2;          // heat-exchange surface
        U     2319 W/(m^2.K);   // overall heat-transfer coefficient
        Tref  298.15 K;         // optional, default 298.15
    }

Outputs (3 streams in `outputs (... )`)

    1.  concentrated      L = F.(1 - V/F),  x_solute enriched
    2.  solventVapour     V = F.V/F,        pure solvent
    3.  condensate        F_steam computed; T = T_steam, vf = 0
                          (steam fully condensed).

KPIs reported

    V_over_F, duty_kW, T_boil, T_sat_pure, dT, A_m2, U_W_m2_K,
    F_steam_kg_h, economy (= V_evap / F_steam, both mass),
    molality, BPE.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/UnitOperation.H"

#include <string>

namespace Choupo {

class Evaporator : public UnitOperation
{
public:
    Evaporator() = default;

    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream> producedStreams() const override
    {
        return produced_;
    }

    std::map<std::string, scalar> kpis() const override
    {
        return kpis_;
    }

    // Input 1 is the heating-side stream (typically saturated steam);
    // see the file's inputs comment near the top.
    std::vector<std::size_t> utilityPorts() const override { return {1}; }

private:
    inline static const std::string type_ = "evaporator";
    std::vector<ProcessStream>      produced_;
    std::map<std::string, scalar>   kpis_;
    scalar                          F_steam_kmol_s_ = 0.0;
};

} // namespace Choupo
