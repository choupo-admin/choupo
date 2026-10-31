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
Class
    Choupo::solver::ODEIntegrator

Description
    Abstract base + factory for initial-value ODE integrators that advance a
    packed state vector y over an interval [t0, t1]:

        dy/dt = f(t, y)

    Concrete methods register via the usual explicit factory (no macros):

        RK4           classical 4th-order explicit -- the non-stiff default,
                      lifted verbatim from the batch reactors.
        EulerSI       semi-implicit (linearly-implicit) Euler -- the readable
                      "hello, stiffness" stepping stone.
        Rosenbrock23  L-stable linearly-implicit embedded 2(3) pair (ode23s):
                      one Jacobian + one LU factorisation per step, adaptive
                      (dense, or block-tridiagonal when the caller DECLARES
                      that structure -- ODEBlockStructure below).

    WHY a stiff method at all: detailed chemistry spans timescales from the
    radical lifetime (~1e-8 s) to the heat-release time (~1e-3 s).  An explicit
    method is stability-limited to a step ~ the FASTEST scale, so it needs
    millions of tiny steps (or NaNs).  A linearly-implicit method is L-stable:
    it takes steps set by ACCURACY, not stability.  The integrator says this
    out loud (verbosity >= 3) -- the no-silent-crutch credo.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <cstddef>
