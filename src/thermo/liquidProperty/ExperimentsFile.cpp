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

#include <algorithm>
#include <cstdio>
#include <filesystem>
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
    if (!role.allowedUnits.empty()
        && std::find(role.allowedUnits.begin(), role.allowedUnits.end(), c.unit) == role.allowedUnits.end())
    {
        std::string list;
        for (const auto& w : role.allowedUnits) list += (list.empty() ? "" : ", ") + w;
        throw std::runtime_error(where + ": column `" + c.name + "` in `" + c.unit + "` -- " + role.what
            + " is read here in " + list + ".");
    }
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

namespace {

std::string experimentsPathOf(const std::string& constantDir)
{
    namespace fs = std::filesystem;
    std::error_code ec;
    const fs::path abs = fs::weakly_canonical(fs::path(constantDir) / "experiments", ec);
    const fs::path cwd = fs::current_path(ec);
    const fs::path rel = fs::relative(abs, cwd, ec);
    if (!ec && !rel.empty() && rel.string().rfind("..", 0) != 0) return rel.string();
    return abs.string();
}

void stampWalk(const DictPtr& d, const std::string& dir, const std::string& parentKey,
               const std::string& grandKey)
{
    refuseWrittenExperimentsDir(d, parentKey.empty() ? std::string("a property dictionary")
                                                     : "the entry under `" + parentKey + "`");
    for (const auto& k : d->keys())
    {
        const auto& v = d->entryValue(k);
        if (std::holds_alternative<std::vector<DictPtr>>(v))
        {
            for (const auto& e : std::get<std::vector<DictPtr>>(v))
            {
                if (k == "pin" && e->found("table") && !e->found(experimentsDirKey()))
                    e->insert(experimentsDirKey(), EntryValue(dir));
                //  a liquid-diffusivity entry citing a file (C398 slice (d))
                if (k == "entries" && e->found("experiments") && !e->found(experimentsDirKey()))
                    e->insert(experimentsDirKey(), EntryValue(dir));
                stampWalk(e, dir, k, parentKey);
            }
        }
        else if (std::holds_alternative<DictPtr>(v))
        {
            const DictPtr sub = std::get<DictPtr>(v);
            //  volumetric { liquid { measured { <name> { ... } } } }, and the
            //  stated mixture viscosity transport { liquid { viscosity {
            //  measured { <name> { ... } } } } } (C398 slice (d))
            if (parentKey == "measured" && (grandKey == "liquid" || grandKey == "viscosity")
                && !sub->found(experimentsDirKey()))
                sub->insert(experimentsDirKey(), EntryValue(dir));
            stampWalk(sub, dir, k, parentKey);
        }
    }
}

} // namespace

void refuseWrittenExperimentsDir(const DictPtr& entry, const std::string& where)
{
    if (entry && entry->found(writtenExperimentsDirWord()))
        throw std::runtime_error(where + ": `experimentsDir` is not a word a dictionary writes"
            " (C398 review row TG-17).  The file of a table pin or of a measurement is read from"
            " the experiments/ folder of the constant/ that declares it -- the case's, a sector's,"
            " or a unit's own -- and Choupo records that folder itself; delete the line and put"
            " the file in that experiments/ folder.");
}

void stampExperimentsDir(const DictPtr& d, const std::string& constantDir)
{
    if (d) stampWalk(d, experimentsPathOf(constantDir), "", "");
}

File readFile(const std::string& name, const std::string& expectProperty, const std::string& citedBy,
              const std::string& experimentsDir)
{
    File f;
    const std::string dir = experimentsDir.empty() ? std::string("constant/experiments") : experimentsDir;
    f.where = dir + "/" + name + ".dat";
    if (!std::filesystem::exists(f.where))
        throw std::runtime_error(citedBy + ": no file " + f.where + ".  A table the case cites is"
            " the case's own data, in the experiments/ folder of the constant/ that declares the"
            " entry citing it (never found by walking up to another constant/).");
    f.path = f.where;
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
