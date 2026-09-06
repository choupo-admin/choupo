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

#include "Fuller.H"
#include "thermo/Component.H"

#include <cmath>
#include <stdexcept>

namespace Choupo {

scalar Fuller::kernel(scalar Ma, scalar Mb, scalar va, scalar vb,
                      scalar T_K, scalar P_Pa)
{
    const scalar M_AB  = 2.0 / (1.0 / Ma + 1.0 / Mb);    // g/mol
    const scalar P_bar = P_Pa / 1.0e5;
    const scalar sumV  = std::cbrt(va) + std::cbrt(vb);
    const scalar denom = P_bar * std::sqrt(M_AB) * sumV * sumV;

    //  D_AB [cm²/s] = 0.00143 · T^1.75 / denom;  × 1e-4 → m²/s.
    return 1.43e-7 * std::pow(T_K, 1.75) / denom;
}

scalar Fuller::diffusivityGasBinary(const Component& a, const Component& b,
                                    scalar T_K, scalar P_Pa) const
{
    const scalar Ma = a.MW();              // g/mol (= kg/kmol numerically)
    const scalar Mb = b.MW();
    const scalar va = a.diffusionVolume(); // Σv [-]
    const scalar vb = b.diffusionVolume();

    if (va <= 0.0 || vb <= 0.0)
        throw std::runtime_error("Fuller diffusivity: component '"
            + (va <= 0.0 ? a.name() : b.name()) + "' has no `diffusionVolume`"
            " (Fuller Σv) in its.dat --- add e.g. `diffusionVolume 18.5;`.");
    if (P_Pa <= 0.0)
        throw std::runtime_error("Fuller diffusivity: pressure must be > 0");

    return kernel(Ma, Mb, va, vb, T_K, P_Pa);
}

CorrelationVerify Fuller::verify() const
{
    //  ARITHMETIC, not physics: the closed form at M_A = M_B = 4 g/mol,
    //  Σv_A = Σv_B = 1, T = 100 K, P = 1 bar, where every factor is a round
    //  number -- M_AB = 4, sqrt = 2, (1 + 1)^2 = 4, T^1.75 = 10^3.5 -- and the
    //  literal was computed ONCE from those and written here.  It checks the
    //  transcription and the unit chain (cm²/s -> m²/s, Pa -> bar).  The
    //  paper's own comparison against measured pairs is NOT transcribed, so
    //  no anchor here claims it.
    CorrelationVerify v;
    v.value_choupo = kernel(4.0, 4.0, 1.0, 1.0, 100.0, 1.0e5);
    v.value_published = 5.652571e-05;
    v.dev = std::abs(v.value_choupo - v.value_published) / v.value_published;
    v.kind = "arithmetic";
    v.anchor = "M_A = M_B = 4, Σv = 1 each, T = 100 K, P = 1 bar: the closed "
               "form 1.43e-7 x 10^3.5 / 8 = 5.65257e-05 m²/s, a literal.  "
               "This arm checks the TRANSCRIPTION and the unit chain, not the "
               "physics; the 1966 paper's measured comparisons are not "
               "transcribed here";
    return v;
}

} // namespace Choupo
