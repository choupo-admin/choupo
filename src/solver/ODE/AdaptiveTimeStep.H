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
    Choupo::solver::AdaptiveTimeStepper

Description
    OPT-IN adaptive time-stepping for the dynamic binaries (choupoBatch,
    choupoCtrl).  The OpenFOAM `adjustTimeStep` idea, but for these 0-D
    ODE/DAE holdup problems the control criterion is the integrator's LOCAL
    ERROR (rtol/atol), NOT a Courant number (there is no mesh / advection).

    Several ODE-form units are packed into ONE global state vector Y; the
    SAME stiff `Rosenbrock23` integrator the combustion path uses advances Y
    over each interval [t0, t1] with steps that GROW or SHRINK to hold the
    error tolerance.  The driver:

      * starts the step LOW (deltaT0) and lets it grow, capped by deltaTmax
        and maxGrowth (the spiritual maxCo);
      * carries the last step ACROSS intervals (warm restart), so the step
        does not reset to deltaT0 every write/sample boundary;
      * NEVER overshoots an interval end --- the caller clamps each call to
        the next write / recipe-event / controller-sample time, so the
        instant dirs + trajectory rows land on CLEAN times (adjustableRunTime);
      * reports each accepted step (the glass-box step history) via onStep;
      * REFUSES an interval the integrator could not finish (2026-10-27,
        DEV.md 4c C178): when Rosenbrock23 gives up (maxSteps, or the step
        driven below its floor) advance() throws IntegrationFailure, naming
        the interval, the time reached, the cause and the units -- it never
        returns to a caller that would set t = t1 over a state that stopped
        short.  Both time loops (choupoBatch, and the dynamicDriver behind
        choupoCtrl and choupoSemiContinuous) had discarded the return value,
        so the clock, the routing, the recipe events and the <t>/ writes all
        moved on to t1.  The refusal lives HERE, in the one function both
        call, so a caller cannot forget to read it.

    This is a thin orchestrator over the existing ODEIntegrator: it does NOT
    re-implement error control --- it scatters/gathers the per-unit packed
    state and hands the whole vector to Rosenbrock23.
\*---------------------------------------------------------------------------*/

#pragma once

#include "ODEIntegrator.H"
#include "core/Dictionary.H"
#include "core/Types.H"

