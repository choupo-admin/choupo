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
    Choupo::DynamicUnitOperation

Description
    Abstract base for a unit in a *dynamic continuous* simulation.
    Conceptually distinct from BatchUnitOperation:

      * Continuous flow: inlet stream + outlet stream, both time-varying.
      * Internal state evolves in time per dY/dt = f(Y, u, t).
      * Manipulated Variables (MVs) — knobs controllers can write to.
      * Controlled Variables (CVs) — measurements controllers can read.

    The MV/CV string-keyed registry lets a Controller object bind to a
    unit by name and operate on a named knob/measurement, without the
    controller needing to know the concrete unit type.  Each concrete
    DynamicUnitOperation registers which MVs it accepts and which CVs
    it exposes.

    Time stepping: `step(t, dt)` advances the unit's state by dt.  The
    base does not prescribe the integrator --- concrete units use RK4
    (consistent with BatchReactor / BatchStill).

    Explicit factory pattern, same as the other base classes.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "unitOperations/dynamic/BalanceSnapshot.H"
#include "core/Types.H"
#include "thermo/ThermoPackage.H"

#include <functional>
#include <map>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

// -------------------------------------------------------------------------
//  Lightweight stream snapshot.  Carries the instantaneous values of a
//  continuous flow at time t.  Composition is in mole fractions (sum to 1).
// -------------------------------------------------------------------------
struct ContinuousStream
{
    scalar              F = 0;       // molar flow [kmol/s]
    scalar              T = 0;       // temperature [K]
    scalar              P = 0;       // pressure [bar]
    sVector             z;           // mole fractions

    scalar component(std::size_t i) const { return i < z.size() ? z[i] : 0.0; }
};

// -------------------------------------------------------------------------
//  DynamicUnitOperation abstract base.
// -------------------------------------------------------------------------
class DynamicUnitOperation
{
public:
    virtual ~DynamicUnitOperation() = default;

    virtual const std::string& type() const = 0;
    virtual const std::string& name() const { return name_; }

    // ---- Initialisation -----------------------------------------------
    virtual void initialise(const DictPtr&        unitDict,
                            const ThermoPackage&  thermo,
                            const DictPtr&        reactionsDict) = 0;

    // ---- Time stepping ------------------------------------------------
    virtual void step(scalar t, scalar dt) = 0;

    // ---- Optional packed-ODE form (the adaptive-stepping interface) -----
    //   A unit whose plant dynamics are a clean ODE dY/dt = f(Y) (with the
    //   manipulated variables HELD constant across the step) exposes it here so
    //   choupoCtrl's adaptive driver can sub-step the SAME state with the stiff
    //   Rosenbrock23 integrator BETWEEN controller samples (the MV frozen).
    //   Default `hasOdeForm()==false` => the unit keeps its own fixed step().
    virtual bool    hasOdeForm() const           { return false; }
    virtual sVector odeState()   const           { return {}; }     // pack Y
    virtual void    setOdeState(const sVector& /*y*/) {}            // unpack+commit
    virtual sVector odeDerivative(const sVector& /*y*/) const { return {}; }
    // Number of leading rows of Y that must stay >= 0 (species moles; T free).
    virtual std::size_t odeNPositive() const     { return 0; }

    // ---- Balance contract (read-only) ---------------------------------
    //  The instantaneous BalanceSnapshot the choupoCtrl ledger integrates.
    //  The DEFAULT refuses (claims nothing, names why) -- a unit only
    //  carries a balance claim by implementing this deliberately.
    virtual BalanceSnapshot balanceSnapshot() const { return {}; }

    // ---- Inspection ---------------------------------------------------
    //   Mole-number-like state.  Exposing it as a sVector keeps the
    //   trajectory CSV writer in main.cpp generic --- each unit decides
    //   what to put here (DynamicCSTR puts (n_0,..., n_{N-1}, T)).
    virtual sVector stateVector() const = 0;
    virtual std::vector<std::string> stateLabels() const = 0;

    // Outlet stream.  Sampled at the unit's current internal state.
    virtual ContinuousStream outletStream() const = 0;

    // Inlet (feed) face.  Symmetric to outletStream() --- the instantaneous
    // FEED flux entering the unit at the current MV state (F_in, T_in, P, z_in
    // for a continuous unit).  Default: the unit has NO inlet face (a closed
    // batch vessel, or a unit that does not model a feed), so the writer skips
    // it.  ZERO new physics --- a read-only projection of the inlet the unit
    // already holds.  `hasInlet` lets a unit opt in without forcing one.
    virtual bool             hasInlet() const { return false; }
    virtual ContinuousStream inletStream() const { return {}; }

