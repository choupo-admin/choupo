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
    Choupo::SurfaceTensionMixingRule

Description
    How the surface tension of a LIQUID MIXTURE is built from the pure
    components' sigma_i(T) (DEV.md 4c C331).  Selected beside the
    pure-component model:

        transport { interface { surfaceTension
        {
            model       StoredCorrelation;     // sigma_i(T)
            mixingRule  Butler;                // how they combine
        } } }

    Registered rules (explicit factory, CLAUDE.md section 5):

      moleFractionAverage   sigma_m = sum x_i sigma_i.  The rule Choupo used
                            alone until C331.  It ignores that the surface is
                            not the bulk: in water + acetone the acetone
                            crowds the surface and sigma falls far below the
                            straight line (measured: see mixing01).
      Butler                the surface phase in equilibrium with the bulk,
                            with the case's OWN activity model on both sides
                            (Sprow & Prausnitz 1966; Poling, Prausnitz &
                            O'Connell, The Properties of Gases and Liquids,
                            5th ed., 2001, eqs. 12-5.16/12-5.17, molar areas
                            by eq. 12-5.20).

    The rule receives the pure values the package has evaluated at T
    (`pure[i]`, meaningful where x_i > 0) and the context of
    LiquidMixingContext.H.
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

class SurfaceTensionMixingRule
{
public:
    virtual ~SurfaceTensionMixingRule() = default;

    virtual const std::string& ruleName() const = 0;
    virtual const std::string& citation() const = 0;
    virtual const std::string& validityWindow() const = 0;

    // Mixture surface tension [N/m] at T [K] and bulk liquid composition x.
    virtual scalar mix(scalar T_K, const sVector& x, const sVector& pure,
                       const LiquidMixingContext& ctx) const = 0;

    // ---- Run-time selection (explicit registry) ------------------------
    //  `mixingRule` read from the property's own block; absent = the
    //  default named in New().
    using Factory = std::function<std::unique_ptr<SurfaceTensionMixingRule>(const DictPtr&)>;

    static void registerType(const std::string& name, Factory f);
    static std::unique_ptr<SurfaceTensionMixingRule> New(const DictPtr& dict);
    static void registerBuiltins();
    static std::vector<std::string> availableRules();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