#include <cmath>
#include <cstddef>
#include <functional>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo::solver
{

// One ODE-form unit, reduced to the four closures the driver needs.  The
// caller (choupoBatch / choupoCtrl) builds these from a unit's
// odeState/setOdeState/odeDerivative/odeNPositive.
struct OdeUnit
{
    std::function<sVector()>                 pack;        // current packed Y
    std::function<void(const sVector&)>      commit;      // write Y back
    std::function<sVector(const sVector&)>   derivative;  // dY/dt = f(Y)
    std::size_t                              nPositive = 0;  // species rows
    std::string                              name;           // for a refusal
};

//- The integrator could not finish an interval.  Thrown by
//  AdaptiveTimeStepper::advance; the message names everything the student
//  needs (interval, time reached, cause, statistics, units, remedies).  Under
//  an outer driver it reaches the driver as a failed EVALUATION.
class IntegrationFailure : public std::runtime_error
{
public:
    explicit IntegrationFailure(const std::string& what)
        : std::runtime_error(what) {}
};

// Adaptive-stepping settings, read once from controlDict.timeStepping.
struct AdaptiveSettings
{
    scalar rtol      = 1.0e-6;   // relative tolerance
    scalar atol      = 1.0e-9;   // absolute tolerance floor (broadcast)
    scalar deltaT0   = 0.0;      // initial (LOW) step; 0 => integrator auto
    scalar deltaTmax = 0.0;      // cap on the step; 0 => no cap (= interval)
    scalar maxGrowth = 4.0;      // per-accepted-step growth limit (maxCo-like)
    //  Runaway guard PER INTERVAL [t0, t1]: the integrator gives up (and
    //  advance() refuses) after this many sub-steps.  0 => the integrator's
    //  own default (ODEControls::maxSteps).  Declarable as
    //  timeSteppingControl.maxSteps so a student can see the guard fire.
    std::size_t maxSteps = 0;
    int    verbosity = 1;
};

//  THE ONE READER of `maxSteps` (DEV.md 4c C178), shared by choupoBatch and
//  the dynamic driver: the adaptive integrator's per-interval runaway guard.
//  Optional; absent returns 0 (the integrator keeps its own default).  It is
//  read where the other adaptive keys are -- a `timeSteppingControl {}`
//  sub-dict, else flat in controlDict -- and REFUSED when the run does not
//  integrate adaptively (a fixed-step run has no such guard, and a declared
//  key nothing reads would be a silent no-op), when it is not a whole
//  number, when it is below 1, or above 1e9 (a guard that large guards
//  nothing, and the conversion to a step count must stay exact).
inline std::size_t readMaxSteps(const DictPtr& controlDict, bool adaptive)
{
    const DictPtr ts = controlDict->found("timeSteppingControl")
        ? controlDict->subDict("timeSteppingControl") : controlDict;
    if (!ts->found("maxSteps")) return 0;
    if (!adaptive)
        throw std::runtime_error("maxSteps is the ADAPTIVE integrator's"
            " per-interval step guard, and this run is `timeStepping fixed`"
            " (or declares none) -- nothing would read it.  Declare"
            " `timeStepping adaptive;` or delete maxSteps.");
    const scalar ms = ts->lookupScalar("maxSteps");
    if (!(ms >= 1.0 && ms <= 1.0e9) || ms != std::floor(ms))
    {
        std::ostringstream os;
        os << "timeSteppingControl.maxSteps must be a whole number of"
              " sub-steps per interval between 1 and 1e9 (got " << ms << ")";
        throw std::runtime_error(os.str());
    }
    return static_cast<std::size_t>(ms);
}

class AdaptiveTimeStepper
{
public:
    // onStep(tEnd, hTaken): called once per accepted sub-step.  May be empty.
    using StepCallback = std::function<void(scalar tEnd, scalar hTaken)>;

    explicit AdaptiveTimeStepper(const AdaptiveSettings& s)
        : settings_(s)
    {
        if (!ODEIntegrator::known("Rosenbrock23"))
            ODEIntegrator::registerBuiltins();
        integ_ = ODEIntegrator::New("Rosenbrock23");
        // Warm step carried across intervals; seed at the LOW deltaT0.
        hCarry_ = settings_.deltaT0;
    }

    // Advance the supplied ODE-form units over [t0, t1] in place.  Returns the
    // ODE statistics (accepted/rejected steps, last step) of the sweep.  The
    // step at the END of this interval is carried into the next call.
    ODEStats advance(const std::vector<OdeUnit>& units,
                     scalar t0, scalar t1,
                     const StepCallback& onStep = {},
                     const StepCallback& onAcceptedState = {})
    {
        ODEStats st;
        if (t1 <= t0 || units.empty()) return st;

        // --- gather: one global packed state + per-unit offsets ----------
        std::vector<std::size_t> off(units.size() + 1, 0);
        for (std::size_t u = 0; u < units.size(); ++u)
            off[u + 1] = off[u] + units[u].pack().size();
        const std::size_t N = off.back();

        sVector y(N);
        // A unit's species rows sit anywhere in Y (the layout is per-unit, not a
        // global contiguous species prefix), so the absolute tolerance is broadcast
        // UNIFORMLY across all rows; each unit's packed state is scattered into Y by
        // its offset.
        sVector atol(N, settings_.atol);
        for (std::size_t u = 0; u < units.size(); ++u)
        {
            const sVector yu = units[u].pack();
            for (std::size_t i = 0; i < yu.size(); ++i)
                y[off[u] + i] = yu[i];
        }

        // --- the global derivative: scatter Y -> units, gather f ---------
        DerivFn f = [&](scalar /*t*/, const sVector& yg) -> sVector
        {
            sVector dy(N);
            for (std::size_t u = 0; u < units.size(); ++u)
            {
                const std::size_t lo = off[u], hi = off[u + 1];
                sVector yu(yg.begin() + lo, yg.begin() + hi);
                const sVector du = units[u].derivative(yu);
                for (std::size_t i = 0; i < du.size(); ++i)
                    dy[lo + i] = du[i];
            }
            return dy;
        };

        ODEControls ctrl;
        ctrl.atol      = atol;
        ctrl.rtol      = settings_.rtol;
        ctrl.hInit     = (hCarry_ > 0.0) ? hCarry_ : settings_.deltaT0;
        ctrl.hMax      = settings_.deltaTmax;
        ctrl.maxGrowth = settings_.maxGrowth;
        if (settings_.maxSteps > 0) ctrl.maxSteps = settings_.maxSteps;
        ctrl.verbosity = 0;            // the driver owns the glass-box prints
        // nPositive can only mark a CONTIGUOUS prefix; with several units the
        // species rows are interleaved, so we leave nPositive=0 and rely on
        // each unit's setOdeState() clamp + the integrator's finiteness guard.
        ctrl.nPositive = (units.size() == 1) ? units[0].nPositive : 0;
        if (onStep) ctrl.onAccept = onStep;
        // State-aware ledger hook: commit the ACCEPTED state into the units
        // FIRST, so the ledger's snapshots read the accepted state, then let
        // the ledger integrate over the step just taken.
        if (onAcceptedState)
            ctrl.onAcceptState =
                [&](scalar tEnd, scalar hTaken, const sVector& yg)
            {
                for (std::size_t u = 0; u < units.size(); ++u)
                {
                    sVector yu(yg.begin() + off[u], yg.begin() + off[u + 1]);
                    units[u].commit(yu);
                }
                onAcceptedState(tEnd, hTaken);
            };

        st = integ_->integrate(y, t0, t1, f, ctrl);

        // --- a FAILED interval is refused, never handed back as a step ----
        //  The partial vector is NOT scattered: nothing may describe the
        //  units as having reached t1, and the run ends here.
        if (!st.ok)
            throw IntegrationFailure(failureMessage(units, t0, t1, st, ctrl));

        // --- scatter the result back into the units ---------------------
        for (std::size_t u = 0; u < units.size(); ++u)
        {
            sVector yu(y.begin() + off[u], y.begin() + off[u + 1]);
            units[u].commit(yu);
        }

        // Carry the step into the next interval (warm restart).
        if (st.hLast > 0.0) hCarry_ = st.hLast;
        return st;
    }

    scalar carriedStep() const { return hCarry_; }

    //  The refusal's text: ONE home, so both time loops say the same thing.
    static std::string failureMessage(const std::vector<OdeUnit>& units,
                                      scalar t0, scalar t1,
                                      const ODEStats& st,
                                      const ODEControls& ctrl)
    {
        std::ostringstream os;
        os << "time integration FAILED on the interval [" << t0 << ", " << t1
           << "] s: Rosenbrock23 gave up at t = " << st.tReached << " s ("
           << (t1 > t0 ? 100.0 * (st.tReached - t0) / (t1 - t0) : 0.0)
           << " % of the interval) -- "
           << (st.failure.empty() ? std::string("cause not reported")
                                  : st.failure)
           << ".  " << st.accepted << " accepted and " << st.rejected
           << " rejected sub-step(s), last step h = " << st.hLast
           << " s against the floor hMin = " << st.hMinUsed
           << " s, maxSteps = " << ctrl.maxSteps << ".  Unit(s) integrated: ";
        for (std::size_t u = 0; u < units.size(); ++u)
            os << (u ? ", " : "")
               << (units[u].name.empty() ? std::string("(unnamed)")
                                         : "'" + units[u].name + "'");
        os << ".  The state is NOT advanced to t = " << t1 << " s: no recipe"
              " event fires, nothing is routed, no trajectory row and no"
              " time directory is written for it, and a run under an outer"
              " driver reports this evaluation as FAILED.  Remedies: tighten"
              " deltaTmax / deltaT0, loosen rtol / atol, raise"
              " timeSteppingControl.maxSteps if the guard was declared low,"
              " or check the model for a singularity near t = "
           << st.tReached << " s.";
        return os.str();
    }

private:
    AdaptiveSettings                 settings_;
    std::unique_ptr<ODEIntegrator>   integ_;
    scalar                           hCarry_ = 0.0;
};

} // namespace Choupo::solver
