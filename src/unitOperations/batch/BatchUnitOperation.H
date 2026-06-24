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

    // ---------------------------------------------------------------------
    //  Recipe hooks.  Default behaviour is sensible enough that
    //  most concrete vessels do not need to override --- BatchReactor and
    //  BatchStill rely on the defaults for chargeFrom / dischargeAll.
    // ---------------------------------------------------------------------

    // Add the contents of `src` to this vessel.  Mole numbers are summed
    // component-by-component.  Temperature is set to a molar-weighted
    // mix of (current T, source T) so transferring into an empty vessel
    // inherits the source's T, and transferring into a non-empty vessel
    // gives an enthalpy-like average.  This is an approximation
    // (assumes equal Cp per species, no heat of mixing); refining it
    // requires hooking into the thermo package the same way the
    // adiabatic flash does.  Pressure and Volume are taken from the
    // source if the receiver was empty; otherwise unchanged.
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

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
