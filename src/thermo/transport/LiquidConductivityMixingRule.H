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
    Choupo::LiquidConductivityMixingRule

Description
    How the thermal conductivity of a LIQUID MIXTURE is built from the
    pure-component values lambda_i(T) (DEV.md 4c C331).  Selected beside the
    pure model:

        transport { liquid { thermalConductivity
        {
            model       chemsepEq16;
            mixingRule  Li;
        } } }

    Registered rules (explicit factory, CLAUDE.md section 5):

      massFractionAverage  lambda_m = sum w_i lambda_i, the rule Choupo used
                           alone until C331.  Mixtures of liquids conduct LESS
                           than either average (Poling 5ed sec. 10-12).
      Filippov             BINARY only: lambda_m = w1 l1 + w2 l2
                           - 0.72 w1 w2 |l2 - l1| (Filippov 1955; Poling 5ed
                           eq. 10-12.1; Perry 9ed eq. 2-113).  Refuses three
                           or more components present, naming Li.
      Li                   any number of components: lambda_m = sum_i sum_j
                           phi_i phi_j 2 l_i l_j/(l_i + l_j), phi_i the
                           volume fractions from the liquid molar volumes
                           (Li, AIChE J. 22 (1976) 927; Perry 9ed eq. 2-114).
\*---------------------------------------------------------------------------*/

#pragma once

#include "LiquidMixingContext.H"
#include "core/Dictionary.H"
#include "core/Types.H"

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {

class LiquidConductivityMixingRule
{
public:
    virtual ~LiquidConductivityMixingRule() = default;

    virtual const std::string& ruleName() const = 0;
    virtual const std::string& citation() const = 0;
    virtual const std::string& validityWindow() const = 0;

    // Mixture liquid thermal conductivity [W/(m K)] at T [K], composition x.
    virtual scalar mix(scalar T_K, const sVector& x, const sVector& pure,
                       const LiquidMixingContext& ctx) const = 0;

    // ---- Run-time selection (explicit registry) ------------------------
    using Factory = std::function<std::unique_ptr<LiquidConductivityMixingRule>(const DictPtr&)>;

    static void registerType(const std::string& name, Factory f);
    static std::unique_ptr<LiquidConductivityMixingRule> New(const DictPtr& dict);
    static void registerBuiltins();
    static std::vector<std::string> availableRules();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
