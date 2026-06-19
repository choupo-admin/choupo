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

#include <stdexcept>

namespace Choupo {

scalar bubbleT(const ThermoPackage& thermo,
               const sVector& x,
               scalar P,
               scalar Tguess)
{
    auto f = [&](scalar T)
    {
        auto K = thermo.Kvec(T, P, x, x);
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
    nro.tolerance          = 1.0e-8;
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
        const scalar y1 = K[0] * x1;

        out.xBubble.push_back(x1);
        out.Tbubble.push_back(T);
        out.yDew.push_back(y1);
        out.Tdew.push_back(T);
    }
    return out;
}

} // namespace Choupo
