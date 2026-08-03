/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    |
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
    Choupo::canonical

Description
    The CANONICAL serialization of a parsed Dictionary -- the surface the
    computationalSeal hashes (sealing-schema migration, ratified
    2026-08-03).

    The exclusion of non-computational content is BY TYPED FIELDS, never
    by comment-stripping: the serializer walks the PARSED tree (the same
    one every reader in the engine consumes), so comments, whitespace,
    key alignment and unit spellings never reach it by construction --
    what remains is exactly what the runtime can observe:

      * keys, in DECLARATION order (order is kept: dict-lists are
        ordered by meaning, and claiming reorderings "cosmetic" would
        assert more than the readers guarantee);
      * scalar values in canonical SI (the parser's conversion -- so
        `P 1 bar;` and `P 1e5 Pa;` serialize identically), printed
        round-trip ("%.17g");
      * DECLARED dimensions where present (a record that changes its
        declared dimensions changes what dimension-checked lookups
        accept -- that is behaviour, not cosmetics; deliberately
        CONSERVATIVE corollary: dropping or adding a unit spelling
        (`1 bar` <-> raw `100000`) changes the declared-dims field and
        is NOT claimed cosmetic, because the refusal surface moved);
      * words/strings, lists, sub-dicts (recursive), and unresolved
        $var references by name.

    `canonicalDump` is deliberately a PUBLIC, printable surface
    (choupoProps --canonical-dump): the student can see exactly what the
    seal claims, byte for byte.

\*---------------------------------------------------------------------------*/

#pragma once

#include <string>

namespace Choupo {

class Dictionary;

namespace canonical {

//  The canonical text of a parsed dictionary tree (see the header above
//  for what enters and why).
std::string dump(const Dictionary& d);

//  Parse `path` and return the SHA-256 hex digest of its canonical text.
//  Throws (with the parser's own message) on a file that does not parse.
std::string sha256OfFile(const std::string& path);

} // namespace canonical
} // namespace Choupo
