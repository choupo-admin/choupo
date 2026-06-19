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
    Choupo::LeithLicht

Description
    Leith & Licht (1972) cyclone model --- the "new theoretical approach"
    with turbulent radial back-mixing:

        η(d) = 1 − exp[ −2 (C ψ)^(1/(2n+2)) ]
        ψ    = ρ_p d^2 Q / (18 μ D_c^3)            (inertia / Stokes number)
        n    = 1 − (1 − 0.67 D_c^0.14)(T/283)^0.3  (vortex exponent)

    C is a geometric-configuration constant (dimensionless): Leith & Licht
    tabulate it per cyclone family.  It is the empirical knob --- default
    402.88 ("general-purpose" Lapple/Stairmand-like geometry), overridable
    with `C <value>;` and exactly what a FitParameters calibration to data
    would tune.  d50 is found by bisection on η = 0.5 (base default).
\*---------------------------------------------------------------------------*/

#pragma once

#include "CycloneModel.H"

namespace Choupo {

class LeithLicht : public CycloneModel
{
public:
    const std::string& type() const override { return type_; }
    void   readParameters(const DictPtr& oper) override;
    scalar gradeEfficiency(scalar d, const CycloneContext& c) const override;
private:
    inline static const std::string type_ = "LeithLicht";
    scalar C_ = 402.88;          // geometric configuration constant
};

} // namespace Choupo
