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
    Choupo::Vogel

Description
    Vogel-Fulcher-Tammann three-parameter saturated-liquid viscosity:

        ln μ = A + B / (T − C)        (μ in Pa·s, T in K)

    The extra parameter C (the Vogel temperature) bends the Arrhenius line
    and tracks strongly hydrogen-bonded liquids (water) far better than the
    2-parameter Andrade --- for water the fit RMS drops from ~3.5 % to
    ~0.2 % over 10-100 °C.  Read from the component's.dat:

        liquidViscosity { vogel { A -10.54; B 541.4; C 144.0; } }

    With C = 0 it degenerates to Andrade -- and that sentence is now the
    anchor verify() checks, against Andrade's own kernel, rather than a
    claim in a comment.  Both are FITTED, calibratable by FitParameters.

    PRIMARY: Vogel, H. (1921), Physik. Z. 22, 645-646; the same form
    independently by Fulcher, G. S. (1925), J. Am. Ceram. Soc. 8, 339-355,
    and Tammann, G. and Hesse, W. (1926), Z. Anorg. Allg. Chem. 156,
    245-257.  The window is the record's fitted range, as for Andrade.
\*---------------------------------------------------------------------------*/

#pragma once

#include "LiquidViscosityModel.H"

namespace Choupo {

class Vogel : public LiquidViscosityModel
{
public:
    explicit Vogel(const DictPtr& /*dict*/) {}

    const std::string& modelName() const override { return name_; }
    const std::string& validityWindow() const override { return window_; }
    const std::string& citation() const override { return cite_; }
    scalar viscosityLiquidPure(const Component& c, scalar T_K) const override;
    CorrelationVerify verify() const override;

    static scalar kernel(scalar A, scalar B, scalar C, scalar T_K);   // Pa.s

private:
    inline static const std::string name_ = "Vogel";
    inline static const std::string window_ =
        "saturated liquid, T > C (the Vogel temperature, where the form "
        "diverges), inside the range the component's A, B, C were fitted "
        "over -- a property of the RECORD; the Vogel blocks in this "
        "catalogue declare no Trange, so leaving it is not announced";
    inline static const std::string cite_ =
        "Vogel, H. (1921), Physik. Z. 22, 645-646 [primary]; also Fulcher, "
        "G. S. (1925), J. Am. Ceram. Soc. 8, 339-355 and Tammann, G. and "
        "Hesse, W. (1926), Z. Anorg. Allg. Chem. 156, 245-257";
};

} // namespace Choupo
