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
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
Functions
    Choupo::records::{strictPins, pinsActive, verifyPinsStart, finalizePins,
                      isHeld, readsAlone, checkLocalShadow}

Description
    A case REFERENCES the catalogue (DEV.md 4c C413; design record
    docs/design/c413-cases-reference-the-catalogue.md).  Its manifest pins,
    per catalogue record the run reads, the COMPUTATIONAL hash of that record:

        propertyManifest
        {
            pins
            {
                "components/benzene.dat"  <64 hex>;
                "components/toluene.dat"  <64 hex>;
            }
        }

    A run checks the claim twice, because the two checks need different
    information:

      start   every pin is hashed against the catalogue file
              (changed / vanished), and every `held` copy against its own hash;
      end     the catalogue files the run actually PARSED (core/ReadLog.H) are
              compared with the pins: a record read and not pinned is `unpinned`.

    The result's seal block carries `pinned` (every pin holds, nothing unpinned
    was read) or `drifted` (with each record, tagged by class).  Default:
    ANNOUNCE, by name.  REFUSAL has two declarers and one mechanism: the case
    (`onDivergence refuse;`) and the caller (`CHOUPO_PINS=refuse`, which
    `runCase --strict` and bin/runTests set).

    A LOCAL record whose name resolves to a catalogue record must say what it
    is (`overlayOf`, `variationOf` or `distinctFrom`, each with a parsed
    `variationReason`), and the engine checks the claim against the identity
    fields both records carry: the formula with its charge, `charge`, `CAS`
    (checkLocalShadow, ONE home for the rule).

    `held { "<sub>" <hash>; }` is the TRANSITIONAL block of the migration: a
    copy kept in force, read alone, announced, verified against its own hash.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"

#include <filesystem>
#include <string>
#include <vector>

namespace Choupo {
namespace records {

//- Fix the catalogue root NOW (leaked): the consumption ledger resolves paths
//  from a static destructor, after Database's own static is gone.  Called by
//  verifySeal, which every binary runs once at start.
void primeCatalogueRoot();

//- THE pin hash, one implementation: the COMPUTATIONAL hash of a record file;
//  of a DIRECTORY (a pin whose key ends in "/"), the hash of the sorted lines
//  "<file>\t<computational hash>\n" of every *.dat directly in it.  A directory
//  scan (Henry pairs, assets, utilities, ...) reads every file of its directory
//  whether or not the case needs one, so it is pinned as a WHOLE by one line --
//  a catalogue edit or a NEW file in that directory moves exactly that pin.
//  (choupoProps --canonical-hash <path> prints it; "" when unreadable.)
std::string pinHash(const std::string& path);

//- The standards-relative name of a file under the installation catalogue
//  ("components/water.dat"), "" when the path is not under it.
std::string catalogueSubOf(const std::string& path);

//- Does the nearest manifest hold `pins`?
bool pinsActive();

//- CHOUPO_PINS=refuse in the environment, or `onDivergence refuse;` in the
//  nearest manifest.  A junk CHOUPO_PINS word refuses by name.
bool strictPins();

//- Start-of-run check (called by verifySeal when the manifest holds `pins`).
//  Sets the seal verdict; returns the number of drifted records.
int verifyPinsStart(const DictPtr& manifest, int verbosity);

//- End-of-run check, idempotent: the catalogue files the run parsed against the
//  pins.  Throws under strictPins() when anything drifted.  Call before the
//  result is emitted.
void finalizePins();

//- Is the standards-relative `sub` listed under the manifest's `held {}`?
bool isHeld(const std::string& sub);

//- A local record that must be read ALONE (never merged over the catalogue
//  base): it is held, or declares `variationOf` / `distinctFrom`.
bool readsAlone(const std::string& sub, const std::filesystem::path& local);

//- The ONE shadow rule: `local` wins over the catalogue record of the same
//  standards-relative `sub`.  No-op in a sealed case and when the catalogue has
//  no such record.  Throws (naming both records and the remedy) on a declaration
//  the identity fields contradict; announces an undeclared agreeing shadow.
void checkLocalShadow(const std::string& sub, const std::filesystem::path& local);

//- The keys a declaration adds to a record, for a loader to strip.
inline bool isShadowDeclarationKey(const std::string& k)
{
    return k == "overlayOf" || k == "variationOf" || k == "distinctFrom"
        || k == "variationReason";
}

} // namespace records
} // namespace Choupo
