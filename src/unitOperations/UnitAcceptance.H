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
    the pass-through fates it offers (none in slice A), and any further
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
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <functional>
#include <optional>
#include <ostream>
#include <string>
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
        aqueousSolventAndNonvolatileSolutes   // the solvent + `role nonvolatile`
    };
    struct Models
    {
        ModelsRule  rule = ModelsRule::everyComponent;
        std::string sentence = "every component the stream carries";
        std::string why;        // what happens to a component outside it
        std::string remedy;
    } models;

    //  The fates a declared pass-through may name (C188 item 5, section 5 of
    //  the record).  EMPTY = none offered; no unit offers one in slice A.
    std::vector<std::string> passThroughFates;

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

//  The word a ModelsRule is printed as (JSON, messages).
const char* modelsRuleWord(UnitAcceptance::ModelsRule r);

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
                                  const UnitAcceptance& acc);

//  THE ONE PLACE AN ACCEPTANCE REFUSAL IS WRITTEN.  Returns one finding per
//  violated clause (empty = accepted), each a complete sentence naming the
//  unit (`where`), the stream, the fact and the remedy.
std::vector<std::string> acceptanceFindings(const UnitAcceptance& acc,
                                            const std::string&    unitType,
                                            const AcceptanceInlet& inlet,
                                            const ThermoPackage&  thermo,
                                            const std::string&    where);

//  The unit's own check, at its solve: throws the findings, if any.
void checkAcceptance(const UnitOperation&   unit,
                     const AcceptanceInlet& inlet,
                     const ThermoPackage&   thermo,
                     const std::string&     where);

//  `choupoSolve --describe-units`: every registered type's acceptance as
//  JSON, the source the generated documentation will be written from.
void describeUnitsJson(std::ostream& os);

} // namespace Choupo
