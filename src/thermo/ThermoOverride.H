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
    The ONE typed merge for a per-unit / per-op `thermo {}` override
    (Codex-ratified 2026-07-18): the fragment is a PARTIAL, TYPED piece of
    the thermophysicalPropertySystem grammar, applied onto the node's
    EFFECTIVE authored v2 system:

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
      - the FLAT v1 override keys (`activityModel`, `equationOfState`,
        flat transport slots) are RETIRED -- refused with the migration
        message, never silently accepted.
      - equilibrium: if the fragment declares a DIFFERENT formulation, the
        whole block REPLACES the base's (a complete new world -- no hybrid
        remains of the previous formulation; incompleteness fails loudly in
        the builder).  Same/undeclared formulation -> per-SLOT replacement
        (liquid / vapour / aqueous / equationOfState / liquidPhases), each
        announced.
      - caloric / volumetric / transport / pureFluids: replace-whole per
        block, announced.
      - an unknown fragment key REFUSES loudly.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "thermo/ThermoAnnounce.H"

#include <iostream>
#include <stdexcept>
#include <string>

namespace Choupo {

inline DictPtr mergeThermoOverride(const DictPtr& effectiveAuthored,
                                   const DictPtr& fragment,
                                   const std::string& who)
{
    // ---- fragment validation (the anti-flat gate) -----------------------
    for (const auto& k : fragment->keys())
    {
        if (k == "activityModel" || k == "equationOfState")
            throw std::runtime_error(who + ": the FLAT `thermo { " + k
                + " {...} }` override form is RETIRED (2026-07-18) -- the"
                " override is a typed v2 fragment.  Write it as `thermo {"
                " equilibrium { "
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
        if (k == "binaryPairsBase" || k == "activeComponents")
            continue;   // ENGINE-injected per-node plumbing (the flattener's
                        // nearest-owner pair home / pair-domain projection)
                        // -- passed through below, never authored refusals.
        if (k != "equilibrium" && k != "caloric" && k != "volumetric"
            && k != "transport" && k != "pureFluids")
            throw std::runtime_error(who + ": unknown thermo{} fragment key '"
                + k + "'.  A fragment carries the system grammar's own"
                " blocks: equilibrium / caloric / volumetric / transport /"
                " pureFluids.");
    }
    if (fragment->found("transport"))
        for (const auto& tk : fragment->subDict("transport")->keys())
            if (tk != "vapour" && tk != "liquid" && tk != "interface")
                throw std::runtime_error(who + ": thermo{} transport override"
                    " key '" + tk + "' is the FLAT hierarchy -- the fragment"
                    " uses the authored phase-structured form: transport {"
                    " vapour{...} liquid{...} interface{...} }.");

    auto merged = effectiveAuthored->deepCopy();
    auto note = [&](const std::string& slot, const std::string& what)
    {
        if (thermoAnnounce())
            std::cout << "  [thermo-override] " << who << ": " << slot
                      << " <- " << what << " (base: inherited system)\n";
    };

    for (const auto& k : fragment->keys())
    {
        if (k == "binaryPairsBase" || k == "activeComponents")
        {
            merged->insert(k, fragment->entryValue(k));   // plumbing rides
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
            if (sk != "liquid" && sk != "vapour" && sk != "aqueous"
                && sk != "equationOfState" && sk != "liquidPhases")
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
