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
Function
    Choupo::liquidReferenceFactor

Description
    THE gamma-phi REFERENCE FUGACITY HAS ONE HOME (C235, 2026-11-07).

    With a real vapour the K-value is  K_i = gamma_i f_i^ref / (phi_i^V P)
    and the reference of the pure liquid is not Psat_i alone but

        f_i^ref(T, P) = phi_i^sat(T) * Psat_i(T) * exp(V_L (P - Psat_i)/(R T)),

        phi_i^sat = the PURE vapour fugacity coefficient of the vapour's own
                    equation of state at (T, Psat_i),
        V_L       = the component record's declared `Vliq` (constant, m3/mol,
                    its value at 25 C: the package publishes no better liquid
                    molar volume on one home, and the Rackett closure is a
                    derivative the record does not store).

    This function returns the FACTOR  phi_sat * Poynting, which multiplies
    Psat.  Without phi_sat the vapour's departure from ideality is counted
    on one side of the equilibrium only (column19 under SRK: T about 6 K
    low); without Poynting phi_sat over-corrects at high pressure (NH3 at
    313 K and 150 bar: phi_sat ~ 0.86 and Poynting ~ 1.15 nearly cancel).
    With an ideal vapour this code is not entered.

    A SATURATED VAPOUR EXISTS ONLY BELOW Tc, and the factor must be
    CONTINUOUS in T (C239: a jump from ~0.7 to 1 at Tc stalled the MESH
    Newton of column08).  Above T_cap = 0.99 Tc the factor is HELD at its
    value at T_cap (phi_sat at (T_cap, Psat(T_cap)), Poynting at that
    state), announced once per component; `psatAt` is the caller's own
    Psat(T), so the held value comes from the same vapour-pressure model.
    Without `psatAt` the old rule applies (factor 1 at T >= Tc).  A
    component with no declared Tc has factor 1, announced.  A component with no `Vliq` keeps phi_sat and gets Poynting = 1,
    announced once by name.  A non-finite Psat or EoS value gives 1,
    announced.  Never a silent fallback.

    Doors (as for saturationPressure): ThermoPackage::refFactor (every K
    route that reads a Psat) and the phase layer's LiquidPhase / SolidPhase
    (Kvec_phases), which hold the vapour's EoS by borrowed pointer, rebound
    when the package moves.  Neither carries a copy of the rule.  Both
    liquids of an LL pair are evaluated at the same (T, P), so the factor
    cancels in their ratio; the solid carries the SAME factor as the liquid
    it is measured against, so the freezing-point identity (f_S/f_L) cannot
    move with the vapour.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <cstddef>
#include <functional>

namespace Choupo {

class Component;
class EquationOfState;

//  phi_i^sat(T) * exp(V_L (P - Psat)/(R T)); `n` is the component count of
//  the package; `Psat_Pa` [Pa] is the package's saturation pressure of i.
scalar liquidReferenceFactor(const EquationOfState& eos, const Component& c,
                             std::size_t i, std::size_t n,
                             scalar T_K, scalar P_Pa, scalar Psat_Pa,
                             const std::function<scalar(scalar)>& psatAt = {});

} // namespace Choupo
