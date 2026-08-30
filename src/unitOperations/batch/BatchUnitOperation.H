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
#include "result/SimulationResult.H"   // TimelineEvent (the sequence/Gantt feed)
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

    //- The phase this package's enthalpy is priced in.  Every batch vessel's
    //  content and every still's condensate is a LIQUID, which is why the
    //  campaign's packageH() could price vf = 0 for years without being
    //  wrong.  The fixed bed's effluent is the first GAS package, and
    //  pricing a gas on the liquid leg costs Hvap per mole -- a basis
    //  mismatch the energy residual then reports as physics.  The default
    //  keeps every existing producer byte-identical.
    scalar  vf = 0.0;   // 0 = liquid (historic default), 1 = gas

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
    //  TEMPORAL utility demand (phase (f) second half, ratified 2026-08-03).
    //  A unit that CAN resolve its ledgered duty in time emits one sample
    //  per accepted driver step and per live record kind; the driver
    //  RECONCILES each energy record's window sum against the record's
    //  exact E_kJ (the ledger stays the only authority -- a profile that
    //  does not close is refused, the record stands) and only then writes
    //  the demand staircase.  The default is honest silence: a unit with
    //  no sampler contributes nothing and its records are LISTED as
    //  unprofiled, never guessed.  rateDefined=false marks an IMPULSE
    //  (energy with no duration has no finite rate: excluded from the
    //  peak, reported with a warning).  Drain semantics: the caller takes
    //  the samples and the unit forgets them.
    // ---------------------------------------------------------------------
    struct DemandSample
    {
        scalar      tStart = 0.0, tEnd = 0.0;   // s
        std::string kind;                       // matches the record kind
        scalar      dE_kJ = 0.0;
        bool        rateDefined = true;
    };
    virtual std::vector<DemandSample> takeDemandSamples() { return {}; }

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
    // `tNow` is the COMMITTED time of the step being drained: the driver
    // routes discharges BEFORE noteTimeAdvanced (the hand-off belongs to
    // the step the clock-note will stamp), so a drain that needs the time
    // must take it from here, never from its own last clock note (the
    // fixed bed's algebraic carrier outlet was one boundary behind).
    virtual BatchState takeContinuousDischarge(scalar tNow);

    // Notify the unit that its state is ABOUT to be modified externally
    // (fired by the base chargeFrom/discharge primitives BEFORE the first
    // mole is moved).  This is where an energy-ledger unit CLOSES its
    // constant-physics segment, so the segment's state difference stays
    // purely reactive/distillative -- closing after the mutation prices
    // the transfer jump into the duty record (the recipe01 mis-attribution
    // the temporal-demand reconciliation caught, 2026-08-03: a "reaction"
    // record of +6716.6 kJ that was really H(empty)-H(charge)).  Default
    // is no-op.
    virtual void notifyStateWillChange() {}

    // Notify the unit that its state was just modified externally
    // (after a chargeFrom/discharge from the recipe layer).  This is the
    // RE-BASE hook: reopen the segment on the post-transfer state, refresh
    // warm seeds/invariants.  It must NOT close a segment -- the close
    // belongs to notifyStateWillChange() above, on the pre-transfer state.
    virtual void notifyStateChanged() {}

    // ---- A6: the state that DEFINES a cyclic steady state ---------------
    //  What must repeat, cycle to cycle, for this vessel to be at CSS.
    //  Default: the holdup plus T -- right for a closed vessel.
    //
    //  THE TRAP THIS EXISTS TO AVOID: a unit's packed ODE state also holds
    //  MONOTONE ACCUMULATORS (the fixed bed's M_in/M_out ledger rows, its
    //  Q_wall row).  Those grow every cycle BY CONSTRUCTION, so a naive
    //  "compare the whole state vector" can never converge and would report
    //  a perfectly cyclic bed as never settling.  A unit that carries such
    //  rows OVERRIDES this and returns only what genuinely repeats.
    virtual sVector cycleState() const
    {
        sVector s = state().n;
        s.push_back(state().T);
        return s;
    }

    // ---- Datum amendments (A5 feed switching) ---------------------------
    //  An open-boundary unit counts its DECLARED feed commitment as
    //  campaign matter from t = 0 (the fixed bed's materialInventory).
    //  When a recipe setParameter re-declares that feed mid-campaign, the
    //  commitment changes DISCONTINUOUSLY -- matter enters or leaves the
    //  campaign datum without flowing through any equipment.  That jump
    //  must be LEDGERED, never absorbed: the unit prices each amendment as
    //  a package at the commitment's own (T, P, phase) and the driver
    //  records it against the external boundary (kind `feedAmendment`), so
    //  the campaign mass/element/energy balances read a record where they
    //  would otherwise see a leak.  Drained by choupoBatch right after the
    //  setOperationParameter that caused it.  Default: none.
    //  ONE HOOK for matter crossing the campaign boundary outside the
    //  transfer machinery (unified 2026-08-30; debt #15).  Two hooks used
    //  to answer this one question -- takeDatumAmendments (recipe-drained,
    //  a CHANGED DECLARATION such as the fixed bed's feed switch) and
    //  takeContinuousIntake (per-step, a FLOW such as the diafilter's
    //  make-up solvent).  The distinction that mattered was never the hook:
    //  it was the KIND WORD on the ledger record (a wash-water make-up is
    //  not a re-declared feed) and the RECORD SHAPE (one record per
    //  declaration event vs one accumulating record per vessel).  Both now
    //  live ON the amendment itself, producer-declared; the driver drains
    //  this queue on every accepted step AND right after a recipe
    //  setParameter (a swap-queue drains safely twice -- the second call
    //  finds it empty).
    struct DatumAmendment
    {
        bool        into = false;  // true: matter ENTERS the datum from the
                                   //   boundary; false: returned to it
        BatchState  pkg;           // the amended matter (n >= 0, own T/P/vf)
        std::string why;           // human-readable cause, for the timeline
        //  The ledger kind word.  "feedAmendment" is the historical meaning
        //  of this struct (a re-declared commitment) and stays the default
        //  so the fixed bed's producers are byte-unaffected; a continuous
        //  flow declares its own (the diafilter: "externalIntake").
        std::string kind = "feedAmendment";
        //  false: one ledger record PER AMENDMENT (a discrete declaration
        //  event, with its own timeline entry).  true: ONE accumulating
        //  record per (unit, kind, direction), extended in place -- the
        //  shape a continuous flow needs, one record per vessel and not one
        //  per step.
        bool        accumulate = false;
    };
    virtual std::vector<DatumAmendment> takeDatumAmendments() { return {}; }

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
