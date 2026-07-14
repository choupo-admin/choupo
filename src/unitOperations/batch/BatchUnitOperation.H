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
    Choupo::BatchUnitOperation

Description
    Abstract base for a single vessel in a batch (time-dependent)
    simulation.  Conceptually distinct from steady-state UnitOperation:

      * State is intrinsic (mole numbers + T + V), not flow-through.
      * Time-stepped: `step(t, dt)` integrates forward by dt.
      * Material transfers between vessels happen via direct
        `chargeFrom()` / `dischargeAll()` calls in the recipe layer
 --- there are no continuous "streams" between
        batch units.  In baseline there is a SINGLE unit and
        no transfers; the recipe machinery comes later.

    Concrete types register themselves via the explicit factory
    pattern, same as steady UnitOperation (see §10 in CLAUDE.md).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/SimulationResult.H"   // TimelineEvent (the sequence/Gantt feed)
#include "core/Types.H"
#include "thermo/ThermoPackage.H"

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <utility>
#include <vector>

namespace Choupo {

// -------------------------------------------------------------------------
//  Vessel state.  Mole numbers (not fractions --- batch is closed by
//  default and ΣN evolves with reaction stoichiometry).  Temperature,
//  pressure and volume are tracked separately.
// -------------------------------------------------------------------------
struct BatchState
{
    sVector n;       // mole numbers [kmol]
    scalar  T = 0;   // temperature [K]
    scalar  P = 0;   // pressure [bar]
    scalar  V = 0;   // volume [m³]

    scalar totalMoles() const
    {
        scalar s = 0;
        for (auto v : n) s += v;
        return s;
    }
};

// -------------------------------------------------------------------------
//  BatchUnitOperation abstract base.
// -------------------------------------------------------------------------
class BatchUnitOperation
{
public:
    virtual ~BatchUnitOperation() = default;

    virtual const std::string& type() const = 0;
    virtual const std::string& name() const { return name_; }

    // Initialise the vessel from the unit's `flowsheetDict` entry.
    //   unitDict      — the unit's sub-dictionary (initial state, kinetics ref)
    //   thermo        — components and pure-component data
    //   reactionsDict — named-reaction library (may be null)
    virtual void initialise(const DictPtr&        unitDict,
                            const ThermoPackage&  thermo,
                            const DictPtr&        reactionsDict) = 0;

    // Advance the vessel state by dt starting from current time t.
    virtual void step(scalar t, scalar dt) = 0;

    // ---- Optional packed-ODE form (the adaptive-stepping interface) -----
    //   A vessel whose dynamics are a clean autonomous ODE dY/dt = f(Y) on a
    //   packed state vector Y may expose it here, so choupoBatch's adaptive
    //   driver can hand the SAME state to the stiff Rosenbrock23 integrator
    //   (one error-controlled sub-step sweep over [t0,t1]) instead of calling
    //   step() with a fixed dt.  Default `hasOdeForm()==false` => the unit
    //   keeps its own step() (e.g. a still with its bubble-T inner solve);
    //   the adaptive driver then advances such a unit with one fixed step per
    //   sub-interval.
    virtual bool    hasOdeForm() const           { return false; }
    virtual sVector odeState()   const           { return {}; }     // pack Y
    virtual void    setOdeState(const sVector& /*y*/) {}            // unpack+commit
    virtual sVector odeDerivative(const sVector& /*y*/) const { return {}; }
    // Number of leading rows of Y that must stay >= 0 (species moles; T free).
    virtual std::size_t odeNPositive() const     { return 0; }

    // Inspect current state (for trajectory writeout).
    virtual const BatchState& state() const = 0;

    // Extra trajectory columns beyond the mole numbers + T.  A unit
    // whose interesting state is NOT just mole numbers (e.g. the crystalliser's
    // supersaturation, moments and crystal size) returns them here as
    // (column-suffix, value) pairs; choupoBatch appends them to trajectory.csv.
    // Default: none (the reactor/still trajectories are unchanged).
    virtual std::vector<std::pair<std::string, scalar>> trajectoryExtras() const
    { return {}; }

