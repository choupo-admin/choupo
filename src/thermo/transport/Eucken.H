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
    Choupo::Eucken

Description
    Eucken (1913) estimate for low-pressure gas thermal conductivity:

        lambda = (Cp_ig + 5R/4) mu / M                        [W/(m K)]

    Cp_ig the molar ideal-gas heat capacity [J/(mol K)], mu the pure gas
    viscosity [Pa s], M the molar mass [kg/mol].  Uses ONLY quantities
    already available (Cp from the component's idealGasHeatCapacity block,
    mu from the viscosity model) -- zero new component data.

    PRIMARY: Eucken, A. (1913), Physik. Z. 14, 324-332.  Transcribed from
    Reid, Prausnitz & Poling, 4th ed. (1987), eq. 10-3.2 (the route).

    THE ANCHOR THEORY SUPPLIES.  For a monatomic gas Cp = 5R/2, and Eucken's
    bracket becomes (5R/2 + 5R/4) = 15R/4 -- which is EXACTLY the
    Chapman-Enskog result for a monatomic gas, lambda = (15/4) (R/M) mu
    (Chapman & Cowling, The Mathematical Theory of Non-uniform Gases,
    1939).  Eucken's 5R/4 is not a fitted number: it is the constant that
    makes the formula contain the rigorous monatomic limit.  verify() checks
    that limit, and a wrong constant fails there.

    For POLYATOMIC gases the formula treats internal-mode energy transport
    with the same factor as translation, which it does not deserve; the
    modified Eucken (transport/ModifiedEucken.H, Svehla 1962 eq. (2), the
    internal modes weighted 1.32) is the registered correction since
    2026-09-06 -- selecting `Eucken` on CO2 or NH3 is an approximation the
    window string says so about, and the bench prints both side by side.
\*---------------------------------------------------------------------------*/

#pragma once

#include "ThermalConductivityModel.H"

namespace Choupo {

class Eucken : public ThermalConductivityModel
{
public:
    explicit Eucken(const DictPtr& /*dict*/) {}

    const std::string& modelName() const override { return name_; }
    const std::string& validityWindow() const override { return window_; }
    const std::string& citation() const override { return cite_; }
    scalar conductivityGasPure(const Component& c, scalar T_K,
                               scalar mu_pure,
                               scalar cp_ig_pure) const override;
    CorrelationVerify verify() const override;
    std::string windowNote(const Component& c, scalar T_K) const override;

    //  The kernel, public and static: one home for the formula.
    static scalar kernel(scalar cp_ig_J_per_molK, scalar mu_PaS,
                         scalar M_kg_per_mol);                // W/(m K)

private:
    inline static const std::string name_ = "Eucken";
    inline static const std::string window_ =
        "dilute (low-pressure) gas; EXACT for a monatomic gas (Cp = 5R/2 "
        "gives the Chapman-Enskog (15/4) R mu / M); an APPROXIMATION for "
        "polyatomic gases, whose internal-mode transport it weights like "
        "translation -- declare `model modifiedEucken;` (Svehla 1962 eq. 2, "
        "internal modes weighted 1.32) for the corrected form";
    inline static const std::string cite_ =
        "Eucken, A. (1913), Physik. Z. 14, 324-332 [primary]; transcribed "
        "via Reid, Prausnitz & Poling, 4th ed. (1987), eq. 10-3.2; monatomic "
        "limit after Chapman, S. and Cowling, T. G., The Mathematical Theory "
        "of Non-uniform Gases (1939)";
};

} // namespace Choupo
