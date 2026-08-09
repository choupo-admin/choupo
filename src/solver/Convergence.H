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
    Choupo::solver

Description
    THE NORMALIZED-RESIDUAL CONVERGENCE CONTRACT -- one home for the whole
    project (ruling 2026-08-09).

    WHY THIS EXISTS.  `flash17_two_liquids_reactive` closes its energy
    balance to 0.0845 kW.  That number is not zero and must not be made to
    look like zero: not by rounding, not by an arbitrary hard-coded
    threshold, and not by a tolerance invented for that one case.  A
    dimensional residual is not a verdict -- it is a magnitude, and a
    magnitude means nothing until it is compared with the magnitude of what
    is being balanced.  So the verdict is taken on a NORMALIZED residual and
    the dimensional number survives beside it, printed, as the physically
    interpretable diagnostic it always was.

    ---------------------------------------------------------------------
    1.  WHAT OPENFOAM DOES (the model, quoted exactly so the adaptation
        below can be judged against it)
    ---------------------------------------------------------------------

    For a LINEAR system A x = b over a mesh, OpenFOAM
    (`lduMatrix::solver::normFactor`) takes

        xRef       = average(x)                       // a uniform field
        normFactor = sum |A x - A xRef| + sum |b - A xRef| + small
        residual   = sum |b - A x| / normFactor

    the sums running over CELLS.  Two things are worth naming, because the
    adaptation keeps both.  First, the denominator is not "the size of b" --
    it is the spread of BOTH SIDES about the same trivially-balanced
    reference state, so it measures how much there is to balance rather than
    how big the numbers happen to be.  Second, `small` is a divide guard,
    not a physical scale: OpenFOAM's `SolverPerformance::small_` is 1e-20 and
    that is the value used below.

    ---------------------------------------------------------------------
    2.  WHAT THIS DOES, AND WHERE IT IS AN ADAPTATION AND NOT THE SAME THING
    ---------------------------------------------------------------------

    A nonlinear residual r(u) = 0 has no A and no b.  What it has is, per
    equation, a set of TERMS whose difference IS the residual -- for the
    reactive-equilibrium Newton, equation k balances

        t_(k,0) = ln a_i(liquid)      against      t_(k,1) = ln( K_i p_i )

    so `r_k = t_(k,0) - t_(k,1)`.  The generalization is therefore: normalize
    each equation's residual by the magnitude of the TERMS that equation
    balances, measured about their own mean.  Concretely, for a system of K
    equations with the terms flattened equation-major,

        tRef       = mean( all terms )                // the uniform state
        normFactor = sum_over_all_terms |t - tRef| + floor
        normalized = sum_k |r_k| / normFactor

    Structurally this is OpenFOAM's expression with `cells -> equations` and
    `{A x, b} -> {the terms of the equation}`, and it is the same intent: a
    residual relative to what is actually being balanced.  It is NOT the same
    theorem.  Three honest limits, stated here rather than discovered later:

    (a) There is no operator, so there is no `A xRef`.  The reference is the
        arithmetic mean of the terms themselves.  For a linear system whose
        two sides are the field values this coincides with OpenFOAM; for a
        general nonlinear system it does not, and no claim is made that it
        does.

    (b) THE NORMALIZATION DEGENERATES WHEN THERE IS ONLY ONE EQUATION.  With
        K = 1 and two terms, tRef = (t0 + t1)/2 and normFactor = |t0 - t1| =
        |r| exactly, so `normalized == 1` however small the residual is.
        OpenFOAM has the identical degeneracy on a one-cell mesh; the
        difference is that a one-cell mesh does not occur and a one-equation
        nonlinear system does.  It is therefore DETECTED, not hidden: when
        the term spread is not strictly larger than the residual it carries
        no information, `degenerate` is set, and the caller is expected to
        take the verdict on the RAW residual and say so in the criterion
        string.  A degenerate normalization must never be reported as a
        normalized one.

    (c) The terms are whatever the caller hands over.  Handing over a term
        set that does not sum to the residual would make the factor
        meaningless, and nothing here can detect that -- it is the caller's
        contract, and there is exactly one caller per solver so it is
        checkable by reading.

    THIS IS THE ONLY NORMALIZATION IN THE TREE.  `bin/curate/
    check_convergence_residual.py` greps for a second definition and fails
    if it finds one.  If a solver needs a different one, the argument is
    made here and the formula changes here.

    ---------------------------------------------------------------------
    3.  THE CONTROLS AND THE DECISION
    ---------------------------------------------------------------------

    The OpenFOAM triple, declared per solver in `system/solverDict`:

        reactiveEquilibrium { tolerance 1e-9; relTol 0; maxIter 200; }

    The decision, and it is stated nowhere else:

        converged  <=>  normFinal <= tolerance
                    OR  normFinal / normInitial <= relTol      (relTol > 0)

    subject to `maxIter`: an iteration count that runs out with neither test
    satisfied is NOT converged, and `criterion` says so by name.  `relTol 0`
    DISABLES the reduction test (OpenFOAM's own convention) -- it does not
    mean "require exact zero".

    DEFAULTS.  `ConvergenceControls` is default-constructed to
    `tolerance 1e-9`, `relTol 0`, `maxIter 60`, which are the numbers the
    reactive-equilibrium outer Newton carried hard-coded before this header
    existed.  They are documented here, they are the same for every solver
    that adopts this contract unless it overrides them at its own call site,
    and `describe()` exists so a run can ANNOUNCE them: a default that is
    never printed is indistinguishable from a number nobody chose.

\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <cmath>
#include <cstddef>
#include <sstream>
#include <stdexcept>
#include <string>

namespace Choupo::solver {

// ---------------------------------------------------------------------------
//  The OpenFOAM triple.
// ---------------------------------------------------------------------------
struct ConvergenceControls
{
    //- Absolute test on the NORMALIZED residual.
    scalar tolerance = 1.0e-9;

    //- Relative-reduction test, normFinal/normInitial.  0 disables it.
    scalar relTol = 0.0;

    //- Iteration cap.  Reaching it without a satisfied test is NOT
    //  convergence.
    int maxIter = 60;

    //- One line, for the run to announce.  `defaulted` is the caller's
    //  knowledge (did a dict supply these?), never guessed from the values:
    //  a case that declares exactly the defaults has still declared them.
    std::string describe(const std::string& name, bool defaulted) const
    {
        std::ostringstream os;
        os << "[convergence] " << name << ": "
           << (defaulted ? "DEFAULT" : "declared") << " controls"
           << " -- tolerance " << tolerance
           << ", relTol " << relTol
           << ", maxIter " << maxIter
           << (defaulted ? " (none declared in system/solverDict; these are"
                           " the documented defaults in solver/Convergence.H)"
                         : " (system/solverDict)");
        return os.str();
    }
};

// ---------------------------------------------------------------------------
//  The divide guard.  OpenFOAM's SolverPerformance::small_, same value, same
//  job: it keeps the quotient finite, it is not a physical scale.
// ---------------------------------------------------------------------------
constexpr scalar convergenceNormFloor = 1.0e-20;

// ---------------------------------------------------------------------------
//  THE NORMALIZATION -- the one home (see §2 above).
//
//  `residual`  r_k, one entry per equation.
//  `terms`     the quantities those equations balance, flattened
//              equation-major: a K-equation, m-term system hands over K*m
//              entries.  Their difference within an equation IS r_k.
//  `degenerate` (out) set when the term spread carries no information -- see
//              §2(b).  The caller MUST then fall back to the raw residual
//              and say so; it must not report the returned number as a
//              normalized residual.
// ---------------------------------------------------------------------------
struct Normalization
{
    scalar rawL1      = 0.0;   // sum_k |r_k|            (the dimensional sum)
    scalar normFactor = 0.0;   // the denominator, floor included
    scalar normalized = 0.0;   // rawL1 / normFactor
    bool   degenerate = false; // §2(b): the spread IS the residual
};

inline Normalization normalizeResidual(const sVector& residual,
    const sVector& terms,
    scalar floorValue = convergenceNormFloor)
{
    Normalization out;

    for (const scalar r : residual) out.rawL1 += std::abs(r);

    if (terms.empty())
    {
        //  No terms handed over: there is nothing to normalize against.
        out.normFactor = floorValue;
        out.normalized = out.rawL1 / floorValue;
        out.degenerate = true;
        return out;
    }

    scalar tRef = 0.0;
    for (const scalar t : terms) tRef += t;
    tRef /= static_cast<scalar>(terms.size());

    scalar spread = 0.0;
    for (const scalar t : terms) spread += std::abs(t - tRef);

    out.normFactor = spread + floorValue;
    out.normalized = out.rawL1 / out.normFactor;

    //  Degenerate exactly when the spread is not strictly larger than the
    //  residual it is meant to scale -- the one-equation case (spread ==
    //  |r|), and any case where the terms happen to differ by nothing but
    //  the residual.  A factor of 2 is not a tuned margin: with terms
    //  measured about their own mean, a two-term equation contributes
    //  |r_k| to the spread, so "spread <= rawL1" is the algebraic boundary
    //  and anything at or below it is the degenerate branch.
    out.degenerate = !(spread > out.rawL1);

    return out;
}

// ---------------------------------------------------------------------------
//  What a solve reports.  All five numbers Vitor asked to see, plus the
//  criterion that decided.
// ---------------------------------------------------------------------------
struct ResidualReport
{
    //- The RAW, dimensional residual (whatever units the equations carry):
    //  at the seed and at the accepted state.  Preserved verbatim -- this is
    //  the number a student can interpret physically.
    scalar rawInitial = 0.0;
    scalar rawFinal   = 0.0;

    //- The NORMALIZED residual at the seed and at the accepted state.
    scalar normInitial = 0.0;
    scalar normFinal   = 0.0;

    //- Which test decided.  Never empty on a completed solve.
    std::string criterion;

    bool converged = false;
    int  iterations = 0;

    //- The achieved relative reduction, normFinal / normInitial.  Zero
    //  initial norm (a seed that was already exact) reports 0.
    scalar reduction() const
    {
        return normInitial > 0.0 ? normFinal / normInitial : 0.0;
    }
};

// ---------------------------------------------------------------------------
//  THE DECISION.  One expression, used by every adopting solver.
//
//  `degenerate` selects the honest fallback of §2(b): the verdict is taken
//  on the RAW residual against the same `tolerance`, and the criterion says
//  so, so a reader can never mistake it for a normalized verdict.
// ---------------------------------------------------------------------------
inline bool convergedNow(const ConvergenceControls& c,
    scalar normInitial,
    scalar normNow,
    scalar rawNow,
    bool degenerate,
    std::string& criterion)
{
    if (degenerate)
    {
        if (rawNow <= c.tolerance)
        {
            criterion = "absolute tolerance on the RAW residual (the"
                        " normalization degenerated: the term spread is not"
                        " larger than the residual it would scale -- see"
                        " solver/Convergence.H section 2b)";
            return true;
        }
        return false;
    }

    if (normNow <= c.tolerance)
    {
        criterion = "absolute tolerance (normalized residual <= tolerance)";
        return true;
    }
    if (c.relTol > 0.0 && normInitial > 0.0
     && normNow / normInitial <= c.relTol)
    {
        criterion = "relative reduction (normalized residual fell to <="
                    " relTol of its initial value)";
        return true;
    }
    return false;
}

// ---------------------------------------------------------------------------
//  READING THE CONTROLS OFF A CASE DICT.
//
//      system/solverDict:
//          reactiveEquilibrium { tolerance 1e-9; relTol 0; maxIter 200; }
//
//  Absent block  -> the documented defaults, and `defaulted` comes back true
//                   so the run announces them.
//  Present block -> exactly the three keys.  ANY OTHER KEY REFUSES BY NAME.
//                   A control the solver does not implement is not a
//                   harmless decoration: it is an instruction the author
//                   believes is in force, and silently dropping it is the
//                   difference between a declared numeric contract and a
//                   comment.
// ---------------------------------------------------------------------------
inline ConvergenceControls readConvergenceControls(const DictPtr& solverDict,
    const std::string& blockName,
    const ConvergenceControls& defaults,
    bool& defaulted)
{
    ConvergenceControls c = defaults;
    defaulted = true;
    if (!solverDict || !solverDict->found(blockName)) return c;

    const DictPtr b = solverDict->subDict(blockName);
    defaulted = false;

    for (const std::string& key : b->keys())
        if (key != "tolerance" && key != "relTol" && key != "maxIter")
            throw std::runtime_error("solverDict: " + blockName + " { " + key
                + " ...; } -- '" + key + "' is not a convergence control this"
                " solver implements.  The contract is the OpenFOAM triple and"
                " nothing else: tolerance (absolute, on the normalized"
                " residual), relTol (relative reduction, 0 disables),"
                " maxIter.  A declared control that is not implemented is"
                " refused rather than ignored -- see solver/Convergence.H.");

    c.tolerance = b->lookupScalarOrDefault("tolerance", c.tolerance);
    c.relTol    = b->lookupScalarOrDefault("relTol",    c.relTol);
    c.maxIter   = static_cast<int>(
        b->lookupScalarOrDefault("maxIter", static_cast<scalar>(c.maxIter)));

    if (c.tolerance <= 0.0)
        throw std::runtime_error("solverDict: " + blockName
            + " { tolerance ...; } must be strictly positive -- a"
              " non-positive tolerance can never be met and would report"
              " every solve as not converged.");
    if (c.relTol < 0.0)
        throw std::runtime_error("solverDict: " + blockName
            + " { relTol ...; } must be >= 0 (0 disables the reduction"
              " test).");
    if (c.maxIter < 1)
        throw std::runtime_error("solverDict: " + blockName
            + " { maxIter ...; } must be at least 1.");
    return c;
}

//- The criterion string for a solve that ran out of iterations.  A separate
//  function because "not converged" is a verdict too and it must be named.
inline std::string exhaustedCriterion(const ConvergenceControls& c)
{
    std::ostringstream os;
    os << "maxIter reached (" << c.maxIter << ") without either test"
          " -- NOT converged";
    return os.str();
}

//- The criterion string for a solve whose iteration stalled before the cap
//  (a line search that could not find a decreasing step).
inline std::string stalledCriterion()
{
    return "iteration stalled before maxIter (no decreasing step found)"
           " -- NOT converged";
}

} // namespace Choupo::solver
