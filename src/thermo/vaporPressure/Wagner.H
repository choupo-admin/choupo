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
    Choupo::Wagner

Description
    The Wagner vapour-pressure equation, in the form with DECLARED exponents
    and DECLARED reducing constants:

        ln(Psat / Pr) = (Tr / T) * sum_i a_i * tau^e_i ,   tau = 1 - T / Tr

    where Tr and Pr are the REDUCING constants the coefficients were fitted
    with (for a fluid whose fit reduces by its critical point, Tc and Pc).

    WHY THE EXPONENTS ARE DATA.  The form is a FAMILY, and its members differ
    only in the exponent set: the IAPWS saturation equation for ordinary water
    uses (1, 1.5, 3, 3.5, 4, 7.5) (IAPWS SR1-86(1992), Eq. 1), while the
    four-term forms in the property handbooks use (1, 1.5, 2.5, 5) or
    (1, 1.5, 3, 6).  A model that hard-coded one set would silently misread a
    record fitted with another; declaring them makes the record carry
    everything its coefficients mean.

    WHY THE REDUCING CONSTANTS ARE DATA, AND ARE NEVER TAKEN FROM THE
    COMPONENT.  A Wagner fit's coefficients are meaningful only with the Tr
    and Pr they were regressed against.  A component record may carry a
    different critical point (water.dat's Tc is 647.14 K; the IAPWS equation
    reduces by 647.096 K), and substituting it would evaluate the correct
    coefficients at the wrong reduced temperature -- a silently wrong curve,
    worst exactly near the critical point.  So `reducing { T; P; }` is
    REQUIRED and the component's Tc / Pc (which Component::readFromDict
    injects into every vapour-pressure sub-dict) are ignored here, by name.

    Dictionary:

        vaporPressure
        {
            model         Wagner;
            reducing      { T 647.096 K;  P 22.064 MPa; }
            exponents     (1 1.5 3 3.5 4 7.5);
            coefficients  (-7.85951783 1.84408259 -11.7866497
                           22.6807411 -15.9618719 1.80122502);
            Trange        (273.16 647.096);
        }

    Above Tr the saturation line does not exist; the model returns Pr there
    (tau would be negative and its fractional powers undefined), exactly as
    AmbroseWalton caps at Pc.  The base class announces the excursion.

\*---------------------------------------------------------------------------*/

#pragma once

#include "VaporPressureModel.H"

#include <vector>

namespace Choupo {

class Wagner : public VaporPressureModel
{
public:
    explicit Wagner(const DictPtr& dict);

    //  The bare equation, exposed so a curation tool or a gate can evaluate
    //  the SAME arithmetic the runtime uses.  T and Tr in K, Pr in Pa;
    //  returns Pa.
    static scalar psat(scalar T_K, scalar Tr_K, scalar Pr_Pa,
                       const std::vector<scalar>& a,
                       const std::vector<scalar>& e);

    std::pair<scalar, scalar> range() const override { return {Tmin_, Tmax_}; }
    const std::string& modelName() const override { return name_; }

protected:
    scalar computePsat(scalar T_K) const override;

private:
    scalar Tr_ = 0.0, Pr_ = 0.0;
    std::vector<scalar> a_, e_;
    scalar Tmin_ = 0.0, Tmax_ = 0.0;
    std::string name_;
};

} // namespace Choupo
