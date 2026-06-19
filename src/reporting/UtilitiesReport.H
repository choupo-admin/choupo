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
    Choupo::UtilitiesReport

Description
    Plant-utility consumption rolled up by category --- the steam, cooling
    water, electricity, compressed air,... totals an engineer signs off
    on.  Reads `SimulationResult.utilities` (aggregated by each stream's
    `category` tag) and writes `reports/utilities/summary.csv`.

    A stream earns a utility line by carrying e.g. `category
    LP_steam_170kPa;`.  Streams with no category are process streams and
    do not appear here.
\*---------------------------------------------------------------------------*/

#pragma once

#include "Report.H"

namespace Choupo {

class UtilitiesReport : public Report
{
public:
    const std::string& type() const override { return type_; }
    void run(const DictPtr& dict, const ReportContext& ctx) override;

private:
    inline static const std::string type_ = "utilities";
};

} // namespace Choupo
