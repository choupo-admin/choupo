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

#include "SaturationCurves.H"

#include "solver/NewtonRaphson.H"
#include "thermo/equationOfState/EquationOfState.H"

#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace Choupo {

//  The trivial root needs BOTH fugacities off ONE equation of state; the
//  header says why the K test alone refuses a genuine azeotrope.
bool trivialSaturationRoot(const ThermoPackage& thermo, scalar T, scalar P,
                           const sVector& comp, const sVector& K, scalar tol)
{
    if (!trivialSaturationK(K, comp, tol)) return false;
    if (thermo.vleWorld() != "phiPhi" || !thermo.hasEos()) return false;
    const EquationOfState& eos = thermo.eos();
    if (!eos.hasLiquidRoot()) return true;
    const scalar vV = eos.molarVolume(T, P, comp);
    const scalar vL = eos.molarVolumeLiquid(T, P, comp);
    return std::abs(vV - vL) <= 1.0e-9 * std::max(std::abs(vV), std::abs(vL));
}

scalar bubbleT(const ThermoPackage& thermo,
               const sVector& x,
               scalar P,
               scalar Tguess,
               scalar tolerance,
               const sVector* yVapour)
{
    const sVector& y = yVapour ? *yVapour : x;
    auto f = [&](scalar T)
    {
        auto K = thermo.Kvec(T, P, x, y);
        scalar s = 0.0;
        for (std::size_t i = 0; i < x.size(); ++i) s += K[i] * x[i];
        return s - 1.0;
    };
    auto df = [&](scalar T)
    {
        const scalar dT = 0.25;
        return (f(T + dT) - f(T - dT)) / (2.0 * dT);
    };
    solver::NROptions nro;
    nro.tolerance          = tolerance;
    nro.maxIter            = 30;
    nro.lower              = 200.0;
    nro.upper              = 700.0;
    nro.bracket            = true;
    nro.monotoneIncreasing = true;
    nro.maxStep            = 15.0;
    auto r = solver::newton1D(f, df, Tguess, nro);
    return r.x;
}

BinaryTxy binaryTxy(const ThermoPackage& thermo, scalar P, int nPoints)
{
    if (thermo.n() != 2)
        throw std::runtime_error(
            "binaryTxy: needs a 2-component thermo package");

    BinaryTxy out;
    out.P     = P;
    out.comp1 = thermo.comp(0).name();
    out.comp2 = thermo.comp(1).name();
    out.xBubble.reserve(nPoints);
    out.Tbubble.reserve(nPoints);
    out.yDew.reserve(nPoints);
    out.Tdew.reserve(nPoints);

    // Initial T guess: midway between typical hydrocarbon boilers; the
    // first solve corrects it, and we carry the previous answer forward
    // so subsequent solves converge in 2-3 iterations.
    scalar Tguess = 350.0;

    for (int k = 1; k < nPoints - 1; ++k)
    {
        const scalar x1 = static_cast<scalar>(k) / static_cast<scalar>(nPoints - 1);
        sVector x = { x1, 1.0 - x1 };

        scalar T = bubbleT(thermo, x, P, Tguess);
        Tguess   = T;

        auto K = thermo.Kvec(T, P, x, x);
        //  A trivial root is not a point of the diagram (trivialSaturationRoot):
        //  on phi-phi N2 + CH4 every bubble T came back as the 350 K seed with
        //  K = 1, and the flat line was published as the T-x-y block.  The
        //  caller treats a throw as "no diagram" -- better none than a false one.
        if (trivialSaturationRoot(thermo, T, P, x, K))
            throw std::runtime_error("binaryTxy: trivial bubble-point root"
                " (every K = 1 at T = " + std::to_string(T) + " K, x1 = "
                + std::to_string(x1) + ") -- the vapour was priced on the"
                " liquid's own root, so this is not a saturation point");
        const scalar y1 = K[0] * x1;

        out.xBubble.push_back(x1);
        out.Tbubble.push_back(T);
        out.yDew.push_back(y1);
        out.Tdew.push_back(T);
    }
    return out;
}

} // namespace Choupo
