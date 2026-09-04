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

/*---------------------------------------------------------------------------*\
  RecordResolver -- the ONE case-local property-record resolver (the sealing
  redesign, ratified 2026-07-17: "selo no constant/, uma casa e uma gramática").

  A case's constant/ MIRRORS data/standards/, OpenFOAM-style: a record the
  catalogue stores at data/standards/<sub> lives case-locally at
  constant/<sub> -- ONE home, ONE grammar, no parallel machine-owned tree.
  Ownership/provenance is the job of `constant/propertyManifest` (written by
  `bin/choupo-import`), never of a separate directory.

  RESOLUTION POLICY (every consumer goes through here):

      nearest constant/<sub>              (walking UP the fractal cascade)
   -> data/standards/<sub>,  UNLESS the case is SEALED.

  SEALED = the nearest constant/propertyManifest declares `sealed true;`.
  A sealed case FORBIDS the installation catalogue: a record missing from the
  case is refused loudly (re-run `bin/choupo-import`), never a silent
  catalogue read -- resolveRecord() returns an EMPTY path so absence-tolerant
  callers stay absence-tolerant WITHOUT touching the catalogue, and required
  callers throw via refuseSealed().

  Directory-scan loaders (chemistry/, parameters/Henry/) use scanRecordDir():
  identity-merge by FILENAME in the unsealed case (case-local record over the
  standards record of the same name, case-only records appended); local-only
  in the sealed case.

  COMPONENTS ARE SPECIAL (the doctrine, not this resolver, owns them): in an
  UNSEALED case constant/components/<name>.dat is the hand-authored OVERLAY
  tier (full shadow or `overlayOf` deep-merge over the standards base --
  Database::loadComponent), NOT a base replacement; the resolver therefore
  exposes componentBase()/componentsScanDir() with sealed-only local-base
  semantics instead of routing components through resolveRecord().

  The retired constant/propertyData/ v1 snapshot form has NO readers left:
  its last two cases (lithiumBrinePlant, Crystallizer09chatGPT) migrated to
  the mirrored constant/ form on 2026-07-17 and every legacy leg -- here and
  in the callers (NRTL/UNIQUAC locatePairFile, resolveDeclared, the Database
  component base) -- was removed.  bin/choupo-import refuses a case that
  still carries the old tree.
\*---------------------------------------------------------------------------*/

#pragma once

#include "thermo/Database.H"
#include "core/Dictionary.H"

