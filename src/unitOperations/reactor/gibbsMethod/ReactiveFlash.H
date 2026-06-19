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
    Choupo::ReactiveFlash

Description
    Multi-component, NON-IDEAL gas + liquid Gibbs reactor by successive
    substitution (reaction in the gas <-> γ-flash of the condensables).
    The B1 sibling of elementPotential: it lifts A's single-pure-liquid
    restriction to SEVERAL coexisting condensables with activity coefficients
    (NRTL / Wilson).

    Variables: ln(n_c^L) for each supersaturating condensable c.  Residual is
    the VLE mismatch
        R_c = ln(y_c P) − ln(γ_c x_c Psat_c)        (= 0 at equilibrium),
    where y_c comes from the nested gas-only Gibbs solve at the element
    balance reduced by the liquid (b − A·n^L), x_c = n_c^L / Σ n^L, and γ_c
    from the thermo activity model.  Solved by Newton-ND.

    For a SINGLE ideal condensable this reduces to y_c P = Psat_c --- exactly
    the elementPotential V+L result (a built-in cross-check on gibbs07).
\*---------------------------------------------------------------------------*/

#pragma once

#include "GibbsMethod.H"

namespace Choupo {

class ReactiveFlash : public GibbsMethod
{
public:
    const std::string& name() const override { return name_; }
    GibbsEquilibrium equilibrium(const GibbsProblem& p, scalar T_K,
                                 const IterHook& onIter = {}) const override;

private:
    inline static const std::string name_ = "reactiveFlash";
};

} // namespace Choupo
