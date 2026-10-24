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

#include "postProcessing/postProcessDict/PostProcessDict.H"

#include "core/DictAudit.H"
#include "result/ResultEmitter.H"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <set>
#include <sstream>
#include <stdexcept>
#include <variant>

namespace Choupo {
namespace postProcessDict {

namespace fs = std::filesystem;

namespace {

const scalar NaN = std::numeric_limits<scalar>::quiet_NaN();

[[noreturn]] void refuse(const std::string& where, const std::string& what)
{
    throw std::runtime_error("system/postProcessDict, " + where + ": " + what);
}

std::string joined(const std::vector<std::string>& v, std::size_t cap = 40)
{
    std::string s;
    for (std::size_t i = 0; i < v.size() && i < cap; ++i)
        s += (i ? ", " : "") + v[i];
    if (v.size() > cap)
        s += ", ... (" + std::to_string(v.size() - cap) + " more)";
    return s.empty() ? std::string("(none)") : s;
}

bool isWord(const std::string& s)
{
    if (s.empty()) return false;
    for (const char c : s)
        if (!(std::isalnum(static_cast<unsigned char>(c)) || c == '_')) return false;
    return true;
}

//  A number written as text, or NaN when the cell is empty or not a number.
scalar parseNumber(const std::string& s)
{
    if (s.empty()) return NaN;
    char* end = nullptr;
    const double v = std::strtod(s.c_str(), &end);
    if (end == s.c_str()) return NaN;
    while (*end == ' ' || *end == '\t' || *end == '\r') ++end;
    return *end == '\0' ? static_cast<scalar>(v) : NaN;
}

//  12 significant figures, the machine channel's precision; empty for NaN.
std::string cell(scalar v)
{
    if (!std::isfinite(v)) return "";
    return jsonNumber(v);
}

std::string q(const std::string& s) { return jsonEscape(s); }

//  A selection value as written: a scalar or a word.
struct Match
{
    std::string column;
    bool numeric = false;
    scalar number = 0;
    std::string word;
    std::string text() const { return numeric ? jsonNumber(number) : word; }
};

std::vector<Match> readSelect(const DictPtr& d, const std::string& where)
{
    std::vector<Match> out;
    if (!d->found("select")) return out;
    const DictPtr s = d->subDict("select");
    for (const auto& k : s->keys())
    {
        s->found(k);
        Match m;
        m.column = k;
        const EntryValue& v = s->entryValue(k);
        if (const auto* x = std::get_if<scalar>(&v)) { m.numeric = true; m.number = *x; }
        else if (const auto* w = std::get_if<std::string>(&v)) m.word = *w;
        else refuse(where, "`select { " + k + " ...; }` must be a number or a word");
        out.push_back(m);
    }
    if (out.empty()) refuse(where, "`select {}` is empty -- name a column and the value to keep");
    return out;
}

bool matches(const Match& m, const std::string& cellText)
{
    if (m.numeric)
    {
        const scalar v = parseNumber(cellText);
        return std::isfinite(v)
            && std::abs(v - m.number) <= 1e-12 * std::max<scalar>(1.0, std::abs(m.number));
    }
    return cellText == m.word;
}

std::string selectText(const std::vector<Match>& sel)
{
    std::string s;
    for (const auto& m : sel) s += (s.empty() ? "" : ", ") + m.column + " = " + m.text();
    return s;
}

// ---------------------------------------------------------------- references
struct Reference
{
    std::string name, file, role, citation;
    std::vector<std::string> header;
    std::vector<std::vector<std::string>> cells;
    std::map<std::string, std::string> units;