#include <algorithm>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <map>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {
namespace records {

namespace fs = std::filesystem;

// Bounded walk UP the fractal cascade (unit -> sector -> plant), the same
// depth every retired ad-hoc leg used.
inline constexpr int walkUpDepth = 8;

// Nearest constant/<sub> walking up from the cwd; empty when absent.
inline fs::path localRecord(const std::string& sub)
{
    fs::path p = fs::current_path();
    for (int up = 0; up < walkUpDepth; ++up)
    {
        fs::path cand = p / "constant" / sub;
        if (fs::exists(cand)) return cand;
        fs::path par = p.parent_path();
        if (par == p) break;
        p = par;
    }
    return {};
}

// Parse-once cache (manifests are static for the life of a run).
inline const DictPtr& parsedManifest(const fs::path& p)
{
    static std::map<std::string, DictPtr> cache;
    auto it = cache.find(p.string());
    if (it == cache.end())
        it = cache.emplace(p.string(), Dictionary::fromFile(p.string())).first;
    return it->second;
}

// The nearest manifest walking up (constant/propertyManifest).  Returns the
// manifest BODY dict, or nullptr when the case carries none.
inline DictPtr nearestManifest()
{
    fs::path p = fs::current_path();
    for (int up = 0; up < walkUpDepth; ++up)
    {
        fs::path m = p / "constant" / "propertyManifest";
        if (fs::exists(m))
        {
            const DictPtr& d = parsedManifest(m);
            if (d->found("propertyManifest")) return d->subDict("propertyManifest");
            return d;
        }
        fs::path par = p.parent_path();
        if (par == p) break;
        p = par;
    }
    return nullptr;
}

// Does the case carry a property manifest at all?  (Database::resolveRoot's
// relocation rescue: a manifested case needs no installation catalogue.)
inline bool hasManifest() { return nearestManifest() != nullptr; }

// SEALED: the nearest constant/propertyManifest declares `sealed true;` --
// every consumer (required AND absence-tolerant) then forbids the
// installation catalogue.  sealedStrict() is a synonym kept for the callers'
// vocabulary (the strict/legacy split died with the propertyData form).
inline bool sealed()
{
    DictPtr m = nearestManifest();
    return m && m->lookupWordOrDefault("sealed", "false") == "true";
}

inline bool sealedStrict() { return sealed(); }

// The installation-catalogue path for a subpath (exists or not -- callers
// keep their own fs::exists guards, exactly as before the resolver).
inline fs::path standardsRecord(const std::string& sub)
{
    return fs::path(Database::currentRoot()) / "standards" / sub;
}


// ---------------------------------------------------------------------------
//  THE FROZEN CATALOGUE IS READ-ONLY TO THE ENGINE -- ONE home for the rule.
//
//  Four documents state it flatly: CLAUDE.md Sec. 7 ("the engine REFUSES to
//  write under data/standards/ -- new data is a curation act"),
//  docs/ai/data-doctrine.md, docs/architecture/domain-glossary.md, and
//  `fitParameters`' own console text ("the engine never writes the standards
//  catalogue").  Measured 2026-09-04: exactly ONE code site enforced it --
//  `estimateComponent`'s `proposal` key -- while dozens of sites across the
//  props ops, the outer drivers and the reporting chain take an output path
//  from a dict and write to it.
//
//  It was not hypothetical.  Reproduced before this was written: point
//  `fitParameters`' `proposal` at a `.../standards/parameters/NRTL/<pair>.dat`
//  and it writes a 2663-byte promotable pair record there and EXITS 0 -- a
//  file carrying a `provenance {}` block that the pair loader reads as
//  authoritative, admitted to the frozen tree by nobody.
//
//  A rule enforced in one of many places is a sentence, not a contract.
//
//  TWO RULES, AND EACH COVERS THE OTHER'S BLIND SPOT.
//
//   (a) A path COMPONENT literally named `standards`.  Coarse -- it also
//       refuses a scratch directory that happens to carry the word -- and
//       deliberately KEPT, because it is the rule that still fires when the
//       catalogue root is not where this process thinks it is: an unset
//       CHOUPO_HOME, a case run against another tree, or a SEALED case, which
//       forbids the installation catalogue entirely and so has no root to
//       compare against.  It is also `estimateComponent`'s existing behaviour,
//       and generalising a guard must not quietly loosen it.
//
//   (b) CONTAINMENT under the resolved catalogue root.  Catches the routes the
//       literal scan cannot see -- a symlink, or `data/../data/standards`.
//       Compared WEAKLY-canonically because the target does not exist yet;
//       that is the whole point of asking before writing.
//
//  Neither rule alone is the contract; their DISJUNCTION is.  The refusal
//  names WHICH one fired, because a reader who hit (a) on a scratch path and a
//  reader who hit (b) on the real catalogue need different next steps.
// ---------------------------------------------------------------------------
inline bool targetsStandardsTree(const std::string& outPath, std::string& rule)
{
    if (outPath.empty()) return false;

    for (const auto& part : fs::path(outPath))
        if (part == "standards")
        {
            rule = "a path component is literally named `standards`";
            return true;
        }

    std::error_code ec;
    const fs::path root =
        fs::weakly_canonical(fs::path(Database::currentRoot()) / "standards", ec);
    if (ec) return false;          // no resolvable catalogue: rule (a) stands alone
    const fs::path want = fs::weakly_canonical(fs::absolute(outPath, ec), ec);
    if (ec) return false;

    auto r = root.begin(); auto w = want.begin();
    for (; r != root.end() && w != want.end(); ++r, ++w)
        if (*r != *w) return false;
    if (r != root.end()) return false;     // shorter than the root: outside it

    rule = "it resolves inside the installation catalogue at " + root.string();
    return true;
}

//  The refusal itself, so the MESSAGE has one home too.  Throws: every binary
//  catches std::exception at top level and exits 1 with the text, which is the
//  same outcome `estimateComponent` produced by hand and reaches the void
//  call sites the return-code form could not.
inline void refuseStandardsWrite(const std::string& who,
                                 const std::string& key,
                                 const std::string& outPath)
{
    std::string rule;
    if (!targetsStandardsTree(outPath, rule)) return;
    throw std::runtime_error(
        who + ": refusing to write `" + key + " " + outPath + "` -- " + rule
        + ".\n  data/standards/ is the FROZEN catalogue: committee-managed,"
          " audited, and admitted to only by an explicit curation act"
          " (bin/curate/promote-from-dossier)."
          "\n  Write it inside the case instead -- constant/ for a property"
          " record, the case directory for a run artefact.");
}


// ---------------------------------------------------------------------------
//  THE CONSUMPTION LEDGER  (debt D3, 2026-08-05)
//
//  WHAT PROBLEM.  `bin/choupo-import` seals a case by materialising its
//  property-data DEPENDENCY CLOSURE, and it computes that closure from a
//  hand-written list of 21 `want(...)` calls plus regex over the case dicts.
//  Nothing connects that list to the models that actually read the records.
//  A model knows what it consumes; the importer did not, and could not ask.
//
//  It has cost twice.  2026-08-04: a new activity model read a new record home
//  the importer had never been told about, so the sealed case kept 9 of its 28
//  pair parameters and answered AS A DIFFERENT MODEL -- it ran, it converged,
//  and it printed what a Davies run prints.  2026-08-05: `reviewStatus` and
//  two corrected `Trange` fields reached five sealed cases only because a
//  human knew which ones to re-import.
//
//  WHAT THIS IS, precisely, because the distinction matters.  It is an
//  OBSERVATION, not a declaration: every standards-relative subpath the run
//  actually asked this seam for, recorded as it happens.  §2 of
//  `module-boundaries.md` already established that record resolution goes
//  through exactly ONE seam, and that is what makes observation sufficient --
//  there is no second path a model could use to reach a record unobserved.
//
//  An observation cannot drift from behaviour the way a declaration can; a
//  declaration, in exchange, can name a path this particular run did not take.
//  THAT IS THE RESIDUAL GAP AND IT IS REAL: a record a model reads only for
//  some component sets is invisible to a run that lacks them.  So the importer
//  uses this to REFUSE an under-staged seal -- a record the engine resolved
//  and the closure omitted -- and keeps its own list for what a single run
//  cannot see.  Catching the Edwards defect needs only the first.
//
//  OFF unless `CHOUPO_RECORD_LEDGER` names an output file: no cost, no
//  behaviour change, nothing written.
// ---------------------------------------------------------------------------
namespace ledger {

inline const char* target()
{
    static const char* t = std::getenv("CHOUPO_RECORD_LEDGER");
    return t;
}

//  ONE static owns BOTH the set and the writing of it.
//
//  The first version kept them apart -- a `static std::set` from one function
//  and a `static Flusher` from another -- and it HUNG every run with the
//  ledger enabled.  Function-local statics are destroyed in reverse order of
//  construction; the set was constructed second, so it was destroyed FIRST,
//  and `~Flusher` then iterated an object that no longer existed.  Undefined
//  behaviour that presented as a hang rather than a crash, which is the worse
//  of the two -- a crash names itself.
//
//  Owning both in one object makes the bad order unrepresentable.
struct Ledger
{
    std::set<std::string> asked;

