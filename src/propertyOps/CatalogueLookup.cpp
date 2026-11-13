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
    This file is part of Choupo (GPL-3.0-or-later).  See CatalogueLookup.H.
\*---------------------------------------------------------------------------*/
/* SPDX-License-Identifier: GPL-3.0-or-later */

#include "CatalogueLookup.H"
#include "thermo/Database.H"
#include "thermo/ThermoPackage.H"
#include "thermo/RecordResolver.H"
#include "core/Constants.H"

#include <algorithm>
#include <cctype>
#include <cstdio>
#include <filesystem>
#include <fstream>
#include <map>
#include <iostream>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace fs = std::filesystem;

namespace Choupo {

namespace {

// ---------------------------------------------------------------- text ----

//  A value placed inside a quoted card string: no quote, no newline, bounded.
std::string clean(std::string s, std::size_t maxBytes)
{
    for (char& c : s)
    {
        if (c == '"') c = '\'';
        else if (static_cast<unsigned char>(c) < 0x20) c = ' ';
    }
    if (s.size() > maxBytes)
    {
        std::size_t n = maxBytes;
        while (n > 0 && (static_cast<unsigned char>(s[n]) & 0xC0) == 0x80) --n;
        s.resize(n);
        s += "...";
    }
    return s;
}

std::string num(double v, const char* fmt = "%.4g")
{
    char b[48];
    std::snprintf(b, sizeof b, fmt, v);
    return b;
}

std::string lower(std::string s)
{
    for (char& c : s) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    return s;
}

std::string jsonEsc(const std::string& s)
{
    std::string o;
    for (char c : s)
    {
        switch (c)
        {
            case '"':  o += "\\\""; break;
            case '\\': o += "\\\\"; break;
            case '\n': o += "\\n";  break;
            case '\t': o += "\\t";  break;
            default:
                if (static_cast<unsigned char>(c) < 0x20) o += ' ';
                else o += c;
        }
    }
    return o;
}

bool looksLikeCAS(const std::string& s)
{
    // digits{2,7} - digits{2} - digit
    const auto d1 = s.find('-');
    if (d1 == std::string::npos || d1 < 2 || d1 > 7) return false;
    const auto d2 = s.find('-', d1 + 1);
    if (d2 == std::string::npos || d2 != d1 + 3 || d2 + 2 != s.size()) return false;
    for (std::size_t i = 0; i < s.size(); ++i)
        if (i != d1 && i != d2 && !std::isdigit(static_cast<unsigned char>(s[i])))
            return false;
    return true;
}

// ------------------------------------------------------------ the card ----

//  A card is a flat list of lines.  Only LEAF lines (one `key value;` or one
//  one-line block) carry a droppable priority > 0; braces and the mandatory
//  statements are priority 0 and never dropped, so a card that is cut to fit
//  the budget is still a balanced, parseable dictionary.
struct Line { int prio; bool dropped; std::string text; };

struct Card
{
    std::vector<Line> lines;
    void add(int prio, const std::string& t) { lines.push_back({ prio, false, t }); }

    std::string render(int nDropped) const
    {
        std::string o;
        for (const auto& l : lines)
        {
            if (l.dropped) continue;
            o += l.text;
            o += '\n';
        }
        if (nDropped > 0)
        {
            //  the closing brace is the last line; insert before it
            const auto p = o.rfind("}\n");
            o.insert(p, "  droppedFields " + std::to_string(nDropped) + ";\n");
        }
        return o;
    }

