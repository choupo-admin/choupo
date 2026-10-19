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

    THE ANSWER WAS CHECKED AGAINST A LARGE OPEN-SOURCE PROCESS SIMULATOR
    RATHER THAN ARGUED FROM TASTE, and that codebase supplies both halves of
    it.  (This project names no other simulator in its tree -- see
    `docs/design/no-competitor-is-named-here.md` -- so what follows is the
    architecture fact and not the product.)

    The pattern: its CONTRACTS assembly has **zero** project references.  It
    is a pure contracts layer at the bottom that everything depends on and
    that depends on nothing.  `core` is Choupo's equivalent, and these records
    belong in it for the same reason.

    The warning, which is the more useful half: its FLOWSHEET SOLVER assembly
    references its DIAGNOSTICS assembly and calls it from inside the solve
    entry point.  The same assembly that holds the collector also holds a
    window class -- importing a desktop GUI framework -- and references a
    docking-panel control library.  So that solver has a compile-time path to
    a GUI toolkit.  Nobody decided that; the diagnostics subsystem was allowed
    to own its own PRESENTATION, and the solver had to reach it to record
    anything.

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

// ONE PHASE AN ITEM HOLDS, AND HOW MUCH OF EACH COMPONENT IS IN IT
// (2026-10-07, DEV.md 4c C44 slice 3).  A piece of equipment is not only a
// capital cost: while the plant runs it is FULL of material, and that
// material is money tied up for as long as the plant operates -- the
// in-process inventory of the working capital.  The quantity is computed
// from four DECLARED or PUBLISHED facts and nothing else:
//
//     m_i = V x fraction x rho(T, P, z) x w_i
//
// V the item's own sized volume (or, for an item whose sizer publishes no
// volume, a holdup volume the case declares); `fraction` the share of V the
// case says this phase occupies; rho the density of the phase at the state
// of the stream the case names as carrying it, priced on the case's own
// package; w_i that stream's mass fractions.  Each term is carried so a
// reader -- and the gate -- can redo the product.
struct HeldPhase
{
    std::string                   phase;      // "liquid" | "vapour"
    std::string                   stream;     // the stream whose state it has
    scalar                        fraction = 0.0;  // of V          [-]
    scalar                        volume   = 0.0;  // V x fraction   [m3]
    scalar                        T        = 0.0;  // [K]
    scalar                        P        = 0.0;  // [Pa]
    scalar                        rho      = 0.0;  // [kg/m3]
    scalar                        mass     = 0.0;  // [kg]
    std::map<std::string, scalar> massOf;          // per component  [kg]
};

struct ItemInventory
{
    //  EMPTY MEANS "NO INVENTORY WAS DECLARED FOR THIS ITEM", and every
    //  surface draws it that way -- never as zero kilograms, which would be
    //  a claim that the item is empty.
    std::vector<HeldPhase>        phases;
    scalar                        volume  = 0.0;   // the V the fractions apply to [m3]
    std::string                   volumeFrom;      // "sized" | "declared"
    std::string                   basis;           // one sentence: the rule

    bool   present() const { return !phases.empty(); }
    scalar total() const
    {
        scalar s = 0.0;
        for (const auto& p : phases) s += p.mass;
        return s;
    }
    std::map<std::string, scalar> massOf() const
    {
        std::map<std::string, scalar> m;
        for (const auto& p : phases)
            for (const auto& [c, kg] : p.massOf) m[c] += kg;
        return m;
    }
};

//  WHAT FLOWS WHERE IN A DESIGNED SHELL-AND-TUBE EXCHANGER (2026-10-07,
//  DEV.md 4c C51).  The Kern design route (`ShellTubeHX`, `design {}`)
//  decides which fluid is in the tubes and which in the shell, which side is
//  a utility and which a process stream, whether a side condenses, and
//  whether a film was COMPUTED or DECLARED -- and until this record it said
//  so only inside the prose of its `basis`, so a datasheet that wanted to
//  draw the tube side had either to parse a sentence or to re-derive the
//  decision from the case.  Both would be a second home.  The sizer fills
//  this, the sheet writer prints it as an `exchanger {}` block, and nothing
//  else reads it: it is NOT emitted in the result JSON (the golden
//  `equipment` kind pins sizes and the basis, and none of those moved).
//  EMPTY (`present()` false) on every item but a Kern design, so every other
//  sheet is character-for-character what it was.
struct ExchangerSide
{
    std::string role;          // process | utility | hot | cold
    std::string inlet;         // the flowsheet stream entering this side
    std::string outlet;        //   ... and leaving it (empty for a utility)
    std::string utility;       // the utility record (empty for a process side)
    std::string regime;        // gas | liquid | condensing | boils | condenses
    std::string film;          // computed | declared
    std::string correlation;   // the film correlation's word, empty if declared
    scalar      Tin  = -1.0;   // [K] a UTILITY side's supply, from its record;
    scalar      Tout = -1.0;   //     its return.  < 0: not written (a process
                               //     side's temperatures are on its ports)
};

