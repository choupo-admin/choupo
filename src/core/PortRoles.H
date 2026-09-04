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
    Choupo::PortRoles

Description
    WHAT ROLE A STREAM PLAYS AT A UNIT'S PORT, and the ONE word each role is
    written as.  Derived from the flattened topology alone -- who produces a
    stream, who consumes it, and which streams the solver tore.

    WHY IT IS HERE AND NOT INSIDE A WRITER.  This classification had exactly
    one caller when it was written (`SolutionWriter`, for the per-instant
    `byUnit/<unit>/ports` dict) and lived as a private const member of it,
    with the role->word mapping as a lambda inside the function that printed
    it.  A second writer then needed the same answer -- the equipment
    SPECIFICATION SHEET, which states a unit's inlets and outlets for a human
    auditor -- and a second implementation of "is this stream a feed?" is the
    arity sin in its plainest form: two homes for one fact, agreeing today,
    drifting the first time a role is added or a tear is redefined.

    Worse than drifting: the two would drift SILENTLY.  Nothing compares a
    ports dict against a design sheet, so the day they disagreed a reader
    would simply be told two different things about the same stream in two
    files written by the same run.

    THE WORDS ARE PART OF THE CONTRACT, not decoration.  `fixedValue` and
    `computed` are OpenFOAM's boundary vocabulary, chosen so a reader who
    knows that tree reads this one; they are written into files a student
    opens, so they belong beside the enum they name and not inside whichever
    function happened to print first.

\*---------------------------------------------------------------------------*/

#ifndef Choupo_PortRoles_H
#define Choupo_PortRoles_H

#include "core/FlatUnit.H"

#include <map>
#include <set>
#include <string>
#include <vector>

namespace Choupo
{
namespace PortRoles
{

//  A stream's role at the domain boundary.  A stream consumed but never
//  produced is a FEED (Dirichlet); produced but never consumed is a PRODUCT;
//  a torn stream is a TEAR (an internal edge the solver cut); everything else
//  is an ordinary INTERIOR face.
enum class Role { Feed, Product, Tear, Interior };

//  The word each role is written as.  ONE home: every file that names a role
//  -- the per-instant ports dict, the design sheet -- reads it from here.
inline const char* word(Role r)
{
    switch (r)
    {
        case Role::Feed:     return "fixedValue";
        case Role::Product:  return "computed";
        case Role::Tear:     return "tear";
        case Role::Interior: return "interior";
    }
    return "interior";
}

//  Classify every stream NAME into a role from the flattened units' ins/outs
//  (which carry the resolved GLOBAL dotted keys = the registry keys) plus the
//  tear set.  The map key is the global stream name.
//
//  A stream that touches no unit (a rare boundary alias) stays Interior -- we
//  never invent a role we cannot justify from the topology.
inline std::map<std::string, Role> classify(
    const std::vector<FlatUnit>&   units,
    const std::set<std::string>&   tearSet,
    const std::set<std::string>&   streamNames)
{
    std::set<std::string> produced;   // appears as some unit's output
    std::set<std::string> consumed;   // appears as some unit's input
    for (const auto& u : units)
    {
        for (const auto& in  : u.ins)  consumed.insert(in);
        for (const auto& out : u.outs) produced.insert(out);
    }

    std::map<std::string, Role> roles;
    for (const auto& name : streamNames)
    {
        if (tearSet.count(name))                             roles[name] = Role::Tear;
        else if (consumed.count(name) && !produced.count(name))
                                                             roles[name] = Role::Feed;
        else if (produced.count(name) && !consumed.count(name))
                                                             roles[name] = Role::Product;
        else                                                 roles[name] = Role::Interior;
    }
    return roles;
}

//  The role of ONE stream, with the honest default for a name the classifier
//  never saw (it touches no unit in this domain).
inline Role of(const std::map<std::string, Role>& roles, const std::string& stream)
{
    auto it = roles.find(stream);
    return it == roles.end() ? Role::Interior : it->second;
}

} // namespace PortRoles
} // namespace Choupo

#endif

// ************************************************************************* //
