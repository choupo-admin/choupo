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
Namespace
    Choupo::StreamOwnership

    THE ownership rule of the stream-state architecture (arch doc 2.4), in ONE
    place.  It used to live in three: main.cpp's sectorOwnedPaths, the
    converged/ writer's path assembly, and choupo-init0's pathOf -- and the
    third replica got it wrong on its first outing (it wrote
    0/SECTOR/unit/stream where the validator expected 0/SECTOR/stream, and the
    whole plant reported missing).  A rule copied three times is three rules.

    THE RULE (REPLACED 2026-09-07 -- Vitor's proposal; the previous rule stood
    from 2026-07-06).  A stream's state file lives at the LOWEST LEVEL of the
    case whose subtree contains EVERY ENDPOINT of that stream:

        <stateDir>/<LEVEL>/<base>      LEVEL = the common sector chain
        <stateDir>/MAIN/<base>         the DOMAIN'S OWN LEVEL, in a case that
                                       has sectors
        <stateDir>/<base>              a FLAT case: its units ARE the plant, so
                                       the domain's own level is the view root

    * base   = the LAST dot-segment of the stream's flattened name;
    * the ENDPOINTS are the units that produce or consume the stream, each
      contributing its STAMPED sector chain (`FlatUnit::sector`), PLUS the
      DOMAIN BOUNDARY -- contributing the empty chain, the domain's own level
      -- when nobody in the case produces the stream;
    * LEVEL = the longest common dotted-segment prefix of those chains.

    WHY IT REPLACES THE PRODUCER RULE, and it is a REPLACEMENT rather than a
    correction.  The old rule read: an internal or inter-sector stream belongs
    to its PRODUCING sector, an external inlet to its CONSUMING sector.  That
    picks ONE ENDPOINT OF AN EDGE and calls it the owner.  A unit is a NODE and
    belongs to a sector; a stream is an EDGE, and an edge between two subgraphs
    belongs to neither -- it belongs to the graph that contains both.  The
    producer rule was chosen for drill-in convenience and it produced a concrete
    failure: the flagship's `Magma` (CONCENTRATION -> DRYING) was filed inside
    one of its two endpoints, where the maintainer could not find it.

    WHAT THE BOUNDARY CONTRIBUTES, and why the two directions differ.  A stream
    NOBODY PRODUCES entered through the case's own boundary; its identity is a
    name declared at the domain's own level (`PlantSteam`, pushed into
    CONCENTRATION's `Steam` port), so the boundary is a genuine second endpoint
    and the file rises to that level.  A stream nobody CONSUMES is the opposite
    shape in this grammar: the plant does not declare a stream, it declares a
    LABEL for one the sector already owns (`Powder { from DRYING/DryPowder; }`),
    and a boundary alias is a label and not a second state file -- the rule
    below already skips it.  So a product stays with the sector that owns its
    identity.  Read symmetrically instead, every plant outlet would rise to the
    domain level too, and the flagship's `DRYING.Vapour` and
    `FERMENTATION.Vapour` would both resolve to `MAIN/Vapour` -- one canonical
    file for two streams, which `canonicalManifest` refuses by construction.

    THE SECTOR IS READ, NOT RECOVERED (2026-09-06).  Until that date the rule
    took the first dot-segment of the owning unit's NAME, which is the name
    identity the F2 contract bans and the very crossing the 2026-09-04 slice
    rejected for the design and costing surfaces: right only while every unit
    name happens to begin with its sector, and silently wrong for the first
    unit whose name carries a dot for another reason -- a stream filed under a
    sector that does not exist, with `converged/` written and nothing raised.
    The flatten seam already stamps the fact (`FlatUnit::sector`); this rule
    takes it from there, so the caller must supply it.  Splitting the STREAM
    name for its basename is a different act and stays: the qualified stream
    name is the flatten seam's own join, and its last segment is the file name
    by definition of the rule above.

    THE CHAIN IS READ WHOLE, not only its head.  The rule says LOWEST level and
    applies unchanged at any fractal depth, so a stream internal to `A.B` lives
    at `A/B/`.  NOTHING IN THE CORPUS EXERCISES THAT: no case nests a sector
    inside a sector today, so every chain here is one segment and this
    degenerates to the previous "flat under the top-level sector" shape.  The
    `converged/` per-sector VIEWS and the `design/` sheets keep the chain's HEAD
    (`topLevelSector`) -- a different decision, taken 2026-09-04 for a
    derivative, and left alone here; on a doubly nested case the two would
    differ, and no case makes them.

    This is a decision about the resolved TOPOLOGY, not about serialisation --
    which is why it takes the producer/consumer maps and not a Flowsheet or a
    SimulationResult: both the pre-solve world (choupo-init0, which only has
    the flattened unit dicts) and the post-solve world (the validator and the
    converged/ writer, which have the result topology) can build those two
    maps and MUST get the same answer.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/FlatUnit.H"            // FlatUnit (name / ins / outs) -- topology
                                     //   only; the result record is NOT needed

