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
    fitObjective -- the DECLARED OBJECTIVE of `fitParameters` (DEV.md 4c C280).

        objective
        {
            method           twoStage;      // leastSquares | minimax | twoStage
            scale
            {
                T_bubble     absolute;      // the bubble-temperature residual, kelvin
                P_bubble     relative;      // the bubble-pressure residual, (P_model - P)/P
                binodal      relative;      // tie-line mole fractions, dx/x
            }
            maxEvaluations   1500;          // minimax stage only (default 1500)
        }

    Every word is optional; the defaults above are the ones shown.  The
    residual an author works with is a CHOICE and the run header names it, so
    the numbers a student reads say which objective produced them.

    THE METHODS.  `leastSquares` is the Levenberg-Marquardt search the fitter
    has always run.  `minimax` minimises the LARGEST scaled residual,
    max_k |r_k|, by a Nelder-Mead search (no derivatives, no dependency).
    `twoStage` -- the default -- runs the least-squares search for a first
    estimate and then the minimax search STARTED FROM THAT ANSWER; both
    answers are kept in the result (`fit.<i>.value_leastSquares`,
    `fit.<i>.value_minimax`) and the one reported as THE fit is the minimax
    one.  Why: least squares is smooth and finds the basin; a pair whose
    worst point is large can still have a small sum of squares, and the worst
    point is what spoils a prediction at the end of the range.  The minimax
    stage can only lower the largest scaled residual: its first vertex is
    the least-squares answer, and the answer returned is never worse.

    THE SCALES.  A composition is judged RELATIVE to its measured value
    (a mole fraction of 0.02 and one of 0.5 each count in proportion to
    themselves, not in proportion to their size); a temperature is judged in
    kelvin.  A relative tie-line row is (x_model - x)/x divided by
    `liquidLiquid.sigmaRelative` (declared with its `origin`, like `sigma`),
    and a measured mole fraction that is zero or negative is REFUSED by name:
    a relative error against zero is undefined and the engine will not floor
    it.  Built, by name: `T_bubble absolute`, `P_bubble relative`, `binodal
    absolute | relative`.  Any other word is refused, with what is built.

    WHAT THE OBJECTIVE REACHES.  The bubble kinds (T_bubble, P_bubble,
    T_bubble+LLE).  The isotherm and membrane kinds keep their own searches:
    `objective` is read there only to REFUSE anything but `method
    leastSquares`, by name, rather than ignore a request.

    WHY A SEPARATE FILE.  FitParameters.cpp is cited line by line by the
    EduTools least-squares lesson, whose tests hold each citation to its
    line; this logic lives here so the fitter gains it through one-line
    call sites and no cited line moves.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <functional>
#include <iosfwd>
#include <map>
#include <string>
#include <vector>

namespace Choupo {
namespace lle { struct Stats; }
namespace fitobj {

enum class Method { leastSquares, minimax, twoStage };

struct Spec
{
    Method      method          = Method::twoStage;
    bool        declared        = false;      // an `objective {}` block was present
    bool        binodalRelative = true;
    int         maxEvaluations  = 1500;
    std::string tBubble = "absolute";
    std::string pBubble = "relative";
    std::string binodal = "relative";
    bool runsLeastSquares() const { return method != Method::minimax; }
    bool runsMinimax()      const { return method != Method::leastSquares; }
};

//  Read `objective {}`.  `kind` is the residual kind; evaluate mode takes none.
Spec read(const DictPtr& dict, const std::string& kind, bool evalMode);

//  The isotherm and membrane kinds: refuse any method but leastSquares.
void requireLeastSquares(const DictPtr& dict, const std::string& kind);

//  The header lines (each ends in a newline).
std::string describe(const Spec& s, const std::string& kind);
std::string methodName(Method m);

//  max_k |r_k| over a residual vector (a penalty row counts as itself).
scalar maxAbs(const sVector& r);

struct Outcome
{
    bool    ran = false;
    sVector x;                 // the minimax answer
    scalar  before = 0.0;      // max |scaled residual| at the start point
    scalar  after  = 0.0;      // ... at the answer
    int     evaluations = 0;
    int     restarts = 0;
};

//  Nelder-Mead on f over the box [lo, hi], started from x0.
Outcome minimise(const std::function<scalar(const sVector&)>& f, const sVector& x0,
                 const sVector& lo, const sVector& hi, int maxEvaluations,
                 int verbosity);

//  Both answers into the result (only when the minimax stage ran).
void publish(std::map<std::string, scalar>& diag, const Spec& s,
             const sVector& leastSquaresValues, const sVector& finalValues,
             const Outcome& o);

//  mean and max |r| of the feasible (not penalised) entries -> diag keys
//  bubble_aad_<tag>, bubble_max_<tag>.
void publishBubble(std::map<std::string, scalar>& diag, const std::string& tag,
                   const sVector& unweighted);

//  One held-out bubble dataset's own error (unweighted, in the residual's unit).
struct DatasetError { std::string name; std::size_t n = 0; scalar mean = 0.0, max = 0.0; };

//  The per-property error table, fit set and held-out set: mean and maximum
//  ABSOLUTE error for the bubble temperature (kelvin), mean and maximum
//  RELATIVE error for compositions (and the absolute ones beside them).
//  `unit` is the bubble residual's unit ("K", or "rel" for P_bubble).
void printReport(std::ostream& os, const Spec& s, const std::string& unit,
                 const std::map<std::string, scalar>& diag,
                 const lle::Stats* fitLle, const lle::Stats* heldLle,
                 bool bubbleHeldOut, const std::vector<DatasetError>& heldBubble = {});

} // namespace fitobj
} // namespace Choupo
