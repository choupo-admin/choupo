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
    Choupo::SolutionDiffusion

Description
    The classical solution-diffusion transport law (the baseline, lifted
    verbatim from SpiralWoundModule::localFluxes).

        J_w   = A_w (P_b - P_p - Delta_pi)                    water flux [m/s]
        J_s,i = B_s,i (c_m,i - c_p,i)                solute flux [kmol/(m2.s)]
        c_m,i / c_b,i  from the film-model concentration polarisation
        c_p,i = (B_s,i / phi_i) c_m,i,   phi_i = J_w + B_s,i
        Delta_pi = pi(c_m) - pi(c_p)               from the osmotic model

    Closed-form for c_m,i given J_w (film model + solution-diffusion):
        Let phi_i = J_w + B_s,i,  E = exp(J_w / k_film).  Then
            c_m,i = E c_b,i / ( 1 + B_s,i (E - 1) / phi_i )
        c_p,i = (B_s,i / phi_i) c_m,i

    The non-linearity is in J_w via Delta_pi; an inner Newton-1D with damping
    resolves it, starting from the no-osmotic guess J_w0 = A_w (P_b - P_p).
\*---------------------------------------------------------------------------*/

#pragma once

#include "TransportModel.H"

namespace Choupo {
namespace membrane {

class SolutionDiffusion : public TransportModel
{
public:
    const std::string& type() const override { return type_; }

    TransportSolution localFluxes(const TransportContext& ctx) const override;

private:
    inline static const std::string type_ = "solutionDiffusion";
};

} // namespace membrane
} // namespace Choupo
