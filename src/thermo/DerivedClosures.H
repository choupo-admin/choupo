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
    src/thermo/DerivedClosures.H

Description
    THE one home of the derived-closure correlations that the
    estimateComponent `derived {}` grammar names.  Each dict word maps to
    exactly one function here:

        omega  LeeKesler     -> closures::leeKeslerOmega(Tb, Tc, Pc_atm)
        Vliq   Rackett       -> closures::rackettVliq(T, Tc, Pc_Pa, omega)
        Hvap   Watson        -> closures::watsonLatent(Href, Tref, T, Tc)
        Psat   AmbroseWalton -> AmbroseWalton::psat (already a registered
                                VaporPressureModel: runtime and estimator
                                share ONE implementation)

    Consolidated from free functions previously scattered across Joback.cpp
    and EstimateComponent.cpp.  When Wagner / COSTALD / Lydersen land they
    join this header (or graduate it into a registry).
\*---------------------------------------------------------------------------*/

#pragma once

#include <cmath>

namespace Choupo {
namespace closures {

inline double leeKeslerOmega(double Tb, double Tc, double Pc_atm)
{
    const double Tbr = Tb / Tc;
    const double t6 = std::pow(Tbr, 6);
    const double alpha = -std::log(Pc_atm) - 5.97214 + 6.09648 / Tbr
                       + 1.28862 * std::log(Tbr) - 0.169347 * t6;
    const double beta = 15.2518 - 15.6875 / Tbr - 13.4721 * std::log(Tbr)
                      + 0.43577 * t6;
    return alpha / beta;
}

inline double rackettVliq(double T, double Tc, double Pc_Pa, double omega)
{
    const double R   = 8.314462618;            // J/(mol K)
    const double Tr  = T / Tc;
    const double Zra = 0.29056 - 0.08775 * omega;
    const double exponent = 1.0 + std::pow(1.0 - Tr, 2.0 / 7.0);
    return (R * Tc / Pc_Pa) * std::pow(Zra, exponent);
}

//  Watson's latent-heat scaling (exponent 0.38): the heat of vaporisation at
//  T from a reference value Href at Tref, both below Tc; 0 at or above Tc.
//  THE one home (DEV.md 4c C454): Component::Hvap_latent and the monomer
//  datum bridge each wrote this line out (the 2026-11-19 correlation census).
//  The 0.38 is Watson's exponent; its primary source was not re-read for
//  this slice, so none is cited here (an invented citation is worse than
//  none) -- the citation is the next step of the correlation-object work.
inline double watsonLatent(double Href, double Tref, double T, double Tc)
{
    if (T >= Tc) return 0.0;
    return Href * std::pow((Tc - T) / (Tc - Tref), 0.38);
}

} // namespace closures
} // namespace Choupo
