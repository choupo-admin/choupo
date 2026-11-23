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
        call, so a caller cannot forget to read it;
      * GUARDS EVERY UNIT'S SPECIES ROWS with ONE per-row positivity mask
        (2026-10-31, DEV.md 4c C185 item 8): each unit's leading
        `odeNPositive()` rows are marked at that unit's offset in the packed
        vector, and a trial step that drives any of them negative is
        REJECTED by the integrator (the step halves).  The guard used to be
        a prefix count, which cannot name rows at an offset, so with two or
        more units it was switched OFF and the overshoot was accepted and
        then clipped by the unit -- inventory invented at exit 0.

    This is a thin orchestrator over the existing ODEIntegrator: it does NOT
    re-implement error control --- it scatters/gathers the per-unit packed
    state and hands the whole vector to Rosenbrock23.
\*---------------------------------------------------------------------------*/

#pragma once

#include "ODEIntegrator.H"
#include "core/Dictionary.H"
#include "core/Types.H"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <cstddef>
#include <functional>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo::solver
{

// One ODE-form unit, reduced to the closures the driver needs.  The caller
// (choupoBatch / the dynamic driver) builds these from a unit's
// odeState/setOdeState/odeDerivative/odeNPositive/odeRowLabel.
struct OdeUnit
{
    std::function<sVector()>                 pack;        // current packed Y
    std::function<void(const sVector&)>      commit;      // write Y back
    std::function<sVector(const sVector&)>   derivative;  // dY/dt = f(Y)
    //  The unit's LEADING rows that must stay >= 0 (its species rows; the
    //  unit's own contract, `odeNPositive()`).  advance() marks them at the
    //  unit's offset in the global per-row mask -- see positiveRowMask.
    std::size_t                              nPositive = 0;
    std::string                              name;           // for a refusal
    //  Optional: the name of packed row i ("n_compA"), so a refusal can say
    //  WHICH state the mask stopped.  Empty => the row is named by index.
    std::function<std::string(std::size_t)>  rowLabel;
    //  Optional: the unit's ANALYTIC Jacobian d f / d Y at Y (the unit's
    //  own block), given its f(Y) and the integrator's per-row scales.
    //  Empty => none.  The sweep hands the integrator a global Jacobian,
    //  block-diagonal over the units, ONLY when EVERY unit of the sweep
    //  supplies one (a coupling between units would be an off-block entry
    //  the audit measures and refuses); otherwise the dense finite
    //  difference, exactly as before.  The model's f must not read t.
    std::function<std::vector<sVector>(const sVector& y, const sVector& f0,
                                        const sVector& typ)> jacobian;
    //  Optional: the unit's row sizes for the audit of that Jacobian
    //  (ODEAnalyticJacobian::auditScale).  Empty => max(|y_i|, atol).
    std::function<sVector(const sVector& y)> jacobianScale;
    //  Optional SPARSE form of that Jacobian (ODEAnalyticJacobian::sparse):
    //  a sweep of ONE unit factors W on the unit's pattern; a sweep of several
    //  assembles the dense block-diagonal matrix, as before.
    bool                                     sparse = false;
    std::shared_ptr<const SparsePattern>     pattern;
    std::function<void(const sVector& y, const sVector& f0, const sVector& typ,
                       SparseJacobian& J)>   sparseJacobian;
    //  Optional: the ABSOLUTE tolerance of this unit's leading `nPositive`
    //  (species) rows, when it differs from the sweep's uniform atol.  < 0 =>
    //  the sweep's atol (every other caller).  choupoBatch sets it, for a
    //  batchReactor whose case declares no atol, to 1e-12 of the unit's initial
    //  total kmol (DEV.md 4c C471): a uniform 1e-9 kmol is 4e-5 in mole
    //  fraction on a 2.5e-5 kmol vessel and leaves ppm radicals unwatched.
    scalar                                   atolSpecies = -1.0;
    //  (declared LAST: callers initialise this struct positionally)
    //  The unit's `linearSolver` key (0 dense, 1 sparse, 2 auto).  A sweep of
    //  SEVERAL units factors W on the BLOCK-DIAGONAL pattern when every unit
    //  has one, none says `dense`, and either one says `sparse`
    //  or the packed rows reach kSparseAutoRows (C474: the key used to be
    //  read by the sweep of one unit only, silently dropped for several).
    int                                      linearKey = 2;
};

//  THE ONE HOME of the per-row positivity mask over a vector packed from
//  several units (2026-10-31, DEV.md 4c C185 item 8).  `off` is the offset
//  table advance() builds (off[u] .. off[u+1] are unit u's rows).  Each unit's
//  leading nPositive rows are marked AT ITS OFFSET, so the guard holds for
//  every unit -- the prefix count it replaced could only mark the first unit,
//  and the driver had switched the guard OFF for every run with two or more.
//  A unit claiming more positive rows than it packs is a contract violation
//  and is REFUSED by name here, never truncated in silence.
inline std::vector<bool> positiveRowMask(const std::vector<OdeUnit>& units,
                                         const std::vector<std::size_t>& off)
{
    std::vector<bool> mask(off.back(), false);
    for (std::size_t u = 0; u < units.size(); ++u)
    {
        const std::size_t rows = off[u + 1] - off[u];
        if (units[u].nPositive > rows)
            throw std::runtime_error("AdaptiveTimeStepper: unit '"
                + units[u].name + "' declares " + std::to_string(units[u].nPositive)
                + " positive rows but packs only " + std::to_string(rows)
                + " -- odeNPositive() must not exceed odeState().size()");
        for (std::size_t i = 0; i < units[u].nPositive; ++i)
            mask[off[u] + i] = true;
    }
    return mask;
}

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
    //  The stiff scheme of the sweep, by its ODEIntegrator name:
    //  "Rosenbrock23" (the default, every case that declares nothing) or
    //  "Rodas4".  choupoBatch sets it from the vessels' `solver { integrator }`
    //  (C474: it used to be Rosenbrock23 whatever the case declared).
    std::string integrator = "Rosenbrock23";
    //  `solver { denseOutput hermite; }` (C473 h): the driver writes the rows
    //  between steps from the cubic Hermite of the step's ends and slopes
    //  instead of the integrator's own dense output; denseAt() then declines.
    bool        denseHermite = false;
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
        if (!ODEIntegrator::known(settings_.integrator))
            ODEIntegrator::registerBuiltins();
        integ_ = ODEIntegrator::New(settings_.integrator);
        //  DIAGNOSTIC, off unless asked (C473 b): CHOUPO_ODE_STATS=1 PRINTS the
        //  run's work counters and timers when the stepper ends; it changes nothing.
        statsOn_ = std::getenv("CHOUPO_ODE_STATS") != nullptr;
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
        dense_.reset();
        denseOff_ = off;
        denseAtol_.clear();
        denseMask_.clear();

        sVector y(N);
        // A unit's species rows sit anywhere in Y (the layout is per-unit, not a
        // global contiguous species prefix), so the absolute tolerance is broadcast
        // UNIFORMLY across all rows; each unit's packed state is scattered into Y by
        // its offset.
        sVector atol(N, settings_.atol);
        for (std::size_t u = 0; u < units.size(); ++u)
            if (units[u].atolSpecies >= 0.0)
                for (std::size_t i = 0; i < units[u].nPositive && off[u] + i < N; ++i)
                    atol[off[u] + i] = units[u].atolSpecies;
        for (std::size_t u = 0; u < units.size(); ++u)
        {
            const sVector yu = units[u].pack();
            for (std::size_t i = 0; i < yu.size(); ++i)
                y[off[u] + i] = yu[i];
        }

        // --- the global derivative: scatter Y -> units, gather f ---------
        DerivFn fInner = [&](scalar /*t*/, const sVector& yg) -> sVector
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
        //  CHOUPO_ODE_STATS: the time spent in the right-hand side, counted.
        DerivFn f = fInner;
        if (statsOn_)
            f = [this, fInner](scalar t, const sVector& yg)
            {
                const auto a = std::chrono::steady_clock::now();
                sVector r = fInner(t, yg);
                nsF_ += std::chrono::duration_cast<std::chrono::nanoseconds>(
                            std::chrono::steady_clock::now() - a).count();
                ++nF_;
                return r;
            };

        ODEControls ctrl;
        ctrl.atol      = atol;
        ctrl.rtol      = settings_.rtol;
        ctrl.hInit     = (hCarry_ > 0.0) ? hCarry_ : settings_.deltaT0;
        ctrl.hMax      = settings_.deltaTmax;
        ctrl.maxGrowth = settings_.maxGrowth;
        if (settings_.maxSteps > 0) ctrl.maxSteps = settings_.maxSteps;
        ctrl.verbosity = 0;            // the driver owns the glass-box prints
        //  Every unit's species rows, at that unit's offset: a trial step that
        //  drives any of them negative is REJECTED by the integrator and the
        //  step shrinks.  Nothing downstream clips (the integrator sets a round-off below zero within atol to zero, itself) -- a negative masked row
        //  reaching a unit's commit is a defect the unit refuses by name.
        ctrl.positiveRows = positiveRowMask(units, off);
        denseAtol_ = atol;
        denseMask_ = ctrl.positiveRows;
        if (onStep) ctrl.onAccept = onStep;
        //  The analytic Jacobian, block-diagonal over the units, when EVERY
        //  unit supplies one (ODEAnalyticJacobian; the audit record lives in
        //  analytic_, across intervals, so its schedule spans the run).
        bool allAnalytic = true;
        for (const auto& u : units) allAnalytic = allAnalytic && bool(u.jacobian);
        if (allAnalytic)
        {
            analytic_.autonomous = true;          // the sweep's f ignores t
            analytic_.owner = "the adaptive sweep (unit(s)";
            for (std::size_t u = 0; u < units.size(); ++u)
                analytic_.owner += (u ? ", '" : " '") + units[u].name + "'";
            analytic_.owner += ")";
            analytic_.rowLabel = [&units, off](std::size_t i) -> std::string
            {
                for (std::size_t u = 0; u < units.size(); ++u)
                    if (i < off[u + 1])
                        return (units[u].rowLabel ? units[u].rowLabel(i - off[u])
                                                  : "row " + std::to_string(i - off[u]))
                             + " of '" + units[u].name + "'";
                return "row " + std::to_string(i);
            };
            analytic_.jacobian = [&units, off, N](scalar, const sVector& yg,
                                                  const sVector& fg, const sVector& tg)
            {
                std::vector<sVector> J(N, sVector(N, 0.0));
                for (std::size_t u = 0; u < units.size(); ++u)
                {
                    const std::size_t lo = off[u], hi = off[u + 1];
                    const sVector yu(yg.begin() + lo, yg.begin() + hi);
                    const sVector fu(fg.begin() + lo, fg.begin() + hi);
                    const sVector tu(tg.begin() + lo, tg.begin() + hi);
                    const auto Ju = units[u].jacobian(yu, fu, tu);
                    if (Ju.size() != hi - lo)
                        throw std::runtime_error("AdaptiveTimeStepper: unit '"
                            + units[u].name + "' returned an analytic Jacobian of "
                            + std::to_string(Ju.size()) + " rows for "
                            + std::to_string(hi - lo) + " packed rows");
                    for (std::size_t i = 0; i < Ju.size(); ++i)
                        for (std::size_t k = 0; k < Ju[i].size() && k < hi - lo; ++k)
                            J[lo + i][lo + k] = Ju[i][k];
                }
                return J;
            };
            const scalar atolFloor = settings_.atol;
            analytic_.auditScale = [&units, off, N, atolFloor](const sVector& yg)
            {
                sVector sc(N, 0.0);
                for (std::size_t u = 0; u < units.size(); ++u)
                {
                    const std::size_t lo = off[u], hi = off[u + 1];
                    sVector su;
                    if (units[u].jacobianScale)
                        su = units[u].jacobianScale(sVector(yg.begin() + lo, yg.begin() + hi));
                    for (std::size_t i = lo; i < hi; ++i)
                        sc[i] = (su.size() == hi - lo) ? su[i - lo]
                                                       : std::max(std::abs(yg[i]), atolFloor);
                }
                return sc;
            };
            analytic_.sparse = false;
            if (units.size() == 1 && units[0].sparse && units[0].pattern
                && units[0].sparseJacobian)
            {
                analytic_.sparse = true;
                analytic_.pattern = units[0].pattern;
                analytic_.sparseJacobian = [&units](scalar, const sVector& yg,
                    const sVector& fg, const sVector& tg, SparseJacobian& J)
                { units[0].sparseJacobian(yg, fg, tg, J); };
            }
            else if (units.size() > 1)
            {
                bool all = true, anySparse = false;
                for (const auto& u : units)
                {
                    all = all && u.pattern && u.sparseJacobian && u.linearKey != 0;
                    anySparse = anySparse || u.linearKey == 1;
                }
                if (all)
                    for (std::size_t u = 0; u < units.size(); ++u)
                        if (units[u].pattern->n != off[u + 1] - off[u])
                            throw std::runtime_error("AdaptiveTimeStepper: unit '" + units[u].name
                                + "' has a sparse pattern of " + std::to_string(units[u].pattern->n)
                                + " rows for " + std::to_string(off[u + 1] - off[u])
                                + " packed rows.  Refusing.");
                if (all && (anySparse || N >= kSparseAutoRows))
                {
                    //  W = I - h d J is block-diagonal: factor it on the
                    //  blocks' union.  The pattern object is kept while the
                    //  units' own patterns are the ones it was built from.
                    bool same = multiPattern_ && multiSources_.size() == units.size();
                    for (std::size_t u = 0; same && u < units.size(); ++u)
                        same = multiSources_[u] == units[u].pattern;
                    if (!same)
                    {
                        auto P = std::make_shared<SparsePattern>();
                        P->n = N;
                        P->rowPtr.assign(1, 0);
                        multiSources_.clear();
                        for (std::size_t u = 0; u < units.size(); ++u)
                        {
                            const SparsePattern& q = *units[u].pattern;
                            for (std::size_t i = 0; i < q.n; ++i)
                            {
                                for (std::size_t k = q.rowPtr[i]; k < q.rowPtr[i + 1]; ++k)
                                    P->col.push_back(off[u] + q.col[k]);
                                P->rowPtr.push_back(P->col.size());
                            }
                            multiSources_.push_back(units[u].pattern);
                        }
                        multiPattern_ = P;
                    }
                    analytic_.sparse = true;
                    analytic_.pattern = multiPattern_;
                    analytic_.sparseJacobian = [&units, off](scalar, const sVector& yg,
                        const sVector& fg, const sVector& tg, SparseJacobian& J)
                    {
                        J.values.clear(); J.u.clear(); J.v.clear(); J.blocks.clear();
                        bool anyR1 = false;
                        std::vector<SparseJacobian> parts(units.size());
                        for (std::size_t u = 0; u < units.size(); ++u)
                        {
                            const std::size_t lo = off[u], hi = off[u + 1];
                            SparseJacobian& Ju = parts[u];
                            units[u].sparseJacobian(
                                sVector(yg.begin() + lo, yg.begin() + hi),
                                sVector(fg.begin() + lo, fg.begin() + hi),
                                sVector(tg.begin() + lo, tg.begin() + hi), Ju);
                            if (Ju.values.size() != units[u].pattern->nnz()
                                || (!Ju.u.empty() && (Ju.u.size() != hi - lo || Ju.v.size() != hi - lo)))
                                throw std::runtime_error("AdaptiveTimeStepper: unit '" + units[u].name
                                    + "' returned a sparse Jacobian of the wrong size (values "
                                    + std::to_string(Ju.values.size()) + " for a pattern of "
                                    + std::to_string(units[u].pattern->nnz()) + ", u/v "
                                    + std::to_string(Ju.u.size()) + "/" + std::to_string(Ju.v.size())
                                    + " for " + std::to_string(hi - lo) + " rows).  Refusing.");
                            anyR1 = anyR1 || !Ju.u.empty();
                            J.values.insert(J.values.end(), Ju.values.begin(), Ju.values.end());
                        }
                        //  Each vessel's rank-one part (gasConstantP) on its own
                        //  rows; a vessel without one contributes zeros.
                        if (anyR1)
                        {
                            const std::size_t Nn = off[units.size()];
                            J.u.assign(Nn, 0.0); J.v.assign(Nn, 0.0);
                            J.blocks.assign(off.begin(), off.end());
                            for (std::size_t u = 0; u < units.size(); ++u)
                                if (!parts[u].u.empty())
                                    for (std::size_t i = 0; i < parts[u].u.size(); ++i)
                                    {
                                        J.u[off[u] + i] = parts[u].u[i];
                                        J.v[off[u] + i] = parts[u].v[i];
                                    }
                        }
                    };
                }
            }
            ctrl.analytic = &analytic_;
        }
        // State-aware ledger hook: commit the ACCEPTED state into the units
        // FIRST, so the ledger's snapshots read the accepted state, then let
        // the ledger integrate over the step just taken.
        //  The integrator's own dense output of the step just accepted (C473
        //  h), kept for denseAt() while the caller's callback runs; only built
        //  when a caller of this advance() asked for the accepted-state hook.
        if (onAcceptedState && wantDense_)
            ctrl.onDense = [this](std::shared_ptr<const ODEDenseOutput> d)
            { dense_ = std::move(d); denseY0_.clear(); dense_->eval(0.0, denseY0_);
              denseF0_ = dense_->startSlope(); };
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

        if (statsOn_ && analytic_.sparseJacobian)
        {
            auto inner = analytic_.sparseJacobian;
            analytic_.sparseJacobian = [this, inner](scalar t, const sVector& yy, const sVector& ff,
                                                    const sVector& tt, SparseJacobian& J)
            {
                const auto a = std::chrono::steady_clock::now();
                inner(t, yy, ff, tt, J);
                nsJ_ += std::chrono::duration_cast<std::chrono::nanoseconds>(
                            std::chrono::steady_clock::now() - a).count();
                ++nJ_;
            };
        }
        const auto tIntegrate = std::chrono::steady_clock::now();
        st = integ_->integrate(y, t0, t1, f, ctrl);
        nsIntegrate_ += std::chrono::duration_cast<std::chrono::nanoseconds>(
                            std::chrono::steady_clock::now() - tIntegrate).count();
        total_.steps += st.steps; total_.accepted += st.accepted;
        total_.rejected += st.rejected; total_.jacobians += st.jacobians;
        total_.factorisations += st.factorisations; total_.rhsEvals += st.rhsEvals;
        total_.thetaMax = std::max(total_.thetaMax, st.thetaMax);
        //  The closures above read this call's `units` and offsets: drop
        //  them, so the record kept across intervals holds no dangling one.
        analytic_.jacobian = nullptr;
        analytic_.rowLabel = nullptr;
        analytic_.auditScale = nullptr;
        analytic_.sparseJacobian = nullptr;

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

        // Carry the step into the next interval (warm restart): the step the
        // controller PROPOSED (hNext), not the one it grew out of the step
        // shortened to land on t1 (hLast), which overshoots and pays a
        // rejected step -- and a Jacobian -- at the start of every interval
        // (the same fix FixedBedAdsorber made, see ODEStats::hNext).
        if (st.hNext > 0.0)      hCarry_ = st.hNext;
        else if (st.hLast > 0.0) hCarry_ = st.hLast;
        return st;
    }

    scalar carriedStep() const { return hCarry_; }

    //- The caller will read denseAt() (choupoBatch's free-stepping write grid):
    //  only then does the integrator build a dense object per accepted step.
    //  Default false, so a driver that only wants the accepted-state hook (the
    //  dynamic driver's ledger) pays nothing.
    void wantDense(bool b) { wantDense_ = b; }

    //- DENSE OUTPUT of the step the accepted-state callback is being called
    //  for (C473 h): the integrator's own interpolant at the fraction theta of
    //  that step (0 = its start, 1 = its end), split per unit in the order of
    //  the units passed to advance().  false when the integrator has none
    //  (RK4, EulerSI): the caller then keeps its own interpolation.  Const and
    //  private to THIS stepper, so each vessel's stepper serves its own thread.
    bool denseAt(scalar theta, std::vector<sVector>& perUnit) const
    {
        if (!dense_ || settings_.denseHermite) return false;
        sVector yg;
        dense_->eval(theta, yg);
        //  A polynomial may come out a round-off below zero on a trace species
        //  (a radical not yet formed).  Within the row's own absolute tolerance
        //  that is the same number as zero -- the integrators' own rule for an
        //  accepted state -- so it is set to zero, EXCEPT in a row that was empty
        //  at the start of the step: that is the integrators' rule too (an empty
        //  row still being consumed is not clipped, the positivity refusal stays
        //  by name), and such a value is left for the caller's whole-vector
        //  fallback, as is anything more negative than atol.
        for (std::size_t i = 0; i < yg.size() && i < denseMask_.size(); ++i)
            if (denseMask_[i] && yg[i] < 0.0)
            {
                const scalar a = denseAtol_.empty() ? 1.0e-12
                    : (i < denseAtol_.size() ? denseAtol_[i] : denseAtol_.back());
                //  the integrators' own predicate: not an empty row still consumed
                const bool consumed = i < denseY0_.size() && !(denseY0_[i] > 0.0)
                                      && i < denseF0_.size() && denseF0_[i] < 0.0;
                if (yg[i] > -a && !consumed) yg[i] = 0.0;
            }
        perUnit.assign(denseOff_.size() - 1, sVector());
        for (std::size_t u = 0; u + 1 < denseOff_.size(); ++u)
            perUnit[u].assign(yg.begin() + denseOff_[u], yg.begin() + denseOff_[u + 1]);
        return true;
    }

    ~AdaptiveTimeStepper()
    {
        if (statsOn_ && total_.steps > 0)
            std::cout << "[ode-stats] integrator=" << integ_->name()
                      << " steps=" << total_.steps << " accepted=" << total_.accepted
                      << " rejected=" << total_.rejected << " jacobians=" << total_.jacobians
                      << " factorisations=" << total_.factorisations
                      << " rhs=" << total_.rhsEvals << " thetaMax=" << total_.thetaMax
                      << " analyticJacobiansBuilt=" << analytic_.jacobians
                      << " auditRhs=" << analytic_.auditEvals
                      << " | time[ms]: integrate " << nsIntegrate_ * 1e-6 << ", rhs " << nsF_ * 1e-6
                      << " (" << nF_ << " calls, " << (nF_ ? nsF_ * 1e-3 / nF_ : 0.0) << " us each), jacobian "
                      << nsJ_ * 1e-6 << " (" << nJ_ << " calls, " << (nJ_ ? nsJ_ * 1e-3 / nJ_ : 0.0)
                      << " us each)\n";
    }

    //  The analytic-Jacobian audit record of the run (empty when no sweep
    //  ran on an analytic Jacobian).  The caller announces it.
    const ODEAnalyticJacobian& analyticAudit() const { return analytic_; }

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
                                  : st.failure);
        //  The row the mask stopped, named by its unit and its own label: a
        //  student reads "n_compA of 'tank1'", not "row 7 of 12".
        if (st.negativeRow != static_cast<std::size_t>(-1))
        {
            std::size_t lo = 0;
            for (std::size_t u = 0; u < units.size(); ++u)
            {
                const std::size_t rows = units[u].pack().size();
                if (st.negativeRow < lo + rows)
                {
                    const std::size_t i = st.negativeRow - lo;
                    os << " -- the row driven negative is row " << i
                       << " of unit '" << units[u].name << "'";
                    if (units[u].rowLabel)
                        os << " (" << units[u].rowLabel(i) << ")";
                    os << ": its model keeps consuming that state past"
                          " zero, which no positivity-preserving step can"
                          " follow";
                    break;
                }
                lo += rows;
            }
        }
        os << ".  " << st.accepted << " accepted and " << st.rejected
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
    std::shared_ptr<const ODEDenseOutput> dense_;    // the last accepted step's own interpolant
    sVector                          denseY0_;       // the state at the start of that step
    sVector                          denseF0_;       // and its slope f(t, y)
    sVector                          denseAtol_;     // the per-row atol of that step
    std::vector<bool>                denseMask_;     // its positivity mask
    std::vector<std::size_t>         denseOff_;      // the unit offsets of that step's packed state
    ODEAnalyticJacobian              analytic_;
    ODEStats                         total_;             // summed over the intervals (diagnostic)
    bool                             statsOn_ = false;
    bool                             wantDense_ = false;
    long long nsF_ = 0, nsJ_ = 0, nsIntegrate_ = 0; long nF_ = 0, nJ_ = 0;   // diagnostics
    std::shared_ptr<SparsePattern>   multiPattern_;      // block-diagonal, kept across intervals
    std::vector<std::shared_ptr<const SparsePattern>> multiSources_;
};

} // namespace Choupo::solver
