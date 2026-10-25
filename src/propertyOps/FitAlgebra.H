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
    Choupo::fitAlgebra

Description
    The small dense algebra the fits of `fitParameters` share: a Gauss-Jordan
    inverse with a pivot-ratio condition estimate, the damped normal-equation
    step of Levenberg-Marquardt, a cyclic-Jacobi eigen-decomposition (the
    identifiability test's singular values) and the two-sided 95 % Student-t
    value.  DEFINED ONCE, in FitParameters.cpp, where the bubble and isotherm
    fits have always used them; exported here when the membrane residual
    (FitParametersMembrane.cpp, DEV.md 4c C149) became a second translation
    unit that needs them, so it is not a second copy.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <vector>

namespace Choupo {
namespace fitAlgebra {

std::vector<sVector> invertGaussJordan(const std::vector<sVector>& A, bool& ok,
                                       scalar& condEstimate);
scalar  tCrit95(int dof);
sVector solveDamped(const std::vector<sVector>& J, const sVector& r, scalar lambda);
//  Eigenvalues ascending; eigenvectors as the COLUMNS of *V when V is given.
sVector jacobiEig(const std::vector<sVector>& A, std::vector<sVector>* V);

} // namespace fitAlgebra
} // namespace Choupo
