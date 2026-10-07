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
\*---------------------------------------------------------------------------*/

#include "ShellTubeDesign.H"

#include <algorithm>
#include <cmath>
#include <functional>
#include <limits>

namespace Choupo {
namespace shellTubeDesign {

//  EVERY EXPRESSION BELOW IS THE UNIT'S OWN, MOVED VERBATIM (2026-10-07).
//  The order of the floating-point operations is part of what was moved:
//  `HeatExchanger.cpp` had written them inline, and the witnesses that pin
//  its answer are compared bit for bit against a build of the parent commit.
//  Rewriting one into an algebraically equal form would be a numerical
//  change riding on a structural one.

scalar equivalentDiameter(const TubeBundle& b)
{
    const scalar deC = b.triangular ? 1.10  : 1.27;
    const scalar deK = b.triangular ? 0.917 : 0.785;
    return deC / b.tubeOD * (b.pitch * b.pitch - deK * b.tubeOD * b.tubeOD);
}

bool listedPassCount(int passes)
{
    return passes == 1 || passes == 2 || passes == 4 || passes == 6
        || passes == 8;
}

std::pair<scalar, scalar> bundleConstants(bool tri, int np)
{
    if (tri) switch (np) {
        case 1:  return {0.319, 2.142};
        case 2:  return {0.249, 2.207};
        case 4:  return {0.175, 2.285};
        case 6:  return {0.0743, 2.499};
        default: return {0.0365, 2.675};   // 8
    } else switch (np) {
        case 1:  return {0.215, 2.207};
        case 2:  return {0.156, 2.291};
        case 4:  return {0.158, 2.263};
        case 6:  return {0.0402, 2.617};
        default: return {0.0331, 2.643};    // 8
    }
}

scalar shellFromTubes(const TubeBundle& b, int N)
{
    const auto k1n1 = bundleConstants(b.triangular, b.passes);
    const scalar K1 = k1n1.first, n1 = k1n1.second;
    return b.tubeOD * std::pow(N / K1, 1.0 / n1) + shellClearance;
}

scalar outsideArea(const TubeBundle& b, int N)
{
    return M_PI * b.tubeOD * b.tubeLength * N;
}

TubeSideState tubeSide(const TubeBundle& b, int N, const SideFluid& f,
                       const HeatTransferCorrelation& corr)
{
    TubeSideState s;
    s.flowArea = M_PI * 0.25 * b.tubeID * b.tubeID
               * (N / std::max(b.passes, 1));          // tubes per pass
    s.u = f.mdot / (f.rho * s.flowArea);
    HeatTransferContext c;
    c.u = s.u; c.d_h = b.tubeID; c.lambda = f.lambda;
    c.mu = f.mu; c.rho = f.rho; c.cp = f.cp;
    c.heating = f.heating;
    s.film = corr.evaluate(c);
    return s;
}

ShellSideState shellSide(const TubeBundle& b, scalar shellID,
                         scalar baffleSpacing, const SideFluid& f,
                         const HeatTransferCorrelation& corr)
{
    ShellSideState s;
    s.D_e = equivalentDiameter(b);
    //  Crossflow area at the shell centreline: A_s = D_s C' B / p, with the
    //  clearance C' = p - d_o.
    const scalar Cprime = b.pitch - b.tubeOD;
    s.crossArea = shellID * Cprime * baffleSpacing / b.pitch;
    s.G = f.mdot / s.crossArea;
    s.u = s.G / f.rho;
    HeatTransferContext c;
    c.u = s.u; c.d_h = s.D_e; c.lambda = f.lambda;
    c.mu = f.mu; c.rho = f.rho; c.cp = f.cp;
    c.heating = f.heating;
    s.film = corr.evaluate(c);
    return s;
}

Resistances overall(const TubeBundle& b, scalar h_i, scalar h_o,
                    scalar R_foulInside, scalar R_foulOutside)
{
    Resistances r;
    const scalar r_i = 0.5 * b.tubeID, r_o = 0.5 * b.tubeOD;
    r.R_inner = r_o / (r_i * h_i);
    r.R_wall  = r_o * std::log(r_o / r_i) / b.wallK;
    r.R_outer = 1.0 / h_o;
    const scalar Rclean = r.R_inner + r.R_wall + r.R_outer;
    r.U_clean = 1.0 / Rclean;
    //  Fouling ADDS to the clean sum; with both zero the sum is the clean
    //  one to the last bit (x + 0.0 == x), so the unit -- which declares no
    //  fouling -- keeps its coefficient exactly.
    r.R_foulOuter = R_foulOutside;
    r.R_foulInner = (R_foulInside == 0.0) ? 0.0 : R_foulInside * r_o / r_i;
    r.U = (r.R_foulOuter == 0.0 && r.R_foulInner == 0.0)
        ? r.U_clean
        : 1.0 / (Rclean + r.R_foulOuter + r.R_foulInner);
    if (r.R_inner >= r.R_wall && r.R_inner >= r.R_outer) r.controlling = "tube-side";
    else if (r.R_outer >= r.R_wall)                      r.controlling = "shell-side";
    else                                                 r.controlling = "wall";
    return r;
}

scalar effectiveness(scalar NTU, scalar Cr, int passes, bool counter)
{
    if (passes >= 2)
    {
        // 1 shell pass, 2N tube passes (the U-tube / multi-pass TEMA E-shell):
        //   eps = 2 / { (1+Cr) + sqrt(1+Cr^2) (1+E)/(1-E) },  E = exp(-NTU sqrt(1+Cr^2)).
        // Lower than pure counter-current -- one tube pass runs co-current
        // (the built-in LMTD F-correction, F<1), which is exactly why a
        // multi-pass exchanger needs more area for the same duty.
        const scalar root = std::sqrt(1.0 + Cr * Cr);
        const scalar E = std::exp(-NTU * root);
        return 2.0 / ((1.0 + Cr) + root * (1.0 + E) / (1.0 - E));
    }
    if (counter)
    {
        if (std::abs(1.0 - Cr) < 1.0e-9) return NTU / (1.0 + NTU);
        const scalar e = std::exp(-NTU * (1.0 - Cr));
        return (1.0 - e) / (1.0 - Cr * e);
    }
    return (1.0 - std::exp(-NTU * (1.0 + Cr))) / (1.0 + Cr);
}

LmtdCorrection oneTwoCorrection(scalar T1, scalar T2, scalar t1, scalar t2)
{
    LmtdCorrection c;
    const scalar dHot = T1 - T2, dCold = t2 - t1;
    const scalar scale = std::max({std::abs(T1), std::abs(t1), 1.0});
    //  An isothermal side (a boiling or condensing utility): no temperature
    //  profile on that side, so the arrangement cannot matter.
    if (std::abs(dHot) <= 1.0e-9 * scale || std::abs(dCold) <= 1.0e-9 * scale)
    {
        c.F = 1.0;
        return c;
    }
    c.R = dHot / dCold;
    c.S = dCold / (T1 - t1);
    const scalar R = c.R, S = c.S;
    const scalar nan = std::numeric_limits<scalar>::quiet_NaN();
    if (std::abs(R - 1.0) < 1.0e-6)
    {
        const scalar s2 = std::sqrt(2.0);
        const scalar num = 2.0 - S * (2.0 - s2);
        const scalar den = 2.0 - S * (2.0 + s2);
        if (!(S < 1.0) || !(num > 0.0) || !(den > 0.0) || !(num / den > 1.0))
        { c.F = nan; c.feasible = false; return c; }
        c.F = (S * s2 / (1.0 - S)) / std::log(num / den);
    }
    else
    {
        const scalar root = std::sqrt(R * R + 1.0);
        const scalar a = (1.0 - S) / (1.0 - R * S);
        const scalar num = 2.0 - S * (R + 1.0 - root);
        const scalar den = 2.0 - S * (R + 1.0 + root);
        if (!(a > 0.0) || !(num > 0.0) || !(den > 0.0))
        { c.F = nan; c.feasible = false; return c; }
        const scalar lg = std::log(num / den);
        c.F = root * std::log(a) / ((R - 1.0) * lg);
    }
    if (!std::isfinite(c.F) || !(c.F > 0.0) || c.F > 1.0 + 1.0e-9)
    { c.F = nan; c.feasible = false; }
    return c;
}

TubePressureDrop tubePressureDrop(const TubeBundle& b, scalar rho, scalar u,
                                  scalar Re)
{
    TubePressureDrop p;
    p.f = (Re > 0.0) ? 0.079 * std::pow(Re, -0.25) : 0.0;
    const scalar velHead = 0.5 * rho * u * u;
    p.dP = (4.0 * p.f * b.tubeLength * b.passes / b.tubeID
          + 4.0 * b.passes) * velHead;                         // Pa
    p.inValidity = (Re >= 4.0e3) && (Re <= 1.0e5);
    return p;
}

ShellPressureDrop shellPressureDrop(const TubeBundle& b, scalar shellID,
                                    scalar baffleSpacing, scalar rho,
                                    scalar G, scalar D_e, scalar Re)
{
    ShellPressureDrop p;
    p.nBaffles = std::max(0,
        static_cast<int>(std::round(b.tubeLength / baffleSpacing)) - 1);
    p.f = (Re > 0.0) ? std::exp(0.576 - 0.19 * std::log(Re)) : 0.0;
    p.dP = p.f * G * G * shellID * (p.nBaffles + 1) / (2.0 * rho * D_e);   // Pa
    p.inValidity = (Re > 400.0) && (Re < 1.0e6);
    return p;
}

int smallestCount(const std::function<scalar(int)>& delivered, scalar target)
{
    int Nlo = 1, Nhi = 4;
    while (delivered(Nhi) < target && Nhi < 100000) Nhi *= 2;
    while (Nhi - Nlo > 1)
    {
        const int Nm = (Nlo + Nhi) / 2;
        if (delivered(Nm) < target) Nlo = Nm; else Nhi = Nm;
    }
    return Nhi;                       // round UP: never undersize
}

} // namespace shellTubeDesign
} // namespace Choupo
