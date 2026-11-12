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
    Choupo::LiquidViscosityMixingRule

Description
    How the viscosity of a LIQUID MIXTURE is built from the pure-component
    viscosities mu_i(T) (DEV.md 4c C331).  Selected beside the pure model:

        transport { liquid { viscosity
        {
            model        Vogel;
            mixingRule   GrunbergNissan;
            interaction
            (
                { i water;  j ethanol;  A ...;  B ... K;  C ...;  D ... K;
                  Tmin ... K;  Tmax ... K;  source "..."; }
            );
        } } }

    Registered rules (explicit factory, CLAUDE.md section 5):

      logMoleAverage   ln mu_m = sum x_i ln mu_i -- Grunberg-Nissan with
                       every G_ij = 0, the rule Choupo used alone until C331.
      GrunbergNissan   ln mu_m = sum x_i ln mu_i + sum_{i<j} x_i x_j G_ij,
                       Grunberg & Nissan (1949), Poling 5ed eq. 9-13.1, with
                       G_ij(T, x) = A + B/T + (C + D/T)(x_i - x_j) DECLARED
                       per pair from a fit to measured mixture viscosities
                       (Poling: G_ij is "a function of the components i and
                       j as well as the temperature (and, in some cases, the
                       composition)").  A pair with no declared G_ij mixes
                       with G_ij = 0, announced by name: the folder's
                       predictive routes do not cover water (Poling 5ed p.
                       9.90: "With aqueous solutions, neither the
                       Grunberg-Nissan form nor the UNIFAC-VISCO method is
                       recommended").
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

class LiquidViscosityMixingRule
{
public:
    virtual ~LiquidViscosityMixingRule() = default;

    virtual const std::string& ruleName() const = 0;
    virtual const std::string& citation() const = 0;
    virtual const std::string& validityWindow() const = 0;

    // Mixture liquid viscosity [Pa s] at T [K] and composition x.
    virtual scalar mix(scalar T_K, const sVector& x, const sVector& pure,
                       const LiquidMixingContext& ctx) const = 0;

    // ---- Run-time selection (explicit registry) ------------------------
    using Factory = std::function<std::unique_ptr<LiquidViscosityMixingRule>(const DictPtr&)>;

    static void registerType(const std::string& name, Factory f);
    static std::unique_ptr<LiquidViscosityMixingRule> New(const DictPtr& dict);
    static void registerBuiltins();
    static std::vector<std::string> availableRules();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
