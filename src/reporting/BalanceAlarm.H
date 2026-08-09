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
File
    src/reporting/BalanceAlarm.H

Description
    THE CONSERVATION ALARM -- one home, three laws.

    Ruled by Vítor 2026-08-09, immediately after a per-unit mass balance
    closed at 58.8 % and the run finished without a word: a failure of MASS,
    of ELEMENTS or of ENERGY must be shown to the user IN RED, every time.

    Why one home rather than three announcements: the three reports had
    drifted into three different behaviours for the same class of event --
    mass warned on stderr, energy whispered to stdout and only when the unit
    happened to declare an energy item, and the element balance said nothing
    at all.  A reader cannot learn a convention that does not exist, and a
    project whose curriculum IS conservation cannot have its three
    conservation laws fail in three different registers.

    THE COLOUR IS TTY-GUARDED.  Escape codes must never reach a log file, a
    golden, a CSV or a pipe: `bin/runCase` tees stdout to log.<application>,
    `runTests` parses it, and the GUI reads the result JSON.  So the codes
    are emitted only when stderr is a terminal, and `NO_COLOR` (the de-facto
    standard) suppresses them regardless.  The TEXT is identical either way
    -- colour is emphasis, never information, and a reader piping to a file
    loses nothing but the red.

    The alarm ALSO rides AdvisoryLog, so it is replayed in the end-of-run
    caveat block and travels in the result JSON: a user who scrolled past
    the line still meets it, which is the durable-caveat-surface contract
    (core/AdvisorySummary.H).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Advisory.H"

#include <cstdlib>
#include <iostream>
#include <string>

#if defined(__unix__) || defined(__APPLE__)
#include <unistd.h>
#endif

namespace Choupo {
namespace reporting {

//  Colour only into a terminal, and never when NO_COLOR is set.
inline bool alarmColour()
{
    if (std::getenv("NO_COLOR")) return false;
#if defined(__unix__) || defined(__APPLE__)
    return ::isatty(2) == 1;                 // 2 = stderr, where alarms go
#else
    return false;
#endif
}

//  THE alarm.  `law` is the conservation law that failed (MASS / ELEMENTS /
//  ENERGY), `locus` what failed (a unit, or the plant boundary), `detail`
//  the numbers that make the claim checkable, and `remedy` where to look.
//  Everything goes to stderr (never stdout: stdout carries the result JSON
//  and the parsed KPI stream) and into the durable advisory surface.
inline void balanceAlarm(const std::string& law,
                         const std::string& locus,
                         const std::string& detail,
                         const std::string& remedy = "")
{
    const bool c = alarmColour();
    const std::string red  = c ? "\033[1;31m" : "";
    const std::string off  = c ? "\033[0m"    : "";

    std::cerr << "\n" << red
              << "  ==================================================\n"
              << "   " << law << " BALANCE FAILED -- " << locus << "\n"
              << "  ==================================================\n"
              << off
              << "   " << detail << "\n";
    if (!remedy.empty())
        std::cerr << "   " << remedy << "\n";
    std::cerr << std::endl;

    AdvisoryLog::instance().add(
        "balance", "warning", law + " balance, " + locus,
        detail + (remedy.empty() ? "" : "  " + remedy));
}

//  The numerical bands.  These are TOLERANCES ON ARITHMETIC (stream-file
//  rounding, recycle convergence), never a licence for a physical
//  discrepancy: flash19's per-unit mass error was 0.09 % wide and was the
//  SAME defect that made crystalliser01 lose two tonnes an hour of sugar.
//  A gate (check_mass_closure) pins the surfaces against each other so a
//  defect cannot hide under a band.
inline constexpr scalar massBandPct    = 0.1;
inline constexpr scalar elementBandPct = 0.1;
inline constexpr scalar energyBandPct  = 0.5;

} // namespace reporting
} // namespace Choupo
