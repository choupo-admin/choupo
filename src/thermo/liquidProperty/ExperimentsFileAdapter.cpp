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
Description
    The local adapter of slice (d); see ExperimentsFileAdapter.H (removed
    when slice (c)'s ExperimentsFile reader lands).
\*---------------------------------------------------------------------------*/

#include "ExperimentsFileAdapter.H"

#include "core/Units.H"
#include "thermo/RecordResolver.H"

#include <functional>
#include <iostream>
#include <set>
#include <stdexcept>

namespace Choupo {
namespace liquidProperty {
namespace experimentsAdapter {

File read(const std::string& name, const std::string& who,
          const std::function<Dimensions(const std::string&)>& dimsOf)
{
    File f;
    f.name  = name;
    f.where = "constant/experiments/" + name + ".dat";
    const auto p = records::localRecord("experiments/" + name + ".dat");
    if (p.empty())
        throw std::runtime_error(who + ": no file " + f.where + " in this case.  A"
            " measurement the case cites is the case's own data.");
    f.path = p.string();
    f.dict = Dictionary::fromFile(f.path);
    const DictPtr& d = f.dict;

    if (!d->found("provenance") || !d->subDict("provenance")->found("citation"))
        throw std::runtime_error(f.where + ": no `provenance { citation \"...\"; }` --"
            " a datum without its source is not a datum.");
    f.citation = d->subDict("provenance")->lookupWord("citation");
    f.property = d->lookupWord("property");
    if (d->found("system")) f.system = d->lookupWordList("system");
    f.hasUncertainty = d->found("uncertainty");

    const auto cols = d->lookupDictList("columns");
    if (cols.empty())
        throw std::runtime_error(f.where + ": no `columns ( { name ...; unit ...; } ... );`.");
    std::vector<scalar> factor;
    std::vector<bool>   affine;
    std::set<std::string> seen;
    for (const auto& c : cols)
    {
        Column col;
        col.name = c->lookupWord("name");
        if (!seen.insert(col.name).second)
            throw std::runtime_error(f.where + ": column `" + col.name + "` twice.");
        //  U2: a column without a unit is refused -- the commonest error in
        //  raw data is the scale (cm2/s against m2/s, a factor 1e4).
        if (!c->found("unit"))
            throw std::runtime_error(f.where + ": column `" + col.name + "` has no `unit`."
                "  A table column without a unit is refused (C398, THIRD ADDENDUM U2).");
        col.unit = c->lookupWord("unit");
        col.dims = dimsOf(col.name);                 // throws for a column not read
        const auto u = units::lookupUnit(col.unit);
        if (!u)
            throw std::runtime_error(f.where + ": column `" + col.name + "` in unit `"
                + col.unit + "`, which the engine does not know (src/core/Units.cpp).");
        if (!(u->dims == col.dims))
            throw std::runtime_error(f.where + ": column `" + col.name + "` in `" + col.unit
                + "` is a " + u->dims.toPretty() + "; this column is a "
                + col.dims.toPretty() + ".");
        factor.push_back(u->factor);
        affine.push_back(u->affine);
        if (u->affine)
            std::cout << "  [experiments] " << f.where << ": column `" << col.name
                      << "` in " << col.unit << ", converted to K at read\n";
        f.columns.push_back(col);
    }
    const auto data = d->lookupList("data");
    const std::size_t nc = f.columns.size();
    if (data.empty() || data.size() % nc != 0)
        throw std::runtime_error(f.where + ": `data` holds " + std::to_string(data.size())
            + " values for " + std::to_string(nc) + " columns -- data are whole rows,"
              " one value per column, row after row.");
    for (std::size_t r = 0; r < data.size() / nc; ++r)
    {
        std::vector<scalar> row(nc);
        for (std::size_t c = 0; c < nc; ++c)
        {
            const scalar v = data[r * nc + c];
            row[c] = affine[c] ? units::affineToK(v, f.columns[c].unit) : v * factor[c];
        }
        f.rows.push_back(row);
    }
    return f;
}

bool hasColumn(const File& f, const std::string& column)
{
    for (const auto& c : f.columns) if (c.name == column) return true;
    return false;
}

scalar valueOf(const File& f, std::size_t r, const std::string& column)
{
    for (std::size_t c = 0; c < f.columns.size(); ++c)
        if (f.columns[c].name == column) return f.rows.at(r).at(c);
    throw std::runtime_error(f.where + ": no column `" + column + "`.");
}

} // namespace experimentsAdapter
} // namespace liquidProperty
} // namespace Choupo