    int column(const std::string& c) const
    {
        for (std::size_t i = 0; i < header.size(); ++i)
            if (header[i] == c) return static_cast<int>(i);
        return -1;
    }
};

std::vector<std::string> splitCsv(const std::string& line)
{
    std::vector<std::string> out;
    std::string cur;
    bool quoted = false;
    for (std::size_t i = 0; i < line.size(); ++i)
    {
        const char c = line[i];
        if (quoted)
        {
            if (c == '"' && i + 1 < line.size() && line[i + 1] == '"') { cur += '"'; ++i; }
            else if (c == '"') quoted = false;
            else cur += c;
        }
        else if (c == '"') quoted = true;
        else if (c == ',') { out.push_back(cur); cur.clear(); }
        else if (c != '\r') cur += c;
    }
    out.push_back(cur);
    return out;
}

Reference readReference(const DictPtr& d, std::size_t k)
{
    Reference r;
    const std::string at = "references[" + std::to_string(k) + "]";
    if (!d->found("name")) refuse(at, "declare `name <word>;`");
    r.name = d->lookupWord("name");
    const std::string where = "reference '" + r.name + "'";
    if (!isWord(r.name)) refuse(where, "a name is a word (letters, digits, _)");
    if (!d->found("file")) refuse(where, "declare `file \"constant/...\";`");
    r.file = d->lookupWord("file");
    //  CASE-LOCAL, UNDER constant/: reference data is what the case carries
    //  WITH it (the measurement, the other program's numbers), never a
    //  path into another case or the installation.
    if (r.file.rfind("constant/", 0) != 0 || r.file.find("..") != std::string::npos)
        refuse(where, "`file " + r.file + ";` -- a reference lives under the case's"
               " constant/ (e.g. constant/reference/<name>.csv), so the case carries"
               " its own evidence");
    r.role = d->lookupWordOrDefault("role", "reference");
    if (r.role != "reference" && r.role != "experiment")
        refuse(where, "`role " + r.role + ";` -- Accepted: reference (another"
               " program, a published table), experiment (a measurement)");
    if (!d->found("citation"))
        refuse(where, "declare `citation \"...\";` -- a number with no source is not"
               " a reference");
    r.citation = d->lookupWord("citation");
    std::ifstream in(r.file);
    if (!in) refuse(where, "cannot read '" + r.file + "'");
    std::string line;
    while (std::getline(in, line))
    {
        if (line.empty() || line[0] == '#') continue;
        auto f = splitCsv(line);
        if (r.header.empty()) { r.header = f; continue; }
        if (f.size() != r.header.size())
            refuse(where, "'" + r.file + "' has a row of " + std::to_string(f.size())
                   + " fields under a header of " + std::to_string(r.header.size()));
        r.cells.push_back(std::move(f));
    }
    if (r.header.empty() || r.cells.empty())
        refuse(where, "'" + r.file + "' has no header or no rows");
    if (!d->found("units"))
        refuse(where, "declare `units { <column> \"<unit>\"; ... }` for every column a"
               " plot or table reads (\"-\" for a dimensionless number)");
    const DictPtr u = d->subDict("units");
    for (const auto& c : u->keys())
    {
        if (r.column(c) < 0)
            refuse(where, "`units { " + c + " ...; }` -- '" + r.file + "' has no column '"
                   + c + "'.  Columns: " + joined(r.header));
        r.units[c] = u->lookupWord(c);
    }
    return r;
}

// ---------------------------------------------------------------- series
struct Series
{
    std::string name, label, role, style, group, source;
    //  kind: op-table | ops | reference | difference
    std::string kind;
    std::string op, table, ref;
    std::vector<std::string> ops;
    std::string xKey, yKey, eKey;
    std::vector<Match> select;
    std::string diffA, diffB;
    bool relative = false;
    std::string declaredUnit;      // a series table's column `unit`, optional
    //  resolved
    std::vector<scalar> x, y, e;
    std::string xUnit, yUnit;
    bool xPublished = true, yPublished = true;
    std::size_t dropped = 0;
};

Series readSeries(const DictPtr& d, const std::string& at)
{
    Series s;
    if (!d->found("name")) refuse(at, "declare `name <word>;`");
    s.name = d->lookupWord("name");
    const std::string where = at + " '" + s.name + "'";
    if (!isWord(s.name)) refuse(where, "a name is a word (letters, digits, _)");
    s.label = d->found("label") ? d->lookupWord("label") : s.name;
    s.style = d->lookupWordOrDefault("style", "");
    //  `group <word>;` -- series that share a colour (one ion across sources);
    //  a drawing hint, never a number.
    s.group = d->lookupWordOrDefault("group", "");
    if (!s.style.empty() && s.style != "lines" && s.style != "markers"
        && s.style != "linesMarkers")
        refuse(where, "`style " + s.style + ";` -- Accepted: lines, markers, linesMarkers");
    if (d->found("unit")) s.declaredUnit = d->lookupWord("unit");
    int n = 0;
    if (d->found("op"))         { ++n; s.kind = "op-table"; }
    if (d->found("ops"))        { ++n; s.kind = "ops"; }
    if (d->found("reference"))  { ++n; s.kind = "reference"; }
    if (d->found("difference")) { ++n; s.kind = "difference"; }
    if (n != 1)
        refuse(where, "a series names exactly ONE source -- `op <op>; table <t>;`,"
               " `ops ( ... );`, `reference <ref>;` or `difference ( <a> <b> );` --"
               " and this one names " + std::to_string(n));
    if (s.kind == "difference")
    {
        const auto ab = d->lookupWordList("difference");
        if (ab.size() != 2) refuse(where, "`difference ( <a> <b> );` names two series: a - b");
        s.diffA = ab[0]; s.diffB = ab[1];
        const std::string rel = d->lookupWordOrDefault("relative", "no");
        if (rel != "yes" && rel != "no") refuse(where, "`relative " + rel + ";` -- yes or no");
        s.relative = rel == "yes";
        s.role = "difference";
        return s;
    }
    if (!d->found("x") || !d->found("y"))
        refuse(where, "declare `x <name>;` and `y <name>;` -- what the source publishes"
               " on each axis");
    s.xKey = d->lookupWord("x");
    s.yKey = d->lookupWord("y");
    if (d->found("yError")) s.eKey = d->lookupWord("yError");
    if (s.kind == "op-table")
    {
        s.op = d->lookupWord("op");
        if (!d->found("table"))
            refuse(where, "`op " + s.op + ";` names one operation: say which of its published"
                   " tables (`table <name>;`), or give `ops ( ... );` to plot a diagnostic"
                   " across operations");
        s.table = d->lookupWord("table");
        s.select = readSelect(d, where);
        s.role = "computed";
    }
    else if (s.kind == "ops")
    {
        s.ops = d->lookupWordList("ops");
        if (s.ops.empty()) refuse(where, "`ops ( );` is empty");
        s.role = "computed";
    }
    else
    {
        s.ref = d->lookupWord("reference");
        s.select = readSelect(d, where);
    }
    return s;
}

struct Axis { std::string label, unit, scale; };

Axis readAxis(const DictPtr& d, const std::string& key, const std::string& where,
              bool needScale)
{
    if (!d->found(key)) refuse(where, "declare `" + key + " { label \"...\"; unit \"...\"; }`");
    const DictPtr a = d->subDict(key);
    Axis ax;
    if (!a->found("label") || !a->found("unit"))
        refuse(where, "`" + key + " {}` declares `label` and `unit` (\"-\" for a"
               " dimensionless axis)");
    ax.label = a->lookupWord("label");
    ax.unit  = a->lookupWord("unit");
    if (needScale)
    {
        ax.scale = a->lookupWordOrDefault("scale", "linear");
        if (ax.scale != "linear" && ax.scale != "log")
            refuse(where, "`" + key + " { scale " + ax.scale + "; }` -- Accepted: linear, log");
    }
    return ax;
}

// ---------------------------------------------------------------- rows tables
struct Row
{
    std::string name, label, role, kind, source;   // kind: op | reference | difference
    std::string op, ref;
    std::vector<Match> select;
    std::vector<std::pair<std::string, std::string>> cells;   // column -> key
    std::string diffA, diffB;
    bool relative = false;
    std::vector<scalar> values;                    // resolved, per table column
};

struct Column { std::string name, label, unit; };

struct Item
{
    std::string name, title, kind, shape;   // kind plot|table; shape series|rows
    Axis xAxis, yAxis;                      // plot axes; a series table uses xAxis
    std::vector<Series> series;             // plot series / series-table columns
    std::vector<Column> columns;            // rows table
    std::vector<Row> rows;                  // rows table
};

} // namespace

// ============================================================================
struct Reader::Impl
{
    DictPtr dict;
    std::vector<std::string> declaredOps;
    std::vector<Reference> refs;
    std::vector<Item> items;

