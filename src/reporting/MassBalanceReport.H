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
    Choupo::MassBalanceReport

Description
    The first reflex of any chemical engineer: does the mass close?
    Writes two CSVs into `reports/`:

      massBalance.csv         --  global, per component: in / out / net
                                  (net = out - in; negative = consumed by
                                  reaction), plus a TOTAL row whose closure
                                  MUST be ~100 % (mass is conserved even
                                  with reaction).

      massBalance_byUnit.csv  --  per unit: total mass in / out / closure %
                                  (closes for every unit, reaction or not).

    Closure % = 100 * out / in  for the total mass; the deviation from
    100 % is the numerical closure error of the converged solution.
\*---------------------------------------------------------------------------*/

#pragma once

#include "Report.H"

namespace Choupo {

class MassBalanceReport : public Report
{
public:
    const std::string& type() const override { return type_; }
    void run(const DictPtr& dict, const ReportContext& ctx) override;

private:
    inline static const std::string type_ = "massBalance";
};

} // namespace Choupo
