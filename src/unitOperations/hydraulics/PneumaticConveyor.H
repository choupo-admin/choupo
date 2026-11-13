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
        u_p    = u_g - s,  s^2 C_D(Re_s) = (4/3) d_p rho_p g (sin th + mu_w cos th) / rho_g
                                                (force balance: drag = wall
                                                 friction + gravity along the
                                                 pipe; sin th = dz/L)
        rho*   = m_dot_solids / (u_p A)         suspended-solids density
        f_p eps^3/(1-eps) = 0.0206 [(1-eps)(u_t/u_p)]^-0.869            (Yang 1974, vertical)
        f_p eps^3/(1-eps) = 0.117  [(1-eps)(u_t/u_p) u_g/sqrt(g D)]^-1.15 (Yang 1974, horizontal)
                 with 1-eps = rho* / rho_p; the vertical form when |dz/L| > 0.5
        u_salt = sqrt(g D) (mu_load 10^(1440 d_p+1.96))^(1/(1100 d_p+2.5)) (Rizk)

    The slip s is iterated on C_D at the slip Reynolds number.  mu_w is the
    particle-wall Coulomb friction coefficient, `particleWallFriction` in the
    operation block (0.4 when the case declares none); the run publishes it as
    a KPI and prints it in the verbosity >= 2 banner.  The balance has two
    limits: a vertical line, s ~ u_t (drag = gravity), and a horizontal one,
    s ~ u_t sqrt(mu_w) (drag = wall friction); both hold up to the gas
    buoyancy, which the balance leaves out, and the horizontal one also up to
    C_D changing with the slip.  A slip that leaves u_p <= 0.02 u_g (the gas
    below pickup) is floored there, so that rho* stays finite, and the
    verbosity >= 2 banner marks the particle velocity BELOW PICKUP.

    The conveyor REPORTS the saltation velocity u_salt and warns aloud if the
    gas velocity falls below it (risk of saltation / line blockage) -- a
    first-class, announced design check, never a silent clip.

    Hardware-only operation block (the credo): pipe diameter, length, vertical
    rise; every velocity, the suspended density and the pressure drop are
    RESULTS.  Particle density comes from the solid component's `solid{rho_p}`;
    the size from the inlet PSD (Sauter mean for the drag).

    The single-particle drag is Schiller-Naumann, C_D = 24/Re (1 + 0.15
    Re^0.687) below Re = 1000 and 0.44 above: the two branches do not meet
    (0.43829 against 0.44, a step of 0.39 %), so a sweep across Re ~ 1000 can
    show a small kink.  The terminal velocity is found by substitution (relative
    change below 1e-6, at most 60 passes); a particle sitting on the step can
    make it cycle, and a run that misses the rule says so on the advisory log.

    Inputs (feed );   outputs (conveyed );
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitOperation.H"

#include <map>

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
