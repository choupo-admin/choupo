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
Namespace
    Choupo::gasMixing

Description
    THE LOW-PRESSURE GAS MIXING RULES, IN ONE HOME.

    Wilke's rule for the mixture viscosity and the Wassiljewa form with
    Mason-Saxena interaction factors for the mixture thermal conductivity
    share the SAME phi_ij:

        phi_ij = [1 + (eta_i/eta_j)^1/2 (M_j/M_i)^1/4]^2 / [8 (1 + M_i/M_j)]^1/2

        mu_mix     = sum_i  y_i eta_i / sum_j y_j phi_ij         (Wilke 1950)
        lambda_mix = sum_i  y_i lam_i / sum_j y_j A_ij, A_ij = phi_ij
                                          (Wassiljewa 1904; Mason & Saxena 1958)

    Until 2026-09-05 ThermoPackage.cpp carried that phi_ij TWICE, in
    `viscosityGas` and again in `thermalConductivityGas`, sixty lines apart
    -- one decision, two transcriptions, free to drift the moment somebody
    corrected one exponent.  This header is the one home; the package calls
    it.  The arithmetic is the same expression in the same order, so every
    number the corpus pinned is unchanged (verified on the 41 cases that
    declare a transport block, and by the full suite).

    THE ANCHOR THEORY SUPPLIES.  For identical species phi_ii = (1+1)^2 /
    sqrt(16) = 1 EXACTLY, whatever eta and M -- so a pure gas mixes to itself.
    `verifyIdentity()` checks that, and it is a theory anchor, not an
    arithmetic one: the exponents 1/2, 1/4 and the 8 are what make it hold.

    Citations:
      Wilke, C. R. (1950), J. Chem. Phys. 18, 517-519.
      Wassiljewa, A. (1904), Physik. Z. 5, 737-742.
      Mason, E. A. and Saxena, S. C. (1958), Phys. Fluids 1, 361-369.
\*---------------------------------------------------------------------------*/

#pragma once

#include "CorrelationVerify.H"
#include "core/Types.H"

#include <string>

namespace Choupo {
namespace gasMixing {

//  Wilke's interaction factor phi_ij for pure viscosities eta_i, eta_j
//  [any common unit] and molar masses M_i, M_j [any common unit].
scalar wilkePhi(scalar eta_i, scalar eta_j, scalar M_i, scalar M_j);

//  sum_i y_i q_i / sum_j y_j phi_ij over the species with y > 0.  `q` is the
//  pure-component property being mixed (eta for Wilke, lambda for
//  Wassiljewa/Mason-Saxena); `eta` and `M` feed phi_ij.  Species with
//  y <= 0 are skipped on BOTH indices, exactly as the package always did.
scalar wilkeSum(const sVector& y, const sVector& q,
                const sVector& eta, const sVector& M);

const std::string& wilkeCitation();
const std::string& wassiljewaCitation();

//  phi_ii == 1 for any eta and M: the identity the rule must contain.
CorrelationVerify verifyIdentity();

} // namespace gasMixing
} // namespace Choupo
