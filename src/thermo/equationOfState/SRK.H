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
    Choupo::SRK

Description
    Soave-Redlich-Kwong cubic equation of state, vapour root.

        P = R·T / (v − b) − a(T) / (v · (v + b))

    Pure-component parameters:

        a_c,i = 0.42747 · R² · Tc_i² / Pc_i
        b_i   = 0.08664 · R · Tc_i  / Pc_i
        α_i(T) = [ 1 + m_i · (1 − √(T/Tc_i)) ]²
        m_i    = 0.48508 + 1.55171·ω_i − 0.15613·ω_i²   (Graboski & Daubert
                 1978; Soave 1972 printed 0.480 + 1.574 ω − 0.176 ω²)
        a_i(T) = a_c,i · α_i(T)

    Van der Waals one-fluid mixing rule:

        a_mix(T)  = ΣΣ y_i y_j · (1 − k_ij) · √(a_i(T) · a_j(T))
        b_mix     = Σ y_i b_i

    Dimensionless:

        A = a_mix · P / (R·T)²,   B = b_mix · P / (R·T)

    The cubic in Z:

        Z³ − Z² + (A − B − B²) Z − A·B = 0

    is solved by the ONE root picker of the generic cubic (CubicEoS.H,
    "THE ROOT PICKER"): three real roots give the liquid (smallest above
    B) and the vapour (largest); one real root is returned for the side it
    lies on, and the other side gets a FLAGGED pseudo-root (C245 slice 4 --
    it used to get the same root, unflagged).

    Fugacity coefficient of component i in the mixture (vapour root):

        ln φ_i = (b_i / b_mix) · (Z − 1)
               − ln(Z − B)
               − (A / B) · [ 2 · (Σ_j y_j (1 − k_ij) √(a_i a_j)) / a_mix
                              − b_i / b_mix ]
                 · ln(1 + B / Z)

    Departure functions (residual H, S) at the vapour root:

        H^R(T, P, y) = R·T·(Z − 1)
                     + (T · da_mix/dT − a_mix) / b_mix · ln(Z / (Z + B))

        S^R(T, P, y) = R · ln(Z − B)
                     + (da_mix/dT) / b_mix · ln(Z / (Z + B))

    with

        da_i/dT     = a_c,i · (−m_i · [1 + m_i·(1 − √Tr)] / √(T · Tc_i))
        da_mix/dT  = ΣΣ y_i y_j · (1 − k_ij)
                        · ½ · ( √(a_j/a_i) · da_i/dT + √(a_i/a_j) · da_j/dT )

    Dictionary form (in `thermoPackage`):

        equationOfState
        {
            model           SRK;

            // Binary interaction parameters (optional; k_ij = 0 by default).
            binaryInteractions
            (
                { i  N2;    j  CH4;   kij  0.0289; }
                { i  CO2;   j  CH4;   kij  0.0919; }
            );
        }
\*---------------------------------------------------------------------------*/

#pragma once

#include "CubicEoS.H"

#include <memory>
#include <vector>

namespace Choupo {

// The arithmetic (roots, phi, departures, mixing rule) lives in CubicEoS;
// SRK supplies its constants (eps = 0, sigma = 1, Omega_a, Omega_b) and its
// slope m(omega).
class SRK : public CubicEoS
{
public:
    SRK(const std::vector<Component>& comps,
        const std::vector<std::vector<scalar>>& kij);

    // Convenience: factory from a dict block.  Reads optional
    // `binaryInteractions (... );` sub-list, defaulting to k_ij = 0.
    static std::unique_ptr<EquationOfState>
    fromDict(const DictPtr& eosDict, const std::vector<Component>& comps);
};

} // namespace Choupo
