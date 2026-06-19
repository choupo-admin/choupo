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
    Choupo::Flowsheet

Description
    A linear, sequential-modular flowsheet: streams travel from one
    unit operation to the next, no recycle loops, no tear streams.
    Recycle support and Wegstein over tear streams arrive.

Dictionary form:

        simulationType  flowsheet;

        flowsheet
        {
            streams                       // initial (feed) streams
            {
                feed
                {
                    F    1.0;
                    T    350.0;
                    P    1.01325;
                    composition  { ethanol 1.0;  water 0.0; }
                }
            }

            units                         // ordered list -- one block per UO
            (
                {
                    name      reactor;
                    type      cstr;
                    in        feed;            // stream name (must exist)
                    outputs   (reactorOut );  // names to bind producedStreams()

                    operation { V_R 0.005; }
                    reaction  {... }
                }
                {
                    name      separator;
                    type      isothermalFlash;
                    in        reactorOut;
                    outputs   (liquidProduct  vaporProduct );
                                                // order matches IsothermalFlash:
                                                //   produced[0] = liquid
                                                //   produced[1] = vapor
                    operation { T 370; P 1.0; }
                }
            );
        }

    The Flowsheet:
      1. seeds its stream registry from the `streams {... }` block;
      2. iterates through `units (...)` in order;
      3. for each unit, builds an *augmented* dict that grafts the
         input stream's F/T/P into a synthetic `feed` sub-dict and the
         z-vector into a synthetic `composition` sub-dict, then calls
         `unit->solve(...)`;
      4. takes `unit->producedStreams()` and binds them, by index, to
         the `outputs (... )` names, registering them in the registry
         for subsequent units to consume.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/SimulationResult.H"
#include "streams/ProcessStream.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/UnitOperation.H"

#include <map>
#include <string>

namespace Choupo {

class Flowsheet : public UnitOperation
{
public:
    Flowsheet() = default;

    const std::string& type() const override { return type_; }

    // External configuration (defaults that the user can override per-unit).
    void setSolverDict   (DictPtr d) { solverDict_    = std::move(d); }
    void setReactionsDict(DictPtr d) { reactionsDict_ = std::move(d); }
    void setDryingKineticsDict(DictPtr d) { dryingKineticsDict_ = std::move(d); }
    void setCrystallisationDict(DictPtr d) { crystallisationDict_ = std::move(d); }

    // Per-unit thermo override.  A unit may carry a `thermo {... }`
    // block selecting different models (e.g. SRK for a high-P compressor,
    // NRTL for a non-ideal-liquid column).  These give the Flowsheet what it
    // needs to rebuild a ThermoPackage = global COMPONENTS + the unit's
    // override MODELS.  Without them every unit uses the global thermo.
    void setDatabase  (const Database* db) { db_ = db; }
    void setThermoDict(DictPtr d)          { thermoDict_ = std::move(d); }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    // Accessors used by the outer-driver / post-processor layers to
    // harvest the simulation result without re-parsing the log.
    const std::map<std::string, ProcessStream>& streams() const
    { return streams_; }

    // Model-boundary audit findings from the last solve() (empty unless
    // adjacent units use different thermo models).  Surfaced in the result JSON.
    const std::vector<ModelBoundaryFinding>& modelBoundaries() const
    { return modelBoundaries_; }

    // KPIs collected from every unit op during the last solve(),
    // indexed by user-given unit name.
    const std::map<std::string, std::map<std::string, scalar>>& unitKpis() const
    { return unitKpis_; }

    // Per-iteration residual history for each unit op (empty for units
    // with no iterative solver).  Used by the GUI's convergence plot.
    const std::map<std::string, std::vector<scalar>>& unitResiduals() const
    { return unitResiduals_; }

    // 1-D internal profile (axial sweep / stage table) for units that
    // expose one.  Used by the GUI's profile plot.
    const std::map<std::string, UnitProfile>& unitProfiles() const
    { return unitProfiles_; }

    // Flattened unit interface (name / type / resolved in / out stream
    // names) from the last solve(), in execution order.  Lets the per-unit
    // reports iterate the real equipment even for a composite plant (the
    // flowsheetDict at the top would only expose the boundary).
    const std::vector<FlatUnit>& topology() const { return topology_; }

    // Energy wires resolved during the last solve().  See
    // EnergyWire in SimulationResult.H.  The value reflects the FINAL
    // converged pass (after the recycle loop, where applicable).
    const std::vector<EnergyWire>& energyWires() const { return energyWires_; }

private:
    inline static const std::string type_ = "flowsheet";

    // Returns the ThermoPackage a unit should use: its `thermo {}` override
    // (built once from global components + override models, then cached) or
    // the global one when the unit has no override.
    const ThermoPackage& thermoFor(const std::string& uname,
                                   const DictPtr&       udict,
                                   const ThermoPackage& global);

    std::map<std::string, ProcessStream>                   streams_;
    std::vector<ModelBoundaryFinding>                      modelBoundaries_;
    std::vector<FlatUnit>                                  topology_;
    std::vector<EnergyWire>                                energyWires_;
    std::map<std::string, std::map<std::string, scalar>>   unitKpis_;
    std::map<std::string, std::vector<scalar>>             unitResiduals_;
    std::map<std::string, UnitProfile>                     unitProfiles_;
    DictPtr solverDict_;
    DictPtr reactionsDict_;
    DictPtr dryingKineticsDict_;   // constant/dryingKinetics (drying-curve library)
    DictPtr crystallisationDict_;  // constant/crystallisation (crystal-kinetics library)

    // Per-unit thermo overrides.
    const Database*                                        db_ = nullptr;
    DictPtr                                                thermoDict_;
    std::map<std::string, std::unique_ptr<ThermoPackage>>  unitThermo_;
};

} // namespace Choupo
