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

#include "postProcessing/views/Views.H"

#include "core/DictAudit.H"
#include "core/Units.H"
#include "result/ResultEmitter.H"
#include "thermo/RecordResolver.H"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <map>
#include <memory>
#include <set>
#include <sstream>
#include <stdexcept>
#include <variant>

namespace Choupo {
namespace views {

namespace fs = std::filesystem;

namespace {

const scalar NaN = std::numeric_limits<scalar>::quiet_NaN();

//  WHICH DICTIONARY THE VIEWS ARE READ FROM, for the refusal's first words:
//  a props run reads them from system/propsDict, a steady run from
//  system/postDict (C271).  Set by Reader's constructor and by evaluate().
std::string g_dictName = "system/propsDict";
//  A FLOWSHEET RUN'S VIEWS ARE DRAWN IN THE UNIT THE AUTHOR DECLARES (C271):
//  a stream publishes SI (K, Pa, kg/s, a fraction) and a paper prints wt %,
//  kg/h and MW, so a declared unit of the SAME dimensions scales the number
//  (units::lookupUnit's factors, one change of scale, never a model).  A
//  props run keeps its words: every op there publishes in the unit its
//  author reads, and a V against a mV is a refusal a gate arm holds.
bool g_scaleUnits = false;

[[noreturn]] void refuse(const std::string& where, const std::string& what)
{
    throw std::runtime_error(g_dictName + " views, " + where + ": " + what);
}

//  THE SOURCE OF A SERIES, ROW OR VIEW: `op <name>;` (a props operation),
//  `unitOp <name>;` or `stream <name>;` (a flowsheet run's units and
//  streams: two namespaces, a unit and a stream may share a name).  The key
//  the reader works with carries the namespace: `unit:<name>`,
//  `stream:<name>`, a bare op name.
int sourceWords(const DictPtr& d)
{
    return (d->found("op") ? 1 : 0) + (d->found("unitOp") ? 1 : 0)
         + (d->found("stream") ? 1 : 0);
}

std::string sourceKey(const DictPtr& d)
{
    if (d->found("unitOp")) return "unit:" + d->lookupWord("unitOp");
    if (d->found("stream")) return "stream:" + d->lookupWord("stream");
    return d->lookupWord("op");
}

//  A source key in words: "unit operation 'splitter'", "stream 'feed'".
std::string sourceText(const std::string& key)
{
    if (key.rfind("unit:", 0) == 0)   return "unit operation '" + key.substr(5) + "'";
    if (key.rfind("stream:", 0) == 0) return "stream '" + key.substr(7) + "'";
    return "operation '" + key + "'";
}

//  The folder a source's views are written under: an op's name as ever, a
//  unit's or stream's with its namespace spelt out (`unit_splitter`), so a
//  unit and a stream of one name cannot share a folder.
std::string folderOf(const std::string& key)
{
    std::string f = key;
    for (auto& c : f) if (c == ':') c = '_';
    return f;
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
//  ONE POINT OF A `pairs` SERIES (C271): a measured number set against the
//  model's -- x a cell of ONE reference record, y a diagnostic of one
//  op / unit / stream.  The parity of a paper's table against a run is the
//  only series that needs a number from each side at once.
struct Pair
{
    std::string label, ref, xCol, src, yKey;
    std::vector<Match> select;
};

struct Series
{
    std::string name, label, role, style, group, source;
    //  kind: op-table | ops | reference | difference | pairs
    std::string kind;
    std::vector<Pair> pairs;
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
    int n = sourceWords(d);
    if (n > 0)                  { s.kind = "op-table"; }
    if (d->found("ops"))        { ++n; s.kind = "ops"; }
    if (d->found("reference") && !d->found("pairs")) { ++n; s.kind = "reference"; }
    if (d->found("difference")) { ++n; s.kind = "difference"; }
    if (d->found("pairs"))      { ++n; s.kind = "pairs"; }
    if (n != 1)
        refuse(where, "a series names exactly ONE source -- `op <op>; table <t>;` (or"
               " `unitOp <name>;` / `stream <name>;` on a flowsheet run), `ops ( ... );`,"
               " `reference <ref>;`, `pairs ( ... );` or `difference ( <a> <b> );` --"
               " and this one names " + std::to_string(n));
    if (s.kind == "pairs")
    {
        const auto pl = d->lookupDictList("pairs");
        if (pl.empty()) refuse(where, "`pairs ( );` is empty");
        for (std::size_t k = 0; k < pl.size(); ++k)
        {
            const std::string pw = where + ", pairs[" + std::to_string(k) + "]";
            const DictPtr& e = pl[k];
            Pair pr;
            if (!e->found("reference") || !e->found("x") || !e->found("y")
                || sourceWords(e) != 1)
                refuse(pw, "a pair names `reference <ref>; select { ... }; x <column>;` (the"
                       " measured number: ONE record of the reference), ONE of `op <op>;` /"
                       " `unitOp <name>;` / `stream <name>;` and `y <diagnostic>;` (the"
                       " model's)");
            pr.ref = e->lookupWord("reference");
            pr.select = readSelect(e, pw);
            if (pr.select.empty())
                refuse(pw, "a pair declares `select { ... }`, which must keep exactly one"
                       " record of the reference");
            pr.xCol = e->lookupWord("x");
            pr.src = sourceKey(e);
            pr.yKey = e->lookupWord("y");
            pr.label = e->found("label") ? e->lookupWord("label") : pr.yKey;
            s.pairs.push_back(std::move(pr));
        }
        s.role = "computed";
        if (s.style.empty()) s.style = "markers";
        s.xKey = "measured"; s.yKey = "computed";
        return s;
    }
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
        s.op = sourceKey(d);
        if (!d->found("table"))
            refuse(where, sourceText(s.op) + " is one source: say which of its published"
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

//  `min` / `max` (C271): an optional drawing range, in the axis's unit.  A parity
//  of a table against a run on log axes may hold a model value many decades from
//  the measured one; the range keeps the rest legible, the CSV keeps every point.
struct Axis { std::string label, unit, scale; scalar lo = NaN, hi = NaN; };

//  An axis may be omitted, or name only its label: its unit is then the one
//  the drawn series PUBLISH (and they must agree), its label their column.
Axis readAxis(const DictPtr& d, const std::string& key, const std::string& where,
              bool needScale)
{
    Axis ax{ "", "", "linear", NaN, NaN };
    if (!d->found(key)) return ax;
    const DictPtr a = d->subDict(key);
    ax.label = a->lookupWordOrDefault("label", "");
    ax.unit  = a->lookupWordOrDefault("unit", "");
    if (a->found("min")) ax.lo = a->lookupScalar("min");
    if (a->found("max")) ax.hi = a->lookupScalar("max");
    if (std::isfinite(ax.lo) && std::isfinite(ax.hi) && !(ax.lo < ax.hi))
        refuse(where, "`" + key + " { min " + jsonNumber(ax.lo) + "; max " + jsonNumber(ax.hi)
               + "; }` -- min is below max");
    if (needScale)
    {
        ax.scale = a->lookupWordOrDefault("scale", "linear");
        if (ax.scale != "linear" && ax.scale != "log")
            refuse(where, "`" + key + " { scale " + ax.scale + "; }` -- Accepted: linear, log");
    }
    return ax;
}

// ---------------------------------------------------------------- rows tables
//  A CELL THAT NAMES ITS OWN SOURCE (C271): `cells { duty { unitOp splitter;
//  key Q_reboiler_kW; } iC4 { reference klemola; select { item isoButane; };
//  key top_wt; } }` -- a row of numbers that come from different streams,
//  units or records of a reference (a paper's key compositions, flows and
//  duty set against the run's, beside each other).
struct CellSrc
{
    std::string column, key, src, ref;
    std::vector<Match> select;
};

struct Row
{
    std::string name, label, role, kind, source;   // kind: op | reference | cells | difference
    std::vector<CellSrc> blocks;                   // kind cells
    std::string unit;                              // a row's own unit (a parameter table)
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
    //  the case's own caveat beside the figure (DEV.md 4c C154): what a
    //  reader must know to read THIS view right -- what its error bars are,
    //  what a reference line does and does not include.  Prose the case
    //  states, drawn under the figure; "" = none.
    std::string note;
    std::string type;                       // series | profile | parity | residuals | table
    std::string home;                       // the op it is about ("" = the case)
    std::string origin;                     // declared | default
    Axis xAxis, yAxis;                      // plot axes; a series table uses xAxis
    std::vector<Series> series;             // plot series / series-table columns
    std::vector<Column> columns;            // rows table
    std::vector<Row> rows;                  // rows table
};

} // namespace

// ============================================================================
//  A STUDY: operations the case groups under one scientific question, with
//  what KIND of check the question is (DEV.md 4c C154).  The purpose is a
//  word from a closed list, because it is a claim about the evidence and a
//  reader must be able to tell a code-to-code check from a comparison with
//  measurements whose parameters were fitted to them -- and no word on the
//  list says `validated`: a purpose is what the case SET OUT to do, never
//  what a run concluded.
struct Study
{
    std::string name, title, purpose, summary;
    std::vector<std::string> ops;
};

struct Reader::Impl
{
    bool namesKnown = true;                 // false: a flowsheet run (names resolved at evaluate)
    std::string dictName;
    bool scaleUnits = false;
    std::vector<std::string> declaredOps;
    std::vector<Reference> refs;
    std::vector<Item> items;
    std::vector<Study> studies;

    const Reference& refNamed(const std::string& nm, const std::string& where) const
    {
        for (const auto& r : refs) if (r.name == nm) return r;
        std::vector<std::string> names;
        for (const auto& r : refs) names.push_back(r.name);
        refuse(where, "reference '" + nm + "' is not declared.  References: " + joined(names));
    }

    void checkOp(const std::string& op, const std::string& where) const
    {
        //  A FLOWSHEET RUN'S units and streams exist only once the flowsheet is
        //  flattened, so its names are held to the run at evaluate() (pubNamed).
        if (!namesKnown) return;
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

    void checkSeries(Series& s, const std::string& where,
                     const std::vector<Series>& earlier) const;
    Item parseView(const DictPtr& v, const std::string& at, const std::string& origin,
                   const std::string& home) const;
};

//  Each series' sources, checked against the dict alone.
void Reader::Impl::checkSeries(Series& s, const std::string& where,
                               const std::vector<Series>& earlier) const
{
    if (s.kind == "op-table") checkOp(s.op, where);
    else if (s.kind == "ops") for (const auto& o : s.ops) checkOp(o, where);
    else if (s.kind == "pairs")
    {
        for (const auto& pr : s.pairs)
        {
            checkOp(pr.src, where);
            checkRefColumns(refNamed(pr.ref, where), { pr.xCol }, pr.select, where);
        }
    }
    else if (s.kind == "reference")
    {
        const Reference& r = refNamed(s.ref, where);
        checkRefColumns(r, { s.xKey, s.yKey, s.eKey }, s.select, where);
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
}

//  THE SHORTHAND an author (or an AI) writes most: one source, one x, a LIST
//  of y -- `op table1; table rows; x C_b_Cl_molm3; y ( Gamma_dye Gamma_Na );`
//  or `ops ( a b c ); x <diag>; y ( <diag> ... );` -- expanded into one series
//  per y, each named and labelled by its column.  Written out, it is exactly
//  what the long form says.
static std::vector<Series> shorthandSeries(const DictPtr& v, const std::string& where)
{
    std::vector<Series> out;
    if (!v->found("y")) return out;
    const auto ys = v->lookupWordList("y");
    if (ys.empty()) refuse(where, "`y ( );` is empty");
    if (!v->found("x")) refuse(where, "`y ( ... );` needs `x <name>;` -- what the source"
                               " publishes on the abscissa");
    const std::string x = v->lookupWord("x");
    for (const auto& y : ys)
    {
        Series s;
        s.name = y; s.label = y; s.xKey = x; s.yKey = y; s.role = "computed";
        s.style = v->lookupWordOrDefault("style", "");
        if (v->found("ops")) { s.kind = "ops"; s.ops = v->lookupWordList("ops"); }
        else if (sourceWords(v) == 1 && v->found("table"))
        {
            s.kind = "op-table"; s.op = sourceKey(v); s.table = v->lookupWord("table");
            s.select = readSelect(v, where);
        }
        else
            refuse(where, "`y ( ... );` reads from `op <op>; table <t>;` (a flowsheet run:"
                   " `unitOp <name>;` / `stream <name>;`) or `ops ( ... );` -- name the source");
        out.push_back(std::move(s));
    }
    return out;
}

//  THE HOME of a view that names no `op` at its top: the one operation every
//  series (or row) of it draws from, when there is exactly one and nothing
//  else -- a view of one op's numbers belongs in that op's folder whether it
//  says `op` once or once per series; a view with a reference, a difference
//  across sources or several ops is about the case and lands in case/.
static Item settledHome(Item it)
{
    if (!it.home.empty()) return it;
    std::string only;
    bool single = true;
    auto take = [&](const std::string& op)
    {
        if (op.empty()) { single = false; return; }
        if (only.empty()) only = op;
        else if (only != op) single = false;
    };
    for (const auto& s : it.series)
    {
        if (s.kind == "op-table") take(s.op);
        else if (s.kind == "ops" && s.ops.size() == 1) take(s.ops.front());
        else if (s.kind == "pairs") single = false;
        else if (s.kind == "difference") continue;     // over series already counted
        else single = false;
    }
    for (const auto& r : it.rows)
    {
        if (r.kind == "op") take(r.op);
        else if (r.kind == "difference") continue;
        else single = false;
    }
    if (single && !only.empty()) it.home = only;
    return it;
}

Item Reader::Impl::parseView(const DictPtr& v, const std::string& at,
                             const std::string& origin, const std::string& home) const
{
    Item it;
    it.origin = origin;
    if (!v->found("name")) refuse(at, "declare `name <word>;`");
    it.name = v->lookupWord("name");
    std::string where = "view '" + it.name + "'";
    if (!isWord(it.name))
        refuse(where, "a name is a word (letters, digits, _): it names the file"
               " postProcessing/<op>/" + it.name + ".csv");
    if (!v->found("type"))
        refuse(where, "declare `type <word>;` -- Accepted: series, profile, parity,"
               " residuals, table");
    it.type = v->lookupWord("type");
    if (it.type != "series" && it.type != "profile" && it.type != "parity"
        && it.type != "residuals" && it.type != "table")
        refuse(where, "`type " + it.type + ";` -- Accepted: series, profile, parity,"
               " residuals, table");
    //  THE HOME of a view is the operation it is about (its folder,
    //  postProcessing/<op>/); a view drawing several operations names none and
    //  lands in postProcessing/case/.
    if (sourceWords(v) > 1)
        refuse(where, "a view's home is ONE of `op`, `unitOp`, `stream`");
    it.home = sourceWords(v) == 1 ? sourceKey(v) : home;
    if (!it.home.empty()) checkOp(it.home, where);
    where = "view '" + (it.home.empty() ? std::string("case") : folderOf(it.home)) + "/" + it.name + "'";
    it.title = v->found("title") ? v->lookupWord("title") : std::string();
    if (v->found("note"))
    {
        it.note = v->lookupWord("note");
        if (it.note.find_first_not_of(" \t\n") == std::string::npos)
            refuse(where, "`note \"\";` is empty -- state the caveat or drop the key");
    }

    if (it.type != "table")
    {
        it.kind = "plot";
        it.xAxis = readAxis(v, "xAxis", where, true);
        it.yAxis = readAxis(v, "yAxis", where, true);
        std::vector<DictPtr> sl;
        if (v->found("series")) sl = v->lookupDictList("series");
        std::vector<Series> shorthand = shorthandSeries(v, where);
        if (!shorthand.empty() && !sl.empty())
            refuse(where, "declare the series EITHER as `y ( ... );` (one per column) OR as"
                   " `series ( { ... } );`, not both -- add more with `overlay ( ... );`");
        for (auto& s : shorthand)
        {
            checkSeries(s, where + ", series '" + s.name + "'", it.series);
            it.series.push_back(std::move(s));
        }
        for (std::size_t j = 0; j < sl.size(); ++j)
        {
            Series s = readSeries(sl[j], where + ", series[" + std::to_string(j) + "]");
            checkSeries(s, where + ", series '" + s.name + "'", it.series);
            if (!s.declaredUnit.empty())
                refuse(where + ", series '" + s.name + "'", "a plot series takes its unit"
                       " from the view's axis; `unit` belongs to a table column");
            it.series.push_back(std::move(s));
        }
        //  `overlay ( <series> ... );` -- the data (an experiment, a reference) set
        //  over the model; a series in the long form, read the same way.
        if (v->found("overlay"))
        {
            const auto ol = v->lookupDictList("overlay");
            for (std::size_t j = 0; j < ol.size(); ++j)
            {
                Series s = readSeries(ol[j], where + ", overlay[" + std::to_string(j) + "]");
                checkSeries(s, where + ", overlay '" + s.name + "'", it.series);
                it.series.push_back(std::move(s));
            }
        }
        if (it.series.empty())
            refuse(where, "a " + it.type + " view draws at least one series -- `y ( ... );`,"
                   " `series ( ... );` or `overlay ( ... );`");
        if (it.title.empty())
        {
            std::string ys;
            for (const auto& s : it.series) ys += (ys.empty() ? "" : ", ") + s.yKey;
            it.title = (it.home.empty() ? std::string() : folderOf(it.home) + ": ") + ys
                     + " against " + it.series.front().xKey;
        }
        return settledHome(std::move(it));
    }

    it.kind = "table";
    const bool seriesShape = v->found("x");
    const bool rowsShape = v->found("rows");
    if (seriesShape == rowsShape)
        refuse(where, "a table is EITHER a series table (`x` and `y ( ... )` or `columns ("
               " <series> ... )`: one row per x value) OR a rows table (`columns ( { name;"
               " label; unit; } ... );` and `rows ( ... );`: one row per record) -- this"
               " one declares " + std::string(seriesShape ? "both" : "neither"));
    if (it.title.empty()) it.title = it.name;
    if (seriesShape)
    {
        it.shape = "series";
        //  `x` is a word (the shorthand's abscissa) or a block naming the axis
        if (v->found("x") && std::holds_alternative<DictPtr>(v->entryValue("x")))
            it.xAxis = readAxis(v, "x", where, false);
        else
            it.xAxis = Axis{ v->found("x") ? v->lookupWord("x") : std::string(), "", "linear" };
        std::vector<Series> shorthand = shorthandSeries(v, where);
        for (auto& s : shorthand)
        {
            checkSeries(s, where + ", column '" + s.name + "'", it.series);
            it.series.push_back(std::move(s));
        }
        if (v->found("columns"))
        {
            const auto cl = v->lookupDictList("columns");
            for (std::size_t j = 0; j < cl.size(); ++j)
            {
                Series s = readSeries(cl[j], where + ", columns[" + std::to_string(j) + "]");
                checkSeries(s, where + ", column '" + s.name + "'", it.series);
                it.series.push_back(std::move(s));
            }
        }
        if (it.series.empty()) refuse(where, "the table has no columns");
        return settledHome(std::move(it));
    }
    it.shape = "rows";
    if (!v->found("columns")) refuse(where, "declare `columns ( { name; label; unit; } ... );`");
    const auto cl = v->lookupDictList("columns");
    if (cl.empty()) refuse(where, "`columns ( );` is empty");
    for (std::size_t j = 0; j < cl.size(); ++j)
    {
        const DictPtr& c = cl[j];
        const std::string cw = where + ", columns[" + std::to_string(j) + "]";
        if (!c->found("name"))
            refuse(cw, "a rows-table column declares `name <word>;` (and optionally"
                   " `label`, and `unit` -- or each row its own `unit`)");
        Column col{ c->lookupWord("name"), "", c->found("unit") ? c->lookupWord("unit") : "" };
        col.label = c->found("label") ? c->lookupWord("label") : col.name;
        if (!isWord(col.name)) refuse(cw, "a column name is a word");
        for (const auto& o : it.columns)
            if (o.name == col.name) refuse(cw, "a second column named '" + col.name + "'");
        it.columns.push_back(col);
    }
    const auto rl = v->lookupDictList("rows");
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
        if (r->found("unit")) row.unit = r->lookupWord("unit");
        bool blockCells = false;
        if (r->found("cells"))
        {
            const DictPtr cs0 = r->subDict("cells");
            for (const auto& c : cs0->keys())
                if (std::holds_alternative<DictPtr>(cs0->entryValue(c))) blockCells = true;
        }
        int n = sourceWords(r);
        if (n > 0)                  { row.kind = "op"; }
        if (blockCells && n == 0)   { n = 1; row.kind = "cells"; }
        else if (blockCells)
            refuse(rw, "a row whose `cells` each name their own source names no `op`, `unitOp`,"
                   " `stream` or `reference` of its own");
        if (r->found("reference"))  { ++n; row.kind = "reference"; }
        if (r->found("difference")) { ++n; row.kind = "difference"; }
        if (n != 1)
            refuse(rw, "a row names exactly ONE source -- `op <op>;` (a flowsheet run:"
                   " `unitOp <name>;` / `stream <name>;`), `reference"
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
                if (row.kind == "cells")
                {
                    if (!std::holds_alternative<DictPtr>(cs->entryValue(c)))
                        refuse(rw, "`cells { " + c + " ...; }` -- in a row whose cells name"
                               " their own source every cell is a block: `{ stream <name>; key"
                               " <diagnostic>; }`, `{ unitOp <name>; key <diagnostic>; }` or `{"
                               " reference <ref>; select { ... }; key <column>; }`");
                    const DictPtr b = cs->subDict(c);
                    CellSrc cell;
                    cell.column = c;
                    if (!b->found("key"))
                        refuse(rw, "cell '" + c + "' declares `key <name>;` -- the published"
                               " number (a diagnostic, or the reference's column)");
                    cell.key = b->lookupWord("key");
                    if (b->found("reference"))
                    {
                        if (sourceWords(b) != 0)
                            refuse(rw, "cell '" + c + "' names ONE source");
                        cell.ref = b->lookupWord("reference");
                        cell.select = readSelect(b, rw);
                        if (cell.select.empty())
                            refuse(rw, "cell '" + c + "' declares `select { ... }`, which must"
                                   " keep exactly one record of the reference");
                        checkRefColumns(refNamed(cell.ref, rw), { cell.key }, cell.select, rw);
                    }
                    else
                    {
                        if (sourceWords(b) != 1)
                            refuse(rw, "cell '" + c + "' names ONE of `op`, `unitOp`, `stream`"
                                   " or `reference`");
                        cell.src = sourceKey(b);
                        checkOp(cell.src, rw);
                    }
                    if (!row.blocks.empty() && row.blocks.front().ref.empty() != cell.ref.empty())
                        refuse(rw, "a row's cells are all measured (a reference) or all computed:"
                               " put the two in two rows and take their difference");
                    row.blocks.push_back(std::move(cell));
                    continue;
                }
                row.cells.push_back({ c, cs->lookupWord(c) });
            }
            if (row.kind == "cells")
            {
                row.role = row.blocks.front().ref.empty() ? "computed"
                         : refNamed(row.blocks.front().ref, rw).role;
            }
            else if (row.kind == "op")
            {
                row.op = sourceKey(r);
                checkOp(row.op, rw);
                row.role = "computed";
            }
            else
            {
                row.ref = r->lookupWord("reference");
                row.select = readSelect(r, rw);
                if (row.select.empty())
                    refuse(rw, "a reference row declares `select { ... }`, which"
                           " must keep exactly one record of the reference");
                const Reference& ref = refNamed(row.ref, rw);
                std::vector<std::string> cols;
                for (const auto& c : row.cells) cols.push_back(c.second);
                checkRefColumns(ref, cols, row.select, rw);
                row.role = ref.role;
            }
        }
        it.rows.push_back(std::move(row));
    }
    return settledHome(std::move(it));
}

namespace {
//  A view nothing reads part of refuses: the views grammar is new, and owes no
//  corpus a tolerance.
void refuseUnread(const Dictionary& d, const std::string& where)
{
    const auto unread = dictAudit::auditTree(d, where);
    if (unread.empty()) return;
    std::string msg = "keys nothing reads:";
    for (const auto& f : unread)
        msg += "\n    " + f.where + ": `" + f.key + "`"
             + (f.suggestion.empty() ? "" : " (did you mean `" + f.suggestion + "`?)");
    refuse(where, msg);
}
}

static const std::vector<std::string>& studyPurposes()
{
    //  codeToCodeVerification  one model, independent implementations
    //  calibratedComparison    against measurements its inputs were fitted to
    //  independentComparison   against measurements its inputs never saw
    //  numericalStudy          discretisation, convergence, a solver's work
    //  demonstration           the method shown, compared with nothing
    static const std::vector<std::string> p{ "codeToCodeVerification",
        "calibratedComparison", "independentComparison", "numericalStudy",
        "demonstration" };
    return p;
}

Reader::Reader(const DictPtr& propsDict, const std::vector<std::string>& declaredOps,
               const std::string& dictName, bool flowsheetRun)
    : impl_(std::make_unique<Impl>())
{
    Impl& I = *impl_;
    I.declaredOps = declaredOps;
    I.dictName = dictName;
    I.namesKnown = !flowsheetRun;
    I.scaleUnits = flowsheetRun;
    g_dictName = "system/" + dictName;
    g_scaleUnits = flowsheetRun;
    if (propsDict->found("references"))
    {
        const auto list = propsDict->lookupDictList("references");
        for (std::size_t k = 0; k < list.size(); ++k)
        {
            Reference r = readReference(list[k], k);
            for (const auto& o : I.refs)
                if (o.name == r.name) refuse("reference '" + r.name + "'", "declared twice");
            I.refs.push_back(std::move(r));
            refuseUnread(*list[k], dictName + " references[" + std::to_string(k) + "]");
        }
    }
    if (propsDict->found("views"))
    {
        const auto list = propsDict->lookupDictList("views");
        for (std::size_t k = 0; k < list.size(); ++k)
        {
            const std::string at = dictName + " views[" + std::to_string(k) + "]";
            Item it = I.parseView(list[k], at, "declared", "");
            for (const auto& o : I.items)
                if (o.home == it.home && o.name == it.name)
                    refuse("view '" + it.name + "'", "a second view named '" + it.name
                           + "' in postProcessing/" + (it.home.empty() ? "case" : folderOf(it.home))
                           + "/ -- both would write one file");
            I.items.push_back(std::move(it));
            refuseUnread(*list[k], at);
        }
    }
    //  STUDIES (DEV.md 4c C154): `studies ( { name; title; purpose; ops ( ...
    //  ); summary; } ... );` -- the case's scientific questions, in the order
    //  it tells them.  Parsed here, before the run, for the same reason the
    //  views are: a study naming an operation the propsDict does not declare
    //  is refuted by the dict alone.
    if (propsDict->found("studies"))
    {
        const auto list = propsDict->lookupDictList("studies");
        std::map<std::string, std::string> owner;   // op -> its study
        for (std::size_t k = 0; k < list.size(); ++k)
        {
            const std::string at = "propsDict studies[" + std::to_string(k) + "]";
            const auto& d = list[k];
            Study st;
            if (!d->found("name")) refuse(at, "declare `name <word>;`");
            st.name = d->lookupWord("name");
            const std::string where = "study '" + st.name + "'";
            if (!isWord(st.name)) refuse(where, "a name is a word (letters, digits, _)");
            for (const auto& o : I.studies)
                if (o.name == st.name) refuse(where, "declared twice");
            if (!d->found("title"))
                refuse(where, "declare `title \"...\";` -- the question the study asks, in words");
            st.title = d->lookupWord("title");
            if (!d->found("purpose"))
                refuse(where, "declare `purpose <word>;` -- Accepted: " + joined(studyPurposes()));
            st.purpose = d->lookupWord("purpose");
            if (std::find(studyPurposes().begin(), studyPurposes().end(), st.purpose)
                == studyPurposes().end())
                refuse(where, "`purpose " + st.purpose + ";` -- Accepted: "
                       + joined(studyPurposes()) + " (a purpose is what the study sets out"
                       " to do; whether it succeeded is the run's verdict, never a word"
                       " declared here)");
            if (d->found("summary")) st.summary = d->lookupWord("summary");
            if (!d->found("ops")) refuse(where, "declare `ops ( <op> ... );` -- the operations"
                                                " that answer it");
            st.ops = d->lookupWordList("ops");
            if (st.ops.empty()) refuse(where, "`ops ( );` is empty");
            for (const auto& op : st.ops)
            {
                if (std::find(I.declaredOps.begin(), I.declaredOps.end(), op)
                    == I.declaredOps.end())
                    refuse(where, "operation '" + op + "' is not an operation of this"
                           " case's propsDict.  Operations: " + joined(I.declaredOps));
                const auto it = owner.find(op);
                if (it != owner.end())
                    refuse(where, "operation '" + op + "' is already in study '"
                           + it->second + "' -- a study is a partition, one question per"
                           " operation");
                owner[op] = st.name;
            }
            refuseUnread(*d, at);
            I.studies.push_back(std::move(st));
        }
    }
}

Reader::~Reader() = default;

namespace {

const Publication& pubNamed(const std::vector<Publication>& pubs, const std::string& op,
                            const std::string& where)
{
    for (const auto& p : pubs) if (p.name == op) return p;
    //  list what DOES exist, in the namespace the view named (a unit, a stream
    //  or an operation), so a typo is corrected from the message
    const std::string prefix = op.rfind("unit:", 0) == 0 ? "unit:"
                             : op.rfind("stream:", 0) == 0 ? "stream:" : "";
    std::vector<std::string> names;
    for (const auto& p : pubs)
    {
        const bool inSpace = prefix.empty() ? p.name.find(':') == std::string::npos
                                            : p.name.rfind(prefix, 0) == 0;
        if (inSpace) names.push_back(p.name.substr(prefix.size()));
    }
    if (!prefix.empty())
        refuse(where, sourceText(op) + " is not " + (prefix == "unit:" ? "a unit operation" : "a stream")
               + " of this run.  " + (prefix == "unit:" ? "Unit operations: " : "Streams: ")
               + joined(names, 80));
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
        refuse(where, sourceText(p.name) + " (" + p.type + ") publishes no diagnostic '"
               + key + "'.  Its diagnostics: " + joined(keys, 80));
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
            refuse(where, sourceText(s.op) + " (" + p.type + ") publishes no table '"
                   + s.table + "'.  Its tables: " + joined(names));
        }
        std::vector<std::string> cols;
        for (const auto& c : tab->columns) cols.push_back(c.name);
        auto col = [&](const std::string& c) -> int
        {
            if (c.empty()) return -1;
            const int i = tab->columnIndex(c);
            if (i < 0)
                refuse(where, "table '" + s.table + "' of " + sourceText(s.op)
                       + " has no column '" + c + "'.  Columns: " + joined(cols));
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
        //  a column of a unit's profile may publish no unit (its name does not say
        //  it): the declared unit is then the author's statement
        s.xPublished = !s.xUnit.empty(); s.yPublished = !s.yUnit.empty();
        s.source = sourceText(s.op) + ", table " + s.table + ": " + s.xKey + ", " + s.yKey
                 + (s.select.empty() ? "" : " where " + selectText(s.select));
        if (s.x.empty())
            refuse(where, "no row of table '" + s.table + "' of " + sourceText(s.op)
                   + " has " + selectText(s.select));
        return;
    }
    if (s.kind == "pairs")
    {
        bool yp = true;
        std::string srcs;
        for (std::size_t k = 0; k < s.pairs.size(); ++k)
        {
            const Pair& pr = s.pairs[k];
            const Reference* r = nullptr;
            for (const auto& rr : refs) if (rr.name == pr.ref) r = &rr;
            const std::vector<std::string>* hit = nullptr;
            int count = 0;
            for (const auto& line : r->cells)
            {
                bool keep = true;
                for (const auto& m : pr.select)
                    if (!matches(m, line[static_cast<std::size_t>(r->column(m.column))])) keep = false;
                if (keep) { ++count; hit = &line; }
            }
            if (count != 1)
                refuse(where, "pairs[" + std::to_string(k) + "]: `select { " + selectText(pr.select)
                       + " }` keeps " + std::to_string(count) + " record(s) of reference '"
                       + pr.ref + "' -- a pair is one record");
            const scalar xv = parseNumber((*hit)[static_cast<std::size_t>(r->column(pr.xCol))]);
            if (!std::isfinite(xv)) { ++s.dropped; continue; }
            const Publication& p = pubNamed(pubs, pr.src, where);
            std::string yu; bool ypub = false;
            const scalar yv = diagOf(p, pr.yKey, where, &yu, &ypub);
            const std::string xu = r->units.at(pr.xCol);
            if (s.x.empty()) { s.xUnit = xu; s.yUnit = yu; }
            else if (xu != s.xUnit || yu != s.yUnit)
                refuse(where, "pairs[" + std::to_string(k) + "] is in different units ('" + xu
                       + "' against '" + yu + "') from the pairs before it ('" + s.xUnit
                       + "' against '" + s.yUnit + "') -- a series is one unit on each axis");
            yp = yp && ypub;
            s.x.push_back(xv); s.y.push_back(yv); s.e.push_back(NaN);
            if (srcs.find(sourceText(pr.src)) == std::string::npos) srcs += (srcs.empty() ? "" : ", ") + sourceText(pr.src);
        }
        if (s.x.empty())
            refuse(where, "no pair carries a number in its reference column");
        s.yPublished = yp;
        s.source = "pairs: measured from reference " + s.pairs.front().ref + " ("
                 + std::string("one record each") + "), computed from " + srcs;
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

//  A TEMPERATURE PUBLISHED IN K MAY BE DRAWN ON AN AXIS DECLARED IN degC (or
//  degF) -- DEV.md 4c C182, Vitor: a student reads a cooling from 55 to 20 C
//  at once, and a change of SCALE needs no model.  The values are rescaled
//  through units::fromSI, the one home of showing a kelvin value in an affine
//  unit, and the series then carries the declared unit; every other pair of
//  units stays held to the declaration (checkUnit refuses).
//
//  A FLOWSHEET RUN scales more than a temperature (C271, g_scaleUnits): a
//  published unit and a declared one of the SAME dimensions and measure, both
//  linear, differ by the ratio of their factors -- a fraction drawn in %, kg/s
//  in kg/h, W in MW_power.  Any other pair stays a refusal (checkUnit).
bool linearRatio(const std::string& from, const std::string& to, scalar& ratio)
{
    const auto a = units::lookupUnit(from), b = units::lookupUnit(to);
    if (!a || !b || a->affine || b->affine || !(a->dims == b->dims)
        || std::string(a->measure) != std::string(b->measure) || b->factor == 0.0)
        return false;
    ratio = a->factor / b->factor;
    return true;
}

void toAffineTemperature(std::vector<scalar>& v, std::string& unit, bool isPublished,
                         const std::string& declared)
{
    if (!isPublished || declared.empty() || unit == declared) return;
    if (unit != "K")
    {
        scalar ratio = 1.0;
        if (!g_scaleUnits || !linearRatio(unit, declared, ratio)) return;
        for (auto& x : v) x *= ratio;
        unit = declared;
        return;
    }
    const auto spec = units::lookupUnit(declared);
    if (!spec) return;
    if (!spec->affine)
    {
        //  K to a linear temperature unit (a flowsheet run only): none is registered
        //  beyond K itself, so there is nothing to scale.
        return;
    }
    for (auto& x : v) x = units::fromSI(x, declared);
    unit = declared;
}

//  One number, scaled from the unit it is published in to the unit a table
//  column declares (rows tables); the unit is unchanged where it cannot scale.
scalar scaledTo(scalar v, std::string& unit, bool isPublished, const std::string& declared)
{
    std::vector<scalar> one{ v };
    toAffineTemperature(one, unit, isPublished, declared);
    return one.front();
}

void checkUnit(const std::string& published, bool isPublished, const std::string& declared,
               const std::string& what, const std::string& where)
{
    if (isPublished && !declared.empty() && published != declared)
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

//  THE DEFAULT VIEWS ANY FIT EARNS, from what it published -- one home, so an
//  operation that publishes a `fitPoints` table (measured, model, residual
//  beside its abscissae) and fit.<p>.value diagnostics gets the same parity,
//  residuals and parameter table as every other fit, whatever it fits.
static std::string genericDefaultViews(const Publication& pub)
{
    std::string out;
    for (const auto& tab : pub.tables)
    {
        if (tab.name != "fitPoints") continue;
        if (tab.columnIndex("measured") < 0 || tab.columnIndex("model") < 0
            || tab.columnIndex("residual") < 0 || tab.columns.size() < 5)
            continue;
        const std::string abscissa = tab.columns[1].name;
        //  A TABLE THAT MARKS ITS HELD-OUT ROWS draws them as what they are
        //  (DEV.md 4c C172 item 6): the model PREDICTING evidence the fit never
        //  saw, never "fitted".  Split only when both kinds of row exist (a
        //  `select` that keeps no row refuses).
        const int hi = tab.columnIndex("heldOut");
        bool anyFit = false, anyHeld = false;
        if (hi >= 0)
            for (const auto& row : tab.rows)
                (row[hi] > 0.5 ? anyHeld : anyFit) = true;
        if (anyFit && anyHeld)
        {
            out += "{ name parity; type parity; title \"" + pub.name + ": the model against the measured"
                   " -- fitted points, and held-out points it PREDICTED\";"
                   " xAxis { label \"measured\"; } yAxis { label \"model\"; }"
                   " series ( { name points; label \"fitted points\"; op " + pub.name
                 + "; table fitPoints; select { heldOut 0; } x measured; y model; style markers; }"
                   " { name heldOut; label \"held-out points (predicted)\"; op " + pub.name
                 + "; table fitPoints; select { heldOut 1; } x measured; y model; style markers; } ); }\n";
            out += "{ name residuals; type residuals; title \"" + pub.name + ": residual (model - measured)"
                   " against " + abscissa + "\"; yAxis { label \"residual\"; }"
                   " series ( { name residual; label \"fitted - measured\"; op " + pub.name
                 + "; table fitPoints; select { heldOut 0; } x " + abscissa + "; y residual; style markers; }"
                   " { name heldOutResidual; label \"predicted - measured (held out)\"; op " + pub.name
                 + "; table fitPoints; select { heldOut 1; } x " + abscissa + "; y residual; style markers; } ); }\n";
            continue;
        }
        out += "{ name parity; type parity; title \"" + pub.name + ": fitted against measured\";"
               " xAxis { label \"measured\"; } yAxis { label \"fitted\"; }"
               " series ( { name points; label \"data against the fitted model\"; op " + pub.name
             + "; table fitPoints; x measured; y model; style markers; } ); }\n";
        out += "{ name residuals; type residuals; title \"" + pub.name + ": residual (fitted - measured)"
               " against " + abscissa + "\"; yAxis { label \"residual\"; }"
               " series ( { name residual; label \"fitted - measured\"; op " + pub.name
             + "; table fitPoints; x " + abscissa + "; y residual; style markers; } ); }\n";
    }
    std::vector<std::string> params;
    for (const auto& kv : pub.diagnostics)
    {
        const std::string& k = kv.first;
        if (k.size() > 10 && k.rfind("fit.", 0) == 0 && k.compare(k.size() - 6, 6, ".value") == 0)
            params.push_back(k.substr(4, k.size() - 10));
    }
    //  index-keyed parameters (fit.0, fit.1, ...) in the order they were declared
    auto index = [](const std::string& s) -> long
    {
        return (!s.empty() && s.find_first_not_of("0123456789") == std::string::npos)
             ? std::stol(s) : -1;
    };
    std::stable_sort(params.begin(), params.end(), [&](const std::string& a, const std::string& b)
    {
        const long ia = index(a), ib = index(b);
        return (ia >= 0 && ib >= 0) ? ia < ib : false;
    });
    if (!params.empty())
    {
        out += "{ name parameters; type table; title \"" + pub.name + ": fitted parameters --"
               " value, standard error and 95 % confidence half-width\";"
               " columns ( { name value; label \"value\"; } { name stderr; label \"standard error\"; }"
               " { name ci95; label \"95 % half-width\"; } ); rows ( ";
        for (const auto& pnm : params)
        {
            //  a row name is a word: a parameter keyed by its index (fit.0.value)
            //  becomes p0, and its LABEL is what the op says it is (its path)
            std::string word = std::isalpha(static_cast<unsigned char>(pnm[0])) ? "" : "p";
            for (const char c : pnm) word += (std::isalnum(static_cast<unsigned char>(c)) ? c : '_');
            const auto u = pub.units.find("fit." + pnm + ".value");
            const auto lb = pub.labels.find("fit." + pnm + ".value");
            const std::string label = lb != pub.labels.end() ? lb->second : pnm;
            out += "{ name " + word + "; label \"" + label + "\";";
            if (u != pub.units.end() && !u->second.empty()) out += " unit \"" + u->second + "\";";
            out += " op " + pub.name + "; cells { value fit." + pnm + ".value;";
            if (pub.diagnostics.count("fit." + pnm + ".stderr")) out += " stderr fit." + pnm + ".stderr;";
            if (pub.diagnostics.count("fit." + pnm + ".ci95")) out += " ci95 fit." + pnm + ".ci95;";
            out += " } } ";
        }
        out += "); }\n";
    }
    return out;
}

std::string Reader::evaluate(const std::vector<Publication>& pubs, int verbosity)
{
    Impl& I = *impl_;
    clearStale();

    //  THE DEFAULT VIEWS, from what each operation published (DEV.md 4c C149):
    //  the op's own (PropertyOperation::defaultViews, written in this grammar)
    //  and the generic ones any fit earns (parity and residuals from a
    //  `fitPoints` table, the parameter table from its fit.<p>.* diagnostics).
    //  A DECLARED view of the same name in the same folder replaces a default,
    //  said once.  The defaults come first: an operation's own figures, then
    //  what the case added.
    std::vector<Item> defaults;
    //  each op's default declarations, as text, carried on the result block: a
    //  reader (a gate, a student) sees the very entries that drew its figures
    std::vector<std::pair<std::string, std::string>> declarations;
    for (const auto& pub : pubs)
    {
        const std::string text = pub.defaultViews + genericDefaultViews(pub);
        if (text.empty()) continue;
        declarations.push_back({ pub.name, text });
        const DictPtr d = Dictionary::fromString("views ( " + text + " );",
                                                 "default views of " + pub.name);
        const auto list = d->lookupDictList("views");
        for (std::size_t k = 0; k < list.size(); ++k)
        {
            Item it = I.parseView(list[k], "default view of operation '" + pub.name + "'",
                                  "default", pub.name);
            const bool replaced = std::any_of(I.items.begin(), I.items.end(),
                [&](const Item& o) { return o.home == it.home && o.name == it.name; });
            if (replaced)
            {
                std::cout << "  [views] " << pub.name << "/" << it.name << ": the propsDict"
                             " declares a view of this name -- it replaces the default\n";
                continue;
            }
            defaults.push_back(std::move(it));
        }
    }
    I.items.insert(I.items.begin(), std::make_move_iterator(defaults.begin()),
                   std::make_move_iterator(defaults.end()));
    std::vector<std::string> written;
    if (I.items.empty()) return std::string();
    g_dictName = "system/" + I.dictName;
    g_scaleUnits = I.scaleUnits;

    std::cout << "\n========  Views (" << I.dictName << "'s `views` + each operation's defaults)  ========\n"
              << "  " << I.items.size() << " view(s) -> " << outputDir() << "/<op>/<view>.csv"
              << " (+ .json: titles, units, series roles and sources)\n";
    if (verbosity >= 2)
        for (const auto& st : I.studies)
            std::cout << "  study " << st.name << " (" << st.purpose << ", "
                      << st.ops.size() << " operation(s)): " << st.title << "\n";

    std::ostringstream block;
    block << "{ \"source\": " << q("system/" + I.dictName + " views"
                                   + std::string(I.namesKnown ? " + operation defaults" : ""))
          << ", \"directory\": "
          << q(outputDir()) << ",\n    \"references\": [";
    for (std::size_t k = 0; k < I.refs.size(); ++k)
    {
        const auto& r = I.refs[k];
        block << (k ? "," : "") << "\n      { \"name\": " << q(r.name) << ", \"file\": "
              << q(r.file) << ", \"role\": " << q(r.role) << ", \"citation\": "
              << q(r.citation) << " }";
    }
    block << "\n    ],\n    \"defaults\": [";
    for (std::size_t k = 0; k < declarations.size(); ++k)
        block << (k ? "," : "") << "\n      { \"op\": " << q(declarations[k].first)
              << ", \"declaration\": " << q(declarations[k].second) << " }";
    block << "\n    ],\n    \"items\": [";

    for (std::size_t n = 0; n < I.items.size(); ++n)
    {
        Item& it = I.items[n];
        const std::string folder = it.home.empty() ? std::string("case") : folderOf(it.home);
        const std::string dir = std::string(outputDir()) + "/" + folder;
        const std::string where = "view '" + folder + "/" + it.name + "'";
        const std::string file = dir + "/" + it.name + ".csv";
        //  The `file` this unit READS is a reference's input; what it WRITES
        //  is this CSV and its sidecar, under the case's postProcessing/.  A
        //  case run from inside the catalogue must not write there either.
        records::refuseStandardsWrite(where, "view", file);
        {
            std::error_code ec;
            fs::create_directories(dir, ec);
            if (ec) refuse(where, "cannot create " + dir + ": " + ec.message());
        }
        if (!it.home.empty()) pubNamed(pubs, it.home, where);   // the view's own source exists in this run
        std::ostringstream js;
        js << "{ \"name\": " << q(it.name) << ", \"op\": " << q(it.home)
           << ", \"origin\": " << q(it.origin) << ", \"type\": " << q(it.type)
           << ", \"kind\": " << q(it.kind);
        if (it.kind == "table") js << ", \"shape\": " << q(it.shape);
        js << ", \"title\": " << q(it.title);
        if (!it.note.empty()) js << ", \"note\": " << q(it.note);
        js << ", \"file\": " << q(file);

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
                //  An axis that names no unit takes the one its series PUBLISH; the
                //  next series is then held to it like a declared one.
                if (it.xAxis.unit.empty() && s.xPublished && s.kind != "difference")
                    it.xAxis.unit = s.xUnit;
                if (it.kind == "plot" && it.yAxis.unit.empty() && s.yPublished
                    && s.kind != "difference")
                    it.yAxis.unit = s.yUnit;
                if (it.xAxis.label.empty()) it.xAxis.label = s.xKey;
                if (it.kind == "plot" && it.yAxis.label.empty())
                    it.yAxis.label = it.series.size() == 1 ? s.yKey : std::string();
                toAffineTemperature(s.x, s.xUnit, s.xPublished, it.xAxis.unit);
                checkUnit(s.xUnit, s.xPublished, it.xAxis.unit, "x ('" + s.xKey + "')", sw);
                const std::string yDecl = it.kind == "plot" ? it.yAxis.unit
                                        : (s.declaredUnit.empty() ? s.yUnit : s.declaredUnit);
                if (it.kind == "table" && s.declaredUnit.empty() && !s.yPublished)
                    refuse(sw, "the source publishes no unit for '" + s.yKey + "' -- declare"
                           " the column's `unit`");
                if (it.kind == "plot")
                    toAffineTemperature(s.y, s.yUnit, s.yPublished, yDecl);
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
                    std::cout << "  [views] " << sw << ": its source publishes no unit for "
                              << (!s.xPublished ? "'" + s.xKey + "'" : std::string())
                              << (!s.xPublished && !s.yPublished ? " and " : "")
                              << (!s.yPublished ? "'" + s.yKey + "'" : std::string())
                              << " -- the declared unit is taken as the author's statement\n";
                if (s.dropped > 0)
                    std::cout << "  [views] " << sw << ": " << s.dropped << " row(s) of the"
                                 " reference carry no number on an axis and are not drawn\n";
            }
        }

        if (it.type == "parity" && it.xAxis.unit != it.yAxis.unit)
            refuse(where, "a parity view sets a model against what it models: x is in '"
                   + it.xAxis.unit + "' and y in '" + it.yAxis.unit + "'");
        if (it.kind == "plot")
        {
            if (it.yAxis.label.empty())
            {
                std::string ys;
                for (const auto& s : it.series) if (s.kind != "difference") ys += (ys.empty() ? "" : ", ") + s.yKey;
                it.yAxis.label = ys;
            }
            csv << "series,x,y,yError\n";
            for (const auto& s : it.series)
                for (std::size_t i = 0; i < s.x.size(); ++i)
                    csv << s.name << "," << cell(s.x[i]) << "," << cell(s.y[i]) << ","
                        << cell(s.e[i]) << "\n";
            auto rangeJson = [](const Axis& a)
            {
                std::string r;
                if (std::isfinite(a.lo)) r += ", \"min\": " + jsonNumber(a.lo);
                if (std::isfinite(a.hi)) r += ", \"max\": " + jsonNumber(a.hi);
                return r;
            };
            js << ", \"xAxis\": { \"label\": " << q(it.xAxis.label) << ", \"unit\": "
               << q(it.xAxis.unit) << ", \"scale\": " << q(it.xAxis.scale) << rangeJson(it.xAxis) << " }"
               << ", \"yAxis\": { \"label\": " << q(it.yAxis.label) << ", \"unit\": "
               << q(it.yAxis.unit) << ", \"scale\": " << q(it.yAxis.scale) << rangeJson(it.yAxis) << " }"
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
            std::cout << "  " << std::left << std::setw(10) << it.type
                      << std::setw(40) << (folder + "/" + it.name)
                      << std::right << it.series.size() << " series -- " << it.title
                      << (it.origin == "default" ? "  (default)" : "") << "\n";
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
                        scalar v = diagOf(p, key, rw, &u, &pub);
                        const std::size_t k = colIdx(c);
                        v = scaledTo(v, u, pub, row.unit.empty() ? it.columns[k].unit : row.unit);
                        checkUnit(u, pub, row.unit.empty() ? it.columns[k].unit : row.unit,
                                  "'" + key + "'", rw);
                        if (row.unit.empty() && it.columns[k].unit.empty() && pub) row.unit = u;
                        row.values[k] = v;
                    }
                    row.source = sourceText(row.op);
                }
                else if (row.kind == "cells")
                {
                    std::string srcs;
                    for (const auto& cell : row.blocks)
                    {
                        const std::size_t k = colIdx(cell.column);
                        const std::string decl = row.unit.empty() ? it.columns[k].unit : row.unit;
                        if (!cell.ref.empty())
                        {
                            const Reference* r = nullptr;
                            for (const auto& rr : I.refs) if (rr.name == cell.ref) r = &rr;
                            const std::vector<std::string>* hit = nullptr;
                            int count = 0;
                            for (const auto& line : r->cells)
                            {
                                bool keep = true;
                                for (const auto& m : cell.select)
                                    if (!matches(m, line[static_cast<std::size_t>(r->column(m.column))])) keep = false;
                                if (keep) { ++count; hit = &line; }
                            }
                            if (count != 1)
                                refuse(rw, "cell '" + cell.column + "': `select { " + selectText(cell.select)
                                       + " }` keeps " + std::to_string(count) + " record(s) of"
                                       " reference '" + cell.ref + "' -- a cell is one record");
                            std::string ru = r->units.at(cell.key);
                            const scalar rv = scaledTo(
                                parseNumber((*hit)[static_cast<std::size_t>(r->column(cell.key))]),
                                ru, true, decl);
                            checkUnit(ru, true, decl, "'" + cell.key + "'", rw);
                            row.values[k] = rv;
                            if (srcs.find(cell.ref) == std::string::npos)
                                srcs += (srcs.empty() ? "" : ", ") + std::string("reference ") + cell.ref;
                        }
                        else
                        {
                            const Publication& p = pubNamed(pubs, cell.src, rw);
                            std::string u; bool pub = false;
                            scalar v = diagOf(p, cell.key, rw, &u, &pub);
                            v = scaledTo(v, u, pub, decl);
                            checkUnit(u, pub, decl, "'" + cell.key + "'", rw);
                            row.values[k] = v;
                            if (srcs.find(sourceText(cell.src)) == std::string::npos)
                                srcs += (srcs.empty() ? "" : ", ") + sourceText(cell.src);
                        }
                    }
                    row.source = srcs;
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
                        std::string ru = r->units.at(col);
                        const scalar rv = scaledTo(parseNumber((*hit)[r->column(col)]), ru, true,
                                                   row.unit.empty() ? it.columns[k].unit : row.unit);
                        checkUnit(ru, true, row.unit.empty() ? it.columns[k].unit : row.unit,
                                  "'" + col + "'", rw);
                        row.values[k] = rv;
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
                   << q(row.source) << ", \"unit\": " << q(row.unit)
                   << ", \"relative\": " << (row.relative ? "true" : "false") << " }";
            }
            js << "] }";
            printTable(it.title, head, body);
        }
        csv.close();
        const std::string sidecar = dir + "/" + it.name + ".json";
        written.push_back(file);
        written.push_back(sidecar);
        std::ofstream side(sidecar);
        if (!side) refuse(where, "cannot write " + sidecar);
        side << js.str() << "\n";
        block << (n ? "," : "") << "\n      " << js.str();
    }
    block << "\n    ] }";
    {
        std::ofstream idx(indexFile());
        idx << "# the view files the last run wrote -- removed by the next (a run output)\n";
        for (const auto& f : written) idx << f << "\n";
    }
    std::cout << "=====================================================\n";
    return block.str();
}

//  A DERIVATIVE view must not outlive its declaration: every file the last run
//  wrote is listed in postProcessing/views.index and removed before the next
//  writes, with the folders it leaves empty -- never anything it did not write.
void clearStale()
{
    std::ifstream idx(indexFile());
    std::string line;
    std::set<std::string> dirs;
    while (std::getline(idx, line))
    {
        if (line.empty() || line[0] == '#') continue;
        if (line.rfind(std::string(outputDir()) + "/", 0) != 0 || line.find("..") != std::string::npos)
            continue;
        std::error_code ec;
        fs::remove(line, ec);
        dirs.insert(fs::path(line).parent_path().string());
    }
    idx.close();
    std::error_code ec;
    for (const auto& d : dirs)
        if (fs::is_directory(d, ec) && fs::is_empty(d, ec)) fs::remove(d, ec);
    fs::remove(indexFile(), ec);
    if (fs::is_directory(outputDir(), ec) && fs::is_empty(outputDir(), ec))
        fs::remove(outputDir(), ec);
}

} // namespace views
} // namespace Choupo