    //  ---- Routed inlet (tanks-in-series, ruled 2026-08-24) --------------
    //  The ctrl driver may ROUTE one unit's outlet onto another's inlet
    //  face at each accepted driver step: one-step-EXPLICIT forward
    //  routing, so the downstream unit integrates [t, t+dt] on the
    //  upstream outlet AT t -- a transport delay of one driver step,
    //  announced once by the driver.  A unit that models a feed face opts
    //  in by overriding both members; the default refuses BY NAME so a
    //  connection into a unit with no routable inlet is a load-time
    //  error, never a silent no-op.
    virtual bool acceptsRoutedInlet() const { return false; }
    virtual void setInletStream(const ContinuousStream& /*s*/)
    {
        throw std::runtime_error("DynamicUnitOperation: unit '" + name_
            + "' (" + type() + ") has no routable inlet face");
    }

    //  ---- Ports and inventory (the quasi-steady seam, 2026-09-30) ------
    //  A unit that HOLDS an inventory (a vessel) is integrated in time; a
    //  unit that holds none (a steady unit wrapped by `quasiSteady`) is
    //  ALGEBRAIC in time: its outlets are a function of its inlets at the
    //  same instant, so the driver re-solves it on each accepted state
    //  instead of stepping it.  Defaults describe every vessel written
    //  before the seam: inventory, one inlet face, one outlet.
    virtual bool hasInventory() const { return true; }
    //- The declared inlet names in port order; EMPTY means the single
    //  legacy feed face (`in <stream>;`), set through setInletStream().
    virtual std::vector<std::string> inletPorts() const { return {}; }
    virtual std::size_t nOutlets() const { return 1; }
    virtual ContinuousStream outletStreamAt(std::size_t k) const
    {
        if (k != 0)
            throw std::runtime_error("DynamicUnitOperation: unit '" + name_
                + "' (" + type() + ") has one outlet; port "
                + std::to_string(k) + " does not exist");
        return outletStream();
    }
    virtual void setInletStreamAt(std::size_t port, const ContinuousStream& s)
    {
        if (port != 0)
            throw std::runtime_error("DynamicUnitOperation: unit '" + name_
                + "' (" + type() + ") has one inlet face; port "
                + std::to_string(port) + " does not exist");
        setInletStream(s);
    }
    //- Re-solve an ALGEBRAIC unit on the inlets it now holds.  A vessel
    //  has nothing to do here: its state moves only by step().
    virtual void refresh() {}

    //- The inlet the unit HOLDS at `port` -- the value it integrates (or is
    //  re-solved) on, which is what a time directory must carry for the
    //  stream that feeds that port if the directory is to be restartable
    //  (task #186).  Default: port 0 is the one feed face.
    virtual ContinuousStream inletStreamAt(std::size_t port) const
    {
        if (port != 0)
            throw std::runtime_error("DynamicUnitOperation: unit '" + name_
                + "' (" + type() + ") has one inlet face; port "
                + std::to_string(port) + " does not exist");
        return inletStream();
    }

    //  ---- The holdup record (task #186, 2026-09-30) ---------------------
    //  What `<t>/internalStates/<unit>` carries, and what `0/` declares:
    //  T [K], P [Pa], V [m^3] (0 = not tracked) and the per-component
    //  inventory n [kmol], index-aligned with the thermo package.
    //  `notRestored` is EMPTY only when that record IS the unit's whole
    //  integrated state -- the claim that makes a time directory a restart
    //  point -- and otherwise names what the record does not carry, so the
    //  reader can refuse a restart that would re-invent it.
    struct HoldupRecord
    {
        scalar      T = 0, P = 0, V = 0;
        sVector     n;
        std::string notRestored;
    };
    //- Fill `h` and return true for a unit that holds an inventory.  The
    //  DEFAULT reads the labelled state vector (T, n_<comp>) and declares
    //  NOTHING complete: a unit type makes the completeness claim itself,
    //  by overriding, or it is not made.
    virtual bool holdupRecord(HoldupRecord& h) const;

    //- Asked of the CLASS (the interiorKindsRead precedent): the driver
    //  needs the answer while it is still reading dicts, before any unit
    //  is constructed.
    static bool carriesInventory(const std::string& type);

    // ---- Manipulated / Controlled Variables (the controller API) -----
    //   MV: a controller writes a numeric value into a named knob.
    //   CV: a controller reads a numeric value from a named measurement.
    //   Default behaviour is to throw on unknown keys.  Concrete units
    //   override for the keys they expose.
    virtual void   setMV(const std::string& key, scalar value);
    virtual scalar getCV(const std::string& key) const;

    virtual std::vector<std::string> availableMVs() const { return {}; }
    virtual std::vector<std::string> availableCVs() const { return {}; }

    // ---- Factory (explicit registry) ----
    using Factory = std::function<std::unique_ptr<DynamicUnitOperation>()>;

    static void                                registerType(const std::string& name, Factory f);
    static std::unique_ptr<DynamicUnitOperation> New(const std::string& type);
    static void                                registerBuiltins();
    static std::vector<std::string>            availableTypes();

    void setName(const std::string& nm) { name_ = nm; }

protected:
    std::string name_;

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
