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

#include "SolidEquilibriumService.H"
#include "core/Advisory.H"

#include <cmath>
#include <iostream>

namespace Choupo {
namespace solidEq {

SolidEquilibriumService::Outcome
SolidEquilibriumService::equilibrateMinerals(
    const electrolyte::SpeciationSolver& provider,
    electrolyte::SpeciationInput state,
    const std::vector<std::string>& admitted,
    int verbosity,
    Route route)
{
    Outcome out;

    //  THE COUPLED ROUTE (S3): every candidate is one provider's mineral,
    //  so the simultaneous solve R1 names is the provider's own augmented
    //  Newton -- invoked through THIS one door, with the service owning
    //  the admitted list, the formed ledger and the narration.  Numbers
    //  are byte-identical to the pre-migration path by construction: the
    //  math did not move, the ENTRY did.
    if (route == Route::coupled)
    {
        state.sinksFor    = admitted;   // the ledger echo rides along
        state.equilibrate = admitted;
        out.aqueous = provider.solve(state, verbosity);
        out.sinks   = out.aqueous.sinks;
        out.outerIters = out.aqueous.activeSetPasses;
        for (const auto& nm : admitted)
        {
            const double n = out.aqueous.precipitated.count(nm)
                           ? out.aqueous.precipitated.at(nm) : 0.0;
            out.formed[nm] = n;
            out.events.push_back(n > 0.0
                ? "solid '" + nm + "' present (n = " + std::to_string(n)
                  + " mol/kg water, SI = 0 ceiling)"
                : "solid '" + nm + "' admitted but subsaturated (stays "
                  "dissolved; n = 0)");
        }
        for (const auto& ev : out.events)
            AdvisoryLog::instance().add("solids", "info",
                                        "solidEquilibrium", ev);
        return out;
    }

    //  1. THE GENERAL ROUTE: the provider RESOLVES the admitted set --
    //  existence (refusing an unknown name with the available list, the
    //  provider's own message) and the transfer stoichiometry onto the
    //  master balances (S2a's ONE home for the chaining).  Report-only:
    //  this solve moves nothing.
    state.sinksFor = admitted;
    state.equilibrate.clear();
    electrolyte::SpeciationResult probe = provider.solve(state, 0);
    out.sinks = probe.sinks;
    const std::vector<electrolyte::MineralSinks>& sinks = out.sinks;
    state.sinksFor.clear();

    //  2. CANDIDATES: the mineral's saturation model prices through the
    //  provider (ln SI = ln(10) * log10(IAP/K) over the SPECIATED state);
    //  its transfer sinks the master totals the provider resolved.  The
    //  common solver never learns what any candidate is.
    std::vector<SolidCandidate> cands;
    cands.reserve(sinks.size());
    for (const auto& s : sinks)
    {
        SolidCandidate c;
        c.name = s.mineral;
        c.lnSI = [&provider, &state, name = s.mineral](scalar) -> scalar
        {
            electrolyte::SpeciationResult r = provider.solve(state, 0);
            return r.SI.at(name) * std::log(10.0);
        };
        c.remove = [&state, legs = s.masterNu](scalar dn)
        {
            for (const auto& [master, nu] : legs)
                state.totals[SpeciesId(master)] -= nu * dn;
        };
        cands.push_back(std::move(c));
    }

    //  3. PRESENCE is this service's decision: the common complementarity,
    //  simultaneous on the active set (R1), with the narration surfaced --
    //  an appearance/redissolution is SOLVER/SERVICE behaviour, never a
    //  model's, and it rides the durable caveat surface like every other
    //  announcement the engine makes.
    out.outerIters = equilibrate(cands, state.T, 400, 1e-10, &out.events);
    for (const auto& ev : out.events)
    {
        AdvisoryLog::instance().add("solids", "info", "solidEquilibrium", ev);
        if (verbosity >= 2) std::cout << "  [solids] " << ev << "\n";
    }

    //  4. The converged aqueous state, priced once more by the provider at
    //  the settled totals (this is the state a caller reports), and the
    //  formed amounts off the candidates' own ledger.
    out.aqueous = provider.solve(state, verbosity);
    for (const auto& c : cands) out.formed[c.name] = c.n;
    return out;
}

} // namespace solidEq
} // namespace Choupo
