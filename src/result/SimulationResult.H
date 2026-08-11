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
#include "core/ProblemDivergence.H"
#include "core/FlatUnit.H"          // topology, not output -- see that header
#include "core/ResultRecords.H"      // the eight plain records this struct
                                    //   carries.  They are in `core` because
                                    //   the ENGINE produces them and the
                                    //   RESULT carries them -- filed only
                                    //   here, nothing below band 2 could name
                                    //   a diagnostic it computes itself (D7).
#include "core/ThermoResolution.H"
#include "core/Types.H"
#include "streams/ProcessStream.H"
#include "thermo/SaturationCurves.H"
#include "result/UnitProfile.H"      // profiles only -- never the unit-op
                                    //   hierarchy (build hygiene).  Moved out
                                    //   of `unitOperations/` with this header:
                                    //   a profile is something the pipeline
                                    //   PRODUCED, and leaving it there made
                                    //   `result` and `unitOperations` include
                                    //   each other (debt D2).

#include <map>
#include <set>
#include <optional>
#include <string>
#include <vector>

namespace Choupo {


//  `FlatUnit` used to be declared HERE, and that is what made `core` reach up
//  into `streams`, `thermo` and `unitOperations`.  It is topology, it reads
//  nothing, and it now lives in `core/FlatUnit.H` -- which this header
//  includes, so `result.topology` below is unchanged for every reader.








struct SimulationResult
{
    std::map<std::string, ProcessStream>                          streams;
    // Plant-boundary OUTLET aliases: a sector output (BRINE.halite) is COPIED
    // onto the domain boundary name (halite) for reporting/GUI, so `streams`
    // holds both.  The stream-state writer skips these -- the state model stores
    // each stream ONCE, owned by its producing sector (arch doc 8.4).
    std::set<std::string>                                         boundaryAliases;
    // alias/label -> the stream identity it copies (one physical stream,
    // two names; reports count the identity once, under the alias name)
    std::map<std::string,std::string>                              boundaryAliasOf;
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
        scalar      tEnd = -1.0;  // > t: a CONTINUOUS action's interval end
                                  //   (dischargeTo / externalOutlet); < 0
                                  //   for instantaneous events.  Last field
                                  //   so existing brace-inits stay valid.
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
                                                 // "(external boundary)" role
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
    //  PROBLEM DIVERGENCE -- a DIFFERENT channel from the advisories above,
    //  deliberately.  An advisory qualifies the answer ("extrapolated 3 K");
    //  a divergence says the answer is to a different question (a declared
    //  NRTL pair that ran ideal, a rigorous column replaced by a shortcut).
    //  Merging them would bury the one line that changes what the number
    //  means among nine that do not.  Drained from ProblemDivergence after
    //  each pass, exactly as the advisories are.
    std::vector<Divergence>                                        divergences;
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
    // Per-unit ENERGY CLOSURE with the model-boundary step accounted
    // separately: the raw imbalance, the declared step, and what remains.
    // Populated by the energyBalance report (which computes the step from
    // the unit's DECLARED thermo world, assembled by the report itself --
    // see reporting/ModelBoundaryLedger.H on why that duplication is
    // deliberate).  Emitted as `energyClosures` in the result JSON.
    std::vector<EnergyClosureRecord>                              energyClosures;
    // Economic appraisal: the headline scalars + the full year-by-year DCF
    // table, populated by EconomicsPass.  `present` is false until the pass
    // runs.  The .ods / .csv cash-flow spreadsheet is built from this.
    EconomicsSummary                                              economics;
    bool                                                           converged = true;

    //  ---- Provenance seal, tri-state (forum 2026-08-02) -----------------
    //  The manifest's claim and its RETRACTION must travel together.  Until
    //  now verifySeal() returned a divergence count that all three binaries
    //  discarded, so the divergence lived on stderr and nowhere else -- and
    //  a golden recorded from a diverged run was byte-indistinguishable
    //  from one recorded from a verified run, while every report and
    //  converged/ directory inherited the release name.
    //
    //    "verified"  a manifest exists and every claimed record hashes as
    //                claimed -- this case reproduces the release it names
    //    "diverged"  a manifest exists and sealDivergedRecords lists what
    //                no longer matches
    //    "unsealed"  no manifest -- NO CLAIM IS MADE, which is NOT the same
    //                as passing (reporting "no divergences" for a case that
    //                sealed nothing would be the lie this field ends)
    std::string                                sealVerdict = "unsealed";
    std::vector<std::string>                   sealDivergedRecords;
};

} // namespace Choupo
