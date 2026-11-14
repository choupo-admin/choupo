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

#include "StoredCorrelation.H"
#include "core/Advisory.H"
#include "thermo/Component.H"

#include <cmath>
#include <stdexcept>
#include <string>

namespace Choupo {

scalar StoredCorrelation::kernel(scalar A, scalar B, scalar n, scalar Tc, scalar T)
{
    const scalar tau = 1.0 - T / Tc;
    return A * std::pow(tau, n) + B * std::pow(tau, n + 1.0);   // N/m
}

scalar StoredCorrelation::sigmaPure(const Component& c, scalar T) const
{
    if (!c.hasSurfaceTension() && !withFallback_)
        throw std::runtime_error("surface tension (law type tauPower): component '"
            + c.name() + "' has no `surfaceTension` block, so it has no record law"
            " to read -- add the block with its source, or name a predictive model"
            " (`model BrockBird;`) for the property.");
    if (!c.hasSurfaceTension())
    {
        //  A fallback announced, never silent: this component declares no
        //  measured sigma(T), so the corresponding-states estimate answers.
        AdvisoryLog::instance().add(
            "validity", "warning", "component '" + c.name() + "'",
            "surface tension: the record carries no `surfaceTension` block,"
            " so StoredCorrelation fell back to Brock-Bird (an estimate from"
            " Tc, Pc and Tb, not a measurement)");
        return fallback_.sigmaPure(c, T);
    }
    //  A block of named laws: the law bound by the package (the record's
    //  preferred, or the case's pin); a bare block is its own one law.
    auto p = law_.empty() ? c.surfaceTensionDict() : c.surfaceTensionDict()->subDict(law_);
    const scalar A  = p->lookupScalar("A");
    const scalar B  = p->lookupScalarOrDefault("B", 0.0);
    const scalar n  = p->lookupScalar("n");
    const scalar Tc = p->lookupScalar("Tc");

    if (T >= Tc)
        throw std::runtime_error(
            "StoredCorrelation: '" + c.name() + "' is at or above the"
            " stored Tc of its surfaceTension block -- no liquid surface.");

    //  THE WINDOW IS ANNOUNCED, NEVER ENFORCED (as the viscosity models):
    //  once per component through the AdvisoryLog, which outlives this object.
    if (p->found("Tmin") && p->found("Tmax"))
    {
        const scalar lo = p->lookupScalar("Tmin");
        const scalar hi = p->lookupScalar("Tmax");
        if (hi > lo && (T < lo || T > hi))
            AdvisoryLog::instance().add(
                "validity", "warning", "component '" + c.name() + "'",
                "surface tension evaluated at T = " + std::to_string(T)
                + " K, OUTSIDE its declared range (" + std::to_string(lo)
                + " " + std::to_string(hi) + ") -- extrapolated, still"
                " returned");
    }
    return kernel(A, B, n, Tc, T);
}

} // namespace Choupo
