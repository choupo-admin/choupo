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
    Choupo::PackingRecord, Choupo::PackingRegistry, Choupo::packingRecord

Description
    A PACKING IS AN ASSET RECORD (DEV.md 4c C329, "where a packing's data
    live"; C398 slice (e); Theory Guide sec:packing-record).

    A column's `packing {}` block may name a record of the flat assets home,
    `kind packing;`, instead of typing the geometry inline:

        packing
        {
            record    MontzA3-500M;      // constant/assets/ or the catalogue
            model     RochaBravoFair;
            diameter  1.22 m;            // the column the case describes
            height    2.2 m;
            installed { specificArea 478; source "..."; }        // optional
            borrowed  { corrugationSide { from SulzerBX; reason "..."; } }
        }

    WHAT LIVES WHERE.  The RECORD carries the manufacturer's NOMINAL geometry
    (specific area, void fraction, corrugation angle, side, base, height,
    element height, hole fraction, the surface) and, under `correlations {
    <model> { ... } }`, a constant that belongs to THIS packing under ONE
    correlation (Rocha-Bravo-Fair's surface-enhancement factor F_SE of a
    sheet-metal packing), each with its source.  The CASE carries what
    belongs to the column it describes: diameter, bed height, the
    correlation chosen, and -- only under the explicit `installed {}` block,
    with its `source` -- a value measured on the installed bed, which then
    REPLACES the nominal one and is printed as doing so.  A value taken from
    ANOTHER packing is a hypothesis of the case, never of the record:
    `borrowed { <field> { from <record>; reason "..."; } }`.

    A geometry key typed directly beside `record` is REFUSED (it would be a
    silent override of the record); so is a field the chosen correlation
    reads and neither the record, `installed` nor `borrowed` supplies -- the
    refusal names the field and the correlation (C329: "the engine names the
    field a correlation lacks").  The two shipped correlations do not read
    the same geometry: Rocha-Bravo-Fair needs the corrugation side and the
    surface (and F_SE for sheet metal); Delft needs the corrugation base and
    height, the element height and the hole fraction.

    HOW THE COLUMN READS IT.  `resolveUnit` returns a COPY of the unit's
    dictionary whose `packing {}` holds exactly the keys the inline form
    holds, so the two packed solvers (the transfer-unit bed in
    DistillationColumn.cpp, the rate-based segments in RateBasedSegment.cpp)
    read a record-backed bed through the same lookups as an inline one, and
    the numbers are the same doubles.  The old inline form (no `record`) is
    untouched: `resolveUnit` returns nullptr and the column reads the case's
    own dictionary as before.

    The record kind serves a RANDOM packing too (`arrangement random;`), the
    shape being the same (nominal geometry + per-correlation constants); no
    random-packing correlation is implemented, so a column refuses one by
    name.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo
{

class PackingRecord
{
public:
    //  One provenance entry of a record value (the `provenance { <field> {
    //  origin ...; } }` block).  An estimate carries its review status and
    //  the note saying how to verify it; the reader refuses one without.
    struct Provenance
    {
        std::string origin;          // literature | estimated
        std::string method;
        std::string notes;
        std::string reviewStatus;
    };

    void read(const DictPtr& d, const std::string& sourcePath);

    const std::string& name()        const { return name_; }
    const std::string& sourcePath()  const { return sourcePath_; }
    const std::string& arrangement() const { return arrangement_; }
    const std::string& surface()     const { return surface_; }

    //  A nominal geometry value, if the record states it.
    bool   has(const std::string& field) const { return geometry_.count(field) > 0; }
    scalar value(const std::string& field) const { return geometry_.at(field); }

    //  A constant of THIS packing under correlation `model`, if stated.
    bool   hasConstant(const std::string& model, const std::string& key) const;
    scalar constant(const std::string& model, const std::string& key) const;

    //  The record's provenance entry for a field, or nullptr.
    const Provenance* provenanceOf(const std::string& field) const;

    //  Where the record was read from, for a printed line: the file name and
    //  its tier ("catalogue" for data/standards/assets/, "case" otherwise).
    std::string where() const;

private:
    std::string name_, sourcePath_, arrangement_, surface_;
    std::map<std::string, scalar> geometry_;
    std::map<std::string, std::map<std::string, scalar>> constants_;
    std::map<std::string, Provenance> provenance_;
};


class PackingRegistry
{
public:
    //  Scan `<dataRoot>/standards/assets` then every case-local
    //  `constant/assets` OVER it (the CatalystRegistry posture), keeping the
    //  `kind packing;` records.  An empty dataRoot (a sealed case run with the
    //  catalogue hidden) scans the case-local tier alone.  Called once, by
    //  packingRecord::resolveUnit, the first time a column names a record,
    //  with Database::currentRoot(): a run that names none scans nothing.
    static void loadFrom(const std::string& dataRoot);

    //  The record by name; throws naming what IS loaded.
    static const PackingRecord& byName(const std::string& name,
                                       const std::string& locus);
};


namespace packingRecord
{

//  The geometry fields a record may state, in the order they are printed.
const std::vector<std::string>& geometryFields();

//  When the unit's `operation.packing` names a `record`, a COPY of the unit
//  dictionary whose packing block is the resolved inline form (see the class
//  description), the resolution printed to stdout; nullptr otherwise.
DictPtr resolveUnit(const DictPtr& unitDict, int verbosity);

//  After a solve on the copy: mark as read, in `to`, every key the solve
//  read in `from` that `to` also carries, recursively through the
//  sub-dictionaries, so the unread-key audit of the case's own `operation
//  {}` judges what the solver consulted.  Keys only the copy holds (the
//  record's values) are skipped.
void transferReads(const Dictionary& from, const Dictionary& to);

} // namespace packingRecord

} // namespace Choupo