struct ExchangerService
{
    ExchangerSide            tube;
    ExchangerSide            shell;
    std::string              tubePattern;   // square | triangular
    std::string              controlling;   // tube-side | shell-side | wall:
                                            // the largest CLEAN resistance
    //  PROVENANCE OF THE SIZING KEYS, as keys and never as second values (the
    //  `assumed` rule): what the CASE declared, what was read from the rating
    //  UNIT, what was read from a data RECORD.  Every other key of the item's
    //  `sizing {}` is the sizer's own result.
    std::vector<std::string> declared;
    std::vector<std::string> fromUnit;
    std::vector<std::string> fromRecord;

    bool present() const { return !tube.role.empty(); }
};

//  WHAT A RELIEF DEVICE WAS SIZED FOR (2026-10-11, DEV.md 4c C62).  The
//  `reliefValve` sizer evaluates every DECLARED credible scenario and sizes
//  the device on the one needing the largest area.  Every NUMBER of every
//  scenario is a `values` entry under the scenario's key prefix (so the golden
//  `equipment` kind pins it); what is here are the WORDS a number cannot
//  carry -- which scenario, which stream, which phase, which flow regime, which
//  one governs -- and the sheet writer prints them as a
//  `relief {}` block.  Sheet-only, like `ExchangerService`: not emitted in the
//  result JSON.  EMPTY (`present()` false) on every item but a relief device.
struct ReliefScenario
{
    std::string prefix;      // the `values` key prefix: `blocked_<stream>`, `fire`
    std::string scenario;    // blockedOutlet | fire
    std::string stream;      // the relieved stream, or the liquid that boils
    std::string phase;       // vapour | liquid  (what passes the device)
    std::string regime;      // critical | subcritical | liquid
};

struct ReliefService
{
    std::string                 protects;    // the protected item's id
    std::vector<ReliefScenario> scenarios;
    std::string                 governing;   // the governing scenario's prefix

