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
Namespace
    Choupo::sha256

Description
    SHA-256 (FIPS 180-4), the whole of it, in about eighty lines.

    It is here for ONE job: the property manifest records a sha256 per
    imported record and the RUNTIME never checked it, so a sealed case whose
    mirrored record had been edited ran happily and gave a different answer
    while the manifest still claimed the catalogue's provenance.  Verifying
    that claim needs the same digest the importer wrote, and no other.

    Hand-rolled, like the Newton and the Gauss and the RK4 -- the algorithm is
    published, short, and testable against the standard vectors, which is
    exactly the bar this project sets for pulling in a dependency instead.
    Not a general-purpose crypto library: no streaming API, no HMAC, and it
    must not become one.  A file digest at a validation boundary, never the
    hot path.
\*---------------------------------------------------------------------------*/

#pragma once

#include <string>

namespace Choupo {
namespace sha256 {

//- Lowercase hex digest of a byte string.
std::string hex(const std::string& data);

//- Lowercase hex digest of a file's bytes; empty string when unreadable
//  (the caller decides what an unreadable record means -- this does not).
std::string hexFile(const std::string& path);

//- The FIPS 180-4 sample vectors, so a build that miscompiles this can say
//  so instead of quietly disagreeing with the importer.  True = correct.
bool selfTest();

} // namespace sha256
} // namespace Choupo
