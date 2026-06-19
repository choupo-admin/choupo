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

#include "Splitter.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

int Splitter::solve(const DictPtr& dict,
                    const ThermoPackage& thermo,
                    int verbosity)
{
    auto feedDict = dict->subDict("feed");
    auto operDict = dict->subDict("operation");
    auto compDict = dict->subDict("composition");

    const scalar F  = feedDict->lookupScalar("F");
    const scalar T  = feedDict->lookupScalar("T");
    const scalar P  = feedDict->lookupScalar("P");
    const scalar vf = feedDict->lookupScalarOrDefault("vf", 0.0);

    const std::size_t n = thermo.n();
    sVector z(n, 0.0);
    scalar zsum = 0.0;
    for (const auto& key : compDict->keys())
    {
        std::size_t i = thermo.indexOf(key);
        z[i] = compDict->lookupScalar(key);
        zsum += z[i];
    }
    if (zsum > 0.0) for (auto& v : z) v /= zsum;

    // Solid phase (if any): a splitter divides flow without changing the
    // intensive state, so the solid molar flow splits by the same fraction.
    sVector s_in(n, 0.0);
    if (feedDict->found("solids"))
    {
        auto sol = feedDict->subDict("solids");
        if (sol->found("solidMolarFlows"))
        {
            auto sf = sol->subDict("solidMolarFlows");
            for (const auto& key : sf->keys())
                s_in[thermo.indexOf(key)] = sf->lookupScalar(key);
        }
    }

    auto fractions = operDict->lookupList("fractions");
    if (fractions.empty())
        throw std::runtime_error("Splitter: 'fractions' list is empty");

    scalar fsum = 0.0;
    for (auto f : fractions) fsum += f;
    if (std::abs(fsum - 1.0) > 1.0e-6)
    {
        std::cerr << "Warning: splitter fractions sum to " << fsum
                  << "; normalising.\n";
        for (auto& f : fractions) f /= fsum;
    }

    if (verbosity >= 2)
    {
        std::cout << "Splitter:\n"
                  << "  F_in = " << std::fixed << std::setprecision(4) << (F * 3600.0)
                  << "  kmol/h   T = " << T << " K   P = " << (P * 1.0e-5) << " bar\n"
                  << "  Outlet fractions:";
        for (auto f : fractions) std::cout << "  " << f;
        std::cout << "\n  Flows out: ";
        for (auto f : fractions) std::cout << "  " << (f * F * 3600.0);
        std::cout << "  kmol/h\n\n";
    }

    produced_.clear();
    for (std::size_t k = 0; k < fractions.size(); ++k)
    {
        ProcessStream s;
        s.name = "branch" + std::to_string(k);
        s.F    = F * fractions[k];
        s.T    = T;
        s.P    = P;
        s.z    = z;
        s.vf   = vf;                          // splitter preserves the phase
        s.s.assign(n, 0.0);
        for (std::size_t i = 0; i < n; ++i) s.s[i] = s_in[i] * fractions[k];
        produced_.push_back(s);
    }

    return 0;
}

} // namespace Choupo
