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

//  Serth Table 6.1 (p. 6/249), j-factor columns.  One row per Reynolds band.
struct SerthJ { scalar a1, a2; };
struct SerthLayout
{
    scalar a3, a4;
    SerthJ band[5];       // [0] Re<10, [1] 10-100, [2] 100-1e3, [3] 1e3-1e4, [4] 1e4-1e5
    bool   bandCarried[5];
};

const SerthLayout& serthLayout(Layout l)
{
    static const SerthLayout tri = { 1.450, 0.519,
        { {1.400, -0.667}, {1.360, -0.657}, {0.593, -0.477},
          {0.321, -0.388}, {0.321, -0.388} },
        { true, true, true, true, true } };
    //  45 degrees: the Re 10-100 row's a1 is read 0.498 in one transcription
    //  and 1.498 in another, so that row is NOT carried.
    static const SerthLayout rot = { 1.930, 0.500,
        { {1.550, -0.667}, {0.0, 0.0}, {0.730, -0.500},
          {0.370, -0.396}, {0.370, -0.396} },
        { true, false, true, true, true } };
    static const SerthLayout sq = { 1.187, 0.370,
        { {0.970, -0.667}, {0.900, -0.631}, {0.408, -0.460},
          {0.107, -0.266}, {0.370, -0.395} },
        { true, true, true, true, true } };
    switch (l)
    {
        case Layout::Triangular:    return tri;
        case Layout::RotatedSquare: return rot;
        case Layout::Square:        return sq;
    }
    return sq;
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
    if (bd->found("sealingStripRatio"))
        s.sealingStripRatio = bd->lookupScalar("sealingStripRatio");
    if (bd->found("sealingStripPairs"))
        s.sealingStripPairs = bd->lookupScalar("sealingStripPairs");
    if (s.sealingStripRatio < 0.0 && s.sealingStripPairs < 0.0)
        refuse("declare the sealing strips: `sealingStripRatio` (N_ss/N_c, the"
               " chart parameter of Hewitt Fig 6.9) or `sealingStripPairs`"
               " (pairs per bundle; N_ss/N_c is then derived).");
    if (bd->found("JL")) s.JL = bd->lookupScalar("JL");
    if (bd->found("JB")) s.JB = bd->lookupScalar("JB");
    if (bd->found("RL")) s.RL = bd->lookupScalar("RL");
    if (bd->found("RB")) s.RB = bd->lookupScalar("RB");
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
    r.assumptions.push_back("the laminar adverse-gradient factor J_r is not"
        " applied (Hewitt: doubtful validity in laminar flow); the unequal"
        " end-spacing factor J_s is taken as 1 (equal baffle spacing)");

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
        int b;
        if      (r.Re < 10.0)   b = 0;
        else if (r.Re < 100.0)  b = 1;
        else if (r.Re < 1.0e3)  b = 2;
        else if (r.Re < 1.0e4)  b = 3;
        else if (r.Re <= 1.0e5) b = 4;
        else refuse("cross-flow Re = " + num(r.Re) + " exceeds the 1e5 end of"
                    " Serth Table 6.1; not extrapolated.");
        if (!L.bandCarried[b])
            refuse("the Serth j-factor row for " + std::string(layoutWord(s.layout))
                   + " pitch at Re 10-100 is not carried: the two transcriptions"
                   " of its a1 disagree (0.498 / 1.498).  Cross-flow Re = "
                   + num(r.Re));
        const scalar a = L.a3 / (1.0 + 0.14 * std::pow(r.Re, L.a4));   // Eq 6.3
        const scalar j = L.band[b].a1 * std::pow(1.33 / (PT / Do), a)
                         * std::pow(r.Re, L.band[b].a2);               // Eq 6.1
        const scalar G = f.mdot / r.Sm;
        r.h_ideal = j * f.cp * G * std::pow(r.Pr, -2.0 / 3.0);
        r.assumptions.push_back("ideal bank: Serth Table 6.1 / Eqs 6.1, 6.3"
            " (Colburn j, Re on the cross-flow velocity and D_o -- Taborek's"
            " definition, assumed): an ARITHMETIC anchor only, no worked"
            " example of Serth's has been checked against it");
    }

    //  ---- J_c: the baffle configuration ----------------------------------
    {
        const scalar x = (Ds - 2.0 * r.Lc) / r.Dotl;
        if (x >= 1.0) r.Fc = 1.0;
        else          r.Fc = (kPi + 2.0 * x * std::sin(std::acos(x))
                              - 2.0 * std::acos(x)) / kPi;     // Eq 6.13
        r.Jc = 0.55 + 0.72 * r.Fc;                             // Eq 6.14
    }

    //  ---- leakage and bypass areas, and the chart coordinates ------------
    r.Ssb = Ds * (s.shellBaffleClearance / 2.0)
          * (kPi - std::acos(1.0 - 2.0 * r.Lc / Ds));          // Eq 6.15
    r.Stb = kPi * Do * (s.tubeBaffleClearance / 2.0) * s.nTubes
          * (1.0 + r.Fc) / 2.0;                                // Eq 6.16
    r.leakageRatio = (r.Ssb + r.Stb) / r.Sm;
    r.leakageSplit = r.Ssb / (r.Ssb + r.Stb);
    r.Fbp = (Ds - r.Dotl) * LB / r.Sm;                         // Eq 6.17
    const scalar PTP = rowPitch(s.layout, PT);
    r.Nc = Ds * (1.0 - 2.0 * r.Lc / Ds) / PTP;                 // Eq 6.18
    r.NssOverNc = (s.sealingStripRatio >= 0.0) ? s.sealingStripRatio
                                               : s.sealingStripPairs / r.Nc;

    //  ---- J_L and J_B: READ FROM THE CHARTS, declared --------------------
    if (s.JL < 0.0 || s.JB < 0.0)
        refuse("JL/JB correlation not carried: declare them from Bell's"
               " charts (`JL` from Hewitt Fig 6.8 at (S_sb+S_tb)/S_m = "
               + num(r.leakageRatio) + " and S_sb/(S_sb+S_tb) = "
               + num(r.leakageSplit) + "; `JB` from Fig 6.9 at F_bp = "
               + num(r.Fbp) + " and N_ss/N_c = " + num(r.NssOverNc)
               + ") or wait for the equation form (Serth Eq 6.x, not yet"
               " seen).  Nothing is invented in their place.");
    if (s.JL <= 0.0 || s.JL > 1.0 || s.JB <= 0.0 || s.JB > 1.0)
        refuse("JL and JB read from Bell's charts lie in (0, 1]; got JL = "
               + num(s.JL) + ", JB = " + num(s.JB) + ".");
    if (r.Fbp > 0.7)
        refuse("F_bp = " + num(r.Fbp) + " exceeds the 0.7 end of the J_B chart"
               " (Hewitt Fig 6.9); the bypass is not read beyond it.");
    r.JL = s.JL;  r.JB = s.JB;
    r.assumptions.push_back("J_L = " + num(s.JL) + " and J_B = " + num(s.JB)
        + " are DECLARED chart readings (Hewitt Figs 6.8 and 6.9), as the"
          " textbook takes them; the chart coordinates are published");
    r.combined = r.Jc * r.JL * r.JB;
    r.h = r.h_ideal * r.combined;                              // Eq 6.19

    //  ---- shell-side pressure drop ---------------------------------------
    const bool anyR = (s.RL >= 0.0 || s.RB >= 0.0);
    if (!anyR) return r;
    if (s.RL < 0.0 || s.RB < 0.0)
        refuse("declare both RL (Hewitt Fig 6.10) and RB (Fig 6.11), or"
               " neither: the pressure drop needs both chart readings.");
    if (s.RL <= 0.0 || s.RL > 1.0 || s.RB <= 0.0 || s.RB > 1.0)
        refuse("RL and RB read from Bell's charts lie in (0, 1].");
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
    r.RL = s.RL;  r.RB = s.RB;
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
    r.assumptions.push_back("R_L = " + num(s.RL) + " and R_B = " + num(s.RB)
        + " are DECLARED chart readings (Hewitt Figs 6.10 and 6.11); the"
          " drop excludes the nozzles (Hewitt, after Eq 6.31)");
    return r;
}

} // namespace bellDelaware
} // namespace Choupo