    bool present() const { return !protects.empty(); }
};

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

    //  WHICH PHYSICAL ITEM OF THAT UNIT THIS IS (2026-09-07).  The
    //  constitution is explicit that a flowsheet unit is a MATHEMATICAL
    //  operation while design equipment is a PHYSICAL object, and that one
    //  unit may realise MANY items: a distillation column is a shell, a tray
    //  stack, a condenser, a reboiler and a reflux drum.  Until the column
    //  gained a sizer every implemented unit realised exactly one, so the
    //  unit's name identified the item and nothing needed this field.
    //
    //  EMPTY MEANS "THIS UNIT REALISES ONE ITEM", and that is not a
    //  placeholder: it is what every sizer but `ColumnSize` reports, and it
    //  keeps `itemId()` equal to the unit name, so every surface a one-item
    //  unit reaches is character-for-character what it was before this field
    //  existed.  A tag is written only where there is genuinely a choice to
    //  record.
    std::string                                  equipmentTag;

    //  THE IDENTITY OF THE ITEM, and the ONE home for how it is formed.
    //  `result.sizings` and `result.costs` are keyed on it, the result JSON
    //  publishes it, and the golden `equipment` kind names it -- so the day a
    //  unit yields five items, five rows can be told apart without any reader
    //  inventing a rule of its own.
    //
    //  NOBODY SPLITS IT.  A reader that wants the owning unit reads
    //  `unitName`, and a reader that wants the item reads `equipmentTag`;
    //  both travel as data on this record.  Recovering either by cutting this
    //  string at the separator would be the name identity this project bans
    //  for the sector and bans here for the same reason.
    std::string itemId() const
    {
        return equipmentTag.empty() ? unitName : unitName + "/" + equipmentTag;
    }

    //  WOULD `unit` HAVE MINTED `id`?  The inverse of `itemId()`, kept beside
    //  it so the id's shape has one home: a reader holding only an id and the
    //  name of a unit whose sizer REFUSED (so no record exists to ask) can
    //  tell whether the id was one of that unit's items -- the unit's own
    //  name, or `unit/<tag>` (C79, the plot plan).
    static bool isItemOf(const std::string& id, const std::string& unit)
    {
        return id == unit
            || (id.size() > unit.size() && id.compare(0, unit.size(), unit) == 0
                && id[unit.size()] == '/');
    }

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

    //  A DECLARED PRICE THE COSTING MODEL READS (2026-09-26).  A catalyst
    //  charge is priced from a unit price the CASE declares (`designRules {
    //  catalystPrice ...; }`), and that number belongs to neither map above:
    //  it is not a SIZE -- `values` carry a physical dimension the dict
    //  grammar can spell, and money is not one (there is no `EUR/kg` in
    //  `core/Units.cpp`, and inventing a currency dimension to fit a table is
    //  the wrong end of the problem) -- and it is not a `CostBreakdown::
    //  factors` entry, because a factor is what the MODEL computed and this
    //  is what the AUTHOR declared.  It is carried here, keyed by the
    //  designRules word it came from, in the costing currency the run
    //  totals in, and the costing model that consumes it publishes it under
    //  the same word in its `factors` so the provenance line and the sheet's
    //  cost block show the number that priced the item.  It is NOT emitted
    //  under the result JSON's `equipment.values` (which the golden
    //  `equipment` kind pins as sizes) -- a declaration reaching the output
    //  is pinned, if at all, through the cost total it produces.
    std::map<std::string, scalar>                costInputs;

    //  A DECLARED WORD THE COSTING MODEL READS (2026-10-05, DEV.md 4c C38
    //  item 1).  The tray stack is priced by its material CLASS (Turton's
    //  F_BM: carbon steel, stainless steel, nickel alloy), and the class is a
    //  word the case declares (`trayMaterial` in the column's designRules) --
    //  neither a size nor a number, so it fits neither map above.  Keyed by
    //  the designRules word it came from, exactly as `costInputs` is; the
    //  model that consumes it publishes it as the cost's `material`, so the
    //  costing table and costs.csv show the class that priced the item.  Not
    //  emitted under `equipment.values`.
    std::map<std::string, std::string>           costWords;

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

    //  WHICH OF THIS SIZE'S INPUTS THE ENGINE SUPPLIED (2026-09-06).  A
    //  student defending a wall thickness must be able to tell what they
    //  DECLARED from what the sizer assumed, and until now nothing anywhere
    //  said which: `L_over_D`, `corrosionAllow` and `jointEfficiency` were
    //  read with `lookupScalarOrDefault` and the default was indistinguishable
    //  from a declaration on every surface at once.
    //
    //  KEYS, NOT VALUES, and that is deliberate.  A key that IS published
    //  (`L_over_D`) already carries its value in `values` two lines up;
    //  repeating it here would put one number in one file twice, which is the
    //  arity sin this whole slice is about.  A key the sizer CONSUMES without
    //  publishing (`corrosionAllow`, `jointEfficiency`) is named here and
    //  valued in the advisory that announced it -- publishing it as a sizing
    //  value would be new sizing content, which the 2026-09-06 slice excludes.
    //
    //  EMPTY MEANS NOTHING WAS ASSUMED, never "nobody looked": every default
    //  a sizer takes goes through `designDefault::valueOr`, which is the one
    //  call that records it.
    std::vector<std::string>                     assumed;

    //  THE BOUNDARY STREAM A STORAGE ITEM IS ATTACHED TO (2026-10-07, DEV.md
    //  4c C44 slice 2).  A storage tank is not a flowsheet unit -- nothing in
    //  the topology solves it -- yet it is equipment the plant buys, sized
    //  from a stream the flowsheet does carry.  Vitor ruled it a postDict
    //  item attached to that stream.  EMPTY for every item a unit realises,
    //  so no existing surface changes.
    std::string                                  stream;

    //  WHAT THE ITEM HOLDS while the plant runs (2026-10-07, DEV.md 4c C44
    //  slice 3).  Empty when the case declared no inventory for it, and
    //  every surface then says "not declared" -- never zero kilograms.
    ItemInventory                                inventory;

    //  WHAT FLOWS ON EACH SIDE, for a DESIGNED exchanger only (2026-10-07,
    //  DEV.md 4c C51; see `ExchangerService` above).  Sheet-only.
    ExchangerService                             exchanger;

    //  WHAT A RELIEF DEVICE WAS SIZED FOR (2026-10-11, DEV.md 4c C62; see
    //  `ReliefService` above).  Sheet-only.
    ReliefService                                relief;

    //  AN ITEM OUTSIDE THE COSTING SCOPE, AND WHY (2026-10-11, DEV.md 4c C62).
    //  EMPTY on every item the costing pass prices -- which is every item
    //  that existed before this field -- so nothing they reach changes.
    //  NON-EMPTY means the item is sized and is deliberately NOT priced, and
    //  the sentence says why: the costing pass lists it under its own heading
    //  and does NOT count it as a failure, so a total that never claimed to
    //  include it does not read INCOMPLETE because of it.  This is not the
    //  tray stack's refusal: an item the costing model COULD price but lacks
    //  a declared input for is refused and makes the total INCOMPLETE; an
    //  item no cost correlation in this engine covers at all (a relief valve)
    //  is said to be outside the scope, once, by the sizer that knows it.
    std::string                                  notCostedBecause;

    //  THE ITEMS WHOSE PRESSURE SHELL THIS ITEM IS (2026-10-12, DEV.md 4c
    //  C69).  A multibed converter is ONE pressure vessel holding the beds
    //  and the interbed exchangers; its `converterShell` item lists here the
    //  members' own shells it takes over, and the sizing pass then marks each
    //  of them NOT costed (`notCostedBecause`, naming this item) -- a member
    //  shell inside a pressure vessel is an internal basket, not a second
    //  pressure vessel.  EMPTY on every other item, so nothing they reach
    //  changes.
    std::vector<std::string>                     encloses;

    void assume(const std::string& key)
    {
        for (const auto& k : assumed) if (k == key) return;
        assumed.push_back(key);
    }
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

    //  THE ITEM THIS PRICES, copied from the sizing that was priced -- never
    //  re-derived here.  Empty for a unit that realises one item, exactly as
    //  on `EquipmentSizing`, so a one-item unit's cost record is unchanged.
    std::string                                  equipmentTag;
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

    //  A DECLARED QUOTE'S WORDS (DEV.md 4c C98, `costing/DeclaredQuote`).
    //  Empty on every record a correlation priced, so nothing that predates
    //  the quotes reads, prints or emits them.  The numbers of a quote ride
    //  in `factors` like every other row's; these are the declaration's
    //  WORDS, which a reader defends the number with and which fit no map of
    //  scalars: where the number comes from, why it is this plant's, whether
    //  it is an installed or a purchased price, whether it is a machine or a
    //  facility, and (purchased only) where its installation factor comes
    //  from.
    std::string                                  quoteSource;
    std::string                                  quoteReason;
    std::string                                  quoteBasis;         // installed | purchased
    std::string                                  quoteKind;          // equipment | facility
    std::string                                  quoteFactorSource;  // purchased only
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
//  Years run t = 1-Nc .. N: t <= 0 are the Nc construction years (t = 0 is
//  the END of construction, the start-up instant), t = 1..N the operating
//  years (DEV.md 4c C63).  With a one-year construction the rows are
//  t = 0..N, as they always were.
struct CashFlowYear
{
    int    year             = 0;    // t = 1-Nc .. N
    scalar investment       = 0.0;  // capital outflow (construction years: FCI
                                    // fraction; t = 0 also WC), <0
    scalar productionFraction = 1.0; // p_t of the ramp-up (0 in construction)
    scalar revenue          = 0.0;  // R_t = p_t R
    scalar operatingCost    = 0.0;  // COM_d_t (depreciation NOT included)
    scalar startupCost      = 0.0;  // start-up cost, expensed in year 1 only
    scalar depreciation     = 0.0;  // d_t (straight line)
    scalar taxableIncome    = 0.0;  // R_t - COM_d_t - startup_t - d
    scalar tax              = 0.0;  // tau * taxableIncome
    scalar afterTaxProfit   = 0.0;  // (R - COM_d - d)(1-tau)
    scalar cashFlow         = 0.0;  // CF_t (after-tax profit + d, + WC/salvage at N)
    scalar land             = 0.0;  // the land (C82): -cost at the start of
                                    // construction, +cost (recovered) at N;
                                    // written only when a land price is declared
    scalar discountFactor   = 0.0;  // 1/(1+i)^t
    scalar discountedCF     = 0.0;  // CF_t * discountFactor
    scalar cumulativeDCF    = 0.0;  // running sum of discountedCF
};

