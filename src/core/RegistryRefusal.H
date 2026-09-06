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
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the Licence, or
    (at your option) any later version.

    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS ; Required legal notices: see NOTICE
-------------------------------------------------------------------------------
Namespace
    Choupo::registryRefusal

Description
    THE ONE HOME for what a factory says when the name a case declared is not
    registered.

    A refusal by name carries the names that exist.  Before 2026-09-06 that
    was true of most factories and false of several, and the ones that DID
    name their alternatives said so in four different ways -- two of them
    hand-written lists inside the message, which is a second home for the
    registry's own vocabulary and goes stale the day a model is registered.
    `docs/design/openfoam-study.md` read four sites at random and found four
    different failure modes; its recommendation is this header.

    So no factory writes this sentence any more.  It calls

        registryRefusal::message("activity model", modelName, keysOf(registry()))

    and the words, the order, the case-sensitivity warning and the
    closest-name suggestion are decided HERE, once.  The suggestion reuses
    `dictAudit::editDistance` and its tolerance rule rather than inventing a
    second notion of "close enough" -- a student who writes NTRL for NRTL is
    making the same kind of slip whether the word sits in a key or a value.

    What this is NOT: it does not decide whether a name SHOULD be registered,
    and it never invents a default.  A factory whose default names something
    it cannot build is a different defect (see the massTransfer `constant`
    case) and this header cannot see it.

\*---------------------------------------------------------------------------*/

#pragma once

#include <string>
#include <vector>

namespace Choupo {
namespace registryRefusal {

//- The message a factory throws when `asked` is not registered.  `what` names
//  the KIND in the reader's words ("activity model", "unit operation type"),
//  lower case, no trailing punctuation.
std::string message(const std::string&              what,
                    const std::string&              asked,
                    const std::vector<std::string>& registered);

//- The keys of any registry, in the registry's own order.  A template so no
//  factory has to expose its Factory type to this header.
template <class Registry>
std::vector<std::string> keysOf(const Registry& r)
{
    std::vector<std::string> out;
    out.reserve(r.size());
    for (const auto& kv : r) out.push_back(kv.first);
    return out;
}

} // namespace registryRefusal
} // namespace Choupo
