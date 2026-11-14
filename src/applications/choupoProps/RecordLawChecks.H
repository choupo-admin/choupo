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
-------------------------------------------------------------------------------
File
    src/applications/choupoProps/RecordLawChecks.H

Description
    THE CHECK VALUE OF A RECORD LAW, READ BACK THROUGH THE LAW (DEV.md 4c
    C398, third addendum U3; slice (b)).  The units of a law's coefficients
    belong to its TYPE (recordLaws::declareForm), and the only way a
    coefficient written in another unit is caught is to evaluate the law at
    a state its source tabulates and compare: a law may carry

        check { T <value> <unit>; value <value> <unit>; tolerance <fraction>; }

    -- a value from the law's own source, never a second source of the
    property (A3: a redundant datum is a CHECK, compared and announced).
    `choupoProps --record-law-checks [OUT]` walks every component record of
    data/standards/components, every property block and every law, and
    writes one line per law: checked (with the declared and the engine's
    value and their relative difference), no check, or not evaluable.  The
    gate bin/curate/check_record_law_values.py reads it.
\*---------------------------------------------------------------------------*/

#pragma once

#include <string>

namespace Choupo {
namespace recordLawChecks {

//  Write the table to `outPath` (its directory is created) and return the
//  process exit code (0 even when a check fails: the gate judges).
int run(const std::string& outPath);

} // namespace recordLawChecks
} // namespace Choupo