// THE WORKING CAPITAL BUILT UP FROM WHAT THE PLANT HOLDS AND OWES (2026-10-07,
// DEV.md 4c C44 slice 4).  Present only when the case declares the
// componentised model (`workingCapital { ... }` in the economics block);
// absent, the working capital stays the one fraction of FCI it always was.
//
//   gross (current assets)  = raw-material stock + process inventory
//                           + product stock + receivables + minimum cash
//   net                     = gross - payables (current liabilities)
//
// Every term is a declared number of DAYS times a flow the run computed, or
// a held mass the sizing pass computed times a unit cost the run computed.
struct WorkingCapitalLine
{
    std::string key;           // stable word: rawMaterialStock, receivables, ...
    std::string label;         // what a reader is told
    scalar      value = 0.0;   // EUR
    std::string rule;          // the arithmetic, in one line
};

struct WorkingCapitalBuildUp
{
    bool                            present = false;
    std::vector<WorkingCapitalLine> assets;        // the current assets
    std::vector<WorkingCapitalLine> liabilities;   // the current liabilities
    scalar                          gross = 0.0;   // sum of assets
    scalar                          net   = 0.0;   // gross - liabilities
    scalar                          fractionRule = 0.0;     // the old figure
    scalar                          fractionUsed = 0.0;     // its fraction
    scalar                          productionCostPerKg = 0.0;   // EUR/kg product
};

// ONE ROW OF THE ONE-AT-A-TIME ECONOMIC SENSITIVITY (2026-10-12, DEV.md 4c
// C68; published on the result 2026-10-17 so the GUI's tornado DRAWS the
// engine's rows instead of parsing a console table or a CSV).  Exactly the
// columns of reports/economics/sensitivity.csv, in the same (tornado) order.
// The two NPVs are also `kpis.economics.sens_<kpiKey>_NPV_low/_high` and the
// two input values `..._value_low/_high`, which the golden `kpi` kind pins;
// this record carries the WORDS (input, mode, unit, sign flip) a reader draws.
struct EconomicSensitivityRow
{
    std::string input;              // as declared: FCI, price.H2Feed, ...
    std::string kpiKey;             // the `sens_<kpiKey>_...` KPI stem
    std::string mode;               // "relative" | "absolute"
    bool        fromBand = false;   // FCI { relative accuracyBand; }
    scalar      declaredLow = 0.0, declaredHigh = 0.0;   // as declared
    std::string unit;               // of the input's VALUE
    scalar      baseValue = 0.0, valueLow = 0.0, valueHigh = 0.0;
    scalar      NPV_low = 0.0, NPV_high = 0.0;
    scalar      NPVswing = 0.0;     // |NPV_high - NPV_low|, the sort key
    std::string NPVsignFlip;        // "" | "low" | "high" | "both"
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
    std::vector<CashFlowYear> cashFlow;              // rows t = 1-Nc..N
    //  THE START-UP YEARS (C63).  `timelineExtended` is true when the case
    //  declared anything beyond the one-year, full-production timeline; the
    //  writers add the production-fraction and start-up columns ONLY then,
    //  so every other case writes byte-for-byte what it did.
    bool                      timelineExtended    = false;
    int                       constructionPeriod  = 1;
    std::vector<scalar>       capitalSchedule;               // sums to 1
    std::vector<scalar>       rampUp;                        // first op. years
    scalar                    startupCostFraction = 0.0;     // x FCI
    scalar                    startupCost         = 0.0;     // money, year 1
    scalar                    NPV_projectStart    = 0.0;     // NPV/(1+i)^Nc
    WorkingCapitalBuildUp     workingCapital;        // present only when declared
    //  THE LAND (C82), present only when the case declares a land price.  A
    //  non-depreciable capital outlay of price x area, made at the START of
    //  construction (year `landInvestedAtYear` = -constructionPeriod, CAPCOST's
    //  year 0) and recovered at its purchase value, untaxed, at the end of the
    //  last operating year.  NOT part of TCI (TCI = FCI + WC, as before).
    bool                      landPresent   = false;
    scalar                    landPrice     = 0.0;   // currency per m2
    scalar                    landArea      = 0.0;   // m2
    std::string               landAreaFrom;          // layoutPlot | declared
    scalar                    landCost      = 0.0;   // price x area
    int                       landInvestedAtYear  = 0;
    int                       landRecoveredAtYear = 0;
    std::string               landSource;
    std::string               landReason;
    //  THE SENSITIVITY (C68), empty unless the case declared the block; in
    //  tornado order (largest NPV swing first, a tie in declared order).
    std::vector<EconomicSensitivityRow> sensitivity;
    std::string                         sensitivityCaveat;
};

