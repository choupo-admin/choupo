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

#include "SolutionDiffusion.H"

#include "thermo/ThermoPackage.H"
#include "../osmotic/OsmoticModel.H"

#include <algorithm>
#include <cmath>
#include <vector>

namespace Choupo {
namespace membrane {

// ---------------------------------------------------------------------------
//  Local flux problem at a single z station
//
//  Given J_w, the wall and the permeate come from ONE home: the shared
//  Polarisation object solves the interface balance of Geraldes & Afonso
//  (2007) jointly with this law's own permeate closure
//      c_p,i = (B_s,i / φ_i) · c_m,i,   φ_i = J_w + B_s,i.
//  With the defaults (film-theory correction, no ion coupling) that joint
//  solution IS the old closed form
//      E = exp(J_w / k),  c_m,i = E · c_b,i / ( 1 + B_s,i · (E − 1) / φ_i ),
//  reproduced to round-off (the kernel's seed is that closed form and its
//  residual is affine, so the Newton returns before forming a Jacobian).
//  With `ionCoupling electroneutral;` the ions share one interface field
//  and the kernel's small Newton on c_p resolves it.
//
//  The non-linearity in J_w is via Δπ:
//      F(J_w) = J_w − A_w · (P_b − P_p − Δπ(J_w))   →   0
//  solved by Newton-1D with damping, starting from the no-osmotic guess
//  J_w₀ = A_w · (P_b − P_p).
// ---------------------------------------------------------------------------
TransportSolution SolutionDiffusion::localFluxes(const TransportContext& ctx) const
{
    // Unpack the context into the local names the law is written in.  The
    // membrane handle + speciation hook are unused by solution-diffusion.
    const ThermoPackage&            thermo    = ctx.thermo;
    const std::vector<std::size_t>& soluteIdx = ctx.soluteIdx;
    const std::vector<scalar>&      B_s       = ctx.B_s;
    const scalar                    A_w       = ctx.A_w;
    const Polarisation&             polar     = ctx.polarisation;
    const MassTransferContext&      hyd       = ctx.hydraulics;
    const scalar                    P_feed_Pa = ctx.P_feed_Pa;
    const scalar                    P_perm_Pa = ctx.P_perm_Pa;
    const scalar                    T_K       = ctx.T_K;
    const OsmoticModel&             osm       = ctx.osm;
    const std::vector<scalar>&      c_b       = ctx.c_b;

    const std::size_t Ns = soluteIdx.size();
    const scalar dP = P_feed_Pa - P_perm_Pa;       // Pa

    // No driving pressure → no flux, no permeation.
    if (dP <= 0.0)
    {
        TransportSolution s;
        s.J_w = 0.0;
        s.c_m.assign(Ns, 0.0);
        s.c_p.assign(Ns, 0.0);
        s.J_s.assign(Ns, 0.0);
        return s;
    }

    // Lambda: given J_w, evaluate c_m, c_p, Δπ and the residual
    // F(J_w) = J_w − A_w · (dP − Δπ).  The wall and the permeate come from
    // the polarisation object (one home); a wall it refuses at an ACCEPTED
    // J_w is refused by name below, never clamped.
    WallSolution lastWall;
    auto eval = [&](scalar Jw, std::vector<scalar>& cm,
                    std::vector<scalar>& cp, scalar& dpi)
    {
        lastWall = polar.wallWithSolutionDiffusion(hyd, Jw, c_b, B_s, cp);
        if (!lastWall.ok) requireOk(lastWall, "transport solutionDiffusion");
        cm = lastWall.c_m;
        dpi = 0.0;
        for (std::size_t s = 0; s < Ns; ++s)
        {
            const std::size_t i = soluteIdx[s];
            const scalar nu = thermo.comp(i).dissociation();
            // Osmotic pressure difference across the membrane [Pa], from the
            // selected model (van't Hoff: nu R T c; Pitzer: phi(I) nu R T c).
            dpi += osm.osmoticPressure({cm[s], nu, T_K})
                 - osm.osmoticPressure({cp[s], nu, T_K});
        }
    };

    // Newton-1D in J_w.
    TransportSolution sol;
    sol.c_m.assign(Ns, 0.0);
    sol.c_p.assign(Ns, 0.0);

    scalar Jw = A_w * dP;            // initial guess, no osmotic
    scalar dpi = 0.0;
    auto cm = sol.c_m, cp = sol.c_p;

    for (int it = 0; it < 60; ++it)
    {
        eval(Jw, cm, cp, dpi);
        const scalar F0 = Jw - A_w * (dP - dpi);
        if (std::abs(F0) < 1e-12) { sol.J_w = Jw; sol.c_m = cm; sol.c_p = cp; break; }

        // Numerical derivative dF/dJw via central difference.  The Δπ
        // term is the non-trivial part; A_w · dP is independent of Jw.
        const scalar h = std::max(1.0e-9, 1.0e-4 * Jw);
        std::vector<scalar> cmL = cm, cpL = cp, cmR = cm, cpR = cp;
        scalar dpiL = 0, dpiR = 0;
        eval(Jw - h, cmL, cpL, dpiL);
        eval(Jw + h, cmR, cpR, dpiR);
        const scalar dF = 1.0 + A_w * (dpiR - dpiL) / (2.0 * h);

        scalar step = -F0 / dF;
        // Damping: do not let Jw collapse to ≤ 0 or balloon past 5x dP·A_w.
        scalar Jw_new = Jw + step;
        if (Jw_new <= 0.0)            Jw_new = 0.5 * Jw;
        if (Jw_new > 5.0 * A_w * dP)   Jw_new = 5.0 * A_w * dP;
        Jw = Jw_new;
    }

    eval(Jw, cm, cp, dpi);
    requireOk(lastWall, "transport solutionDiffusion");
    sol.J_w = std::max(Jw, 0.0);
    sol.c_m = cm;
    sol.c_p = cp;
    sol.J_s.assign(Ns, 0.0);
    for (std::size_t s = 0; s < Ns; ++s)
        sol.J_s[s] = B_s[s] * (cm[s] - cp[s]);
    if (lastWall.coupled) { sol.xi = lastWall.xi; sol.hasXi = true; }
    return sol;
}

} // namespace membrane
} // namespace Choupo
