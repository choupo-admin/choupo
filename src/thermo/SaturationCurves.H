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
    src/thermo/SaturationCurves.H

Description
    Free helpers for saturation-locus calculations: single-point bubble-T
    and a binary T-x-y sweep that the GUI's Plots tab consumes.

    Why a free helper instead of going through the BubblePoint /
    DewPoint unit ops:  the unit-op wrapper carries a dict-driven
    setup, banners, KPIs, and a residual log.  For an inner
    convergence-style loop (binary sweep, distillation stage update,
    column flash interior) we just want the answer — pedagogy is
    served better by giving students one shared helper they can read.

    A binary T-x-y diagram is produced as a single Newton-per-point
    sweep:  for each x_1 in (0, 1), solve  Σ K_i(T, x) x_i = 1
    for T = T_bubble(x).  At that T the equilibrium vapour
    composition is  y_i = K_i(T, x) · x_i,  so each bubble-T solve
    delivers ONE point on the bubble curve (x_1, T) AND one point
    on the dew curve (y_1, T).  No separate dew-T solve is needed.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"
#include "thermo/ThermoPackage.H"

#include <vector>

namespace Choupo {

/// Bubble-point temperature at the given liquid composition x and
/// pressure P.  Uses Newton-1D on  f(T) = Σ K_i(T, x) x_i - 1  with a
/// finite-difference derivative.  Tguess is the initial T; values near
/// the actual bubble-T speed convergence.
scalar bubbleT(const ThermoPackage& thermo,
               const sVector& x,
               scalar P,
               scalar Tguess);

/// Stored binary T-x-y locus.  Both vectors share the same temperature
/// axis: Tbubble[i] is the bubble-T of liquid xBubble[i] AND the dew-T
/// of vapour yDew[i].
struct BinaryTxy
{
    scalar              P;             // [bar]
    std::string         comp1;         // name of component plotted on the x-axis
    std::string         comp2;
    std::vector<scalar> xBubble;       // liquid mole fraction of comp1
    std::vector<scalar> Tbubble;       // [K]
    std::vector<scalar> yDew;          // vapour mole fraction of comp1
    std::vector<scalar> Tdew;          // [K]  (== Tbubble — same Newton solve)
};

/// Sweep x_1 across (0, 1) using nPoints interior points and build a
/// binary T-x-y diagram at constant P.  Skips x_1 = 0 and x_1 = 1
/// exactly to avoid pure-component edge cases where some activity
/// models can be singular; the curve still extends close enough to the
/// boiling points for a clean plot.  Only valid when thermo.n() == 2.
BinaryTxy binaryTxy(const ThermoPackage& thermo,
                    scalar P,
                    int nPoints = 31);

} // namespace Choupo
