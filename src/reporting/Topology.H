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
    Helper that derives the flowsheet topology (each unit's inlet and
    outlet stream names, and which streams are system feeds vs products)
    for the reports.  The PRIMARY source is the FLATTENED topology the
    solver recorded in SimulationResult::topology -- it is the truth for
    every case shape (flat, leaf, composite with named edges), already
    namespaced.  The flowsheetDict is consulted only for the root
    boundary{} declaration (boundary stream names) and as a fallback when
    no solved topology exists.  Shared by the stream-table and the mass-
    and energy-balance reports, which need to bucket streams per unit and
    globally.
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
    std::set<std::string>  feeds;      // consumed AND not produced (or boundary-declared)
    std::set<std::string>  products;   // produced AND not consumed
};

// Derive the topology for the reports.  The flattened solver topology
// (SimulationResult::topology) is the primary source -- one FlatUnit per real
// piece of equipment with its namespaced stream names, valid for flat, leaf
// and composite/named-edge cases alike.  The flowsheetDict fallback parses
// inline `units` / leaf nodes only (both forms mirror Flowsheet's reader),
// for the rare context with no solved topology.
inline Topology readTopology(const DictPtr& flowsheetDict,
                             const SimulationResult& result)
{
    Topology topo;

    if (!result.topology.empty())
    {
        for (const auto& fu : result.topology)
        {
            UnitIO io{ fu.name, fu.type, fu.ins, fu.outs };
            for (const auto& s : io.ins)  topo.consumed.insert(s);
            for (const auto& s : io.outs) topo.produced.insert(s);
            topo.units.push_back(std::move(io));
        }
    }
    else if (flowsheetDict->hasDictList("units"))
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

    // Feeds: graph inputs nobody produces; products: outputs nobody consumes.
    // Stream role is inferred from TOPOLOGY (the stream-state architecture).
    // ONE physical stream, ONE boundary entry: a stream copied onto a
    // boundary alias/label (BRINE.halite -> halite, or a root rename) is
    // listed under its BOUNDARY name -- the author's vocabulary -- never
    // under both names (that would double-count every global balance).
    std::map<std::string,std::string> aliasFor;   // identity -> boundary name
    for (const auto& [alias, src] : result.boundaryAliasOf)
        aliasFor[src] = alias;
    for (const auto& s : topo.consumed)
        if (!topo.produced.count(s)) topo.feeds.insert(s);
    for (const auto& s : topo.produced)
    {
        if (topo.consumed.count(s)) continue;
        const auto a = aliasFor.find(s);
        topo.products.insert(a == aliasFor.end() ? s : a->second);
    }

    // Root boundary{} declaration (fallback shapes only): with a solved
    // topology the boundary streams are already present under their real
    // or aliased names.
    if (result.topology.empty() && flowsheetDict->found("boundary"))
    {
        auto b = flowsheetDict->subDict("boundary");
        if (b->found("inlets"))
            for (const auto& s : b->lookupWordList("inlets"))
                topo.feeds.insert(s);
        if (b->found("outlets"))
            for (const auto& s : b->lookupWordList("outlets"))
                topo.products.insert(s);
    }

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