    ~Ledger()
    {
        if (!target()) return;
        std::ofstream o(target());
        for (const auto& s : asked) o << s << "\n";
    }
};

inline Ledger& instance()
{
    static Ledger l;
    return l;
}

inline void note(const std::string& sub, bool found)
{
    if (!target()) return;
    instance().asked.insert(std::string(found ? "+ " : "- ") + sub);
}

} // namespace ledger

// The refusal every required consumer of a sealed-missing record throws.
[[noreturn]] inline void refuseSealed(const std::string& sub,
                                      const std::string& what)
{
    throw std::runtime_error("SEALED case: " + what + " ('" + sub
        + "') is NOT in the case's constant/ record tree -- re-run"
          " `bin/choupo-import` (the installation catalogue is forbidden"
          " when constant/propertyManifest declares sealed true).");
}

// THE resolver -- one record by its standards-relative subpath, for the
// absence-TOLERANT consumers (chemistry/salts anchors, phases/solid,
// crissCobble, method echoes): returns the case-local file (mirrored home,
// then legacy snapshot), else the standards path -- or an EMPTY path when
// the case is STRICTLY sealed and the record is absent locally (the
// catalogue must not even be probed; callers' fs::exists guards then treat
// the record as absent, loudly where the physics demands it).
inline fs::path resolveRecord(const std::string& sub)
{
    fs::path p = localRecord(sub);
    if (!p.empty()) { ledger::note(sub, true); return p; }
    if (sealedStrict()) { ledger::note(sub, false); return {}; }
    p = standardsRecord(sub);
    ledger::note(sub, fs::exists(p));
    return p;
}

// Record resolution for a per-record REQUIRED consumer (Pitzer / eNRTL pair):
// a sealed case of EITHER manifest generation refuses a locally-missing
// record (the phase-1 sealed guard, preserved verbatim).
inline fs::path resolveRequired(const std::string& sub, const std::string& what)
{
    fs::path p = localRecord(sub);
    if (!p.empty()) { ledger::note(sub, true); return p; }
    if (sealed()) { ledger::note(sub, false); refuseSealed(sub, what); }
    p = standardsRecord(sub);
    ledger::note(sub, fs::exists(p));
    return p;
}

// Component BASE record (buildElectrolyte's raw salt/identity read; the
// Database::loadComponent base tier).  Unsealed, constant/components/ is the
// hand-authored OVERLAY tier and must NOT serve as the base -- the base is
// the legacy snapshot else the catalogue.  Sealed, the mirrored
// constant/components/<name>.dat IS the record (imported full copy, or the
// author's adopted record); empty when sealed and absent.
inline fs::path componentBase(const std::string& name)
{
    const std::string sub = "components/" + name + ".dat";
    if (sealedStrict())
    {
        fs::path p = localRecord(sub);        // one home; empty when absent
        ledger::note(sub, !p.empty());
        return p;
    }
    fs::path p = standardsRecord(sub);
    ledger::note(sub, fs::exists(p));
    return p;
}

// Sorted *.dat listing of one directory (empty when absent).
inline std::vector<fs::path> listDatFiles(const fs::path& dir)
{
    std::vector<fs::path> files;
    if (!fs::is_directory(dir)) return files;
    for (const auto& f : fs::directory_iterator(dir))
        if (f.path().extension() == ".dat") files.push_back(f.path());
    std::sort(files.begin(), files.end());
    return files;
}

// Nearest case-local DIRECTORY for a scan (constant/<sub>).  The `legacy`
// out-flag is dead since the propertyData form retired -- always false; kept
// so callers need no signature churn.
inline fs::path localScanDir(const std::string& sub, bool& legacy)
{
    legacy = false;
    fs::path p = fs::current_path();
    for (int up = 0; up < walkUpDepth; ++up)
    {
        fs::path cand = p / "constant" / sub;
        if (fs::is_directory(cand)) return cand;
        fs::path par = p.parent_path();
        if (par == p) break;
        p = par;
    }
    return {};
}

// Directory-scan resolution (chemistry/, parameters/Henry/):
//   * legacy propertyData/<sub> dir present -> that dir ALONE (the v1
//     snapshot semantics, unchanged for the two remaining v1 cases);
//   * SEALED -> the nearest constant/<sub> dir ALONE (may be empty -- a
//     sealed case reads exclusively its own closure);
//   * unsealed -> the standards dir, identity-merged by FILENAME with the
//     nearest constant/<sub> dir: a case-local record SHADOWS the standards
//     record of the same name, case-only records are appended (returned
//     AFTER the standards files, so map-building callers let the case win).
inline std::vector<fs::path> scanRecordDir(const std::string& sub)
{
    bool legacy = false;
    const fs::path local = localScanDir(sub, legacy);
    if (sealedStrict()) return listDatFiles(local);   // local-only; empty when absent
    std::vector<fs::path> out;
    const auto localFiles = listDatFiles(local);   // empty path -> empty list
    auto shadowed = [&](const fs::path& stdFile)
    {
        for (const auto& lf : localFiles)
            if (lf.filename() == stdFile.filename()) return true;
        return false;
    };
    for (const auto& f : listDatFiles(standardsRecord(sub)))
        if (!shadowed(f)) out.push_back(f);
    out.insert(out.end(), localFiles.begin(), localFiles.end());
    return out;
}

// The components/ SCAN (SpeciationSolver's mineral solidPhases sweep) keeps
// the component doctrine: unsealed, the STANDARDS catalogue is the set (the
// per-file case overlay is applied by the caller via applyCaseOverlay --
// never a directory merge, which would let a partial hand shadow eclipse a
// standards record wholesale); sealed / legacy-snapshot, the case dir is the
// set.
inline fs::path componentsScanDir()
{
    bool legacy = false;
    const fs::path local = localScanDir("components", legacy);
    if (sealedStrict()) return local;           // local-only; empty when absent
    return standardsRecord("components");
}

} // namespace records
} // namespace Choupo
