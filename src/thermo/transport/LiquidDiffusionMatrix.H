/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/
/*---------------------------------------------------------------------------*\
File
    LiquidDiffusionMatrix.H

Description
    The thermodynamic-factor matrix [Gamma] and the Fick matrix [D] of a
    liquid of n components, as PROPS QUANTITIES (C329 slice B2a): nothing in a
    unit reads them -- a liquid film takes `thermodynamicFactor { take 1; }`.
    They exist so the student sees what that choice omits, and so the
    Kooijman-Taylor pair values can be scored against measured Fick matrices.

      [Gamma]_ij = delta_ij + x_i d ln gamma_i / d x_j     i, j = 1 .. n-1
                   at constant T, P and the other independent mole fractions,
                   component n taking the change
                   (Kooijman & Taylor 1991, Eq. 4, p. 1217);
      [B]_ii     = x_i/D_in + sum_{k != i} x_k/D_ik           (Eq. 7)
      [B]_ij     = -x_i (1/D_ij - 1/D_in)                     (Eq. 8)
      [D]        = [B]^-1 [Gamma]                             (Eq. 6)

    D_ij are the pair values of liquidPairDiffusivity (Eq. 23).  The
    matrices depend on WHICH component is numbered last: the LAST component of
    the package, always, and the run says so.

    The derivative is a central difference of the package's own ln gamma, in
    mole fraction, with the step below (printed by the operation's header).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"
#include <vector>

namespace Choupo {

class ThermoPackage;

namespace liquidDiffusion {

//  The step in mole fraction of the central difference.
constexpr scalar gammaStep = 1.0e-6;

//  (n-1) x (n-1), row-major vectors.  Every component must be present
//  (x_i > 2 gammaStep); refused by name otherwise.
std::vector<std::vector<scalar>> thermodynamicFactor(const ThermoPackage& thermo,
                                                     scalar T, const sVector& x);
std::vector<std::vector<scalar>> fickMatrix(const ThermoPackage& thermo,
                                            scalar T, const sVector& x);

} // namespace liquidDiffusion
} // namespace Choupo
