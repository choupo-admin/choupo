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
    Choupo::analysis

Description
    CONSTRAINED WEIGHTED LEAST SQUARES over a laboratory analysis -- slice A2
    of docs/design/aqueous-analysis-inlet-scope.md.

        min   Sum_r ( (x_r - m_r) / sigma_r )^2
        s.t.  C x = t        (the ENFORCED conservation constraints)
              x  >= 0        (non-negativity, always)

    where m_r is a MEASURED analytical quantity and sigma_r its declared
    standard uncertainty.  The answer is ONE physically admissible
    composition, and every correction is reported with the constraint that
    caused it.

    =====================================================================
     THE ONE-WAY BOUNDARY, AND WHY IT IS THIS FILE RATHER THAN A COMMENT
    =====================================================================

    Vitor's ruling fixes the direction of the arrow:

        laboratory analysis -> reconciliation -> ONE conserved admissible
        composition -> aqueous equilibrium / speciation

    "It must NOT become part of the aqueous-equilibrium solver itself ...
    not a coupled loop in which equilibrium starts modifying measurements
    to make the chemistry easier to satisfy."

    A comment saying so would be true today and false the first time
    somebody needs an activity coefficient in here.  So the boundary is
    STRUCTURAL, and the structure is this translation unit:

      * this header includes `core/Types.H` and the standard library.
        NOTHING from `thermo/`.  It cannot NAME ThermoPackage,
        SpeciationSolver, ReactiveVLE, ElectrolyteModel or an activity
        model, so it cannot call one -- not by accident, not on purpose,
        not after a refactor that "just needs gamma here";
      * the interface below is POD: numbers, names, and linear rows.  It
        speaks of a CHARGE and of ATOM COUNTS -- both facts the caller has
        already resolved from declared records -- and of nothing chemical
        at all.  There is no seam through which an equilibrium result
        could be passed in even if a caller wanted to;
      * so the reconciler runs to COMPLETION, hands back one composition,
        and only then does the speciation see anything.  Feedback is not
        forbidden here; it is UNSPEAKABLE here.

    `bin/curate/check_aqueous_reconciliation.py` makes that a compile fact
    rather than a code-review hope: it reads the includes of this pair AND
    the undefined symbols of the compiled object, and fails if either
    reaches the equilibrium surface.  (Same posture as the one-entry
    lockdown in check_solid_service A8.)

    What the caller is responsible for, precisely because this file must
    not do it: turning declared records into charges and atom counts,
    naming the stream in a refusal, and deciding which constraint families
    are enforced.  This file solves the stated problem and reports.

    =====================================================================
     WHY THE ATTRIBUTION IS EXACT AND NOT A HEURISTIC
    =====================================================================

    A reader must be able to ask "why did my measured chloride move?" and
    get an answer that is arithmetic rather than narrative.  It is, and it
    falls straight out of the KKT conditions.  Working in SIGMA UNITS
    (u_r = (x_r - m_r)/sigma_r, so the objective Hessian is the identity
    and the problem is perfectly scaled whatever the analytes weigh):

        u + A^T lambda + Aineq^T mu = 0
          =>  u_r = - Sum_k lambda_k A_{k,r}  +  mu_r

    Each constraint k therefore contributes EXACTLY  -lambda_k A_{k,r}
    standard deviations to row r, and the non-negativity bound contributes
    mu_r; the parts SUM to the whole correction, with no residue.  The
    "constraint responsible" reported per row is the largest of those
    parts, and its share is a real fraction -- and the solver ASSERTS the
    decomposition reconstructs u before returning it, because a published
    attribution that does not add up is worse than none.

    Method: the convex QP is handed to the project's own hand-rolled
    active-set solver (`solver/ActiveSetQP`, Nocedal & Wright Alg. 16.3),
    which is where this project's dense linear algebra already lives.  No
    new dependency, no second QP.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo::analysis
{

//  ONE measured analytical quantity -- a row of the laboratory sheet.
//
//  `charge` and `atoms` are FACTS THE CALLER RESOLVED from declared records
//  (the species' `z`, its `formula` through the shared elemental parser).
//  They are copied here as plain numbers on purpose: a reconciler that could
//  look a species up could look its equilibrium up.
struct MeasuredQuantity
{
    std::string label;        // the author's own row key ("alkalinity")
    std::string species;      // the master it reports ("" for an element row)
    std::string element;      // the element it totals ("" for a species row)

    scalar      measured = 0.0;   // as reported, in the caller's unit
    scalar      sigma    = 0.0;   // ABSOLUTE standard uncertainty, same unit
    std::string sigmaOrigin;      // how that sigma was arrived at -- ANNOUNCED
};

//  ONE enforced linear conservation law:  Sum_r coeff_r x_r == target.
struct ConservationConstraint
{
    std::string name;      // "electroneutrality", "elementalConservation:Ca"
    std::string family;    // the `enforce ( ... )` word it came from
    std::string meaning;   // one sentence, for the inspectable record
    sVector     coeff;     // one per MeasuredQuantity, in the same order
    scalar      target = 0.0;
};

struct ReconciliationRequest
{
    std::vector<MeasuredQuantity>      rows;
    std::vector<ConservationConstraint> constraints;

    //  Limits.  <= 0 means "not declared".  Both may be declared at once --
    //  they bound DIFFERENT things (one relative to the measured value, one
    //  relative to the declared uncertainty), so they are not two spellings
    //  of one limit and neither implies the other.
    scalar maxCorrectionSigma   = 0.0;
    scalar maxCorrectionPercent = 0.0;
};

//  How much of one row's correction a single constraint accounts for.
struct Attribution
{
    std::string constraint;    // the constraint's name, or "nonNegativity"
    scalar      deltaSigma = 0.0;   // its exact contribution, in sigma
};

struct ReconciledQuantity
{
    scalar adjusted        = 0.0;
    scalar correction      = 0.0;   // adjusted - measured
    scalar correctionSigma = 0.0;   // correction / sigma  (the normalized one)
    scalar weight          = 0.0;   // 1 / sigma^2, printed so the reader can
                                    // see WHY the split fell where it did

    std::vector<Attribution> attribution;      // sums EXACTLY to correctionSigma
    std::string responsibleConstraint;         // the largest contribution
    scalar      responsibleShare = 0.0;        // |its part| / Sum |parts|

    bool   atNonNegativityBound = false;
};

//  A declared limit a row broke.  The reconciler REPORTS; the caller refuses,
//  because the caller is the one that knows the stream's name.
struct LimitViolation
{
    std::string label;
    std::string limit;          // "maximumCorrection ... sigma|percent"
    scalar      value   = 0.0;  // what the correction actually was
    scalar      allowed = 0.0;
};

struct ConstraintOutcome
{
    std::string name;
    std::string family;
    std::string meaning;
    scalar      residualBefore = 0.0;   // Sum coeff*measured - target
    scalar      residualAfter  = 0.0;   // Sum coeff*adjusted - target
    scalar      multiplier     = 0.0;   // the sigma-space Lagrange multiplier
    bool        binding        = false; // it moved something
};

struct ReconciliationOutcome
{
    std::vector<ReconciledQuantity>  rows;
    std::vector<ConstraintOutcome>   constraints;
    std::vector<LimitViolation>      violations;

    //  Sum ((x-m)/sigma)^2 at the answer -- the objective itself.  A small
    //  number says the analysis needed little persuasion; a large one says
    //  the constraints and the measurements genuinely disagree.
    scalar objective  = 0.0;
    int    iterations = 0;
    std::string note;      // the QP's own termination note, carried verbatim
};

//  Solve the constrained WLS problem.  Throws (std::runtime_error) on a
//  malformed request -- a non-positive sigma, a constraint of the wrong
//  width, an infeasible constraint set, or an attribution that fails to
//  reconstruct its own correction.
ReconciliationOutcome
reconcileWeightedLeastSquares(const ReconciliationRequest& req);

} // namespace Choupo::analysis
