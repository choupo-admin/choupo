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
File
    src/thermo/liquidProperty/ExperimentsFileAdapter.H

Description
    A MINIMAL LOCAL ADAPTER, TO BE REMOVED (DEV.md 4c C398, slice (d)).  The
    one generic reader of `constant/experiments/<name>.dat` is slice (c)'s
    `liquidProperty/ExperimentsFile.{H,cpp}`; slice (d) was built while (c)
    had not landed, so its two consumers -- the mixture liquid-viscosity
    measurement and a liquid-diffusivity entry -- are written against the
    fields that reader publishes (provenance with a REQUIRED citation,
    `system`, `property`, `columns` with a unit each, read through
    src/core/Units with the dimension of the column's role, row-major
    `data`, optional `uncertainty`, a degC column converted at read and said
    once), and read them through this adapter.  When (c) lands, the two
    consumers call (c)'s reader and this file is deleted; nothing else in
    the tree includes it.

    WHAT IT DOES NOT DO: interpret the file.  Which columns a consumer needs,
    how many rows it accepts, and the keys of its own (`solvent`, `solute`,
    `kind`, `box`) are the consumer's, read from `dict`.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Dimensions.H"
#include "core/Types.H"

#include <functional>
#include <string>
#include <vector>

namespace Choupo {
namespace liquidProperty {
namespace experimentsAdapter {

struct Column
{
    std::string name;
    std::string unit;          // as written
    Dimensions  dims;          // of the column's role
};

struct File
{
    std::string                      name;        // <name> of constant/experiments/<name>.dat
    std::string                      path;        // absolute
    std::string                      where;       // "constant/experiments/<name>.dat"
    std::string                      citation;    // provenance.citation (required)
    std::string                      property;
    std::vector<std::string>         system;
    std::vector<Column>              columns;
    std::vector<std::vector<scalar>> rows;        // SI, one vector per data row
    bool                             hasUncertainty = false;
    DictPtr                          dict;        // the consumer reads its own keys here
};

//  Read constant/experiments/<name>.dat, nearest up the case's folders.
//  `dimsOf(column)` returns the dimension of a column's role and throws for
//  a column the consumer does not read.  Refused by name: no file, no
//  `provenance { citation }`, a column without a unit, a unit the engine
//  does not know or of another dimension, data that are not whole rows.
File read(const std::string& name, const std::string& who,
          const std::function<Dimensions(const std::string&)>& dimsOf);

//  The value of `column` in row `r`; throws naming the file when absent.
scalar valueOf(const File& f, std::size_t r, const std::string& column);
bool   hasColumn(const File& f, const std::string& column);

} // namespace experimentsAdapter
} // namespace liquidProperty
} // namespace Choupo
