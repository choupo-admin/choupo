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
    src/thermo/ThermoOverride.H

Description
    The ONE typed merge for a per-unit / per-op `thermo {}` override: the
    fragment is a PARTIAL, TYPED piece of the thermophysicalPropertySystem
    grammar, applied onto the node's EFFECTIVE authored system:

        root authored v2
          -> resolvePropertyContext (inherits + nearest owner)   [when a
             node context exists]
          -> effective authored v2 of the node
          -> mergeThermoOverride(effective, fragment)            [HERE]
          -> components replaced by the built GLOBAL list        [caller]
          -> build(merged, db, nodeChem)                         [caller]

    Contract:
      - fragment keys allowed: equilibrium / caloric / volumetric /
        transport / pureFluids -- the SAME paths the system grammar uses.
      - `components`, `chemistry`, `recordType`, `schemaVersion` are
        FORBIDDEN in a fragment (components stay global; chemistry lives in
        constant/chemistryDict).
      - a bare `activityModel` / `equationOfState` / flat transport key at
        the fragment top is not part of the grammar -- refused with the
        rewrite shown, never silently accepted.
      - equilibrium: if the fragment declares a DIFFERENT formulation, the
        whole block REPLACES the base's (a complete new world -- no hybrid
        remains of the previous formulation; incompleteness fails loudly in
        the builder).  Same/undeclared formulation -> per-SLOT replacement
        (liquid / vapour / aqueous / equationOfState / liquidPhases), each
        announced.
      - transport: THE PROPERTY BLOCK is the atom (DEV.md 4c C398, RULED,
        point 2): `transport { liquid { viscosity {...} } }` replaces
        transport.liquid.viscosity and keeps every other property block of
        the base.  When the base declares no `transport` at all the
        fragment's block arrives whole, exactly as before, and is announced
        as before.  The names a block may be spelt with are one table
        (TransportGrammar.H).
      - volumetric: the atom is the PHASE block (volumetric.<phase>); a
        fragment may not carry one yet -- the measurements it declares are
        read into ONE process-wide table (liquidProperty::
        MeasurementDeclarations, Measured.cpp), so a second package would
        replace the system's for every unit.  Refused by name.
      - caloric / pureFluids: replace-whole per block, announced.
      - the merged system carries no `variants` block (a resolved variant
        is a complete system, not a table to choose from).
      - an unknown fragment key REFUSES loudly.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "thermo/PropertyVariants.H"
#include "thermo/ThermoAnnounce.H"
#include "thermo/TransportGrammar.H"

#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>

