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
File
    src/unitOperations/rotating/IsentropicCore.H

Description
    Shared isentropic-discharge solver for gas-phase rotating equipment
    (compressor and turbine).  Both machines transfer shaft work to/from
    a gas; the difference is only the SIGN of the work and the
    definition of isentropic efficiency:

        Compressor (W > 0, adds energy):
            eta = w_isen / w_real        =>  w_isen = eta * w_real
            (real work EXCEEDS ideal --- losses cost extra energy)

        Turbine (W < 0, extracts energy):
            eta = w_real / w_isen        =>  w_isen = w_real / eta
            (real work is LESS than ideal --- losses reduce the yield)

    Both end up calling the SAME machinery: find the discharge pressure
    P_out such that the isentropic path (constant entropy from the inlet)
    reaches the enthalpy  h_in + w_isen_target; then the real discharge
    temperature from the first-law balance at that P_out.

    The pump is NOT handled here --- it is incompressible (v ~ const) so
    its discharge is a closed-form expression with no EoS / Newton.

    Pedagogical credo: P_out is always a RESULT (a property of the
    outlet stream).  The OP hardware is W_shaft + eta only.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"
#include "thermo/ThermoPackage.H"

namespace Choupo {
namespace rotating {

struct DischargeResult
{
    scalar P_out      = 0.0;   // discharge pressure  [Pa]   (RESULT)
    scalar T_out      = 0.0;   // real discharge T    [K]    (RESULT)
    scalar T_out_isen = 0.0;   // isentropic discharge T [K] (diagnostic)
    int    outerIters = 0;
    bool   converged  = false;
};

// Newton-1D in T such that S_real(T, P, y) = s_target  (warm-seeded).
scalar solveT_for_S(const ThermoPackage& thermo, scalar s_target,
                    scalar P_Pa, const sVector& y, scalar T_guess);

// Newton-1D in T such that H_real(T, P, y) = h_target.
scalar solveT_for_H(const ThermoPackage& thermo, scalar h_target,
                    scalar P_Pa, const sVector& y, scalar T_guess);

// Full discharge solve shared by compressor and turbine.
//
//   inlet:           (T_in, P_in, y), h_in, s_in
//   w_real_per_mol:  signed shaft work per mole [J/mol] (+comp, -turb)
//   w_isen_per_mol:  signed isentropic work per mole [J/mol]
//   expansion:       true for a turbine (search P_out < P_in)
//   verbosity:       >= 3 prints the outer Newton trace
//
// Returns the discharge state; `converged` is false if either the
// outer P_out Newton or an inner T solve failed.
DischargeResult solveDischarge(const ThermoPackage& thermo,
                               scalar T_in, scalar P_in, const sVector& y,
                               scalar h_in, scalar s_in,
                               scalar w_real_per_mol,
                               scalar w_isen_per_mol,
                               bool   expansion,
                               int    verbosity);

} // namespace rotating
} // namespace Choupo
