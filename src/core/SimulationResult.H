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
#include <set>
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

// One row of the discounted-cash-flow (DCF) appraisal table -- the classic
// year-by-year income / cash-flow statement (Perry / Turton §10).  Year 0 is
// construction (the investment outflow); years 1..N are operating years.  All
// monetary fields in the report currency (EUR); discount factor dimensionless,
// discounted cash flow in EUR.  Published by EconomicsPass so the GUI / an
// outer driver can read the FULL table, not just the headline scalars.
struct CashFlowYear
{
    int    year             = 0;    // t = 0..N
    scalar investment       = 0.0;  // FCI + WC outflow (year 0 only), <0
    scalar revenue          = 0.0;  // R_t
    scalar operatingCost    = 0.0;  // COM_d_t (depreciation NOT included)
    scalar depreciation     = 0.0;  // d_t (straight line)
    scalar taxableIncome    = 0.0;  // R - COM_d - d
    scalar tax              = 0.0;  // tau * taxableIncome
    scalar afterTaxProfit   = 0.0;  // (R - COM_d - d)(1-tau)
    scalar cashFlow         = 0.0;  // CF_t (after-tax profit + d, + WC/salvage at N)
    scalar discountFactor   = 0.0;  // 1/(1+i)^t
    scalar discountedCF     = 0.0;  // CF_t * discountFactor
    scalar cumulativeDCF    = 0.0;  // running sum of discountedCF
};

// Headline economic appraisal scalars + the year-by-year DCF table.  Populated
// by EconomicsPass; mirrors result.kpis["economics"] but typed and complete
// (the table the .ods / .csv DCF spreadsheet is built from).
struct EconomicsSummary
{
    bool                      present       = false;
    scalar                    FCI           = 0.0;   // fixed capital investment
    scalar                    WC            = 0.0;   // working capital
    scalar                    TCI           = 0.0;   // total capital investment
    scalar                    COM_d         = 0.0;   // cost of manufacture (no depr.)
    scalar                    revenue       = 0.0;   // R (annual)
    scalar                    depreciation  = 0.0;   // d_annual (straight line)
    scalar                    NPV           = 0.0;
    scalar                    IRR           = 0.0;   // fraction (NaN if none)
    bool                      haveIRR       = false;
    bool                      irrAmbiguous  = false;
    scalar                    discPayback   = 0.0;   // yr (NaN if never)
    scalar                    simplePayback = 0.0;   // yr (NaN if never)
    scalar                    discountRate  = 0.0;
    scalar                    taxRate       = 0.0;
    int                       projectLife   = 0;
    int                       estimateClass = 4;
    scalar                    accLo         = -30.0; // AACE band low  (%)
    scalar                    accHi         = +50.0; // AACE band high (%)
    std::string               currency      = "EUR";
    std::vector<CashFlowYear> cashFlow;              // rows t = 0..N
};

struct SimulationResult
{
    std::map<std::string, ProcessStream>                          streams;
    // Plant-boundary OUTLET aliases: a sector output (BRINE.halite) is COPIED
    // onto the domain boundary name (halite) for reporting/GUI, so `streams`
    // holds both.  The stream-state writer skips these -- the state model stores
    // each stream ONCE, owned by its producing sector (arch doc 8.4).
    std::set<std::string>                                         boundaryAliases;
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
    // Batch SEQUENCE timeline (choupoBatch): every recipe action that FIRED
    // (with its trigger -- a time or the `when` condition that tripped) plus
    // unit-reported status events (a rectifier hitting refluxMax).  The
    // machine-readable feed of the recipe sequence/Gantt view; empty for
    // steady runs and recipe-less batch runs.
    struct TimelineEvent
    {
        scalar      t = 0.0;
        std::string kind;      // "recipe" | "status"
        std::string action;    // transfer | setParameter | <status name>
        std::string detail;    // human-readable, pre-formatted
        std::string trigger;   // "time" | "when: <unit.q op v>" | "" (status)
        std::string from;      // acting unit (transfer source; setParameter/
                               //   status unit) -- the Gantt lane
        std::string to;        // transfer destination; empty otherwise
    };
    std::vector<TimelineEvent>                                     timeline;

