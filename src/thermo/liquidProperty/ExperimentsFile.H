/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
-------------------------------------------------------------------------------
Namespace
    Choupo::experiments

Description
    THE ONE READER OF A TABLE'S COLUMNS AND OF AN EXPERIMENTS FILE (DEV.md 4c
    C398, slice (c); third addendum U1-U2; second addendum V3).

    A column is `{ name <symbol>; unit <word>; }`.  Its unit is looked up in
    the ONE unit table, src/core/Units (U1: no reader keeps a private table of
    unit words), and its dimension is checked against the dimension the
    caller states for that column (U2: a column without a unit is refused --
    the commonest error in raw data is the scale, mPa s against Pa s).  A
    temperature column may be declared in degC or degF: the offset is applied
    at read, and the column says so in its `declared()` text.

    `data` is flat and row-major: one value per column, row after row (the
    experiments grammar the density pilot reads, extended to many rows).

    The experiments FILE (`constant/experiments/<name>.dat`) carries
    `provenance` (a citation is required), `system`, `property`, `columns`,
    `data` and, optionally, `uncertainty`.  Each consumer adds the meaning of
    its own keys on top: the density pilot's one point with its `box`
    (Measured.cpp); a pure-component TABLE law of a case pin
    (RecordLaws/PropertyTable); a mixture measurement (slice (d)).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Dimensions.H"
#include "core/Types.H"
#include "core/Units.H"

#include <string>
#include <vector>

namespace Choupo {
namespace experiments {

//- One declared column: its name, the unit word as written and the unit's
//  entry in the one table.
struct Column
{
    std::string      name;
    std::string      unit;
    units::UnitSpec  spec;

    //- A value of this column in SI (an affine temperature is shifted).
    scalar toSI(scalar v) const;
    //- "T [degC, +273.15 K at read]", "mu [uPa.s]".
    std::string declared() const;
};

//- What a caller accepts for one column: the dimensions, and whether an
//  affine (offset) temperature unit is allowed.  `alternative` is a second
//  admissible dimension (a molar heat capacity may be declared per mass and
//  converted by the caller), unchecked when equal to `dims`.
struct ColumnRole
{
    Dimensions  dims;
    std::string what;               // "a temperature", "a liquid viscosity"
    bool        affineAllowed = false;
    Dimensions  alternative;
    bool        hasAlternative = false;
};

//- Read one `{ name; unit; }` entry; `role` checks its dimension.  Throws,
//  naming `where`, on a missing name or unit, an unknown unit, an affine unit
//  where the role refuses one, or a dimension the role does not accept.
Column readColumn(const DictPtr& col, const ColumnRole& role, const std::string& where);

//- The columns and the data of a table: `columns ( {..} {..} ... );` and the
//  flat `data ( ... );`.  `si[c]` is column c's values in SI, `raw[c]` as
//  written.  Throws when the data are not a whole number of rows.
struct Table
{
    std::vector<Column>              cols;
    std::vector<std::vector<scalar>> si;
    std::vector<std::vector<scalar>> raw;
    std::size_t rows() const { return si.empty() ? 0 : si.front().size(); }
};
Table readTable(const DictPtr& d, const std::vector<ColumnRole>& roles,
                const std::string& where);

//- An experiments file, read generically.  `property` is checked against
//  `expectProperty` when that is not empty.
struct File
{
    DictPtr                  dict;
    std::string              path;        // on disk
    std::string              where;       // "constant/experiments/<name>.dat"
    std::string              origin;      // provenance.origin ("" when not written)
    std::string              citation;    // provenance.citation (required)
    std::string              via;         // provenance.via (the route; may be empty)
    std::vector<std::string> system;
    std::string              property;
    std::string              uncertainty; // as written, "" when absent
};

//- Read `constant/experiments/<name>.dat` of the case being run (the case's
//  own data: never a catalogue file).  Refuses a missing file, a missing
//  `provenance.citation`, and a `property` other than `expectProperty`.
File readFile(const std::string& name, const std::string& expectProperty,
              const std::string& citedBy);

} // namespace experiments
} // namespace Choupo