#include <filesystem>
#include <map>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo
{
namespace StreamOwnership
{

// unit name -> the sector chain the flatten seam STAMPED on it.  A unit the
// map does not name has no sector -- which is the plant root, not a lookup
// failure: a flat case supplies an empty map and every stream lands flat.
using SectorOfUnit = std::map<std::string, std::string>;

// The folder that renders the DOMAIN'S OWN LEVEL in a case that has sectors.
// ONE home for the literal.  Under the 2026-09-05 convention every CAPS folder
// of a fractal case is a level of its geography and a plant-level UNIT lives in
// `MAIN/`; the 2026-09-07 amendment makes `MAIN/` the domain's OWN level rather
// than a sector like the others, so plant-level STREAMS live there too.  A FLAT
// case has no geography at all -- its units ARE the plant -- and gains no
// folder, which is why this is applied only when some unit carries a stamp.
inline constexpr const char* domainLevelFolder = "MAIN";

// The longest common dotted-segment PREFIX of a set of stamped sector chains:
// the lowest level of the fractal whose subtree contains every one of them.
// Empty means the domain's own level (they share no sector, or one of them IS
// the domain root).  Segment-wise, never character-wise: `A.BC` and `A.BD`
// share the level `A`, not `A.B`.
inline std::string commonSectorPrefix(const std::vector<std::string>& chains)
{
    auto split = [](const std::string& s)
    {
        std::vector<std::string> v;
        std::string cur;
        for (char c : s)
        {
            if (c == '.') { v.push_back(cur); cur.clear(); }
            else            cur += c;
        }
        if (!cur.empty()) v.push_back(cur);
        return v;
    };

    if (chains.empty()) return {};
    std::vector<std::string> pref = split(chains.front());
    for (std::size_t i = 1; i < chains.size() && !pref.empty(); ++i)
    {
        const auto seg = split(chains[i]);
        std::size_t k = 0;
        while (k < pref.size() && k < seg.size() && pref[k] == seg[k]) ++k;
        pref.resize(k);
    }
    std::string out;
    for (const auto& s : pref) out += (out.empty() ? "" : ".") + s;
    return out;
}

// The relative state path (under 0/, converged/, an instant dir, ...) of one
// stream: the LOWEST LEVEL whose subtree contains every endpoint, from who
// produces and who consumes it in the FLAT topology and the STAMPED sector of
// each unit.  `caseHasSectors` decides how the domain's own level renders --
// `MAIN/` in a fractal case, the view root in a flat one.
inline std::filesystem::path ownershipPath(
    const std::string&                                     stream,
    const std::map<std::string, std::string>&              producerOf,
    const std::map<std::string, std::vector<std::string>>& consumersOf,
    const SectorOfUnit&                                    sectorOfUnit,
    bool                                                   caseHasSectors)
{
    const std::string base = stream.substr(stream.rfind('.') + 1);

    auto chainOf = [&](const std::string& unit) -> std::string
    {
        auto it = sectorOfUnit.find(unit);
        return (it == sectorOfUnit.end()) ? std::string() : it->second;
    };

    std::vector<std::string> chains;
    auto pit = producerOf.find(stream);
    if (pit != producerOf.end())
        chains.push_back(chainOf(pit->second));
    else
        //  THE DOMAIN BOUNDARY is the other endpoint: nobody in this case
        //  produces the stream, so it entered through the case's own boundary,
        //  which sits at the domain's own level.  (A stream nobody CONSUMES is
        //  NOT the mirror of this -- see the header.)
        chains.emplace_back();

    auto cit = consumersOf.find(stream);
    if (cit != consumersOf.end())
        for (const auto& c : cit->second) chains.push_back(chainOf(c));

    const std::string level = commonSectorPrefix(chains);
    if (level.empty())
        return caseHasSectors
             ? std::filesystem::path(domainLevelFolder) / base
             : std::filesystem::path(base);

    std::filesystem::path p;
    std::string seg;
    for (char c : level)
    {
        if (c == '.') { p /= seg; seg.clear(); }
        else            seg += c;
    }
    if (!seg.empty()) p /= seg;
    return p / base;
}

// The CANONICAL MANIFEST (design forum #83): streamId -> relative state path
// for a WHOLE domain, built in ONE place.  The writer (converged/), the
// completeness validator, and the pre-solve 0/ reader all call THIS -- so
// there is exactly one understanding of which file carries which stream.
// It subsumes the two alias exclusions that used to live only in
// choupoSolve's sectorOwnedPaths (a second home the reader would otherwise
// have re-implemented):
//   * a boundary alias (a parent's RENAME of a member outlet) is a label,
//     not a second state file -- skipped;
//   * a post-solve REPORT label (the bare copy the relabel pass creates for
//     an unambiguous qualified stream) rides the same explicit set.
// A BASENAME never participates in identity (forum #87-P0): `A/feed` and
// `B/feed` are two different streams, and a TOP-LEVEL `feed` next to a
// sector-internal `A.feed` is two streams too -- the first cut inferred
// aliases by basename and silently dropped the legitimate top-level twin
// from the manifest (its own inlet reported ORPHAN).  Only the EXPLICIT
// alias set decides.  The one true collision -- two stream IDs resolving to
// the SAME canonical path -- is an ownership/topology error and throws,
// naming both IDs.
inline std::map<std::string, std::filesystem::path>
canonicalManifest(const std::vector<FlatUnit>& topology,
                  const std::set<std::string>& streamNames,
                  const std::set<std::string>& boundaryAliases)
{
    std::map<std::string, std::string>              producerOf;
    std::map<std::string, std::vector<std::string>> consumersOf;
    SectorOfUnit sectorOfUnit;
    for (const auto& u : topology)
        for (const auto& o : u.outs) producerOf[o] = u.name;
    //  EVERY consumer, not the first one.  The level is a property of the
    //  whole endpoint set: a stream two sectors read rises to their common
    //  parent, and a rule that looked only at the first reader would file it
    //  inside whichever sector happens to be declared earlier.
    for (const auto& u : topology)
        for (const auto& i : u.ins) consumersOf[i].push_back(u.name);
    for (const auto& u : topology)
        if (!u.sector.empty()) sectorOfUnit[u.name] = u.sector;
    const bool caseHasSectors = !sectorOfUnit.empty();

    std::map<std::string, std::filesystem::path> manifest;
    std::map<std::string, std::string> idOfPath;   // collision naming
    for (const auto& name : streamNames)
    {
        if (boundaryAliases.count(name)) continue;   // an EXPLICIT label, no file
        const auto p = ownershipPath(name, producerOf, consumersOf,
                                     sectorOfUnit, caseHasSectors);
        const auto [it, fresh] = idOfPath.emplace(p.generic_string(), name);
        if (!fresh)
            throw std::runtime_error("StreamOwnership: streams '" + it->second
                + "' and '" + name + "' both resolve to the state path '"
                + p.generic_string() + "' -- two graph stream IDs cannot share "
                "one canonical file (an ownership/topology error).");
        manifest[name] = p;
    }
    return manifest;
}

} // namespace StreamOwnership
} // namespace Choupo
