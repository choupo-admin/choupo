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

#include "streams/SpeciationBlock.H"

#include <functional>

#include "thermo/ThermoPackage.H"
#include "thermo/electrolyte/SpeciationSolver.H"

namespace Choupo {

std::shared_ptr<const ProcessStream::Speciation>
speciationBlock(const ThermoPackage&                 thermo,
                const electrolyte::SpeciationResult& sr,
                const scalar                         kgw,
                const scalar                         pH,
                const std::function<bool(const std::string&)>& ownedSolid)
{
    if (!(kgw > 0.0)) return nullptr;

    auto sp = std::make_shared<ProcessStream::Speciation>();

    //  Every set the case's components declare.  The species names come from
    //  the UNION of those networks, so naming ONE would be a half-truth in
    //  any system that declares two -- and this case's carbonate names sit
    //  beside its ammonia names in the same list.
    for (std::size_t i = 0; i < thermo.n(); ++i)
    {
        const std::string& set = thermo.comp(i).aqueousSpeciation();
        if (set.empty() || set == "none") continue;
        bool seen = false;
        std::size_t at = 0;
        while (!seen && at < sp->network.size())      // exact TOKEN match, not
        {                                             // substring: a set named
            const std::size_t end = sp->network.find(' ', at);
            const std::size_t len =
                (end == std::string::npos ? sp->network.size() : end) - at;
            seen = (sp->network.compare(at, len, set) == 0);
            if (end == std::string::npos) break;
            at = end + 1;
        }
        if (!seen) sp->network += (sp->network.empty() ? "" : " ") + set;
    }

    //  STOICHIOMETRIC, always, when the solver wrote it: the totals came from
    //  the components through the declared bridges, so H+/OH- are excluded
    //  mediators and the set does not close in charge.  An `analytical` set is
    //  what a LABORATORY writes, and that one does.
    sp->basis    = "stoichiometric";
    sp->pH       = pH;
    sp->pH_valid = true;

    //  molality [mol/kg water] * kg/s = mol/s -> kmol/s
    for (const auto& row : sr.rows)
        sp->flows.emplace_back(row.name, row.molality * kgw / 1000.0);

    //  ...and the PRECIPITATED minerals -- which are NOT aqueous species and
    //  no longer sit among them.
    //
    //  They used to, and the reason was structural, not physical: the block
    //  was checked against the stream's OVERALL material, so a mineral left
    //  out made the decomposition describe less matter than the stream
    //  carried and the closure check said so.  In flash16 that put 58.9 % of
    //  the calcium -- solid calcite -- in a block whose subject is the
    //  aqueous phase.  It closed, and it closed by counting a crystal as a
    //  dissolved species.
    //
    //  Now the phase exists, so the crystal goes to it: the caller moves each
    //  owned mineral into the stream's SOLID material, the aqueous phase is
    //  the liquid minus it, and this block closes against that -- describing
    //  the 41.1 % that is actually in solution.  A mineral with no declared
    //  owner still cannot be placed, and stays reported here rather than
    //  vanishing.
    for (const auto& [mineral, molal] : sr.precipitated)
        if (!ownedSolid || !ownedSolid(mineral))
            sp->flows.emplace_back(mineral, molal * kgw / 1000.0);

    return sp;
}

} // namespace Choupo
