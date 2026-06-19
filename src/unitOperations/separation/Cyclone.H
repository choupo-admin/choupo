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
    Choupo::Cyclone

Description
    Gas-solid cyclone separator (Lapple standard-geometry model).
    Separates particulate solids from a gas stream BY SIZE: coarse
    particles are captured, fines escape with the gas (grade-efficiency
    curve, cut diameter d50).  This is why a cyclone needs a particle-size
    distribution (PSD) on the inlet --- without one it would just be a
    splitter.

    Hardware-only operation block (the credo): the body diameter (and the
    effective number of turns); the cut diameter d50, the grade efficiency
    and the collection efficiency are RESULTS.

    Lapple cut diameter (Reid-Prausnitz-Poling / Perry):

        d50 = sqrt( 9 μ b / (2 π N_e v_i (ρ_p − ρ_g)) )

    with b = D_c/4 (inlet width), inlet area A = D_c²/8, inlet velocity
    v_i = Q_gas / A, gas viscosity μ from the transport model (Chung), gas
    density ρ_g = P·MW/(R T), particle density ρ_p from the solid component.
    Grade efficiency (Lapple):  η(d) = 1 / (1 + (d50/d)²).

    Inputs (feed );   outputs (cleanGas  capturedSolids );
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitOperation.H"

namespace Choupo {

class Cyclone : public UnitOperation
{
public:
    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream>    producedStreams() const override { return produced_; }
    std::map<std::string, scalar> kpis()            const override { return kpis_; }
    std::optional<UnitProfile>    profile()         const override { return profile_; }

private:
    inline static const std::string type_ = "cyclone";
    std::vector<ProcessStream>       produced_;
    std::map<std::string, scalar>    kpis_;
    std::optional<UnitProfile>       profile_;
};

} // namespace Choupo
