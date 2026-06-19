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
Struct
    Choupo::SimulationResult

Description
    Output of one simulator pass.  Used by:
      * the OuterDriver layer    — extracts responses from `kpis` for the
                                    next design point;
      * the PostProcessor layer  — sizing and costing read both streams
                                    and kpis (e.g. V_R from a CSTR, Q
                                    from a Heater).

    streams:  full stream registry from the flowsheet
    kpis   :  per-unit key-value pairs declared by each unit op's
                kpis() override (e.g. CSTR exposes V_R, T, X_limiting;
                a column exposes nStages, R, D, T_top, T_bot, etc.).
    converged:  true if every layer of the simulator converged.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Advisory.H"
#include "core/ThermoResolution.H"
#include "core/Types.H"
#include "streams/ProcessStream.H"
#include "thermo/SaturationCurves.H"
#include "unitOperations/UnitOperation.H"

#include <map>
#include <optional>
#include <string>
#include <vector>

namespace Choupo {

// Geometric / mechanical sizing of a single piece of equipment, as
// produced by the SizingPass (vessel diameter, height, wall thickness,
// heat exchanger area, etc.).  Named `EquipmentSizing` rather than
// `Dimensions` because the latter is a physical-dimensions tag in
// Choupo (mass / length / time / temperature / amount exponents).
struct EquipmentSizing
{
    std::string                                  unitName;
    std::string                                  equipmentType;
    std::string                                  material;
    std::map<std::string, scalar>                values;   // "D", "H", "A", "t_wall", "weight",...
};

// One unit's interface after the flowsheet is FLATTENED (fractal):
// name + equipment type + the resolved (namespaced) inlet / outlet stream
// names.  Populated by Flowsheet::solve from the post-flatten unit list, so
// the per-unit reports (mass/energy balance, the per-equipment balance
// sheet) see the real equipment even when the case is a COMPOSITE plant ---
// where the flowsheetDict alone only exposes the system boundary.
struct FlatUnit
{
    std::string              name;
    std::string              type;
    std::vector<std::string> ins;
    std::vector<std::string> outs;
};

// Energy wire.  A direct scalar coupling from one unit's
// `energyOutputs` declaration to another's `energyInputs`: shaft power
// from a turbine to a compressor, heat from a furnace to a heater, etc.
// Just-wiring (Option C of the energy-streams design discussion): no new
// stream type, no new solver, no polymorphism on ProcessStream.  Before
// the consumer's solve(), Flowsheet evaluates the producer's `expression`
// against the producer's operation + KPIs and writes the resulting scalar
// into the consumer's operation block at the `target` key.  The kind
// (work / heat) is validated to match on both ends.
struct EnergyWire
{
    std::string fromUnit;     // producer unit name
    std::string fromPort;     // matches a producer's energyOutputs.name
    std::string toUnit;       // consumer unit name
    std::string toTarget;     // operation-block key receiving the value
    std::string kind;         // "work" or "heat"
    scalar      value = 0.0;  // resolved scalar [W] (canonical SI)
};

struct CostBreakdown
{
    std::string                                  unitName;
    scalar                                       purchasedCost   = 0.0;  // C_p   [€]
    scalar                                       bareModuleCost  = 0.0;  // C_BM  [€]
    scalar                                       totalModuleCost = 0.0;  // C_TM  [€]
    std::map<std::string, scalar>                factors;                 // F_M, F_P,...
    std::string                                  currency = "EUR_2026";
};

// One row of the utility-allocation summary: a unit's heat duty (or a
// column reboiler / condenser port) sized to a plant utility by temperature
// level, OR flagged carried (a physical utility stream / a heat-link).
// Computed once by allocateUtilities() and surfaced BOTH in the
// utilityAllocation report AND the result JSON, so the GUI can show "which
// utility, how much, how much €" right next to the duty.
struct UtilityAllocation
{
    std::string unit;
    std::string port;        // "reboiler" / "condenser" / "" (generic duty)
    std::string tier;        // "heating" / "cooling"
    std::string utility;     // catalogue name, or "(carried: ...)" / "(none adequate)"
    scalar      duty_kW = 0.0;
    scalar      T       = 0.0;   // process temperature [K] (-1 if unknown)
    scalar      kg_s    = 0.0;
    scalar      MW      = 0.0;
    scalar      eur_h   = 0.0;
    bool        allocated = false;
};

// Per-component thermo COVERAGE: which capabilities the loaded component data
// actually provides, so the GUI can show whether each component is
// flowsheet-ready or a gap (e.g. a Joback estimate with no Antoine cannot do
// VLE).  `nonvolatile` solutes legitimately have no Psat (treated as K=0).
struct ComponentCoverage
{
    std::string name;
    bool criticals   = false;   // Tc, Pc (EoS / corresponding states)
    bool psat        = false;   // vapour pressure (Antoine) -> VLE / flash
    bool vliq        = false;   // liquid molar volume -> pump / density
    bool cpIdealGas  = false;   // ideal-gas Cp -> energy balances
    bool gibbs       = false;   // formation data -> Gibbs reactor
    bool nonvolatile = false;   // a dissolved solute (no Psat by design)
};

// Model-boundary audit finding: one internal stream whose producer and
// consumer use different thermo models.  `H` is the conserved truth, `T` the
// model-dependent readout; this carries the enthalpy the two models disagree
// about at the stream's (T,P,z), so the GUI can show it next to the boundary.
// `refused` = a speciation change (electrolyte <-> molecular) where a single
// dH would lie (no common composition basis), so no number is computed.
struct ModelBoundaryFinding
{
    std::string stream;
    std::string producer;
    std::string consumer;
    scalar      dH_kJ_per_mol = 0.0;
    scalar      dH_kW         = 0.0;
    scalar      implied_dT_K  = 0.0;
    bool        refused       = false;
    std::string reason;          // populated when refused
};

struct SimulationResult
{
    std::map<std::string, ProcessStream>                          streams;
    std::map<std::string, std::map<std::string, scalar>>           kpis;
    std::vector<FlatUnit>                                          topology;
    std::map<std::string, std::vector<scalar>>                     convergence;
    std::map<std::string, UnitProfile>                             profiles;
    std::map<std::string, EquipmentSizing>                         sizings;
    std::map<std::string, CostBreakdown>                           costs;
    std::vector<std::string>                                       componentNames;
    // Per-component molar mass in kg/kmol; populated by the
    // application main() from the thermo package before result
    // emission so the JSON layer can derive mass flows (F_mass =
    // F * Sigma z_i * MW_i) without dragging the whole ThermoPackage
    // through the emitter signature.  Empty when not populated; the
    // emitter then skips the F_mass field.
    std::map<std::string, scalar>                                  componentMolarMass;
    std::optional<BinaryTxy>                                       txy;
    // Utility consumption summary.  Aggregated across the
    // flowsheet by ProcessStream::category.  Key is the user-defined
    // category (e.g. "LP_steam_170kPa", "coolingWater_298K");
    // value is the total mass flow [kg/s SI] of every stream sharing
    // that category.  Streams with empty category are process streams
    // and do NOT appear here.
    std::map<std::string, scalar>                                  utilities;

