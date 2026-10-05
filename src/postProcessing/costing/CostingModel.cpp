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

#include "CostingModel.H"
#include "Turton.H"
#include "core/RegistryRefusal.H"

#include <map>
#include <memory>
#include <stdexcept>

namespace Choupo {

std::map<std::string, CostingModel::Factory>& CostingModel::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void CostingModel::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<CostingModel> CostingModel::New(const DictPtr& dict)
{
    //  THE HELPFUL MESSAGE USED TO REQUIRE HAVING ALREADY GUESSED THE KEY.
    //  `lookupWord` throws the DICTIONARY's generic "missing word entry
    //  'method'" when the key is absent, which fires before this factory is
    //  reached -- so an author who wrote the wrong VALUE got the full list of
    //  registered methods, and an author who omitted the key entirely (which
    //  is what happens the first time) got a bare sentence naming a key and
    //  nothing else.  The absent case is the commoner one and had the worse
    //  message.  Both now go through the listing.
    std::string avail;
    for (const auto& kv : registry()) avail += " " + kv.first;
    if (!dict->found("method"))
        throw std::runtime_error("CostingModel: the `costing {}` block does"
            " not declare `method`.  Registered:"
            + (avail.empty() ? std::string(" (none)") : avail)
            + "\n  Copy one of the names above EXACTLY -- the lookup is"
              " case-sensitive, and the first\n  draft of this very message"
              " suggested a lower-case name the registry does not hold."
              "\n  There is no default: which correlation family prices a"
              " piece of equipment is an\n  author's choice, not a detail.");
    const std::string method = dict->lookupWord("method");
    auto it = registry().find(method);
    if (it == registry().end())
    {
        //  A RETIRED NAME IS REFUSED, AND THE REFUSAL NAMES ITS SUCCESSOR
        //  (2026-10-05, DEV.md 4c C38 item 2).  `Guthrie` was this model's
        //  name while every coefficient in it was Turton's; it was an
        //  announced alias from 2026-09-03 and is gone now -- no dual reader.
        //  The closest-name suggestion cannot reach `Turton` from `Guthrie`
        //  (they share no spelling), so the successor is said here, beside
        //  the list the one home writes.
        std::string msg = "CostingModel: "
            + registryRefusal::message("costing method", method,
                                       registryRefusal::keysOf(registry()));
        if (method == "Guthrie")
            msg += "\n  `Guthrie` is the RETIRED name of `Turton`: every"
                   " coefficient in that model is Turton et al.'s (Analysis,"
                   "\n  Synthesis and Design of Chemical Processes, Appendix"
                   " A); Guthrie (1969) supplied only the\n  bare-module form."
                   "  Write `method Turton;` -- the numbers are unchanged.";
        throw std::runtime_error(msg);
    }
    return it->second(dict);
}

void CostingModel::registerBuiltins()
{
    //  THE KEY NAMES WHOSE NUMBERS THESE ARE (ruled 2026-09-03; the alias
    //  retired 2026-10-05, DEV.md 4c C38 item 2).  Every coefficient in
    //  Turton.cpp is Turton's (Analysis, Synthesis and Design of Chemical
    //  Processes, Appendix A, 2001 USD); Guthrie (1969) supplied the
    //  bare-module FORM the coefficients sit in.  A student cites the
    //  numbers, so the ONE registered name is `Turton`; `Guthrie` is refused
    //  by name in `New` above, naming its successor.
    registerType("Turton",
        [](const DictPtr& d) -> std::unique_ptr<CostingModel>
        { return std::make_unique<Turton>(d); });
}

} // namespace Choupo
