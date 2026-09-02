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
    src/core/Banner.H

Description
    Shared startup banner for the four binaries.  Centralises the version
    string in ONE place (CHOUPO_VERSION) instead of duplicating it across
    every application's main.cpp -- so a release bump is a single edit, and
    a banner-style tweak ripples to every binary at once.

    Each main.cpp calls printBanner() with its own short suffix (an empty
    string for choupoSolve, "  batch" / "  ctrl" / "  props" for the
    others); the function pads the row to the standard 77-column box width.
\*---------------------------------------------------------------------------*/

#pragma once

#include <string>

namespace Choupo {

// Bumped per commit -- the version string is the commit-message tag.
// Update this line as part of the same commit that bumps the version
// in the message, so the banner always prints what is actually HEAD.
// The 4 main.cpp banners pick the new version up automatically through
// printBanner().
inline constexpr const char* CHOUPO_VERSION = "Choupo-2608";

// Print the startup banner to stdout, with `suffix` placed right after the
// version (e.g. "  batch", "  ctrl", "  props"; empty for choupoSolve).  The
// suffix is padded with spaces to keep the box width consistent.
void printBanner(const char* suffix = "");

//  THE TWO FLAGS EVERY BINARY OWES ITS CALLER, and the refusal that goes
//  with them (2026-08-26).
//
//  `./choupoSolve --version` used to print the banner -- because the banner
//  always prints -- and then die with
//
//      ERROR: Case directory does not exist: --version
//
//  A half-answer followed by a confusing error, on the first thing anybody
//  types at a binary they have just built.
//
//  Underneath it sat the worse defect.  choupoSolve's parser ended in a
//  catch-all, `else caseDir = arg;`, so ANY unrecognised argument became a
//  directory name.  A mistyped flag was therefore SILENTLY DROPPED: run
//  `choupoSolve --lnt myCase` and the lint you asked for does not happen,
//  the solve runs instead, and the exit code is 0.  That is the no-silent-
//  crutch rule broken at the front door -- a flag the user asked for that
//  did not happen, with nothing said.
//
//  So: ONE home, and the refusal is part of it.  `handleStandardFlags`
//  returns true when the caller should exit 0 (it has printed what was
//  asked for); `refuseUnknownOption` throws, by name, with the usage text.
//  A positional argument is still a case directory -- only an argument
//  beginning with `-` is a flag, and an unrecognised flag is an error
//  rather than a filename.
//
//  `usage` is the binary's own one-screen help text, passed in rather than
//  stored here: this header knows the version, not what each binary does.
bool handleStandardFlags(int argc, char** argv, const char* usage);

//  Throws a runtime_error naming the offending option and quoting `usage`.
[[noreturn]] void refuseUnknownOption(const std::string& arg,
                                      const char* usage);

} // namespace Choupo
