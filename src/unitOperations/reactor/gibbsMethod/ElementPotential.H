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
    Choupo::ElementPotential

Description
    Lagrangian element-potential ("RAND" / Brinkley-White) method, extended
    to a gas + IDEAL-liquid two-phase equilibrium.

    Single gas phase (the reactor, reproduced exactly):

        n_i = exp(ln N − ln P − g_i°(T)/RT + Σ_k π_k A_ki )

    solved with the M+1 element-balance + total-moles Newton system.

    Two phases (gas V + liquid L) share the SAME element potentials π_k at
    equilibrium; the liquid carries the pure-liquid reference derived from
    the component's vapour pressure,

        g_i°_liq/RT = g_i°/RT + ln(Psat_i(T)),

    so a condensable species distributes as

        n_i^V = exp(ln N^V − ln P      − g_i°/RT + Σ π_k A_ki )
        n_i^L = exp(ln N^L − ln Psat_i − g_i°/RT + Σ π_k A_ki )   (condensable)

    The stationarity μ_i^V = μ_i^L it implies is exactly Raoult's law
    y_i P = x_i Psat_i, so the minimisation yields VLE AND reaction
    equilibrium simultaneously (condensation shifts the reaction --- the
    point of a multi-phase Gibbs reactor).

    A gas-only solve runs first; only if a condensable species is
    supersaturated (y_i P > Psat_i) is the larger M+2 two-phase system
    solved.  So a case with no condensation takes the path verbatim.
\*---------------------------------------------------------------------------*/

#pragma once

#include "GibbsMethod.H"

namespace Choupo {

class ElementPotential : public GibbsMethod
{
public:
    const std::string& name() const override { return name_; }
    GibbsEquilibrium equilibrium(const GibbsProblem& p, scalar T_K,
                                 const IterHook& onIter = {}) const override;

private:
    inline static const std::string name_ = "elementPotential";
};

} // namespace Choupo
