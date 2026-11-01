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
Description
    WHAT A UNIT ACCEPTS (DEV.md 4c C188 item 5; the contract is
    docs/design/what-a-unit-accepts.md).

    `UnitAcceptance` is DATA a unit class declares through
    `UnitOperation::acceptance()`: the inlet phases its model is written
    for, whether it needs the declared aqueous solvent, which components its
    equations carry (a RULE word, a SENTENCE and the test the rule names),
    the package capabilities it needs, whether it judges each inlet or the
    combined feed, the pass-through fates it offers, and any further
    refusal condition, each with its sentence.  The default accepts every
    phase and models every component, so a unit that has not declared one
    behaves exactly as it did before the contract existed.

    ONE FUNCTION WRITES AN ACCEPTANCE REFUSAL: `acceptanceFindings` composes
    every sentence; `checkAcceptance` (the unit's own solve, on the stream
    it is handed) throws them, and the flowsheet's pre-solve pass (every
    AUTHORED inlet, against the unit that consumes it, before the first unit
    runs -- and so in `choupo-lint`) collects them.  A refusal that is not in
    a declaration cannot be written anywhere else.

    The check reads the declaration and the stream's RESOLVED state
    (`flashState::resolvedInletVaporFraction`, the one home); it never infers
    acceptance from a number a solve produced.

    A DECLARED PASS-THROUGH (slice B; the record's section 5) is the case's
    `passThrough { <component> { fate <outlet>; } reason "..."; }` block in
    the unit's own entry.  `passThroughFindings` is the one place its
    refusals are written (a unit that offers no fate; a component the unit
    models; the solvent; a fate not offered; no reason), a component it
    covers is ACCEPTED by `acceptanceFindings`, and `recordPassThrough` puts
    each one on the ProblemDivergence channel as a `declaredApproximation`.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <functional>
#include <optional>
#include <ostream>
#include <string>
#include <utility>
#include <vector>

namespace Choupo {

class ThermoPackage;
class UnitOperation;

//  The state of ONE inlet as the acceptance check reads it.  Built by
//  `acceptanceInletOf` from the feed dict a unit is handed (or, before the
//  solve, from the authored stream itself), so the unit and the pre-solve
//  pass read the SAME resolved vapour fraction.
struct AcceptanceInlet
{
    std::string streamName;     // for the message only
    scalar      T  = 0.0;       // K
    scalar      P  = 0.0;       // Pa
    sVector     z;              // normalised overall composition
    scalar      vf = 0.0;       // the vapour fraction the inlet MEANS
    //  The unit's process-inlet index this stream arrives at (-1 = not
    //  known / not per-port): a unit whose ports accept different phases
    //  (an absorber's gas and its wash) declares `UnitAcceptance::ports`.
    int         port = -1;
};

struct UnitAcceptance
{
    //  True only on a class that declared its acceptance; the default
    //  (false) is the unmigrated unit -- accepts every phase, models every
    //  component -- and `--describe-units` says which is which.
    bool declared = false;

    //  The inlet phases the model is written for.  `liquid` only refuses any
    //  vapour (vf > 0); `vapour` only refuses any liquid (vf < 1).
    struct Phases
    {
        bool        liquid = true;
        bool        vapour = true;
        std::string why;        // what the model assumes about the phase
        std::string remedy;
    } phases;

    //  PER-PORT PHASES (C188 item 5, slice D).  A unit whose process inlets
    //  are not alike -- an absorber's gas feed and its liquid wash -- declares
    //  one entry per inlet, in the order of the unit's `inputs (...)`, and the
    //  phase clause is judged against THAT port's `phases`; `phases` above is
    //  then the default for any port not listed.  Empty = every inlet is
    //  judged against `phases`.  The port's `name` is for the message and the
    //  generated documentation.
    struct Port
    {
        std::string name;
        Phases      phases;
    };
    std::vector<Port> ports;

    //  Whether the declared aqueous solvent (`ThermoPackage::
    //  aqueousSolventIndex`, water by default) must be present in the feed.
    struct Solvent
    {
        bool        aqueousRequired = false;
        std::string why;
        std::string remedy;
    } solvent;

    //  Which present components the equations carry.  The RULE is a closed
    //  word so the test has ONE home (`acceptanceFindings`) and the generated
    //  documentation can print it; the SENTENCE says it to a student.
    enum class ModelsRule
    {
        everyComponent,                       // the default
        aqueousSolventAndNonvolatileSolutes,  // the solvent + `role nonvolatile`
        aqueousSolventAndIons                 // the solvent + single-master ions
    };
    struct Models
    {
        ModelsRule  rule = ModelsRule::everyComponent;
        std::string sentence = "every component the stream carries";
        std::string why;        // what happens to a component outside it
        std::string remedy;
        //  True when a feed must carry at least ONE modelled component besides
        //  the solvent (an ion exchanger with no ion has nothing to exchange).
        bool        atLeastOne = false;
        std::string noneWhy;
    } models;

    //  A package capability the unit reads, by a CLOSED word (the
    //  `requires` of the record's section 3; spelled `needs` because
    //  `requires` is a C++20 keyword).  Checked once per unit, not per inlet.
    enum class Capability
    {
        aqueousActivityModel   // `equilibrium { aqueous { activityModel {..} } }`
    };
    struct Need
    {
        Capability  what;
        std::string why;
        std::string remedy;
    };
    std::vector<Need> needs;

    //  WHAT is judged: each process inlet on its own, or the feed the unit
    //  combines them into (a crystalliser fed a brine and an antisolvent
    //  judges the mixture, not the antisolvent alone).
    enum class Scope { eachInlet, combinedFeed };
    Scope appliesTo = Scope::eachInlet;

    //  The fates a declared pass-through may name (C188 item 5, section 5 of
    //  the record).  EMPTY = none offered.  `passThroughWhy` says what a fate
    //  MEANS for this unit, and why these and no others are offered.
    std::vector<std::string> passThroughFates;
    std::string              passThroughWhy;

    //  A refusal condition outside the three above, with its sentence.  The
    //  test returns the DETAIL of a violation (empty optional = satisfied);
    //  the message is still composed by `acceptanceFindings`.
    struct Condition
    {
        std::string id;
        std::string sentence;
        std::string remedy;
        std::function<std::optional<std::string>(const AcceptanceInlet&,
                                                 const ThermoPackage&)> test;
    };
    std::vector<Condition> refusesAlso;
};

//  The word a ModelsRule / Capability / Scope is printed as (JSON, messages).
const char* modelsRuleWord(UnitAcceptance::ModelsRule r);
const char* capabilityWord(UnitAcceptance::Capability c);
const char* scopeWord(UnitAcceptance::Scope s);

//  A pass-through the CASE declared for one unit: each component, the fate
//  (outlet) it leaves by, and the reason.  Empty = none declared.
struct PassThroughDeclaration
{
    struct Entry
    {
        std::string component;
        std::size_t index = 0;   // in the package the unit runs in
        std::string fate;
    };
    std::vector<Entry> entries;  // in declared order
    std::string        reason;

    bool empty() const { return entries.empty(); }
    //  The declared entry for component index i, or nullptr.
    const Entry* find(std::size_t i) const;
};

//  THE ONE PLACE A PASS-THROUGH DECLARATION IS JUDGED.  Reads the unit's
//  `passThrough {}` block (absent = an empty declaration, no finding) into
//  `out`, and returns one finding per refused clause: the unit offers no
//  pass-through; a key that is not a component of the package; a component
//  the unit MODELS (a listing nobody needs reads like a decision); the
//  aqueous solvent; a missing or unoffered fate; a missing reason.
std::vector<std::string> passThroughFindings(const DictPtr&          unitDict,
                                             const UnitAcceptance&   acc,
                                             const std::string&      unitType,
                                             const ThermoPackage&    thermo,
                                             const std::string&      where,
                                             PassThroughDeclaration& out);

//  The unit's own reading at its solve: throws the findings, if any.
PassThroughDeclaration readPassThrough(const DictPtr&        unitDict,
                                       const UnitAcceptance& acc,
                                       const std::string&    unitType,
                                       const ThermoPackage&  thermo,
                                       const std::string&    where);

//  Records each declared pass-through on the ProblemDivergence channel as a
//  `declaredApproximation` (deduplicated there): locus `where`, requested
//  "pass <component> through to the <fate> outlet", the case's reason.
void recordPassThrough(const PassThroughDeclaration& pt,
                       const std::string&            where);

//  The inlet a unit is handed, read as the acceptance check reads it: T and
//  P from `feedDict`, the composition handed in (already normalised by the
//  caller), the vapour fraction through `resolvedInletVaporFraction` -- but
//  ONLY when `acc` restricts the phases: a unit that accepts every phase
//  never reads it, and resolving it anyway would run an inlet flash (and
//  raise its advisories) on a unit that never asked.  Otherwise `vf` is the
//  carried value.
AcceptanceInlet acceptanceInletOf(const DictPtr&        feedDict,
                                  const sVector&        z,
                                  const ThermoPackage&  thermo,
                                  const std::string&    locus,
                                  const UnitAcceptance& acc,
                                  int                   port = -1);

//  THE ONE PLACE AN ACCEPTANCE REFUSAL IS WRITTEN.  Returns one finding per
//  violated clause (empty = accepted), each a complete sentence naming the
//  unit (`where`), the stream, the fact and the remedy.
//  A component a declared pass-through covers is accepted (it is neither
//  judged against `models` nor counted by `atLeastOne`).
std::vector<std::string> acceptanceFindings(const UnitAcceptance& acc,
                                            const std::string&    unitType,
                                            const AcceptanceInlet& inlet,
                                            const ThermoPackage&  thermo,
                                            const std::string&    where,
                                            const PassThroughDeclaration* pt = nullptr);

//  The unit's own check, at its solve: throws the findings, if any.
void checkAcceptance(const UnitOperation&   unit,
                     const AcceptanceInlet& inlet,
                     const ThermoPackage&   thermo,
                     const std::string&     where,
                     const PassThroughDeclaration* pt = nullptr);

//  The same check for a unit that is not a `UnitOperation` (a choupoBatch
//  vessel judging its initial holdup): the contract and the type word given.
void checkAcceptance(const UnitAcceptance&  acc,
                     const std::string&     unitType,
                     const AcceptanceInlet& inlet,
                     const ThermoPackage&   thermo,
                     const std::string&     where);

//  The contracts of a list of types as JSON (`schema unitAcceptance-v1`):
//  the ONE writer behind `choupoSolve --describe-units` and
//  `choupoBatch --describe-units`.
void describeAcceptancesJson(
    std::ostream& os,
    const std::vector<std::pair<std::string, UnitAcceptance>>& units);

//  `choupoSolve --describe-units`: every registered type's acceptance as
//  JSON, the source the generated documentation will be written from.
void describeUnitsJson(std::ostream& os);

} // namespace Choupo
