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
    Choupo::AmbroseWalton

Description
    Vapour pressure by the Ambrose-Walton three-parameter corresponding-states
    correlation (Ambrose & Walton, 1989; Poling, Prausnitz & O'Connell, "The
    Properties of Gases and Liquids", 5th ed., Eq. 7-2.7):

        ln(Psat/Pc) = f0(Tr) + omega*f1(Tr) + omega^2*f2(Tr)

    with tau = 1 - Tr and (each divided by Tr):

        f0 = (-5.97616 tau + 1.29874 tau^1.5 - 0.60394 tau^2.5 - 1.06841 tau^5)
        f1 = (-5.03365 tau + 1.11505 tau^1.5 - 5.41217 tau^2.5 - 7.46628 tau^5)
        f2 = (-0.64771 tau + 2.41539 tau^1.5 - 4.26979 tau^2.5 + 3.25259 tau^5)

    This needs ONLY Tc, Pc and omega -- exactly the constants a Joback +
    Lee-Kesler estimate already produces -- so it CLOSES the Psat gap of an
    estimated component WITHOUT any measured Antoine data: an estimated
    component becomes flashable.  It is an ESTIMATE, not data: accurate to a
    few % for non-polar and slightly polar species, and it DEGRADES for
    strongly polar / hydrogen-bonding / associating compounds (water, alcohols,
    carboxylic acids).  The glass-box rule stands -- overlay the predicted curve
    on measured Psat (the estimate op does this against the `reference{}` /
    `experimental{}` blocks) before trusting it for design.

    DRY: Tc, Pc and omega live at COMPONENT level, not inside the
    `vaporPressure {}` block.  Component::Component injects them into the
    sub-dict before constructing the model, so the case author declares them
    once:

        vaporPressure { model AmbroseWalton; }     // Tc/Pc/omega taken from the component
\*---------------------------------------------------------------------------*/

#pragma once

#include "VaporPressureModel.H"

namespace Choupo {

class AmbroseWalton : public VaporPressureModel
{
public:
    explicit AmbroseWalton(const DictPtr& dict);

    scalar Psat_Pa(scalar T_K) const override;

    // The bare correlation, exposed so other glass-box callers (the
    // estimateComponent props op) reuse the SAME coefficients instead of
    // duplicating them.  T, Tc in K; Pc in Pa; omega dimensionless; returns Pa.
    static scalar psat(scalar T_K, scalar Tc, scalar Pc, scalar omega);
    // Corresponding-states correlation: defined from the triple point up to
    // the critical point.  range() is advisory (the engine does not yet gate
    // on it); the honest validity caveat is the polar/associating degradation,
    // surfaced by the estimate op's data overlay rather than a T window.
    std::pair<scalar, scalar> range() const override { return {0.0, Tc_}; }
    const std::string& modelName() const override { return name_; }

private:
    scalar Tc_, Pc_, omega_;
    std::string name_;
};

} // namespace Choupo
