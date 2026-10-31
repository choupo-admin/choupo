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
    THE PRE-SOLVE HALF OF WHAT A UNIT ACCEPTS (DEV.md 4c C188 item 5;
    docs/design/what-a-unit-accepts.md section 4).

    An AUTHORED inlet is a declaration the case file makes, so a unit that
    cannot accept it is a defect in the case, found before any unit runs and
    pointed at the stream the student wrote -- not at the unit's turn, after
    everything upstream has solved.  A PRODUCED stream exists only once its
    producer has run, so it is checked by the consuming unit itself, at its
    solve, by the SAME function.

    A file of its own (Flowsheet is one class in two translation units)
    because Flowsheet.cpp's lines are cited by file:line from the GUI's
    lesson pages: the call site in solve() is one line, and everything else
    lives here.
\*---------------------------------------------------------------------------*/

#include "Flowsheet.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/UnitAcceptance.H"
#include "unitOperations/UnitOperation.H"
#include "unitOperations/flowsheet/UnitInputs.H"     // streamToDict: the dict a unit reads

#include <algorithm>
#include <map>
#include <memory>
#include <stdexcept>

namespace Choupo {

void Flowsheet::checkAuthoredInletAcceptance(
    const std::vector<DictPtr>& units,
    const ThermoPackage&        thermo,
    std::vector<std::string>&   lintFindings)
{
    std::map<std::string, DictPtr> unitDictOf;
    for (const auto& u : units)
        unitDictOf[u->lookupWordOrDefault("name", "")] = u;

    std::vector<std::string> findings;
    auto keep = [&findings](std::string f)
    {
        //  A finding about the PACKAGE (a capability the unit needs) reads
        //  the same on every inlet; one copy is the fact.
        if (std::find(findings.begin(), findings.end(), f) == findings.end())
            findings.push_back(std::move(f));
    };
    for (const auto& fu : topology_)
    {
        //  The DECLARATION is asked of the class.  An unknown type is not this
        //  pass's finding: lint reports it by name, and the solve refuses it
        //  at the unit's turn.
        std::unique_ptr<UnitOperation> probe;
        try { probe = UnitOperation::New(fu.type); }
        catch (const std::exception&) { continue; }
        const UnitAcceptance acc = probe->acceptance();

        const auto ud = unitDictOf.find(fu.name);
        if (ud == unitDictOf.end()) continue;
        const std::string locus = fu.type + " '" + fu.name + "'";
        const bool declaresPassThrough = ud->second->found("passThrough");
        //  An unmigrated unit with no pass-through block accepts all, and is
        //  left before its world is built (building one announces things).
        if (!acc.declared && !declaresPassThrough) continue;
        //  The unit's OWN world: the one its solve reads its inlet in.
        const ThermoPackage& world = acc.declared
            ? thermoFor(fu.name, ud->second, thermo) : thermo;

        //  A DECLARED PASS-THROUGH is judged for EVERY unit that carries the
        //  block, migrated or not: a unit that offers none refuses it here,
        //  instead of ignoring a decision the case thinks it took.
        PassThroughDeclaration pt;
        for (auto& f : passThroughFindings(ud->second, acc, fu.type, world,
                                           locus, pt))
            keep(std::move(f));
        if (!acc.declared) continue;          // an unmigrated unit accepts all

        const auto utilPorts = probe->utilityPorts();
        std::vector<const ProcessStream*> process;
        bool allAuthored = true;
        for (std::size_t k = 0; k < fu.ins.size(); ++k)
        {
            if (std::find(utilPorts.begin(), utilPorts.end(), k)
                != utilPorts.end()) continue;  // a utility line, not the process feed
            const auto st = streams_.find(fu.ins[k]);
            if (st == streams_.end()) { allAuthored = false; continue; }
            const ProcessStream& s = st->second;
            if (!s.authoredInlet) allAuthored = false;
            //  Authored, and carrying something: an empty authored inlet has no
            //  composition to judge, and the unit's own solve still checks it.
            if (!s.authoredInlet || !(s.F > 0.0)) continue;
            process.push_back(&s);
        }

        if (acc.appliesTo == UnitAcceptance::Scope::combinedFeed)
        {
            //  The unit judges the feed it COMBINES its inlets into; before
            //  the solve that feed exists only when every inlet is authored.
            if (!allAuthored || process.empty()) continue;
            ProcessStream mix = *process.front();
            sVector Fz(world.n(), 0.0);
            scalar  Ftot = 0.0;
            for (const auto* s : process)
            {
                for (std::size_t i = 0; i < Fz.size() && i < s->z.size(); ++i)
                    Fz[i] += s->F * s->z[i];
                Ftot += s->F;
            }
            for (auto& v : Fz) v /= Ftot;
            mix.F = Ftot;
            mix.z = Fz;
            mix.name = fu.name + " (combined feed)";
            const DictPtr feed = streamToDict(mix, world);
            const AcceptanceInlet in =
                acceptanceInletOf(feed, mix.z, world, locus, acc);
            for (auto& f : acceptanceFindings(acc, fu.type, in, world, locus, &pt))
                keep(std::move(f));
            continue;
        }
        for (const auto* s : process)
        {
            const DictPtr feed = streamToDict(*s, world);
            const AcceptanceInlet in =
                acceptanceInletOf(feed, s->z, world, locus, acc);
            for (auto& f : acceptanceFindings(acc, fu.type, in, world, locus, &pt))
                keep(std::move(f));
        }
    }
    if (findings.empty()) return;

    if (lint_)
    {
        for (auto& f : findings)
            lintFindings.push_back("authored inlet not accepted: " + f);
        return;
    }
    std::string msg = "Flowsheet: an AUTHORED inlet is not accepted by the unit"
        " that consumes it (checked before any unit runs -- DEV.md 4c C188,"
        " docs/design/what-a-unit-accepts.md):\n";
    for (const auto& f : findings) msg += "  " + f + "\n";
    throw std::runtime_error(msg);
}

} // namespace Choupo
