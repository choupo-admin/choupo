/* SPDX-License-Identifier: GPL-3.0-or-later */
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
    This file is part of Choupo (GPL-3.0-or-later).
-------------------------------------------------------------------------------
Description
    The Kremser-Souders-Brown shortcut for a DILUTE liquid-liquid extraction
    cascade, as a CHECK on the rigorous stage count -- never a design.  ONE
    home: the `extractor` (a KPI beside its own rigorous count) and the
    `extractionShortcut` props op (the worked examples) both call it.

    Everything is in solute-free RATIOS: X = solute / carrier in the
    raffinate side, Y = solute / extractant in the extract side (mass or
    mole, one basis throughout -- the formulas are scale-free).  With the
    equilibrium line taken straight, Y = K X, and the extraction factor

        E = K S / F          (S extractant flow, F carrier flow, solute-free)

    the countercurrent cascade of N ideal stages obeys

        N = ln[ ((Xf - Ys/K) / (Xr - Ys/K)) (1 - 1/E) + 1/E ] / ln E
                                                      Perry's 9th ed. Eq. (15-43)

    (Example 15-1, p. 15-48: Xf 0.25, Xr 0.01, Ys 0.001, K 0.656, E 1.85 give
    N = 4.3), which is the same cascade as the fractional form
    Treybal, Mass-Transfer Operations 3rd ed., Eq. (10.38),

        (Xf - Xr) / (Xf - Ys/K) = (E^(N+1) - E) / (E^(N+1) - 1),

    and the transfer units follow by N_or = N ln E / (1 - 1/E) (Example 15-3).
    When the solvents are partly miscible and the solute dilute, Perry's
    "case B" replaces Xf and Ys by the pseudo-solute concentrations of
    Eqs. (15-90) and (15-91); both are here.

    WHAT IT ASSUMES, and the caller must say so: a constant K and a constant
    E over the cascade (Perry takes E = sqrt(m1 mr) S/F from the slopes at the
    two ends), solute-free flows constant (immiscible solvents, or case B),
    and nothing about efficiency.  It is exact for a straight equilibrium
    line and approximate for a curved one.
\*---------------------------------------------------------------------------*/

#pragma once

#include <cmath>
#include <limits>

namespace Choupo {
namespace extractionShortcut {

inline double nan() { return std::numeric_limits<double>::quiet_NaN(); }

//  Perry Eq. (15-43).  NaN when the arguments make the cascade impossible
//  (E <= 0, a non-positive logarithm argument, Xr not above Ys/K).
//  E = 1 is the limit N = (Xf - Xr)/(Xr - Ys/K).
inline double stages(double Xf, double Xr, double Ys, double K, double E)
{
    if (!(K > 0.0) || !(E > 0.0)) return nan();
    const double eq = Ys / K;
    const double den = Xr - eq;
    const double num = Xf - eq;
    if (!(den > 0.0) || !(num > 0.0)) return nan();
    if (std::abs(E - 1.0) < 1.0e-9) return (Xf - Xr) / den;
    const double arg = (num / den) * (1.0 - 1.0 / E) + 1.0 / E;
    if (!(arg > 0.0)) return nan();
    return std::log(arg) / std::log(E);
}

//  Treybal Eq. (10.38): the fraction of the available driving force taken
//  up by N stages, (E^(N+1) - E)/(E^(N+1) - 1).
inline double fractionTaken(double N, double E)
{
    if (std::abs(E - 1.0) < 1.0e-9) return N / (N + 1.0);
    const double p = std::pow(E, N + 1.0);
    return (p - E) / (p - 1.0);
}

//  Perry Example 15-3 / Eq. (15-68): transfer units from stages.
inline double transferUnits(double N, double E)
{
    if (std::abs(E - 1.0) < 1.0e-9) return N;
    return N * std::log(E) / (1.0 - 1.0 / E);
}

//  Perry Eq. (15-90): the pseudo-feed concentration of case B.
inline double pseudoFeed(double Xf, double S, double Eout, double F, double Ye)
{
    return Xf + (S - Eout) / F * Ye;
}

//  Perry Eq. (15-91): the pseudo-solvent concentration of case B.
inline double pseudoSolvent(double Ys, double F, double Rout, double S, double Xr)
{
    return Ys + (F - Rout) / S * Xr;
}

} // namespace extractionShortcut
} // namespace Choupo
