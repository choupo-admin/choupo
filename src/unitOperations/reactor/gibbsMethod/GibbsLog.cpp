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
Function
    Choupo::writeGibbsLogCsv / Choupo::refuseGibbsLogPath

Description
    The file behind a gibbsReactor's opt-in `newtonLog <file>;` (commission
    C15, 2026-09-27): the structured log of one Gibbs solve (GibbsMethod.H,
    `GibbsLogRecord`) written as CSV in the LONG form,

        stage,iteration,quantity,value,unit
        leastSquaresSeed,0,pi_C,<value>,-
        leastSquaresSeed,0,lnN,<value>,ln(mol/s)
        ...

    one number per line.  The long form is deliberate: a solve that also
    tests a liquid, bisects a solid or re-seeds its Newton adds ROWS, and a
    reader selects by (stage, quantity) instead of by column position.  No
    field ever carries a comma, so a plain split reads it.

    Nothing here derives a number: the records are what the solver computed.
\*---------------------------------------------------------------------------*/

#include "GibbsMethod.H"

#include "thermo/RecordResolver.H"

#include <cmath>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

namespace Choupo {

void refuseGibbsLogPath(const std::string& path)
{
    records::refuseStandardsWrite("gibbsReactor", "newtonLog", path);
}

long writeGibbsLogCsv(const std::string& path,
                      const std::vector<GibbsLogRecord>& records)
{
    refuseGibbsLogPath(path);          // the guard sits beside the ofstream
    std::ofstream f(path);
    if (!f) return -1;
    f << "stage,iteration,quantity,value,unit\n";
    for (const auto& r : records)
    {
        std::ostringstream v;
        v.precision(12);
        if (std::isfinite(r.value)) v << r.value; else v << "nan";
        f << r.stage << ',' << r.iteration << ',' << r.quantity << ','
          << v.str() << ',' << r.unit << '\n';
    }
    return f ? static_cast<long>(records.size()) : -1;
}

} // namespace Choupo
