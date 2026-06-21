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
    Choupo::NASA7Cp

Description
    NASA 7-coefficient polynomial heat capacity -- the thermo form CHEMKIN
    mechanisms ship with, so an imported gas-phase species lights up Cp/H/S
    (hence Keq-consistent reverse rates) with no re-fitting.  Two temperature
    ranges meeting at Tcommon:

        Cp/R = a1 + a2 T + a3 T^2 + a4 T^3 + a5 T^4

    The dimensionless H°/RT and S°/R carry a6, a7 (the formation offset and
    entropy constant); but to honour the HeatCapacityModel contract -- which
    returns the SENSIBLE integrals ∫Cp dT and ∫Cp/T dT relative to a Tref, the
    formation datum living separately in the component's Hf298/S298 -- this
    class returns ONLY the sensible parts (a6, a7 are not used here).  The
    integral splits at Tcommon when Tref and T straddle it.

    Dict form (readable, not a CHEMKIN card):
        model    NASA7;
        Tlow     200;  Tcommon 1000;  Thigh 3500;
        low   ( a1 a2 a3 a4 a5 a6 a7 );   // valid Tlow..Tcommon
        high  ( a1 a2 a3 a4 a5 a6 a7 );   // valid Tcommon..Thigh
\*---------------------------------------------------------------------------*/

#pragma once

#include "HeatCapacityModel.H"

namespace Choupo {

class NASA7Cp : public HeatCapacityModel
{
public:
    explicit NASA7Cp(const DictPtr& dict);

    scalar Cp(scalar T) const override;
    scalar H (scalar T, scalar Tref) const override;
    scalar S (scalar T, scalar Tref) const override;
    const std::string& modelName() const override { return name_; }

private:
    // The five Cp coefficients (a1..a5) valid at temperature T.
    const scalar* coeffsFor(scalar T) const;
    // ∫Cp dT and ∫Cp/T dT over [Ta,Tb] assumed within ONE range.
    scalar enthalpySeg_(scalar Ta, scalar Tb, const scalar* a) const;
    scalar entropySeg_ (scalar Ta, scalar Tb, const scalar* a) const;

    scalar low_[5]  = {0, 0, 0, 0, 0};   // a1..a5, Tlow..Tcommon
    scalar high_[5] = {0, 0, 0, 0, 0};   // a1..a5, Tcommon..Thigh
    scalar Tlow_ = 200.0, Tcommon_ = 1000.0, Thigh_ = 3500.0;
    inline static const std::string name_ = "NASA7";
};

} // namespace Choupo
