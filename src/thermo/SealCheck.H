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
    Choupo::records::verifySeal

Description
    The property manifest's own header says: "a claimed file it verifies by
    sha256".  The IMPORTER verified it, and the offline gate verifies it -- the
    RUNTIME never did.  So a sealed case whose mirrored record had been edited
    ran to exit 0 and gave a different answer while its manifest still claimed
    the catalogue's provenance:

        flash16, logK25 -10.329 -> -9.000 in constant/chemistry/CO3-formation.dat
        pH 6.02023176857 -> 6.01976432671, nothing said

    That is not the edit being wrong.  A case is the author's, and editing a
    mirrored record to see what moves is exactly what a glass-box simulator is
    for.  What is wrong is the manifest going on CLAIMING `type imported;
    sha256 ...; release Choupo-2607;` about a file that is no longer that
    record -- provenance the case no longer has.

    So this ANNOUNCES, it does not refuse: the run continues, and the run
    SAYS which records diverged and that the case no longer reproduces its
    release.  Whether it should escalate to a refusal is Vítor's call, not a
    default anyone should inherit from a helper.

    Records claimed `adopted` are the author's by definition and never hashed
    (the manifest says so itself).  Absent files are reported too -- a claimed
    record that is gone is a stronger break than one that changed.
\*---------------------------------------------------------------------------*/

#pragma once

namespace Choupo {
namespace records {

//- Hash every record the nearest manifest claims as imported/merged and
//  announce the ones that differ.  Runs at most ONCE per process (a case
//  is sealed once; re-checking per lookup would put a digest on the hot
//  path).  Returns the number of divergences found.
int verifySeal(int verbosity);

} // namespace records
} // namespace Choupo