namespace Choupo {

inline DictPtr mergeThermoOverride(const DictPtr& effectiveAuthored,
                                   const DictPtr& fragment,
                                   const std::string& who)
{
    // ---- fragment validation --------------------------------------------
    for (const auto& k : fragment->keys())
    {
        if (k == "activityModel" || k == "equationOfState")
            throw std::runtime_error(who + ": `thermo { " + k
                + " {...} }` is not the override grammar -- the override is"
                " a typed fragment of the system grammar.  Write it as"
                " `thermo { equilibrium { "
                + std::string(k == "activityModel"
                    ? "liquid { activityModel {...} }"
                    : "vapour { fugacityModel <word>; } (gamma-phi) or"
                      " equationOfState {...} (phi-phi)")
                + " } }`.");
        if (k == "components" || k == "chemistry" || k == "recordType"
            || k == "schemaVersion")
            throw std::runtime_error(who + ": `" + k + "` is FORBIDDEN in a"
                " thermo{} override fragment -- components stay GLOBAL and"
                " the active chemistry lives in constant/chemistryDict.");
        if (k == "binaryPairsBase" || k == "activeComponents"
            || k == propertyVariants::selectedKey())
            continue;   // ENGINE-injected per-node plumbing (the flattener's
                        // nearest-owner pair home / pair-domain projection,
                        // and the name of a selected variant) -- passed
                        // through below, never authored refusals.
        if (k != "equilibrium" && k != "caloric" && k != "volumetric"
            && k != "transport" && k != "pureFluids")
            throw std::runtime_error(who + ": unknown thermo{} fragment key '"
                + k + "'.  A fragment carries the system grammar's own"
                " blocks: equilibrium / caloric / volumetric / transport /"
                " pureFluids.");
    }
    if (fragment->found("transport"))
        transportGrammar::validate(fragment->subDict("transport"),
                                   who + ": thermo{} transport");
    if (fragment->found("volumetric"))
        throw std::runtime_error(who + ": a `volumetric` block in a thermo{}"
            " fragment or a variant cannot be honoured yet -- the liquid-density"
            " measurements are one table per run until slice (c) of C398"
            " (thermo/liquidProperty/Measured.cpp, MeasurementDeclarations), so"
            " a second package would replace the system's measurements for"
            " every unit of the run.  Declare the measurement in the system's"
            " own `volumetric` block.");

    auto merged = effectiveAuthored->deepCopy();
    merged->erase("variants");
    auto note = [&](const std::string& slot, const std::string& what)
    {
        if (thermoAnnounce())
            std::cout << "  [thermo-override] " << who << ": " << slot
                      << " <- " << what << " (base: inherited system)\n";
    };

    for (const auto& k : fragment->keys())
    {
        if (k == propertyVariants::selectedKey())
            continue;   // the selection's name: read by the view, not a block
        if (k == "binaryPairsBase" || k == "activeComponents")
        {
            merged->insert(k, fragment->entryValue(k));   // plumbing rides
            continue;
        }
        if (k == "transport" && merged->found("transport")
            && std::holds_alternative<DictPtr>(merged->entryValue("transport")))
        {
            //  THE ATOM IS THE PROPERTY BLOCK (C398 point 2): each block the
            //  fragment declares replaces the base's block of that name; the
            //  base's other blocks stay.  The fragment's blocks are inserted
            //  as they are (shared, not copied), so the reads the builder
            //  makes through them reach the authored dict and the unread-key
            //  audit; nothing here writes into them.  A base WITHOUT a
            //  transport block takes the fragment's whole (below), which is
            //  the same result and the same announcement as before.
            auto mT = merged->subDict("transport");
            auto fT = fragment->subDict("transport");
            for (const auto& ph : fT->keys())
            {
                auto fPh = fT->subDict(ph);
                DictPtr mPh;
                if (mT->found(ph)
                    && std::holds_alternative<DictPtr>(mT->entryValue(ph)))
                    mPh = mT->subDict(ph);
                else
                {
                    mPh = std::make_shared<Dictionary>(ph);
                    mT->insert(ph, EntryValue(mPh));
                }
                for (const auto& pr : fPh->keys())
                {
                    mPh->insert(pr, fPh->entryValue(pr));
                    note("transport." + ph + "." + pr,
                         "LOCAL override property block");
                }
            }
            continue;
        }
        if (k != "equilibrium")
        {
            merged->insert(k, fragment->entryValue(k));   // replace-whole
            note(k, "LOCAL override block");
            continue;
        }
        auto fEq = fragment->subDict("equilibrium");
        auto bEq = merged->subDict("equilibrium");
        const std::string bForm = bEq->lookupWordOrDefault("formulation", "");
        const std::string fForm = fEq->lookupWordOrDefault("formulation", bForm);
        if (fForm != bForm)
        {
            // A NEW world: the fragment must be the COMPLETE equilibrium for
            // it -- replace whole (hybrid remains of the old formulation are
            // exactly the G7 non-physics this refuses to interleave).
            merged->insert("equilibrium", fragment->entryValue("equilibrium"));
            note("equilibrium", "LOCAL override, WHOLE block (formulation "
                 + bForm + " -> " + fForm + ")");
            continue;
        }
        for (const auto& sk : fEq->keys())
        {
            if (sk == "formulation") continue;
            //  `vaporPressure` holds the case's pins of the records'
            //  vapour-pressure laws (C398 slice (b)); replaced whole.
            if (sk != "liquid" && sk != "vapour" && sk != "aqueous"
                && sk != "equationOfState" && sk != "liquidPhases"
                && sk != "vaporPressure")
                throw std::runtime_error(who + ": unknown equilibrium slot '"
                    + sk + "' in the thermo{} fragment.");
            const bool phaseSlot = (sk == "liquid" || sk == "vapour"
                                    || sk == "aqueous");
            if (phaseSlot && bEq->found(sk)
                && std::holds_alternative<DictPtr>(bEq->entryValue(sk))
                && std::holds_alternative<DictPtr>(fEq->entryValue(sk)))
            {
                // Partial SLOT override: replace per key inside the phase
                // block (`vapour { fugacityModel SRK; }` keeps the base's
                // other vapour keys).
                auto bPh = bEq->subDict(sk);
                for (const auto& pk : fEq->subDict(sk)->keys())
                {
                    bPh->insert(pk, fEq->subDict(sk)->entryValue(pk));
                    note("equilibrium." + sk + "." + pk,
                         "LOCAL override slot");
                }
            }
            else
            {
                bEq->insert(sk, fEq->entryValue(sk));     // replace-whole
                note("equilibrium." + sk, "LOCAL override slot");
            }
        }
    }
    return merged;
}

} // namespace Choupo
