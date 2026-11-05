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

    CHART READING OR CLOSED FORM, THE STUDENT'S CHOICE.  In Hewitt's method
    J_L (leakage) and J_B (bypass), and R_L and R_B for the pressure drop,
    are READ FROM BELL'S CHARTS (Figs 6.8-6.11); the book prints no equation
    for them.  Each of `JL`, `JB`, `RL`, `RB` is either a DECLARED number (the
    chart reading) or the word `auto`, which computes Taborek's closed form
    (HEDH 3.3), as printed identically in Goncalves, Costa & Bagajewicz
    (AIChE J. 2019) and Mohammadi et al. (arXiv:1810.02243, Eqs 22-27):
      J_L = 0.44(1-r_s) + [1-0.44(1-r_s)] exp(-2.2 r_lm)
      J_B = exp[-C F_sbp (1-(2 N_ss/N_c)^(1/3))], C = 1.35 (Re <= 100) or
            1.25, and 1 for N_ss/N_c >= 1/2
      R_L = exp[-1.33 (1+r_s) r_lm^p], p = 0.8 - 0.15 (1+r_s)
      R_B = exp[-C_bp F_sbp (1-(2 N_ss/N_c)^(1/3))], C_bp = 4.5 (Re <= 100)
            or 3.7, and 1 for N_ss/N_c >= 1/2
    with r_s = S_sb/(S_sb+S_tb), r_lm = (S_sb+S_tb)/S_m.  Absent, the factor
    REFUSES by name; the run announces which route each took.  On Example 6.2
    the closed forms land on the chart readings within the reading error
    (gate).  NOT carried: J_r and J_s (Hewitt applies neither), and R_s with
    the end-zone term of Serth/Taborek (the sources disagree on a factor 0.5;
    Hewitt's Eq 6.31 end zones carry R_B only, which is what is used).  The laminar adverse-gradient factor J_r is not applied
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
    //  The FORM of the method: `Hewitt` (the default, the book of W2: J_s = 1,
    //  J_r not applied, clearances diametral) or `Serth` (Serth, Process Heat
    //  Transfer 2007, Section 6.3-6.6 as printed: his flow areas, J_S, J_R,
    //  R_S and the end-zone assembly of Eqs 6.15-6.16).
    std::string form = "Hewitt";
    //  Serth form only: chart readings of the ideal bank (Serth Fig 6.1, as
    //  Example 6.1 reads them) in place of Eqs 6.1-6.4, -1 when not declared.
    scalar jIdeal = -1.0, fIdeal = -1.0;
    bool   clearanceRadial = true;   // Serth form: declared `clearanceBasis`
    //  Serth form only: inlet / outlet baffle spacings (default: B).
    scalar baffleSpacingIn = -1.0, baffleSpacingOut = -1.0;
    //  Chart readings, NaN when not declared.
    scalar JL = -1.0, JB = -1.0, RL = -1.0, RB = -1.0;
    //  `auto`: the factor is COMPUTED by Taborek's closed form (HEDH 3.3).
    bool autoJL = false, autoJB = false, autoRL = false, autoRB = false;
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
    //  Serth form only (1 otherwise): J_S, J_R, R_S, and the ideal-bank
    //  friction factor f; dpEnd = the end-zone drop (Eq 6.15).
    scalar JS = 1, JR = 1, RS = 1, fIdeal = 0, dpEnd = 0, jIdeal = 0;
    bool   serthForm = false;
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
