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
    Choupo::SpreadsheetReport

Description
    Consolidates the stream table, mass balance and energy balance into
    a single coloured OpenDocument Spreadsheet `reports/report.ods` ---
    "tudo formatadinho com cores".  One sheet per table; coloured
    headers; feed/product rows tinted; mass-closure cells shown green
    (within tolerance of 100 %) or red (off).  The plain CSV reports
    remain for machine reading; this is the human-facing artefact.

    Dict form (in controlDict reports{}):

        spreadsheet
        {
            file        report.ods;   // optional (default report.ods)
            closureTol  0.5;          // optional %, green band (default 0.5)
            Tref        298.15;       // optional, for the energy balance
        }
\*---------------------------------------------------------------------------*/

#pragma once

#include "Report.H"

namespace Choupo {

class SpreadsheetReport : public Report
{
public:
    const std::string& type() const override { return type_; }
    void run(const DictPtr& dict, const ReportContext& ctx) override;

private:
    inline static const std::string type_ = "spreadsheet";
};

} // namespace Choupo
