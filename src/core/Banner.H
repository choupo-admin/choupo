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

namespace Choupo {

// Bumped per commit -- the version string is the commit-message tag.
// Update this line as part of the same commit that bumps the version
// in the message, so the banner always prints what is actually HEAD.
// The 4 main.cpp banners pick the new version up automatically through
// printBanner().
inline constexpr const char* CHOUPO_VERSION = "Choupo-dev";

// Print the startup banner to stdout, with `suffix` placed right after the
// version (e.g. "  batch", "  ctrl", "  props"; empty for choupoSolve).  The
// suffix is padded with spaces to keep the box width consistent.
void printBanner(const char* suffix = "");

} // namespace Choupo
