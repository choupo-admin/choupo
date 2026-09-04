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
File
    src/core/ResultRecords.H

Description
    The plain records a Choupo run PRODUCES: sizing, energy wires, costs,
    utility allocations, component coverage, model-boundary findings, cash
    flows, economics.  Every one is scalars, ints, bools, strings and maps --
    no stream, no thermo package, no unit operation.

    WHY THEY ARE IN `core` AND NOT BESIDE `SimulationResult` (debt D7, 2026-08-05).

    A finding record has TWO natural homes and that is exactly the problem:
    the engine PRODUCES it and the result CARRIES it.  Filed only with the
    result, it sits in band 2, and then nothing below band 2 can name it --
    so a diagnostic the solver computes cannot be typed by the layer that
    computes it.  That is what blocked `ModelBoundaryAudit` from moving out of
    `reporting`, and it is the same shape `FlatUnit` had: a header declaring
    two unlike things, one of which dragged the other's dependencies along.

    THE ANSWER WAS CHECKED AGAINST DWSIM RATHER THAN ARGUED FROM TASTE, and
    that repository supplies both halves of it.

    The pattern: `DWSIM.Interfaces` has **zero** project references.  It is a
    pure contracts assembly at the bottom that everything depends on and that
    depends on nothing.  `core` is Choupo's equivalent, and these records
    belong in it for the same reason.

    The warning, which is the more useful half: `DWSIM.FlowsheetSolver`
    references `DWSIM.Inspector` and calls it from inside `SolveFlowsheet`
    (`Inspector.Host.GetNewInspectorItem()`).  The same assembly that holds the
    collector also holds `Window.vb` -- `Imports System.Windows.Forms` -- and
    references `DWSIM.Controls.DockPanel`.  So DWSIM's flowsheet solver has a
    compile-time path to a docking-panel GUI toolkit.  Nobody decided that; the
    diagnostics subsystem was allowed to own its own PRESENTATION, and the
    solver had to reach it to record anything.

    That is the mature form of the defect Choupo had: `Flowsheet.cpp` reaching
    into `reporting/`.  The remedy is this file (the record is neutral and sits
    at the bottom) plus keeping the AUDIT with the engine and the DRAWING with
    reporting -- never the collector and the window in one place.

    Full record: `docs/design/where-a-finding-record-lives.md`.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <map>
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

    //  THE SIZE, AND THE UNIT IT IS IN.  Write through `set()`; never touch
    //  the two maps directly.
    //
    //  WHY THE UNIT IS CARRIED AND NOT REMEMBERED.  This was a bare
    //  `map<std::string, scalar>` whose comment listed the keys and whose
    //  units lived in TWO places, neither of them readable by a machine: a
    //  `//` comment beside each sizer's local variable, and a hand-written
    //  table four call-frames away inside the pass that PRINTS the table
    //  (`V_R [m3]`, `A [m2]`, `t_wall * 1000` for mm, `weight` in kg).  A
    //  sizer that invents a key the printing table does not know emits it
    //  with no unit at all, and nothing notices.
    //
    //  Worse than a missing unit: the values are NOT all canonical SI, and
    //  nothing said so.  `power` and `Q_kW` are kW, `pressureDesign` is bar,
    //  `design_targetSize_um` is micrometres, `design_wheelSpeed_rpm` is rpm
    //  -- and six keys carry their unit inside the KEY NAME, which is the
    //  name identity this project bans for the sector and bans here for the
    //  same reason.  A student reading `power 145.2` off a specification
    //  sheet takes it for watts.
    //
    //  So the unit is DECLARED WHERE THE VALUE IS COMPUTED -- the one place
    //  that knows it -- and travels with it.  This is OpenFOAM's rule for a
    //  field file, which carries its own `dimensions` entry so that adding a
    //  field touches no reader: an object that describes itself needs no
    //  external table, and an external table is a second home.
    //
    //  The unit is a NAMED UNIT (`m3`, `kW`, `bar`), the form Choupo's dict
    //  grammar recommends and a reader wants, not the `[M L T Theta N]`
    //  exponent vector -- which the grammar also accepts, in a DIFFERENT
    //  slot (before the value), and which would read as noise on a sheet a
    //  student hands in.  A dimensionless value declares `-`.
    //
    //  NOTHING IS CONVERTED.  Each value declares the unit it is ACTUALLY
    //  in.  Rebasing the map on SI would move numbers in every golden that
    //  pins them, which is a scientific change riding on a formatting one.
    std::map<std::string, scalar>                values;
    std::map<std::string, std::string>           units;

    //  The ONE door.  Two maps that must agree can only stay in agreement if
    //  a single call writes both; a caller that reaches past this into
    //  `values` leaves a value the sheet writer will refuse by name.
    void set(const std::string& key, scalar value, const std::string& unit)
    {
        values[key] = value;
        units[key]  = unit;
    }

    //  The declared unit, or the empty string when the key carries none.
    //  Readers that must not invent one ask HERE and refuse on empty; a
    //  reader that returned a plausible default would be the printing table
    //  again, one indirection further away.
    std::string unitOf(const std::string& key) const
    {
        auto it = units.find(key);
        return it == units.end() ? std::string() : it->second;
    }

    //  WHICH RULE PRODUCED THE SIZE.  `VesselSize` computed exactly this
    //  string in three careful branches ("drum V = Q*tau", "catalyst V =
    //  Q/SV", "volume (author-set)") and then discarded it with `(void)basis`
    //  to silence an unused-variable warning.  The decision that determines
    //  the vessel volume was known to the engine and said nowhere -- and a
    //  volume whose rule is invisible cannot be defended, only reported.
    std::string                                  basis;

    //  THE OWNING SECTOR (empty for a flat case).  Copied from the flattened
    //  topology, which is where the hierarchy is known; the sizing pass does
    //  not parse it out of `unitName`.  The design report groups on it and
    //  the economics report subtotals capital on it, so a plant's cost is
    //  read the way the plant is built.
    std::string                                  sector;
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

    //  THE PROVENANCE OF THIS NUMBER, so the table can be defended from
    //  itself.  A costing line printing `F_M 3.05` and `C_TM 166653` gives a
    //  student two numbers and no way to answer "where did that come from?":
    //  the correlation, its size driver, the price index, the currency rate
    //  and the module factors are five decisions hiding behind one total.
    //  They are all already computed here; these three fields are what was
    //  missing to SAY them.
    std::string                                  sizeKey;      // "V_R", "A", ...
    std::string                                  correlation;  // "log-quadratic" | "power-law"
    std::string                                  material;     // the record F_M came from

    //  THE OWNING SECTOR, COPIED FROM THE SIZING (empty for a flat case).
    //  Capital is what a sector IS, to anyone deciding where a plant's money
    //  goes, so the cost record carries the same hierarchy the sizing does --
    //  from the same single origin, never re-derived from the unit's name.
    std::string                                  sector;
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
    //  A duty that is NOT allocated is one of TWO things, and until 2026-09-03
    //  the record could not say which: CARRIED (met by the unit's own process
    //  streams, a utility stream on its topology, or a heat-link -- nothing to
    //  buy) or UNSERVED (no catalogue utility can meet it).  The `utility`
    //  prose said so ("(carried: ...)" vs "(none adequate)"), but prose is not
    //  a field a reader may test, so the golden format pinned both as
    //  `unserved` and heatExchanger01 stood for a month as 93.79 kW of
    //  UNSERVED HEATING.  `carried` is the typed fact; `allocated` stays.
    bool        carried   = false;
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

