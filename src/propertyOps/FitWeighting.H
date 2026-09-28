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
    fitWeights -- the DECLARED weighting of a bubble-temperature residual.

    `fitParameters(T_bubble)` weighed every point the same kelvin until
    2026-09-28.  A ThermoML series states an expanded uncertainty PER POINT,
    and within one article it can vary tenfold along x (a steep T-x region
    propagates the composition uncertainty into T: 0.13 to 1.35 K in the
    isopropanol + water set of curate06).  So the residual may now declare

        residual { weighting uncertainty; }

    and each fit point k is weighted by 1/U_k, U_k read from the dataset's
    own `uncertainty { T_bubble { values ( ... ); unit K; } }` block, aligned
    with its data rows by position.  `equal` stays the default, so every
    case that predates the word is arithmetically unchanged -- the function
    then returns an EMPTY vector and the fitter weighs nothing.

    What the weights do NOT touch: the held-out AAD (plain kelvin, the unit
    the acceptance band is declared in), and the reported rms and largest
    residual (also kelvin; only chi2 carries the weights).

    REFUSES, by name: an unknown weighting word; `uncertainty` with the
    inline `residual.data ( )` form (it carries no uncertainties); a fit
    dataset with no values, a unit other than K, a count different from its
    data rows, or a value that is not positive (zero claims a perfect
    measurement).

    WHY A SEPARATE FILE.  FitParameters.cpp is cited line by line by the
    EduTools least-squares lesson, whose tests hold each citation to its
    line; the weighting's logic lives here so the fitter gains it through
    one-line call sites and no cited line moves.

    The same change taught the fitter the bench's own column spellings,
    `x[<comp1>]` and `T_bubble`, so ONE measured file serves both the fit
    and the `experimental {}` overlay -- the points a pair is regressed to
    and the points it is drawn against are the same transcription.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <string>
#include <vector>

namespace Choupo {

class EvidencePartition;

//  1/U per fit point, in the order the fit loads them; EMPTY for `equal`.
sVector fitWeights(const DictPtr& residualDict,
                   const EvidencePartition* partition,
                   const std::vector<std::string>& xNames,
                   const std::vector<std::string>& yNames,
                   const std::vector<std::string>& zNames,
                   int verbosity);

} // namespace Choupo
