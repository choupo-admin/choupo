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
    Choupo::saturatedVapourPhi

Description
    THE gamma-phi REFERENCE FUGACITY HAS ONE HOME (C235, 2026-11-07).

    With a real vapour the K-value is  K_i = gamma_i f_i^ref / (phi_i^V P)
    and the reference of the pure liquid is not Psat_i alone but

        f_i^ref(T) = phi_i^sat(T) Psat_i(T),
        phi_i^sat  = the PURE vapour fugacity coefficient of the vapour's
                     own equation of state at (T, Psat_i).

    Without phi_sat the vapour's departure from ideality is counted on one
    side of the equilibrium only: at 401 K, ln phi_sat of a C4 is about
    -0.14 and d ln P / dT = dHvap/(R T^2) turns that into a boiling
    temperature about 7 K low (column19 under SRK, measured).  With an
    ideal vapour phi_sat = 1 and this code is not entered.

    NOT in this reference, and said here because it is a choice: the
    Poynting factor exp(v_L (P - Psat)/RT).  At the pressures of the corpus
    gamma-phi cases it is within a fraction of a percent of 1; a case at
    hundreds of bar needs it, and it is the named next slice.

    Doors (as for saturationPressure): ThermoPackage::phiSat (every K route
    that reads a Psat) and the phase layer's LiquidPhase / SolidPhase
    (Kvec_phases), which hold the vapour's EoS by borrowed pointer, rebound
    when the package moves.  Neither carries a copy of the rule.  The EoS
    root is the vapour root; above Tc the EoS has one root and Psat is an
    extrapolation, and what the EoS returns is taken if it is finite.  If it
    is not (or Psat is not), the factor is 1 and that is ANNOUNCED once per
    component -- never a silent fallback.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <cstddef>

namespace Choupo {

class Component;
class EquationOfState;

//  phi_i^sat(T) = phi_i(T, Psat, e_i) of `eos`; `n` is the component count
//  of the package; `Psat_Pa` [Pa] is the package's saturation pressure of i.
scalar saturatedVapourPhi(const EquationOfState& eos, const Component& c,
                          std::size_t i, std::size_t n,
                          scalar T_K, scalar Psat_Pa);

} // namespace Choupo
