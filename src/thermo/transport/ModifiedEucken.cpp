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
\*---------------------------------------------------------------------------*/

#include "ModifiedEucken.H"
#include "thermo/Component.H"

#include <cmath>
#include <string>

namespace Choupo {

namespace {
constexpr scalar R_GAS = 8.314462618;            // J/(mol·K)
}

scalar ModifiedEucken::kernel(scalar cp_ig_pure, scalar mu_pure, scalar M_kg_per_mol)
{
    //  Svehla eq. (2): lambda = (R/M) [15/4 + 1.32 (Cp/R - 5/2)] eta.
    return (R_GAS / M_kg_per_mol)
         * (3.75 + 1.32 * (cp_ig_pure / R_GAS - 2.5)) * mu_pure;
}

scalar ModifiedEucken::conductivityGasPure(const Component& c, scalar /*T_K*/,
                                           scalar mu_pure, scalar cp_ig_pure) const
{
    // Component MW is kg/kmol (= g/mol numerically); the kernel needs kg/mol.
    const scalar M_kg_per_mol = c.MW() / 1000.0;
    if (M_kg_per_mol <= 0.0) return 0.0;
    return kernel(cp_ig_pure, mu_pure, M_kg_per_mol);
}

CorrelationVerify ModifiedEucken::verify() const
{
    CorrelationVerify v;

    //  (i) THE SVEHLA REPRODUCTION, as a guard.  N2 at 300 K on report page
    //  90: Cp/R = 3.503, eta x 10^6 = 177.7 poise, lambda x 10^6 = 63.9
    //  g-cal/(cm s K).  Feed the kernel HIS eta and Cp through eq. (2) and
    //  it must return his lambda, read through his own Table II calorie.
    //  Arithmetic: it checks the 1.32, the 15/4 and the unit chain; his
    //  lambda is computed, not measured.  Measured 2026-09-06: 0.05 %, the
    //  three-figure printing of 63.9; declared 0.2 %.
    {
        const scalar M = 28.02e-3, cp = 3.503 * R_GAS, eta = 177.7e-6 * 0.1;   // Pa.s
        const scalar mine = kernel(cp, eta, M);
        const scalar his  = 63.9e-6 * SVEHLA_CAL_J * 100.0;                  // W/(m K)
        const scalar dev  = std::abs(mine - his) / his;
        if (dev > SVEHLA_TOLERANCE)
        {
            v.value_choupo = mine;
            v.value_published = his;
            v.dev = dev;
            v.kind = "arithmetic";
            v.tolerance = SVEHLA_TOLERANCE;
            v.anchor = "Svehla (1962) NASA TR R-132, Table III, report page 90: "
                       "N2 at 300 K from HIS eta x 10^6 = 177.7 and Cp/R = 3.503 "
                       "through eq. (2) must return his lambda x 10^6 = 63.9 "
                       "g-cal/(cm s K) (Table II calorie 4.185 J, report page "
                       "26).  The reproduction FAILED, so the monatomic theory "
                       "anchor was not reached";
            return v;
        }
    }

    //  (ii) THEORY.  A monatomic gas has Cp = 5R/2 exactly, lambda'' = 0,
    //  and kinetic theory gives lambda = (15/4) (R/M) eta exactly (Chapman &
    //  Cowling).  The published side is that closed form evaluated
    //  INDEPENDENTLY of kernel(); argon's M and an ordinary viscosity so the
    //  check is not at 1.
    const scalar mu = 2.2e-5, M = 0.039948;
    v.value_choupo = kernel(2.5 * R_GAS, mu, M);
    v.value_published = (15.0 / 4.0) * R_GAS * mu / M;
    v.dev = std::abs(v.value_choupo - v.value_published) / v.value_published;
    v.kind = "theory";
    v.anchor = "monatomic gas (Cp = 5R/2, argon M, mu = 2.2e-5 Pa.s): must "
               "give the EXACT Chapman-Enskog lambda = (15/4) R mu / M, the "
               "limit where the internal term lambda'' vanishes and the "
               "modified and plain Eucken coincide.  Before this, Svehla's "
               "printed N2 lambda at 300 K (report page 90) was reproduced "
               "from his eta and Cp/R through eq. (2) within 0.2 % (0.05 % "
               "measured 2026-09-06; his three-figure printing), an "
               "ARITHMETIC guard on the 1.32 and the unit chain";
    return v;
}

} // namespace Choupo
