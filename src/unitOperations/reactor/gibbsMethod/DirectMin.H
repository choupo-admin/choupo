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
    Choupo::DirectMin

Description
    Direct Gibbs-energy minimisation for the multi-phase Gibbs reactor (B2)
    --- the most general method, using the same multi-start Nelder-Mead
    machinery as the VLLE flash.

    Variables: the reaction extents ξ_r (a basis of the null space of the
    atom matrix A, so n^tot = n^in + Σ ξ_r ν_r stays element-balanced) plus a
    liquid fraction f_c ∈ [0,1] for each condensable.  The objective is the
    total Gibbs energy

        G/RT = Σ_i n_i^V (g_i°/RT + ln y_i + ln P)
             + Σ_i n_i^L (g_i°/RT + ln Psat_i + ln(γ_i x_i))

    minimised directly (penalty for negative moles), seeded from the gas-only
    solve.  Carries a γ-model (NRTL / Wilson) like reactiveFlash, but reaches
    the optimum by minimising G rather than by VLE successive substitution ---
    a robustness cross-check.  On a single ideal condensable it returns the
    same answer as elementPotential / reactiveFlash.
\*---------------------------------------------------------------------------*/

#pragma once

#include "GibbsMethod.H"

namespace Choupo {

class DirectMin : public GibbsMethod
{
public:
    const std::string& name() const override { return name_; }
    GibbsEquilibrium equilibrium(const GibbsProblem& p, scalar T_K,
                                 const IterHook& onIter = {}) const override;

private:
    inline static const std::string name_ = "directMin";
};

} // namespace Choupo
