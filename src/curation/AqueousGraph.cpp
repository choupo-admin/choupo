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

    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
\*---------------------------------------------------------------------------*/

#include "AqueousGraph.H"

#include "../thermo/Database.H"
#include "../thermo/RecordResolver.H"
#include "../core/Dictionary.H"

#include <algorithm>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>

namespace fs = std::filesystem;

namespace Choupo
{
namespace electrolyte
{

namespace
{

//- The navigation ontology: curated, outside data/standards/, read ONLY here.
//  Absence is tolerated -- the graph is still complete, the views just lose
//  their family grouping, and the finding says so.
struct Navigation
{
    std::map<std::string, std::vector<std::string>> roots;
    std::map<std::string, std::string>              role;
    std::vector<std::string>                        topics;
    bool                                            found = false;
};

Navigation loadNavigation(std::vector<std::string>& findings)
{
    Navigation nav;
    const fs::path p = fs::path(Database::currentRoot()).parent_path()
                     / "metadata" / "aqueous-navigation.dat";
    if (!fs::exists(p))
    {
        findings.push_back("navigation ontology absent (" + p.string()
            + ") -- the graph is complete, family grouping is not");
        return nav;
    }

    const DictPtr d = Dictionary::fromFile(p.string());
    nav.found = true;

    if (d->found("speciesNavigation"))
    {
        const DictPtr sn = d->subDict("speciesNavigation");
        for (const auto& key : sn->keys())
        {
            const DictPtr e = sn->subDict(key);
            if (e->found("familyRoots"))
                for (const auto& w : e->lookupWordList("familyRoots"))
                    nav.roots[key].push_back(w);
            if (e->found("navigationRole"))
                nav.role[key] = e->lookupWord("navigationRole");
        }
    }
    if (d->found("topicVocabulary"))
        nav.topics = d->lookupWordList("topicVocabulary");

    return nav;
}

//- The topic a record type implies unambiguously; empty when it needs curation
std::string derivedTopic(const std::string& recordType,
                         const std::string& product,
                         const std::vector<std::pair<std::string, double>>& mas,
                         double nuWater)
{
    if (recordType == "gasLiquidEquilibrium")   return "gasDissolution";
    if (recordType == "ionExchangeEquilibrium") return "ionExchange";
    if (recordType != "aqueousSpeciation")      return "";

    if (product == "OH")                        return "waterDissociation";

    // A metal + water forming a hydroxo species is hydrolysis; a proton
    // shuffled onto/off a single master is acid-base; anything joining two
    // distinct non-proton masters is complexation.
    std::size_t heavy = 0;
    for (const auto& m : mas) if (m.first != "H" && m.first != "OH") ++heavy;
    if (nuWater > 0.0 && heavy == 1) return "hydrolysis";
    if (heavy >= 2)                  return "complexation";
    if (heavy == 1)                  return "acidBase";
    return "";
}

std::string jsonEscape(const std::string& s)
{
    std::string o;
    for (char c : s)
    {
        if (c == '"' || c == '\\') { o += '\\'; o += c; }
        else if (c == '\n')        { o += "\\n"; }
        else                       { o += c; }
    }
    return o;
}

void jsonArray(std::ostream& os, const std::vector<std::string>& v)
{
    os << "[";
    for (std::size_t i = 0; i < v.size(); ++i)
        os << (i ? ", " : "") << '"' << jsonEscape(v[i]) << '"';
    os << "]";
}

} // anonymous namespace


const GraphSpecies* AqueousGraph::find(const std::string& id) const
{
    for (const auto& s : species_) if (s.id == id) return &s;
    return nullptr;
}


AqueousGraph AqueousGraph::build()
{
    AqueousGraph g;
    const Navigation nav = loadNavigation(g.findings_);

    // ---- 1. master species: one record, one identity ----------------------
    for (const auto& f : records::scanRecordDir("species"))
    {
        const DictPtr d = Dictionary::fromFile(f.string());
        if (d->lookupWordOrDefault("recordType", "") != "modelSpecies") continue;

        GraphSpecies s;
        s.id       = d->lookupWordOrDefault("name", f.stem().string());
        s.formula  = d->lookupWordOrDefault("formula", "");
        s.charge   = d->lookupScalarOrDefault("charge", 0.0);
        s.home     = "species/" + f.filename().string();
        s.isMaster = true;

        const auto r = nav.roots.find(s.id);
        if (r != nav.roots.end()) s.families = r->second;
        else if (nav.found)
            g.findings_.push_back("master species '" + s.id
                + "' has no familyRoots -- invisible to every family view");

        const auto ro = nav.role.find(s.id);
        if (ro != nav.role.end()) s.navigationRole = ro->second;

        g.species_.push_back(s);
    }

    // ---- 2. equilibria, and the identities their records declare ----------
    for (const auto& f : records::scanRecordDir("chemistry"))
    {
        const DictPtr d = Dictionary::fromFile(f.string());
        const std::string rt = d->lookupWordOrDefault("recordType", "");

        GraphReaction rx;
        rx.id         = f.stem().string();
        rx.recordType = rt;
        rx.home       = "chemistry/" + f.filename().string();
        rx.source     = d->lookupWordOrDefault("source", "undeclared");

        if (rt == "aqueousSpeciation")
        {
            rx.product = d->lookupWord("species");
            rx.nuWater = d->lookupScalarOrDefault("nuWater", 0.0);
            rx.logK25  = d->lookupScalarOrDefault("logK25", 0.0);
            rx.hasDH   = d->found("dH");
            if (rx.hasDH) rx.dH = d->lookupScalar("dH");

            if (d->found("masters"))
                for (const auto& m : d->lookupDictList("masters"))
                    rx.masters.emplace_back(m->lookupWord("ion"),
                                            m->lookupScalar("nu"));

            // The identity this record declares inline -- a node in its own
            // right unless a species/ file already owns the same id (the six
            // doubly-declared ones; the identity gate keeps them coherent).
            if (!g.find(rx.product))
            {
                GraphSpecies s;
                s.id      = rx.product;
                s.formula = d->lookupWordOrDefault("ion", "");
                s.charge  = d->lookupScalarOrDefault("z", 0.0);
                s.home    = rx.home + " (declared by its reaction)";
                g.species_.push_back(s);
            }
        }
        else if (rt == "gasLiquidEquilibrium")
        {
            rx.product = d->lookupWordOrDefault("dissolved", "");
            rx.logK25  = d->lookupScalarOrDefault("logK25", 0.0);
            rx.hasDH   = d->found("dH");
            if (rx.hasDH) rx.dH = d->lookupScalar("dH");
            rx.masters.emplace_back(d->lookupWordOrDefault("gas", ""), 1.0);
        }
        else if (rt == "ionExchangeEquilibrium")
        {
            rx.product = d->lookupWordOrDefault("exchangeSpecies",
                                                f.stem().string());
            rx.logK25  = d->lookupScalarOrDefault("logK25", 0.0);
        }
        else continue;

        g.reactions_.push_back(rx);
    }

    // ---- 3. family propagation -- mediators must not dominate -------------
    for (auto& rx : g.reactions_)
    {
        std::set<std::string> plain, mediated;
        for (const auto& [id, nu] : rx.masters)
        {
            (void)nu;
            const GraphSpecies* s = g.find(id);
            if (!s) continue;
            auto& sink = s->navigationRole.empty() ? plain : mediated;
            for (const auto& fam : s->families) sink.insert(fam);
        }
        const std::set<std::string>& chosen = plain.empty() ? mediated : plain;
        rx.families.assign(chosen.begin(), chosen.end());
        rx.topic = derivedTopic(rx.recordType, rx.product, rx.masters,
                                rx.nuWater);

        // A derived species inherits the families of the reaction forming it
        for (auto& s : g.species_)
            if (s.id == rx.product && !s.isMaster && s.families.empty())
                s.families = rx.families;
    }

    // ---- 4. interaction parameters: references DERIVED from named roles ---
    const std::vector<std::string> paramDirs
    {
        "parameters/Pitzer/pairs", "parameters/Pitzer/theta",
        "parameters/Pitzer/psi",   "parameters/Pitzer/lambda",
        "parameters/Pitzer/zeta",  "parameters/eNRTL"
    };
    for (const auto& sub : paramDirs)
    {
        for (const auto& f : records::scanRecordDir(sub))
        {
            const DictPtr d = Dictionary::fromFile(f.string());
            const std::string rt = d->lookupWordOrDefault("recordType", "");
            if (rt != "electrolytePairParameters"
             && rt != "electrolyteMixingParameter"
             && rt != "electrolyteNRTLParameters") continue;

            GraphParameter p;
            p.model  = d->lookupWordOrDefault("model", rt);
            p.kind   = d->lookupWordOrDefault("kind", "pair");
            p.source = d->lookupWordOrDefault("source", "undeclared");
            p.home   = sub + "/" + f.filename().string();

            // The file keeps the roles of its own formulation; we only derive
            for (const char* role : {"cation", "anion", "neutral", "solvent"})
            {
                if (!d->found("pair")) break;
                const DictPtr pr = d->subDict("pair");
                if (pr->found(role))
                {
                    p.referencedSpecies.push_back(pr->lookupWord(role));
                    p.roles += (p.roles.empty() ? "" : " ")
                             + std::string(role) + "=" + pr->lookupWord(role);
                }
            }
            for (const char* role : {"a", "b", "c"})
                if (d->found(role))
                {
                    p.referencedSpecies.push_back(d->lookupWord(role));
                    p.roles += (p.roles.empty() ? "" : " ")
                             + std::string(role) + "=" + d->lookupWord(role);
                }

            for (const auto& id : p.referencedSpecies)
                if (!g.find(id))
                    g.findings_.push_back(p.home + " references species '" + id
                        + "', which the registry does not know");

            g.params_.push_back(p);
        }
    }

    return g;
}


std::set<std::string> AqueousGraph::familiesOf(const std::string& fam) const
{
    std::set<std::string> ids;
    for (const auto& s : species_)
        if (std::find(s.families.begin(), s.families.end(), fam)
            != s.families.end()) ids.insert(s.id);
    return ids;
}


int AqueousGraph::printFamily(const std::string& fam) const
{
    const std::set<std::string> ids = familiesOf(fam);

    std::vector<const GraphReaction*> rxs;
    for (const auto& r : reactions_)
        if (std::find(r.families.begin(), r.families.end(), fam)
            != r.families.end()) rxs.push_back(&r);

    if (ids.empty() && rxs.empty())
    {
        std::cout << "aqueous family '" << fam << "' is not in the graph.\n"
                  << "Known families: ";
        std::set<std::string> all;
        for (const auto& s : species_)
            for (const auto& f : s.families) all.insert(f);
        for (const auto& f : all) std::cout << f << " ";
        std::cout << "\n";
        return 1;
    }

    std::cout << "\n===== aqueous family: " << fam << " ====="
              << "\n(a VIEW assembled from the atomic records -- a reaction may"
                 " appear\n in more than one family; nothing here is stored"
                 " twice)\n";

    std::cout << "\n-- species (" << ids.size() << ") --\n";
    std::cout << "   " << std::left << std::setw(12) << "id"
              << std::setw(14) << "formula" << std::setw(8) << "charge"
              << "home\n";
    for (const auto& id : ids)
    {
        const GraphSpecies* s = find(id);
        if (!s) continue;
        std::cout << "   " << std::left << std::setw(12) << s->id
                  << std::setw(14) << (s->formula.empty() ? "-" : s->formula)
                  << std::setw(8) << (s->charge == 0.0 ? std::string("0")
                     : (s->charge > 0 ? "+" : "-")
                       + std::to_string(int(std::abs(s->charge))))
                  << s->home;
        if (!s->navigationRole.empty())
            std::cout << "   [" << s->navigationRole << "]";
        std::cout << "\n";
    }

    std::cout << "\n-- equilibria (" << rxs.size() << ") --\n";
    for (const auto* r : rxs)
    {
        std::cout << "   " << std::left << std::setw(24) << r->id
                  << std::setw(15) << (r->topic.empty() ? "-" : r->topic)
                  << "logK25 " << std::setw(10) << r->logK25;
        if (r->hasDH) std::cout << "  dH " << std::setw(9) << r->dH;
        std::cout << "\n        " << r->product << "  <-  ";
        for (const auto& [id, nu] : r->masters)
            std::cout << (nu < 0 ? "" : "+") << nu << " " << id << "  ";
        if (r->nuWater != 0.0) std::cout << "(" << r->nuWater << " H2O)";
        std::cout << "\n        families:";
        for (const auto& f : r->families) std::cout << " " << f;
        std::cout << "   src: " << r->source.substr(0, 68) << "\n";
    }

    std::vector<const GraphParameter*> ps;
    for (const auto& p : params_)
        for (const auto& id : p.referencedSpecies)
            if (ids.count(id)) { ps.push_back(&p); break; }

    std::cout << "\n-- interaction parameters mentioning this family ("
              << ps.size() << ") --\n";
    for (const auto* p : ps)
        std::cout << "   " << std::left << std::setw(10) << p->model
                  << std::setw(10) << p->kind << std::setw(30) << p->roles
                  << p->home << "\n";

    if (!findings_.empty())
    {
        std::cout << "\n-- findings --\n";
        for (const auto& f : findings_) std::cout << "   " << f << "\n";
    }
    std::cout << "\n";
    return 0;
}


void AqueousGraph::printFamilyIndex() const
{
    std::map<std::string, std::pair<int, int>> tally;   // family -> (sp, rx)
    for (const auto& s : species_)
        for (const auto& f : s.families) tally[f].first++;
    for (const auto& r : reactions_)
        for (const auto& f : r.families) tally[f].second++;

    std::cout << "\naqueous families (" << tally.size() << ") -- "
              << species_.size() << " species, " << reactions_.size()
              << " equilibria, " << params_.size() << " parameters\n\n";
    std::cout << "   " << std::left << std::setw(16) << "family"
              << std::setw(10) << "species" << "equilibria\n";
    for (const auto& [f, c] : tally)
        std::cout << "   " << std::left << std::setw(16) << f
                  << std::setw(10) << c.first << c.second << "\n";
    std::cout << "\nchoupoProps --family <name>   for one family's full story\n\n";
}


void AqueousGraph::writeJson(const std::string& path) const
{
    std::ofstream os(path);
    if (!os) throw std::runtime_error("AqueousGraph: cannot write " + path);

    os << "{\n  \"generatedBy\": \"choupoProps --aqueous-graph\",\n";
    os << "  \"note\": \"physical graph from the engine's own record reader;"
          " families are a navigation view, not a storage layout\",\n";

    os << "  \"species\": [\n";
    for (std::size_t i = 0; i < species_.size(); ++i)
    {
        const auto& s = species_[i];
        os << "    { \"id\": \"" << jsonEscape(s.id) << "\", \"formula\": \""
           << jsonEscape(s.formula) << "\", \"charge\": " << s.charge
           << ", \"isMaster\": " << (s.isMaster ? "true" : "false")
           << ", \"home\": \"" << jsonEscape(s.home) << "\", \"families\": ";
        jsonArray(os, s.families);
        if (!s.navigationRole.empty())
            os << ", \"navigationRole\": \"" << s.navigationRole << "\"";
        os << " }" << (i + 1 < species_.size() ? "," : "") << "\n";
    }
    os << "  ],\n  \"reactions\": [\n";
    for (std::size_t i = 0; i < reactions_.size(); ++i)
    {
        const auto& r = reactions_[i];
        os << "    { \"id\": \"" << jsonEscape(r.id) << "\", \"recordType\": \""
           << r.recordType << "\", \"product\": \"" << jsonEscape(r.product)
           << "\", \"masters\": [";
        for (std::size_t k = 0; k < r.masters.size(); ++k)
            os << (k ? ", " : "") << "{ \"species\": \""
               << jsonEscape(r.masters[k].first) << "\", \"nu\": "
               << r.masters[k].second << " }";
        os << "], \"nuWater\": " << r.nuWater
           << ", \"logK25\": " << r.logK25;
        if (r.hasDH) os << ", \"dH\": " << r.dH;
        os << ", \"topic\": \"" << r.topic << "\", \"families\": ";
        jsonArray(os, r.families);
        os << ", \"home\": \"" << jsonEscape(r.home)
           << "\", \"source\": \"" << jsonEscape(r.source) << "\" }"
           << (i + 1 < reactions_.size() ? "," : "") << "\n";
    }
    os << "  ],\n  \"parameters\": [\n";
    for (std::size_t i = 0; i < params_.size(); ++i)
    {
        const auto& p = params_[i];
        os << "    { \"model\": \"" << p.model << "\", \"kind\": \"" << p.kind
           << "\", \"roles\": \"" << jsonEscape(p.roles)
           << "\", \"referencedSpecies\": ";
        jsonArray(os, p.referencedSpecies);
        os << ", \"home\": \"" << jsonEscape(p.home) << "\" }"
           << (i + 1 < params_.size() ? "," : "") << "\n";
    }
    os << "  ],\n  \"findings\": ";
    jsonArray(os, findings_);
    os << "\n}\n";
}

} // namespace electrolyte
} // namespace Choupo
