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
    Choupo::membraneFit

Description
    A RECORD A PROPERTIES-MODE FIT WROTE, AND THE CHECK THAT IT IS STILL
    THE FIT OF ITS INPUTS (DEV.md 4c C152, one case in two modes).

    A case may carry `system/propsDict` (Properties & data mode, choupoProps)
    and `system/flowsheetDict` (Process mode, choupoSolve) over ONE shared
    `constant/`.  Information flows ONE way: a `fitParameters` operation
    with `residual { kind membrane; }` and `output { record ...; }` WRITES a
    membrane record into `constant/assets/`, and Process mode only READS it.

    The written record carries a `fit {}` block naming its inputs by their
    FINGERPRINTS -- the SHA-256 of the CANONICAL parse (core/DictCanonical)
    of every dataset, of the operation's own block in system/propsDict and
    of the base record its fixed values came from.  Canonical, so a comment
    or a re-aligned column does not make a fit stale; a moved number, a new
    row, a changed band or a changed free parameter does.

    `verifyFresh` is what a consumer runs before it uses such a record
    (MembraneRegistry::byName), and it REFUSES a stale one by name -- which
    input moved, the recorded and the current fingerprint, and the remedy
    (run the case in Properties mode, which re-fits and rewrites the
    record).  A stale fit used in silence is the defect this exists to make
    impossible: the stage would report a membrane fitted to data the case
    no longer contains.

    WHAT IS NOT FINGERPRINTED, said plainly: the thermophysical package
    (constant/thermoPhysPropDict, the species records whose ion radii and
    diffusivities the pore model reads) and the engine itself.  A changed
    ion radius moves the fit and is NOT caught here.

    ONE HOME for the fit-block fingerprint: the writer (FitParameters'
    membrane residual) and the verifier both call `fitBlockSha256`, which
    re-reads system/propsDict from disk, so the two cannot hash two
    different parses of one block.
\*---------------------------------------------------------------------------*/

#pragma once

#include "Membrane.H"

#include <string>

namespace Choupo {
namespace membraneFit {

//  The SHA-256 of the canonical text of operation `opName`'s entry in the
//  `operations ( ... )` list of `propsDictPath`.  Throws, naming `who`, when
//  the file cannot be read or holds no such operation.
std::string fitBlockSha256(const std::string& propsDictPath,
                           const std::string& opName,
                           const std::string& who);

//  The SHA-256 of the canonical parse of a record or dataset file
//  (canonical::sha256OfFile, wrapped so a missing file refuses naming `who`).
std::string fileSha256(const std::string& path, const std::string& who);

//  The SHA-256 of a record's canonical parse WITHOUT its `fit {}` block --
//  the values themselves, so a hand edit of a fitted number is caught as
//  surely as a moved dataset.  The writer hashes the body it is about to
//  write; the verifier hashes the file it reads with `fit` erased.
std::string recordValuesSha256(const DictPtr& record);

//  The case root of a record at <root>/constant/assets/<name>.dat.
std::string caseRootOf(const std::string& recordPath);

//  Check a fitted record against its inputs; refuse a stale one by name.
//  `baseRecordPath` is where the base record resolves now (the registry's
//  source path for `m.fit().baseRecord`, empty when it is not loaded).
//  Announces once per process which fit wrote the record.
void verifyFresh(const Membrane& m, const std::string& recordPath,
                 const std::string& baseRecordPath);

} // namespace membraneFit
} // namespace Choupo
