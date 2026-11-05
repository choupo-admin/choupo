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
Description
    Bell-Delaware shell-side rating -- see BellDelaware.H for the sources,
    what is declared (the chart readings) and what refuses by name.
\*---------------------------------------------------------------------------*/

#include "BellDelaware.H"

#include "core/Dimensions.H"

#include <cmath>
#include <sstream>
#include <stdexcept>

namespace Choupo {
namespace bellDelaware {

namespace {

const scalar kPi = 3.14159265358979323846;

[[noreturn]] void refuse(const std::string& what)
{
    throw std::runtime_error("bellDelaware: " + what);
}

std::string num(scalar v)
{
    std::ostringstream os;
    os << v;
    return os.str();
}

//  The row spacing in the flow direction, Hewitt after Eq 6.18.
scalar rowPitch(Layout l, scalar PT)
{
    switch (l)
    {
        case Layout::Square:        return PT;
        case Layout::Triangular:    return 0.866 * PT;
        case Layout::RotatedSquare: return 0.707 * PT;
    }
    return PT;
}

const char* layoutWord(Layout l)
{
    switch (l)
    {
        case Layout::Square:        return "square";
        case Layout::Triangular:    return "triangular";
        case Layout::RotatedSquare: return "rotatedSquare";
    }
    return "?";
}

//  Serth Table 6.1 (p. 201), read from the page image.  One row per Reynolds
//  band; a1, a2 for the j factor (Eq 6.1), b1, b2 for the friction factor
//  (Eq 6.2); a3, a4, b3, b4 per layout (Eqs 6.3, 6.4).
struct SerthJ { scalar a1, a2, b1, b2; };
struct SerthLayout
{
    scalar a3, a4, b3, b4;
    SerthJ band[5];       // [0] Re<10, [1] 10-100, [2] 100-1e3, [3] 1e3-1e4, [4] 1e4-1e5
    bool   bandCarried[5];
};

const SerthLayout& serthLayout(Layout l)
{
    static const SerthLayout tri = { 1.450, 0.519, 7.00, 0.500,
        { {1.400, -0.667, 48.0, -1.000}, {1.360, -0.657, 45.1, -0.973},
          {0.593, -0.477, 4.570, -0.476}, {0.321, -0.388, 0.486, -0.152},
          {0.321, -0.388, 0.372, -0.123} },
        { true, true, true, true, true } };
    //  45 degrees, Re 10-100: the page PRINTS a1 = 0.498 where the pattern of
    //  the other layouts (1.360 between 1.400 and 0.593; 0.900 between 0.970
    //  and 0.408) and of its own neighbours (1.550, 0.730) points to 1.498,
    //  and one code transcription reads 1.498.  Serth's worked example is a
    //  square layout, so it cannot arbitrate: the row is NOT carried (j and f
    //  alike), by name.
    static const SerthLayout rot = { 1.930, 0.500, 6.59, 0.520,
        { {1.550, -0.667, 32.0, -1.000}, {0.0, 0.0, 0.0, 0.0},
          {0.730, -0.500, 3.500, -0.476}, {0.370, -0.396, 0.333, -0.136},
          {0.370, -0.396, 0.303, -0.126} },
        { true, false, true, true, true } };
    static const SerthLayout sq = { 1.187, 0.370, 6.30, 0.378,
        { {0.970, -0.667, 35.0, -1.000}, {0.900, -0.631, 32.1, -0.963},
          {0.408, -0.460, 6.090, -0.602}, {0.107, -0.266, 0.0815, -0.220},
          {0.370, -0.395, 0.391, -0.148} },
        { true, true, true, true, true } };
    switch (l)
    {
        case Layout::Triangular:    return tri;
        case Layout::RotatedSquare: return rot;
        case Layout::Square:        return sq;
    }
    return sq;
}

int serthBand(const SerthLayout& L, Layout layout, scalar Re)
{
    int b;
    if      (Re < 10.0)   b = 0;
    else if (Re < 100.0)  b = 1;
    else if (Re < 1.0e3)  b = 2;
    else if (Re < 1.0e4)  b = 3;
    else if (Re <= 1.0e5) b = 4;
    else refuse("cross-flow Re = " + num(Re) + " exceeds the 1e5 end of"
                " Serth Table 6.1; not extrapolated.");
    if (!L.bandCarried[b])
        refuse("the Serth row for " + std::string(layoutWord(layout))
               + " pitch at Re 10-100 is not carried: the page prints a1 ="
               " 0.498 where the neighbouring rows and the other layouts"
               " point to 1.498 (a probable misprint), and Serth's worked"
               " example is a square layout, so it cannot arbitrate.  Cross-"
               "flow Re = " + num(Re));
    return b;
}

scalar flowAreaSm(const Spec& s, scalar Dotl)
{
    const scalar Ds = s.shellID, Do = s.tubeOD, PT = s.pitch, LB = s.baffleSpacing;
    switch (s.layout)
    {
        case Layout::Square:                                   // Eq 6.9
            return LB * (Ds - Dotl + (Dotl - Do) / PT * (PT - Do));
        case Layout::RotatedSquare:                            // Eq 6.10
            return LB * (Ds - Dotl + (Dotl - Do) / (0.707 * PT) * (PT - Do));
        case Layout::Triangular:                               // Eq 6.11
            return LB * (Ds - Dotl + (Dotl - Do) / PT * (PT - Do));
    }
    return 0.0;
}

} // namespace

NuConstants hewittConstants(Layout l, scalar Re)
{
    //  Hewitt Table 2.5 (ESDU 73031), P_T/D = 1.2 to 4.
    if (l == Layout::RotatedSquare)
        refuse("the Hewitt ideal bank is not carried for rotated-square pitch"
               " (Table 2.4, which assigns layouts to the two rows of Table"
               " 2.5, is an image the scan does not give).  Use `idealBank"
               " Serth;` (45 degrees) or square / triangular pitch.");
    if (Re < 10.0 || Re > 2.0e6)
        refuse("cross-flow Re = " + num(Re) + " is outside Table 2.5 (10 to"
               " 2e6); the ideal bank is not extrapolated.");
    const bool inLine = (l == Layout::Square);
    if (inLine)
    {
        if (Re < 3.0e2)  return {0.142, 0.431};
        if (Re < 2.0e5)  return {0.211, 0.651};
        return {0.116, 0.700};
    }
    if (Re < 3.0e2)
        refuse("the staggered (triangular-pitch) constants of Table 2.5 for Re"
               " 10-300 are not carried: one digit of that row is read from a"
               " single scan occurrence only.  Cross-flow Re = " + num(Re));
    if (Re < 2.0e5)  return {0.273, 0.635};
    return {0.124, 0.700};
}

Fluid readFluid(const DictPtr& d)
{
    Fluid f;
    f.mdot   = d->lookupScalar("mdot",   Dims::massFlow);
    f.rho    = d->lookupScalar("rho",    Dims::density);
    f.mu     = d->lookupScalar("mu",     Dims::viscosity);
    f.lambda = d->lookupScalar("lambda", Dims::thermalCond);
    f.cp     = d->lookupScalar("cp",     Dims::heatCapacity);
    return f;
}

Spec readSpec(const DictPtr& g, const DictPtr& bd, bool benchOverrides)
{
    Spec s;
    s.shellID       = g->lookupScalar("shellID", Dims::length);
    s.tubeOD        = g->lookupScalar("tubeOD", Dims::length);
    s.pitch         = g->lookupScalar("tubePitch", Dims::length);
    s.baffleSpacing = g->lookupScalar("baffleSpacing", Dims::length);
    s.nTubes        = static_cast<int>(g->lookupScalar("nTubes"));
    s.tubeLength    = g->lookupScalar("tubeLength", Dims::length);
    const std::string pat = g->lookupWordOrDefault("tubePattern", "triangular");
    if      (pat == "square")        s.layout = Layout::Square;
    else if (pat == "triangular")    s.layout = Layout::Triangular;
    else if (pat == "rotatedSquare") s.layout = Layout::RotatedSquare;
    else refuse("tubePattern '" + pat + "' is not carried.  Accepted: square,"
                " triangular, rotatedSquare (the rotated-triangular Sm"
                " equation, Hewitt Eq 6.12, is unreadable in the scan).");

    s.baffleCutPct = bd->lookupScalar("baffleCutPercent");
    s.bundleShellClearance = bd->lookupScalar("bundleShellClearance", Dims::length);
    s.tubeBaffleClearance  = bd->lookupScalar("tubeBaffleClearance", Dims::length);
    s.shellBaffleClearance = bd->lookupScalar("shellBaffleClearance", Dims::length);
    s.baffleThickness = bd->lookupScalarOrDefault("baffleThickness", 0.0, Dims::length);
    s.nBaffles = static_cast<int>(bd->lookupScalarOrDefault("nBaffles", 0.0));
    s.idealBank = bd->lookupWordOrDefault("idealBank", "Hewitt");
    if (s.idealBank != "Hewitt" && s.idealBank != "Serth")
        refuse("idealBank '" + s.idealBank + "' is not carried.  Accepted:"
               " Hewitt (Table 2.5, the default) or Serth (Table 6.1).");
    s.form = bd->lookupWordOrDefault("form", "Hewitt");
    if (s.form != "Hewitt" && s.form != "Serth")
        refuse("form '" + s.form + "' is not carried.  Accepted: Hewitt (the"
               " default: J_s = 1, J_r not applied) or Serth (Serth 2007,"
               " Section 6.3-6.6: his flow areas, J_S, J_R, R_S and the"
               " end-zone assembly of Eqs 6.15-6.16).");
    if (s.form != "Serth")
        for (const char* k : {"jIdeal", "fIdeal", "baffleSpacingInlet",
                              "baffleSpacingOutlet"})
            if (bd->found(k))
                refuse(std::string("`") + k + "` belongs to `form Serth;`;"
                       " the Hewitt form takes equal baffle spacing and the"
                       " ideal bank of its own table.");
    if (s.form == "Serth")
    {
        if (!bd->found("clearanceBasis"))
            refuse("`form Serth;` needs `clearanceBasis radial|diametral;`:"
                   " Serth's Eqs 6.22 and 6.36 use the tube-baffle and"
                   " shell-baffle clearances as the gap itself (a ring of"
                   " area pi D delta, `radial`), while the TEMA values his"
                   " Example 6.1 inserts are diametral; the base is declared,"
                   " never defaulted.  `diametral` halves the gap.");
        const std::string cb = bd->lookupWord("clearanceBasis");
        if (cb != "radial" && cb != "diametral")
            refuse("clearanceBasis '" + cb + "' is not carried.  Accepted:"
                   " radial or diametral.");
        s.clearanceRadial = (cb == "radial");
    }
    else if (bd->found("clearanceBasis"))
        refuse("`clearanceBasis` belongs to `form Serth;` (the Hewitt form"
               " reads its clearances as diametral, as TEMA states them).");
    if (bd->found("jIdeal")) s.jIdeal = bd->lookupScalar("jIdeal");
    if (bd->found("fIdeal")) s.fIdeal = bd->lookupScalar("fIdeal");
    if (bd->found("baffleSpacingInlet"))
        s.baffleSpacingIn = bd->lookupScalar("baffleSpacingInlet", Dims::length);
    if (bd->found("baffleSpacingOutlet"))
        s.baffleSpacingOut = bd->lookupScalar("baffleSpacingOutlet", Dims::length);
    if (bd->found("sealingStripRatio"))
        s.sealingStripRatio = bd->lookupScalar("sealingStripRatio");
    if (bd->found("sealingStripPairs"))
        s.sealingStripPairs = bd->lookupScalar("sealingStripPairs");
    if (s.sealingStripRatio < 0.0 && s.sealingStripPairs < 0.0)
        refuse("declare the sealing strips: `sealingStripRatio` (N_ss/N_c, the"
               " chart parameter of Hewitt Fig 6.9) or `sealingStripPairs`"
               " (pairs per bundle; N_ss/N_c is then derived).");
    //  Each factor is a DECLARED chart reading (a number) or the word
    //  `auto` (the Taborek closed form, computed in rate()).
    auto readFactor = [&](const char* key, scalar& value, bool& isAuto)
    {
        if (!bd->found(key)) return;
        const EntryValue& ev = bd->entryValue(key);
        if (std::holds_alternative<std::string>(ev))
        {
            if (std::get<std::string>(ev) != "auto")
                refuse(std::string("`") + key + "` is the word '"
                       + std::get<std::string>(ev) + "'; write a chart"
                       " reading (a number) or `auto`.");
            isAuto = true;  return;
        }
        value = bd->lookupScalar(key);
    };
    readFactor("JL", s.JL, s.autoJL);
    readFactor("JB", s.JB, s.autoJB);
    readFactor("RL", s.RL, s.autoRL);
    readFactor("RB", s.RB, s.autoRB);
    if (bd->found("SmPrinted"))
    {
        if (!benchOverrides)
            refuse("`SmPrinted` is a bench-only key (it reproduces a"
                   " textbook's printed S_m); the unit computes S_m from"
                   " the declared geometry.");
        s.SmPrinted = bd->lookupScalar("SmPrinted", Dims::area);
    }

    if (s.shellID <= 0 || s.tubeOD <= 0 || s.pitch <= s.tubeOD
        || s.baffleSpacing <= 0 || s.nTubes <= 0 || s.tubeLength <= 0)
        refuse("inconsistent geometry (need shellID, tubeOD > 0, tubePitch >"
               " tubeOD, baffleSpacing, nTubes, tubeLength > 0).");
    if (s.baffleCutPct < 15.0 || s.baffleCutPct > 45.0)
        refuse("baffleCutPercent = " + num(s.baffleCutPct) + " is outside the"
               " 15 to 45 % window of the linear J_c fit (Hewitt Eq 6.14);"
               " the method is not extrapolated.");
    if (s.bundleShellClearance <= 0 || s.tubeBaffleClearance <= 0
        || s.shellBaffleClearance <= 0)
        refuse("the three diametral clearances (bundleShell, tubeBaffle,"
               " shellBaffle) must be > 0 -- they set the leakage and bypass"
               " areas.");
    return s;
}

Result rate(const Spec& s, const Fluid& f)
{
    Result r;
    const scalar Ds = s.shellID, Do = s.tubeOD, PT = s.pitch, LB = s.baffleSpacing;
    if (!(f.mdot > 0 && f.rho > 0 && f.mu > 0 && f.lambda > 0 && f.cp > 0))
        refuse("the shell-side fluid needs positive mdot, rho, mu, lambda and cp.");

    const bool serth = (s.form == "Serth");
    r.serthForm = serth;
    if (serth && s.idealBank != "Serth")
        refuse("`form Serth;` takes the ideal bank of Serth's own Table 6.1:"
               " declare `idealBank Serth;` (or the chart readings `jIdeal`"
               " and `fIdeal`, as his Example 6.1 reads Fig 6.1).");
    r.Dotl = Ds - s.bundleShellClearance;
    if (r.Dotl <= Do)
        refuse("bundle diameter D_s - delta_b = " + num(r.Dotl)
               + " m does not exceed the tube OD.");
    r.Lc = s.baffleCutPct / 100.0 * Ds;
    r.Sm = flowAreaSm(s, r.Dotl);
    if (s.SmPrinted > 0.0)
    {
        r.assumptions.push_back("S_m = " + num(s.SmPrinted) + " m2 is the"
            " textbook's PRINTED value (bench override); Eq 6.9 gives "
            + num(r.Sm) + " m2");
        r.Sm = s.SmPrinted;
    }
    if (r.Sm <= 0.0) refuse("the cross-flow area S_m is not positive.");
    r.Vmax = f.mdot / (f.rho * r.Sm);                         // Eq 6.8
    r.Re = f.rho * r.Vmax * Do / f.mu;                        // Eq 2.219
    r.Pr = f.cp * f.mu / f.lambda;

    r.assumptions.push_back("viscosity ratio (mu/mu_wall)^0.14 and F1 taken as"
        " 1 (no wall viscosity is evaluated; the same isothermal-wall posture"
        " as the Kern path)");
    if (!serth)
        r.assumptions.push_back("the laminar adverse-gradient factor J_r is not"
            " applied (Hewitt does not apply it; Taborek's (10/N_c)^0.18 is not"
            " carried); the unequal end-spacing factor J_s is taken as 1 (equal"
        " baffle spacing)");

    //  ---- the ideal bank --------------------------------------------------
    if (s.idealBank == "Hewitt")
    {
        const scalar ptd = PT / Do;
        if (ptd < 1.2 || ptd > 4.0)
            refuse("P_T/D_o = " + num(ptd) + " is outside Table 2.5 (1.2 to 4).");
        const NuConstants c = hewittConstants(s.layout, r.Re);
        r.h_ideal = f.lambda / Do * c.a * std::pow(r.Re, c.m)
                    * std::pow(r.Pr, 0.34);                    // Eq 2.218
        r.assumptions.push_back("ideal bank: Hewitt Eq 2.218 / Table 2.5 ("
            + std::string(layoutWord(s.layout)) + " pitch, a = " + num(c.a)
            + ", m = " + num(c.m) + "), F1 = F2 = 1");
    }
    else
    {
        const SerthLayout& L = serthLayout(s.layout);
        const int b = serthBand(L, s.layout, r.Re);
        const scalar a = L.a3 / (1.0 + 0.14 * std::pow(r.Re, L.a4));   // Eq 6.3
        scalar j = L.band[b].a1 * std::pow(1.33 / (PT / Do), a)
                   * std::pow(r.Re, L.band[b].a2);                     // Eq 6.1
        const scalar jEq = j;
        if (s.jIdeal > 0.0) j = s.jIdeal;
        r.jIdeal = j;
        const scalar G = f.mdot / r.Sm;
        r.h_ideal = j * f.cp * G * std::pow(r.Pr, -2.0 / 3.0);
        if (s.jIdeal > 0.0)
            r.assumptions.push_back("ideal bank: Serth Eq 6.5 at the DECLARED"
                " chart reading j = " + num(j) + " (Serth Fig 6.1; Eq 6.1"
                " gives " + num(jEq) + ")");
        else
            r.assumptions.push_back("ideal bank: Serth Table 6.1 / Eqs 6.1, 6.3"
                " (Colburn j, Re on the cross-flow velocity and D_o --"
                " Taborek's definition): j = " + num(j)
                + (serth ? std::string(" (reproduced against Serth's Example"
                                       " 6.1 by the gate)")
                         : std::string(": an ARITHMETIC anchor only, no worked"
                                       " example of Serth's was run in the"
                                       " Hewitt form")));
    }

    //  ---- J_c: the baffle configuration ----------------------------------
    if (serth)
    {
        //  Serth Eqs 6.23-6.25, 6.35: the circle through the tube CENTRES.
        const scalar Dctl = r.Dotl - Do;
        const scalar x = Ds * (1.0 - 2.0 * s.baffleCutPct / 100.0) / Dctl;
        if (x >= 1.0) r.Fc = 1.0;
        else
        {
            const scalar th = 2.0 * std::acos(x);
            r.Fc = 1.0 + (std::sin(th) - th) / kPi;
        }
        r.Jc = 0.55 + 0.72 * r.Fc;                             // Eq 6.45
    }
    else
    {
        const scalar x = (Ds - 2.0 * r.Lc) / r.Dotl;
        if (x >= 1.0) r.Fc = 1.0;
        else          r.Fc = (kPi + 2.0 * x * std::sin(std::acos(x))
                              - 2.0 * std::acos(x)) / kPi;     // Eq 6.13
        r.Jc = 0.55 + 0.72 * r.Fc;                             // Eq 6.14
    }

    //  ---- leakage and bypass areas, and the chart coordinates ------------
    if (serth)
    {
        //  Serth Eqs 6.36-6.39 and 6.22 use the clearance as the GAP (a ring
        //  of area pi D delta); the case declares whether its numbers are
        //  that gap (`radial`) or the diametral clearance (halved).
        const scalar g = s.clearanceRadial ? 1.0 : 0.5;
        r.Ssb = Ds * (g * s.shellBaffleClearance)
              * (kPi - std::acos(1.0 - 2.0 * s.baffleCutPct / 100.0));
        r.Stb = 0.5 * kPi * Do * (g * s.tubeBaffleClearance) * s.nTubes
              * (1.0 + r.Fc);
        r.assumptions.push_back(std::string("form Serth: clearances declared ")
            + (s.clearanceRadial ? "radial (the gap itself, as Serth's"
                                   " Example 6.1 inserts the TEMA values)"
                                 : "diametral (halved into the gap)")
            + " -- Serth Eqs 6.22 and 6.36");
    }
    else
    {
        r.Ssb = Ds * (s.shellBaffleClearance / 2.0)
              * (kPi - std::acos(1.0 - 2.0 * r.Lc / Ds));      // Eq 6.15
        r.Stb = kPi * Do * (s.tubeBaffleClearance / 2.0) * s.nTubes
              * (1.0 + r.Fc) / 2.0;                            // Eq 6.16
    }
    r.leakageRatio = (r.Ssb + r.Stb) / r.Sm;
    r.leakageSplit = r.Ssb / (r.Ssb + r.Stb);
    r.Fbp = (Ds - r.Dotl) * LB / r.Sm;                         // Eq 6.17
    const scalar PTP = rowPitch(s.layout, PT);
    r.Nc = Ds * (1.0 - 2.0 * r.Lc / Ds) / PTP;                 // Eq 6.18
    r.NssOverNc = (s.sealingStripRatio >= 0.0) ? s.sealingStripRatio
                                               : s.sealingStripPairs / r.Nc;

    //  ---- J_L and J_B: a declared chart reading, or `auto` ----------------
    const bool haveJL = (s.JL >= 0.0) || s.autoJL;
    const bool haveJB = (s.JB >= 0.0) || s.autoJB;
    if (!haveJL || !haveJB)
        refuse("choose how J_L and J_B are obtained, for each: declare Bell's"
               " chart reading (`JL` from Hewitt Fig 6.8 at (S_sb+S_tb)/S_m = "
               + num(r.leakageRatio) + " and S_sb/(S_sb+S_tb) = "
               + num(r.leakageSplit) + "; `JB` from Fig 6.9 at F_bp = "
               + num(r.Fbp) + " and N_ss/N_c = " + num(r.NssOverNc)
               + ") or write the word `auto` for Taborek's closed form"
                 " (HEDH 3.3).  Neither is the default: the glass-box choice"
                 " is the student's.");
    if ((!s.autoJL && (s.JL <= 0.0 || s.JL > 1.0))
        || (!s.autoJB && (s.JB <= 0.0 || s.JB > 1.0)))
        refuse("JL and JB read from Bell's charts lie in (0, 1]; got JL = "
               + num(s.JL) + ", JB = " + num(s.JB) + ".");
    if (r.Fbp > 0.7)
        refuse("F_bp = " + num(r.Fbp) + " exceeds the 0.7 end of the J_B chart"
               " (Hewitt Fig 6.9); the bypass is not read beyond it.");
    const scalar rs  = r.leakageSplit;                 // S_sb/(S_sb+S_tb)
    const scalar rlm = r.leakageRatio;                 // (S_sb+S_tb)/S_m
    const scalar strips = 1.0 - std::pow(2.0 * r.NssOverNc, 1.0 / 3.0);
    const bool laminar = (r.Re <= 100.0);
    const std::string taborek = "Taborek, HEDH 3.3 (as printed in Goncalves,"
        " Costa & Bagajewicz, AIChE J. 2019, and Mohammadi et al., arXiv:"
        "1810.02243 Eqs 22-27)";
    if (s.autoJL)
    {
        r.JL = 0.44 * (1.0 - rs)
             + (1.0 - 0.44 * (1.0 - rs)) * std::exp(-2.2 * rlm);
        r.assumptions.push_back("J_L = " + num(r.JL) + " COMPUTED, " + taborek
            + ": 0.44(1-r_s) + [1-0.44(1-r_s)] exp(-2.2 r_lm)");
    }
    else
    {
        r.JL = s.JL;
        r.assumptions.push_back("J_L = " + num(s.JL) + " is a DECLARED chart"
            " reading (Hewitt Fig 6.8), as the textbook takes it; the chart"
            " coordinates are published");
    }
    if (s.autoJB)
    {
        const scalar C = laminar ? 1.35 : 1.25;
        r.JB = (r.NssOverNc >= 0.5) ? 1.0
             : std::exp(-C * r.Fbp * strips);
        r.assumptions.push_back("J_B = " + num(r.JB) + " COMPUTED, " + taborek
            + ": exp[-C F_sbp (1-(2 N_ss/N_c)^(1/3))], C = " + num(C)
            + (laminar ? " (Re <= 100)" : " (Re > 100)")
            + ", 1 when N_ss/N_c >= 1/2");
    }
    else
    {
        r.JB = s.JB;
        r.assumptions.push_back("J_B = " + num(s.JB) + " is a DECLARED chart"
            " reading (Hewitt Fig 6.9), as the textbook takes it; the chart"
            " coordinates are published");
    }
    r.combined = r.Jc * r.JL * r.JB;
    int nbSerth = 0;
    if (serth)
    {
        //  J_S, R_S (Eqs 6.54-6.55) and J_R (Eqs 6.56-6.57).
        nbSerth = s.nBaffles;
        if (nbSerth <= 0)
            nbSerth = static_cast<int>(std::lround(
                s.tubeLength / (LB + s.baffleThickness) - 1.0));
        if (nbSerth < 1)
            refuse("the tube length leaves no baffles; declare `nBaffles`.");
        const scalar Bin  = (s.baffleSpacingIn  > 0.0) ? s.baffleSpacingIn  : LB;
        const scalar Bout = (s.baffleSpacingOut > 0.0) ? s.baffleSpacingOut : LB;
        const scalar n1 = (r.Re >= 100.0) ? 0.6 : 1.0 / 3.0;
        const scalar n2 = (r.Re >= 100.0) ? 0.2 : 1.0;
        r.JS = ((nbSerth - 1) + std::pow(Bin / LB, 1.0 - n1)
                + std::pow(Bout / LB, 1.0 - n1))
             / ((nbSerth - 1) + Bin / LB + Bout / LB);         // Eq 6.54
        r.RS = 0.5 * (std::pow(LB / Bin, 2.0 - n2)
                      + std::pow(LB / Bout, 2.0 - n2));        // Eq 6.55
        const scalar Ncw0 = 0.8 * r.Lc / rowPitch(s.layout, PT);
        const scalar Nct = (nbSerth + 1) * (r.Nc + Ncw0);      // Eq 6.56
        if (r.Re <= 20.0)       r.JR = std::pow(10.0 / Nct, 0.18);
        else if (r.Re >= 100.0) r.JR = 1.0;
        else
        {
            const scalar J20 = std::pow(10.0 / Nct, 0.18);
            r.JR = J20 + (r.Re - 20.0) / 80.0 * (1.0 - J20);   // Eq 6.57
        }
        r.combined *= r.JR * r.JS;
        r.assumptions.push_back("form Serth: J_S = " + num(r.JS) + " (Eq 6.54,"
            " n1 = " + num(n1) + "), R_S = " + num(r.RS) + " (Eq 6.55, n2 = "
            + num(n2) + "), J_R = " + num(r.JR) + " (Eqs 6.56-6.57, N_ct = "
            + num(Nct) + "), all COMPUTED (1 for equal spacing and Re >= 100)");
    }
    r.h = r.h_ideal * r.combined;                              // Eq 6.19 / 6.5

    //  ---- shell-side pressure drop ---------------------------------------
    const bool haveRL = (s.RL >= 0.0) || s.autoRL;
    const bool haveRB = (s.RB >= 0.0) || s.autoRB;
    if (!haveRL && !haveRB) return r;
    if (!haveRL || !haveRB)
        refuse("declare both RL (Hewitt Fig 6.10, or `auto`) and RB (Fig 6.11,"
               " or `auto`), or neither: the pressure drop needs both.");
    if ((!s.autoRL && (s.RL <= 0.0 || s.RL > 1.0))
        || (!s.autoRB && (s.RB <= 0.0 || s.RB > 1.0)))
        refuse("RL and RB read from Bell's charts lie in (0, 1].");
    auto applyR = [&]()
    {
        if (s.autoRL)
        {
            const scalar p = 0.8 - 0.15 * (1.0 + rs);
            r.RL = std::exp(-1.33 * (1.0 + rs) * std::pow(rlm, p));
            r.assumptions.push_back("R_L = " + num(r.RL) + " COMPUTED, " + taborek
                + ": exp[-1.33 (1+r_s) r_lm^p], p = 0.8 - 0.15 (1+r_s)");
        }
        else
        {
            r.RL = s.RL;
            r.assumptions.push_back("R_L = " + num(s.RL) + " is a DECLARED chart"
                " reading (Hewitt Fig 6.10)");
        }
        if (s.autoRB)
        {
            const scalar Cbp = laminar ? 4.5 : 3.7;
            r.RB = (r.NssOverNc >= 0.5) ? 1.0
                 : std::exp(-Cbp * r.Fbp * strips);
            r.assumptions.push_back("R_B = " + num(r.RB) + " COMPUTED, " + taborek
                + ": exp[-C_bp F_sbp (1-(2 N_ss/N_c)^(1/3))], C_bp = " + num(Cbp)
                + (laminar ? " (Re <= 100)" : " (Re > 100)")
                + ", 1 when N_ss/N_c >= 1/2");
        }
        else
        {
            r.RB = s.RB;
            r.assumptions.push_back("R_B = " + num(s.RB) + " is a DECLARED chart"
                " reading (Hewitt Fig 6.11)");
        }
    };
    if (serth)
    {
        if (r.Re < 100.0)
            refuse("the laminar window drop (Serth Eq 6.12) is not carried;"
                   " the shell-side drop of the Serth form needs cross-flow"
                   " Re >= 100.  Re = " + num(r.Re));
        r.hasDp = true;
        const SerthLayout& L = serthLayout(s.layout);
        const int bb = serthBand(L, s.layout, r.Re);
        scalar fI;
        {
            const scalar b = L.b3 / (1.0 + 0.14 * std::pow(r.Re, L.b4));   // Eq 6.4
            fI = L.band[bb].b1 * std::pow(1.33 / (PT / Do), b)
                 * std::pow(r.Re, L.band[bb].b2);                          // Eq 6.2
        }
        const scalar fEq = fI;
        if (s.fIdeal > 0.0) fI = s.fIdeal;
        r.fIdeal = fI;
        if (s.fIdeal > 0.0)
            r.assumptions.push_back("ideal-bank friction factor f = " + num(fI)
                + " is a DECLARED chart reading (Serth Fig 6.1; Eq 6.2 gives "
                + num(fEq) + ")");
        else
            r.assumptions.push_back("ideal-bank friction factor f = " + num(fI)
                + " from Serth Eqs 6.2, 6.4");
        r.Ncw = 0.8 * r.Lc / rowPitch(s.layout, PT);                   // Eq 6.11
        {
            const scalar y = 1.0 - 2.0 * s.baffleCutPct / 100.0;
            r.Sw = Ds * Ds / 4.0 * (std::acos(y) - y * std::sqrt(1.0 - y * y))
                 - s.nTubes / 8.0 * (1.0 - r.Fc) * kPi * Do * Do;      // Eq 6.44
        }
        if (r.Sw <= 0.0) refuse("the window flow area S_w is not positive.");
        const scalar Gm = f.mdot / r.Sm;
        r.dpc = 2.0 * fI * r.Nc * Gm * Gm / f.rho;                     // Eq 6.7
        r.dpw = (2.0 + 0.6 * r.Ncw) * f.mdot * f.mdot
              / (2.0 * r.Sm * r.Sw * f.rho);                           // Eq 6.10
        r.nBaffles = nbSerth;
        applyR();
        r.dPcross = (r.nBaffles - 1) * r.dpc * r.RB;
        r.dPwindows = r.nBaffles * r.dpw;
        r.dpEnd = 2.0 * r.dpc * (1.0 + r.Ncw / r.Nc) * r.RB * r.RS;    // Eq 6.15
        //  Eq 6.9 puts R_L on the central spaces as well as on the windows
        //  (Eq 6.14); the printed summary Eq 6.16 omits it, and the worked
        //  example's arithmetic follows Eq 6.9.
        r.dP = (r.dPcross + r.dPwindows) * r.RL + r.dpEnd;
        r.assumptions.push_back("shell dP: Serth Eqs 6.7, 6.9-6.11, 6.14-6.15,"
            " excluding the nozzles; R_L multiplies the central spaces and the"
            " windows (Eqs 6.9, 6.14), as the worked example evaluates it");
        return r;
    }
    if (s.layout != Layout::Square)
        refuse("the shell-side pressure drop is carried for square pitch only:"
               " the triangular K_f equations (Hewitt Eqs 6.23-6.24) lose their"
               " signs in the scan and are not typed from memory.");
    if (std::fabs(PT / Do - 1.25) > 0.01)
        refuse("the K_f interpolation (Hewitt Eq 6.22, Zukauskas & Ulinskas)"
               " is given for P_T/D_o = 1.25 only; this bundle has "
               + num(PT / Do) + ".");
    if (r.Re < 2.0e3 || r.Re > 2.0e6)
        refuse("the in-line K_f equation carried (Eq 6.22) covers cross-flow"
               " Re 2e3 to 2e6; Re = " + num(r.Re) + ".  Eq 6.21 (3 < Re < 2e3)"
               " loses its signs in the scan and is not carried.");
    r.hasDp = true;
    applyR();
    r.Kf = 0.267 + 0.249e4 / r.Re - 0.927e7 / (r.Re * r.Re)
         + 0.10e11 / (r.Re * r.Re * r.Re);                     // Eq 6.22
    const scalar q = 0.5 * f.rho * r.Vmax * r.Vmax;
    r.dpc = r.Nc * r.Kf * q;                                   // Eq 6.20
    r.Ncw = 0.8 * r.Lc / PTP;                                  // Eq 6.27
    {
        const scalar y = (Ds - 2.0 * r.Lc) / Ds;
        r.Sw = Ds * Ds / 4.0 * (std::acos(y) - y * std::sqrt(1.0 - y * y))
             - s.nTubes / 8.0 * (1.0 - r.Fc) * kPi * Do * Do; // Eq 6.28
    }
    if (r.Sw <= 0.0) refuse("the window flow area S_w is not positive.");
    r.dpw = (2.0 + 0.6 * r.Ncw) * f.mdot * f.mdot
          / (2.0 * r.Sm * r.Sw * f.rho);                       // Eq 6.26
    r.nBaffles = s.nBaffles;
    if (r.nBaffles <= 0)
        r.nBaffles = static_cast<int>(std::lround(
            s.tubeLength / (LB + s.baffleThickness) - 1.0));
    if (r.nBaffles < 1)
        refuse("the tube length leaves no baffles; declare `nBaffles`.");
    r.dPcross = (r.nBaffles - 1) * r.dpc * r.RB;
    r.dPwindows = r.nBaffles * r.dpw;
    r.dP = (r.dPcross + r.dPwindows) * r.RL
         + 2.0 * r.dpc * r.RB * (1.0 + r.Ncw / r.Nc);          // Eq 6.31
    r.assumptions.push_back("the drop excludes the nozzles (Hewitt, after Eq"
        " 6.31); Hewitt's end zones carry R_B only, so the end-zone spacing"
        " factor R_s (whose 0.5 factor the sources disagree on) is not used");
    return r;
}

} // namespace bellDelaware
} // namespace Choupo
