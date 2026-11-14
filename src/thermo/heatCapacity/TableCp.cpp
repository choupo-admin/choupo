/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

#include "TableCp.H"

#include <cstdio>
#include <stdexcept>

namespace Choupo {

TableCp::TableCp(std::unique_ptr<PropertyTable> table)
:   table_(std::move(table))
{
    if (!(table_->lo() <= anchorT && anchorT <= table_->hi()))
    {
        char b[160];
        std::snprintf(b, sizeof b, "the table's points span %.6g-%.6g K and do not contain %.2f K",
                      table_->lo(), table_->hi(), anchorT);
        throw std::runtime_error(table_->label() + ": " + b + " -- every liquid and"
            " solid enthalpy integrates from 298.15 K (the elements datum), so a heat-capacity table"
            " must contain it, or it cannot form an enthalpy (C398 addendum A2).  Add points that"
            " cover 298.15 K, or pin a law that does.");
    }
}

} // namespace Choupo