    // The MATERIAL LEDGER (forum #88): one structured record per material
    // edge of the campaign -- a discrete recipe `transfer` or one step of a
    // continuous `dischargeTo` -- with the per-component amount moved.  The
    // timeline and the Gantt are PROJECTIONS of this; balances read THIS,
    // never reconstructed from strings.
    //  kind is a STABLE ENUM STRING: "discrete" | "continuous" | "external".
    //  tStart/tEnd bound the interval material actually moved (equal for a
    //  discrete event).  The thermodynamic history is preserved EXACTLY where
    //  it matters for energy: H_kJ integrates each package's enthalpy AT ITS
    //  OWN instant and temperature (Sum over packages of n_pkg*h(T_pkg)) --
    //  a single end-temperature stamped on an accumulated dn destroys the
    //  transported enthalpy (forum #99-P0).  When any package's enthalpy is
    //  unavailable, H_valid goes false and H_missing names the species: the
    //  record never carries a decorative number.
    struct TransferRecord
    {
        scalar      tStart = 0.0, tEnd = 0.0;   // s
        std::string from, to;                    // vessels; to may be an
                                                 // "(unrouted outlet)" role
        std::string kind;                        // discrete|continuous|external
        std::map<std::string, scalar> dn;        // kmol moved, per component
        scalar      H_kJ    = 0.0;               // integrated transported enthalpy
        bool        H_valid = false;
        std::vector<std::string> H_missing;      // species lacking h(T) data
    };
    std::vector<TransferRecord>                                    transfers;

    // The ENERGY LEDGER (forum #98.3/#99/#101): one structured record per
    // SEGMENT of constant physics on one vessel -- a recipe setParameter
    // closes the running segment and opens a new one, so a record's E_kJ is
    // always the EXACT integral over an interval the stated basis actually
    // covers (#99-1: no representative rate ever substitutes the history --
    // a mean rate is E/(tEnd-tStart), derivable, never stored).  kind is the
    // full canon reserved up front (#99-2) so the campaign balance reads
    // canonical records, never side calculations:
    //     reaction | sensible | latent | mixing | impulse
    //   | externalH | shaftWork | heatLoss
    // Validity carries the SAME monotonic discipline as the material ledger:
    // an unpriceable contribution poisons the segment forever, E_missing
    // names why, and a partial integral is never emitted.  `basis` is the
    // glass-box statement of the physics used (e.g. "isothermal closed
    // vessel at constant P: Q = dH = sum dn_i*h_i(T), elements datum").
    struct EnergyRecord
    {
        scalar      tStart = 0.0, tEnd = 0.0;   // s
        std::string unit;                        // the vessel
        std::string kind;                        // stable enum string (above)
        scalar      E_kJ    = 0.0;               // exact integral, sign: heat
                                                 //   ADDED to the vessel > 0
        bool        E_valid = false;
        std::vector<std::string> E_missing;      // named reasons / species
        std::string basis;                       // physics statement
        // The process temperature a UTILITY must beat to serve this duty
        // -- the segment's WORST-case end (max T for heating, min T for
        // cooling), so the tier pick is always feasible over the whole
        // record.  -1 = unknown (the utility pass skips it, NAMED).
        scalar      T_service_K = -1.0;
    };
    std::vector<EnergyRecord>                                      energyLedger;

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
    // Economic appraisal: the headline scalars + the full year-by-year DCF
    // table, populated by EconomicsPass.  `present` is false until the pass
    // runs.  The .ods / .csv cash-flow spreadsheet is built from this.
    EconomicsSummary                                              economics;
    bool                                                           converged = true;
};

} // namespace Choupo
