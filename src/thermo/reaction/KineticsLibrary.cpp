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

#include "KineticsLibrary.H"

#include "core/Constants.H"
#include "core/ReadLog.H"
#include "thermo/Component.H"
#include "thermo/PinCheck.H"
#include "thermo/RecordResolver.H"
#include "thermo/ThermoPackage.H"
#include "thermo/reaction/Reaction.H"

#include <algorithm>
#include <filesystem>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <iomanip>
#include <iostream>
#include <map>
#include <memory>
#include <set>
#include <sstream>
#include <stdexcept>

namespace Choupo {
namespace kineticsLibrary {

namespace fs = std::filesystem;

namespace {

using SpeciesMap = std::map<std::string, std::string>;   // a name or alias -> the run's canonical name

// ---------------------------------------------------------------------------
//  Canonical identity
// ---------------------------------------------------------------------------
std::string joinSide(const std::vector<std::string>& side)
{
    std::string s;
    for (std::size_t i = 0; i < side.size(); ++i) { if (i) s += "+"; s += side[i]; }
    return s;
}

std::string suffixOf(const std::string& form)
{
    if (form.empty() || form == "+M" || form == "(+M)") return form;
    throw std::runtime_error("kineticsLibrary: unknown collider form '" + form + "'");
}

std::string formOfKinetics(const std::string& ktype)
{
    if (ktype == "thirdBody") return "+M";
    if (ktype == "falloff")   return "(+M)";
    return "";
}

// The stem a record's own content demands.
std::string stemOfRecord(const DictPtr& rec, const std::string& who)
{
    std::vector<std::pair<std::string, double>> nu;
    for (const auto& s : rec->lookupDictList("stoichiometry"))
        nu.emplace_back(s->lookupWord("component"), s->lookupScalar("nu"));
    const std::string ktype = rec->subDict("kinetics")->lookupWord("type");
    const bool rev = rec->lookupWordOrDefault("reversible", "false") == "true";
    int dup = 0;
    if (rec->found("duplicate")) dup = static_cast<int>(rec->lookupScalar("duplicate"));
    try { return canonicalStem(nu, formOfKinetics(ktype), rev, dup); }
    catch (const std::exception& e) { throw std::runtime_error(who + ": " + e.what()); }
}

// ---------------------------------------------------------------------------
//  The tiers
// ---------------------------------------------------------------------------
struct Rec
{
    std::string stem;
    std::string tier;     // case | standards | local
    fs::path    path;
    DictPtr     dict;
};

struct SetRec
{
    std::string name;
    std::string tier;
    fs::path    path;
    DictPtr     dict;
};

bool underConstant(const fs::path& p)
{
    for (const auto& part : p) if (part == "constant") return true;
    return false;
}

void checkRecord(const Rec& r)
{
    const std::string who = "kinetics record " + r.path.string();
    const std::string rt = r.dict->lookupWordOrDefault("recordType", "");
    if (rt != "elementaryReaction")
        throw std::runtime_error(who + ": `recordType` must be `elementaryReaction` (got '" + rt + "')");
    if (!r.dict->found("stoichiometry") || !r.dict->found("kinetics"))
        throw std::runtime_error(who + ": needs a `stoichiometry ( ... )` list and a `kinetics { ... }` block");
    if (!r.dict->found("source"))
        throw std::runtime_error(who + ": needs a `source { citation ...; table ...; page ...; }` block --"
            " a rate constant without its source is a number nobody can defend");
    const bool global = r.dict->lookupWordOrDefault("global", "false") == "true";
    for (const auto& s : r.dict->lookupDictList("stoichiometry"))
    {
        const bool hasOrder = s->found("order");
        if (hasOrder && !global)
            throw std::runtime_error(who + ": species '" + s->lookupWord("component")
                + "' carries an `order`, and an ELEMENTARY record derives its orders from the"
                  " stoichiometry.  A reaction whose orders are not its coefficients is a"
                  " global one: say `global true;`.");
        if (!hasOrder && global)
            throw std::runtime_error(who + ": a `global true;` record declares the `order` of every species");
    }
    const std::string want = stemOfRecord(r.dict, who);
    if (want != r.stem)
        throw std::runtime_error(who + ": the file name is the reaction's canonical equation and this"
            " record's content is '" + want + "' -- rename the file to " + want + ".dat");
}

std::vector<Rec> loadRecords()
{
    static std::map<std::string, std::vector<Rec>> cache;
    const std::string key = fs::current_path().string() + "|" + Database::currentRoot()
                          + (records::sealed() ? "|sealed" : "");
    auto hit = cache.find(key);
    if (hit != cache.end()) return hit->second;

    //  The scan reads the whole directory to learn who belongs to which set;
    //  only what a case ASKS FOR is consumed (noted below), so the read log is
    //  paused: a pin list built from the scan would pin every set to every case.
    readlog::Pause scanning;
    std::vector<Rec> out;
    std::map<std::string, std::size_t> at;
    auto add = [&](const fs::path& f, const std::string& tier)
    {
        Rec r;
        r.stem = f.stem().string();
        r.tier = tier;
        r.path = f;
        r.dict = Dictionary::fromFile(f.string());
        checkRecord(r);
        auto it = at.find(r.stem);
        if (it == at.end()) { at[r.stem] = out.size(); out.push_back(std::move(r)); }
        else if (tier == "case") out[it->second] = std::move(r);   // case > standards > local
    };
    // standards (+ the case's constant/kinetics, which shadows by file name)
    for (const auto& f : records::scanRecordDir("kinetics"))
        add(f, underConstant(f) ? "case" : "standards");
    // data/local: the lowest tier, UNVERIFIED
    if (!records::sealed())
    {
        const fs::path loc = fs::path(Database::currentRoot()) / "local" / "kinetics";
        for (const auto& f : records::listDatFiles(loc))
        {
            if (at.count(f.stem().string())) continue;
            //  The lowest tier is a private working area: a malformed record in it that this run
            //  does not ask for must not break the run.  It is announced once and skipped; a record
            //  that is asked for is announced UNVERIFIED where it is placed.
            try { add(f, "local"); }
            catch (const std::exception& e)
            {
                std::cerr << "[kineticsLibrary] record " << f.string() << " in data/local/ is malformed and is"
                             " skipped: " << e.what() << "\n";
            }
        }
    }
    //  IDENTITY OF A SUMMED DUPLICATE.  `X@n` records are the terms of one summed reaction X: a bare
    //  `X` beside them is two identities for one equation, and the terms are numbered 1..k with no
    //  gap (k >= 2).  Several rate expressions for one equation (alternative evaluations) are NOT
    //  designed here: it is an open decision (Theory Guide sec:kinetics-library, DEV.md C458).
    {
        std::map<std::string, std::set<int>> terms;
        std::set<std::string> bare;
        for (const auto& r : out)
        {
            const std::size_t at_ = r.stem.rfind('@');
            if (at_ == std::string::npos) { bare.insert(r.stem); continue; }
            terms[r.stem.substr(0, at_)].insert(std::atoi(r.stem.c_str() + at_ + 1));
        }
        for (const auto& t : terms)
        {
            if (bare.count(t.first))
                throw std::runtime_error("kinetics library: the record '" + t.first + "' and its summed terms '"
                    + t.first + "@n' are both present -- one equation has one identity.  Either the reaction is"
                      " one rate (keep the bare name) or a sum of terms (number them @1, @2, ...).");
            int want = 1;
            for (int n : t.second)
                if (n != want++)
                    throw std::runtime_error("kinetics library: the terms of '" + t.first + "' are "
                        "@" + [&] { std::string l; for (int k : t.second) l += (l.empty() ? "" : ",") + std::to_string(k); return l; }()
                        + " -- they must be numbered 1, 2, ... without a gap");
            if (t.second.size() < 2)
                throw std::runtime_error("kinetics library: '" + t.first + "@1' stands alone -- a summed reaction"
                    " has at least two terms; a single rate is the bare name");
        }
    }
    cache[key] = out;
    return out;
}

std::map<std::string, SetRec> loadSets()
{
    static std::map<std::string, std::map<std::string, SetRec>> cache;
    const std::string key = fs::current_path().string() + "|" + Database::currentRoot()
                          + (records::sealed() ? "|sealed" : "");
    auto hit = cache.find(key);
    if (hit != cache.end()) return hit->second;
    readlog::Pause scanning;
    std::map<std::string, SetRec> out;
    for (const auto& f : records::scanRecordDir("kinetics/sets"))
    {
        SetRec s;
        s.name = f.stem().string();
        s.tier = underConstant(f) ? "case" : "standards";
        s.path = f;
        s.dict = Dictionary::fromFile(f.string());
        if (s.dict->lookupWordOrDefault("recordType", "") != "kineticsSet")
            throw std::runtime_error("kinetics set " + f.string() + ": `recordType` must be `kineticsSet`");
        out[s.name] = std::move(s);     // case-tier files come last and win
    }
    cache[key] = out;
    return out;
}

// ---------------------------------------------------------------------------
//  Origins of what was materialised
// ---------------------------------------------------------------------------
std::map<const Dictionary*, std::pair<Origin, DictPtr>>& origins()
{
    static std::map<const Dictionary*, std::pair<Origin, DictPtr>> m;
    return m;
}

// ---------------------------------------------------------------------------
//  One record written as the inline entry a case would have written
// ---------------------------------------------------------------------------
DictPtr entryOf(const Rec& r, const SpeciesMap* present,
                std::set<std::string>& dropped)
{
    auto e = std::make_shared<Dictionary>(r.stem);
    e->setSource("kinetics-library:" + r.path.string());
    e->insert("reversible", EntryValue(r.dict->lookupWordOrDefault("reversible", "false")));
    if (r.dict->found("limitingReactant"))
        e->insert("limitingReactant", EntryValue(r.dict->lookupWord("limitingReactant")));
    const bool global = r.dict->lookupWordOrDefault("global", "false") == "true";
    std::vector<DictPtr> st;
    for (const auto& s : r.dict->lookupDictList("stoichiometry"))
    {
        DictPtr c = s->deepCopy();
        if (!global)
        {
            const double nu = c->lookupScalar("nu");
            c->insert("order", EntryValue(scalar(nu < 0 ? -nu : 0.0)));
        }
        st.push_back(c);
    }
    e->insert("stoichiometry", EntryValue(st));
    DictPtr kin = r.dict->subDict("kinetics")->deepCopy();
    if (present && kin->found("thirdBody"))
    {
        DictPtr tb = kin->subDict("thirdBody");
        //  A key resolves as ThermoPackage::indexOf does it: the canonical name or an alias.  It is
        //  rewritten to the canonical name (an alias would otherwise be read as another species or
        //  refused); only a key that resolves to no species of the run is dropped, and said.
        for (const auto& sp : std::vector<std::string>(tb->keys()))
        {
            const auto hit = present->find(sp);
            if (hit == present->end()) { tb->erase(sp); dropped.insert(sp); continue; }
            if (hit->second != sp)
            {
                const scalar v = tb->lookupScalar(sp);
                tb->erase(sp);
                if (!tb->found(hit->second)) tb->insert(hit->second, EntryValue(v));
            }
        }
    }
    e->insert("kinetics", EntryValue(kin));
    return e;
}

} // namespace

// ---------------------------------------------------------------------------
std::string canonicalStem(const std::vector<std::pair<std::string, double>>& nu,
                          const std::string& form, bool reversible, int duplicate)
{
    std::vector<std::string> lhs, rhs;
    for (const auto& kv : nu)
    {
        const double a = std::fabs(kv.second);
        if (a == 0.0 || a != std::floor(a))
            throw std::runtime_error("species '" + kv.first + "' has the coefficient "
                + std::to_string(kv.second) + ": an elementary reaction has integer, nonzero"
                  " coefficients (a fractional one is a global reaction)");
        for (int i = 0; i < static_cast<int>(a); ++i)
            (kv.second < 0 ? lhs : rhs).push_back(kv.first);
    }
    if (lhs.empty() || rhs.empty())
        throw std::runtime_error("a reaction needs species on both sides");
    std::sort(lhs.begin(), lhs.end());
    std::sort(rhs.begin(), rhs.end());
    const std::string suf = suffixOf(form);
    std::string s;
    if (reversible)
    {
        if (rhs < lhs) std::swap(lhs, rhs);
        s = joinSide(lhs) + suf + "=" + joinSide(rhs) + suf;
    }
    else
        s = joinSide(lhs) + suf + "~" + joinSide(rhs) + suf;
    if (duplicate > 0) s += "@" + std::to_string(duplicate);
    return s;
}

bool asksLibrary(const DictPtr& d)
{
    return d && (d->found("reactionSet") || d->found("reactionSets") || d->found("reactionRecords"));
}

const Origin* originOf(const Dictionary* entry)
{
    auto it = origins().find(entry);
    return it == origins().end() ? nullptr : &it->second.first;
}

static DictPtr materialiseWith(const DictPtr& rd, const SpeciesMap* present);

DictPtr materialise(const DictPtr& rd, const ThermoPackage& thermo)
{
    SpeciesMap present;
    for (std::size_t i = 0; i < thermo.n(); ++i)
    {
        present[thermo.comp(i).name()] = thermo.comp(i).name();
        for (const auto& a : thermo.comp(i).aliases())
            present.emplace(a, thermo.comp(i).name());
    }
    return materialiseWith(rd, &present);
}

static DictPtr materialiseWith(const DictPtr& rd, const SpeciesMap* present)
{
    if (!asksLibrary(rd)) return rd;

    //  The memo keeps the INPUT alive beside its answer: keyed on the raw address alone, a freed
    //  temporary (a sector's reactions file read for one call) could be reallocated at the same
    //  address and hand back another sector's dictionary.
    static std::map<std::string, std::pair<DictPtr, DictPtr>> memo;
    std::string mkey = std::to_string(reinterpret_cast<std::uintptr_t>(rd.get()));
    if (present) for (const auto& s : *present) mkey += "," + s.first + ">" + s.second;
    auto m = memo.find(mkey);
    if (m != memo.end()) return m->second.second;

    // ---- what the case asked ----------------------------------------------
    std::vector<std::string> setNames;
    if (rd->found("reactionSet")) setNames.push_back(rd->lookupWord("reactionSet"));
    if (rd->found("reactionSets"))
        for (const auto& s : rd->lookupWordList("reactionSets")) setNames.push_back(s);
    std::vector<std::pair<std::string, std::string>> byRecord;    // stem, name
    if (rd->found("reactionRecords"))
        for (const auto& d : rd->lookupDictList("reactionRecords"))
            byRecord.emplace_back(d->lookupWord("record"), d->lookupWord("name"));

    const std::vector<Rec> recs = loadRecords();
    const auto sets = loadSets();
    std::map<std::string, const Rec*> byStem;
    for (const auto& r : recs) byStem[r.stem] = &r;

    // ---- the result starts as the case's inline entries -----------------------
    auto out = std::make_shared<Dictionary>(rd->lookupWordOrDefault("name", "reactions"));
    out->setSource("kinetics-materialised");
    std::set<std::string> taken;
    for (const auto& k : rd->keys())
    {
        if (k == "reactionSet" || k == "reactionSets" || k == "reactionRecords") continue;
        out->insert(k, rd->entryValue(k));
        taken.insert(k);
    }

    std::set<std::string> dropped;
    std::vector<std::pair<const Rec*, std::string>> used;   // record, set it was asked through
    auto place = [&](const Rec& r, const std::string& label, const std::string& setName)
    {
        if (taken.count(label))
            throw std::runtime_error("constant/reactions: the library reaction '" + r.stem + "' ("
                + (setName.empty() ? std::string("asked by `reactionRecords`") : "from the set '" + setName + "'")
                + ", " + r.tier + " tier) would be entered as '" + label + "', which the case already"
                  " defines -- rename one of them");
        DictPtr e = entryOf(r, present, dropped);
        out->insert(label, EntryValue(e));
        taken.insert(label);
        Origin o;
        o.set = setName; o.label = label; o.stem = r.stem; o.tier = r.tier;
        if (!setName.empty()) { auto s = sets.find(setName); if (s != sets.end()) o.setDict = s->second.dict; }
        origins()[e.get()] = { o, e };
        used.emplace_back(&r, setName);
        readlog::note(r.path.string());
        static std::set<std::string> saidLocal;
        if (r.tier == "local" && saidLocal.insert(r.stem).second)
            std::cerr << "[kineticsLibrary] record '" << r.stem << "': read from data/local/ -- UNVERIFIED,"
                         " not part of the curated catalogue\n";
    };

    for (const auto& sn : setNames)
    {
        std::size_t n = 0;
        std::string tier = "standards";
        for (const auto& r : recs)
        {
            if (!r.dict->found("sets") || !r.dict->subDict("sets")->found(sn)) continue;
            place(r, r.dict->subDict("sets")->lookupWord(sn), sn);
            ++n;
            if (r.tier == "case") tier = "case";
            else if (r.tier == "local" && tier != "case") tier = "local";
        }
        if (n == 0)
        {
            std::string known;
            for (const auto& s : sets) known += (known.empty() ? "" : ", ") + s.first;
            throw std::runtime_error("constant/reactions: `reactionSet " + sn + ";` -- no record of the"
                " kinetics library (data/standards/kinetics/, the case's constant/kinetics/,"
                " data/local/kinetics/) lists the set '" + sn + "' in its `sets {}`.  Sets known: "
                + (known.empty() ? std::string("none") : known) + ".");
        }
        const auto sit = sets.find(sn);
        if (sit != sets.end()) readlog::note(sit->second.path.string());
        std::cerr << "[kineticsLibrary] reaction set '" << sn << "': " << n << " reaction entries ("
                  << tier << " tier)";
        if (sit != sets.end())
        {
            const std::string c = sit->second.dict->lookupWordOrDefault("citation", "");
            if (!c.empty()) std::cerr << ", source: " << c;
            if (sit->second.dict->found("thermochemistry"))
                std::cerr << "; thermo it was made with: "
                          << sit->second.dict->subDict("thermochemistry")->lookupWordOrDefault("citation", "(undeclared)");
        }
        std::cerr << "\n";
    }
    for (const auto& br : byRecord)
    {
        auto it = byStem.find(br.first);
        if (it == byStem.end())
            throw std::runtime_error("constant/reactions: `reactionRecords` names '" + br.first
                + "', which is no record of the kinetics library (the file stem is the canonical"
                  " equation, e.g. \"H+O2=O+OH\")");
        place(*it->second, br.second, "");
    }

    //  Only standards-tier files are catalogue pins; a case's own are its own.
    {
        std::vector<std::string> rf, sf;
        for (const auto& u : used)
            if (u.first->tier == "standards") rf.push_back(u.first->path.filename().string());
        for (const auto& sn : setNames)
        {
            auto sit = sets.find(sn);
            if (sit != sets.end() && sit->second.tier == "standards")
                sf.push_back(sit->second.path.filename().string());
        }
        records::noteKineticsAsk(rf, sf);
    }
    if (!dropped.empty())
    {
        std::string l;
        for (const auto& s : dropped) l += (l.empty() ? "" : ", ") + s;
        std::cerr << "[kineticsLibrary] third-body efficiencies of species not in this run (" << l
                  << ") are not applied: their concentration is 0\n";
    }
    if (setNames.size() > 1)
    {
        std::string l;
        for (const auto& s : setNames) l += (l.empty() ? "" : ", ") + s;
        std::cerr << "[kineticsLibrary] this mechanism is assembled from " << setNames.size()
                  << " sets (" << l << ")\n";
    }
    //  A constant marked as optimised within a set, used outside it: the one WARNING.
    for (const auto& u : used)
    {
        const Rec& r = *u.first;
        if (!r.dict->found("optimisedWithin")) continue;
        const std::string within = r.dict->lookupWord("optimisedWithin");
        if (std::find(setNames.begin(), setNames.end(), within) == setNames.end())
            std::cerr << "[kineticsLibrary][WARNING] reaction '" << r.stem << "' was optimised within the set '"
                      << within << "' (with that set's other constants) and this case does not use"
                         " that set; its value is used outside the mechanism it was tuned in\n";
    }
    memo[mkey] = { rd, out };
    return out;
}

// ---------------------------------------------------------------------------
//  (e) K_c under the set's thermo against the run's
// ---------------------------------------------------------------------------
void announceThermoDifference(const ThermoPackage& thermo,
                              const std::vector<DictPtr>& entries,
                              scalar T, std::ostream& os)
{
    std::set<std::string> cited;
    const auto fmt = [](double v) { std::ostringstream s; s << std::setprecision(6) << v; return s.str(); };
    for (const auto& e : entries)
    {
        const Origin* o = e ? originOf(e.get()) : nullptr;
        if (!o || !o->setDict || !o->setDict->found("thermochemistry")) continue;
        DictPtr th = o->setDict->subDict("thermochemistry");
        const std::string home = th->lookupWordOrDefault("home", "");
        if (home.empty())
        {
            if (cited.insert(o->set).second)
                os << "[kineticsLibrary] set '" << o->set << "' was made with its own thermochemistry ("
                   << th->lookupWordOrDefault("citation", "undeclared")
                   << "), which is not in the catalogue: its K_c at T = " << fmt(T)
                   << " K cannot be compared with this run's.  The reverse of every `reversible`"
                      " reaction follows THIS run's species records.\n";
            continue;
        }
        if (cited.insert("!" + o->set).second)
        {
            os << "[kineticsLibrary] K_c under the thermochemistry set '" << o->set << "' was made with ("
               << home << ") against this run's, at T = " << fmt(T) << " K:\n";
        }
        // species, nu
        std::vector<std::pair<std::string, double>> nu;
        for (const auto& s : e->lookupDictList("stoichiometry"))
            nu.emplace_back(s->lookupWord("component"), s->lookupScalar("nu"));
        double dGset = 0, dGrun = 0, sum = 0;
        std::string missing;
        for (const auto& kv : nu)
        {
            std::size_t idx = thermo.n();
            for (std::size_t i = 0; i < thermo.n(); ++i)
                if (thermo.comp(i).name() == kv.first) { idx = i; break; }
            if (idx == thermo.n()) { missing = kv.first + " (not in the run)"; break; }
            const Component& run = thermo.comp(idx);
            if (!run.hasGibbsData()) { missing = kv.first + " (no standardThermochemistry in this run)"; break; }
            const fs::path base = fs::path(Database::currentRoot()) / "standards" / "thermoTables" / home;
            fs::path f = base / (kv.first + ".dat");
            if (!fs::exists(f)) f = base / (run.formula() + ".dat");
            if (!fs::exists(f)) { missing = kv.first + " (no record in " + home + ")"; break; }
            Component c;
            {
                readlog::Pause quiet;
                c.readFromDict(Dictionary::fromFile(f.string()));
            }
            dGset += kv.second * c.g_pure_ig(T);
            dGrun += kv.second * run.g_pure_ig(T);
            sum   += kv.second;
        }
        if (!missing.empty())
        {
            os << "    " << o->label << ": not compared -- " << missing << "\n";
            continue;
        }
        const double ratio = std::exp(-(dGset - dGrun) / (constant::R * T));
        os << "    " << o->label << ": K_c(set)/K_c(run) = " << fmt(ratio)
           << "   (delta G0 set " << fmt(dGset) << ", run " << fmt(dGrun) << " J/mol)\n";
    }
}

// ---------------------------------------------------------------------------
//  (f) k_f/k_r against K_c
// ---------------------------------------------------------------------------
void announceReverseConsistency(const ThermoPackage& thermo,
                                const std::vector<LegProbe>& legs,
                                scalar T, std::ostream& os)
{
    struct Row { std::string what; double kf, kr; const LegProbe* leg; };
    std::vector<Row> rows;
    for (const auto& l : legs)
        if (l.hasKr && !l.reversible) rows.push_back({ l.name + " (explicit A_rev/Ea_rev)", l.kf, l.kr, &l });
    for (std::size_t i = 0; i < legs.size(); ++i)
        for (std::size_t j = i + 1; j < legs.size(); ++j)
        {
            const auto& a = legs[i]; const auto& b = legs[j];
            if (a.reversible || b.reversible || a.hasKr || b.hasKr) continue;
            if (!a.plainForm || !b.plainForm || !a.massAction || !b.massAction) continue;
            if (a.comps.size() != b.comps.size()) continue;
            bool opposite = true;
            for (std::size_t s = 0; s < a.comps.size() && opposite; ++s)
            {
                bool found = false;
                for (std::size_t t = 0; t < b.comps.size(); ++t)
                    if (b.comps[t] == a.comps[s]) { found = true; if (b.nu[t] != -a.nu[s]) opposite = false; }
                if (!found) opposite = false;
            }
            if (opposite) rows.push_back({ a.name + " and " + b.name + " (two irreversible entries)", a.kf, b.kf, &a });
        }
    if (rows.empty()) return;
    const auto fmt = [](double v) { std::ostringstream s; s << std::setprecision(6) << v; return s.str(); };
    os << "[kineticsLibrary] explicit reverse rates against the equilibrium constant, T = " << fmt(T)
       << " K (k_f/k_r should equal K_c on this run's thermochemistry; K_c in kmol/m3 for the"
          " species counts below):\n";
    for (const auto& r : rows)
    {
        const LegProbe& l = *r.leg;
        std::string lacking;
        for (std::size_t c : l.comps)
            if (!thermo.comp(c).hasGibbsData()) { lacking = thermo.comp(c).name(); break; }
        if (!lacking.empty())
        {
            os << "    " << r.what << ": k_f/k_r = " << fmt(r.kf / r.kr) << ", not compared with K_c -- "
               << lacking << " has no standardThermochemistry, so this run has no equilibrium constant\n";
            continue;
        }
        const double Kc = Reaction::equilibriumKc(thermo, l.comps, std::vector<double>(l.nu.begin(), l.nu.end()), T);
        if (!l.massAction)
        {
            os << "    " << r.what << ": orders are not the stoichiometric coefficients, k_f/k_r = "
               << fmt(r.kf / r.kr) << " has no K_c to be held to\n";
            continue;
        }
        os << "    " << r.what << ": k_f/k_r = " << fmt(r.kf / r.kr) << ", K_c = " << fmt(Kc)
           << ", (k_f/k_r)/K_c = " << fmt(r.kf / r.kr / Kc) << "\n";
    }
}

} // namespace kineticsLibrary
} // namespace Choupo
