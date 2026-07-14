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
    Choupo::PneumaticConveyor

Description
    Dilute-phase pneumatic conveying of solids in a gas stream (the conveying
    LINE, not the blower): computes the pressure drop and the gas/particle
    velocities for a horizontal and/or vertical pipe run.

    The total pressure drop is the textbook sum of contributions (Rhodes,
    "Introduction to Particle Technology", Ch.8; Perry 8th ed. §17):

        dP = dP_gasAccel + dP_solidsAccel       (acceleration)
           + dP_gasFriction + dP_solidsFriction (wall friction)
           + dP_gasStatic   + dP_solidsStatic   (gravity, vertical run dz)

    with
        u_g    = Q_gas / A                      superficial gas velocity
        u_p    = u_g (1 - 0.68 d_p^0.92 rho_p^0.5 rho_g^-0.2 D^-0.54)   (Hinkle)
        rho*   = m_dot_solids / (u_p A)         suspended-solids density
        f_p    = 3/8 (rho_g/rho_p) C_D (D/d_p) ((u_g-u_p)/u_p)^2        (Hinkle)
        u_salt = sqrt(g D) (mu_load 10^(1440 d_p+1.96))^(1/(1100 d_p+2.5)) (Rizk)

    The conveyor REPORTS the saltation velocity u_salt and warns aloud if the
    gas velocity falls below it (risk of saltation / line blockage) -- a
    first-class, announced design check, never a silent clip.

    Hardware-only operation block (the credo): pipe diameter, length, vertical
    rise; every velocity, the suspended density and the pressure drop are
    RESULTS.  Particle density comes from the solid component's `solid{rho_p}`;
    the size from the inlet PSD (Sauter mean for the drag).

    Inputs (feed );   outputs (conveyed );
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitOperation.H"

namespace Choupo {

class PneumaticConveyor : public UnitOperation
{
public:
    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream>    producedStreams() const override { return produced_; }
    std::map<std::string, scalar> kpis()            const override { return kpis_; }

private:
    inline static const std::string type_ = "pneumaticConveyor";
    std::vector<ProcessStream>    produced_;
    std::map<std::string, scalar> kpis_;
};

} // namespace Choupo
