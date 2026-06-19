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
    Choupo::Andrade

Description
    Andrade (1930) two-parameter saturated-liquid viscosity:

        ln μ = A + B / T        (μ in Pa·s, T in K)

    A and B are FITTED per component (a data-anchored correlation, the
    cheapest useful liquid-viscosity model --- "all models are wrong, some
    useful").  Read from the component's.dat:

        liquidViscosity { andrade { A -11.58; B 1243.3; } }

    Two parameters, so exact through two reference points and monotone in T
    (liquid viscosity FALLS with temperature --- the opposite of a gas).
    For strongly hydrogen-bonded liquids (water) the 3-parameter Vogel does
    markedly better; see Choupo::Vogel.
\*---------------------------------------------------------------------------*/

#pragma once

#include "LiquidViscosityModel.H"

namespace Choupo {

class Andrade : public LiquidViscosityModel
{
public:
    explicit Andrade(const DictPtr& /*dict*/) {}

    const std::string& modelName() const override { return name_; }
    scalar viscosityLiquidPure(const Component& c, scalar T_K) const override;

private:
    inline static const std::string name_ = "Andrade";
};

} // namespace Choupo