// THE PER-UNIT ENERGY CLOSURE, with the model-boundary step kept SEPARATE
// from the imbalance it explains (ruling 2026-08-09).
//
// Three quantities, never collapsed into one:
//   (a) `raw_kW`        the physical imbalance BEFORE any model-boundary
//                       accounting -- dH over the unit's process streams,
//                       priced in the REPORT's package, minus the unit's
//                       declared energy items;
//   (b) `step_kW`       the enthalpy STEP attributed to an identified
//                       model/basis transition, computed INDEPENDENTLY of
//                       the unit that provoked it;
//   (c) `remaining_kW`  what is still unexplained once (b) is credited.
//
// `status` says what happened to the boundary, in one word a reader can
// sort on: `none` (no declared per-unit world -- (b) is 0 and (c) == (a)),
// `accounted` (a declared world whose step reproduced (a) within the
// declared criteria), `unconfirmed` (a declared world whose step did NOT
// reproduce (a) -- NOT credited), `refused` (a transition the doctrine
// forbids pricing: a speciation or datum flip), `ambiguous` (more than one
// declaration answers to the unit's name), `unavailable` (the auditor could
// not reach the case's declared thermo at all).  Only `accounted` credits
// the step; every other value leaves (c) == (a) and the RED alarm standing.
struct EnergyClosureRecord
{
    std::string unit;
    std::string status = "none";
    std::string reason;              // populated unless status == accounted

    // Both sides of the boundary, BY THEIR DECLARED MODEL NAMES, plus the
    // rule that authorises the transition and the step's sign / units /
    // magnitude.  An entry that cannot name all of these is not an entry.
    std::string upstreamWorld;
    std::string downstreamWorld;
    std::string rule;
    std::string sign;                // "+" | "-" | "0"
    std::string units = "kW";
    scalar      magnitude = 0.0;     // |step_kW|

    scalar raw_kW       = 0.0;       // (a)
    scalar step_kW      = 0.0;       // (b)
    scalar remaining_kW = 0.0;       // (c)

    // The verdict machinery: solver/Convergence.H's ONE normalization.
    scalar      normResidual = 0.0;
    std::string criterion;
    std::string detail;              // per-stream steps, ';' separated
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

} // namespace Choupo
