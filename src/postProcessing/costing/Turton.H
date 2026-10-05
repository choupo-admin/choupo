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
    Choupo::Turton

Description
    Turton et al. (Appendix A) capital-cost correlations, on the bare-module
    FORM Guthrie (1969) introduced.  Per-equipment-type purchased cost in
    2001 USD:

        log10(C_p)  =  K1 + K2·log10(S) + K3·(log10 S)²

    where S is a sizing parameter (V_R [m³] for vessels, A [m²] for HX).

    Pressure factor (vertical / horizontal vessels):
        log10(F_P)  =  C1 + C2·log10(P) + C3·(log10 P)²       (P bar gauge)

    Bare-module cost:
        C_BM  =  C_p · (B1 + B2 · F_M · F_P )

    Total-module cost:
        C_TM  =  1.18 · C_BM     (contingency + fees)

    CEPCI update to target year:
        C_target  =  C_2001 · CEPCI_target / CEPCI_2001

    Currency conversion USD → EUR uses the user-supplied exchange rate
    (default 0.92 EUR / USD for 2026 — adjustable via costingDict).
\*---------------------------------------------------------------------------*/

#pragma once

#include "CostingModel.H"

//  `std::map` IS USED IN THIS HEADER'S OWN SIGNATURE, so this header includes
//  it -- it does NOT lean on `CostingModel.H` happening to.  g++ lends a
//  transitively-included declaration and emscripten's libc++ does not, which
//  is the split that took www.choupo.org three commits stale on 2026-08-27:
//  a green native suite says nothing about the site, because the site is a
//  different toolchain.  `check_std_includes` caught this one before it
//  shipped.
#include <map>

namespace Choupo {

class Turton : public CostingModel
{
public:
    explicit Turton(const DictPtr& costingDict);

    const std::string& type() const override { return type_; }

    CostBreakdown cost(const EquipmentSizing& dim,
                       const Material&   mat) const override;

    //  The four constants below, published so the pass's header can DRAW them
    //  instead of re-deriving them from the dict with a second set of
    //  defaults.  See `CostingModel::pricingFactors`.
    std::map<std::string, scalar> pricingFactors() const override;

private:
    //  THE NAME IS WHOSE NUMBERS THESE ARE (ruled 2026-09-03, completed
    //  2026-10-05, DEV.md 4c C38 item 2).  Every coefficient in Turton.cpp is
    //  Turton et al.'s (App. A); Guthrie (1969) supplied the bare-module FORM
    //  they sit in, and the form is cited where it is used.  The class, its
    //  files, the registered factory key and the word the costing banner
    //  prints were three different names for one model until 2026-10-05;
    //  they are one now, and `method Guthrie;` is REFUSED by name
    //  (`CostingModel::New`) -- no alias, no dual reader.
    inline static const std::string type_ = "Turton";

    //  THE IN-CLASS INITIALISERS ARE GONE, and their absence is the point.
    //  They used to read `= 2026.0`, `= 820.0`, `= 397.0`, `= 0.92` -- the
    //  SAME four literals the constructor passes to
    //  `lookupScalarOrDefault`, one line apart, so one fact had two homes and
    //  the in-class copy was dead the whole time (the constructor assigns all
    //  four unconditionally, on every path).  The one home is
    //  `priceIndexDefaults` in Turton.cpp, which is also what announces when
    //  a default is USED.
    scalar  year_      = 0.0;
    scalar  cepci_     = 0.0;
    scalar  cepci2001_ = 0.0;
    scalar  usdToEur_  = 0.0;
};

} // namespace Choupo
