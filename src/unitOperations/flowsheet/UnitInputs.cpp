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

\*---------------------------------------------------------------------------*/

#include "unitOperations/flowsheet/UnitInputs.H"

#include <map>
#include <memory>
#include <stdexcept>
#include <variant>
#include <vector>

namespace Choupo {

// ---------------------------------------------------------------------------
//  Helpers for building a stream's sub-dict (used by Mixer multi-input)
// ---------------------------------------------------------------------------
DictPtr streamToDict(const ProcessStream& s, const ThermoPackage& thermo)
{
    auto out = std::make_shared<Dictionary>(s.name);
    out->insert("F", s.F);
    out->insert("T", s.T);
    out->insert("P", s.P);
    // Utility identity travels with the stream: a unit fed by a categorised
    // carrier (heating steam, cooling water) can declare its RETURN leg as
    // the same utility (e.g. the evaporator condensate).
    if (!s.category.empty()) out->insert("category", s.category);
    out->insert("vf", s.vf);
    //  THE SAME TWO FACTS THE SINGLE-INLET `feed {}` BLOCK ALREADY CARRIES
    //  (see buildAugmentedDict below).  A MULTI-inlet unit got neither, so it
    //  could not tell an AUTHORED pin from an upstream answer (R-E2: a duty
    //  may price a declared constraint, never an inferred one) and a refusal
    //  it raised could not say WHICH of its inlets was at fault.  Measured on
    //  the evaporator, whose chest steam is inlet 2 of 2.  Read only by units
    //  that ask; a unit cannot be harmed by a key it does not read.
    out->insert("phasePinned", s.phasePinned ? 1.0 : 0.0);
    out->insert("streamName", s.name);
    auto cd = std::make_shared<Dictionary>("composition");
    for (std::size_t i = 0; i < thermo.n(); ++i)
        cd->insert(thermo.comp(i).name(), s.z[i]);
    out->insert("composition", cd);

    // ---- Solid phase: serialise s[] (MOLAR, internal) + PSD ----
    bool hasSolid = false;
    for (auto v : s.s) if (v > 0.0) { hasSolid = true; break; }
    if (hasSolid || !s.psd.empty())
    {
        auto sol = std::make_shared<Dictionary>("solids");
        auto sf  = std::make_shared<Dictionary>("solidMolarFlows");
        for (std::size_t i = 0; i < thermo.n() && i < s.s.size(); ++i)
            if (s.s[i] != 0.0) sf->insert(thermo.comp(i).name(), s.s[i]);
        sol->insert("solidMolarFlows", sf);
        if (!s.psd.empty())
        {
            sol->insert("diameters", s.psd.diameter);
            sol->insert("massFractions", s.psd.massFrac);
        }
        out->insert("solids", sol);
    }
    return out;
}

// ---------------------------------------------------------------------------
//  Augment a unit's user dict with feed/composition (single-input) or
//  inputStreams (multi-input), solver defaults, and resolved reaction ref.
// ---------------------------------------------------------------------------
DictPtr buildAugmentedDict(const DictPtr&                          udict,
    const std::string&                      utype,
    const std::map<std::string,ProcessStream>& streams,
    const ThermoPackage&                    thermo,
    const DictPtr&                          solverDict,
    const DictPtr&                          reactionsDict,
    const DictPtr&                          dryingDict,
    const DictPtr&                          crystDict)
{
    auto out = std::make_shared<Dictionary>(udict->lookupWord("name"));
    out->setSource("flowsheet-augmented");

    // 1.  Copy user entries (skip meta and reserved names)
    for (const auto& key : udict->keys())
    {
        if (key == "name" || key == "type"
         || key == "in"   || key == "inputs" || key == "outputs"
         || key == "feed" || key == "composition" || key == "inputStreams"
         || key == "energyInputs" || key == "energyOutputs")  // wires
            continue;
        out->insert(key, udict->entryValue(key));
    }

    // Make the DECLARED output names visible to the unit op: a few ops adapt
    // their product set to how many outputs the case declares (e.g. an
    // equilibrium crystalliser gives ONE `magma` or TWO `crystals`+`motherLiquor`).
    if (udict->found("outputs"))
        out->insert("outputs", udict->entryValue("outputs"));

    // 2.  Merge solver defaults
    if (solverDict && solverDict->found(utype))
    {
        auto sd = solverDict->subDict(utype);
        for (const auto& key : sd->keys())
            if (!out->found(key))
                out->insert(key, sd->entryValue(key));
    }

    // 3.  Resolve named-reaction reference
    if (out->found("reaction"))
    {
        const auto& v = out->entryValue("reaction");
        if (std::holds_alternative<std::string>(v))
        {
            const std::string rxnName = std::get<std::string>(v);
            if (!reactionsDict || !reactionsDict->found(rxnName))
                throw std::runtime_error("Flowsheet: reaction '"
                    + rxnName + "' not in constant/reactions");
            out->insert("reaction", reactionsDict->entryValue(rxnName));
        }
    }

    // 3a. Resolve a named-reaction LIST --- `reactions ( r1 r2 ... );` --- the ONE
    //     multi-reaction grammar across the engine (the batch/dynamic reactors
    //     already take it).  Each name is looked up in constant/reactions and the
    //     resolved sub-dict is carried in a dict LIST, tagged with its own name so
    //     a reactor can label per-reaction KPIs.  Stoichiometry lives in the
    //     reactions library, never repeated inside each unit.
    if (out->found("reactions") && !out->hasDictList("reactions"))
    {
        const auto names = out->lookupWordList("reactions");
        std::vector<DictPtr> resolved;
        resolved.reserve(names.size());
        for (const auto& rn : names)
        {
            if (!reactionsDict || !reactionsDict->found(rn))
                throw std::runtime_error("Flowsheet: reaction '" + rn
                    + "' (in a `reactions ( ... )` list) not in constant/reactions");
            auto rd = reactionsDict->subDict(rn);
            if (!rd->found("name")) rd->insert("name", EntryValue(rn));   // for KPI labels
            resolved.push_back(rd);
        }
        out->insert("reactions", EntryValue(resolved));
    }

    // 3b. Resolve named drying-curve reference (drying KINETICS --- the
    //     characteristic drying curve + critical moisture --- kept separate
    //     from the material's equilibrium sorption isotherm, exactly like a
    //     reaction's kinetics is kept in constant/reactions).
    if (out->found("dryingCurve"))
    {
        const auto& v = out->entryValue("dryingCurve");
        if (std::holds_alternative<std::string>(v))
        {
            const std::string name = std::get<std::string>(v);
            if (!dryingDict || !dryingDict->found(name))
                throw std::runtime_error("Flowsheet: drying curve '"
                    + name + "' not in constant/dryingKinetics");
            out->insert("dryingCurve", dryingDict->entryValue(name));
        }
    }

    // 3c. Resolve named crystallisation-kinetics reference (the nucleation /
    //     growth kinetics that set the PSD --- kept separate from the
    //     solute's equilibrium solubility curve on the.dat, exactly like a
    //     reaction's kinetics live in constant/reactions).
    if (out->found("crystallisation"))
    {
        const auto& v = out->entryValue("crystallisation");
        if (std::holds_alternative<std::string>(v))
        {
            const std::string name = std::get<std::string>(v);
            if (!crystDict || !crystDict->found(name))
                throw std::runtime_error("Flowsheet: crystallisation kinetics '"
                    + name + "' not in constant/crystallisation");
            out->insert("crystallisation", crystDict->entryValue(name));
        }
    }

    // 4.  Inject inputs (single `in` or multi `inputs (...)`)
    //
    //  THE WRITER NORMALISES AND THE READER DID NOT, and that asymmetry was a
    //  dead end for anyone authoring a case by hand.  `emitFlowsheet` above
    //  writes a single input as `in` and several as `inputs`, so the engine
    //  already treats `inputs ( x )` and `in x;` as one topology fact.  The
    //  reader treated them as two: `inputs` injected only `inputStreams`,
    //  while every single-inlet unit reads `feed {}` and `composition {}`.
    //
    //  So a case declaring `inputs ( feed )` on a reactor -- which 65 corpus
    //  cases' spelling makes look right, and which the flowsheet accepts
    //  without complaint -- died three layers down with "Dictionary
    //  'reactor': missing sub-dictionary 'feed'": a key the author never
    //  wrote, that appears in no document for that unit, and that names the
    //  consequence instead of the cause.  Found by authoring a case as a
    //  student would.
    //
    //  A ONE-ELEMENT `inputs` NOW GETS BOTH INJECTIONS.  Not a silent crutch
    //  and not an approximation: the two spellings denote the same single
    //  inlet, the engine's own writer says so, and a unit cannot be harmed by
    //  a key it does not read.  Multi-inlet `inputs` is unchanged -- there is
    //  no single feed to name, and a unit that wants one must say which.
    const bool singleInputs = udict->found("inputs")
                           && udict->lookupWordList("inputs").size() == 1;
    if (udict->found("inputs"))
    {
        auto names = udict->lookupWordList("inputs");
        std::vector<DictPtr> dicts;
        for (const auto& n : names)
        {
            if (streams.find(n) == streams.end())
                throw std::runtime_error("Flowsheet: input stream '" + n
                    + "' not in registry");
            dicts.push_back(streamToDict(streams.at(n), thermo));
        }
        out->insert("inputStreams", dicts);
    }
    if (udict->found("in") || singleInputs)
    {
        const std::string inName = singleInputs
                                 ? udict->lookupWordList("inputs").front()
                                 : udict->lookupWord("in");
        if (streams.find(inName) == streams.end())
            throw std::runtime_error("Flowsheet: input stream '" + inName
                + "' not in registry");
        const auto& s = streams.at(inName);

        auto feed = std::make_shared<Dictionary>("feed");
        feed->insert("F",     s.F);
        feed->insert("T",     s.T);
        feed->insert("Tfeed", s.T);
        feed->insert("P",     s.P);
        feed->insert("Pfeed", s.P);
        out->insert("feed", feed);

        feed->insert("vf", s.vf);
        //  Whether that vf is an AUTHORED pin or this unit's upstream answer
        //  (R-E2): a duty may price a declared constraint, never an inferred
        //  one.  Carried as a scalar because the feed dict is scalar-valued.
        feed->insert("phasePinned", s.phasePinned ? 1.0 : 0.0);
        //  WHICH stream this is.  A refusal that says "your dict contradicts
        //  the feed" and cannot say WHICH feed sends the reader hunting; the
        //  unit dict drops `in` when it is composed (it is a wire, not a
        //  parameter), so the name would otherwise be unreachable from inside
        //  a unit op.  Read only to write messages -- no physics depends on it.
        feed->insert("streamName", s.name);

        auto comp = std::make_shared<Dictionary>("composition");
        for (std::size_t i = 0; i < thermo.n(); ++i)
            comp->insert(thermo.comp(i).name(), s.z[i]);
        out->insert("composition", comp);

        // Solid phase: serialise s[] (MOLAR) + PSD for the unit.
        bool hasSolid = false;
        for (auto v : s.s) if (v > 0.0) { hasSolid = true; break; }
        if (hasSolid || !s.psd.empty())
        {
            auto sol = std::make_shared<Dictionary>("solids");
            auto sf  = std::make_shared<Dictionary>("solidMolarFlows");
            for (std::size_t i = 0; i < thermo.n() && i < s.s.size(); ++i)
                if (s.s[i] != 0.0) sf->insert(thermo.comp(i).name(), s.s[i]);
            sol->insert("solidMolarFlows", sf);
            if (!s.psd.empty())
            {
                sol->insert("diameters", s.psd.diameter);
                sol->insert("massFractions", s.psd.massFrac);
            }
            out->insert("solids", sol);
        }
    }
    // No `in` and no `inputs`: legal for passive shaft sinks like
    // `electricLoad` that cross only an energy wire.  The augmented
    // dict simply carries no inputStreams / feed block; the unit's
    // solve() reads its KPI inputs through the wire-injected
    // `operation.<target>` keys.

    return out;
}

} // namespace Choupo
