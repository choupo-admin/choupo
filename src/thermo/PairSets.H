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
    src/thermo/PairSets.H

Description
    SEVERAL NAMED PARAMETER SETS PER PAIR (contract K3 of
    docs/design/measured-facts-materials-and-flow-curves.md section 7b).

    The identity of a set is (the species, the model and its convention
    profile, the set's name).  A binaryInteractionParameters record
    (data/standards/parameters/NRTL|UNIQUAC|Wilson/<i>-<j>.dat) is either

      one unnamed set   a `parameters { ... }` block, as every record read
                        before this slice: the set is named `default`, and
                        the record is read EXACTLY as it always was;
      named sets        `sets { <name> { parameters {...} provenance {...}
                        validity {...} fittedTo vle|lle|vlle|calorimetry; } }`
                        and `preferred <name>;` (the shape a component
                        record uses for its laws, thermo/RecordLaws.H).
                        `preferred` is required when there are two or more
                        sets.  A top-level `parameters` block beside `sets`
                        would be two homes for one fact and is refused.

    A case selects a set with `set <name>;` beside the pair's `source` in its
    binaryParameters entry; a pair the case leaves to the catalogue lookup
    reads the record's preferred set.  An unknown name is refused by name,
    listing the sets the record holds.

    resolve() returns the record the activity model reads: the record itself
    when it is the single-block form, else a flattened copy whose
    `parameters`, `provenance` (with the set's `validity` folded in),
    `validation` and `fittedTo` are the chosen set's.  The record-level
    `validation` belongs to the preferred set only.  The flat copy carries
    `setName`, so the run can print which set it used.  Nothing is printed
    for the unnamed `default` set: a legacy record's output does not change.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"

#include <algorithm>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo { namespace pairsets {

inline std::string joinNames(const std::vector<std::string>& v)
{
    std::string s;
    for (std::size_t k = 0; k < v.size(); ++k) s += (k ? ", " : "") + v[k];
    return s;
}

//  The names of the sets a record holds ("default" for the single-block form).
inline std::vector<std::string> setNames(const DictPtr& rec)
{
    if (!rec->found("sets")) return { "default" };
    return rec->subDict("sets")->keys();
}

//  The record's own preferred set ("default" for the single-block form).
inline std::string preferredName(const DictPtr& rec, const std::string& file)
{
    if (!rec->found("sets")) return "default";
    const auto names = setNames(rec);
    if (names.empty())
        throw std::runtime_error("pair record " + file
            + ": `sets { }` holds no set");
    if (rec->found("preferred"))
    {
        const std::string p = rec->lookupWord("preferred");
        if (std::find(names.begin(), names.end(), p) == names.end())
            throw std::runtime_error("pair record " + file + ": `preferred "
                + p + ";` names no set of this record (sets: "
                + joinNames(names) + ")");
        return p;
    }
    if (names.size() == 1) return names[0];
    throw std::runtime_error("pair record " + file + " holds "
        + std::to_string(names.size()) + " sets (" + joinNames(names)
        + ") and marks none `preferred` -- write `preferred <name>;`");
}

//  The record the activity model reads for set `requested` ("" = preferred).
//  `usedName` receives the set's name ("default" for a single-block record);
//  `named` is true only when the record holds a `sets` block, so the caller
//  prints the set only where it is a choice.
inline DictPtr resolve(const DictPtr& rec, const std::string& requested,
                       const std::string& file, std::string* usedName = nullptr,
                       bool* named = nullptr)
{
    if (!rec->found("sets"))
    {
        if (!requested.empty() && requested != "default")
            throw std::runtime_error("pair record " + file + " holds ONE"
                " unnamed set (named `default`); the case asks for set '"
                + requested + "' -- there is no such set (sets: default)");
        if (usedName) *usedName = "default";
        if (named) *named = false;
        return rec;
    }
    if (rec->found("parameters"))
        throw std::runtime_error("pair record " + file + " carries BOTH a"
            " top-level `parameters` block and a `sets { }` block -- two homes"
            " for one fact; move the parameters into a named set");
    const auto names = setNames(rec);
    const std::string pref = preferredName(rec, file);
    const std::string use  = requested.empty() ? pref : requested;
    if (std::find(names.begin(), names.end(), use) == names.end())
        throw std::runtime_error("pair record " + file + " holds no set named '"
            + use + "' (sets: " + joinNames(names) + "; preferred: " + pref
            + ")");
    DictPtr s = rec->subDict("sets")->subDict(use);
    if (!s->found("parameters"))
        throw std::runtime_error("pair record " + file + ": set '" + use
            + "' has no `parameters` block");
    auto flat = std::make_shared<Dictionary>(rec->name());
    for (const auto& k : rec->keys())
        if (k != "sets" && k != "preferred")
            flat->insert(k, rec->entryValue(k));
    flat->insert("parameters", EntryValue(s->subDict("parameters")));
    //  The set's own provenance, with the set's `validity` folded in where the
    //  models read it (provenance.validity); else the record's provenance.
    auto withValidity = [&](const DictPtr& pv)
    {
        auto pc = std::make_shared<Dictionary>("provenance");
        for (const auto& k : pv->keys())
            if (k != "validity") pc->insert(k, pv->entryValue(k));
        pc->insert("validity", s->entryValue("validity"));
        return pc;
    };
    if (s->found("provenance"))
    {
        DictPtr pv = s->subDict("provenance");
        if (s->found("validity") && !pv->found("validity")) pv = withValidity(pv);
        flat->insert("provenance", EntryValue(pv));
    }
    else if (rec->found("provenance") && s->found("validity"))
        flat->insert("provenance", EntryValue(withValidity(rec->subDict("provenance"))));
    if (s->found("validation"))
        flat->insert("validation", s->entryValue("validation"));
    else if (use != pref && flat->found("validation"))
        flat->erase("validation");
    if (s->found("fittedTo")) flat->insert("fittedTo", s->entryValue("fittedTo"));
    flat->insert("setName", use);
    if (usedName) *usedName = use;
    if (named) *named = true;
    return flat;
}

}} // namespace Choupo::pairsets