    //  Fit to the budget by dropping the highest-numbered priority first
    //  (the last line of that priority), SAID in `droppedFields`.
    std::string fit(std::size_t budget)
    {
        int nDropped = 0;
        std::string o = render(nDropped);
        while (o.size() > budget)
        {
            int best = 0;
            for (const auto& l : lines)
                if (!l.dropped && l.prio > best) best = l.prio;
            if (best == 0)
                throw std::runtime_error("evidence card: " + std::to_string(o.size())
                    + " bytes with only the mandatory lines -- over the "
                    + std::to_string(budget) + "-byte budget; shorten a mandatory statement");
            for (std::size_t i = lines.size(); i-- > 0;)
                if (!lines[i].dropped && lines[i].prio == best)
                { lines[i].dropped = true; break; }
            ++nDropped;
            o = render(nDropped);
        }
        return o;
    }
};

// ------------------------------------------------------ the catalogue ----

struct Paths
{
    fs::path standards, local, lake;
};

Paths catalogue(const Database* db, const char* op)
{
    if (!db)
        throw std::runtime_error(std::string(op) + ": no database attached");
    Paths p;
    const fs::path root = db->root();
    p.standards = root / "standards";
    p.local     = root / "local";
    p.lake      = root / "groupEstimative";
    if (!fs::is_directory(p.standards / "components")
        || !fs::is_directory(p.standards / "parameters"))
        throw std::runtime_error(std::string(op) + ": this is a question ABOUT the"
            " installation catalogue, and '" + p.standards.string() + "' has no"
            " components/ and parameters/ -- a sealed case with no catalogue"
            " cannot be asked.  Run it from an installation (CHOUPO_HOME).");
    return p;
}

//  WHERE THIS CARD COMES FROM (DEV.md 4c C227 (a), architect's ruling).  The
//  lookups read the INSTALLATION catalogue by design -- their subject is the
//  catalogue -- so a SEALED case prints a card from a release that is not its
//  own unless the card says so.  One mandatory line on the card (priority 0,
//  never dropped) and one `catalogue` object in the result JSON carry: the
//  source, the installation's release (data/standards/CATALOGUE.dat), and the
//  case's seal state with the release its manifest names.
struct Provenance
{
    std::string cardLine;   //  one line of the card
    std::string json;       //  the `catalogue` JSON object
    std::string seal;       //  "sealed" | "unsealed"
    bool        differs = false;
};

Provenance provenanceOf(const Paths& P)
{
    std::string release = "undeclared";
    const fs::path cat = P.standards / "CATALOGUE.dat";
    if (fs::exists(cat))
    {
        try
        {
            DictPtr d = Dictionary::fromFile(cat.string());
            if (d->found("catalogue"))
                release = d->subDict("catalogue")->lookupWordOrDefault("release", "undeclared");
        }
        catch (const std::exception&) { /* stays undeclared: said, not hidden */ }
    }
    std::string seal = "unsealed", sealedRel;
    DictPtr m = records::nearestManifest();
    if (m && m->lookupWordOrDefault("sealed", "false") == "true")
    {
        seal = "sealed";
        sealedRel = m->lookupWordOrDefault("catalogueRelease", "undeclared");
    }
    const bool differs = (seal == "sealed" && sealedRel != release);

    Provenance r;
    r.seal = seal; r.differs = differs;
    r.cardLine = "  catalogue { source \"installation data/standards\"; release " + release
               + "; case " + seal + ";" + (seal == "sealed" ? " sealedRelease " + sealedRel + ";" : std::string()) + (differs ? " differs \"this card is from release " + release
                                  + ", NOT the release this case was sealed from\";" : std::string())
               + " }";
    r.json = "{ \"source\": \"" + jsonEsc(P.standards.string()) + "\", \"release\": \""
           + jsonEsc(release) + "\", \"caseSeal\": \"" + seal + "\", \"caseRelease\": "
           + (seal == "sealed" ? "\"" + jsonEsc(sealedRel) + "\"" : std::string("null"))
           + ", \"releaseDiffers\": " + (differs ? "true" : "false") + " }";
    return r;
}

//  First word after `CAS` in the head of a component record.
std::string casOfFile(const fs::path& f)
{
    std::ifstream in(f);
    std::string line;
    for (int i = 0; i < 80 && std::getline(in, line); ++i)
    {
        if (line.compare(0, 3, "CAS") == 0 && line.size() > 3
            && std::isspace(static_cast<unsigned char>(line[3])))
        {
            std::string w;
            for (std::size_t k = 4; k < line.size(); ++k)
            {
                const char c = line[k];
                if (c == ';' || std::isspace(static_cast<unsigned char>(c)))
                { if (!w.empty()) break; else continue; }
                w += c;
            }
            return w;
        }
    }
    return {};
}

std::vector<std::string> csvFields(const std::string& line)
{
    std::vector<std::string> f;
    std::string cur;
    bool q = false;
    for (std::size_t i = 0; i < line.size(); ++i)
    {
        const char c = line[i];
        if (q)
        {
            if (c == '"')
            {
                if (i + 1 < line.size() && line[i + 1] == '"') { cur += '"'; ++i; }
                else q = false;
            }
            else cur += c;
        }
        else if (c == '"') q = true;
        else if (c == ',') { f.push_back(cur); cur.clear(); }
        else cur += c;
    }
    f.push_back(cur);
    return f;
}

std::string unifacGroups(const DictPtr& d, std::vector<std::string>* names = nullptr);

struct Comp
{
    enum Kind { Catalogue, Lake, Unknown } kind = Unknown;
    std::string query, stem, how;           // how: name | alias | CAS
    fs::path    file;                        // catalogue record
    // lake row
    std::map<std::string, std::string> row;
};

Comp resolveComponent(const Paths& P, const Database* db, const std::string& tok)
{
    Comp c;
    c.query = tok;
    const fs::path comps = P.standards / "components";

    if (fs::exists(comps / (tok + ".dat")))
    { c.kind = Comp::Catalogue; c.stem = tok; c.how = "name"; c.file = comps / (tok + ".dat"); return c; }

    const std::string canon = db->canonicalName(tok);
    if (canon != tok && fs::exists(comps / (canon + ".dat")))
    { c.kind = Comp::Catalogue; c.stem = canon; c.how = "alias"; c.file = comps / (canon + ".dat"); return c; }

    if (looksLikeCAS(tok))
        for (const auto& e : fs::directory_iterator(comps))
            if (e.path().extension() == ".dat" && casOfFile(e.path()) == tok)
            { c.kind = Comp::Catalogue; c.stem = e.path().stem().string(); c.how = "CAS"; c.file = e.path(); return c; }

    //  The estimate lake, by its own file stem (the sanitised name).
    if (fs::exists(P.lake / "components" / (tok + ".dat")))
    {
        try
        {
            auto d = Dictionary::fromFile((P.lake / "components" / (tok + ".dat")).string());
            c.kind = Comp::Lake; c.how = "name"; c.stem = tok;
            c.row["name"]    = tok;
            c.row["CAS"]     = d->found("CAS") ? d->lookupWordOrDefault("CAS", "") : "";
            c.row["formula"] = d->found("formula") ? d->lookupWordOrDefault("formula", "") : "";
            c.row["unifac"]  = unifacGroups(d);
            for (auto kv : { std::make_pair("Tc", "Tc_K"), std::make_pair("Pc", "Pc_Pa"),
                             std::make_pair("omega", "omega"), std::make_pair("Tb", "Tb_K"),
                             std::make_pair("standardThermochemistry", "Hf_ig_Jmol"),
                             std::make_pair("idealGasHeatCapacity", "Cpig_a") })
                if (d->found(kv.first)) c.row[kv.second] = "y";   // presence only
            return c;
        }
        catch (const std::exception&) { /* fall through to the table */ }
    }

    //  The estimate lake: an EXACT (case-insensitive) match on a declared
    //  name, CAS or alias column of the row -- never on similarity.
    const fs::path csv = P.lake / "compounds.csv";
    if (fs::exists(csv))
    {
        std::ifstream in(csv);
        std::string line;
        std::getline(in, line);
        const auto head = csvFields(line);
        const std::string t = lower(tok);
        while (std::getline(in, line))
        {
            //  cheap pre-filter: the token must occur in the row at all
            if (lower(line).find(t) == std::string::npos) continue;
            const auto f = csvFields(line);
            if (f.size() < head.size() - 1) continue;
            std::map<std::string, std::string> row;
            for (std::size_t i = 0; i < head.size() && i < f.size(); ++i) row[head[i]] = f[i];
            bool hit = lower(row["name"]) == t || lower(row["CAS"]) == t
                    || lower(row["display_name"]) == t;
            if (!hit)
            {
                std::stringstream al(row["aliases"]);
                std::string a;
                while (std::getline(al, a, '|'))
                    if (lower(a) == t) { hit = true; break; }
            }
            if (hit)
            {
                c.kind = Comp::Lake; c.how = looksLikeCAS(tok) ? "CAS" : "name";
                c.stem = row["name"]; c.row = row;
                return c;
            }
        }
    }
    return c;
}

//  "CH3:1 CH2:2" from groups.unifac of a catalogue record; empty = none.
std::string unifacGroups(const DictPtr& d, std::vector<std::string>* names)
{
    if (!d->found("groups")) return {};
    auto g = d->subDict("groups");
    if (!g->hasDictList("unifac")) return {};
    std::string s;
    for (const auto& e : g->lookupDictList("unifac"))
    {
        if (!e->found("group")) continue;
        const std::string n = e->lookupWord("group");
        if (names) names->push_back(n);
        if (!s.empty()) s += ' ';
        s += n + ":" + (e->found("count") ? num(e->lookupScalar("count")) : "1");
    }
    return s;
}

std::set<std::string> unifacVocabulary(const Paths& P)
{
    std::set<std::string> v;
    const fs::path f = P.standards / "parameters" / "UNIFAC" / "groups.dat";
    if (!fs::exists(f)) return v;
    auto d = Dictionary::fromFile(f.string());
    if (d->hasDictList("subgroups"))
        for (const auto& e : d->lookupDictList("subgroups"))
            if (e->found("name")) v.insert(e->lookupWord("name"));
    return v;
}

// ------------------------------------------------------- pair records ----

struct Cand
{
    std::string model, stemFile, relPath, tierClass, origin, review, fitted;
    std::string citation, vTlo, vThi, vPlo, vPhi, nData, rms, ident, maxCorr;
    std::string verdict, heldN, aad, maxAAD;
    std::vector<std::string> dois;
    bool hasEvidence = false, hasFit = false, hasValidation = false, tier1local = false;
    bool unreadable = false;
};

std::string pstr(const DictPtr& d, const char* k)
{
    //  A record whose `k` is a block or a list (a private data/local record in
    //  a richer shape) has no single word to show: absent here, never a throw.
    try { return d->found(k) ? d->lookupWordOrDefault(k, "") : std::string(); }
    catch (const std::exception&) { return std::string(); }
}

Cand readCand(const fs::path& f, const std::string& model, const std::string& relPath,
              bool isLocal)
{
    Cand c;
    c.model = model; c.stemFile = f.stem().string(); c.relPath = relPath;
    c.tier1local = isLocal;
    DictPtr d;
    try { d = Dictionary::fromFile(f.string()); }
    catch (const std::exception&) { c.unreadable = true; c.tierClass = "curated"; return c; }

    if (d->found("model")) c.model = d->lookupWordOrDefault("model", model);
    DictPtr prov = d->found("provenance") ? d->subDict("provenance") : nullptr;
    auto pick = [&](const char* k) -> std::string
    { std::string s = prov ? pstr(prov, k) : std::string(); return s.empty() ? pstr(d, k) : s; };

    c.origin   = pick("origin");
    c.review   = pick("reviewStatus");
    c.fitted   = pick("fittedInCase");
    c.citation = pick("citation");
    if (c.citation.empty()) c.citation = pick("source");
    c.tierClass = c.fitted.empty() ? "curated" : "regressed";

    if (prov)
    {
        auto span = [&](const DictPtr& v, const char* lo, const char* hi,
                        const Dimensions& dm, std::string& a, std::string& b, double scale)
        {
            if (v->found(lo) && v->found(hi))
            { a = num(v->lookupScalar(lo, dm) * scale); b = num(v->lookupScalar(hi, dm) * scale); }
        };
        if (prov->found("validity"))
        {
            auto v = prov->subDict("validity");
            if (v->found("temperature"))
                span(v->subDict("temperature"), "min", "max", Dims::temperature, c.vTlo, c.vThi, 1.0);
            if (v->found("pressure"))
                span(v->subDict("pressure"), "min", "max", Dims::pressure, c.vPlo, c.vPhi, 1.0e-5);
        }
        else if (prov->found("validityRange"))
            span(prov->subDict("validityRange"), "Tmin", "Tmax", Dims::temperature, c.vTlo, c.vThi, 1.0);

        if (prov->found("nDataPoints") && prov->lookupScalar("nDataPoints") > 0)
        {
            c.hasFit = true;
            c.nData = num(prov->lookupScalar("nDataPoints"));
            if (prov->found("rms_K")) c.rms = num(prov->lookupScalar("rms_K"));
            c.ident = pstr(prov, "identifiable");
            if (prov->found("maxAbsCorr")) c.maxCorr = num(prov->lookupScalar("maxAbsCorr"));
        }
        if (prov->hasDictList("evidence"))
            for (const auto& e : prov->lookupDictList("evidence"))
                if (e->found("doi"))
                { c.dois.push_back(e->lookupWord("doi")); c.hasEvidence = true; }
    }
    if (d->found("validation"))
    {
        auto v = d->subDict("validation");
        c.verdict = pstr(v, "verdict");
        if (v->found("heldOut"))
        {
            auto h = v->subDict("heldOut");
            if (h->found("points")) c.heldN = num(h->lookupScalar("points"));
            if (h->found("aad_pct")) c.aad = num(h->lookupScalar("aad_pct"));
        }
        if (v->found("acceptance") && v->subDict("acceptance")->found("maxAAD"))
            c.maxAAD = num(v->subDict("acceptance")->lookupScalar("maxAAD"));
        c.hasValidation = !c.verdict.empty();
    }
    return c;
}

void emitCandidate(Card& card, const Cand& c)
{
    const std::string pasteKey = c.stemFile;
    card.add(0, "    {");
    card.add(0, "      model " + c.model + "; class " + c.tierClass + (c.tier1local ? "; tierDir local;" : ";"));
    card.add(0, "      paste { " + pasteKey + " { source \"" + c.relPath + "\"; } }");
    if (c.unreadable)
        card.add(0, "      note \"record present but not readable as a dictionary; read it before use\";");
    card.add(1, "      origin " + (c.origin.empty() ? std::string("undeclared") : c.origin)
                + "; reviewStatus " + (c.review.empty() ? std::string("undeclared") : c.review) + ";");
    if (!c.vTlo.empty() || !c.vPlo.empty())
    {
        std::string v = "      validity {";
        if (!c.vTlo.empty()) v += " T_K (" + c.vTlo + " " + c.vThi + ");";
        if (!c.vPlo.empty()) v += " P_bar (" + c.vPlo + " " + c.vPhi + ");";
        card.add(2, v + " }");
    }
    if (!c.fitted.empty())
        card.add(1, "      fittedInCase \"" + clean(c.fitted, 90) + "\";");
    if (c.hasValidation)
    {
        std::string v = "      validation { verdict " + c.verdict + ";";
        if (!c.heldN.empty()) v += " heldOutPoints " + c.heldN + ";";
        if (!c.aad.empty()) v += " aad_pct " + c.aad + ";";
        if (!c.maxAAD.empty()) v += " maxAAD " + c.maxAAD + ";";
        card.add(2, v + " }");
    }
    if (c.hasFit)
    {
        std::string v = "      fit { nDataPoints " + c.nData + ";";
        if (!c.rms.empty()) v += " rms_K " + c.rms + ";";
        if (!c.ident.empty()) v += " identifiable " + c.ident + ";";
        if (!c.maxCorr.empty()) v += " maxAbsCorr " + c.maxCorr + ";";
        card.add(3, v + " }");
    }
    if (c.hasEvidence)
    {
        std::string v = "      evidence { studies " + std::to_string(c.dois.size()) + "; doi (";
        for (const auto& s : c.dois) v += " \"" + clean(s, 40) + "\"";
        card.add(3, v + " ); }");
    }
    if (!c.citation.empty())
        card.add(4, "      citation \"" + clean(c.citation, 110) + "\";");
    card.add(0, "    }");
}

} // namespace

// ----------------------------------------------------------- publishing ----

void LookupBase::publish(const std::string& opName, const std::string& kind,
                         const std::string& tier, const std::string& card,
                         const std::string& provJson, int verbosity)
{
    //  The card must be a dictionary this engine reads back (the Explorer and
    //  any program read the same text): parse it before publishing.
    try { (void)Dictionary::fromString(card, "evidenceCard"); }
    catch (const std::exception& e)
    { throw std::runtime_error("evidence card does not parse back: " + std::string(e.what())); }

    tier_ = tier;
    diag_["card_bytes"]   = static_cast<scalar>(card.size());
    diag_["budget_bytes"] = static_cast<scalar>(kLookupCardBudgetBytes);
    block_ = "{ \"op\": \"" + jsonEsc(opName) + "\", \"kind\": \"" + kind
           + "\", \"tier\": \"" + tier + "\", \"bytes\": " + std::to_string(card.size())
           + ", \"budgetBytes\": " + std::to_string(kLookupCardBudgetBytes)
           + ", \"catalogue\": " + provJson
           + ", \"card\": \"" + jsonEsc(card) + "\" }";
    if (verbosity >= 1) std::cout << card;
}

// ---------------------------------------------------------- pairLookup ----

int PairLookup::run(const DictPtr& dict, const ThermoPackage&, int verbosity)
{
    const Paths P = catalogue(database(), "pairLookup");
    const auto names = dict->lookupWordList("components");
    if (names.size() != 2 || names[0] == names[1])
        throw std::runtime_error("pairLookup: `components ( A B );` needs TWO different components");
    const std::string opName = dict->lookupWordOrDefault("name", "pairLookup");

    const Comp a = resolveComponent(P, database(), names[0]);
    const Comp b = resolveComponent(P, database(), names[1]);

    //  ---- rungs 1 and 2: a catalogue pair record ---------------------------
    std::vector<Cand> cands;
    if (a.kind == Comp::Catalogue && b.kind == Comp::Catalogue)
    {
        std::vector<std::pair<fs::path, bool>> trees;
        trees.push_back({ P.standards / "parameters", false });
        if (fs::is_directory(P.local / "parameters")) trees.push_back({ P.local / "parameters", true });
        for (const auto& [tree, isLocal] : trees)
        {
            std::vector<fs::path> models;
            for (const auto& e : fs::directory_iterator(tree))
                if (e.is_directory()) models.push_back(e.path());
            std::sort(models.begin(), models.end());
            for (const auto& m : models)
            {
                const std::string mn = m.filename().string();
                if (mn == "UNIFAC") continue;
                for (const std::string& stem : { a.stem + "-" + b.stem, b.stem + "-" + a.stem })
                {
                    const fs::path f = m / (stem + ".dat");
                    if (!fs::exists(f)) continue;
                    const std::string rel = std::string(isLocal ? "data/local/parameters/"
                                                                 : "data/standards/parameters/")
                                          + mn + "/" + stem + ".dat";
                    cands.push_back(readCand(f, mn, rel, isLocal));
                    break;
                }
            }
        }
    }

    Card card;
    const std::string pairWords = "(" + (a.kind == Comp::Unknown ? names[0] : a.stem)
                                + " " + (b.kind == Comp::Unknown ? names[1] : b.stem) + ")";
    card.add(0, "evidenceCard");
    card.add(0, "{");
    card.add(0, "  schema 1; kind pair; pair " + pairWords + ";");
    const Provenance prov = provenanceOf(P);
    card.add(0, prov.cardLine);
    caseSeal_ = prov.seal; releaseDiffers_ = prov.differs ? "true" : "false";

    std::string tier;
    std::vector<std::string> absent;

    if (!cands.empty())
    {
        bool anyCurated = false;
        for (const auto& c : cands) if (c.tierClass == "curated") anyCurated = true;
        tier = anyCurated ? "curated" : "regressed";
        card.add(0, "  tier " + tier + ";");
        card.add(0, std::string("  say \"") + (tier == "curated"
            ? "Catalogue pair record found; paste the entry, no coefficient is typed by hand."
            : "Choupo's own regression, interim; read the case and verdict before citing.") + "\";");
        card.add(0, "  records");
        card.add(0, "  (");
        //  best first: curated before regressed, then by model name
        //  (the activity-model and EoS pair records a case selects with
        //  `binaryParameters` first; other families -- a Henry or van't Hoff
        //  entry that happens to share the pair's name -- after them)
        auto rank = [](const Cand& x)
        {
            const int cls = x.tierClass == "curated" ? 0 : 1;
            const bool act = x.model == "NRTL" || x.model == "UNIQUAC" || x.model == "Wilson";
            return cls + (act ? 0 : 2);
        };
        std::stable_sort(cands.begin(), cands.end(), [&](const Cand& x, const Cand& y)
        { return rank(x) < rank(y); });
        const std::size_t show = std::min<std::size_t>(cands.size(), 3);
        for (std::size_t i = 0; i < show; ++i) emitCandidate(card, cands[i]);
        card.add(0, "  );");
        if (cands.size() > show)
            card.add(0, "  moreRecords " + std::to_string(cands.size() - show) + ";");
        const Cand& best = cands.front();
        if (best.dois.empty()) absent.push_back("studies");
        absent.push_back("laboratories");
        absent.push_back("archiveSha256");
        absent.push_back("extractionFilter");
        absent.push_back("fitAAD");
        if (!best.hasValidation) absent.push_back("validationAAD");
        if (best.ident.empty()) absent.push_back("identifiability");
        if (best.fitted.empty()) absent.push_back("fittedInCase");
    }
    else
    {
        std::vector<std::string> ga, gb, miss;
        std::string sa, sb;
        const auto vocab = unifacVocabulary(P);
        if (a.kind == Comp::Catalogue) sa = unifacGroups(Dictionary::fromFile(a.file.string()), &ga);
        if (b.kind == Comp::Catalogue) sb = unifacGroups(Dictionary::fromFile(b.file.string()), &gb);
        for (const auto& g : ga) if (!vocab.count(g)) miss.push_back(g);
        for (const auto& g : gb) if (!vocab.count(g)) miss.push_back(g);

        if (!sa.empty() && !sb.empty() && miss.empty())
        {
            tier = "estimate";
            card.add(0, "  tier estimate;");
            card.add(0, "  say \"No fitted pair. UNIFAC is a predictive ESTIMATE from group contributions, not a measured or regressed pair.\";");
            card.add(0, "  paste { activityModel { model UNIFAC; } }");
            card.add(0, "  warn \"Weak for azeotropes and partial miscibility: measured here, UNIFAC misses Perry Table 15-8 (water + acetic acid + MIBK) by 3-6 percentage points (DEV.md C219).\";");
            card.add(1, "  groups { " + a.stem + " \"" + clean(sa, 70) + "\"; " + b.stem + " \"" + clean(sb, 70) + "\"; }");
            card.add(2, "  scope \"Assembly refuses by name if the published UNIFAC interaction table lacks a group pair.\";");
            absent = { "studies", "laboratories", "archiveSha256", "extractionFilter", "fitAAD",
                       "validationAAD", "identifiability" };
        }
        else
        {
            tier = "none";
            std::string why;
            for (const Comp* c : { &a, &b })
            {
                if (c->kind == Comp::Unknown) why += " " + c->query + ": not in the catalogue or the estimate lake.";
                else if (c->kind == Comp::Lake) why += " " + c->query + ": only in the group-estimate lake, not a curated component.";
            }
            if (why.empty() && (sa.empty() || sb.empty())) why = " A component has no UNIFAC groups.";
            if (why.empty() && !miss.empty()) why = " A group is not in the UNIFAC table.";
            card.add(0, "  tier none;");
            card.add(0, "  say \"I do not have this pair: no catalogue pair record, and no UNIFAC estimate possible." + clean(why, 160) + " No number is offered.\";");
            card.add(0, "  archive \"The measurement-archive rung (servable but not yet fitted) does not exist in this release; it is slice (b).\";");
            card.add(1, "  bring \"Measured VLE or LLE data from a paper you read (cite it), as a case's experiments file, then a fitParameters case: docs/ai/validating-against-data.md.\";");
            absent = { "studies", "laboratories", "archiveSha256", "extractionFilter", "fitAAD",
                       "validationAAD", "identifiability" };
        }
    }

    std::string ab = "  announcedAbsent (";
    for (const auto& s : absent) ab += " " + s;
    card.add(1, ab + " );");
    card.add(0, "}");

    publish(opName, "pair", tier, card.fit(kLookupCardBudgetBytes), prov.json, verbosity);
    diag_["n_records"] = static_cast<scalar>(cands.size());
    return 0;
}

// ------------------------------------------------------- componentLookup ----

int ComponentLookup::run(const DictPtr& dict, const ThermoPackage&, int verbosity)
{
    const Paths P = catalogue(database(), "componentLookup");
    const std::string q = dict->lookupWord("component");
    const std::string opName = dict->lookupWordOrDefault("name", "componentLookup");
    const Comp c = resolveComponent(P, database(), q);

    Card card;
    card.add(0, "evidenceCard");
    card.add(0, "{");
    card.add(0, "  schema 1; kind component; query \"" + clean(q, 60) + "\"; resolvedBy "
                + (c.kind == Comp::Unknown ? std::string("none") : c.how) + ";");
    const Provenance prov = provenanceOf(P);
    card.add(0, prov.cardLine);
    caseSeal_ = prov.seal; releaseDiffers_ = prov.differs ? "true" : "false";
    std::string tier;

    if (c.kind == Comp::Catalogue)
    {
        tier = "catalogue";
        auto d = Dictionary::fromFile(c.file.string());
        DictPtr prov = d->found("provenance") ? d->subDict("provenance") : nullptr;
        std::string rs = pstr(d, "reviewStatus");
        if (rs.empty() && prov) rs = pstr(prov, "reviewStatus");
        card.add(0, "  tier catalogue;");
        card.add(0, "  identity { name " + c.stem + "; CAS " + (d->found("CAS") ? pstr(d, "CAS") : std::string("undeclared"))
                    + "; formula " + (d->found("formula") ? pstr(d, "formula") : std::string("undeclared"))
                    + (d->found("MW") ? "; MW " + num(d->lookupScalar("MW"), "%.8g") : std::string()) + "; }");
        card.add(0, "  record \"data/standards/components/" + c.stem + ".dat\"; reviewStatus "
                    + (rs.empty() ? std::string("undeclared") : rs) + ";");
        static const char* keys[] = { "Tc", "Pc", "omega", "Tb", "HvapTb", "Vliq",
            "standardThermochemistry", "vaporPressure", "idealGasHeatCapacity",
            "liquidHeatCapacity", "liquidViscosity", "liquidThermalConductivity",
            "solubilityParameter", "cosmo", "pcsaft" };
        std::string have = "  present (", lack = "  missing (";
        for (const char* k : keys) (d->found(k) ? have : lack) += std::string(" ") + k;
        const std::string ug = unifacGroups(d);
        (ug.empty() ? lack : have) += " groups.unifac";
        const bool jb = d->found("groups") && d->subDict("groups")->hasDictList("joback");
        (jb ? have : lack) += " groups.joback";
        card.add(0, have + " );");
        card.add(0, lack + " );");
        if (d->found("vaporPressure"))
        {
            auto v = d->subDict("vaporPressure");
            std::string s = "  vaporPressure { model " + v->lookupWordOrDefault("model", "undeclared") + ";";
            if (v->found("Trange"))
            {
                auto t = v->lookupList("Trange");
                if (t.size() == 2) s += " Trange_K (" + num(t[0]) + " " + num(t[1]) + ");";
            }
            card.add(1, s + " }");
        }
        if (!ug.empty()) card.add(1, "  groups { unifac \"" + clean(ug, 100) + "\"; }");
        card.add(0, "  say \"Values are in the record; this card lists what exists, never the numbers. Use the name in components ( ... ).\";");
    }
    else if (c.kind == Comp::Lake)
    {
        tier = "estimateLake";
        const auto& r = c.row;
        auto get = [&](const char* k) { auto it = r.find(k); return it == r.end() ? std::string() : it->second; };
        card.add(0, "  tier estimateLake;");
        card.add(0, "  identity { name \"" + clean(get("name"), 50) + "\"; CAS " + (get("CAS").empty() ? std::string("undeclared") : get("CAS"))
                    + "; formula " + (get("formula").empty() ? std::string("undeclared") : clean(get("formula"), 30)) + "; }");
        card.add(0, "  say \"Group-estimate lake, NOT reviewed: identity and UNIFAC groups are facts; every property number is a Joback / Lee-Kesler estimate and is not given here. It is not a curated component and a case cannot use it by name until it is curated (docs/ai/curation-protocol.md).\";");
        if (!get("unifac").empty()) card.add(1, "  groups { unifac \"" + clean(get("unifac"), 100) + "\"; }");
        std::string have = "  estimated (";
        for (const char* k : { "Tc_K", "Pc_Pa", "omega", "Tb_K", "Hf_ig_Jmol", "Cpig_a" })
            if (!get(k).empty()) have += std::string(" ") + k;
        card.add(2, have + " );");
    }
    else
    {
        tier = "none";
        card.add(0, "  tier none;");
        card.add(0, "  say \"I do not have this compound: not in the catalogue (name, alias or CAS) and not in the estimate lake. No number is offered.\";");
        card.add(1, "  bring \"Tc, Pc, omega and vapour pressure from a source you cite, as a case-local constant/components/<name>.dat, or an estimateComponent run from its groups: docs/ai/curation-protocol.md.\";");
    }
    card.add(0, "}");

    publish(opName, "component", tier, card.fit(kLookupCardBudgetBytes), prov.json, verbosity);
    return 0;
}

} // namespace Choupo
