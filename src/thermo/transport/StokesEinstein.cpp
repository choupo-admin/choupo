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

#include "StokesEinstein.H"

#include "core/Advisory.H"
#include "thermo/ThermoPackage.H"

#include <cstdio>
#include <iostream>

namespace Choupo {
namespace stokesEinstein {

Factor factorFor(const ThermoPackage& thermo, std::size_t iSolvent, scalar T_K)
{
    Factor f;
    f.T = T_K;
    f.solvent = thermo.comp(iSolvent).name();
    if (!thermo.hasLiquidViscosity()) return f;
    sVector xSolvent(thermo.n(), 0.0);
    xSolvent[iSolvent] = 1.0;
    f.mu     = thermo.viscosityLiquid(T_K, xSolvent);
    f.muRef  = thermo.viscosityLiquid(referenceTemperature, xSolvent);
    //  The electrodialysis stack's expression, in its order (bit for bit).
    f.value  = (T_K / referenceTemperature) * (f.muRef / f.mu);
    f.priced = true;
    return f;
}

Factor factor(const ThermoPackage& thermo, scalar T_K)
{
    const std::string solvent = thermo.solventName().empty()
                              ? std::string("water") : thermo.solventName();
    for (std::size_t i = 0; i < thermo.n(); ++i)
        if (thermo.comp(i).name() == solvent) return factorFor(thermo, i, T_K);
    Factor f;
    f.T = T_K;
    f.solvent = solvent;
    return f;
}

void announce(const Factor& f, const std::string& locus,
              const std::string& reader, int verbosity)
{
    if (f.T == referenceTemperature) return;           // nothing to correct
    char t[32];
    std::snprintf(t, sizeof(t), "%.2f", static_cast<double>(f.T));
    const std::string key = "stokesEinstein:" + locus + ":" + reader + ":" + t;
    if (f.priced)
    {
        char b[320];
        std::snprintf(b, sizeof(b),
            "%s at T = %.2f K: D0(25 C) x Stokes-Einstein (T/T0)(mu(T0)/mu(T))"
            " = %.6f, on the package's liquid viscosity of %s (mu(T) = %.5g,"
            " mu(298.15 K) = %.5g Pa.s)",
            reader.c_str(), static_cast<double>(f.T),
            static_cast<double>(f.value), f.solvent.c_str(),
            static_cast<double>(f.mu), static_cast<double>(f.muRef));
        if (AdvisoryLog::instance().addAnnouncedOnce(key, "model", "info",
                                                     locus, b)
            && verbosity >= 2)
            std::cout << "  [D(T)] " << b << "\n";
    }
    else
    {
        const std::string msg = reader + " at T = " + t + " K: the species"
            " records' 25 C D0, NOT temperature-corrected -- the case declares"
            " no liquid-viscosity model.  Declare `transport { liquid {"
            " viscosity { model Vogel; } } }` in constant/thermoPhysPropDict"
            " for Stokes-Einstein D(T) = D0 (T/298.15)(mu(298.15)/mu(T))";
        if (AdvisoryLog::instance().addAnnouncedOnce(key, "approximation",
                                                     "warning", locus, msg)
            && verbosity >= 1)
            std::cout << "  [D(T)] " << msg << "\n";
    }
}

} // namespace stokesEinstein
} // namespace Choupo
