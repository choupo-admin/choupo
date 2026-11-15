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
\*---------------------------------------------------------------------------*/
/*---------------------------------------------------------------------------*\
File
    WilkeReduction.H

Description
    The effective diffusivity of component i in a mixture, from the pair
    (Maxwell-Stefan) values D_ij and the mole fractions -- Wilke's reduction,
    the stagnant-mixture solution of the Maxwell-Stefan relation:

        D_i,eff = (1 - x_i) / sum_{j != i} x_j / D_ij

    Source: R. Taylor and R. Krishna, Multicomponent Mass Transfer, Wiley
    (1993), Eq. 6.1.14, p. 126.  The book's worked number is Example 6.1.1,
    p. 127 (hydrogen 1, nitrogen 2, dichlorodifluoromethane 3; x = 0.35, 0.40,
    0.25; D_12 = 77.0, D_13 = 33.1, D_23 = 8.1 mm2/s): D_1,eff = 50.99 and
    D_2,eff = 16.95 mm2/s.  The gate check_liquid_diffusivity_declaration
    compiles this header against those numbers.

    Written with the sum of the other components' mole fractions for
    (1 - x_i): the same number for a normalised x, and exactly D_ij when
    only i and j are present.  A component with x_j = 0 contributes nothing
    and its D_ij is never read.  Header-only and free of every other include
    on purpose: the probe that checks the book's example needs nothing else.

    What the source says against it (p. 126, p. 208): the formula is exact
    only when the other components are at rest, and the effective
    diffusivities of a mixture whose fluxes sum to zero need not even be
    positive.  It is the reduction a film with ONE coefficient per component
    takes; the Maxwell-Stefan film does not need it.
\*---------------------------------------------------------------------------*/

#pragma once

#include <cstddef>
#include <vector>

namespace Choupo {
namespace liquidTransport {

//  `Drow[j]` is D_ij for the components j with x[j] > 0 (j != i).
inline double wilkeEffective(const std::vector<double>& x, const std::vector<double>& Drow,
                             std::size_t i)
{
    double others = 0.0, resist = 0.0;
    for (std::size_t j = 0; j < x.size(); ++j)
    {
        if (j == i || !(x[j] > 0.0)) continue;
        others += x[j];
        resist += x[j] / Drow[j];
    }
    return others / resist;
}

} // namespace liquidTransport
} // namespace Choupo
