/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

#include "PricedDensity.H"

#include <cmath>
#include <exception>

namespace Choupo {
namespace pricedDensity {

Selection select(const ThermoPackage& thermo, scalar T, scalar P,
                 const sVector& z, DensityPhase ph)
{
    const std::size_t n = thermo.n();
    Selection s;
    s.zPriced.assign(n, 0.0);
    for (std::size_t i = 0; i < n && i < z.size(); ++i)
    {
        if (!(z[i] > 0.0)) continue;
        sVector pure(n, 0.0); pure[i] = 1.0;
        scalar rhoPure = 0.0;
        try { rhoPure = thermo.density(T, P, pure, ph); }
        catch (const std::exception&) { rhoPure = 0.0; }
        if (rhoPure > 0.0 && std::isfinite(rhoPure))
        { s.zPriced[i] = z[i]; s.keptFraction += z[i]; }
        else
        {
            s.droppedFraction += z[i];
            if (!s.dropped.empty()) s.dropped += ", ";
            s.dropped += thermo.comp(i).name();
        }
    }
    if (s.keptFraction > 0.0)
        for (auto& v : s.zPriced) v /= s.keptFraction;
    return s;
}

} // namespace pricedDensity
} // namespace Choupo
