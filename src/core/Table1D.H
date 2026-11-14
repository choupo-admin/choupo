/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
-------------------------------------------------------------------------------
Namespace
    Choupo::table1d

Description
    THE ONE BRACKET AND LINEAR RULE OF A 1-D TABLE (DEV.md 4c C398 slice (c),
    review row PD-02: the table type starts from the rate-law tables' reader,
    it is not a second one).  Two callers: a rate law's table in
    core/Formula (linear only, refused outside its points) and a property law
    of type `table` (thermo/PropertyTable, four declared interpolations).
    Both find the segment and weigh it here, with the same arithmetic, so the
    two cannot drift apart.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <cstddef>
#include <vector>

namespace Choupo {
namespace table1d {

//- The segment k (x[k] <= t <= x[k+1]) of a strictly increasing abscissa of
//  at least two points; t is inside [x.front(), x.back()].
inline std::size_t segment(const std::vector<scalar>& x, scalar t)
{
    std::size_t k = 0;
    while (k + 2 < x.size() && t > x[k + 1]) ++k;
    return k;
}

//- The linear rule on segment k: y_k + w (y_k+1 - y_k), w = (t - x_k) / h.
//  w may lie outside [0, 1] (a declared extension's chord).
inline scalar linear(const std::vector<scalar>& x, const std::vector<scalar>& y,
                     std::size_t k, scalar t)
{
    const scalar w = (t - x[k]) / (x[k + 1] - x[k]);
    return y[k] + w * (y[k + 1] - y[k]);
}

} // namespace table1d
} // namespace Choupo