    // Extra FINAL KPIs beyond the generic (t_end, T/P/moles_final) set the
    // batch driver pins for every vessel.  A unit whose verdict is not just
    // its final inventory (the rectifier's instantaneous x_D, R, D) returns
    // them here; choupoBatch merges them into the golden-checkable table.
    virtual std::map<std::string, scalar> kpis() const { return {}; }

    // The vessel's TOTAL material inventory per component (kmol), ALL phases
    // (forum #88): the fluid holdup state().n by default; a vessel holding
    // material OUTSIDE state_.n (the crystalliser's crystal magma) overrides
    // and ADDS it -- the campaign mass balance must never miss a phase.
    virtual sVector materialInventory() const { return state().n; }

    //  Declared model-error residual (forum #119): kmol per COMPONENT that
    //  the unit's DECLARED closure fabricates (+) or destroys (-) by
    //  construction -- e.g. the fixed bed's constant-(u, P, T) carrier
    //  roll-up.  The campaign balance NEVER discounts this from the
    //  reported numbers; it uses it only as an independent CROSS-CHECK so
    //  the verdict can distinguish "unexplained leak" (FAIL) from "the
    //  declared, quantified model error, matching its own prediction"
    //  (reported LOUD, non-fatal).  Default: none.
    virtual std::map<std::string, scalar> declaredMaterialResidual() const
    { return {}; }

    // ENERGY ledger records (forum #98.3/#99/#101): the vessel's exchanged-
    // energy history, one EXACT-integral record per segment of constant
    // physics.  Called ONCE by choupoBatch at campaign end (tEnd closes the
    // last open segment -- hence non-const).  Default: none.
    virtual std::vector<SimulationResult::EnergyRecord>
    energyRecords(scalar tEnd) { (void) tEnd; return {}; }

    // Clock notification: choupoBatch calls this on every vessel after each
    // committed time advance (both the fixed-step and the adaptive loops),
    // so a vessel can stamp its energy-ledger segment boundaries with the
    // REAL time -- notifyStateChanged()/setOperationParameter() carry no
    // time argument of their own.  Default: ignore.
    virtual void noteTimeAdvanced(scalar t) { (void) t; }

    // Total enthalpy [kJ] of the vessel's CURRENT all-phase inventory on
    // the elements datum, each phase priced on ITS OWN reference rung.
    // The campaign energy balance reads its dH_vessel terms through this
    // hook (at t=0 and at the end).  Default: the whole materialInventory
    // as ONE liquid at (T, P) -- right for every all-fluid vessel.  A
    // vessel holding material on another rung (the crystalliser's magma:
    // solid) OVERRIDES and prices each part where it belongs.  ok=false
    // (named) when any species cannot be priced.
    virtual scalar vesselEnthalpy(bool& ok, std::string& why) const
    {
        BatchState inv;
        inv.n = materialInventory();
        inv.T = state().T;
        inv.P = state().P;
        return packageEnthalpy_(inv, ok, why);
    }

    // The NAMED gap between this vessel's real energy physics and what its
    // energyRecords() represent -- empty string == fully ledgered.  The
    // campaign energy balance only claims a verdict when every vessel
    // answers empty; otherwise it reports UNAVAILABLE quoting each gap
    // verbatim (never a decorative closure, never a vague "not supported").
    // Default: a unit must OPT IN honestly by overriding to "".
    virtual std::string energyLedgerGap() const
    { return "energy physics not yet ledgered"; }

    // STATUS events for the run's sequence timeline (kind = "status"): a
    // qualitative state change the campaign narrative needs -- the
    // rectifier hitting refluxMax, a crystalliser exhausting supersaturation.
    // choupoBatch merges these with the fired recipe actions, sorted by t.
    virtual std::vector<SimulationResult::TimelineEvent> statusEvents() const
    { return {}; }

    // ---------------------------------------------------------------------
    //  Recipe hooks.  Default behaviour is sensible enough that
    //  most concrete vessels do not need to override --- BatchReactor and
    //  BatchStill rely on the defaults for chargeFrom / dischargeAll.
    // ---------------------------------------------------------------------