#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo::solver
{

// f(t, y) -> dy/dt, same packing as y.
using DerivFn = std::function<sVector(scalar t, const sVector& y)>;

//- A DECLARED structure for the stiff integrator's Jacobian (opt-in; the
//  MESH's NDOptions::blockTri is the precedent, 2026-08-25).
//
//  A method-of-lines model -- a fixed bed cut into N finite-volume cells --
//  couples each cell only to its two neighbors (upwind advection, central
//  dispersion) plus purely LOCAL terms (the LDF source).  Gathered cell by
//  cell its Jacobian is BLOCK-TRIDIAGONAL: N blocks of nv unknowns (c, q, T
//  of one cell).  The state vector need not be stored in that order, so the
//  declaration carries the map: blockRows[b*nv + k] is the index in y of
//  slot k of block b.
//
//  Every row NOT in a block is a BORDER (quadrature) row: an integrated
//  quantity dy_d/dt = g(y) that may read every block (a boundary flux, a
//  wall duty summed over all cells) but that NO row reads back -- its
//  column of the Jacobian is zero.  Then W = I - h d J is lower
//  block-triangular, [[B, 0], [-h d R, I]], and a border row of W x = r is
//  closed directly: x_d = r_d + h d (R x_b).  How R x_b is formed depends on
//  what the row READS (borderReads):
//    - a NARROW row, reading at most three consecutive blocks (an outlet
//      flux reads the last cell; an imposed inlet flux reads none), takes
//      its entries of R from the colored passes themselves -- each pass
//      perturbs at most one of its columns -- so it is differentiated by
//      the SAME perturbations as the block rows, and a linear invariant
//      that runs through it (a mass ledger: cell inventory + M_out - M_in)
//      is kept to round-off exactly as the dense path keeps it;
//    - a WIDE row (a wall duty summed over every cell) is closed by ONE
//      directional difference per back-solve: exact for a row LINEAR in
//      the blocks, first-order in the difference step otherwise.
//
//  Declaring it buys the colored (Curtis-Powell-Reid) Jacobian -- 3*nv
//  derivative evaluations independent of N, against n dense -- and the
//  block-Thomas solve.  THE DECLARATION IS A CLAIM, AND A CLAIM IS
//  MEASURED: the first Jacobian the integrator builds under it is also
//  built DENSE, the largest entry outside the declared structure is
//  recorded here, and a materially false declaration is REFUSED by name.
//  The audit and the counts are written back into this object (the owner
//  keeps it across integrate() calls) so the CALLER can announce them --
//  the integrator itself prints nothing at the verbosity callers use.
struct ODEBlockStructure
{
    std::size_t              nBlocks   = 0;
    std::size_t              blockSize = 0;
    std::vector<std::size_t> blockRows;     // [b*blockSize + k] -> index in y

    //  What a border row reads: blocks [first, last] (first > last: none).
    //  A border row not listed here is taken to read EVERY block (wide).
    struct BorderRead { std::size_t row; long first; long last; };
    std::vector<BorderRead>  borderReads;

    bool declared() const { return nBlocks > 1 && blockSize > 0; }

    // ---- written by the integrator --------------------------------------
    bool   audited        = false;   // the first-Jacobian measurement ran
    scalar offStructureMax = 0.0;    // max |J| outside the declaration
    scalar inStructureMax  = 0.0;    // max |J| inside the three block bands
    scalar coloredMismatch = 0.0;    // max |J_colored - J_dense| in the bands
    long   auditEvals      = 0;      // f evaluations of the dense audit (n)
    long   jacobians       = 0;      // colored Jacobians built
    long   jacobianEvals   = 0;      // f evaluations spent on them
    long   borderEvals     = 0;      // directional products (wide rows)
    long   narrowBorderRows = 0;     // border rows differentiated by color
    long   wideBorderRows   = 0;     // border rows closed by direction
};

// Integration controls.  `atol` is PER-COMPONENT: the state is unit-mixed
// (species in kmol/s next to a temperature in K, trace radicals at 1e-10 next
// to the bath gas at 1e0).  A single scalar atol lets the controller be driven
// by the big rows and silently under-resolve the trace radical that IS the
// ignition event -- so atol is a vector (size 1 broadcasts to all rows).
struct ODEControls
{
    sVector     atol      = {1.0e-12};   // absolute tolerance, per component
    scalar      rtol      = 1.0e-6;      // relative tolerance
    scalar      hInit     = 0.0;         // initial / fixed step (0 => auto)
    scalar      hMin      = 0.0;         // floor on the step (0 => auto tiny)
    scalar      hMax      = 0.0;         // cap on the step (0 => no cap = span)
    scalar      maxGrowth = 4.0;         // per-accepted-step growth limit (the
                                         //   spiritual maxCo: the step may not
                                         //   grow by more than this factor)
    std::size_t maxSteps  = 2000000;     // runaway guard
    std::size_t nPositive = 0;           // first nPositive rows must stay >= 0
                                         // (species mole/conc rows; T excluded)
    int         verbosity = 1;           // >=3 prints the stiffness verdict

    // Optional glass-box hook: invoked once per ACCEPTED step with the time at
    // the END of the step and the step size just taken.  Lets choupoBatch /
    // choupoCtrl print the adaptive step history so the student SEES h adapt.
    // Empty by default => no per-step reporting (the ignition path unchanged).
    std::function<void(scalar tEnd, scalar hTaken)> onAccept;

    // STATE-AWARE accepted-step hook: fires with the ACCEPTED state vector at
    // tEnd, BEFORE integration continues.  The balance ledger integrates its
    // trapezoids on exactly the accepted states (a plain onAccept observer
    // would see the units' stale, pre-commit state).  Empty by default.
    std::function<void(scalar tEnd, scalar hTaken, const sVector& yAccepted)>
        onAcceptState;

    // OPT-IN declared Jacobian structure (Rosenbrock23 only; see
    // ODEBlockStructure).  Not owned; nullptr => the dense path, untouched.
    // Methods that build no Jacobian ignore it.
    ODEBlockStructure* structure = nullptr;
};

struct ODEStats
{
    std::size_t steps    = 0;
    std::size_t accepted = 0;
    std::size_t rejected = 0;
    scalar      hLast    = 0.0;
    //  The step the CONTROLLER proposes for the next interval.  It differs
    //  from hLast when the last accepted step was SHORTENED to land on t1:
    //  growing from that shortened step (hLast does) overshoots what the
    //  error estimate supports, and a caller that warm-starts its next
    //  interval from hLast pays a rejected step for it.  hNext grows from
    //  the step the controller WANTED before the shortening, bounded by
    //  what the shortened step's own error allows.  (Rosenbrock23 sets it;
    //  0 => not provided, use hLast.)
    scalar      hNext    = 0.0;
    scalar      hMinUsed = 0.0;
    scalar      stiffness = 0.0;   // |lambda_max| * h_explicit-bound estimate
    bool        ok       = true;   // false if it gave up (maxSteps / hMin)
    //  WHERE and WHY it gave up (2026-10-27, DEV.md 4c C178).  A caller that
    //  reads only `ok` can refuse, but cannot NAME the refusal: an
    //  integration asked to reach t1 that stopped short is a fact with a
    //  time and a cause, and both travel with the statistics.  tReached is
    //  the time of the last ACCEPTED state (= t1 on success); `failure` is
    //  empty on success and otherwise names the cause in words (maxSteps,
    //  the step floor and what drove the step below it, a non-finite or
    //  negative state on a fixed step).
    scalar      tReached = 0.0;
    std::string failure;
};

class ODEIntegrator
{
public:
    virtual ~ODEIntegrator() = default;

    // Advance y from t0 to t1 IN PLACE.  Returns run statistics.
    virtual ODEStats integrate(sVector&           y,
                               scalar             t0,
                               scalar             t1,
                               const DerivFn&     f,
                               const ODEControls& ctrl) const = 0;

    virtual const std::string& name() const = 0;

    using Factory = std::function<std::unique_ptr<ODEIntegrator>()>;
    static void registerType(const std::string& name, Factory f);
    static std::unique_ptr<ODEIntegrator> New(const std::string& name);
    static bool known(const std::string& name);
    static void registerBuiltins();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo::solver
