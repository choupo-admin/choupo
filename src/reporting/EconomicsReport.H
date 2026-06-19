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
    Choupo::EconomicsReport

Description
    CAPEX as a report object.  Runs the `costing` PostProcessor over the
    result (Guthrie/Turton purchased + bare-module + total-module cost
    from each unit's equipment size) and writes `reports/economics/
    costs.csv` with a TOTAL row.

    Costing reads the equipment SIZES, so `design` must appear BEFORE
    `economics` in the reports{} block.  The block body is the legacy
    postDict `costing {... }` block (method, year, cepci, usdToEur):

        economics { method Guthrie; year 2026; cepci 820; cepci2001 397; }
\*---------------------------------------------------------------------------*/

#pragma once

#include "Report.H"

namespace Choupo {

class EconomicsReport : public Report
{
public:
    const std::string& type() const override { return type_; }
    void run(const DictPtr& dict, const ReportContext& ctx) override;

private:
    inline static const std::string type_ = "economics";
};

} // namespace Choupo
