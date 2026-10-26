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

#include <cmath>
#include <cstddef>
#include <vector>

namespace Choupo {

/// Bubble-point temperature at the given liquid composition x and
/// pressure P.  Uses Newton-1D on  f(T) = Σ K_i(T, x) x_i - 1  with a
/// finite-difference derivative.  Tguess is the initial T; values near
/// the actual bubble-T speed convergence.  `tolerance` is on |f|, and the
/// Newton returns without a step once the SEED already meets it -- so a
/// caller that re-solves from its previous T (the Wang-Henke column, which
/// passes 1e-12) must ask for more than its own outer test, or T stops
/// moving once the per-pass change in x is small.
///
/// `yVapour`, when given, is the vapour composition the vapour's fugacity
/// coefficients are evaluated at: K_i(T, x, y).  Absent, K is taken at
/// y = x -- exact for an ideal vapour, whose fugacity does not depend on
/// its composition, and an approximation for any other (DEV.md 4c C169:
/// a column on SRK published states that did not satisfy the package's
/// equilibrium by 9.4e-4 in ln K).  A caller with a non-ideal vapour
/// passes the vapour its stage actually sends up.
scalar bubbleT(const ThermoPackage& thermo,
               const sVector& x,
               scalar P,
               scalar Tguess,
               scalar tolerance = 1.0e-8,
               const sVector* yVapour = nullptr);

/// THE TRIVIAL SATURATION ROOT (DEV.md 4c C131, family a).  A bubble or dew
/// residual sum K x - 1 (or sum y/K - 1) is satisfied IDENTICALLY when every
/// present K is 1: the two phases are the same phase.  That happens when both
/// fugacities are read on ONE root of a cubic -- phi-phi with the trial
/// phase at the given phase's own composition, above the mixture's
/// pseudo-critical, or a "vapour" root that the cubic only has as a liquid
/// one.  It is a root of the equation and not a saturation point: measured,
/// the equimolar propane + n-butane bubble AND dew temperature at 10 bar on
/// phi-phi Peng-Robinson both came back "converged" at the 251.8 K seed
/// (an independent iterated-incipient-phase solve gives 320.7 K and
/// 332.8 K), and N2 + CH4 at 20.6 bar at the 200 K bracket floor.
///
/// True when at least TWO components are present and every present K is 1
/// to `tol`.  A PURE component is excluded on purpose: its genuine
/// saturation point has K = 1 too, so the test cannot tell the two apart
/// there.
inline bool trivialSaturationK(const sVector& K, const sVector& comp,
                               scalar tol = 1.0e-9)
{
    std::size_t present = 0;
    for (std::size_t i = 0; i < comp.size() && i < K.size(); ++i)
    {
        if (comp[i] == 0.0) continue;
        ++present;
        if (!(std::abs(K[i] - 1.0) <= tol)) return false;
    }
    return present >= 2;
}

/// K = 1 FOR EVERY COMPONENT IS ALSO AN AZEOTROPE, so the K test above is
/// necessary and not sufficient (C131 refutation).  Measured: bubbleT02's
/// UNIQUAC ethanol + water at its own azeotrope (x_ethanol = 0.8310270237,
/// 1.01325 bar, a gamma-phi ideal-gas package with no cubic anywhere) gives
/// |K - 1| < 1e-12 at a GENUINE bubble point, and the K test alone refused it
/// as "the vapour was priced on the liquid's own root".  The trivial root
/// exists only where BOTH fugacities are read off ONE equation of state:
///   * a gamma-phi package prices the liquid on gamma Psat and the vapour on
///     its own EoS -- K = 1 there is an azeotrope, never a trivial root;
///   * a phi-phi package whose EoS can name its liquid root separately is
///     trivial only when the two roots at the given phase's composition are
///     the SAME root (one real root of the cubic); two distinct roots with
///     K = 1 are an EoS azeotrope.  A phi-phi EoS that cannot name its liquid
///     root (no `hasLiquidRoot()`) is judged by K alone.
bool trivialSaturationRoot(const ThermoPackage& thermo, scalar T, scalar P,
                           const sVector& comp, const sVector& K,
                           scalar tol = 1.0e-9);

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
