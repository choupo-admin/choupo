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
    Choupo::PolynomialCp

Description
    Polynomial heat capacity in T:

        Cp(T) = a_0 + a_1 T + a_2 T^2 + a_3 T^3 + a_4 T^4    [J/(mol·K)]

    Integration of Cp gives sensible enthalpy in closed form.
\*---------------------------------------------------------------------------*/

#pragma once

#include "HeatCapacityModel.H"

namespace Choupo {

class PolynomialCp : public HeatCapacityModel
{
public:
    explicit PolynomialCp(const DictPtr& dict);

    scalar Cp(scalar T) const override;
    scalar H (scalar T, scalar Tref) const override;
    scalar S (scalar T, scalar Tref) const override;
    const std::string& modelName() const override { return name_; }

private:
    //  I4 ("a number outside its fitted range is ANNOUNCED, never silently
    //  extrapolated and never refused") was NOT implemented here: Tmin_/Tmax_
    //  were assigned in the constructor and never read again.  The declared
    //  window was parsed and discarded, for the most common heat-capacity
    //  model in the corpus.
    //
    //  That is also why the six inverted windows the provenance audit found
    //  (hi <= lo, from CoolProp liquid-Cp fits) did no visible harm: nothing
    //  looked at them.  Harmless-because-unchecked is not safety.
    //
    //  `noteRange` announces ONCE per model instance and then costs a single
    //  bool test -- deliberate, because Cp(T) is the hot path and I4's own
    //  rule is that provenance lives at boundaries, never in the inner loop.
    void noteRange(scalar T) const;

    sVector a_;
    scalar Tmin_ = 0.0, Tmax_ = 0.0;
    //  `Trange unknown;` -- a DECLARED absence, distinct from
    //  both a window and no key at all (AP3).
    bool   rangeUnknown_ = false;
    mutable bool announcedOutside_ = false;
    mutable bool announcedBadWindow_ = false;
    std::string owner_;                 // for a message that names the record
    inline static const std::string name_ = "polynomial";
};

} // namespace Choupo
