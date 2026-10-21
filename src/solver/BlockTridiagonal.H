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
File
    BlockTridiagonal.H

Description
    Block-tridiagonal linear algebra -- the ONE home shared by the two
    solvers that DECLARE this structure: the MESH column's Newton (one block
    per stage, NDOptions::blockTri) and the stiff Rosenbrock23 integrator
    (one block per finite-volume cell, ODEControls::structure).

    A block-tridiagonal matrix of N blocks of nv x nv:

        | D0  U0              |      block row b couples only to the
        | L1  D1  U1          |      blocks b-1 (sub), b (diag) and b+1
        |     L2  D2  U2      |      (sup): a stage to the stages above
        |         ..  ..  ..  |      and below it, a cell to its two
        |             LN  DN  |      neighbors.

    Block-Thomas -- the Thomas algorithm with matrices in place of numbers --
    factors it in O(N nv^3) where dense Gauss is O((N nv)^3).  It is split
    into a FACTOR and a SOLVE so one factorisation serves several right-hand
    sides: the Rosenbrock step back-solves its iteration matrix three times.
    Partial pivoting is applied INSIDE each pivot block (the shared dense
    luFactor); there is no pivoting ACROSS blocks, which is the method's
    stated limit -- luFactor refuses a singular pivot block by throwing.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <array>
#include <cstddef>
#include <vector>

namespace Choupo::solver
{

//- The three bands of a block-tridiagonal matrix.  b[row][which][i][j]:
//  which = 0 sub, 1 diag, 2 sup; the sub of the first row and the sup of
//  the last stay zero (unused).
struct BlockBands
{
    std::size_t N = 0, nv = 0;
    std::vector<std::array<std::vector<sVector>, 3>> b;

    BlockBands() = default;
    BlockBands(std::size_t N_, std::size_t nv_);
};

//- A block-Thomas factorisation: the multipliers L_b = sub_b inv(D'_{b-1}),
//  each MODIFIED pivot block D'_b in luFactor form, and the sup blocks.
struct BlockThomasLU
{
    std::size_t N = 0, nv = 0;
    std::vector<std::vector<sVector>>     L;      // [b][i][j]; L[0] unused
    std::vector<std::vector<sVector>>     Dfac;   // luFactor of D'_b
    std::vector<std::vector<std::size_t>> Dpiv;
    std::vector<std::vector<sVector>>     sup;    // U_b, untouched
};

//- Factor A.  Throws (through luFactor) on a singular pivot block.
BlockThomasLU blockThomasFactor(const BlockBands& A);

//- Solve with a factorisation.  rhs is in BLOCK order: slot i of block b
//  at b*nv + i.
sVector blockThomasSolve(const BlockThomasLU& F, sVector rhs);

//- One-shot factor + solve (the Newton's single right-hand side).
sVector blockThomasSolve(const BlockBands& A, sVector rhs);

} // namespace Choupo::solver
