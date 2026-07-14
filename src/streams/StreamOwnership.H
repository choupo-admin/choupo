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

    THE RULE.  A stream file lives FLAT under its owning top-level SECTOR:

        <stateDir>/<SECTOR>/<base>      when the owning unit is sector-qualified
        <stateDir>/<base>               when the owning unit is top-level (flat)

    * base   = the LAST dot-segment of the stream's flattened name;
    * SECTOR = the FIRST dot-segment of the OWNING unit's flattened name --
      a unit is NOT a subdomain, so nothing ever nests under a unit path;
    * the owning unit is the PRODUCER; a stream nobody produces (a domain
      inlet) is owned by its first CONSUMER.

    This is a decision about the resolved TOPOLOGY, not about serialisation --
    which is why it takes the producer/consumer maps and not a Flowsheet or a
    SimulationResult: both the pre-solve world (choupo-init0, which only has
    the flattened unit dicts) and the post-solve world (the validator and the
    converged/ writer, which have the result topology) can build those two
    maps and MUST get the same answer.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/SimulationResult.H"   // FlatUnit (name / ins / outs)

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

// The first dot-segment of a flattened unit name -- its top-level SECTOR;
// empty for a flat (top-level) unit.
inline std::string sectorOf(const std::string& unitName)
{
    const auto d = unitName.find('.');
    return d == std::string::npos ? std::string() : unitName.substr(0, d);
}

// The relative state path (under 0/, converged/, an instant dir, ...) of one
// stream, given who produces and who first consumes it in the FLAT topology.
inline std::filesystem::path ownershipPath(
    const std::string&                        stream,
    const std::map<std::string, std::string>& producerOf,
    const std::map<std::string, std::string>& firstConsumerOf)
{
    const std::string base = stream.substr(stream.rfind('.') + 1);

    auto pit = producerOf.find(stream);
    const std::string owner =
        (pit != producerOf.end()) ? pit->second
        : (firstConsumerOf.count(stream) ? firstConsumerOf.at(stream)
                                         : std::string());

    const std::string sector = sectorOf(owner);
    return sector.empty() ? std::filesystem::path(base)
                          : std::filesystem::path(sector) / base;
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
    std::map<std::string, std::string> producerOf, firstConsumerOf;
    for (const auto& u : topology)
        for (const auto& o : u.outs) producerOf[o] = u.name;
    for (const auto& u : topology)
        for (const auto& i : u.ins)
            if (!firstConsumerOf.count(i)) firstConsumerOf[i] = u.name;

    std::map<std::string, std::filesystem::path> manifest;
    std::map<std::string, std::string> idOfPath;   // collision naming
    for (const auto& name : streamNames)
    {
        if (boundaryAliases.count(name)) continue;   // an EXPLICIT label, no file
        const auto p = ownershipPath(name, producerOf, firstConsumerOf);
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
