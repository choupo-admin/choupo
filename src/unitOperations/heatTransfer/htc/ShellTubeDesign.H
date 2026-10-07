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
    Choupo::shellTubeDesign

Description
    THE ONE HOME OF THE SHELL-AND-TUBE THERMAL AND HYDRAULIC ARITHMETIC
    (2026-10-07, DEV.md 4c C48).

    Until this file existed the Kern procedure lived inside the two-stream
    `heatExchanger` unit (`model geometry;` rates a declared bundle, `model
    design;` sizes one from a duty), and the sizing pass -- which is where a
    plant's exchangers are DESIGNED, on its specification sheets -- could not
    reach it: it sized every exchanger as A = Q/(U*LMTD) with an author-set U.
    A second Kern written into the sizer would have been a second home for
    the same correlations, the same bundle table and the same pressure-drop
    rule, and the two would drift the first time either was touched.  So the
    arithmetic was MOVED here, verbatim, and both callers call it:

        * `HeatExchanger::solve` (the unit; its results byte-identical to
          what they were before the move, measured on every geometry/design
          witness against a build of the parent commit);
        * `ShellTubeHX` (the sizer's `design {}` route).

    WHAT LIVES HERE (pure arithmetic on properties the CALLER evaluated --
    this file reads no thermo package and no dictionary):

        * the Kern shell-side equivalent diameter, per tube pattern;
        * the Sinnott bundle-diameter constants K1, n1 and the shell ID a
          tube count implies (bundle + a fixed 12 mm clearance);
        * the tube-side and shell-side film evaluations through a
          `HeatTransferCorrelation` (Gnielinski / Dittus-Boelter / Kern);
        * the overall coefficient on the OUTSIDE area, with the cylindrical
          wall and -- new -- the two FOULING resistances (zero by default,
          which leaves the unit's arithmetic bit for bit what it was);
        * the eps-NTU effectiveness (counter, co-current, 1-2 multi-pass);
        * the LMTD correction factor F of a 1-shell / 2n-tube-pass exchanger
          (Bowman, Mueller & Nagle 1940, in the R-S form Kern 1950 eq. 7.41
          and Sinnott (Coulson & Richardson vol. 6) eq. 12.6 print);
        * the Kern pressure drops, tube side and shell side;
        * the search for the smallest tube count that delivers a duty.

    What does NOT live here: where the properties are evaluated (inlet,
    mean, outlet), which side a fluid goes, and what the answer is called on
    a report -- those are the CALLER's decisions and each states its own.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"
#include "unitOperations/heatTransfer/htc/HeatTransferCorrelation.H"

#include <functional>
#include <string>
#include <utility>

namespace Choupo {
namespace shellTubeDesign {

//  The tube bundle, as declared.  Lengths in metres, wall conductivity in
//  W/(m K).  `passes` is the number of TUBE passes in ONE shell pass.
struct TubeBundle
{
    scalar tubeID     = 0.0;
    scalar tubeOD     = 0.0;
    scalar tubeLength = 0.0;
    scalar pitch      = 0.0;
    int    passes     = 1;
    bool   triangular = true;
    scalar wallK      = 0.0;
};

//  One side's fluid, its properties evaluated by the caller at whatever
//  state the caller states.  `cp` is MASS-specific, J/(kg K).
struct SideFluid
{
    scalar mdot   = 0.0;     // kg/s
    scalar rho    = 0.0;     // kg/m3
    scalar mu     = 0.0;     // Pa s
    scalar lambda = 0.0;     // W/(m K)
    scalar cp     = 0.0;     // J/(kg K)
    bool   heating = true;   // is this side being heated?
};

//  The bundle-to-shell clearance the unit has always used [m].  ONE home: a
//  sizer that reports a shell ID reports the same clearance the unit adds.
constexpr scalar shellClearance = 0.012;

//  Kern's shell-side equivalent diameter
//      D_e = C/d_o (p^2 - c d_o^2),
//  square pitch C = 1.27, c = 0.785 (pi/4); triangular C = 1.10, c = 0.917.
scalar equivalentDiameter(const TubeBundle& b);

//  Sinnott's bundle-diameter constants for D_b = d_o (N/K1)^(1/n1), per
//  tube pattern and number of tube passes (1, 2, 4, 6; any other value
//  takes the 8-pass row, as the unit always has -- a caller that wants to
//  refuse an unlisted count checks `listedPassCount` first).
std::pair<scalar, scalar> bundleConstants(bool triangular, int passes);
bool listedPassCount(int passes);

//  The shell ID N tubes imply: D_b + `shellClearance`.
scalar shellFromTubes(const TubeBundle& b, int N);

//  The outside heat-transfer area of N tubes, pi d_o L N [m2].
scalar outsideArea(const TubeBundle& b, int N);

//  ---- the two films --------------------------------------------------------
struct TubeSideState
{
    scalar             flowArea = 0.0;   // per pass [m2]
    scalar             u        = 0.0;   // [m/s]
    HeatTransferResult film;
};
//  Tubes per pass = N / passes in INTEGER division -- the unit's arithmetic,
//  kept; a designer who wants every pass full picks N a multiple of passes.
TubeSideState tubeSide(const TubeBundle& b, int N, const SideFluid& f,
                       const HeatTransferCorrelation& corr);

struct ShellSideState
{
    scalar             D_e       = 0.0;  // equivalent diameter [m]
    scalar             crossArea = 0.0;  // A_s = D_s C' B / p   [m2]
    scalar             G         = 0.0;  // crossflow mass flux  [kg/(m2 s)]
    scalar             u         = 0.0;  // crossflow velocity   [m/s]
    HeatTransferResult film;
};
ShellSideState shellSide(const TubeBundle& b, scalar shellID,
                         scalar baffleSpacing, const SideFluid& f,
                         const HeatTransferCorrelation& corr);

//  ---- the overall coefficient ----------------------------------------------
//  On the OUTSIDE area:
//      1/U = r_o/(r_i h_i) + r_o ln(r_o/r_i)/k_w + 1/h_o
//            + R_f,o + R_f,i r_o/r_i
//  The fouling resistances are DECLARED per side on the area of that side
//  (TEMA's convention); the inside one is referred to the outside area by
//  r_o/r_i.  Both zero -> exactly the clean coefficient the unit computes.
struct Resistances
{
    scalar R_inner     = 0.0;   // r_o/(r_i h_i)          [m2 K/W]
    scalar R_wall      = 0.0;   // r_o ln(r_o/r_i)/k_w
    scalar R_outer     = 0.0;   // 1/h_o
    scalar R_foulInner = 0.0;   // R_f,i r_o/r_i (referred to the outside)
    scalar R_foulOuter = 0.0;   // R_f,o
    scalar U_clean     = 0.0;   // 1/(R_inner + R_wall + R_outer)
    scalar U           = 0.0;   // with fouling (== U_clean when both are 0)
    std::string controlling;    // "tube-side" | "shell-side" | "wall" (clean)
};
Resistances overall(const TubeBundle& b, scalar h_i, scalar h_o,
                    scalar R_foulInside = 0.0, scalar R_foulOutside = 0.0);

//  ---- eps-NTU ---------------------------------------------------------------
//  passes >= 2: 1 shell pass, 2n tube passes,
//      eps = 2 / { (1+Cr) + sqrt(1+Cr^2) (1+E)/(1-E) },  E = exp(-NTU sqrt(1+Cr^2));
//  else counter-current (Cr -> 1 limit NTU/(1+NTU)) or co-current.
scalar effectiveness(scalar NTU, scalar Cr, int passes, bool counter);

//  ---- the LMTD correction of a 1-shell / 2n-tube-pass exchanger -------------
//  Hot side T1 -> T2, cold side t1 -> t2 (either fluid may be in the shell;
//  the formula is symmetric in that choice):
//      R = (T1 - T2)/(t2 - t1),  S = (t2 - t1)/(T1 - t1)
//      F = sqrt(R^2+1) ln[(1-S)/(1-RS)] /
//          { (R-1) ln[ (2 - S(R+1-sqrt(R^2+1))) / (2 - S(R+1+sqrt(R^2+1))) ] }
//  with the R = 1 limit taken analytically.  A side that does not change
//  temperature (a boiling or condensing utility) makes the arrangement
//  irrelevant and F = 1 exactly.  `feasible` is false when no single
//  1-2 shell can deliver the duty (a temperature cross inside the shell:
//  a log argument goes non-positive); F is then NaN.
struct LmtdCorrection
{
    scalar F        = 1.0;
    scalar R        = 0.0;
    scalar S        = 0.0;
    bool   feasible = true;
};
LmtdCorrection oneTwoCorrection(scalar T1, scalar T2, scalar t1, scalar t2);

//  ---- Kern pressure drops ---------------------------------------------------
//  Tube side: f (Fanning) = 0.079 Re^-0.25 (smooth, turbulent, stated window
//  Re 4e3-1e5); dP = (4 f L n_p / d_i + 4 n_p) (rho u^2 / 2), the four
//  velocity heads per pass being Kern's return-loss allowance.
//  Shell side: f_s = exp(0.576 - 0.19 ln Re_s) (stated window 400-1e6),
//  dP = f_s G_s^2 D_s (N_b + 1) / (2 rho D_e), (mu/mu_w)^0.14 = 1.
struct TubePressureDrop
{
    scalar f  = 0.0;
    scalar dP = 0.0;   // Pa
    bool   inValidity = true;
};
TubePressureDrop tubePressureDrop(const TubeBundle& b, scalar rho, scalar u,
                                  scalar Re);

struct ShellPressureDrop
{
    int    nBaffles = 0;
    scalar f  = 0.0;
    scalar dP = 0.0;   // Pa
    bool   inValidity = true;
};
ShellPressureDrop shellPressureDrop(const TubeBundle& b, scalar shellID,
                                    scalar baffleSpacing, scalar rho,
                                    scalar G, scalar D_e, scalar Re);

//  ---- the design search -----------------------------------------------------
//  The smallest integer n >= 1 for which `delivered(n) >= target`, given
//  that `delivered` grows with n.  Doubling from 4 until the target is met
//  (or 100000 is passed), then bisection; ROUNDS UP -- never undersize.
//  This is the unit's own search, moved here unchanged.
int smallestCount(const std::function<scalar(int)>& delivered, scalar target);

} // namespace shellTubeDesign
} // namespace Choupo
