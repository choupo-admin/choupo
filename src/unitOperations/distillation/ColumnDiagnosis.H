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
    Choupo::columnDiagnosis

Description
    WHY A COLUMN DID NOT CONVERGE (DEV.md 4c C184, slice 1).

    A column that fails used to say "unit 'C1' failed to converge", or worse,
    "dense solve singular at row 87": a row of a flattened system that
    means nothing to a student.  This file is called ONLY when a column's
    Newton has already returned NOT converged, and it answers four questions
    in that order, in the words of the column (a stage, a component, a flow, a
    balance), never as a row number:

      (A) a physically infeasible SPECIFICATION -- the declared distillate or
          bottoms rate asks for more than the column is fed, a negative
          reflux, a component required in a stream in a negative amount, a
          stage whose liquid or vapour has gone to zero;
      (B) thermodynamic DATA missing or EXTRAPOLATED -- a property was
          evaluated outside its declared window, or refused by the stage
          pricing, during the solve;
      (C) an ill-conditioned or singular system -- the Jacobian at the best
          iterate is analysed (row-equilibrated, smallest singular direction
          by inverse iteration) and the weakest equation and unknown are
          NAMED, with the physics that usually produces them (a component
          absent from a stage, a stage whose flow vanishes);
      (D) an IMPLEMENTATION fault -- the residual or its Jacobian is not
          finite at the best iterate, or an equation involves no unknown /
          an unknown appears in no equation.

    Or "could not tell", with the list of what was tried.  It is a diagnosis,
    not a proof: every verdict says what it was read from.

    IT MOVES NO NUMBER.  It runs after the failure, reads the residual
    function and the best iterate, and writes lines to the log and to the
    advisory list.  A column that converges never enters this file.  It does
    not change the solver (NewtonND is read through its NDResult, not edited).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <functional>
#include <string>
#include <vector>

namespace Choupo::columnDiagnosis {

enum class Cause
{
    infeasibleSpecification,   // (A)
    thermoData,                // (B)
    illConditioned,            // (C)
    implementationFault,       // (D)
    couldNotTell
};

//- How the unknowns and equations map onto the column's physics.
struct Layout
{
    enum class Kind { simultaneous, fullMESH } kind = Kind::simultaneous;
    std::size_t N = 0;                  // stages
    std::size_t n = 0;                  // components
    std::size_t block = 0;              // unknowns per stage (n, or n + 2)
    std::size_t nExtents = 0;           // reaction-extent unknowns, last
    bool        distillateUnknown = false;   // fullMESH with a boil-up spec: D first of the extras
    bool        partialCondenser = false;
    int         feedStage = -1;         // first (or only) feed stage, 0-based, -1 unknown
    std::vector<std::string> comp;      // component names
};

//- What the column knew when its Newton gave up.
struct Facts
{
    std::string unit;                   // the unit's name
    std::string model;                  // "simultaneous" | "fullMESH"
    //- Specification as the column used it (kmol/s; the unit does not matter
    //  to the tests, only that the three are in one unit).
    double totalFeed = 0.0;
    double totalDraws = 0.0;            // side draws
    double distillate = 0.0;            // D (the seed's, or the declared one)
    double reflux = 0.0;                // R = L/D
    bool   rateIsUnknown = false;       // D is solved for (boil-up spec)
    std::vector<double> feedComponent;  // total feed of each component (kmol/s)
    //- The Newton's own account (NDResult), copied so this file does not
    //  include NewtonND.H.
    int         iterations = 0;
    double      residual = 0.0;
    std::string stopReason;
    int         stalledSteps = 0;
    int         lmSteps = 0;
    int         trialRefusals = 0;
    int         boundedSteps = 0;
    //- A stage-pricing refusal the Newton provoked (the first message).
    std::string trialRefusal;
    //- Advisories raised from the start of the column solve (category, text).
    std::vector<std::pair<std::string, std::string>> advisories;
    //- The constant-molal-overflow seed did not converge either.
    bool seedFailed = false;
    //- A retry from the thermodynamic profile was tried and did not rescue the
    //  column (DEV.md 4c C184 slice 2): what it did, one sentence; empty = none.
    std::string retryTried;
};

struct Verdict
{
    Cause                    cause = Cause::couldNotTell;
    std::string              headline;       // one sentence
    std::vector<std::string> lines;          // the evidence, in words
    std::vector<std::string> tried;          // the checks that were run
};

using ResidualFn = std::function<sVector(const sVector&)>;

//- The names, in the column's words (exposed for the tests).
std::string equationName(const Layout& L, std::size_t row);
std::string unknownName(const Layout& L, std::size_t col);

//- THE DIAGNOSIS.  `x` is the best iterate the Newton returned.
Verdict diagnose(const Facts& f, const Layout& L,
                 const ResidualFn& residual, const sVector& x);

//- The text that goes to the log: "[diagnosis] (A) ...".
std::string render(const Verdict& v, const std::string& unit);

//- The letter of a cause: "A".."D" or "-".
char letter(Cause c);

//- (A) in one sentence, for a column whose declared rates leave no bottoms
//  (D + side draws not less than the feed).  Used where the refusal is
//  raised before any Newton exists.
std::string noBottomsSentence(const std::string& unit, double totalFeed,
                              double distillate, double sideDraws);

} // namespace Choupo::columnDiagnosis
