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

    PRIMARY: Andrade, E. N. da C. (1930), Nature 125, 309-310.  THE WINDOW
    IS THE RECORD'S, not the model's: A and B are valid over the range they
    were fitted to, and that range belongs in the component's block.  The
    Andrade blocks in this catalogue declare NO Trange, so nothing is
    announced when one is left -- a known gap, stated in validityWindow()
    rather than hidden by it.  The anchor is arithmetic and says so.
\*---------------------------------------------------------------------------*/

#pragma once

#include "LiquidViscosityModel.H"

namespace Choupo {

class Andrade : public LiquidViscosityModel
{
public:
    explicit Andrade(const DictPtr& /*dict*/) {}

    const std::string& modelName() const override { return name_; }
    const std::string& validityWindow() const override { return window_; }
    const std::string& citation() const override { return cite_; }
    scalar viscosityLiquidPure(const Component& c, scalar T_K) const override;
    CorrelationVerify verify() const override;

    //  The kernel, public and static: one home for the formula, and the
    //  limit Vogel (C = 0) and chemsepEq101 (C = D = E = 0) must reduce to.
    static scalar kernel(scalar A, scalar B, scalar T_K);      // Pa.s

private:
    inline static const std::string name_ = "Andrade";
    inline static const std::string window_ =
        "saturated liquid, inside the temperature range the component's A "
        "and B were fitted over -- a property of the RECORD, not the model; "
        "the Andrade blocks in this catalogue declare no Trange, so leaving "
        "it is not announced (a known gap)";
    inline static const std::string cite_ =
        "Andrade, E. N. da C. (1930), Nature 125, 309-310 [primary]; the "
        "two-constant form as given in Reid, Prausnitz & Poling, 4th ed. "
        "(1987), ch. 9";
};

} // namespace Choupo
