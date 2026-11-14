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
Class
    Choupo::rateBased::SegmentLayout

    THE RATE-BASED (NON-EQUILIBRIUM) PACKED SEGMENT -- `model rateBased;` on
    a `distillationColumn` (DEV.md 4c C329 part 2, slice B1; design record
    docs/design/c329-ratebased-at-general-reflux.md, sections 4 and 7.2).

    WHAT IS SOLVED.  A binary packed bed at TOTAL reflux, cut into M
    segments of height dz = H/M, numbered k = 0 (top) .. M-1 (bottom).  In
    each segment the vapour and the liquid are SEPARATE control volumes
    that meet at an interface; nothing assumes that the phases leaving a
    segment are in equilibrium.  Per segment 5n + 5 unknowns (n = 2: 15):

        y_k    (n)  bulk vapour leaving the segment upward (its top face)
        x_k    (n)  bulk liquid leaving it downward (its bottom face)
        yI, xI (2n) the interface compositions (segment midpoint)
        w      (n)  transfer rate of each component, liquid -> vapour,
                    over the whole segment, divided by the reference boil-up
        T_V, T_L    the bulk temperatures of the two leaving streams
        T_I         the interface temperature
        v, l        V_k and L_k divided by the reference boil-up

    and 5n + 5 equations (RateBasedSegment.cpp, `residual`):

        vapour component balances (n)    v y - v_in y_in - w = 0
        liquid component balances (n)    l x - l_in x_in + w = 0
        sum y = 1, sum x = 1             (2)
        interface equilibrium (n)        yI_i = K_i(T_I, P, xI, yI) xI_i
        sum yI = 1, sum xI = 1           (2)
        vapour film (n - 1)   w_1 = beta_V (yI_1 - ybar_1) + (yI_1 + ybar_1)/2 w_t
        liquid film (n - 1)   w_1 = beta_L (xbar_1 - xI_1) + (xI_1 + xbar_1)/2 w_t
        vapour bulk energy    v h_V(y, T_V) - v_in h_V(y_in, T_V,in) - e_V = 0
        liquid bulk energy    l h_L(x, T_L) - l_in h_L(x_in, T_L,in) + e_L = 0
        interface energy continuity      e_V - e_L = 0
            e_V = gamma_V (T_I - Tbar_V) + sum_i w_i H_i^V(T_I)
            e_L = gamma_L (Tbar_L - T_I) + sum_i w_i H_i^L(T_I)

    where ybar, xbar, Tbar are the averages of a segment's inlet and outlet
    (PLUG FLOW in both phases, discretised by the box scheme: second order
    in dz), beta = c k a_e A dz / V_ref from the packing model's film
    coefficients and effective area (PackingRBF.H, PackingDelft.H), gamma =
    h a_e A dz / V_ref with the film heat-transfer coefficients from the SAME
    coefficients by the heat/mass-transfer analogy, and w_t = sum w.

    THE BOOTSTRAP.  For a binary the two film equations fix one combination
    of the two fluxes; the interface energy balance fixes the other: the
    latent heat the fluxes carry across the interface equals the net heat
    conducted to it.  With equal latent heats and no heat flow this is
    equimolar counter-diffusion.  Without it the binary is under-determined,
    which is why it is not optional.

    THE ENDS.  The reboiler is an EQUILIBRIUM stage below the bed: its liquid
    composition is declared (totalReflux.composition, as on the transfer-unit
    bed), its vapour is y*(x_N) at its bubble point at the bed's bottom
    pressure, and its rate is the declared F-factor on the tower area.  The
    condenser is TOTAL: the reflux is the top vapour's composition returned
    at its bubble point at the declared top pressure, L_0 = V_0.

    THE STRUCTURE.  Every row of segment k reads segments k-1, k and k+1
    only, so the Jacobian is block-tridiagonal with blocks of 5n + 5; it is
    DECLARED to the Newton (solver/NewtonND.H, BlockTri) and AUDITED against
    the dense Jacobian on the first iteration.

    THE LIMIT (`limit transferUnits;`).  Three groups of rows are replaced --
    the interface equilibrium linearised over the segment about the bulk
    liquid, yI_1 = y*_1(xbar) + m (xI_1 - xbar_1); equimolar counter-diffusion
    (w_t = 0) in place of the interface energy row; and the two bulk
    temperatures pinned to the bubble points of their compositions in place
    of the bulk energy rows -- and the model then IS the transfer-unit bed
    dy/dz = (y* - y)/H_OG, H_OG = H_G + lambda H_L (derivation in the Theory
    Guide, section "The rate-based packed segment").  The limit exists to
    hold the model to its oracle, `model totalReflux;` with `packing {}`; it
    is not a model to design with.
\*---------------------------------------------------------------------------*/

#pragma once

#include <cstddef>

namespace Choupo {
namespace rateBased {

//- Where each unknown of segment k sits in its block of the Newton vector.
//  One block of 5n + 5 per segment, segments top to bottom; the order inside
//  a block is the order the header lists.
struct SegmentLayout
{
    std::size_t n = 2;
    std::size_t block() const { return 5 * n + 5; }
    std::size_t y()   const { return 0; }
    std::size_t x()   const { return n; }
    std::size_t yI()  const { return 2 * n; }
    std::size_t xI()  const { return 3 * n; }
    std::size_t w()   const { return 4 * n; }
    std::size_t TV()  const { return 5 * n; }
    std::size_t TL()  const { return 5 * n + 1; }
    std::size_t TI()  const { return 5 * n + 2; }
    std::size_t v()   const { return 5 * n + 3; }
    std::size_t l()   const { return 5 * n + 4; }
};

//- Fewer segments than this are refused by name.  A declared count above it
//  is still refused when the box scheme's own error estimate, printed after
//  the solve (r_max^2 / 12, r = dz / H_OG of a segment), exceeds
//  `maxDiscretisationError`; the refusal names the count that would pass.
constexpr int    minSegments            = 10;
constexpr double maxDiscretisationError = 1.0e-2;

} // namespace rateBased
} // namespace Choupo