//  THE PLANT LAYOUT (2026-10-17, DEV.md 4c C75).  What the layout check
//  concluded from `system/layoutDict` over the SIZED items of the run: where
//  each placed item stands, the box it occupies (taken from the item's OWN
//  published dimensions, or from a footprint the case declared where the
//  item publishes none), and every finding the declared rules raised.  The
//  GUI draws this block and computes nothing; `postProcessing/layout/
//  PlantLayout.H` is the one home of the footprint rule and the geometry.
//  EMPTY (`present()` false) unless the case declares a layoutDict, so every
//  other result is unchanged.
//
//  LENGTHS IN METRES; the wind angles in DEGREES (the unit the case declares
//  them in, published back in it so a reader compares like with like).
//  `dx`/`dy`/`dz` are the item's extents along the plan's x, y and the
//  vertical; `z` is its BASE elevation; (x, y) its plan centre.
struct LayoutZone
{
    int    zone   = 2;       // 0 | 1 | 2  (the IEC 60079-10-1 vocabulary)
    scalar radius = 0.0;     // [m] about the item's plan centre
    scalar height = 0.0;     // [m] above the item's base elevation
};

struct LayoutItem
{
    std::string id;            // EquipmentSizing::itemId(), or a non-process name
    bool        nonProcess = false;
    std::string kind;          // the sheet's `equipment` word, or the declared kind
    std::string sector;        // the item's stamp; empty on a flat case / non-process
    std::string shape;         // cylinder | box
    std::string orientation;   // vertical | alongX | alongY
    std::string footprintFrom; // published | declared
    scalar x = 0, y = 0, z = 0;
    scalar dx = 0, dy = 0, dz = 0;
    //  WHAT THE CASE DECLARED ABOUT ITS HAZARDS.  A release source carries
    //  its zones (possibly none: it still counts for the wind); an ignition
    //  source carries the case's reason.
    bool                    release = false;
    std::string             releaseSource;
    std::string             releaseReason;
    std::vector<LayoutZone> zones;
    std::string             ignition;    // the declared reason; empty = not one
    //  A non-process item's own `source` and `reason` (C90: a site building
    //  says why it is there and where its size came from); both or neither.
    std::string             source;
    std::string             reason;
    //  THE ROOM IT STANDS IN (2026-10-19, DEV.md 4c C100): the room of the
    //  declared `building {}` whose `equipment ( ... )` lists the item, or
    //  empty for an item in the open.  An item indoors takes its base `z`
    //  from that room's floor (BuildingLayout.H `indoorPlaces`, one home),
    //  and the building, not the item, faces the site.
    std::string             room;
};

struct LayoutArea
{
    std::string sector;
    scalar xMin = 0, xMax = 0, yMin = 0, yMax = 0;
};

struct LayoutSeparationRule
{
    std::string a, b;          // two equipment kinds (unordered)
    scalar      distance = 0;  // [m]
};

struct LayoutSeparationTable
{
    std::string                       source;
    std::string                       reason;
    std::string                       measure;   // edgeToEdge | centreToCentre
    std::vector<LayoutSeparationRule> rules;
};

struct LayoutWind
{
    bool        present      = false;
    scalar      fromDeg      = 0;   // the TRUE bearing the wind blows FROM
    scalar      planNorthDeg = 0;   // the TRUE bearing of the plan's +y axis
    scalar      halfAngleDeg = 0;   // the declared downwind sector, +/-
    scalar      reach        = 0;   // [m] centre to centre
    std::string source;
    std::string reason;
};