    const Reference& refNamed(const std::string& nm, const std::string& where) const
    {
        for (const auto& r : refs) if (r.name == nm) return r;
        std::vector<std::string> names;
        for (const auto& r : refs) names.push_back(r.name);
        refuse(where, "reference '" + nm + "' is not declared.  References: " + joined(names));
    }

    void checkOp(const std::string& op, const std::string& where) const
    {
        if (std::find(declaredOps.begin(), declaredOps.end(), op) == declaredOps.end())
            refuse(where, "operation '" + op + "' is not an operation of this case's"
                   " propsDict.  Operations: " + joined(declaredOps));
    }

    void checkRefColumns(const Reference& r, const std::vector<std::string>& cols,
                         const std::vector<Match>& sel, const std::string& where) const
    {
        for (const auto& c : cols)
        {
            if (c.empty()) continue;
            if (r.column(c) < 0)
                refuse(where, "reference '" + r.name + "' ('" + r.file + "') has no column '"
                       + c + "'.  Columns: " + joined(r.header));
            if (!r.units.count(c))
                refuse(where, "reference '" + r.name + "' declares no unit for column '" + c
                       + "' -- add it to its `units {}`");
        }
        for (const auto& m : sel)
            if (r.column(m.column) < 0)
                refuse(where, "`select { " + m.column + " ...; }` -- reference '" + r.name
                       + "' has no such column.  Columns: " + joined(r.header));
    }
};

Reader::Reader(const std::string& path, const std::vector<std::string>& declaredOps)
    : impl_(std::make_unique<Impl>())
{
    Impl& I = *impl_;
    I.declaredOps = declaredOps;
    I.dict = Dictionary::fromFile(path);
    const DictPtr& D = I.dict;

    if (D->found("references"))
    {
        const auto list = D->lookupDictList("references");
        for (std::size_t k = 0; k < list.size(); ++k)
        {
            Reference r = readReference(list[k], k);
            for (const auto& o : I.refs)
                if (o.name == r.name) refuse("reference '" + r.name + "'", "declared twice");
            I.refs.push_back(std::move(r));
        }
    }

    std::set<std::string> itemNames;
    auto claim = [&](const std::string& nm, const std::string& where)
    {
        if (!isWord(nm)) refuse(where, "a name is a word (letters, digits, _): it names the"
                                " file postProcessing/postProcessDict/" + nm + ".csv");
        if (!itemNames.insert(nm).second)
            refuse(where, "the name '" + nm + "' is taken by another plot or table --"
                   " both would write postProcessing/postProcessDict/" + nm + ".csv");
    };

    //  Each series' sources, checked against the dict alone.
    auto checkSeries = [&](Series& s, const std::string& where,
                           const std::vector<Series>& earlier)
    {
        if (s.kind == "op-table") I.checkOp(s.op, where);
        else if (s.kind == "ops") for (const auto& o : s.ops) I.checkOp(o, where);
        else if (s.kind == "reference")
        {
            const Reference& r = I.refNamed(s.ref, where);
            I.checkRefColumns(r, { s.xKey, s.yKey, s.eKey }, s.select, where);
            s.role = r.role;
        }
        else
        {
            for (const auto& nm : { s.diffA, s.diffB })
            {
                const bool known = std::any_of(earlier.begin(), earlier.end(),
                    [&](const Series& e) { return e.name == nm && e.kind != "difference"; });
                if (!known)
                {
                    std::vector<std::string> names;
                    for (const auto& e : earlier) if (e.kind != "difference") names.push_back(e.name);
                    refuse(where, "`difference ( " + s.diffA + " " + s.diffB + " );` -- '" + nm
                           + "' is not a series declared BEFORE it.  Series: " + joined(names));
                }
            }
        }
        for (const auto& e : earlier)
            if (e.name == s.name) refuse(where, "a second series named '" + s.name + "'");
    };

    if (D->found("plots"))
    {
        const auto list = D->lookupDictList("plots");
        for (std::size_t k = 0; k < list.size(); ++k)
        {
            const DictPtr& p = list[k];
            Item it;
            it.kind = "plot";
            const std::string at = "plots[" + std::to_string(k) + "]";
            if (!p->found("name")) refuse(at, "declare `name <word>;`");
            it.name = p->lookupWord("name");
            const std::string where = "plot '" + it.name + "'";
            claim(it.name, where);
            if (!p->found("title")) refuse(where, "declare `title \"...\";`");
            it.title = p->lookupWord("title");
            it.xAxis = readAxis(p, "xAxis", where, true);
            it.yAxis = readAxis(p, "yAxis", where, true);
            if (!p->found("series")) refuse(where, "declare `series ( { ... } ... );`");
            const auto sl = p->lookupDictList("series");
            if (sl.empty()) refuse(where, "`series ( );` is empty");
            for (std::size_t j = 0; j < sl.size(); ++j)
            {
                Series s = readSeries(sl[j], where + ", series[" + std::to_string(j) + "]");
                checkSeries(s, where + ", series '" + s.name + "'", it.series);
                if (!s.declaredUnit.empty())
                    refuse(where + ", series '" + s.name + "'", "a plot series takes its unit"
                           " from the plot's axis; `unit` belongs to a table column");
                it.series.push_back(std::move(s));
            }
            I.items.push_back(std::move(it));
        }
    }

    if (D->found("tables"))
    {
        const auto list = D->lookupDictList("tables");
        for (std::size_t k = 0; k < list.size(); ++k)
        {
            const DictPtr& t = list[k];
            Item it;
            it.kind = "table";
            const std::string at = "tables[" + std::to_string(k) + "]";
            if (!t->found("name")) refuse(at, "declare `name <word>;`");
            it.name = t->lookupWord("name");
            const std::string where = "table '" + it.name + "'";
            claim(it.name, where);
            if (!t->found("title")) refuse(where, "declare `title \"...\";`");
            it.title = t->lookupWord("title");
            const bool seriesShape = t->found("x");
            const bool rowsShape = t->found("rows");
            if (seriesShape == rowsShape)
                refuse(where, "a table is EITHER a series table (`x { label; unit; }` and"
                       " `columns ( <series> ... );`: one row per x value) OR a rows table"
                       " (`columns ( { name; label; unit; } ... );` and `rows ( ... );`:"
                       " one row per record) -- this one declares "
                       + std::string(seriesShape ? "both" : "neither"));
            if (!t->found("columns")) refuse(where, "declare `columns ( ... );`");
            const auto cl = t->lookupDictList("columns");
            if (cl.empty()) refuse(where, "`columns ( );` is empty");
            if (seriesShape)
            {
                it.shape = "series";
                it.xAxis = readAxis(t, "x", where, false);
                for (std::size_t j = 0; j < cl.size(); ++j)
                {
                    Series s = readSeries(cl[j], where + ", columns[" + std::to_string(j) + "]");
                    checkSeries(s, where + ", column '" + s.name + "'", it.series);
                    it.series.push_back(std::move(s));
                }
            }
            else
            {
                it.shape = "rows";
                for (std::size_t j = 0; j < cl.size(); ++j)
                {
                    const DictPtr& c = cl[j];
                    const std::string cw = where + ", columns[" + std::to_string(j) + "]";
                    if (!c->found("name") || !c->found("unit"))
                        refuse(cw, "a rows-table column declares `name <word>;` and"
                               " `unit \"...\";` (and optionally `label`)");
                    Column col{ c->lookupWord("name"), "", c->lookupWord("unit") };
                    col.label = c->found("label") ? c->lookupWord("label") : col.name;
                    if (!isWord(col.name)) refuse(cw, "a column name is a word");
                    for (const auto& o : it.columns)
                        if (o.name == col.name) refuse(cw, "a second column named '" + col.name + "'");
                    it.columns.push_back(col);
                }
                const auto rl = t->lookupDictList("rows");
                if (rl.empty()) refuse(where, "`rows ( );` is empty");
                for (std::size_t j = 0; j < rl.size(); ++j)
                {
                    const DictPtr& r = rl[j];
                    Row row;
                    const std::string rat = where + ", rows[" + std::to_string(j) + "]";
                    if (!r->found("name")) refuse(rat, "declare `name <word>;`");
                    row.name = r->lookupWord("name");
                    const std::string rw = where + ", row '" + row.name + "'";
                    if (!isWord(row.name)) refuse(rw, "a row name is a word");
                    for (const auto& o : it.rows)
                        if (o.name == row.name) refuse(rw, "a second row named '" + row.name + "'");
                    row.label = r->found("label") ? r->lookupWord("label") : row.name;
                    int n = 0;
                    if (r->found("op"))         { ++n; row.kind = "op"; }
                    if (r->found("reference"))  { ++n; row.kind = "reference"; }
                    if (r->found("difference")) { ++n; row.kind = "difference"; }
                    if (n != 1)
                        refuse(rw, "a row names exactly ONE source -- `op <op>;`, `reference"
                               " <ref>;` or `difference ( <a> <b> );` -- and this one names "
                               + std::to_string(n));
                    if (row.kind == "difference")
                    {
                        const auto ab = r->lookupWordList("difference");
                        if (ab.size() != 2) refuse(rw, "`difference ( <a> <b> );` names two rows: a - b");
                        row.diffA = ab[0]; row.diffB = ab[1];
                        const std::string rel = r->lookupWordOrDefault("relative", "no");
                        if (rel != "yes" && rel != "no") refuse(rw, "`relative " + rel + ";` -- yes or no");
                        row.relative = rel == "yes";
                        row.role = "difference";
                        for (const auto& nm : { row.diffA, row.diffB })
                        {
                            const bool known = std::any_of(it.rows.begin(), it.rows.end(),
                                [&](const Row& e) { return e.name == nm && e.kind != "difference"; });
                            if (!known)
                            {
                                std::vector<std::string> names;
                                for (const auto& e : it.rows) if (e.kind != "difference") names.push_back(e.name);
                                refuse(rw, "`difference ( " + row.diffA + " " + row.diffB + " );` -- '"
                                       + nm + "' is not a row declared BEFORE it.  Rows: " + joined(names));
                            }
                        }
                    }
                    else
                    {
                        if (!r->found("cells"))
                            refuse(rw, "declare `cells { <column> <name>; ... }` -- which"
                                   " published number fills each column");
                        const DictPtr cs = r->subDict("cells");
                        for (const auto& c : cs->keys())
                        {
                            const bool known = std::any_of(it.columns.begin(), it.columns.end(),
                                [&](const Column& col) { return col.name == c; });
                            if (!known)
                            {
                                std::vector<std::string> names;
                                for (const auto& col : it.columns) names.push_back(col.name);
                                refuse(rw, "`cells { " + c + " ...; }` -- the table has no column '"
                                       + c + "'.  Columns: " + joined(names));
                            }
                            row.cells.push_back({ c, cs->lookupWord(c) });
                        }
                        if (row.kind == "op")
                        {
                            row.op = r->lookupWord("op");
                            I.checkOp(row.op, rw);
                            row.role = "computed";
                        }
                        else
                        {
                            row.ref = r->lookupWord("reference");
                            row.select = readSelect(r, rw);
                            if (row.select.empty())
                                refuse(rw, "a reference row declares `select { ... }`, which"
                                       " must keep exactly one record of the reference");
                            const Reference& ref = I.refNamed(row.ref, rw);
                            std::vector<std::string> cols;
                            for (const auto& c : row.cells) cols.push_back(c.second);
                            I.checkRefColumns(ref, cols, row.select, rw);
                            row.role = ref.role;
                        }
                    }
                    it.rows.push_back(std::move(row));
                }
            }
            I.items.push_back(std::move(it));
        }
    }

    if (I.items.empty())
        refuse("the dictionary", "declares no `plots ( ... );` and no `tables ( ... );`");

    //  A NEW DICTIONARY OWES NO CORPUS A TOLERANCE: a key nothing reads is a
    //  silent instruction, and here it is refused, not warned.
    const auto unread = dictAudit::auditTree(*D, "postProcessDict");
    if (!unread.empty())
    {
        std::string msg = "keys nothing reads:";
        for (const auto& f : unread)
            msg += "\n    " + f.where + ": `" + f.key + "`"
                 + (f.suggestion.empty() ? "" : " (did you mean `" + f.suggestion + "`?)");
        refuse("the dictionary", msg);
    }
}

Reader::~Reader() = default;

namespace {

const Publication& pubNamed(const std::vector<Publication>& pubs, const std::string& op,
                            const std::string& where)
{
    for (const auto& p : pubs) if (p.name == op) return p;
    refuse(where, "operation '" + op + "' published nothing in this run");
}

scalar diagOf(const Publication& p, const std::string& key, const std::string& where,
              std::string* unit, bool* published)
{
    const auto it = p.diagnostics.find(key);
    if (it == p.diagnostics.end())
    {
        std::vector<std::string> keys;
        for (const auto& kv : p.diagnostics) keys.push_back(kv.first);
        refuse(where, "operation '" + p.name + "' (" + p.type + ") publishes no diagnostic '"
               + key + "'.  Its diagnostics: " + joined(keys, 60));
    }
    const auto u = p.units.find(key);
    const std::string un = u == p.units.end() ? std::string() : u->second;
    if (unit) *unit = un;
    if (published) *published = !un.empty();
    return it->second;
}

void resolveSeries(Series& s, const std::vector<Publication>& pubs,
                   const std::vector<Reference>& refs, const std::vector<Series>& earlier,
                   const std::string& where)
{
    if (s.kind == "ops")
    {
        bool xp = true, yp = true;
        for (const auto& o : s.ops)
        {
            const Publication& p = pubNamed(pubs, o, where);
            std::string xu, yu;
            bool xpub = false, ypub = false;
            const scalar xv = diagOf(p, s.xKey, where, &xu, &xpub);
            const scalar yv = diagOf(p, s.yKey, where, &yu, &ypub);
            const scalar ev = s.eKey.empty() ? NaN : diagOf(p, s.eKey, where, nullptr, nullptr);
            if (o == s.ops.front()) { s.xUnit = xu; s.yUnit = yu; }
            else if (xu != s.xUnit || yu != s.yUnit)
                refuse(where, "the operations publish '" + s.xKey + "' / '" + s.yKey
                       + "' in different units");
            xp = xp && xpub; yp = yp && ypub;
            s.x.push_back(xv); s.y.push_back(yv); s.e.push_back(ev);
        }
        s.xPublished = xp; s.yPublished = yp;
        s.source = "operations " + joined(s.ops) + ": diagnostics " + s.xKey + ", " + s.yKey;
        return;
    }
    if (s.kind == "op-table")
    {
        const Publication& p = pubNamed(pubs, s.op, where);
        const PublishedTable* tab = nullptr;
        for (const auto& t : p.tables) if (t.name == s.table) tab = &t;
        if (!tab)
        {
            std::vector<std::string> names;
            for (const auto& t : p.tables) names.push_back(t.name);
            refuse(where, "operation '" + s.op + "' (" + p.type + ") publishes no table '"
                   + s.table + "'.  Its tables: " + joined(names));
        }
        std::vector<std::string> cols;
        for (const auto& c : tab->columns) cols.push_back(c.name);
        auto col = [&](const std::string& c) -> int
        {
            if (c.empty()) return -1;
            const int i = tab->columnIndex(c);
            if (i < 0)
                refuse(where, "table '" + s.table + "' of operation '" + s.op
                       + "' has no column '" + c + "'.  Columns: " + joined(cols));
            return i;
        };
        const int xi = col(s.xKey), yi = col(s.yKey), ei = col(s.eKey);
        std::vector<int> si;
        for (const auto& m : s.select)
        {
            if (!m.numeric)
                refuse(where, "`select { " + m.column + " " + m.word + "; }` -- a published"
                       " table holds numbers; select on a number");
            si.push_back(col(m.column));
        }
        for (const auto& row : tab->rows)
        {
            bool keep = true;
            for (std::size_t k = 0; k < si.size(); ++k)
                if (!matches(s.select[k], jsonNumber(row[si[k]]))) keep = false;
            if (!keep) continue;
            s.x.push_back(row[xi]); s.y.push_back(row[yi]);
            s.e.push_back(ei >= 0 ? row[ei] : NaN);
        }
        s.xUnit = tab->columns[xi].unit; s.yUnit = tab->columns[yi].unit;
        s.source = "operation " + s.op + ", table " + s.table + ": " + s.xKey + ", " + s.yKey
                 + (s.select.empty() ? "" : " where " + selectText(s.select));
        if (s.x.empty())
            refuse(where, "no row of table '" + s.table + "' of operation '" + s.op
                   + "' has " + selectText(s.select));
        return;
    }
    if (s.kind == "reference")
    {
        const Reference* r = nullptr;
        for (const auto& rr : refs) if (rr.name == s.ref) r = &rr;
        const int xi = r->column(s.xKey), yi = r->column(s.yKey);
        const int ei = s.eKey.empty() ? -1 : r->column(s.eKey);
        for (const auto& row : r->cells)
        {
            bool keep = true;
            for (const auto& m : s.select)
                if (!matches(m, row[r->column(m.column)])) keep = false;
            if (!keep) continue;
            const scalar xv = parseNumber(row[xi]), yv = parseNumber(row[yi]);
            if (!std::isfinite(xv) || !std::isfinite(yv)) { ++s.dropped; continue; }
            s.x.push_back(xv); s.y.push_back(yv);
            s.e.push_back(ei >= 0 ? parseNumber(row[ei]) : NaN);
        }
        s.xUnit = r->units.at(s.xKey); s.yUnit = r->units.at(s.yKey);
        s.source = "reference " + s.ref + " (" + r->file + "): " + s.xKey + ", " + s.yKey
                 + (s.select.empty() ? "" : " where " + selectText(s.select));
        if (s.x.empty())
            refuse(where, "no row of reference '" + s.ref + "' with a number in both '"
                   + s.xKey + "' and '" + s.yKey + "'"
                   + (s.select.empty() ? "" : " has " + selectText(s.select)));
        return;
    }
    //  difference: a - b at every x both carry
    const Series* a = nullptr;
    const Series* b = nullptr;
    for (const auto& e : earlier) { if (e.name == s.diffA) a = &e; if (e.name == s.diffB) b = &e; }
    if (a->xUnit != b->xUnit || (!s.relative && a->yUnit != b->yUnit))
        refuse(where, "`difference ( " + s.diffA + " " + s.diffB + " );` -- the two series are"
               " in different units (" + a->xUnit + ", " + a->yUnit + " against " + b->xUnit
               + ", " + b->yUnit + ")");
    for (std::size_t i = 0; i < a->x.size(); ++i)
        for (std::size_t j = 0; j < b->x.size(); ++j)
            if (std::abs(a->x[i] - b->x[j]) <= 1e-12 * std::max<scalar>(1.0, std::abs(b->x[j])))
            {
                s.x.push_back(a->x[i]);
                const scalar d = a->y[i] - b->y[j];
                s.y.push_back(s.relative ? d / std::abs(b->y[j]) : d);
                s.e.push_back(NaN);
                break;
            }
    s.xUnit = a->xUnit;
    s.yUnit = s.relative ? "-" : a->yUnit;
    s.xPublished = a->xPublished && b->xPublished;
    s.yPublished = s.relative || (a->yPublished && b->yPublished);
    s.source = std::string(s.relative ? "relative difference" : "difference")
             + " (" + s.diffA + " - " + s.diffB + ")" + (s.relative ? " / |" + s.diffB + "|" : "");
    if (s.x.empty())
        refuse(where, "`difference ( " + s.diffA + " " + s.diffB + " );` -- the two series"
               " share no x value");
}

void checkUnit(const std::string& published, bool isPublished, const std::string& declared,
               const std::string& what, const std::string& where)
{
    if (isPublished && published != declared)
        refuse(where, what + " is published in '" + published + "' and declared in '"
               + declared + "' -- a plot or table states the unit of what it draws");
}

std::string unitJson(const std::string& name, const std::string& unit, bool published)
{
    return "{ \"name\": " + q(name) + ", \"unit\": " + q(unit)
         + ", \"unitPublished\": " + (published ? "true" : "false") + " }";
}

void printTable(const std::string& title, const std::vector<std::string>& head,
                const std::vector<std::vector<std::string>>& body)
{
    std::vector<std::size_t> w(head.size(), 0);
    for (std::size_t c = 0; c < head.size(); ++c) w[c] = head[c].size();
    for (const auto& r : body)
        for (std::size_t c = 0; c < r.size() && c < w.size(); ++c) w[c] = std::max(w[c], r[c].size());
    std::cout << "\n  " << title << "\n";
    auto line = [&](const std::vector<std::string>& r)
    {
        std::cout << "   ";
        for (std::size_t c = 0; c < w.size(); ++c)
            std::cout << " " << std::left << std::setw(static_cast<int>(w[c]))
                      << (c < r.size() ? r[c] : std::string()) << std::right;
        std::cout << "\n";
    };
    line(head);
    for (const auto& r : body) line(r);
}

std::string shortNumber(scalar v)
{
    if (!std::isfinite(v)) return "";
    std::ostringstream os;
    os << std::setprecision(7) << v;
    return os.str();
}

} // namespace

std::string Reader::evaluate(const std::vector<Publication>& pubs, int verbosity)
{
    Impl& I = *impl_;
    std::error_code ec;
    fs::remove_all(outputDir(), ec);
    fs::create_directories(outputDir(), ec);
    if (ec) refuse("the dictionary", std::string("cannot create ") + outputDir() + ": " + ec.message());

    std::cout << "\n========  Post-processing (system/postProcessDict)  ========\n"
              << "  " << I.items.size() << " item(s) -> " << outputDir() << "/<name>.csv"
              << " (+ <name>.json: titles, units, series roles and sources)\n";

    std::ostringstream block;
    block << "{ \"source\": \"system/postProcessDict\", \"directory\": " << q(outputDir())
          << ",\n    \"references\": [";
    for (std::size_t k = 0; k < I.refs.size(); ++k)
    {
        const auto& r = I.refs[k];
        block << (k ? "," : "") << "\n      { \"name\": " << q(r.name) << ", \"file\": "
              << q(r.file) << ", \"role\": " << q(r.role) << ", \"citation\": "
              << q(r.citation) << " }";
    }
    block << "\n    ],\n    \"items\": [";

    for (std::size_t n = 0; n < I.items.size(); ++n)
    {
        Item& it = I.items[n];
        const std::string where = it.kind + " '" + it.name + "'";
        const std::string file = std::string(outputDir()) + "/" + it.name + ".csv";
        std::ostringstream js;
        js << "{ \"name\": " << q(it.name) << ", \"kind\": " << q(it.kind);
        if (it.kind == "table") js << ", \"shape\": " << q(it.shape);
        js << ", \"title\": " << q(it.title) << ", \"file\": " << q(file);

        std::vector<std::string> head;
        std::vector<std::vector<std::string>> body;
        std::ofstream csv(file);
        if (!csv) refuse(where, "cannot write " + file);

        if (it.kind == "plot" || it.shape == "series")
        {
            for (std::size_t j = 0; j < it.series.size(); ++j)
            {
                Series& s = it.series[j];
                const std::string sw = where + ", series '" + s.name + "'";
                resolveSeries(s, pubs, I.refs, std::vector<Series>(it.series.begin(),
                              it.series.begin() + static_cast<long>(j)), sw);
                checkUnit(s.xUnit, s.xPublished, it.xAxis.unit, "x ('" + s.xKey + "')", sw);
                const std::string yDecl = it.kind == "plot" ? it.yAxis.unit
                                        : (s.declaredUnit.empty() ? s.yUnit : s.declaredUnit);
                if (it.kind == "table" && s.declaredUnit.empty() && !s.yPublished)
                    refuse(sw, "the source publishes no unit for '" + s.yKey + "' -- declare"
                           " the column's `unit`");
                checkUnit(s.yUnit, s.yPublished, yDecl, "y ('" + s.yKey + "')", sw);
                if (!s.xPublished) s.xUnit = it.xAxis.unit;
                if (!s.yPublished) s.yUnit = yDecl;
                if (it.kind == "plot")
                {
                    for (std::size_t i = 0; i < s.x.size(); ++i)
                    {
                        if (it.xAxis.scale == "log" && !(s.x[i] > 0))
                            refuse(sw, "x = " + jsonNumber(s.x[i]) + " on a log axis");
                        if (it.yAxis.scale == "log" && !(s.y[i] > 0))
                            refuse(sw, "y = " + jsonNumber(s.y[i]) + " at x = "
                                   + jsonNumber(s.x[i]) + " on a log axis");
                    }
                }
                if (!s.xPublished || !s.yPublished)
                    std::cout << "  [postProcessDict] " << sw << ": its source publishes no unit for "
                              << (!s.xPublished ? "'" + s.xKey + "'" : std::string())
                              << (!s.xPublished && !s.yPublished ? " and " : "")
                              << (!s.yPublished ? "'" + s.yKey + "'" : std::string())
                              << " -- the declared unit is taken as the author's statement\n";
                if (s.dropped > 0)
                    std::cout << "  [postProcessDict] " << sw << ": " << s.dropped << " row(s) of the"
                                 " reference carry no number on an axis and are not drawn\n";
            }
        }

        if (it.kind == "plot")
        {
            csv << "series,x,y,yError\n";
            for (const auto& s : it.series)
                for (std::size_t i = 0; i < s.x.size(); ++i)
                    csv << s.name << "," << cell(s.x[i]) << "," << cell(s.y[i]) << ","
                        << cell(s.e[i]) << "\n";
            js << ", \"xAxis\": { \"label\": " << q(it.xAxis.label) << ", \"unit\": "
               << q(it.xAxis.unit) << ", \"scale\": " << q(it.xAxis.scale) << " }"
               << ", \"yAxis\": { \"label\": " << q(it.yAxis.label) << ", \"unit\": "
               << q(it.yAxis.unit) << ", \"scale\": " << q(it.yAxis.scale) << " }"
               << ", \"series\": [";
            for (std::size_t j = 0; j < it.series.size(); ++j)
            {
                const auto& s = it.series[j];
                const bool err = std::any_of(s.e.begin(), s.e.end(),
                                             [](scalar v) { return std::isfinite(v); });
                js << (j ? ", " : "") << "{ \"name\": " << q(s.name) << ", \"label\": "
                   << q(s.label) << ", \"role\": " << q(s.role) << ", \"style\": "
                   << q(s.style) << ", \"group\": " << q(s.group) << ", \"source\": " << q(s.source)
                   << ", \"x\": " << unitJson(s.xKey, s.xUnit, s.xPublished)
                   << ", \"y\": " << unitJson(s.yKey, s.yUnit, s.yPublished)
                   << ", \"yError\": " << (err ? "true" : "false")
                   << ", \"points\": " << s.x.size() << " }";
            }
            js << "] }";
            std::cout << "  plot  " << std::left << std::setw(26) << it.name << std::right
                      << it.series.size() << " series -- " << it.title << "\n";
            if (verbosity >= 3)
                for (const auto& s : it.series)
                    std::cout << "        " << s.name << ": " << s.x.size() << " point(s), "
                              << s.source << "\n";
        }
        else if (it.shape == "series")
        {
            //  One row per x value any non-difference column carries, sorted.
            std::vector<scalar> xs;
            for (const auto& s : it.series)
            {
                if (s.kind == "difference") continue;
                for (std::size_t i = 0; i < s.x.size(); ++i)
                {
                    for (std::size_t k = 0; k < i; ++k)
                        if (s.x[k] == s.x[i])
                            refuse(where + ", column '" + s.name + "'", "x = " + jsonNumber(s.x[i])
                                   + " appears twice -- a table row would be ambiguous; narrow"
                                     " the source with `select {}`");
                    bool seen = false;
                    for (const scalar v : xs)
                        if (std::abs(v - s.x[i]) <= 1e-12 * std::max<scalar>(1.0, std::abs(v))) seen = true;
                    if (!seen) xs.push_back(s.x[i]);
                }
            }
            std::sort(xs.begin(), xs.end());
            auto at = [](const Series& s, scalar xv) -> scalar
            {
                for (std::size_t i = 0; i < s.x.size(); ++i)
                    if (std::abs(s.x[i] - xv) <= 1e-12 * std::max<scalar>(1.0, std::abs(xv))) return s.y[i];
                return NaN;
            };
            csv << "x";
            head.push_back(it.xAxis.label + " [" + it.xAxis.unit + "]");
            for (const auto& s : it.series)
            {
                csv << "," << s.name;
                head.push_back(s.label + " [" + s.yUnit + "]");
            }
            csv << "\n";
            for (const scalar xv : xs)
            {
                csv << cell(xv);
                std::vector<std::string> r{ shortNumber(xv) };
                for (const auto& s : it.series)
                {
                    const scalar v = at(s, xv);
                    csv << "," << cell(v);
                    r.push_back(shortNumber(v));
                }
                csv << "\n";
                body.push_back(std::move(r));
            }
            js << ", \"x\": { \"label\": " << q(it.xAxis.label) << ", \"unit\": "
               << q(it.xAxis.unit) << " }, \"columns\": [";
            for (std::size_t j = 0; j < it.series.size(); ++j)
            {
                const auto& s = it.series[j];
                js << (j ? ", " : "") << "{ \"name\": " << q(s.name) << ", \"label\": "
                   << q(s.label) << ", \"unit\": " << q(s.yUnit) << ", \"role\": " << q(s.role)
                   << ", \"source\": " << q(s.source) << ", \"relative\": "
                   << (s.relative ? "true" : "false") << " }";
            }
            js << "], \"rows\": " << xs.size() << " }";
            printTable(it.title, head, body);
        }
        else
        {
            //  ROWS TABLE: each row's cells from its own source.
            for (std::size_t j = 0; j < it.rows.size(); ++j)
            {
                Row& row = it.rows[j];
                const std::string rw = where + ", row '" + row.name + "'";
                row.values.assign(it.columns.size(), NaN);
                auto colIdx = [&](const std::string& c)
                {
                    for (std::size_t k = 0; k < it.columns.size(); ++k)
                        if (it.columns[k].name == c) return k;
                    return std::size_t(0);
                };
                if (row.kind == "op")
                {
                    const Publication& p = pubNamed(pubs, row.op, rw);
                    for (const auto& [c, key] : row.cells)
                    {
                        std::string u; bool pub = false;
                        const scalar v = diagOf(p, key, rw, &u, &pub);
                        const std::size_t k = colIdx(c);
                        checkUnit(u, pub, it.columns[k].unit, "'" + key + "'", rw);
                        row.values[k] = v;
                    }
                    row.source = "operation " + row.op;
                }
                else if (row.kind == "reference")
                {
                    const Reference* r = nullptr;
                    for (const auto& rr : I.refs) if (rr.name == row.ref) r = &rr;
                    const std::vector<std::string>* hit = nullptr;
                    int count = 0;
                    for (const auto& line : r->cells)
                    {
                        bool keep = true;
                        for (const auto& m : row.select)
                            if (!matches(m, line[r->column(m.column)])) keep = false;
                        if (keep) { ++count; hit = &line; }
                    }
                    if (count != 1)
                        refuse(rw, "`select { " + selectText(row.select) + " }` keeps "
                               + std::to_string(count) + " record(s) of reference '" + row.ref
                               + "' -- a row is one record");
                    for (const auto& [c, col] : row.cells)
                    {
                        const std::size_t k = colIdx(c);
                        checkUnit(r->units.at(col), true, it.columns[k].unit, "'" + col + "'", rw);
                        row.values[k] = parseNumber((*hit)[r->column(col)]);
                    }
                    row.source = "reference " + row.ref + " where " + selectText(row.select);
                }
                else
                {
                    const Row* a = nullptr;
                    const Row* b = nullptr;
                    for (std::size_t k = 0; k < j; ++k)
                    {
                        if (it.rows[k].name == row.diffA) a = &it.rows[k];
                        if (it.rows[k].name == row.diffB) b = &it.rows[k];
                    }
                    for (std::size_t k = 0; k < it.columns.size(); ++k)
                    {
                        const scalar d = a->values[k] - b->values[k];
                        row.values[k] = row.relative ? d / std::abs(b->values[k]) : d;
                    }
                    row.source = std::string(row.relative ? "relative difference" : "difference")
                               + " (" + row.diffA + " - " + row.diffB + ")"
                               + (row.relative ? " / |" + row.diffB + "|" : "");
                }
            }
            csv << "row";
            head.push_back("");
            for (const auto& c : it.columns)
            {
                csv << "," << c.name;
                head.push_back(c.label + " [" + c.unit + "]");
            }
            csv << "\n";
            for (const auto& row : it.rows)
            {
                csv << row.name;
                std::vector<std::string> r{ row.label + (row.relative ? " [-]" : "") };
                for (const scalar v : row.values)
                {
                    csv << "," << cell(v);
                    r.push_back(shortNumber(v));
                }
                csv << "\n";
                body.push_back(std::move(r));
            }
            js << ", \"columns\": [";
            for (std::size_t k = 0; k < it.columns.size(); ++k)
                js << (k ? ", " : "") << "{ \"name\": " << q(it.columns[k].name) << ", \"label\": "
                   << q(it.columns[k].label) << ", \"unit\": " << q(it.columns[k].unit) << " }";
            js << "], \"rows\": [";
            for (std::size_t k = 0; k < it.rows.size(); ++k)
            {
                const auto& row = it.rows[k];
                js << (k ? ", " : "") << "{ \"name\": " << q(row.name) << ", \"label\": "
                   << q(row.label) << ", \"role\": " << q(row.role) << ", \"source\": "
                   << q(row.source) << ", \"relative\": " << (row.relative ? "true" : "false")
                   << " }";
            }
            js << "] }";
            printTable(it.title, head, body);
        }
        csv.close();
        const std::string sidecar = std::string(outputDir()) + "/" + it.name + ".json";
        std::ofstream side(sidecar);
        if (!side) refuse(where, "cannot write " + sidecar);
        side << js.str() << "\n";
        block << (n ? "," : "") << "\n      " << js.str();
    }
    block << "\n    ] }";
    std::cout << "=====================================================\n";
    return block.str();
}

void clearStale()
{
    std::error_code ec;
    if (fs::exists(outputDir(), ec)) fs::remove_all(outputDir(), ec);
}

} // namespace postProcessDict
} // namespace Choupo
