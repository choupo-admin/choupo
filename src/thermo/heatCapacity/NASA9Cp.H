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
    Choupo::NASA9Cp

Description
    NASA Glenn 9-coefficient polynomial heat capacity -- the form of
    McBride, Zehe & Gordon, NASA/TP-2002-211556 (2002), eq. (1), a US
    government work in the public domain.  Two temperature intervals meeting
    at Tcommon:

        Cp/R = a1 T^-2 + a2 T^-1 + a3 + a4 T + a5 T^2 + a6 T^3 + a7 T^4

    WHY IT EXISTS (DEV.md 4c C164, 2026-10-25).  The combustion species the
    catalogue carried as NASA-7 came from GRI-Mech 3.0's thermo file, which
    grants no redistribution.  The public-domain primary is TP-2002-211556,
    and it publishes NINE coefficients per interval (its appendix D, the
    thermo.inp listing).  Read as published, the coefficients need no
    re-fitting -- a NASA-7 refit of them would be a derived number with a
    second home, and the reader could no longer hold the record to the page.

    The report's two integration constants b1, b2 (its eqs. (2), (3)) are NOT
    read: the HeatCapacityModel contract returns the SENSIBLE integrals
    relative to a Tref, and the formation datum lives in the component's
    standardThermochemistry block (exactly the NASA7Cp posture).  The
    integral splits at Tcommon when Tref and T straddle it.

    The declared window [Tlow, Thigh] is a claim: a Cp asked outside it is
    ANNOUNCED once per component (AdvisoryLog), extrapolated and returned --
    the chemsepCp16 posture.

    Dict form:
        model    NASA9;
        Tlow     200;  Tcommon 1000;  Thigh 6000;
        low   ( a1 a2 a3 a4 a5 a6 a7 );   // valid Tlow..Tcommon
        high  ( a1 a2 a3 a4 a5 a6 a7 );   // valid Tcommon..Thigh
    Tlow, Tcommon and Thigh are REQUIRED (no default window: the interval is
    part of the published fit).
\*---------------------------------------------------------------------------*/

#pragma once

#include "HeatCapacityModel.H"

#include <string>

namespace Choupo {

class NASA9Cp : public HeatCapacityModel
{
public:
    explicit NASA9Cp(const DictPtr& dict);

    scalar Cp(scalar T) const override;
    scalar H (scalar T, scalar Tref) const override;
    scalar S (scalar T, scalar Tref) const override;
    const std::string& modelName() const override { return name_; }

private:
    const scalar* coeffsFor(scalar T) const;
    // Antiderivatives of Cp and Cp/T for ONE coefficient set.
    scalar hAnti_(scalar T, const scalar* a) const;
    scalar sAnti_(scalar T, const scalar* a) const;
    void   noteRange(scalar T) const;

    scalar low_[7]  = {0, 0, 0, 0, 0, 0, 0};   // a1..a7, Tlow..Tcommon
    scalar high_[7] = {0, 0, 0, 0, 0, 0, 0};   // a1..a7, Tcommon..Thigh
    scalar Tlow_ = 0.0, Tcommon_ = 0.0, Thigh_ = 0.0;
    std::string owner_;
    mutable bool announcedOutside_ = false;
    inline static const std::string name_ = "NASA9";
};

} // namespace Choupo
