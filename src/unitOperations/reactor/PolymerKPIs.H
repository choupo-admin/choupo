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
    Choupo::PolymerKPIs

Description
    Step-growth (Carothers / Flory) chain statistics from a reactor's
    fractional conversion p.  A pure, reactor-agnostic algebraic post-step:
    no engine, no state, no fitting.  The closed forms (Flory 1953):

        Xn  = 1 / (1 - p)                number-average degree of polym.
        Xw  = (1 + p) / (1 - p)
        Mn  = M0 / (1 - p)              number-average molar mass
        Mw  = M0 (1 + p) / (1 - p)
        PDI = Mw/Mn = 1 + p             -> 2 as p -> 1
        n(x) = (1-p) p^(x-1)            most-probable (mole-fraction) dist.
        w(x) = x (1-p)^2 p^(x-1)        weight-fraction distribution

    VALIDITY: Xn, Xw, Mn, Mw are mass-balance facts, independent of the
    mixing pattern.  PDI = 1+p and the Flory-Schulz distribution assume a
    UNIFORM reaction time (batch / PFR).  A CSTR's residence-time
    distribution broadens both, so the distribution + PDI are gated to
    batch/PFR callers (wantDist=true); a CSTR passes wantDist=false.

    References (PRIMARY): P.J. Flory, "Principles of Polymer Chemistry",
    Cornell Univ. Press (1953), Ch. VIII-IX; G. Odian, "Principles of
    Polymerization", 4th ed., Ch. 2.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"
#include "unitOperations/UnitOperation.H"

#include <map>
#include <string>

namespace Choupo {
namespace PolymerKPIs {

// Append the step-growth scalars to `kpis`, and (if wantDist) a
// Flory-Schulz distribution to `profile` (columns chainLength / n_x / w_x,
// over x = 1..maxX).  Prints the glass-box KPI block (each formula beside
// its value).  Guards PRINT, never clamp: p>=1 is refused (no chain
// statistics), p>0.999 earns a loud convergence-sensitivity note, M0<=0 a
// warning.  Returns false if it refused (p>=1 or M0<=0) so the caller may
// react; the scalars are simply not appended in that case.
bool addStepGrowthKPIs(std::map<std::string, scalar>& kpis,
                       UnitProfile&                   profile,
                       scalar p,
                       scalar M0,
                       int    maxX,
                       bool   wantDist,
                       int    verbosity);

} // namespace PolymerKPIs
} // namespace Choupo
