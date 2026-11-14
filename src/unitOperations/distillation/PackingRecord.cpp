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
\*---------------------------------------------------------------------------*/

#include "PackingRecord.H"

#include "core/Dimensions.H"
#include "core/RegistryRefusal.H"
#include "core/RegistryScan.H"
#include "thermo/Database.H"
#include "thermo/RecordResolver.H"

#include <algorithm>
#include <filesystem>
#include <iostream>
#include <map>
#include <mutex>
#include <set>
#include <sstream>
#include <stdexcept>

namespace Choupo
{

namespace fs = std::filesystem;

namespace
{

//  The two correlations the engine ships for a corrugated structured packing
//  and the per-packing constants each may carry in a record.  Delft has no
//  per-packing constant (Fair et al. 2000, Tables 2 and 4: geometry only).
const std::map<std::string, std::vector<std::string>>& correlationConstants()
{
    static const std::map<std::string, std::vector<std::string>> c = {
        { "RochaBravoFair", { "surfaceEnhancement" } },
        { "Delft",          { } },
    };
    return c;
}

bool isLength(const std::string& f)
{
    return f == "corrugationSide" || f == "corrugationBase"
        || f == "corrugationHeight" || f == "elementHeight";
}

std::string unitLabel(const std::string& f)
{
    if (f == "specificArea")     return " m2/m3";
    if (f == "corrugationAngle") return " deg";
    if (isLength(f))             return " m";
    return "";
}

//  What each field IS, for a refusal that names it.
std::string meaning(const std::string& f)
{
    if (f == "specificArea")       return "the specific geometric area a_p, m2/m3";
    if (f == "voidFraction")       return "the void fraction";
    if (f == "corrugationAngle")   return "the corrugation angle from the horizontal, deg";
    if (f == "corrugationSide")    return "the corrugation side S, m";
    if (f == "corrugationBase")    return "the corrugation base b, m";
    if (f == "corrugationHeight")  return "the corrugation (crimp) height h, m";
    if (f == "elementHeight")      return "the height of one packing element h_pe, m";
    if (f == "holeFraction")       return "the fraction of the surface occupied by holes, Omega";
    if (f == "surface")            return "the surface, gauze or sheetMetal";
    if (f == "surfaceEnhancement") return "Rocha-Bravo-Fair's surface-enhancement factor F_SE of a"
                                          " sheet-metal packing (1996 Eq 10 and Table 1), a constant of"
                                          " the packing under that correlation";
    return f;
}

//  The range a geometry value must lie in, wherever it is written: in a
//  record, under `installed {}`, borrowed, or inline in `packing {}` (PK-03).
bool inRange(const std::string& f, scalar v)
{
    if (f == "voidFraction")     return v > 0.0 && v < 1.0;
    if (f == "holeFraction")     return v >= 0.0 && v < 1.0;
    if (f == "corrugationAngle") return v > 0.0 && v < 90.0;
    return v > 0.0;
}

void requireInRange(const std::string& locus, const std::string& f, scalar v)
{
    if (!inRange(f, v))
    {
        std::ostringstream o;
        o << locus << ": `" << f << "` = " << v << " is outside its range ("
          << meaning(f) << (f == "voidFraction" ? ", between 0 and 1" : "")
          << (f == "holeFraction" ? ", from 0 to below 1" : "")
          << (f == "corrugationAngle" ? ", between 0 and 90 deg" : "")
          << ").";
        throw std::runtime_error(o.str());
    }
}

//  The fields each correlation reads (Rocha-Bravo-Fair 1993 Eqs 23-25 and
//  1996 Eqs 5-14; Fair et al. 2000 Tables 2 and 4, as in PackingRBF.H and
//  PackingDelft.H).  The surface and F_SE of Rocha-Bravo-Fair are handled
//  beside this list.
std::vector<std::string> fieldsRead(const std::string& model)
{
    if (model == "RochaBravoFair")
        return { "specificArea", "voidFraction", "corrugationAngle", "corrugationSide" };
    if (model == "Delft")
        return { "specificArea", "voidFraction", "corrugationAngle", "corrugationBase",
                 "corrugationHeight", "elementHeight", "holeFraction" };
    return {};
}

std::string joined(const std::vector<std::string>& v)
{
    std::string s;
    for (std::size_t i = 0; i < v.size(); ++i) s += (i ? ", " : "") + v[i];
    return s;
}

std::map<std::string, PackingRecord>& registry()
{
    static std::map<std::string, PackingRecord> r;
    return r;
}

} // anonymous namespace


// ===========================================================================
//  The record
// ===========================================================================
void PackingRecord::read(const DictPtr& d, const std::string& sourcePath)
{
    sourcePath_ = sourcePath;
    const std::string locus = "packing record '" + sourcePath + "'";
    if (!d->found("name"))
        throw std::runtime_error(locus + ": no `name` entry.");
    name_ = d->lookupWord("name");

    if (!d->found("arrangement"))
        throw std::runtime_error(locus + ": no `arrangement` -- declare `arrangement"
            " structured;` (a corrugated or lamella packing laid in elements) or"
            " `arrangement random;` (dumped pieces).");
    arrangement_ = d->lookupWord("arrangement");
    if (arrangement_ != "structured" && arrangement_ != "random")
        throw std::runtime_error(locus + ": " + registryRefusal::message(
            "packing arrangement", arrangement_, {"structured", "random"}, "Accepted"));

    //  Every top-level key is one the reader knows: a misspelt field would
    //  otherwise sit in the record, unread, while a correlation refused for
    //  its absence.
    std::set<std::string> known = { "name", "kind", "arrangement", "surface",
                                    "correlations", "provenance" };
    for (const auto& f : packingRecord::geometryFields()) known.insert(f);
    for (const auto& k : d->keys())
        if (!known.count(k))
        {
            std::vector<std::string> list(known.begin(), known.end());
            throw std::runtime_error(locus + ": " + registryRefusal::message(
                "packing record key", k, list, "Accepted"));
        }

    for (const auto& f : packingRecord::geometryFields())
    {
        if (!d->found(f)) continue;
        const scalar v = isLength(f) ? d->lookupScalar(f, Dims::length) : d->lookupScalar(f);
        requireInRange(locus, f, v);
        geometry_[f] = v;
    }
    if (d->found("surface"))
    {
        surface_ = d->lookupWord("surface");
        if (surface_ != "gauze" && surface_ != "sheetMetal")
            throw std::runtime_error(locus + ": " + registryRefusal::message(
                "packing surface", surface_, {"gauze", "sheetMetal"}, "Accepted"));
    }

    if (d->found("correlations"))
    {
        auto c = d->subDict("correlations");
        for (const auto& model : c->keys())
        {
            auto it = correlationConstants().find(model);
            if (it == correlationConstants().end())
                throw std::runtime_error(locus + ": `correlations { " + model + " }`: "
                    + registryRefusal::message("packing correlation", model,
                        {"RochaBravoFair", "Delft"}, "Accepted"));
            auto m = c->subDict(model);
            for (const auto& k : m->keys())
            {
                if (std::find(it->second.begin(), it->second.end(), k) == it->second.end())
                    throw std::runtime_error(locus + ": `correlations { " + model + " { " + k
                        + " } }`: " + (it->second.empty()
                            ? model + " has no per-packing constant (geometry only)."
                            : registryRefusal::message(model + " packing constant", k,
                                                       it->second, "Accepted")));
                const scalar v = m->lookupScalar(k);
                if (!(v > 0.0))
                    throw std::runtime_error(locus + ": `" + model + "." + k + "` must be positive.");
                constants_[model][k] = v;
            }
        }
    }

    //  Provenance: one source for the record, and optionally one entry per
    //  value (a field, `surface`, or a correlation's constants).  An ESTIMATE
    //  carries its review status and the note saying how to verify it (the
    //  contract of the membrane-module and stack records).
    if (!d->found("provenance"))
        throw std::runtime_error(locus + ": no `provenance { source \"...\"; }` -- every"
            " value in an asset record says where it was read.");
    auto pv = d->subDict("provenance");
    if (!pv->found("source"))
        throw std::runtime_error(locus + ": `provenance {}` has no `source`.");
    for (const auto& k : pv->keys())
    {
        if (k == "source") { (void)pv->lookupWord(k); continue; }
        const bool stated = geometry_.count(k) || (k == "surface" && !surface_.empty())
                         || constants_.count(k);
        if (!stated)
            throw std::runtime_error(locus + ": `provenance { " + k + " }` describes a"
                " value the record does not state.");
        auto e = pv->subDict(k);
        Provenance p;
        p.origin       = e->lookupWordOrDefault("origin", "");
        p.method       = e->lookupWordOrDefault("method", "");
        p.notes        = e->lookupWordOrDefault("notes", "");
        p.reviewStatus = e->lookupWordOrDefault("reviewStatus", "");
        if (p.origin != "literature" && p.origin != "estimated")
            throw std::runtime_error(locus + ": `provenance { " + k + " { origin "
                + p.origin + "; } }`: " + registryRefusal::message("origin", p.origin,
                    {"literature", "estimated"}, "Accepted"));
        if (p.origin == "estimated" && (p.notes.empty() || p.reviewStatus.empty()))
            throw std::runtime_error(locus + ": `" + k + "` is an ESTIMATE without"
                " `notes` (how to verify it) or `reviewStatus`; an estimate is"
                " marked, explained and reviewed, or it is not written.");
        provenance_[k] = p;
    }
}

bool PackingRecord::hasConstant(const std::string& model, const std::string& key) const
{
    auto it = constants_.find(model);
    return it != constants_.end() && it->second.count(key) > 0;
}

scalar PackingRecord::constant(const std::string& model, const std::string& key) const
{
    return constants_.at(model).at(key);
}

const PackingRecord::Provenance* PackingRecord::provenanceOf(const std::string& field) const
{
    auto it = provenance_.find(field);
    return it == provenance_.end() ? nullptr : &it->second;
}

std::string PackingRecord::where() const
{
    const fs::path p(sourcePath_);
    const bool catalogue = sourcePath_.find("standards/assets") != std::string::npos;
    return (catalogue ? "catalogue " : "case constant/assets/") + p.filename().string();
}


// ===========================================================================
//  The registry
// ===========================================================================
void PackingRegistry::loadFrom(const std::string& dataRoot)
{
    auto scan = [&](const fs::path& dir, records::ScanGuard& guard)
    {
        if (!fs::exists(dir)) return;
        for (auto& e : fs::directory_iterator(dir))
        {
            if (!e.is_regular_file()) continue;
            if (e.path().extension() != ".dat") continue;
            auto rec = Dictionary::fromFile(e.path().string());
            if (rec->lookupWordOrDefault("kind", "") != "packing") continue;
            PackingRecord p;
            p.read(rec, e.path().string());
            //  The seal mirrors a record by its FILE name and the registry
            //  finds it by its `name` (PK-08): the two must be one word, or a
            //  case runs unsealed and cannot be sealed.
            if (p.name() != e.path().stem().string())
                throw std::runtime_error("packing record '" + e.path().string()
                    + "': `name " + p.name() + ";` differs from the file name '"
                    + e.path().stem().string() + "'.  A record's name is its file's"
                    " name (the seal copies it by that name); rename one of them.");
            guard.claim(p.name(), e.path().string());
            registry()[p.name()] = std::move(p);
        }
    };
    if (!dataRoot.empty())
    {
        records::ScanGuard guard("PackingRegistry", "packing");
        scan(fs::path(dataRoot) / "standards" / "assets", guard);
    }
    {
        //  One guard over every case-local directory (the CatalystRegistry
        //  rule): a name is a record's identity across the whole case.
        records::ScanGuard guard("PackingRegistry", "packing");
        for (const auto& d : records::localScanDirs("assets")) scan(d, guard);
    }
}

const PackingRecord& PackingRegistry::byName(const std::string& name,
                                             const std::string& locus)
{
    auto it = registry().find(name);
    if (it == registry().end())
    {
        std::string avail;
        for (const auto& kv : registry()) avail += " " + kv.first;
        throw std::runtime_error(locus + ": unknown packing record '" + name
            + "'.  Loaded:" + (avail.empty()
                ? std::string(" (none -- no `kind packing;` record was found in"
                  " data/standards/assets/ or in the case's constant/assets/)")
                : avail)
            + ".  A packing the catalogue does not hold is declared by the case in"
              " constant/assets/<name>.dat with `kind packing;`, its nominal"
              " geometry and its source.");
    }
    return it->second;
}


// ===========================================================================
//  The column's side
// ===========================================================================
namespace packingRecord
{

const std::vector<std::string>& geometryFields()
{
    static const std::vector<std::string> f = {
        "specificArea", "voidFraction", "corrugationAngle", "corrugationSide",
        "corrugationBase", "corrugationHeight", "elementHeight", "holeFraction" };
    return f;
}

DictPtr resolveUnit(const DictPtr& unitDict, int /*verbosity*/)
{
    if (!unitDict->found("operation")) return nullptr;
    auto oper = unitDict->subDict("operation");
    if (!oper->found("packing")) return nullptr;
    auto pk = oper->subDict("packing");
    if (!pk->found("record")) return nullptr;

    //  The registry is loaded on the first record a column names, from the
    //  catalogue root the rest of the run resolves through (Database), then
    //  the case's own constant/assets/ -- not at start-up, so a run that
    //  names no packing record scans nothing more than it did before.
    static std::once_flag loaded;
    std::call_once(loaded, [] { PackingRegistry::loadFrom(Database::currentRoot()); });

    const std::string unit  = unitDict->name();
    const std::string locus = "DistillationColumn '" + unit + "': packing";
    const std::string recName = pk->lookupWord("record");
    const PackingRecord& rec = PackingRegistry::byName(recName, locus);
    const std::string recAt = "record '" + recName + "' (" + rec.where() + ")";

    if (rec.arrangement() != "structured")
        throw std::runtime_error(locus + " " + recAt + " is a RANDOM packing; the"
            " engine's packing correlations (RochaBravoFair, Delft) are models of a"
            " corrugated STRUCTURED packing, and no random-packing correlation is"
            " implemented.  The record kind holds a random packing; a column cannot"
            " use one yet.");

    //  A value typed beside `record` would override the record in silence.
    std::vector<std::string> recordOwned = geometryFields();
    recordOwned.push_back("surface");
    recordOwned.push_back("surfaceEnhancement");
    //  What each kind of value may become (PK-02), and the refusal says only
    //  what the reader accepts:
    //    * a geometry value: installed (measured on this bed) or borrowed;
    //    * the surface: a property of the PRODUCT -- gauze is not measured on
    //      a bed nor lent by another packing -- so neither; the remedy is a
    //      record whose surface it is;
    //    * F_SE: a constant of a packing under one correlation, so a record's
    //      value; borrowable from another record, never "installed".
    for (const auto& f : recordOwned)
        if (pk->found(f))
        {
            std::string remedy;
            if (f == "surface")
                remedy = "  The surface is a property of the packing itself: it is"
                         " the record's, and is neither installed nor borrowed.  A"
                         " bed of another surface is another packing -- name the"
                         " record whose surface it is.";
            else if (f == "surfaceEnhancement")
                remedy = "  F_SE is a constant of a packing under Rocha-Bravo-Fair:"
                         " the record's value, or another packing's under `borrowed"
                         " { surfaceEnhancement { from <record>; reason \"...\"; } }`"
                         " (a hypothesis of the case, printed as such).  It is not"
                         " measured on a bed, so it is never `installed`.";
            else
                remedy = "  With a record the nominal value is the record's; a value"
                         " MEASURED on this installation goes under `installed { "
                         + f + " ...; source \"where it was measured\"; }`, a value"
                         " taken from another packing under `borrowed { " + f
                         + " { from <record>; reason \"...\"; } }` -- both printed as"
                         " replacing the record.";
            throw std::runtime_error(locus + ": `" + f + "` is typed beside `record "
                + recName + ";`." + remedy);
        }

    //  An unknown correlation word is refused FIRST, with the inline form's
    //  message (PK-01): every check below is about what a KNOWN correlation
    //  reads, and would otherwise blame `installed` or `borrowed`.
    const std::string model = pk->lookupWordOrDefault("model", "RochaBravoFair");
    if (model != "RochaBravoFair" && model != "Delft")
        throw std::runtime_error("DistillationColumn '" + unit + "': "
            + registryRefusal::message("packing model", model, {"RochaBravoFair", "Delft"}, "Accepted"));

    //  ---- installed: measured on THIS bed, the case's ------------------------
    std::map<std::string, scalar> installed;
    std::string installedSource;
    if (pk->found("installed"))
    {
        auto in = pk->subDict("installed");
        for (const auto& k : in->keys())
        {
            if (k == "source") { installedSource = in->lookupWord(k); continue; }
            const auto& g = geometryFields();
            if (std::find(g.begin(), g.end(), k) == g.end())
                throw std::runtime_error(locus + ": `installed { " + k + " }`: "
                    + registryRefusal::message("installed packing value", k, g, "Accepted")
                    + "  (The column's diameter and bed height are not installed"
                      " overrides of a record: they are declared in `packing {}`"
                      " itself.)");
            installed[k] = isLength(k) ? in->lookupScalar(k, Dims::length) : in->lookupScalar(k);
            requireInRange(locus + " installed", k, installed[k]);
        }
        if (!installed.empty() && installedSource.empty())
            throw std::runtime_error(locus + ": `installed {}` carries no `source`."
                "  A value measured on the installed bed replaces the record's"
                " nominal one; the case says where it was measured.");
    }

    //  ---- borrowed: another packing's value, a HYPOTHESIS of the case --------
    struct Borrow { scalar v; std::string from, reason, at, mark; };
    std::map<std::string, Borrow> borrowed;
    if (pk->found("borrowed"))
    {
        auto b = pk->subDict("borrowed");
        std::vector<std::string> allowed = geometryFields();
        allowed.push_back("surfaceEnhancement");
        for (const auto& k : b->keys())
        {
            if (std::find(allowed.begin(), allowed.end(), k) == allowed.end())
                throw std::runtime_error(locus + ": `borrowed { " + k + " }`: "
                    + registryRefusal::message("borrowed packing value", k, allowed, "Accepted"));
            if (installed.count(k))
                throw std::runtime_error(locus + ": `" + k + "` is both installed and"
                    " borrowed; declare one.");
            auto e = b->subDict(k);
            if (!e->found("from") || !e->found("reason"))
                throw std::runtime_error(locus + ": `borrowed { " + k + " { from <record>;"
                    " reason \"...\"; } }` -- a value of another packing is a hypothesis"
                    " of this case, and a hypothesis states its reason.");
            Borrow br;
            br.from   = e->lookupWord("from");
            br.reason = e->lookupWord("reason");
            if (br.from == recName)
                throw std::runtime_error(locus + ": `borrowed { " + k + " { from " + br.from
                    + "; } }` names the column's own record.");
            const std::string borrowLocus = locus + " borrowed " + k;
            const PackingRecord& src = PackingRegistry::byName(br.from, borrowLocus);
            br.at = src.where();
            //  A borrowed value keeps its source record's estimate mark (PK-04):
            //  lending a number does not make it measured.
            if (const auto* p = src.provenanceOf(k == "surfaceEnhancement" ? "RochaBravoFair" : k))
                if (p->origin == "estimated")
                    br.mark += "; in record '" + br.from + "' an ESTIMATE ("
                             + p->reviewStatus + "): " + p->notes;
            //  Borrowing from a RANDOM packing is ANNOUNCED, not refused (PK-09):
            //  a geometric value (an area, a void fraction) can be shared across
            //  arrangements, and whether it transfers is exactly the hypothesis
            //  the case states; but the reader must see that the lender is not a
            //  structured packing.
            if (src.arrangement() != "structured")
                br.mark += "; NOTE: record '" + br.from + "' is a RANDOM packing";
            if (k == "surfaceEnhancement")
            {
                if (!src.hasConstant("RochaBravoFair", k))
                    throw std::runtime_error(locus + ": `borrowed { " + k + " { from "
                        + br.from + "; } }`: record '" + br.from + "' states no"
                        " `correlations { RochaBravoFair { surfaceEnhancement } }`.");
                br.v = src.constant("RochaBravoFair", k);
            }
            else
            {
                if (!src.has(k))
                    throw std::runtime_error(locus + ": `borrowed { " + k + " { from "
                        + br.from + "; } }`: record '" + br.from + "' states no `" + k + "`.");
                br.v = src.value(k);
            }
            requireInRange(locus + " borrowed", k, br.v);
            borrowed[k] = br;
        }
    }

    //  ---- the fields the chosen correlation reads -----------------------------
    //  (The model word is a known one here: an unknown word was refused above.)
    const std::vector<std::string> need = fieldsRead(model);
    const bool rbf = (model == "RochaBravoFair");
    std::vector<std::string> missing;
    for (const auto& f : need)
        if (!installed.count(f) && !borrowed.count(f) && !rec.has(f)) missing.push_back(f);
    if (rbf && rec.surface().empty()) missing.push_back("surface");
    const bool sheet = rbf && rec.surface() == "sheetMetal";
    if (sheet && !borrowed.count("surfaceEnhancement")
              && !rec.hasConstant("RochaBravoFair", "surfaceEnhancement"))
        missing.push_back("surfaceEnhancement");
    //  A value the correlation does not read is refused, not carried silently.
    for (const auto& kv : installed)
        if (std::find(need.begin(), need.end(), kv.first) == need.end())
            throw std::runtime_error(locus + ": `installed { " + kv.first + " }` is not"
                " read by `model " + model + ";` (it reads " + joined(need) + ").");
    for (const auto& kv : borrowed)
        if (std::find(need.begin(), need.end(), kv.first) == need.end()
            && !(kv.first == "surfaceEnhancement" && sheet))
            throw std::runtime_error(locus + ": `borrowed { " + kv.first + " }` is not"
                " read by `model " + model + ";`" + (rbf ? " on this surface" : "") + ".");
    if (!missing.empty())
    {
        std::ostringstream o;
        o << locus << " " << recAt << " lacks what `model " << model << ";` reads:";
        for (const auto& f : missing)
            o << "\n    `" << (f == "surfaceEnhancement"
                                   ? "correlations { RochaBravoFair { surfaceEnhancement } }"
                                   : f)
              << "` -- " << meaning(f);
        o << "\n  The record states only what its source printed.  Add the value to"
             " the record with its source; or, for this column, declare a geometry"
             " value measured on this bed under `installed {}` (with its source),"
             " or any of them from another packing under `borrowed { <field> {"
             " from <record>; reason \"...\"; } }` (a hypothesis of the case); or"
             " choose a correlation the record can serve.";
        throw std::runtime_error(o.str());
    }

    //  ---- the resolved inline form, and its print ----------------------------
    DictPtr work = unitDict->deepCopy();
    auto wpk = work->subDict("operation")->subDict("packing");
    wpk->erase("record");
    wpk->erase("installed");
    wpk->erase("borrowed");

    std::ostringstream rep;
    rep << "\n  Packing of '" << unit << "' from " << recAt << ", model " << model
        << ":\n";
    auto line = [&](const std::string& f, const std::string& val, const std::string& how)
    {
        rep << "    " << f << std::string(f.size() < 19 ? 19 - f.size() : 1, ' ')
            << val << "  " << how << "\n";
    };
    auto fmt = [](scalar v) { std::ostringstream s; s << v; return s.str(); };
    for (const auto& f : need)
    {
        scalar v;
        std::string how;
        if (installed.count(f))
        {
            v = installed.at(f);
            how = rec.has(f)
                ? "installed (case) replaces nominal " + fmt(rec.value(f)) + unitLabel(f)
                  + " (record)"
                : "installed (case); the record states none";
        }
        else if (borrowed.count(f))
        {
            const Borrow& br = borrowed.at(f);
            v = br.v;
            how = "BORROWED from record '" + br.from + "' (" + br.at + ") -- a hypothesis"
                  " of this case: " + br.reason
                + (rec.has(f) ? "; replaces nominal " + fmt(rec.value(f)) + unitLabel(f) : "")
                + br.mark;
        }
        else
        {
            v = rec.value(f);
            how = "nominal (record)";
            if (const auto* p = rec.provenanceOf(f))
                if (p->origin == "estimated")
                    how += ", an ESTIMATE (" + p->reviewStatus + "): " + p->notes;
        }
        wpk->insert(f, EntryValue(v));
        line(f, fmt(v) + unitLabel(f), how);
    }
    if (rbf)
    {
        wpk->insert("surface", EntryValue(rec.surface()));
        line("surface", rec.surface(), "record");
        if (sheet)
        {
            scalar v;
            std::string how;
            if (borrowed.count("surfaceEnhancement"))
            {
                const Borrow& br = borrowed.at("surfaceEnhancement");
                v = br.v;
                how = "BORROWED from record '" + br.from + "' (" + br.at + ") -- a"
                      " hypothesis of this case: " + br.reason + br.mark;
            }
            else
            {
                v = rec.constant("RochaBravoFair", "surfaceEnhancement");
                how = "record, a constant of this packing under RochaBravoFair";
                if (const auto* p = rec.provenanceOf("RochaBravoFair"))
                    if (p->origin == "estimated")
                        how += ", an ESTIMATE (" + p->reviewStatus + "): " + p->notes;
            }
            wpk->insert("surfaceEnhancement", EntryValue(v));
            line("surfaceEnhancement", fmt(v), how);
        }
    }
    if (!installed.empty())
        rep << "    installed values measured at: " << installedSource << "\n";
    std::cout << rep.str();
    return work;
}

void checkInlineRanges(const DictPtr& unitDict)
{
    //  Read on a COPY, so the check marks nothing read in the case's own
    //  dictionary: a geometry key the chosen correlation ignores must still be
    //  reported unread by the audit.
    if (!unitDict->found("operation")) return;
    auto oper = unitDict->subDict("operation");
    if (!oper->found("packing")) return;
    const DictPtr pk = oper->subDict("packing")->deepCopy();
    for (const auto& f : geometryFields())
    {
        if (!pk->found(f)) continue;
        const scalar v = isLength(f) ? pk->lookupScalar(f, Dims::length) : pk->lookupScalar(f);
        requireInRange("DistillationColumn '" + unitDict->name() + "': packing", f, v);
    }
}

void transferReads(const Dictionary& from, const Dictionary& to)
{
    const std::set<std::string> present(to.keys().begin(), to.keys().end());
    const std::set<std::string> read = from.readKeys();   // a copy: lookups below note
    for (const auto& k : read)
    {
        if (!present.count(k)) continue;
        const EntryValue& fv = from.entryValue(k);
        const EntryValue& tv = to.entryValue(k);           // marks `k` read in `to`
        if (std::holds_alternative<DictPtr>(fv) && std::holds_alternative<DictPtr>(tv))
            transferReads(*std::get<DictPtr>(fv), *std::get<DictPtr>(tv));
        else if (std::holds_alternative<std::vector<DictPtr>>(fv)
              && std::holds_alternative<std::vector<DictPtr>>(tv))
        {
            const auto& a = std::get<std::vector<DictPtr>>(fv);
            const auto& b = std::get<std::vector<DictPtr>>(tv);
            for (std::size_t i = 0; i < std::min(a.size(), b.size()); ++i)
                transferReads(*a[i], *b[i]);
        }
    }
}

} // namespace packingRecord

} // namespace Choupo
