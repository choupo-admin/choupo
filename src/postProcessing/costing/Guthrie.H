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
    Choupo::Guthrie

Description
    Guthrie (1969) / Turton (4th ed., Appendix A) capital-cost
    correlations.  Per-equipment-type purchased cost in 2001 USD:

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

namespace Choupo {

class Guthrie : public CostingModel
{
public:
    explicit Guthrie(const DictPtr& costingDict);

    const std::string& type() const override { return type_; }

    CostBreakdown cost(const EquipmentSizing& dim,
                       const Material&   mat) const override;

private:
    inline static const std::string type_ = "Guthrie";

    scalar  year_     = 2026.0;
    scalar  cepci_    = 820.0;
    scalar  cepci2001_= 397.0;
    scalar  usdToEur_ = 0.92;
};

} // namespace Choupo