//  One finding.  `kind` is separation | outsideArea | ignitionInZone |
//  ignitionDownwind | deadRule | sizingRefused; `a`/`b` the items (b empty
//  where one item or one rule is concerned; for sizingRefused, b is the
//  sizing entry whose sizer refused, and value/limit carry nothing); `value`
//  the measured distance and `limit` the declared one, both in metres.  `id` is the finding's stable identity,
//  `<kind>:<a>:<b>`, which the golden `layout` kind names.
struct LayoutFinding
{
    std::string id;
    std::string kind;
    std::string a, b;
    scalar      value = 0;
    scalar      limit = 0;
    std::string message;
};

//  THE PIPES (2026-10-17, DEV.md 4c C80).  Every stream whose two ends the
//  layout can reach -- a placed item, a JUNCTION (an unsized mixer, splitter
//  or valve, drawn as a node on the rack), or a BATTERY LIMIT (a plant inlet
//  or outlet, at an end of the rack) -- routed ONCE by the rule in
//  `postProcessing/layout/PlantLayout.H`, its polyline and its LENGTH
//  published; every other stream listed with the reason it is not routed.
//  No pressure drop and no cost: those are the next slice.
struct LayoutPipeRack
{
    bool        declared     = false;   // false: the stated default, announced
    scalar      y            = 0;       // [m] plan y of the rack's centre line
    scalar      elevation    = 0;       // [m] height of its lowest tier
    scalar      laneSpacing  = 0;       // [m] across the rack, lane to lane
    int         lanesPerTier = 0;
    scalar      tierSpacing  = 0;       // [m] tier to tier, upward
    scalar      xStart       = 0;       // [m] the inlet battery limit (or, with
                                        //     a fence, where inlets join the rack)
    scalar      xEnd         = 0;       // [m] the outlet battery limit (idem)
    std::string reason;
};

struct LayoutJunction
{
    std::string unit;          // the flowsheet unit (qualified name)
    std::string type;          // mixer | splitter | valve
    scalar x = 0, y = 0, z = 0;
};

struct LayoutPipe
{
    std::string stream;        // the stream IDENTITY (one row per physical stream)
    std::string label;         // the plant's boundary name for it, if any
    //  Each end: `kind` item | junction | batteryLimit; `at` the item id, the
    //  junction's unit, or `inlet` / `outlet`; `unit` the flowsheet unit.
    std::string fromKind, from, fromUnit;
    std::string toKind,   to,   toUnit;
    std::string routedBy;      // rack | waypoints
    int         lane = -1;     // -1 on a declared-waypoint route
    //  The route, IN THE DIRECTION OF FLOW (the producer's end first), plan
    //  x, plan y and elevation z in metres; every segment along one axis.
    std::vector<std::vector<scalar>> route;
    scalar      length = 0;    // [m] the polyline's own length
};

struct LayoutNotRouted
{
    std::string stream;
    std::string reason;
    //  The flowsheet units at its two ends ("" at a battery limit), and where
    //  its one REACHABLE end is on the plot plan -- an item's nozzle or a
    //  junction's node -- so a surface can mark the missing pipe there rather
    //  than draw a plant that looks finished (DEV.md 4c C93).  Empty when
    //  neither end is reachable.
    std::string fromUnit, toUnit;
    std::vector<scalar> anchor;
    //  Not a missing pipe: the stream carries only solids, which are moved
    //  in containers or by conveyor (DEV.md 4c C97).  No anchor is set.
    bool solids = false;
    //  An end of it stands INSIDE the declared building (DEV.md 4c C100):
    //  indoor piping is not routed.  With the other end in the open the
    //  anchor marks that end, whose outdoor leg the case may declare up to
    //  the building's wall (PlantLayout.H, THE PIPES).
    bool indoor = false;
};

//  THE PLOT (2026-10-17, DEV.md 4c C82).  The ground the layout occupies, by
//  ONE rule (`postProcessing/layout/PlantLayout.cpp`, `plotOf`): the
//  axis-aligned ENVELOPE of every declared sector area, every placed
//  footprint (process and non-process), every routed pipe's polyline and
//  every room of a declared `building {}` (DEV.md 4c C97), grown on every side by the case's declared `plot { margin; }` -- or by
//  0 m, ANNOUNCED, so the area is then a lower bound.  Beside it, the plan
//  area the footprints themselves cover (each item counted once, so items
//  standing one above another are counted twice -- `stackedPairs` says how
//  many such pairs there are) and, where the case declares sector areas,
//  their UNION and the ground two of them claim at once.  Per sector: the
//  declared area where there is one, else the envelope of that sector's
//  footprints (no margin), and the sector's own footprint area.
struct LayoutPlotSector
{
    std::string sector;
    std::string from;               // declaredArea | footprintEnvelope
    scalar      plotArea      = 0;  // [m2]
    scalar      footprintArea = 0;  // [m2]
};

struct LayoutPlot
{
    bool        present        = false;
    scalar      margin         = 0;     // [m]
    bool        marginDeclared = false;
    std::string marginReason;
    scalar xMin = 0, xMax = 0, yMin = 0, yMax = 0;   // the plot, margin included
    scalar      plotArea       = 0;     // [m2]
    scalar      footprintArea  = 0;     // [m2]
    scalar      footprintShare = 0;     // footprintArea / plotArea
    int         stackedPairs   = 0;
    scalar      declaredAreasUnion   = 0;   // [m2]; 0 when no area is declared
    scalar      declaredAreasOverlap = 0;   // [m2]  sum of the areas - their union
    std::string rule;                       // the engine's sentence for the rule
    std::vector<LayoutPlotSector> sectors;
};

