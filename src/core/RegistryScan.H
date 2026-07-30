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
    Choupo::records::ScanGuard

Description
    Every catalogue registry (materials, membranes, adsorbents, Henry pairs,
    solution pairs, utilities) is filled by walking a directory and keying
    each record by a name read from INSIDE the file.  The file's identity is
    its PATH; the registry's key is its CONTENT -- so nothing stops two files
    in one directory from claiming the same key, and `registry()[key] = rec`
    then keeps whichever `fs::directory_iterator` happened to visit last.
    Directory order is not sorted and not portable: the same case would give
    different numbers on two machines, silently.  That is the one failure a
    simulator may never have.

    ScanGuard makes the collision a refusal instead:

      * TWO FILES, ONE SCAN, SAME KEY -> throw, naming both paths.  There is
        no defensible answer, so there is no answer.
      * THE SAME KEY IN A LATER SCAN, FROM A DIFFERENT FILE -> the deliberate
        tier override (a case's mirrored constant/ record replacing the
        catalogue's).  Announced once, never silent -- the same posture
        Database.cpp already takes for a case-local component.
      * THE SAME KEY FROM THE SAME FILE -> silent.  Some registries are
        loaded more than once per run (AdsorbentRegistry, from each adsorbing
        unit); re-reading the same path is not an override.

    One guard per scan; construct it inside the scan lambda, not outside.
\*---------------------------------------------------------------------------*/

#pragma once

#include <map>
#include <string>

namespace Choupo {
namespace records {

class ScanGuard
{
public:
    // `what` names the registry in both messages (e.g. "MaterialRegistry"),
    // `noun` names one record for the prose (e.g. "material", "Henry pair").
    ScanGuard(std::string what, std::string noun);

    // Claim `key` for `file`.  Call it immediately BEFORE the insert.
    void claim(const std::string& key, const std::string& file);

private:
    std::string what_;
    std::string noun_;
    std::map<std::string, std::string> seen_;   // key -> file, THIS scan
};

} // namespace records
} // namespace Choupo
