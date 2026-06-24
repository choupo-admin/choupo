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
#include "core/Types.H"
#include "thermo/ThermoPackage.H"

#include <functional>
#include <map>
#include <memory>
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
