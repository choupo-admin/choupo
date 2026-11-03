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
    Choupo::bellDelaware

Description
    SHELL-SIDE RATING BY THE BELL-DELAWARE METHOD, as the textbook prints it
    (2026-11-04, DEV.md 4c C214 W2).  Pure arithmetic on properties the
    CALLER evaluated: this file reads no thermo package.  Its dictionary
    reader (`readSpec`) is the one place the declared keys are parsed, shared
    by the `heatExchanger` unit (`model BellDelaware;`) and the props bench
    `bellDelawareBench` (which runs it at DECLARED fluid properties, so the
    textbook's worked example can be reproduced digit by digit).

    SOURCES, each READ (page + equation), none typed from memory:
      * Hewitt, Shires & Bott, *Process Heat Transfer* (CRC Press, 1994),
        Section 6.3.2 (Bell-Delaware heat transfer, pp. 275-278: Eqs 6.8-6.19
        and Figs 6.7-6.9; pressure drop, pp. 278-280: Eqs 6.20, 6.22, 6.26-6.31
        and Figs 6.10-6.11) and EXAMPLE 6.2 (pp. 280-285), the worked
        example the gate reproduces step by step.  The ideal cross-flow bank
        is its Eq 2.218 with Table 2.5 (ESDU Item 73031).
      * Taborek (1983, HEDH 3.3), for the linear Jc = 0.55 + 0.72 Fc, as
        Hewitt Eq 6.14 prints it (15 % < baffle cut < 45 %).
      * Serth, *Process Heat Transfer* (Academic Press, 2007), Table 6.1 and
        Eqs 6.1-6.4, as the SECOND selectable ideal bank (`idealBank Serth`).

    WHAT IS DECLARED INSTEAD OF COMPUTED -- AS THE TEXTBOOK DOES.  In
    Hewitt's method J_L (leakage) and J_B (bypass), and R_L and R_B for the
    pressure drop, are READ FROM BELL'S CHARTS (Figs 6.8-6.11); the book
    prints no equation for them.  Choupo invents none: the case DECLARES
    `JL`, `JB`, `RL`, `RB` ("read from the chart"), the run announces that,
    and publishes the chart coordinates (the leakage ratios, F_bp, Nss/Nc)
    a student needs to read the chart.  A case that declares none of JL/JB
    REFUSES by name.  The laminar adverse-gradient factor J_r is not applied
    (Hewitt: "doubtful validity in laminar flow ... not included").

    WHAT IS CARRIED, AND WHAT REFUSES BY NAME (the unreadable is not typed):
      * ideal bank `Hewitt`: in-line (square pitch) and staggered
        (triangular pitch) constants of Table 2.5 for the ranges whose digits
        read unambiguously; the rotated layouts are not carried (Table 2.4,
        which assigns layouts to rows, is an image the scan does not give),
        and the staggered Re 10-300 row is not carried (one digit is read
        from a single OCR occurrence only);
      * ideal bank `Serth`: 30/45/90 degree layouts from Table 6.1, with the
        45 degree Re 10-100 row refused (the two transcriptions disagree on
        a1) -- an ARITHMETIC anchor only, no worked example of Serth's seen;
      * shell-side pressure drop: Eqs 6.20-6.31 for a SQUARE in-line bank
        at P_T/D_o = 1.25 and cross-flow Re > 2 000 (Eq 6.22, whose signs
        the worked example confirms by its own arithmetic) and Re > 100 in
        the window; the triangular K_f (Eqs 6.23-6.24, signs lost in the
        scan), Eq 6.21, and the laminar window Eq 6.25 are not carried.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"
#include "core/Dictionary.H"

#include <string>
#include <vector>

namespace Choupo {
namespace bellDelaware {

enum class Layout { Square, RotatedSquare, Triangular };

//  The declared hardware, SI.  Clearances are DIAMETRAL (as TEMA and Hewitt's
//  Example 6.1 state them).
struct Spec
{
    scalar shellID        = 0.0;     // D_s
    scalar tubeOD         = 0.0;     // D_o
    scalar pitch          = 0.0;     // P_T
    Layout layout         = Layout::Square;
    scalar baffleSpacing  = 0.0;     // L_B (central)
    scalar baffleCutPct   = 0.0;     // B_c, percent of D_s
    scalar bundleShellClearance = 0.0; // delta_b: D_otl = D_s - delta_b
    scalar tubeBaffleClearance  = 0.0; // delta_tb
    scalar shellBaffleClearance = 0.0; // delta_sb
    int    nTubes         = 0;       // N_T
    scalar sealingStripRatio = -1.0; // N_ss/N_c (<0: not declared)
    scalar sealingStripPairs = -1.0; // N_ss (pairs), alternative to the ratio
    int    nBaffles       = 0;       // N (0 = derive from tube length)
    scalar baffleThickness = 0.0;
    scalar tubeLength     = 0.0;
    std::string idealBank = "Hewitt";   // Hewitt | Serth
    //  Chart readings, NaN when not declared.
    scalar JL = -1.0, JB = -1.0, RL = -1.0, RB = -1.0;
    //  BENCH ONLY (refused by the unit): the textbook's PRINTED S_m, so that
    //  every later printed step can be reproduced from the book's own
    //  intermediate value (Hewitt Example 6.2 prints S_m = 0.01667 m2, 0.3 %
    //  above its own Eq 6.9 at the Example 6.1 geometry).
    scalar SmPrinted = -1.0;
};

struct Fluid
{
    scalar mdot   = 0.0;   // kg/s
    scalar rho    = 0.0;   // kg/m3
    scalar mu     = 0.0;   // Pa s
    scalar lambda = 0.0;   // W/(m K)
    scalar cp     = 0.0;   // J/(kg K)
};

struct Result
{
    scalar Dotl = 0, Lc = 0, Sm = 0, Vmax = 0, Re = 0, Pr = 0;
    scalar h_ideal = 0, Fc = 0, Jc = 0;
    scalar Ssb = 0, Stb = 0, leakageRatio = 0, leakageSplit = 0;
    scalar Fbp = 0, Nc = 0, NssOverNc = -1.0;
    scalar JL = 0, JB = 0, h = 0, combined = 0;
    //  Pressure drop (valid only when `hasDp`).
    bool   hasDp = false;
    scalar Kf = 0, dpc = 0, Ncw = 0, Sw = 0, dpw = 0, dP = 0, dPcross = 0;
    scalar dPwindows = 0, RL = 0, RB = 0;
    int    nBaffles = 0;
    std::vector<std::string> assumptions;   // announced, in order
};

//  Parse the declared geometry: `geometry` is the dictionary holding
//  shellID, tubeOD (or `tubeOD`), tubePitch, baffleSpacing, nTubes,
//  tubeLength, tubePattern; `bd` the `bellDelaware {}` block.  Refuses by
//  name a missing key, a layout not carried, a value outside the method's
//  window.
Spec readSpec(const DictPtr& geometry, const DictPtr& bd,
              bool benchOverrides = false);
Fluid readFluid(const DictPtr& d);

//  The rating.  Throws std::runtime_error naming what is not carried.
Result rate(const Spec& s, const Fluid& f);

//  The Hewitt Table 2.5 constants (a, m) -- exposed so the gate can hold the
//  carried set to the book.
struct NuConstants { scalar a, m; };
NuConstants hewittConstants(Layout l, scalar Re);

} // namespace bellDelaware
} // namespace Choupo
