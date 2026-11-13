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
Namespace
    Choupo::compactionLaw

Description
    THE TWO COMPACTION CURVES, FORWARD AND INVERSE, IN ONE HOME (DEV.md 4c
    C270, 2026-11-13).  The compaction bench (`CompactionFit`) FITS Heckel
    and Ryshkewitch-Duckworth to a measured dataset; the rated tablet press
    (`RatedMachineSize`, kind tabletPress, `compaction {}` block) INVERTS the
    same two lines to find the pressure, and the force, that make a tablet of
    a declared tensile strength.  Both include this header, so the equation
    the bench fits is, character for character, the equation the press
    inverts -- a second transcription is the arity sin, and the day one of
    them moved the two would disagree in silence.

      HECKEL (Heckel 1961a,b)
          ln(1/(1 - D)) = K P + A
          forward:  D(P)  = 1 - exp(-(K P + A))
          inverse:  P(D)  = (ln(1/(1 - D)) - A) / K
          D_A = 1 - exp(-A), the densification at zero pressure; P(D) is
          negative below it: no positive pressure gives a less dense compact
          than the line's own intercept.

      RYSHKEWITCH-DUCKWORTH (Ryshkewitch 1953; Duckworth 1953)
          sigma_t = sigma_0 exp(-k_b eps)
          inverse:  eps(sigma_t) = ln(sigma_0 / sigma_t) / k_b
          defined for 0 < sigma_t < sigma_0 and k_b > 0: at sigma_0 the
          porosity is zero, above it no porosity gives the strength.

    PURE ARITHMETIC: no dictionary, no refusal and no announcement here --
    the caller owns the checks (a target at or above sigma_0, a non-positive
    constant, a density the line cannot reach), so each refusal reads in the
    caller's own words.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <cmath>

namespace Choupo {
namespace compactionLaw {

//  ---- Heckel ----------------------------------------------------------------
//  The ordinate the bench plots and fits: ln(1/(1 - D)).
inline scalar heckelOrdinate(scalar D) { return std::log(1.0 / (1.0 - D)); }

//  The fitted line at a pressure: K P + A.
inline scalar heckelLine(scalar K, scalar A, scalar P) { return K * P + A; }

//  The relative density the line gives at a pressure.
inline scalar heckelRelativeDensity(scalar K, scalar A, scalar P)
{
    return 1.0 - std::exp(-heckelLine(K, A, P));
}

//  The pressure at which the line reaches a relative density (the inverse).
inline scalar heckelPressure(scalar K, scalar A, scalar D)
{
    return (heckelOrdinate(D) - A) / K;
}

//  D_A = 1 - exp(-A): the densification the line extrapolates to at P = 0.
inline scalar heckelInterceptDensity(scalar A) { return 1.0 - std::exp(-A); }

//  ---- Ryshkewitch-Duckworth ---------------------------------------------------
//  The fitted strength at a porosity: sigma_0 exp(-k_b eps).
inline scalar rdStrength(scalar sigma0, scalar kb, scalar eps)
{
    return sigma0 * std::exp(-kb * eps);
}

//  The porosity at which the curve gives a strength (the inverse).
inline scalar rdPorosity(scalar sigma0, scalar kb, scalar sigmaT)
{
    return std::log(sigma0 / sigmaT) / kb;
}

} // namespace compactionLaw
} // namespace Choupo
