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

#include "Database.H"
#include "ThermoAnnounce.H"

#include <iostream>

#include <cstdlib>
#include <filesystem>
#include <stdexcept>

namespace Choupo {

namespace fs = std::filesystem;

std::string Database::resolveRoot(const std::string& explicitRoot) const
{
    auto check = [](const fs::path& p) -> bool
    {
        return fs::exists(p / "standards" / "components")
            && fs::is_directory(p / "standards" / "components");
    };

    // A fully SELF-CONTAINED case (Choupo-2607 data strategy) carries its own
    // constant/propertyData/ snapshot and needs NO installation catalogue --
    // so an absent standards/ must not stop the run.  Detect the snapshot by
    // walking UP from the cwd; when present, accept a catalogue-less root (the
    // relocation test: move the case anywhere, hide the catalogue, it still runs).
    auto caseHasSnapshot = []() -> bool
    {
        fs::path p = fs::current_path();
        for (int up = 0; up < 8; ++up)
        {
            if (fs::exists(p / "constant" / "propertyData" / "manifest.dat"))
                return true;
            fs::path par = p.parent_path();
            if (par == p) break;
            p = par;
        }
        return false;
    };

    if (!explicitRoot.empty())
    {
        if (check(explicitRoot) || caseHasSnapshot()) return explicitRoot;
        throw std::runtime_error("Database: explicit root '" + explicitRoot
            + "' does not contain a 'components/' sub-directory");
    }

    if (const char* env = std::getenv("CHOUPO_HOME"))
    {
        fs::path p = fs::path(env) / "data";
        if (check(p)) return p.string();
    }

    if (check("data"))          return "data";
    if (check("../data"))       return "../data";
    if (check("../../data"))    return "../../data";
    if (check("../../../data")) return "../../../data";

    throw std::runtime_error(
        "Database: cannot find data/standards/components.  "
        "Set CHOUPO_HOME or run from a directory that has 'data/' "
        "in the cwd or a parent up to three levels up.");
}

Database::Database(const std::string& explicitRoot)
:   root_(resolveRoot(explicitRoot))
{
    current_ = root_;     // expose globally for ActivityModel file lookup
}

Database::ResolvedComponentDict
Database::applyCaseOverlay(const std::string& name, DictPtr baseDict,
                           const std::string& baseFile)
{
    ResolvedComponentDict out;
    out.dict     = baseDict;
    out.baseFile = baseFile;
    // Walk UP from the cwd (fractal cascade) for a case-local partial overlay.
    fs::path p = fs::current_path();
    for (int up = 0; up < 6; ++up)
    {
        fs::path cand = p / "constant" / "components" / (name + ".dat");
        if (fs::exists(cand))
        {
            auto ov = Dictionary::fromFile(cand.string());
            if (ov->found("overlayOf"))
            {
                const std::string of = ov->lookupWord("overlayOf");
                if (of != name)
                    throw std::runtime_error(
                        "component overlay " + cand.string() + ": `overlayOf "
                        + of + "` does not match the component '" + name
                        + "' it patches.");
                baseDict->deepMerge(ov, &out.overlaidPaths);  // skips the overlayOf key
                baseDict->erase("overlayOf");                 // loader metadata, never thermo data
                out.overlayFile = cand.string();
            }
            break;   // a case-local file WITHOUT overlayOf is a full shadow (loadComponent's job)
        }
        if (!p.has_parent_path()) break;
        p = p.parent_path();
    }
    return out;
}

Component Database::loadComponent(const std::string& name) const
{
    // Resolution order (OVERLAY semantics):
    //   1.  $CHOUPO_HOME/data/standards/components/<name>.dat  (base)
    //   2.  <case>/constant/components/<name>.dat               (overlay)
    //
    // The standard catalogue carries the UNIVERSAL pure-component
    // properties (MW, Tc, ρ_p, Cp...).  The case-local file carries
    // SAMPLE-SPECIFIC data that cannot be tabulated once for all ---
    // sorption isotherm, critical moisture, any measured-for-this-feed
    // quantity.  Solids especially: a real powder is a sample, not a
    // pure compound, so its drying/sorption data belong to the case.
    //
    // When both exist, they are MERGED field-by-field with the case
    // winning: the author writes ONLY what is specific (e.g. a `sorption
    // {}` block), not a full copy of the.dat.  A case-local file for a
    // component absent from the standard catalogue still works alone
    // (a textbook problem with made-up properties, an industry mixture).
    // Case-local override: the NEAREST `constant/components/<name>.dat` found
    // walking UP from the cwd (fractal cascade) --- so a sector inherits
    // a material's sample data (sorption isotherm,...) declared at the plant
    // level, exactly as thermoPackage/controlDict cascade in main.
    fs::path caseLocal;
    {
        fs::path p = fs::current_path();
        for (int up = 0; up < 6; ++up)
        {
            fs::path cand = p / "constant" / "components" / (name + ".dat");
            if (fs::exists(cand)) { caseLocal = cand; break; }
            if (!p.has_parent_path()) break;
            p = p.parent_path();
        }
    }
    // CASE SNAPSHOT (Choupo-2607 data strategy): a frozen copy under
    // constant/propertyData/components/<name>.dat, walking UP the cascade, is the
    // BASE instead of the installation catalogue -- the run reads the case's own
    // copy.  Opt-in by file presence; the case-local constant/components/ overlay
    // (sample-specific data) still wins on top.  Absent -> the catalogue base.
    fs::path snapshot;
    {
        fs::path p = fs::current_path();
        for (int up = 0; up < 8; ++up)
        {
            fs::path cand = p / "constant" / "propertyData" / "components" / (name + ".dat");
            if (fs::exists(cand)) { snapshot = cand; break; }
            fs::path par = p.parent_path();
            if (par == p) break;
            p = par;
        }
    }
    // SEALED (Choupo-2607): a manifest with sealed true FORBIDS the catalogue.
    bool sealed = false;
    {
        fs::path q = fs::current_path();
        for (int u = 0; u < 8; ++u)
        {
            fs::path m = q / "constant" / "propertyData" / "manifest.dat";
            if (fs::exists(m))
            {
                auto d = Dictionary::fromFile(m.string());
                if (d->found("propertyDataManifest"))
                    sealed = d->subDict("propertyDataManifest")
                              ->lookupWordOrDefault("sealed", "false") == "true";
                break;
            }
            fs::path par = q.parent_path(); if (par == q) break; q = par;
        }
    }
    if (sealed && snapshot.empty() && caseLocal.empty())
        throw std::runtime_error("SEALED snapshot: component '" + name
            + "' is NOT in the case's constant/propertyData/components/ --"
              " re-run `choupo-import` (the installation catalogue is forbidden).");
    fs::path standard  = !snapshot.empty() ? snapshot
                       : fs::path(root_) / "standards" / "components" / (name + ".dat");
    // Third tier (LOWEST precedence): data/local/ (gitignored) holds UNVERIFIED, student-
    // review-pending proposals (estimates / bulk-ingested VLE skeletons).
    // Precedence, lowest -> highest:  proposed  <  standards  <  case-local.
    // A fixed path like the other two -- NO directory walk.  A verified standard
    // ALWAYS shadows a same-named proposal; a proposal is used only when nothing
    // verified exists.
    fs::path proposed  = fs::path(root_) / "local"  / "components" / (name + ".dat");

    const bool hasCase       = !caseLocal.empty();
    const bool hasStd        = fs::exists(standard);
    const bool hasProposed   = fs::exists(proposed);
    const bool usingProposed = !hasStd && hasProposed;     // proposal provides the base
    const fs::path base      = hasStd ? standard : proposed;
    const bool hasBase       = hasStd || hasProposed;
    if (!hasCase && !hasBase)
    {
        // Remedy-bearing, not a dead end (no silent crutch): a missing component
        // is the START of a curation act.  Point the student at the estimate →
        // review → promote path (the same one the Property Explorer drives).
        const std::string caseMsg = caseLocal.empty()
            ? "(no case-local constant/components/" + name + ".dat up the tree)"
            : caseLocal.string();
        throw std::runtime_error(
            "Database: component '" + name + "' not found.\n"
            "  looked in: " + caseMsg + "\n"
            "         and: " + standard.string() + "  (verified)\n"
            "         and: " + proposed.string() + "  (proposed/unverified)\n"
            "  remedy: if it is not curated data, create a case-local proposal — add\n"
            "    to your propsDict an estimateComponent operation (component " + name + ";\n"
            "    groups ( ... );  // Joback groups, see docs/ai/components.md).\n"
            "    NOTE: do NOT list '" + name + "' in thermoPackage's components yet --\n"
            "    it has no .dat, which is exactly what failed here.  estimateComponent\n"
            "    reads its groups from the propsDict, so keep an existing placeholder\n"
            "    component in thermoPackage meanwhile.  Then run choupoProps <caseDir>,\n"
            "    REVIEW the generated constant/components/" + name + ".estimate-*.dat,\n"
            "    fill the gaps, then rename it to constant/components/" + name + ".dat.\n"
            "  if you expected it to exist: check spelling/casing — lookup is by the\n"
            "    exact <name>.dat filename (CAS and aliases are NOT resolved).");
    }

    // LOUD proposal use (no silent crutch): an UNVERIFIED proposal is supplying the
    // values -- say so unmistakably; and if a verified standard shadowed a proposal
    // of the same name, announce that too.
    if (usingProposed)
        if (announceOnce("proposed:" + name)) std::cerr << "[local] component '" << name
                  << "': loaded from data/proposed/ -- UNVERIFIED; a student must review"
                     " and promote it to data/standards/ before the result is trusted.\n";
    if (hasStd && hasProposed)
        if (caseLocal.empty() && announceOnce("shadowed:" + name)) std::cerr << "[shadowed] component '" << name
                  << "': a data/proposed/ proposal exists but the verified data/standards/"
                     " entry is used instead.\n";

    DictPtr dict;
    if (hasBase && hasCase)
    {
        // LOUD overlay (no silent crutch): a case-local file silently shadowing
        // a curated component is exactly the risk a promoted estimate creates --
        // announce it so it is never an invisible default.
        if (thermoAnnounce())
            if (announceOnce("overlay:" + name)) std::cerr << "[overlay] component '" << name
                      << "': case-local " << caseLocal.string()
                      << " overrides the " << (hasStd ? "standard catalogue" : "data/proposed")
                      << " entry.\n";
        dict = Dictionary::fromFile(base.string());
        auto local = Dictionary::fromFile(caseLocal.string());
        const bool isEstimate =
            local->found("provenance") &&
            local->subDict("provenance")->lookupWordOrDefault("status", "")
                .find("ESTIMATE") != std::string::npos;
        // Two kinds of case-local file (roadmap Phase A):
        //  - `overlayOf <name>;` present -> a PARTIAL deep-merge through the ONE
        //    shared entry point (validates overlayOf==name, strips it, records
        //    provenance) -- only the declared leaves override.
        //  - no `overlayOf` -> a FULL REPLACEMENT / shadow record: its top-level
        //    keys overlay the base (the classic sample-specific override).
        if (local->found("overlayOf"))
        {
            auto rc = Database::applyCaseOverlay(name, dict, base.string());
            dict = rc.dict;
            if (thermoAnnounce() && !rc.overlaidPaths.empty())
            {
                std::cerr << "[overlay] " << name << ": deep-merge of "
                          << rc.overlaidPaths.size() << " leaf(s) from caseOverlay "
                          << rc.overlayFile << " (all other values from standard "
                          << rc.baseFile << "):";
                for (const auto& p : rc.overlaidPaths) std::cerr << " " << p;
                std::cerr << "\n";
            }
        }
        else
            for (const auto& k : local->keys())
                dict->insert(k, local->entryValue(k));   // full shadow/replacement

        // A modern block-form overlay may sit on a legacy flat catalogue base.
        // Project the local datum onto its flat compatibility key as well, so
        // the higher-precedence overlay replaces the base in BOTH reader forms.
        // Component::readFromDict still refuses contradictory duplicate forms
        // inside a single file; this only resolves a legitimate tier merge.
        auto projectLocal = [&](const char* block, const char* key,
                                const char* legacy)
        {
            if (!local->found(block)) return;
            auto b = local->subDict(block);
            if (b->found(key)) dict->insert(legacy, b->entryValue(key));
        };
        projectLocal("identity",   "name",    "name");
        projectLocal("identity",   "formula", "formula");
        projectLocal("identity",   "CAS",     "CAS");
        projectLocal("identity",   "MW",      "MW");
        projectLocal("critical",   "Tc",      "Tc");
        projectLocal("critical",   "Pc",      "Pc");
        projectLocal("critical",   "omega",   "omega");
        projectLocal("liquidPure", "Tb",      "Tb");
        projectLocal("liquidPure", "HvapTb",  "HvapTb");
        projectLocal("liquidPure", "Vliq",    "Vliq");
        projectLocal("liquidPure", "Psat",    "vaporPressure");
        projectLocal("liquidPure", "Cp",      "liquidHeatCapacity");
        projectLocal("gasIdeal",   "Cp",      "idealGasHeatCapacity");
        projectLocal("solid",      "Cp",      "solidHeatCapacity");
        projectLocal("transport", "diffusionVolume", "diffusionVolume");
        projectLocal("transport", "associationFactor", "associationFactor");
        projectLocal("transport", "liquidViscosity", "liquidViscosity");

        // No silent crutch: a Joback ESTIMATE leaves Psat / Vliq / gibbsFormation
        // as declared GAPS (omitted).  If the FROZEN standard backfills them, the
        // merged component is a HYBRID (estimated constants + curated gap data) --
        // announce it per key, never let the estimate look self-sufficient.
        if (isEstimate)
        {
            auto localHas = [&](const char* legacy, const char* block,
                                const char* key)
            {
                return local->found(legacy)
                    || (local->found(block)
                        && local->subDict(block)->found(key));
            };
            const char* baseLabel = hasStd ? "FROZEN catalogue"
                                            : "PROPOSED catalogue";
            if (dict->found("vaporPressure")
                && !localHas("vaporPressure", "liquidPure", "Psat"))
                std::cerr << "[backfill] component '" << name
                          << "'.vaporPressure: the ESTIMATE leaves this a GAP, but the "
                          << baseLabel << " is filling it -- the merged component is a hybrid,"
                             " not a pure estimate.\n";
            if (dict->found("Vliq")
                && !localHas("Vliq", "liquidPure", "Vliq"))
                std::cerr << "[backfill] component '" << name
                          << "'.Vliq: the ESTIMATE leaves this a GAP, but the "
                          << baseLabel << " is filling it -- the merged component is a hybrid,"
                             " not a pure estimate.\n";
            if (dict->found("gibbsFormation") && !local->found("gibbsFormation"))
                std::cerr << "[backfill] component '" << name
                          << "'.gibbsFormation: the ESTIMATE leaves this a GAP, but the "
                          << baseLabel << " is filling it -- the merged component is a hybrid,"
                             " not a pure estimate.\n";
        }
    }
    else
    {
        dict = Dictionary::fromFile((hasCase ? caseLocal : base).string());
    }

    // Identity guard (no silent crutch): the filename stem is the canonical key
    // -- it is what `components ( ... )` resolves to.  The stored `name` must
    // match it; absence or mismatch is a curation slip, so ANNOUNCE it and keep
    // the stem as canonical (silently adopting a divergent in-file name would
    // itself be a hidden crutch, and would diverge from how the GUI refers to it).
    // The name may live flat (legacy) OR inside identity{} (the reference-state
    // layout, forum 2026-06-11) -- check both before declaring it absent.
    const std::string storedName =
        dict->found("name") ? dict->lookupWord("name")
      : (dict->found("identity") && dict->subDict("identity")->found("name"))
            ? dict->subDict("identity")->lookupWord("name")
            : std::string();
    if (storedName.empty())
    {
        std::cerr << "[identity] component '" << name
                  << "': no `name` field -- inferred from the filename.\n";
        dict->insert("name", std::string(name));
    }
    else if (storedName != name)
    {
        std::cerr << "[identity] component '" << name << "': stored name '"
                  << storedName << "' != filename stem '" << name
                  << "' -- keeping the stem as canonical (it is the resolution key).\n";
        if (dict->found("identity"))
            dict->subDict("identity")->insert("name", std::string(name));
        else
            dict->insert("name", std::string(name));
    }

    // LOUD estimate (no silent crutch): a promoted Joback proposal carries
    // provenance.status = "ESTIMATE ...".  If a solve consumes it, say so --
    // an unvalidated estimate (gaps for Vliq/Psat/s_298) is in the result.
    if (dict->found("provenance"))
    {
        const std::string st =
            dict->subDict("provenance")->lookupWordOrDefault("status", "");
        if (st.find("ESTIMATE") != std::string::npos)
            std::cerr << "[estimate] component '" << name
                      << "' carries an ESTIMATE provenance -- an UNVALIDATED estimate is in "
                         "use; review its gaps (Vliq / Psat / s_298) before trusting the result.\n";
    }

    Component c;
    c.readFromDict(dict);
    return c;
}

std::string Database::canonicalName(const std::string& token) const
{
    // Exact-name ALWAYS wins: a real standard component is never aliased away,
    // and the lookup stays the O(1) path concat the doctrine fixes.
    if (fs::exists(fs::path(root_) / "standards" / "components" / (token + ".dat")))
        return token;
    // A CASE-LOCAL override named by the token wins too (self-contained credo):
    // a case carrying its own constant/components/<token>.dat must not be aliased
    // away to the standard catalogue.  Same fractal cwd-walk as loadComponent.
    {
        fs::path p = fs::current_path();
        for (int up = 0; up < 6; ++up)
        {
            if (fs::exists(p / "constant" / "components" / (token + ".dat")))
                return token;
            if (!p.has_parent_path()) break;
            p = p.parent_path();
        }
    }
    // Lazy-load the generated alias index ONCE (a single dict read, never a
    // directory walk).  An unknown token returns unchanged so the existing
    // not-found error still fires in loadComponent.
    if (!aliasLoaded_)
    {
        aliasLoaded_ = true;
        fs::path idx = fs::path(root_) / "standards" / "components" / "ALIASES";
        if (fs::exists(idx))
        {
            auto d = Dictionary::fromFile(idx.string());
            if (d->found("aliases"))
            {
                auto a = d->subDict("aliases");
                for (const auto& k : a->keys())
                    aliasIndex_[k] = a->lookupWord(k);
            }
        }
    }
    auto it = aliasIndex_.find(token);
    return (it != aliasIndex_.end()) ? it->second : token;
}

} // namespace Choupo
