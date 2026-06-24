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
                      one Jacobian + one LU factorisation per step, adaptive.

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

namespace Choupo::solver
{

// f(t, y) -> dy/dt, same packing as y.
using DerivFn = std::function<sVector(scalar t, const sVector& y)>;

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
};

struct ODEStats
{
    std::size_t steps    = 0;
    std::size_t accepted = 0;
    std::size_t rejected = 0;
    scalar      hLast    = 0.0;
    scalar      hMinUsed = 0.0;
    scalar      stiffness = 0.0;   // |lambda_max| * h_explicit-bound estimate
    bool        ok       = true;   // false if it gave up (maxSteps / hMin)
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