    // Add the contents of `src` to this vessel.  Mole numbers are summed
    // component-by-component.  The mix temperature solves H-EQUALITY on
    // the elements datum -- H(n1+n2, T_mix) = H(n1,T1) + H(n2,T2), by a
    // damped 1-D Newton warm-started at the molar average -- so charging
    // is a material act that conserves enthalpy exactly (phase (b), forum
    // #98.3-1).  An empty receiver inherits the source's T verbatim.
    // When either side cannot be priced (missing datum, no thermo
    // attached, failed evaluation) the charge falls back to the molar-T
    // average, ANNOUNCED once per (unit, reason) and recorded in
    // chargeFallbacks() so the campaign energy balance goes unavailable
    // naming it.  Pressure and Volume are taken from the source if the
    // receiver was empty; otherwise unchanged.
    virtual void chargeFrom(const BatchState& src);

    // Return the current state and zero the mole numbers of this
    // vessel.  Temperature, pressure and volume are preserved on the
    // returned object but the in-vessel state's n[] is cleared.  After
    // this call, totalMoles() == 0.
    virtual BatchState dischargeAll();

    // PARTIAL discharge (recipe layer): remove `fraction` (0..1) of
    // each component's moles and return them as a BatchState (same T/P/V);
    // the vessel keeps (1-fraction).  fraction>=1 == dischargeAll;
    // fraction<=0 returns an empty package and leaves the vessel untouched.
    virtual BatchState discharge(scalar fraction);

    // Change a named operating parameter at run time (e.g. T_setpoint
    // for an isothermal reactor, F_vap for a still).  Default throws
    // for any key; concrete units override what they support.
    virtual void setOperationParameter(const std::string& key, scalar value);

    // CONTINUOUS discharge (recipe layer): material the unit sheds
    // every step (e.g. a still's vapour).  The recipe layer routes it to a
    // `dischargeTo` target each step --- a distillate receiver.  Default:
    // nothing (returns an empty package); concrete units override + clear
    // their per-step buffer.  Returned moles are CONDENSED into the target.
    virtual BatchState takeContinuousDischarge();

    // Notify the unit that its state was just modified externally
    // (typically after a chargeFrom from the recipe layer).  Default
    // is no-op; e.g. BatchStill uses this to invalidate its warm
    // bubble-T seed.
    virtual void notifyStateChanged() {}

    // ---- Thermo attachment (phase (b), forum #98.3-1) --------------------
    //  The driver attaches the case's thermo package right after
    //  initialise(), so the BASE chargeFrom can price packages on the
    //  elements datum and solve the mix temperature by H-EQUALITY instead
    //  of the molar-T average.  Not owning; never null after set-up in
    //  choupoBatch (other binaries may leave it null -- chargeFrom then
    //  keeps the announced approximation).
    void attachThermo(const ThermoPackage* t) { thermoPkg_ = t; }

    // Named occasions this vessel's chargeFrom FELL BACK to the molar-T
    // average (missing enthalpy datum, failed evaluation, Newton failure).
    // The campaign energy balance drains these: an approximation never
    // enters a balance announced as closed.
    const std::vector<std::string>& chargeFallbacks() const
    { return chargeFallbacks_; }

    // ---- Factory (explicit registry, no auto-registration macros) ----
    using Factory = std::function<std::unique_ptr<BatchUnitOperation>()>;

    static void                              registerType(const std::string& name, Factory f);
    static std::unique_ptr<BatchUnitOperation> New(const std::string& type);
    static void                              registerBuiltins();
    static std::vector<std::string>          availableTypes();

    void setName(const std::string& nm) { name_ = nm; }

protected:
    // Mutable accessor concrete units expose so the base-class default
    // chargeFrom/dischargeAll can act on their state without each
    // subclass duplicating the bookkeeping.
    virtual BatchState& mutableState() = 0;

    std::string name_;

    const ThermoPackage*     thermoPkg_ = nullptr;
    std::vector<std::string> chargeFallbacks_;

    // Total enthalpy [kJ] of a package at its own (T, P) on the elements
    // datum, liquid basis -- the SAME pricing the material ledger uses.
    // ok=false (reason named) when any present species lacks a datum or
    // the evaluation throws.
    scalar packageEnthalpy_(const BatchState& pkg, bool& ok,
                            std::string& why) const;

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