//  THE ROADS (2026-10-18, DEV.md 4c C90).  A road network the case DECLARES
//  in `roads {}` -- each road a centre line of plan waypoints (every segment
//  along one plan axis) and a width -- checked by ONE set of rules in
//  `postProcessing/layout/PlantLayout.cpp` (`checkRoads`): a road through a
//  footprint, under a rack lower than the declared headroom or under a pipe
//  lower than it is REFUSED; a road through a zone the case closes to traffic,
//  a road no gate reaches, a site building no road serves, a weighbridge no
//  road drives over, and a process item farther than the declared access
//  distance from every road are ANNOUNCED.  Published: each road's centre
//  line and length, the network's length and PAVED AREA (the union of the
//  paved rectangles, counted once where roads meet), each rack crossing, and
//  per placed item the nearest road a gate reaches.
struct LayoutRoad
{
    std::string id;                                // the declared name
    scalar      width  = 0;                        // [m]
    std::string reason;
    std::vector<std::vector<scalar>> centreline;   // plan (x, y) [m]
    scalar      length = 0;                        // [m] along the centre line
    int         component = 0;                     // connected component
    bool        fromEntrance = false;              // a gate reaches it
    //  C96: the centre-line radius of the road's corners and of every
    //  junction a truck route turns at (0: none declared -- a square corner),
    //  and whether traffic runs only in the order of its waypoints.
    scalar      cornerRadius = 0;                  // [m]
    bool        cornerRadiusDeclared = false;
    bool        oneWay = false;
};

//  THE TRUCKS (2026-10-18, DEV.md 4c C96).  A declared DESIGN VEHICLE (its
//  kerb-to-kerb turning circle, with the case's source), optional TURNING
//  AREAS (a paved disc where a vehicle may turn round), and the TRUCK ROUTES
//  the case declares -- an ordered list of roads from a gate back to a gate --
//  walked by ONE rule (`postProcessing/layout/PlantLayout.cpp`,
//  `checkTruckRoutes`): the path is published with its length, every corner
//  with the radius the case declared and the outer radius the vehicle needs,
//  and every verdict the walk reached is ANNOUNCED (a reversal with no
//  turning area big enough, a corner sharper than the vehicle turns, two
//  corners too close to make both, a one-way road driven backwards, a
//  weighbridge the route misses, a stop it does not pass, a route that leaves
//  by no gate).
struct LayoutDesignVehicle
{
    bool        present = false;
    scalar      turningDiameter = 0;   // [m] kerb to kerb, outer
    std::string routeRule;             // the engine's sentence for the walk
    std::string source, reason;
};

struct LayoutTurningArea
{
    std::string id;
    scalar      x = 0, y = 0;          // [m] centre
    scalar      diameter = 0;          // [m]
    std::string reason;
};

struct LayoutRouteCorner
{
    scalar      x = 0, y = 0;          // [m] the corner on the centre lines
    std::string turn;                  // left | right | reverse
    std::string inRoad, outRoad;
    scalar      radius      = 0;       // [m] the declared centre-line radius
    scalar      outerRadius = 0;       // [m] radius + half the narrower road
    scalar      required    = 0;       // [m] half the design turning diameter
    std::string turningArea;           // a reversal: the area it turns in
    bool        ok = true;
};

struct LayoutTruckRoute
{
    std::string id, from, to, reason;
    std::vector<std::string> roads;    // in the order driven
    std::vector<std::string> serves;   // the stops it must pass
    std::vector<std::vector<scalar>> path;   // plan (x, y) [m], in travel order
    scalar      length = 0;            // [m] along the path
    std::vector<LayoutRouteCorner> corners;
    int         reversals = 0;
    std::string weighbridge;           // the deck it drives over ("" none)
    std::string verdict;               // clear | announced
};

//  THE CAR PARKS (2026-10-18, DEV.md 4c C96).  A non-process item of kind
//  `carPark` declares its bays in `parking {}`; the engine lays the rows out
//  along the item's length by ONE rule (`checkParking`), REFUSES a declared
//  count the footprint cannot hold, publishes the capacity, the area and
//  every bay (its plan centre and the direction a car LEAVES it by), and
//  ANNOUNCES bays that make a car reverse out.
struct LayoutCarPark
{
    std::string item;
    int         bays = 0;              // declared
    int         capacity = 0;          // what the footprint holds by the rule
    int         rows = 0, perRow = 0;
    scalar      bayWidth = 0, bayLength = 0, aisle = 0;   // [m]
    scalar      angleDeg = 90;         // the bay to its aisle
    std::string arrangement;           // doubleLoaded | driveThrough
    std::string entry;                 // reverse | forward
    bool        exitsForward = false;
    scalar      depth = 0;             // [m] a row across its aisle
    scalar      pitch = 0;             // [m] bay to bay along the aisle
    scalar      usableLength = 0;      // [m] the length less the end aisles
    scalar      area = 0;              // [m2] the footprint's plan area
    std::string source, reason;
    //  Every bay: plan centre (x, y) and the unit vector (ux, uy) a car
    //  leaves the bay by, nose first when `exitsForward`.
    std::vector<std::vector<scalar>> stalls;
};

