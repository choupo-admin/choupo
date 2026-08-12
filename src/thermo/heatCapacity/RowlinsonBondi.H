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
    Choupo::RowlinsonBondi

Description
    LIQUID heat capacity by the Rowlinson-Bondi corresponding-states
    correlation (Bondi 1968; Rowlinson 1969; as given in Poling, Prausnitz &
    O'Connell, "The Properties of Gases and Liquids", 5th ed., Eq. 6-8.4):

        (Cp_L - Cp_ig)/R = 1.586 + 0.49/(1 - Tr)
                           + omega * [ 4.2775
                                       + 6.3 (1 - Tr)^(1/3) / Tr
                                       + 0.4355/(1 - Tr) ]

    WHY THIS MODEL EXISTS HERE.  It is the last rung of the predictive ladder
    that turns a structurally-known molecule into a working component:

        groups -> Joback (Tc, Pc, Tb, Cp_ig) -> Lee-Kesler (omega)
               -> Ambrose-Walton (Psat)  ... and until now, a dead end.

    `HeatCapacityModel` registered `polynomial` and `NASA7` and nothing else,
    so a bootstrapped component had no liquid Cp and could not enter an energy
    balance.  That is what blocked the rigorous column in the 2026-08-11 agent
    test, and it was recorded at the time as "ABSENT and UNCLOSEABLE".  That
    was wrong -- it was reached by listing the estimators that EXIST rather
    than asking what is legitimately DERIVABLE -- and this class is the
    correction.

    IT NEEDS NOTHING MEASURED.  Tc and omega live at COMPONENT level and are
    injected by Component::Component, exactly as AmbroseWalton's are; the
    ideal-gas Cp is taken from the component's own `idealGasHeatCapacity`
    block, injected the same way.  So a component with Joback constants and a
    Joback Cp_ig gets a liquid Cp with no measured data at all.

    WHAT IT IS, ON THE FIVE AXES (docs/design/provenance-semantics-five-axes.md):

        origin        predicted      -- a correlation: perfect inputs would
                                        still not give an exact answer
        method        RowlinsonBondi
        from          ( Tc omega Cp_ig )

    That `from` is not decoration.  On a bootstrapped component Tc comes from
    Joback and omega from Lee-Kesler over Joback's own Tb/Tc/Pc, so the liquid
    Cp, the vapour pressure and the critical constants all descend from ONE
    fragmentation.  Their errors are correlated, not independent.

    THE POLE IS REAL AND IS HANDLED.  Two terms carry 1/(1 - Tr), so the
    correlation DIVERGES at the critical point -- which is physically right
    (Cp_L does diverge there) and numerically useless.  Tr >= 1 is REFUSED (no
    liquid exists), and evaluation outside the correlation's declared window is
    ANNOUNCED and still returned, per the extrapolation doctrine (I4).

    H AND S ARE PART-EXACT, PART-QUADRATURE, AND THE SPLIT IS DELIBERATE.
    The (1 - Tr)^(1/3)/Tr term has no elementary antiderivative.  Rather than
    integrate the whole Cp numerically, the IDEAL-GAS part is integrated
    EXACTLY through the nested model (whatever it is -- polynomial, NASA7) and
    only the DEPARTURE is quadratured.  So the large, well-known term keeps its
    closed form and the numerical error rides only on the correction.

\*---------------------------------------------------------------------------*/

#pragma once

#include "HeatCapacityModel.H"

#include <memory>
#include <string>

namespace Choupo {

class RowlinsonBondi : public HeatCapacityModel
{
public:
    explicit RowlinsonBondi(const DictPtr& dict);

    scalar Cp(scalar T_K) const override;
    scalar H (scalar T_K, scalar Tref_K) const override;
    scalar S (scalar T_K, scalar Tref_K) const override;

    const std::string& modelName() const override { return name_; }

    //  The DEPARTURE alone, (Cp_L - Cp_ig), in J/(mol.K).  Public because the
    //  gate checks it against an independent closed form: a validation that
    //  can only reach the sum has to trust the nested Cp_ig to isolate a
    //  defect in the correlation, and then it is testing two things at once.
    scalar departure(scalar T_K) const;

    //  The declared window of the correlation, as reduced temperature.
    static constexpr scalar TrLow  = 0.25;
    static constexpr scalar TrHigh = 0.85;

private:
    std::string name_ = "RowlinsonBondi";
    scalar Tc_    = 0.0;
    scalar omega_ = 0.0;
    std::unique_ptr<HeatCapacityModel> cpIg_;
    std::string owner_;          // the component, for announcements
    mutable bool announced_ = false;

    void announceRangeOnce(scalar T_K) const;
};

}   // namespace Choupo
