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

#include "Eucken.H"
#include "thermo/Component.H"
#include "thermo/heatCapacity/HeatCapacityModel.H"

#include <cmath>
#include <string>

namespace Choupo {

namespace {
constexpr scalar R_GAS = 8.314462618;            // J/(mol·K)
}

scalar Eucken::kernel(scalar cp_ig_pure, scalar mu_pure, scalar M_kg_per_mol)
{
    //  λ = (Cp + 5R/4) · μ / M     [W/(m·K)]
    return (cp_ig_pure + 1.25 * R_GAS) * mu_pure / M_kg_per_mol;
}

scalar Eucken::conductivityGasPure(const Component& c, scalar /*T_K*/,
                                   scalar mu_pure, scalar cp_ig_pure) const
{
    // Component MW is kg/kmol (= g/mol numerically); Eucken needs kg/mol.
    const scalar M_kg_per_mol = c.MW() / 1000.0;
    if (M_kg_per_mol <= 0.0) return 0.0;
    return kernel(cp_ig_pure, mu_pure, M_kg_per_mol);
}

std::string Eucken::windowNote(const Component& c, scalar T) const
{
    //  The record's own Cp decides: a monatomic gas has Cp = 5R/2 and the
    //  formula is exact there; anything above it carries internal modes the
    //  plain Eucken factor weights like translation.  Read, not guessed.
    if (!c.hasCpIdealGas()) return "no idealGasHeatCapacity on the record";
    const scalar cp = c.cpIdealGas().Cp(T);
    if (cp > 2.5 * R_GAS * 1.02)
        return "polyatomic (Cp = " + std::to_string(cp / R_GAS) + " R > 5R/2):"
               " plain Eucken is an APPROXIMATION here; the modified Eucken"
               " correction is not implemented";
    return "";
}

CorrelationVerify Eucken::verify() const
{
    //  THEORY, not arithmetic.  A monatomic gas has Cp = 5R/2 exactly, and
    //  kinetic theory gives its conductivity as (15/4) (R/M) mu exactly
    //  (Chapman & Cowling).  Eucken's formula must reproduce that limit --
    //  the 5R/4 is the constant that makes it do so -- and the published
    //  side below is that closed form evaluated INDEPENDENTLY of kernel().
    //  Argon's M and an ordinary viscosity, so the check is not at 1.
    CorrelationVerify v;
    const scalar mu = 2.2e-5, M = 0.039948;
    v.value_choupo = kernel(2.5 * R_GAS, mu, M);
    v.value_published = (15.0 / 4.0) * R_GAS * mu / M;
    v.dev = std::abs(v.value_choupo - v.value_published) / v.value_published;
    v.kind = "theory";
    v.anchor = "monatomic gas (Cp = 5R/2, argon M, mu = 2.2e-5 Pa.s): must "
               "give the EXACT Chapman-Enskog lambda = (15/4) R mu / M.  "
               "Eucken's 5R/4 is the constant that makes the formula contain "
               "this limit; a wrong constant fails here";
    return v;
}

} // namespace Choupo
