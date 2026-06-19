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

#include "Composition.H"

#include <cmath>
#include <iostream>
#include <stdexcept>

namespace Choupo {

sVector readComposition(const DictPtr&        parent,
                        const ThermoPackage&  thermo,
                        const std::string&    context)
{
    const bool hasMolar  = parent->found("molarComposition");
    const bool hasMass   = parent->found("massComposition");
    const bool hasLegacy = parent->found("composition");
    const int  nSpec = int(hasMolar) + int(hasMass) + int(hasLegacy);

    if (nSpec == 0)
        throw std::runtime_error(context + ": no composition declared --- "
            "expected one of `molarComposition`, `massComposition`, "
            "or `composition`");
    if (nSpec > 1)
        throw std::runtime_error(context + ": specify exactly ONE of "
            "`molarComposition`, `massComposition`, `composition` --- "
            "not several");

    auto cd = parent->subDict(hasMass    ? "massComposition"
                          : hasMolar   ? "molarComposition"
                                       : "composition");
    const std::size_t n = thermo.n();
    sVector z(n, 0.0);

    auto normaliseWithWarn = [&](sVector& v, const std::string& block)
    {
        scalar sum = 0.0;
        for (auto x : v) sum += x;
        if (sum <= 0.0)
            throw std::runtime_error(context + ": " + block +
                " sums to zero");
        if (std::abs(sum - 1.0) > 1.0e-3)
            std::cerr << "WARNING: " << context << ": " << block
                      << " sums to " << sum << " (should be 1.0); "
                         "values will be normalised\n";
        for (auto& x : v) x /= sum;
    };

    if (hasMass)
    {
        sVector w(n, 0.0);
        for (const auto& key : cd->keys())
        {
            std::size_t i = thermo.indexOf(key);
            w[i] = cd->lookupScalar(key);
        }
        normaliseWithWarn(w, "massComposition");
        for (std::size_t i = 0; i < n; ++i)
        {
            const scalar mw = thermo.comp(i).MW();
            if (w[i] > 0.0 && mw <= 0.0)
                throw std::runtime_error(context + ": component '" +
                    thermo.comp(i).name() + "' has no MW --- needed to "
                    "convert mass to mole fractions");
            z[i] = (mw > 0.0) ? w[i] / mw : 0.0;
        }
        scalar denom = 0.0;
        for (auto x : z) denom += x;
        if (denom > 0.0) for (auto& x : z) x /= denom;
    }
    else
    {
        for (const auto& key : cd->keys())
        {
            std::size_t i = thermo.indexOf(key);
            z[i] = cd->lookupScalar(key);
        }
        normaliseWithWarn(z,
            hasMolar ? "molarComposition" : "composition");
    }

    return z;
}

} // namespace Choupo
