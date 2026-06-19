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
    Choupo::Barth

Description
    Barth (1956) "orbit-equilibrium" cyclone model.  A particle of the cut
    size orbits on the imaginary control surface (CS, the cylinder at the
    vortex-finder radius): centrifugal force balances the inward Stokes
    drag of the radial gas flow.

        d50 = sqrt( 18 μ v_r r_cs / (ρ_p v_θ²) )

    with r_cs = D_c/4 (vortex-finder radius), radial velocity
    v_r = Q/(π D_cs H_cs), and tangential velocity v_θ = α v_i on the CS.
    Grade efficiency is a sharp logistic η = 1/(1+(d50/d)^β) (β ≈ 4, the
    force-balance gives a sharper cut than Lapple's β = 2).

    The geometric details are condensed into two calibratable constants:
    α (tangential-velocity factor, default 1.5) and the CS-height factor
    H_cs/D_c (default 2).  Tune them with `alpha`/`heightFactor` --- exactly
    what a FitParameters calibration to data would do.  ΔP falls back to the
    base Shepherd-Lapple correlation.
\*---------------------------------------------------------------------------*/

#pragma once

#include "CycloneModel.H"

namespace Choupo {

class Barth : public CycloneModel
{
public:
    const std::string& type() const override { return type_; }
    void   readParameters(const DictPtr& oper) override;
    scalar gradeEfficiency(scalar d, const CycloneContext& c) const override;
    scalar cutDiameter(const CycloneContext& c) const override;
private:
    inline static const std::string type_ = "Barth";
    scalar alpha_  = 1.5;        // tangential-velocity factor v_θ = α v_i
    scalar hFac_   = 2.0;        // control-surface height factor H_cs/D_c
    scalar beta_   = 4.0;        // logistic slope
};

} // namespace Choupo