//  A road under the pipe rack: the plan rectangle where its paved surface
//  meets the rack's band, and the rack's lowest tier above it.
struct LayoutRackCrossing
{
    std::string road;
    scalar xMin = 0, xMax = 0, yMin = 0, yMax = 0;
    scalar clearance = 0;    // [m] the rack's published elevation
};

//  The nearest road a gate reaches, per placed item.  `road` empty: none.
struct LayoutAccess
{
    std::string item;
    std::string road;
    scalar      distance = 0;   // [m] footprint edge to paved edge
    scalar      x = 0, y = 0;   // the nearest point on that road's centre line
    bool        onDeck = false; // a weighbridge whose deck the road crosses
};

struct LayoutRoads
{
    bool        present = false;
    std::string source, reason;
    scalar      headroom = 0;          // [m] the vehicle clearance declared
    scalar      accessDistance = 0;    // [m]
    std::string accessSource, accessReason;
    std::vector<int> noTraffic;        // zones closed to vehicles
    std::vector<LayoutRoad>         roads;
    std::vector<LayoutRackCrossing> rackCrossings;
    std::vector<LayoutAccess>       access;
    std::vector<std::string>        entrances;   // the placed gates
    int    components = 0;
    scalar length     = 0;             // [m] the centre lines summed
    scalar pavedArea  = 0;             // [m2] the paved rectangles' union
                                       //      (C96: with the gate approaches
                                       //      and the turning areas)
    LayoutDesignVehicle             designVehicle;   // C96
    std::vector<LayoutTurningArea>  turningAreas;    // C96
    std::vector<LayoutTruckRoute>   truckRoutes;     // C96
};

//  THE FENCE (2026-10-18, DEV.md 4c C93).  The perimeter a case DECLARES
//  (`fence { source; reason; [inset <m>;] [crossings ( ... );] }`), drawn by
//  ONE rule (`postProcessing/layout/PlantLayout.cpp`, `fenceOf`): the
//  published PLOT's boundary moved `inset` inward -- never typed a second
//  time.  An OPENING at each placed gate, on the side nearest it, as wide as
//  the road that serves it; a road whose paved surface meets the fence
//  anywhere else is REFUSED.  Every pipe that ends at a battery limit is
//  carried on to the fence and CROSSES it at a published point, labelled with
//  where it comes from or goes to; a crossing with no declared label is
//  ANNOUNCED by name.
struct LayoutFenceOpening
{
    std::string gate;          // the gate item that opens it
    std::string side;          // north | south | east | west
    scalar      x = 0, y = 0;  // [m] its centre, on the fence line
    scalar      width = 0;     // [m] along the fence
    std::string road;          // the road that serves the gate ("" if none)
    scalar      gateDistance = 0;   // [m] the gate's footprint to the fence
    //  C96: the paved APPROACH that carries the road on to the opening -- from
    //  the road's centre-line point nearest the fence (approachX, approachY)
    //  to (x, y) -- so a road the plot's margin stops short still reaches its
    //  gate.  `approach` 0 with no road.
    scalar      approachX = 0, approachY = 0;
    scalar      approach  = 0;      // [m]
};

struct LayoutFenceCrossing
{
    std::string stream;
    std::string direction;     // in | out
    std::string side;          // north | south | east | west
    scalar      x = 0, y = 0, z = 0;   // [m] where the pipe meets the fence
    std::string label;         // the declared origin (in) or destination (out)
    bool        labelDeclared = false;
    std::string positionFrom;  // declared | statedDefault | waypoints
};

struct LayoutFence
{
    bool        present = false;
    std::string source, reason;
    scalar      inset = 0;               // [m] inward of the plot boundary
    bool        insetDeclared = false;
    scalar xMin = 0, xMax = 0, yMin = 0, yMax = 0;
    scalar      length = 0;              // [m] the perimeter
    std::string rule;                    // the engine's sentence
    std::vector<LayoutFenceOpening>  openings;
    std::vector<LayoutFenceCrossing> crossings;
};

struct PlantLayoutRecord
{
    std::vector<LayoutItem>            items;
    std::vector<LayoutArea>            areas;
    std::vector<LayoutSeparationTable> separation;
    LayoutWind                         wind;
    std::vector<LayoutFinding>         findings;
    LayoutPipeRack                     pipeRack;
    std::vector<LayoutJunction>        junctions;
    std::vector<LayoutPipe>            pipes;
    std::vector<LayoutNotRouted>       notRouted;
    //  Sized items the layout does not place.  `unplaced` are placeable items
    //  the case left out (announced); `internal` are items that live inside
    //  or on another one (a tray stack, a catalyst charge, a relief valve) and
    //  are never placed on their own.
    std::vector<std::string>           unplaced;
    std::vector<std::string>           internal;
    LayoutPlot                         plot;     // C82
    LayoutRoads                        roads;    // C90
    LayoutFence                        fence;    // C93
    std::vector<LayoutCarPark>         carParks; // C96
    //  The non-process item that is the declared building's shell (its
    //  `envelope`), empty when none is declared (C100: an item a room lists
    //  stands inside it).  Read by the checks; published by the building.
    std::string                        shell;

    bool present() const { return !items.empty(); }
};

} // namespace Choupo