    // Computed variables.  Post-processing expressions declared as
    // `variables { Q_total { compute "evap1.Q + evap2.Q"; unit kW; } }` in
    // the flowsheetDict, evaluated by ComputedReport against the KPIs and
    // streams above after the solve.  Stored in canonical SI; the declared
    // `unit` is for display only.
    std::map<std::string, scalar>                                  computed;

    // Energy wires.  One entry per direct scalar coupling
    // between unit ops (turbine shaft -> compressor, heater Q from
    // furnace,...).  See struct EnergyWire above.
    std::vector<EnergyWire>                                        energyWires;
    // Utility allocation: per-duty sizing of plant utilities by temperature
    // level (steam grade / cooling water / ...), incl. carried duties.
    // Populated before the result is emitted so the GUI sees it.
    std::vector<UtilityAllocation>                                 utilityAllocation;
    // Solver "speak-up" advisories (bound active at the solution, rating
    // exceeded, auto-init) -- the same events printed to the log, carried here
    // so the GUI surfaces them.  Drained from AdvisoryLog after each pass.
    std::vector<Advisory>                                          advisories;
    // Binary-pair resolution provenance: where each activity-model pair came
    // from (inline / per-node file / plant-root / standard library / ideal-
    // default) + the file's own provenance.source.  Feeds the GUI foundation
    // navigator + pair-coverage matrix.  Drained from ThermoResolutionLog.
    std::vector<PairResolution>                                    thermoResolution;
    std::vector<ComponentCoverage>                                 componentCoverage;
    // Model-boundary audit: where adjacent units use different thermo models,
    // the enthalpy they disagree about (or a refusal across a speciation
    // change).  Populated by the Flowsheet; surfaced in the run log AND here.
    std::vector<ModelBoundaryFinding>                             modelBoundaries;
    bool                                                           converged = true;
};

} // namespace Choupo
