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
    src/streams/UtilityCircuit.cpp

Description
    THE SEPARATION IS PRESENTATION, NEVER VALIDATION SCOPE.  Excluding a
    declared utility from the *presented* process material summary must never
    exclude it from a physical check -- the per-unit balances, the element
    balance, the energy balance and every explicitly modelled material
    boundary keep covering ALL streams, utilities included.  See the header.

    Implementation of the declaration's grammar and of every refusal it can
    earn.  A refusal here names the DECLARATION as the thing that is false,
    because that is what has been contradicted: the plant is whatever the
    plant is, and this block is a claim ABOUT it.
\*---------------------------------------------------------------------------*/

#include "UtilityCircuit.H"

#include "core/Advisory.H"
#include "core/RegistryRefusal.H"
#include "streams/StreamMass.H"
#include "thermo/utility/UtilityCatalogue.H"

#include <algorithm>
#include <cmath>
#include <sstream>
#include <stdexcept>

namespace Choupo {
namespace utilityCircuits {

namespace {

std::string requireWord(const DictPtr& d, const char* key,
                        const std::string& where)
{
    if (!d->found(key))
        throw std::runtime_error(
            "utilities: " + where + " declares no `" + key + "`.  A utility "
            "circuit is declared as `{ name <word>; service <catalogueWord>; "
            "supply <stream>; return <stream>; }` -- `note` is the only "
            "optional key.");
    const std::string w = d->lookupWord(key);
    if (w.empty())
        throw std::runtime_error(
            "utilities: " + where + " declares an EMPTY `" + key + "`.");
    return w;
}

//  Who consumes / produces a stream, from the FLATTENED topology -- the
//  engine's own list of edges, never a name.
struct Endpoints
{
    std::vector<std::string> consumers, producers;
    bool known = false;      // the graph mentions this stream at all
};

Endpoints endpointsOf(const std::string& stream,
                      const std::vector<FlatUnit>& topology)
{
    Endpoints e;
    for (const auto& fu : topology)
    {
        for (const auto& s : fu.ins)
            if (s == stream) { e.consumers.push_back(fu.name); e.known = true; }
        for (const auto& s : fu.outs)
            if (s == stream) { e.producers.push_back(fu.name); e.known = true; }
    }
    return e;
}

std::string joined(const std::vector<std::string>& v)
{
    std::string s;
    for (std::size_t i = 0; i < v.size(); ++i)
        s += (i ? ", " : "") + v[i];
    return s;
}

std::string num(scalar v)
{
    std::ostringstream os;
    os.setf(std::ios::fixed);
    os.precision(6);
    os << v;
    return os.str();
}

} // anonymous namespace


std::vector<UtilityCircuit> read(const DictPtr& flowsheetDict)
{
    std::vector<UtilityCircuit> out;
    if (!flowsheetDict || !flowsheetDict->found("utilities")) return out;

    if (!flowsheetDict->hasDictList("utilities"))
        throw std::runtime_error(
            "utilities: this flowsheetDict carries a `utilities` entry that is "
            "not a list of blocks.  The grammar is `utilities ( { name ...; "
            "service ...; supply ...; return ...; } );` -- one block per "
            "declared circuit.");

    std::map<std::string, std::string> claimedBy;   // stream -> circuit name
    std::set<std::string> names;

    for (const auto& d : flowsheetDict->lookupDictList("utilities"))
    {
        UtilityCircuit c;
        c.name    = requireWord(d, "name", "a `utilities` block");
        const std::string where = "circuit '" + c.name + "'";
        c.service = requireWord(d, "service", where);
        c.supply  = requireWord(d, "supply",  where);
        c.ret     = requireWord(d, "return",  where);
        c.note    = d->lookupWordOrDefault("note", "");

        if (!names.insert(c.name).second)
            throw std::runtime_error(
                "utilities: two circuits are both named '" + c.name + "'.  A "
                "circuit's name is how every report refers to it, so it must "
                "be unique.");

        //  SUPPLY == RETURN.  One stream cannot be both ends of a circuit:
        //  there would be nothing between them, and the conservation test
        //  below would be an identity that always passes -- a check that
        //  cannot fail is worse than none.
        if (c.supply == c.ret)
            throw std::runtime_error(
                "utilities: circuit '" + c.name + "' declares the SAME stream '"
                + c.supply + "' as both `supply` and `return`.  A circuit "
                "enters the plant and leaves it: those are two boundary "
                "streams.  If this utility really is one stream, it is not a "
                "circuit and must stay in the process balance.");

        for (const std::string* s : { &c.supply, &c.ret })
        {
            auto it = claimedBy.find(*s);
            if (it != claimedBy.end())
                throw std::runtime_error(
                    "utilities: stream '" + *s + "' is declared by circuit '"
                    + it->second + "' AND by circuit '" + c.name + "'.  A "
                    "stream belongs to at most one circuit -- excluding it "
                    "twice would subtract its mass twice from the process "
                    "scope.");
            claimedBy[*s] = c.name;
        }

        //  THE SERVICE IS A REGISTRY WORD, so the sentence that refuses an
        //  unknown one has ONE home (core/RegistryRefusal.H) and not a
        //  hand-written list here that goes stale the day a record is added.
        //
        //  A TOOL THAT COULD NOT LOOK MUST NOT REPORT WHAT IT DID NOT SEE
        //  (2026-09-06), and the mirror bites here: run from inside a case
        //  directory with no CHOUPO_HOME, the data root is empty and EVERY
        //  directory-scan registry loads nothing -- so an empty catalogue is
        //  not evidence that the word is wrong.  Measured on the first run of
        //  the ammonia witness, which refused a `coolingWater` that exists.
        //  An empty catalogue ANNOUNCES that the word could not be checked; a
        //  LOADED one that lacks the word refuses by name.
        const auto services = UtilityCatalogue::availableNames();
        if (services.empty())
            AdvisoryLog::instance().add(
                "utilities", "info", "circuit '" + c.name + "'",
                "service '" + c.service + "' was NOT checked against the "
                "utility catalogue: no catalogue is loaded in this run (no "
                "data root -- set CHOUPO_HOME, or run from the project root).  "
                "The circuit's topology and its conservation are checked as "
                "usual; only the service word is unverified.");
        else if (!UtilityCatalogue::has(c.service))
            throw std::runtime_error(
                "utilities: circuit '" + c.name + "': "
                + registryRefusal::message("utility service", c.service,
                                           services));

        out.push_back(std::move(c));
    }
    return out;
}


void validateTopology(const std::vector<UtilityCircuit>& circuits,
                      const std::vector<FlatUnit>&       topology)
{
    for (const auto& c : circuits)
    {
        const Endpoints sup = endpointsOf(c.supply, topology);
        const Endpoints ret = endpointsOf(c.ret,    topology);

        if (!sup.known)
            throw std::runtime_error(
                "utilities: circuit '" + c.name + "' declares `supply " + c.supply
                + "`, and no unit in this flowsheet mentions that stream.  A "
                "circuit is declared over the graph's own edges.");
        if (!ret.known)
            throw std::runtime_error(
                "utilities: circuit '" + c.name + "' declares `return " + c.ret
                + "`, and no unit in this flowsheet mentions that stream.  A "
                "circuit is declared over the graph's own edges.");

        //  A SUPPLY IS A PLANT BOUNDARY INLET and a RETURN a plant boundary
        //  OUTLET.  An interior edge is not a boundary crossing at all, so
        //  removing it from the boundary summary would remove nothing and
        //  claim something.
        if (!sup.producers.empty())
            throw std::runtime_error(
                "utilities: circuit '" + c.name + "': `supply " + c.supply
                + "` is PRODUCED inside the plant (by " + joined(sup.producers)
                + "), so it is not a boundary inlet.  A circuit's supply is "
                "matter entering the domain; an internal stream is already "
                "inside the balance and cannot be excluded from it.");
        if (!ret.consumers.empty())
            throw std::runtime_error(
                "utilities: circuit '" + c.name + "': `return " + c.ret
                + "` is CONSUMED inside the plant (by " + joined(ret.consumers)
                + "), so it is not a boundary outlet.  Matter that re-enters "
                "the process is process matter: the declaration is false.");

        //  THE PAIR MUST BE ONE UNIT'S UTILITY SIDE.  The two-stream form
        //  says: this matter enters, serves ONE piece of equipment, and
        //  leaves unchanged.  A branched header (a splitter to three
        //  exchangers and a mixer back) is a perfectly real plant and is NOT
        //  this declaration -- so the refusal names the DECLARATION as the
        //  thing that does not fit, and points at the two shapes that do.
        if (sup.consumers.size() != 1 || ret.producers.size() != 1
            || sup.consumers.front() != ret.producers.front())
            throw std::runtime_error(
                "utilities: circuit '" + c.name + "': the two-stream "
                "closed-circuit declaration does not describe this topology.  "
                "`supply " + c.supply + "` is consumed by { "
                + (sup.consumers.empty() ? "nothing" : joined(sup.consumers))
                + " } and `return " + c.ret + "` is produced by { "
                + (ret.producers.empty() ? "nothing" : joined(ret.producers))
                + " }; the form declares ONE served unit at both ends.  "
                "Declare one circuit per served unit, or -- for a branched "
                "header -- leave the block off and let the header stay in the "
                "process balance until Choupo can express one.");
    }
}


void validateConservation(const std::vector<UtilityCircuit>&          circuits,
                          const std::map<std::string, ProcessStream>& streams,
                          const ThermoPackage&                        thermo)
{
    for (const auto& c : circuits)
    {
        auto si = streams.find(c.supply);
        auto ri = streams.find(c.ret);
        if (si == streams.end() || ri == streams.end())
            throw std::runtime_error(
                "utilities: circuit '" + c.name + "': the solved stream "
                "registry has no state for '"
                + (si == streams.end() ? c.supply : c.ret)
                + "', so the circuit cannot be checked.  A declaration that "
                "cannot be checked must not be honoured.");

        const auto ms = componentMassFlow(si->second, thermo);
        const auto mr = componentMassFlow(ri->second, thermo);

        for (std::size_t i = 0; i < thermo.n(); ++i)
        {
            const scalar a = (i < ms.size()) ? ms[i] : 0.0;
            const scalar b = (i < mr.size()) ? mr[i] : 0.0;
            const scalar scale = std::max(std::abs(a), std::abs(b));
            if (scale <= 0.0) continue;
            if (std::abs(a - b) <= kConservationRelTol * scale) continue;

            //  THE MESSAGE CARRIES THE WHOLE RULE, because the reader is
            //  most likely to meet it here.  Component-wise conservation
            //  across the pair is NECESSARY and NOT SUFFICIENT, and it is not
            //  a law of utilities: a cooling tower with makeup, evaporation,
            //  drift and blowdown does not conserve across two streams and is
            //  a real plant.  What has been contradicted is the DECLARATION.
            throw std::runtime_error(
                "utilities: circuit '" + c.name + "' does not conserve '"
                + thermo.comp(i).name() + "': `supply " + c.supply + "` carries "
                + num(a) + " kg/h and `return " + c.ret + "` carries " + num(b)
                + " kg/h.  The TWO-STREAM CLOSED-CIRCUIT DECLARATION IS FALSE "
                "-- this is not a statement that your utility leaks.  A real "
                "circuit with makeup, evaporation, drift or blowdown is "
                "legitimate and simply has more than two boundary streams: "
                "model the makeup / evaporation / drift / blowdown streams "
                "explicitly, and they stay in the process material balance "
                "where they belong.  Only a pair that closes may be presented "
                "as one.");
        }
    }
}


std::set<std::string> excludedStreams(const std::vector<UtilityCircuit>& circuits)
{
    std::set<std::string> out;
    for (const auto& c : circuits) { out.insert(c.supply); out.insert(c.ret); }
    return out;
}


std::map<std::string, UtilityCircuit>
servedUnits(const std::vector<UtilityCircuit>& circuits,
            const std::vector<FlatUnit>&       topology)
{
    std::map<std::string, UtilityCircuit> out;
    for (const auto& c : circuits)
    {
        const Endpoints sup = endpointsOf(c.supply, topology);
        if (sup.consumers.size() == 1) out[sup.consumers.front()] = c;
    }
    return out;
}

} // namespace utilityCircuits
} // namespace Choupo
