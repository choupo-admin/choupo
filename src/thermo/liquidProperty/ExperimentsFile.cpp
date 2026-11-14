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
\*---------------------------------------------------------------------------*/

#include "ExperimentsFile.H"

#include "thermo/RecordResolver.H"

#include <cstdio>
#include <stdexcept>

namespace Choupo {
namespace experiments {

scalar Column::toSI(scalar v) const
{
    return spec.affine ? units::affineToK(v, unit) : v * spec.factor;
}

std::string Column::declared() const
{
    if (!spec.affine) return name + " [" + unit + "]";
    const bool celsius = unit == "degC" || unit == "C" || unit == "Celsius";
    return name + " [" + unit + (celsius ? ", +273.15 K at read]" : ", converted to K at read]");
}

Column readColumn(const DictPtr& col, const ColumnRole& role, const std::string& where)
{
    Column c;
    c.name = col->lookupWordOrDefault("name", "");
    c.unit = col->lookupWordOrDefault("unit", "");
    if (c.name.empty())
        throw std::runtime_error(where + ": a column needs `name <symbol>;`.");
    if (c.unit.empty())
        throw std::runtime_error(where + ": column `" + c.name + "` declares no unit -- every"
            " column of a table carries `unit <word>;` (C398 U2: no implicit SI in a table;"
            " `-` for a pure number).");
    const auto u = units::lookupUnit(c.unit);
    if (!u)
        throw std::runtime_error(where + ": column `" + c.name + "` in unit `" + c.unit
            + "`, which is not a unit this engine knows (src/core/Units.cpp holds the one list).");
    c.spec = *u;
    const bool okDims = u->dims == role.dims || (role.hasAlternative && u->dims == role.alternative);
    if (!okDims)
        throw std::runtime_error(where + ": column `" + c.name + "` must be " + role.what
            + " (" + role.dims.toPretty() + "), and `" + c.unit + "` is " + u->dims.toPretty() + ".");
    if (u->affine && !role.affineAllowed)
        throw std::runtime_error(where + ": column `" + c.name + "` in `" + c.unit + "`, an offset"
            " scale -- only a temperature column may be declared in one.");
    return c;
}

Table readTable(const DictPtr& d, const std::vector<ColumnRole>& roles, const std::string& where)
{
    if (!d->found("columns") || !d->hasDictList("columns"))
        throw std::runtime_error(where + ": `columns ( { name <symbol>; unit <word>; } ... );` is"
            " required.");
    const auto cols = d->lookupDictList("columns");
    if (cols.size() != roles.size())
        throw std::runtime_error(where + ": " + std::to_string(cols.size()) + " columns declared, "
            + std::to_string(roles.size()) + " expected.");
    Table t;
    for (std::size_t c = 0; c < cols.size(); ++c)
        t.cols.push_back(readColumn(cols[c], roles[c], where));
    if (!d->found("data"))
        throw std::runtime_error(where + ": `data ( ... );` is required (flat, row after row).");
    const auto data = d->lookupList("data");
    const std::size_t nc = cols.size();
    if (data.empty() || data.size() % nc != 0)
        throw std::runtime_error(where + ": `data` holds " + std::to_string(data.size())
            + " values, not a whole number of rows of " + std::to_string(nc) + " columns.");
    t.si.assign(nc, {});
    t.raw.assign(nc, {});
    for (std::size_t k = 0; k < data.size(); ++k)
    {
        const std::size_t c = k % nc;
        t.raw[c].push_back(data[k]);
        t.si[c].push_back(t.cols[c].toSI(data[k]));
    }
    return t;
}

File readFile(const std::string& name, const std::string& expectProperty, const std::string& citedBy)
{
    File f;
    const std::string sub = "experiments/" + name + ".dat";
    f.where = "constant/" + sub;
    const auto p = records::localRecord(sub);
    if (p.empty())
        throw std::runtime_error(citedBy + ": no file " + f.where + " in this case.  A table the"
            " case cites is the case's own data, in its constant/experiments/.");
    f.path = p.string();
    f.dict = Dictionary::fromFile(f.path);
    const DictPtr& d = f.dict;
    if (!d->found("provenance"))
        throw std::runtime_error(f.where + ": `provenance { origin ...; citation \"...\"; }` is"
            " required -- a table without a source is refused.");
    const DictPtr pv = d->subDict("provenance");
    f.origin   = pv->lookupWordOrDefault("origin", "");
    f.citation = pv->lookupWordOrDefault("citation", "");
    f.via      = pv->lookupWordOrDefault("via", "");
    if (f.citation.empty())
        throw std::runtime_error(f.where + ": `provenance` names no `citation` -- the primary source"
            " of the values is required (an aggregator, if any, goes in `via`).");
    if (!d->found("property"))
        throw std::runtime_error(f.where + ": `property <name>;` is required.");
    f.property = d->lookupWord("property");
    if (!expectProperty.empty() && f.property != expectProperty)
        throw std::runtime_error(f.where + ": `property " + f.property + "`, but " + citedBy
            + " cites it as " + expectProperty + " -- the file and the entry that cites it must"
            " name one property.");
    if (d->found("system")) f.system = d->lookupWordList("system");
    if (d->found("uncertainty"))
    {
        const auto& v = d->entryValue("uncertainty");
        if (std::holds_alternative<std::string>(v)) f.uncertainty = std::get<std::string>(v);
        else
        {
            const std::string w = d->unitWordOf("uncertainty");
            const scalar si = d->lookupScalar("uncertainty");
            char b[48];
            std::snprintf(b, sizeof b, "%g", w.empty() ? si : units::fromSI(si, w));
            f.uncertainty = std::string(b) + (w.empty() ? "" : " " + w);
        }
    }
    return f;
}

} // namespace experiments
} // namespace Choupo
