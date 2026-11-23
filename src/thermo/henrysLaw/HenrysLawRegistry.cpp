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

#include "HenrysLawRegistry.H"
#include "core/Dictionary.H"
#include "core/RegistryScan.H"
#include "thermo/RecordResolver.H"

#include <filesystem>
#include <fstream>
#include <iterator>
#include <set>
#include <atomic>
#include <exception>
#include <map>
#include <mutex>
#include <stdexcept>

namespace Choupo {

namespace fs = std::filesystem;

namespace {

std::string key(const std::string& solute, const std::string& solvent)
{
    return solute + "-" + solvent;
}

std::map<std::string, HenrysLaw>& registry()
{
    static std::map<std::string, HenrysLaw> r;
    return r;
}

//  THE WHOLE REGISTRY LOADS ON FIRST USE (architect's ruling, 2026-11-22: the
//  run's ledger records what it READ for its answer; catalogue integrity --
//  every Henry file parses, no two claim a pair -- is held by
//  check_registry_scan, not by every run).  loadFrom() only RECORDS where to
//  read: the data root, whether the case is strictly sealed, and the
//  case-local directories (found now, while the working directory is the
//  case's).  The first has() / byPair() / availableNames() then reads
//  everything, exactly as loadFrom did.  A case with no Henry solute never
//  parses the 486 catalogue files.
struct Pending
{
    std::mutex                m;
    std::atomic<bool>         armed{false};
    std::string               dataRoot;
    bool                      sealed = false;
    std::vector<fs::path>     localDirs;
    std::exception_ptr        failure;      // a load that threw: rethrown, never re-scanned
};

Pending& pending()
{
    static Pending* p = new Pending();      // leaked: read until exit
    return *p;
}

void loadNow(const Pending& p);

void ensureLoadedImpl()
{
    Pending& p = pending();
    if (!p.armed.load(std::memory_order_acquire)) return;     // the hot path: no lock
    std::lock_guard<std::mutex> lock(p.m);
    if (!p.armed.load(std::memory_order_relaxed)) return;
    if (p.failure) std::rethrow_exception(p.failure);
    try { loadNow(p); }
    catch (...)
    {
        p.failure = std::current_exception();   // stays armed: every later use refuses
        throw;                                  // with the same message, without re-reading
    }
    p.armed.store(false, std::memory_order_release);
}

//  DOES THE CASE DECLARE A SOLVENT OR A SOLUTE?  Every use of a Henry constant
//  goes through a package whose `solvent` is named (ThermoPackage::
//  solventName(), set by applySolution), and the word lives in the case's
//  thermoPhysPropDict, in a unit's `thermo {}` override in its flowsheetDict,
//  or in a solverDict.  A raw-text superset on those three files (the case's
//  tree, and the cascade up to six levels above it): a false positive only
//  reads the registry, a false negative would let a malformed Henry record
//  refuse later, inside a Newton step or a sweep pass, where a catch counts it
//  as a failed step.  So a Henry-using case reads -- and refuses -- at
//  start-up, exactly where it always did; a case with no solvent never reads
//  the 486 files.
bool fileMentionsSolvent(const fs::path& f)
{
    std::ifstream in(f, std::ios::binary);
    if (!in) return false;
    std::string text((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
    return text.find("solvent") != std::string::npos
        || text.find("solute")  != std::string::npos;
}

bool caseMayUseHenry()
{
    static const char* const names[] = { "thermoPhysPropDict", "flowsheetDict", "solverDict" };
    static const std::set<std::string> skipDirs = {
        "converged", "postProcessing", "reports", "iterations", "archiveExtracts",
        "experiments", ".git" };
    std::error_code ec;
    for (fs::recursive_directory_iterator it(fs::current_path(ec),
             fs::directory_options::skip_permission_denied, ec), end;
         !ec && it != end; it.increment(ec))
    {
        if (it->is_directory(ec))
        {
            const std::string dn = it->path().filename().string();
            const bool instant = !dn.empty() && dn != "0"
                && dn.find_first_not_of("0123456789.") == std::string::npos;
            if (skipDirs.count(dn) || instant) it.disable_recursion_pending();
            continue;
        }
        const std::string fn = it->path().filename().string();
        for (const char* n : names)
            if (fn == n && fileMentionsSolvent(it->path())) return true;
    }
    fs::path up = fs::current_path(ec);
    for (int level = 0; level < 6 && up.has_parent_path() && up != up.parent_path(); ++level)
    {
        up = up.parent_path();
        for (const char* sub : { "constant", "system", "" })
            for (const char* n : names)
                if (fileMentionsSolvent(up / sub / n)) return true;
    }
    return false;
}

} // anonymous namespace

void HenrysLawRegistry::loadFrom(const std::string& dataRoot)
{
    Pending& p = pending();
    {
        std::lock_guard<std::mutex> lock(p.m);
        p.dataRoot  = dataRoot;
        p.sealed    = records::sealedStrict();
        p.localDirs = records::localScanDirs("parameters/Henry");
        p.failure   = nullptr;
        p.armed.store(true, std::memory_order_release);
    }
    //  A case that names a solvent reads the registry HERE, as it always did:
    //  a malformed record refuses at start-up, never inside a later catch.
    if (caseMayUseHenry()) ensureLoadedImpl();
}

namespace {

void loadNow(const Pending& p)
{
    const std::string& dataRoot = p.dataRoot;
    auto scan = [](const fs::path& dir, records::ScanGuard& guard)
    {
        if (!fs::exists(dir)) return;
        for (auto& e : fs::directory_iterator(dir))
        {
            if (!e.is_regular_file()) continue;
            if (e.path().extension() != ".dat") continue;
            auto d = Dictionary::fromFile(e.path().string());
            HenrysLaw h;
            h.readFromDict(d);
            if (h.solute().empty() || h.solvent().empty())
                throw std::runtime_error("HenrysLawRegistry: file '"
                    + e.path().string() + "' lacks `solute` or `solvent`");
            guard.claim(key(h.solute(), h.solvent()), e.path().string());
            registry()[key(h.solute(), h.solvent())] = std::move(h);
        }
    };
    // ONE resolver policy (sealing redesign): identity-merge in the unsealed
    // case -- the catalogue is the base, the nearest case-local dir
    // (constant/parameters/Henry/, or the legacy propertyData form) is
    // scanned AFTER it so the case's own record wins per (solute,solvent)
    // key.  A STRICTLY sealed case reads EXCLUSIVELY its local closure (the
    // catalogue is forbidden); loadFrom runs after the binary enters the
    // case directory, so the cwd walk sees the case.
    if (!p.sealed)
    {
        records::ScanGuard guard("HenrysLawRegistry", "Henry pair");
        scan(fs::path(dataRoot) / "standards" / "parameters" / "Henry", guard);
    }
    {
        //  ONE guard over EVERY case-local directory (2026-09-08): the
        //  nearest one walking up AND each `constant/parameters/Henry` a
        //  level of this case's own geography carries.  A pair is identified
        //  by (solute, solvent) across the whole case, so two sectors
        //  claiming it REFUSE naming both files -- same tier, no defensible
        //  winner.  The standards scan above is a different tier and keeps
        //  its own guard, so a case-local pair still overrides it, aloud.
        records::ScanGuard guard("HenrysLawRegistry", "Henry pair");
        for (const auto& d : p.localDirs)
            scan(d, guard);
    }
}

} // anonymous namespace

void HenrysLawRegistry::ensureLoaded() { Choupo::ensureLoadedImpl(); }

bool HenrysLawRegistry::has(const std::string& solute,
                            const std::string& solvent)
{
    ensureLoaded();
    return registry().count(key(solute, solvent)) > 0;
}

const HenrysLaw& HenrysLawRegistry::byPair(const std::string& solute,
                                            const std::string& solvent)
{
    ensureLoaded();
    auto it = registry().find(key(solute, solvent));
    if (it == registry().end())
    {
        std::string avail;
        for (const auto& kv : registry()) avail += " " + kv.first;
        throw std::runtime_error("HenrysLawRegistry: no entry for solute '"
            + solute + "' in solvent '" + solvent + "'.  Loaded:"
            + (avail.empty() ? " (none)" : avail));
    }
    return it->second;
}

std::vector<std::string> HenrysLawRegistry::availableNames()
{
    ensureLoaded();
    std::vector<std::string> v;
    v.reserve(registry().size());
    for (const auto& kv : registry()) v.push_back(kv.first);
    return v;
}

} // namespace Choupo
