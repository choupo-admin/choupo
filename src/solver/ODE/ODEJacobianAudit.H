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
Description
    The audit of an ANALYTIC Jacobian (ODEAnalyticJacobian), shared by every
    stiff integrator that reads one: Rosenbrock23 / Rodas4 and Seulex.  The
    claim "this is d f / d y" is measured against a central difference at the
    doubling schedule (1st, 2nd, 4th, ... Jacobian); a false column refuses
    the run by name.  Defined in Rosenbrock23.cpp (where it was written).
\*---------------------------------------------------------------------------*/

#pragma once

#include "ODEIntegrator.H"

namespace Choupo::solver::detail
{

//- The audit's reference Jacobian: a central difference with column step
//  cbrt(eps) s_j (forward where a guarded row sits within the step of zero).
std::vector<sVector> auditDifference(const DerivFn& f, scalar t,
                                     const sVector& y, const sVector& f0,
                                     const sVector& sc, const ODEControls& ctrl,
                                     long& evals);

//- Compare Ja with Jd column by column on each column's scale; record the
//  result in A.audits and throw (naming owner, row, column) above tolerance.
void auditAnalytic(const std::vector<sVector>& Ja,
                   const std::vector<sVector>& Jd,
                   scalar t, const sVector& y, const sVector& sc,
                   ODEAnalyticJacobian& A);

} // namespace Choupo::solver::detail
