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

    if (!explicitRoot.empty())
    {
        if (check(explicitRoot)) return explicitRoot;
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
    fs::path standard  = fs::path(root_) / "standards" / "components" / (name + ".dat");
    // Third tier (LOWEST precedence): data/proposed/ holds UNVERIFIED, student-
    // review-pending proposals (estimates / bulk-ingested VLE skeletons).
    // Precedence, lowest -> highest:  proposed  <  standards  <  case-local.
    // A fixed path like the other two -- NO directory walk.  A verified standard
    // ALWAYS shadows a same-named proposal; a proposal is used only when nothing
    // verified exists.
    fs::path proposed  = fs::path(root_) / "proposed"  / "components" / (name + ".dat");

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
        std::cerr << "[proposed] component '" << name
                  << "': loaded from data/proposed/ -- UNVERIFIED; a student must review"
                     " and promote it to data/standards/ before the result is trusted.\n";
    if (hasStd && hasProposed)
        std::cerr << "[shadowed] component '" << name
                  << "': a data/proposed/ proposal exists but the verified data/standards/"
                     " entry is used instead.\n";

    DictPtr dict;
    if (hasBase && hasCase)
    {
        // LOUD overlay (no silent crutch): a case-local file silently shadowing
        // a curated component is exactly the risk a promoted estimate creates --
        // announce it so it is never an invisible default.
        std::cerr << "[overlay] component '" << name
                  << "': case-local " << caseLocal.string()
                  << " overrides the " << (hasStd ? "standard catalogue" : "data/proposed")
                  << " entry.\n";
        dict = Dictionary::fromFile(base.string());
        auto local = Dictionary::fromFile(caseLocal.string());
        const bool isEstimate =
            local->found("provenance") &&
            local->subDict("provenance")->lookupWordOrDefault("status", "")
                .find("ESTIMATE") != std::string::npos;
        for (const auto& k : local->keys())
            dict->insert(k, local->entryValue(k));   // case overrides standard
        // No silent crutch: a Joback ESTIMATE leaves Psat / Vliq / gibbsFormation
        // as declared GAPS (omitted).  If the FROZEN standard backfills them, the
        // merged component is a HYBRID (estimated constants + curated gap data) --
        // announce it per key, never let the estimate look self-sufficient.
        if (isEstimate)
            for (const char* k : { "vaporPressure", "Vliq", "gibbsFormation" })
                if (dict->found(k) && !local->found(k))
                    std::cerr << "[backfill] component '" << name << "'." << k
                              << ": the ESTIMATE leaves this a GAP, but the FROZEN catalogue is "
                                 "filling it -- the merged component is a hybrid, not a pure estimate.\n";
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

} // namespace Choupo
