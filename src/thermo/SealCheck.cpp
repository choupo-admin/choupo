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
    This file is part of Choupo.  See SealCheck.H for the full notice.

    SPDX-License-Identifier: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

#include "thermo/SealCheck.H"

#include "core/Dictionary.H"
#include "core/Sha256.H"
#include "thermo/RecordResolver.H"

#include <filesystem>
#include <iostream>
#include <string>
#include <vector>

namespace Choupo {
namespace records {

namespace fs = std::filesystem;

int verifySeal(int verbosity)
{
    static bool done = false;
    static int  divergences = 0;
    if (done) return divergences;
    done = true;

    DictPtr m = nearestManifest();
    if (!m || !m->found("records")) return 0;

    //  A build that miscompiles the digest would report every record as
    //  diverged, which is a worse lie than the silence it replaces.  Say so
    //  and check nothing.
    if (!sha256::selfTest())
    {
        std::cerr << "[seal] the SHA-256 self-test FAILED in this build --"
                     " the manifest cannot be verified and is NOT being"
                     " checked (report this: it is a compiler or build"
                     " problem, not a case problem)\n";
        return 0;
    }

    //  Where the manifest lives IS the root its record keys are relative to.
    fs::path root;
    {
        fs::path p = fs::current_path();
        for (int up = 0; up < 8; ++up)
        {
            if (fs::exists(p / "constant" / "propertyManifest")) { root = p; break; }
            fs::path par = p.parent_path();
            if (par == p) break;
            p = par;
        }
    }
    if (root.empty()) return 0;

    auto recs = m->subDict("records");
    std::vector<std::string> changed, missing;
    for (const auto& key : recs->keys())
    {
        auto r = recs->subDict(key);
        const std::string type = r->lookupWordOrDefault("type", "");
        //  `adopted` is the AUTHOR's record by the manifest's own definition
        //  -- never installed, never hash-enforced.  Hashing it would be
        //  inventing a claim the importer deliberately did not make.
        if (type != "imported" && type != "merged") continue;
        if (!r->found("sha256")) continue;
        const std::string want = r->lookupWord("sha256");
        const fs::path f = root / "constant" / key;
        if (!fs::exists(f)) { missing.push_back(key); continue; }
        const std::string got = sha256::hexFile(f.string());
        if (got.empty()) { missing.push_back(key); continue; }
        if (got != want) changed.push_back(key);
    }

    divergences = static_cast<int>(changed.size() + missing.size());
    if (divergences == 0) return 0;

    //  Loud, and specific about what the divergence COSTS: not "you did
    //  something wrong" but "this case no longer reproduces the release its
    //  manifest names".  Editing your own case is legitimate; the manifest
    //  continuing to claim otherwise is not.
    if (verbosity >= 1)
    {
        const std::string rel =
            m->lookupWordOrDefault("catalogueRelease", "its declared release");
        std::cerr << "[seal] " << divergences << " record(s) differ from what"
                     " constant/propertyManifest claims -- this case no longer"
                     " reproduces " << rel << ":\n";
        for (const auto& k : changed)
            std::cerr << "[seal]   changed  constant/" << k << "\n";
        for (const auto& k : missing)
            std::cerr << "[seal]   MISSING  constant/" << k
                      << "  (claimed, not on disk)\n";
        std::cerr << "[seal] the run CONTINUES on the files as they are --"
                     " re-import (bin/choupo-import) to make the manifest"
                     " describe them again, or keep the edit and know the"
                     " provenance line is now stale.\n";
    }
    return divergences;
}

} // namespace records
} // namespace Choupo
