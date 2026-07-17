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

  RESOLUTION POLICY (every consumer goes through here -- this replaced the six
  scattered propertyData-specific snapshot legs of the phase-1 import):

      nearest constant/<sub>              (walking UP the fractal cascade)
   -> [legacy] nearest constant/propertyData/<sub>      (retired v1 snapshot)
   -> data/standards/<sub>,  UNLESS the case is SEALED.

  SEALED = the nearest constant/propertyManifest declares `sealed true;`
  (legacy: constant/propertyData/manifest.dat, propertyDataManifest.sealed).
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

  TODO(legacy-propertyData): the constant/propertyData/ legs serve ONLY the
  two remaining v1 snapshots (tutorials/plant/lithiumBrinePlant and
  tutorials/steady/crystallisation/Crystallizer09chatGPT, both carrying
  hand-tuned kind-local records).  Remove every `legacy` branch in this file
  -- and the callers' propertyData tiers (NRTL/UNIQUAC locatePairFile,
  resolveDeclared) -- when those two migrate to the mirrored constant/ form.
\*---------------------------------------------------------------------------*/

#pragma once

#include "thermo/Database.H"
#include "core/Dictionary.H"

#include <algorithm>
#include <filesystem>
#include <map>
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

// [legacy] nearest constant/propertyData/<sub> -- see the TODO in the header.
inline fs::path legacySnapshotRecord(const std::string& sub)
{
    fs::path p = fs::current_path();
    for (int up = 0; up < walkUpDepth; ++up)
    {
        fs::path cand = p / "constant" / "propertyData" / sub;
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

// The nearest manifest walking up: constant/propertyManifest (the mirrored
// form) first at each level, then the legacy propertyData/manifest.dat.
// Returns the manifest BODY dict (propertyManifest / propertyDataManifest),
// or nullptr when the case carries none.
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
        fs::path lm = p / "constant" / "propertyData" / "manifest.dat";   // legacy
        if (fs::exists(lm))
        {
            const DictPtr& d = parsedManifest(lm);
            if (d->found("propertyDataManifest"))
                return d->subDict("propertyDataManifest");
            return nullptr;
        }
        fs::path par = p.parent_path();
        if (par == p) break;
        p = par;
    }
    return nullptr;
}

// The nearest NEW-form manifest (constant/propertyManifest) -- nullptr when
// the case carries none, or only a legacy propertyData/manifest.dat.
inline DictPtr nearestStrictManifest()
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

// SEALED (either manifest generation): the per-record REQUIRED consumers
// (component / ion / Pitzer / eNRTL pair) refuse a locally-missing record
// under this flag -- the guard the phase-1 legs already enforced.
inline bool sealed()
{
    DictPtr m = nearestManifest();
    return m && m->lookupWordOrDefault("sealed", "false") == "true";
}

// STRICTLY sealed: the NEW-form constant/propertyManifest declares sealed.
// Only then do the absence-TOLERANT legs (crissCobble, chemistry/ scans,
// declared-source fallbacks) forbid the catalogue too.  A LEGACY v1 snapshot
// (lithiumBrinePlant / Crystallizer09chatGPT) keeps its phase-1 semantics:
// records outside its closure still fall back to the catalogue (the honest
// note of 2026-07-17 -- e.g. the lithium snapshot carries no crissCobble.dat)
// -- fixing that is the migration of those two cases, not a silent behaviour
// flip under them.  TODO(legacy-propertyData): fold into sealed() when they
// migrate.
inline bool sealedStrict()
{
    DictPtr m = nearestStrictManifest();
    return m && m->lookupWordOrDefault("sealed", "false") == "true";
}

// The installation-catalogue path for a subpath (exists or not -- callers
// keep their own fs::exists guards, exactly as before the resolver).
inline fs::path standardsRecord(const std::string& sub)
{
    return fs::path(Database::currentRoot()) / "standards" / sub;
}

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
    if (!p.empty()) return p;
    p = legacySnapshotRecord(sub);            // legacy -- see header TODO
    if (!p.empty()) return p;
    if (sealedStrict()) return {};
    return standardsRecord(sub);
}

// Record resolution for a per-record REQUIRED consumer (Pitzer / eNRTL pair):
// a sealed case of EITHER manifest generation refuses a locally-missing
// record (the phase-1 sealed guard, preserved verbatim).
inline fs::path resolveRequired(const std::string& sub, const std::string& what)
{
    fs::path p = localRecord(sub);
    if (p.empty()) p = legacySnapshotRecord(sub);   // legacy -- see header TODO
    if (!p.empty()) return p;
    if (sealed()) refuseSealed(sub, what);
    return standardsRecord(sub);
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
    fs::path p = legacySnapshotRecord(sub);   // legacy -- see header TODO
    if (!p.empty()) return p;
    if (sealedStrict())
        return localRecord(sub);              // one home; empty when absent
    return standardsRecord(sub);
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

// Nearest case-local DIRECTORY for a scan: constant/<sub> first, then the
// legacy constant/propertyData/<sub>; the `legacy` flag reports which.
inline fs::path localScanDir(const std::string& sub, bool& legacy)
{
    fs::path p = fs::current_path();
    for (int up = 0; up < walkUpDepth; ++up)
    {
        fs::path cand = p / "constant" / sub;
        if (fs::is_directory(cand)) { legacy = false; return cand; }
        fs::path lcand = p / "constant" / "propertyData" / sub;   // legacy
        if (fs::is_directory(lcand)) { legacy = true; return lcand; }
        fs::path par = p.parent_path();
        if (par == p) break;
        p = par;
    }
    legacy = false;
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
    if (!local.empty() && legacy) return listDatFiles(local);
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
    if (!local.empty() && legacy) return local;
    if (sealedStrict()) return local;           // local-only; empty when absent
    return standardsRecord("components");
}

} // namespace records
} // namespace Choupo
