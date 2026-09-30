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
    Choupo::QuasiSteadyUnit

Description
    A STEADY unit operation inside a TRANSIENT flowsheet -- the quasi-steady
    seam (task #185; Vitor's ruling 2026-09-30: a GENERIC adapter).

    A feed & bleed around a membrane module or an electrodialysis stack is a
    transient: the loop concentration climbs from the feed's towards its
    steady value over the loop's residence time.  The module itself holds
    almost no liquid, so on that time scale it is AT STEADY STATE at every
    instant -- the quasi-steady assumption.  This adapter states it and does
    nothing more: at each accepted instant of the dynamic driver it hands the
    wrapped steady unit its inlets exactly as choupoSolve would
    (flowsheet/UnitInputs.H, the one home of that injection), calls the
    unit's own solve(), and publishes the unit's own produced streams.  No
    physics is duplicated; any registered steady type can be wrapped.

        {
            name     NF;
            type     quasiSteady;
            inputs   ( toModule );            // topology on the adapter
            outputs  ( retentate permeate );
            unit
            {
                type  spiralWoundModule;      // the steady unit, as it would
                ...                           // be declared in choupoSolve,
            }                                 // WITHOUT in/inputs/outputs
        }

    What the assumption COSTS, said on the run: the unit holds NO inventory,
    so nothing accumulates in it -- the accumulation is the vessel's.  A loop
    made ONLY of such units has no time constant at all; the driver refuses
    it by name (an algebraic loop needs the steady recycle solver).

    Declared, not modelled: the unit's energy.  Its steady solve prices it,
    but the dynamic ledger's first-law rung needs a stored functional and a
    face enthalpy per port, which this adapter does not claim; the rung is
    withheld with that reason rather than closed with a zero.
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/dynamic/DynamicUnitOperation.H"
#include "unitOperations/UnitOperation.H"

#include <map>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

class QuasiSteadyUnit : public DynamicUnitOperation
{
public:
    const std::string& type() const override
    { static const std::string t = "quasiSteady"; return t; }

    void initialise(const DictPtr&        unitDict,
                    const ThermoPackage&  thermo,
                    const DictPtr&        reactionsDict) override;

    //- Nothing to integrate: the unit is algebraic in time.  Re-solved on
    //  the inlets it holds, so a driver that only calls step() still sees
    //  outlets consistent with them.
    void step(scalar /*t*/, scalar /*dt*/) override { refresh(); }

    bool hasInventory() const override { return false; }
    std::vector<std::string> inletPorts() const override { return inletNames_; }
    std::size_t nOutlets() const override { return outletNames_.size(); }
    ContinuousStream outletStreamAt(std::size_t k) const override;
    ContinuousStream outletStream() const override { return outletStreamAt(0); }
    void setInletStreamAt(std::size_t port, const ContinuousStream& s) override;
    ContinuousStream inletStreamAt(std::size_t port) const override
    {
        if (port >= inlets_.size())
            throw std::runtime_error("quasiSteady '" + name_ + "': inlet port "
                + std::to_string(port) + " does not exist");
        return inlets_[port];
    }
    bool acceptsRoutedInlet() const override { return true; }
    void setInletStream(const ContinuousStream& s) override { setInletStreamAt(0, s); }
    void refresh() override;

    BalanceSnapshot balanceSnapshot() const override;

    //- The outlet flows and the wrapped unit's own KPIs, so the trajectory
    //  shows the module's flux and rejection moving with the loop.
    sVector stateVector() const override;
    std::vector<std::string> stateLabels() const override;

    scalar getCV(const std::string& key) const override;
    std::vector<std::string> availableCVs() const override;

private:
    ProcessStream toProcess(const ContinuousStream& c, const std::string& nm) const;

    const ThermoPackage*           thermo_ = nullptr;
    DictPtr                        spec_;        // the steady unit's declaration
    DictPtr                        reactions_;
    std::string                    innerType_;
    std::unique_ptr<UnitOperation> steady_;
    std::vector<std::string>       inletNames_, outletNames_;
    std::vector<ContinuousStream>  inlets_;
    std::vector<ContinuousStream>  outlets_;
    std::vector<std::string>       kpiKeys_;     // fixed at the first solve
    std::map<std::string, scalar>  kpis_;
    long                           nSolves_ = 0;
};

} // namespace Choupo
