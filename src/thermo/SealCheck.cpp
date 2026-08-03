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

#include "core/DictCanonical.H"
#include "core/Dictionary.H"
#include "core/Sha256.H"
#include "thermo/RecordResolver.H"

#include <filesystem>
#include <iostream>
#include <stdexcept>   // the onDivergence refusal throws; g++ lends this
                       // transitively, emscripten's libc++ does not
#include <string>
#include <vector>

namespace Choupo {
namespace records {

namespace fs = std::filesystem;

//  Function-local statics: ONE home for the verdict, reachable by the
//  binaries without a global and without a second copy of the logic.
static std::string& verdict_()
{
    static std::string v = "unsealed";
    return v;
}
static std::vector<std::string>& divergedRecords_()
{
    static std::vector<std::string> r;
    return r;
}

const std::string& sealVerdict() { return verdict_(); }
const std::vector<std::string>& sealDivergedRecords() { return divergedRecords_(); }

int verifySeal(int verbosity)
{
    static bool done = false;
    static int  divergences = 0;
    if (done) return divergences;
    done = true;
    //  The verdict starts UNSEALED and is only ever raised by evidence:
    //  every early return below leaves a case that made no claim saying so.
    verdict_() = "unsealed";
    divergedRecords_().clear();

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

    //  Sealing schema (migration ratified 2026-08-03).  `legacy` (or
    //  absent) = the original whole-file byte claim.  `computational` =
    //  the claim is about the PARSED content (core/DictCanonical): a
    //  byte-only difference -- comments, whitespace, unit spellings at
    //  equal SI -- is COSMETIC, announced but never a divergence; a
    //  moved value, dimension, key or structure diverges exactly as
    //  before.  The exclusion is by typed fields (the parser's tree),
    //  never comment-stripping.
    const std::string schema = m->lookupWordOrDefault("sealSchema", "legacy");
    if (schema != "legacy" && schema != "computational")
        throw std::runtime_error("propertyManifest: sealSchema '" + schema
            + "' is not one of legacy / computational");

    auto recs = m->subDict("records");
    std::vector<std::string> changed, missing, cosmetic;
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

        if (schema == "computational")
        {
            //  A computational-schema manifest whose record lacks the
            //  computational claim is a broken manifest, not a pass.
            if (!r->found("computationalSha256"))
            {
                changed.push_back(key + "  (sealSchema computational but"
                                  " no computationalSha256 claimed)");
                continue;
            }
            const std::string wantC = r->lookupWord("computationalSha256");
            std::string gotC;
            try { gotC = canonical::sha256OfFile(f.string()); }
            catch (const std::exception&)
            {
                //  A record that no longer parses HAS diverged
                //  computationally, whatever its bytes say.
                changed.push_back(key + "  (no longer parses)");
                continue;
            }
            if (gotC != wantC)       changed.push_back(key);
            else if (got != want)    cosmetic.push_back(key);
            continue;
        }
        if (got != want) changed.push_back(key);
    }

    //  A junk onDivergence word is a manifest GRAMMAR error and refuses
    //  regardless of whether anything diverged -- validating it only on
    //  the divergent path let a broken declaration ride every clean run
    //  (found by check_seal_verdict when the computational schema made
    //  its byte-edit probe clean).
    const std::string onDiv = m->lookupWordOrDefault("onDivergence", "announce");
    if (onDiv != "announce" && onDiv != "refuse")
        throw std::runtime_error("propertyManifest: onDivergence '" + onDiv
            + "' is not one of announce / refuse");

    divergences = static_cast<int>(changed.size() + missing.size());
    //  A manifest exists and was checkable, so a claim IS now made -- which
    //  of the two it is depends only on the hashes.
    verdict_() = (divergences == 0) ? "verified" : "diverged";
    for (const auto& k : changed) divergedRecords_().push_back(k);
    for (const auto& k : missing) divergedRecords_().push_back(k);
    //  Cosmetic byte drift under the computational schema: the CLAIM the
    //  manifest declares (parsed content) still holds, so the verdict is
    //  untouched -- but the byte provenance line moved and the reader
    //  deserves to know which files.
    if (!cosmetic.empty() && verbosity >= 1)
    {
        std::cerr << "[seal] " << cosmetic.size() << " record(s) differ in"
                     " BYTES ONLY (comments/whitespace/unit spellings) --"
                     " the computational content the manifest claims is"
                     " intact:\n";
        for (const auto& k : cosmetic)
            std::cerr << "[seal]   cosmetic  constant/" << k << "\n";
    }
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

    //  The REFUSAL is the CASE's to declare, never the engine's to infer
    //  (forum 2026-08-02: the first-year must be able to edit a record and
    //  learn from it; the doctoral student archiving her thesis appendix
    //  wants the run to STOP if the content moved -- and that is a property
    //  of what she is doing, not of the case or of the engine's taste).
    //  Default `announce`; an archival copy declares `onDivergence refuse;`.
    //  (The word itself was validated above, before the clean-run return.)
    if (onDiv == "refuse")
    {
        std::string names;
        for (const auto& k : divergedRecords_())
            names += (names.empty() ? "" : ", ") + k;
        throw std::runtime_error("propertyManifest declares `onDivergence"
            " refuse;` and " + std::to_string(divergences) + " record(s) no"
            " longer match what it claims (" + names + ") -- this case is"
            " declared ARCHIVAL, so a moved byte stops the run rather than"
            " producing a result under a provenance line that is no longer"
            " true.  Re-import to reseal, or set `onDivergence announce;`"
            " to keep exploring.");
    }
    return divergences;
}

} // namespace records
} // namespace Choupo
