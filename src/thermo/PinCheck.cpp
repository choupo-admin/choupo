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

#include "thermo/PinCheck.H"

#include "core/DictCanonical.H"
#include "core/ReadLog.H"
#include "core/Sha256.H"
#include "thermo/Database.H"
#include "thermo/ElementComposition.H"
#include "thermo/RecordResolver.H"
#include "thermo/SealCheck.H"
#include "thermo/ThermoAnnounce.H"

#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <map>
#include <set>
#include <stdexcept>
#include <string>

namespace Choupo {
namespace records {

namespace fs = std::filesystem;

namespace {

//  Where the nearest manifest lives: the root its record keys are relative to.
fs::path manifestRoot()
{
    fs::path p = fs::current_path();
    for (int up = 0; up < walkUpDepth; ++up)
    {
        if (fs::exists(p / "constant" / "propertyManifest")) return p;
        fs::path par = p.parent_path();
        if (par == p) break;
        p = par;
    }
    return {};
}

fs::path catalogueRoot()
{
    std::string r = Database::currentRoot();
    if (r.empty()) r = "data";
    std::error_code ec;
    fs::path c = fs::weakly_canonical(fs::path(r) / "standards", ec);
    return ec ? fs::path(r) / "standards" : c;
}

std::string computationalHash(const fs::path& f)
{
    try { return canonical::sha256OfFile(f.string()); }
    catch (const std::exception&) { return ""; }
}

//  The directory pin (key ends in "/"): see pinHash().
std::string directoryHash(const fs::path& dir)
{
    std::vector<std::string> names;
    for (const auto& e : fs::directory_iterator(dir))
        if (e.path().extension() == ".dat") names.push_back(e.path().filename().string());
    std::sort(names.begin(), names.end());
    std::string lines;
    for (const auto& n : names)
        lines += n + "\t" + computationalHash(dir / n) + "\n";
    return sha256::hex(lines);
}

bool isDirKey(const std::string& k) { return !k.empty() && k.back() == '/'; }

//  A catalogue file is COVERED when it is pinned itself, or when its directory
//  is pinned as a whole.
bool covered(const std::set<std::string>& pinned, const std::string& sub)
{
    if (pinned.count(sub)) return true;
    const std::size_t k = sub.rfind('/');
    return k != std::string::npos && pinned.count(sub.substr(0, k + 1)) > 0;
}

DictPtr pinsOf()
{
    DictPtr m = nearestManifest();
    return (m && m->found("pins")) ? m->subDict("pins") : nullptr;
}

DictPtr heldOf()
{
    DictPtr m = nearestManifest();
    return (m && m->found("held")) ? m->subDict("held") : nullptr;
}

std::vector<std::string>& drifted_() { static std::vector<std::string> v; return v; }

std::string joinNames(const std::vector<std::string>& v)
{
    std::string s;
    for (const auto& k : v) s += (s.empty() ? "" : ", ") + k;
    return s;
}

bool announceOnceKey(const std::string& k)
{
    static std::set<std::string> said;
    return said.insert(k).second;
}

//  ---- a record's identity: formula (atoms + charge), charge, CAS ----------
struct Identity
{
    bool                          hasFormula = false;
    std::map<std::string, scalar> atoms;
    std::string                   formulaText;
    bool                          hasCharge = false;
    int                           charge = 0;
    std::string                   cas;
};

Identity identityOf(const DictPtr& d)
{
    Identity id;
    if (d->found("formula"))
    {
        id.formulaText = d->lookupWord("formula");
        const FormulaIdentity f = parseFormulaIdentity(id.formulaText);
        if (f.parsed)
        {
            id.hasFormula = true;
            id.atoms = f.atoms;
            id.hasCharge = true;
            id.charge = f.charge;
        }
    }
    if (d->found("charge"))
    {
        id.hasCharge = true;
        id.charge = static_cast<int>(std::lround(d->lookupScalar("charge")));
    }
    if (d->found("CAS")) id.cas = d->lookupWord("CAS");
    return id;
}

//  Which identity fields disagree (empty = none shared field disagrees).
std::vector<std::string> disagreements(const Identity& a, const Identity& b)
{
    std::vector<std::string> out;
    if (a.hasFormula && b.hasFormula && a.atoms != b.atoms)
        out.push_back("formula (atoms)");
    if (a.hasCharge && b.hasCharge && a.charge != b.charge)
        out.push_back("charge");
    if (!a.cas.empty() && !b.cas.empty() && a.cas != b.cas)
        out.push_back("CAS");
    return out;
}

std::string describe(const Identity& i)
{
    std::string s = "formula \"" + i.formulaText + "\"";
    if (i.hasCharge) s += ", charge " + std::to_string(i.charge);
    if (!i.cas.empty()) s += ", CAS " + i.cas;
    return s;
}

struct Decl
{
    std::string kind;      // "", "overlayOf", "variationOf", "distinctFrom"
    std::string of;
    std::string reason;
    int         count = 0;
};

Decl declarationOf(const DictPtr& d)
{
    Decl x;
    for (const char* k : { "overlayOf", "variationOf", "distinctFrom" })
        if (d->found(k)) { ++x.count; x.kind = k; x.of = d->lookupWord(k); }
    if (d->found("variationReason")) x.reason = d->lookupWord("variationReason");
    return x;
}

const DictPtr& localDict(const fs::path& p)
{
    static std::map<std::string, DictPtr> cache;
    auto it = cache.find(p.string());
    if (it == cache.end())
        it = cache.emplace(p.string(), Dictionary::fromFile(p.string())).first;
    return it->second;
}

bool identityKind(const std::string& sub)
{
    return sub.rfind("components/", 0) == 0 || sub.rfind("species/", 0) == 0;
}

std::string stemOf(const std::string& sub)
{
    return fs::path(sub).stem().string();
}

} // namespace

//  standards-relative name of a file under the catalogue, "" when it is not.
static const fs::path& leakedCatalogueRoot()
{
    static const fs::path* cat = new fs::path(catalogueRoot());   // leaked on purpose
    return *cat;
}

void primeCatalogueRoot() { (void)leakedCatalogueRoot(); }

std::string pinHash(const std::string& path)
{
    std::error_code ec;
    if (fs::is_directory(path, ec)) return directoryHash(path);
    return computationalHash(path);
}

std::string catalogueSubOf(const std::string& path)
{
    const fs::path& cat = leakedCatalogueRoot();
    std::error_code ec;
    const fs::path p = fs::weakly_canonical(fs::absolute(path), ec);
    if (ec) return "";
    auto c = cat.begin(); auto q = p.begin();
    for (; c != cat.end() && q != p.end(); ++c, ++q)
        if (*c != *q) return "";
    if (c != cat.end()) return "";
    std::string out;
    for (; q != p.end(); ++q) out += (out.empty() ? "" : "/") + q->string();
    return out;
}


bool pinsActive() { return pinsOf() != nullptr; }

bool strictPins()
{
    if (const char* e = std::getenv("CHOUPO_PINS"))
    {
        const std::string w = e;
        if (w == "refuse") return true;
        if (!w.empty() && w != "announce")
            throw std::runtime_error("CHOUPO_PINS='" + w
                + "' is not one of announce / refuse (the environment word"
                  " `runCase --strict` sets).");
    }
    DictPtr m = nearestManifest();
    return m && m->lookupWordOrDefault("onDivergence", "announce") == "refuse";
}

bool isHeld(const std::string& sub)
{
    DictPtr h = heldOf();
    return h && h->found(sub);
}

bool readsAlone(const std::string& sub, const fs::path& local)
{
    if (pinsActive() && isHeld(sub)) return true;
    if (local.empty() || !fs::exists(local)) return false;
    const Decl d = declarationOf(localDict(local));
    return d.kind == "variationOf" || d.kind == "distinctFrom";
}

int verifyPinsStart(const DictPtr& m, int verbosity)
{
    if (m->found("records") || m->lookupWordOrDefault("sealed", "false") == "true")
        throw std::runtime_error(
            "propertyManifest holds `pins` and also `sealed true` / `records`"
            " -- a referencing case and a sealed case are two different claims"
            " and may not be one manifest.  A case that REFERENCES the"
            " catalogue lists `pins` only; a frozen copy for archiving or"
            " sharing is made with `bin/choupo-import --seal <case> --to <dir>`.");

    const std::string onDiv = m->lookupWordOrDefault("onDivergence", "announce");
    if (onDiv != "announce" && onDiv != "refuse")
        throw std::runtime_error("propertyManifest: onDivergence '" + onDiv
            + "' is not one of announce / refuse");
    (void)strictPins();     // a junk CHOUPO_PINS word refuses at START, not only on a drift

    const fs::path root = manifestRoot();
    const fs::path cat  = catalogueRoot();
    std::vector<std::string> bad;      // "<sub> (class)"
    std::vector<std::string> repin;    // records to re-pin

    DictPtr pins = m->subDict("pins");
    for (const auto& key : pins->keys())
    {
        const std::string want = pins->lookupWord(key);
        const fs::path f = cat / key;
        if (!fs::exists(f)) { bad.push_back(key + " (vanished)"); repin.push_back(key); continue; }
        if (pinHash(f.string()) != want)
        { bad.push_back(key + " (changed)"); repin.push_back(key); }
    }

    if (DictPtr held = heldOf())
        for (const auto& key : held->keys())
        {
            const std::string want = held->lookupWord(key);
            const fs::path f = root / "constant" / key;
            if (!fs::exists(f)) { bad.push_back("held " + key + " (missing)"); continue; }
            if (computationalHash(f) != want)
            { bad.push_back("held " + key + " (changed)"); continue; }
            if (verbosity >= 1 && announceOnceKey("held:" + key))
                std::cerr << "[held] " << key << ": catalogue copy older than"
                             " the catalogue, read ALONE as the case's own"
                             " record (transitional -- the catalogue record"
                             " is not read for it)\n";
        }

    detail::setSealVerdict(bad.empty() ? "pinned" : "drifted", bad);
    drifted_() = bad;
    if (bad.empty()) return 0;

    if (verbosity >= 1)
    {
        std::cerr << "[pins] " << bad.size() << " pinned record(s) no longer"
                     " match the catalogue this case was pinned against:\n";
        for (const auto& b : bad) std::cerr << "[pins]   " << b << "\n";
        std::cerr << "[pins] the run CONTINUES on the catalogue as it is --"
                     " follow the new record with `bin/choupo-import --repin"
                     " <record>` (then read which goldens moved), or restore"
                     " the record.\n";
    }
    if (strictPins())
        throw std::runtime_error("pins: " + std::to_string(bad.size())
            + " pinned record(s) no longer match the catalogue ("
            + joinNames(bad) + ") and this run is STRICT (CHOUPO_PINS=refuse,"
              " `runCase --strict` or `onDivergence refuse;`).  Remedy:"
              " `bin/choupo-import --repin <record>` re-pins the record in"
              " every case that pins it (commit the re-pin with the catalogue"
              " edit and read which goldens moved), or restore the record.");
    return static_cast<int>(bad.size());
}

void finalizePins()
{
    static bool done = false;
    if (done) return;
    done = true;
    DictPtr pins = pinsOf();
    if (!pins) return;

    std::set<std::string> pinned(pins->keys().begin(), pins->keys().end());
    std::vector<std::string> unpinned, notRead;
    std::set<std::string> read;
    for (const auto& p : readlog::state().paths)
    {
        const std::string sub = catalogueSubOf(p);
        if (!sub.empty()) read.insert(sub);
    }
    for (const auto& r : read)
        if (!covered(pinned, r)) unpinned.push_back(r);
    for (const auto& k : pinned)
    {
        bool hit = read.count(k) > 0;
        if (!hit && isDirKey(k))
            for (const auto& r : read)
                if (r.rfind(k, 0) == 0 && r.find('/', k.size()) == std::string::npos)
                { hit = true; break; }
        if (!hit) notRead.push_back(k);
    }

    const int verbosity = thermoAnnounceLevel();
    if (verbosity >= 2 && !notRead.empty())
    {
        std::cerr << "[pins] " << notRead.size() << " pinned record(s) were"
                     " not read by this run (not a drift):";
        for (const auto& k : notRead) std::cerr << " " << k;
        std::cerr << "\n";
    }
    if (unpinned.empty()) return;

    std::vector<std::string> all = drifted_();
    for (const auto& u : unpinned) all.push_back(u + " (unpinned)");
    detail::setSealVerdict("drifted", all);
    drifted_() = all;
    if (verbosity >= 1)
    {
        std::cerr << "[pins] " << unpinned.size() << " catalogue record(s) were"
                     " READ by this run and are not pinned by the case's"
                     " manifest:\n";
        for (const auto& u : unpinned) std::cerr << "[pins]   " << u << " (unpinned)\n";
        std::cerr << "[pins] pin them with `bin/choupo-import --pin <case>`"
                     " (it prints every record it adds, so a record that"
                     " should NOT have been read -- a radical for an ion --"
                     " is a diff you read).\n";
    }
    if (strictPins())
        throw std::runtime_error("pins: this run read " + std::to_string(unpinned.size())
            + " catalogue record(s) the case's manifest does not pin ("
            + joinNames(unpinned) + ") and it is STRICT (CHOUPO_PINS=refuse /"
              " `runCase --strict` / `onDivergence refuse;`).  Remedy:"
              " `bin/choupo-import --pin <case>` observes the run and pins what"
              " it read; if a record on that list should not have been read"
              " (a local ion record deleted so its name fell through to the"
              " catalogue's radical), restore the local record.");
}

void checkLocalShadow(const std::string& sub, const fs::path& local)
{
    if (local.empty() || sealed()) return;
    const fs::path cat = catalogueRoot() / sub;
    if (!fs::exists(cat)) return;                    // no homonym: nothing to say

    const std::string name = stemOf(sub);
    const bool held = pinsActive() && isHeld(sub);
    const bool strictRule = pinsActive() && strictPins();
    DictPtr ld = localDict(local);
    const Decl d = declarationOf(ld);

    const std::string where = "'" + sub + "' (case " + local.string() + ")";
    auto refuse = [&](const std::string& why, const std::string& remedy)
    {
        throw std::runtime_error("shadow: the case's record " + where + " "
            + why + "  Remedy: " + remedy);
    };

    if (d.count > 1)
        refuse("declares more than one of overlayOf / variationOf /"
               " distinctFrom -- a record is exactly one of them.",
               "keep the one that is true and delete the others.");
    if (d.count == 1 && d.of != name)
        refuse("declares `" + d.kind + " " + d.of + "` but its name is '" + name
               + "' -- a declaration names the catalogue record of the SAME"
                 " name.",
               "write `" + d.kind + " " + name + ";`, or rename the record.");

    //  The identity of both, compared WITHOUT consuming the catalogue record
    //  (a pin describes what the run reads; a comparison reads nothing).
    std::vector<std::string> diff;
    Identity li, ci;
    if (identityKind(sub))
    {
        readlog::Pause compare;
        const DictPtr cd = Dictionary::fromFile(cat.string());
        li = identityOf(ld);
        ci = identityOf(cd);
        diff = disagreements(li, ci);
    }

    const std::string diffText = joinNames(diff);
    const std::string both = "the case's record is " + describe(li)
        + "; the catalogue's is " + describe(ci) + ".";

    if (d.kind == "overlayOf" || d.kind == "variationOf")
    {
        if (!diff.empty())
            refuse("declares `" + d.kind + " " + name + ";` but the two disagree"
                   " on " + diffText + ": " + both + "  A declared variation is"
                   " the SAME species with other numbers.",
                   "if it is a different species under the same name, declare"
                   " `distinctFrom " + name + ";` with a variationReason; if"
                   " the identity fields are wrong, correct them.");
    }
    else if (d.kind == "distinctFrom")
    {
        if (identityKind(sub) && diff.empty())
            refuse("declares `distinctFrom " + name + ";` but agrees with the"
                   " catalogue on every identity field: " + both + "  That is the"
                   " SAME species.",
                   "declare `variationOf " + name + ";` (a full record) or"
                   " `overlayOf " + name + ";` (a delta) with a variationReason,"
                   " or delete the copy and follow the catalogue.");
    }
    else if (!held)
    {
        if (!diff.empty())
        {
            const std::string why = "is a DIFFERENT species under the catalogue's name (they"
                " disagree on " + diffText + "): " + both;
            const std::string how = "declare `distinctFrom " + name + "; variationReason \"...\";`"
                " in the record, or rename it.  Left undeclared, deleting"
                " this record would make the name fall through to the"
                " catalogue's species with exit 0.";
            //  A case that REFERENCES the catalogue refuses.  A legacy UNSEALED case
            //  (a sealed ion case copied out without its manifest, a demo written
            //  before the declaration existed) is ANNOUNCED, never refused: the
            //  refusal for those arrives with slice 4, which declares them.
            if (pinsActive()) refuse(why, how);
            if (thermoAnnounceLevel() >= 1 && announceOnceKey("shadow:" + sub))
                std::cerr << "[shadow] " << where << " " << why << "  " << how << "\n";
        }
        if (strictRule)
            refuse("shadows the catalogue record of the same name without"
                   " declaring it (CHOUPO_PINS=refuse).",
                   "declare `variationOf " + name + ";` or `overlayOf " + name
                   + ";` with a `variationReason \"...\";`, or delete the copy"
                     " and run `bin/choupo-import --pin <case>`.");
        if (thermoAnnounceLevel() >= 1 && announceOnceKey("shadow:" + sub))
            std::cerr << "[shadow] " << where << " shadows the catalogue record"
                         " of the same name without a declaration -- declare"
                         " `variationOf " << name << ";` / `overlayOf " << name
                      << ";` with a `variationReason`, or delete the copy.\n";
    }

    if (d.count == 1 && d.reason.empty())
    {
        if (strictRule)
            refuse("declares `" + d.kind + "` and no `variationReason`"
                   " (CHOUPO_PINS=refuse).",
                   "add `variationReason \"<one sentence: why this record is"
                   " not the catalogue's>\";`.");
        //  Announced only for a case that REFERENCES the catalogue: the sentence
        //  is new grammar, and a case written before it (the unsealed overlay
        //  demos) learns it in the slice that declares its variations.
        if (pinsActive() && thermoAnnounceLevel() >= 1 && announceOnceKey("reason:" + sub))
            std::cerr << "[shadow] " << where << " declares `" << d.kind
                      << "` without a `variationReason` -- the sentence is"
                         " required (refused under CHOUPO_PINS=refuse).\n";
    }
}

} // namespace records
} // namespace Choupo
