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
    src/reporting/Topology.H

Description
    Helper that reads the flowsheet topology (each unit's inlet and
    outlet stream names, and which streams are system feeds vs products)
    from a flowsheetDict.  Shared by the mass- and energy-balance
    reports, which need to bucket streams per unit and globally.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/SimulationResult.H"

#include <set>
#include <string>
#include <vector>

namespace Choupo {
namespace reporting {

struct UnitIO
{
    std::string              name;
    std::string              type;
    std::vector<std::string> ins;
    std::vector<std::string> outs;
};

struct Topology
{
    std::vector<UnitIO>    units;
    std::set<std::string>  consumed;   // any stream that is some unit's input
    std::set<std::string>  produced;   // any stream that is some unit's output
    std::set<std::string>  feeds;      // consumed AND not produced (or legacy-declared)
    std::set<std::string>  products;   // produced AND not consumed
};

// Parse the flowsheetDict.  Handles both `in <name>;` (single) and
// `inputs (a b );` (list) forms, mirroring Flowsheet's own reader.
inline Topology readTopology(const DictPtr& flowsheetDict)
{
    Topology topo;

    // Declared source streams (the `streams {... }` block).
    std::set<std::string> declared;
    if (flowsheetDict->found("streams"))
    {
        auto streamsDict = flowsheetDict->subDict("streams");
        for (const auto& k : streamsDict->keys()) declared.insert(k);
    }

    // INLINE units only (a flat case).  A composite lists folder members under
    // `units`/`sectors` as WORDS -- skip that here (the flattened topology is
    // reported elsewhere), exactly as an absent `units` was skipped.
    if (flowsheetDict->hasDictList("units"))
    {
        for (const auto& u : flowsheetDict->lookupDictList("units"))
        {
            UnitIO io;
            io.name = u->lookupWordOrDefault("name", "?");
            io.type = u->lookupWordOrDefault("type", "");
            if (u->found("inputs"))
                io.ins = u->lookupWordList("inputs");
            else if (u->found("in"))
                io.ins = { u->lookupWord("in") };
            if (u->found("outputs"))
                io.outs = u->lookupWordList("outputs");

            for (const auto& s : io.ins)  topo.consumed.insert(s);
            for (const auto& s : io.outs) topo.produced.insert(s);
            topo.units.push_back(std::move(io));
        }
    }
    else if (flowsheetDict->found("type"))
    {
        // Leaf node (fractal): one unit defined directly; its interface
        // is in `boundary { inlets; outlets }`.  Mirror Flowsheet's synthesis.
        UnitIO io;
        io.name = flowsheetDict->lookupWordOrDefault("name", "node");
        io.type = flowsheetDict->lookupWordOrDefault("type", "");
        if (flowsheetDict->found("boundary"))
        {
            auto b = flowsheetDict->subDict("boundary");
            if (b->found("inlets"))  io.ins  = b->lookupWordList("inlets");
            if (b->found("outlets")) io.outs = b->lookupWordList("outlets");
        }
        for (const auto& s : io.ins)  topo.consumed.insert(s);
        for (const auto& s : io.outs) topo.produced.insert(s);
        topo.units.push_back(std::move(io));
    }
    else if (flowsheetDict->found("sectors"))
    {
        // Composite node (fractal step 2): the system boundary IS the node's
        // `boundary` --- feeds = inlets, products = outlets.  The global mass
        // balance only needs that (per-child detail would re-flatten the
        // children, which the solver already did).
        if (flowsheetDict->found("boundary"))
        {
            auto b = flowsheetDict->subDict("boundary");
            if (b->found("inlets"))
                for (const auto& s : b->lookupWordList("inlets")) topo.feeds.insert(s);
            if (b->found("outlets"))
                for (const auto& s : b->lookupWordList("outlets")) topo.products.insert(s);
        }
        return topo;   // skip the generic derivation below
    }

    // Feeds: graph inputs that nobody produces (true system inlets).  Current
    // cases keep source state in 0/, not in a legacy flowsheetDict streams{}
    // block, so consumed-minus-produced is the canonical topology rule.
    for (const auto& s : topo.consumed)
        if (!topo.produced.count(s)) topo.feeds.insert(s);
    // Preserve legacy declared sources, including an intentionally unconsumed
    // boundary feed used by a report-only case.
    for (const auto& s : declared)
        if (!topo.produced.count(s)) topo.feeds.insert(s);
    // Products: produced but consumed by nobody (true system outlets).
    for (const auto& s : topo.produced)
        if (!topo.consumed.count(s)) topo.products.insert(s);

    return topo;
}

// The unit list a per-unit report should iterate.  Prefers the FLATTENED
// topology recorded by the solver (so a composite plant yields its real,
// namespaced equipment); falls back to the units parsed straight from the
// flowsheetDict (units-list / leaf cases, where the two coincide).
inline std::vector<UnitIO> resolveUnits(const Topology& topo,
                                        const SimulationResult& result)
{
    if (!topo.units.empty()) return topo.units;
    std::vector<UnitIO> v;
    v.reserve(result.topology.size());
    for (const auto& fu : result.topology)
        v.push_back(UnitIO{ fu.name, fu.type, fu.ins, fu.outs });
    return v;
}

} // namespace reporting
} // namespace Choupo
