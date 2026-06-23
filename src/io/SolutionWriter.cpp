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

#include "io/SolutionWriter.H"

#include "core/Banner.H"
#include "core/Dictionary.H"
#include "thermo/ThermoPackage.H"

#include <algorithm>
#include <cstdio>          // std::rename
#include <ctime>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <set>
#include <sstream>

#if !defined(_WIN32)
#  include <fcntl.h>       // open, O_RDONLY
#  include <unistd.h>      // fsync, close
#endif

namespace fs = std::filesystem;

namespace Choupo {

// Power-loss durability primitive (POSIX): fsync the given path.  `isDir`
// opens it O_DIRECTORY so the directory entry itself is flushed (the second
// half of the rename-without-fsync fix).  A no-op on Windows / on failure ---
// we degrade to abort-survival-only rather than abort the run for a sync error.
static void fsyncPath(const fs::path& p, bool isDir)
{
#if defined(_WIN32)
    (void)p; (void)isDir;
#else
    const int flags = O_RDONLY | (isDir ? O_DIRECTORY : 0);
    const int fd = ::open(p.c_str(), flags);
    if (fd < 0) return;
    ::fsync(fd);
    ::close(fd);
#endif
}

// Full round-trippable precision for SI scalars (17 sig-figs = exact double).
static std::string sci(scalar v)
{
    std::ostringstream os;
    os << std::setprecision(17) << v;
    return os.str();
}

static std::string nowIso()
{
    std::time_t t = std::time(nullptr);
    std::tm tmv{};
#if defined(_WIN32)
    localtime_s(&tmv, &t);
#else
    localtime_r(&t, &tmv);
#endif
    char buf[32];
    std::strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S", &tmv);
    return std::string(buf);
}

SolutionWriter::SolutionWriter(std::string caseDir,
                               const SolutionControl& cfg,
                               std::vector<std::string> compNames)
    : cfg_(cfg), compNames_(std::move(compNames))
{
    solutionDir_ = (fs::path(caseDir) / "solution").string();

    // D3 (reap litter): a prior run aborted mid-write leaves an orphan
    // `.tmp_<it>` (or `.tmp_*`) dir under solution/.  It is never published
    // (no rename happened), so it is pure garbage --- sweep it on construction
    // so the tree is clean before the first write and `ls solution/` is honest.
    std::error_code ec;
    if (fs::exists(solutionDir_, ec))
        for (const auto& e : fs::directory_iterator(solutionDir_, ec))
        {
            const std::string nm = e.path().filename().string();
            if (nm.rfind(".tmp_", 0) == 0)
                fs::remove_all(e.path(), ec);
        }
}

// ---------------------------------------------------------------------------
//  Render one stream as a parser-valid Choupo dict sub-block.
//
//  Composition is written as per-species `molarFlows { name kmol/s; }` so
//  that F and z reconstruct LOSSLESSLY on read (readSourceStream sums the
//  per-species flows to F and divides for z --- no Sigma z = 1 renormalise,
//  no information lost).  T/P/vf/H are SI-canonical scalars; H is labelled
//  informational (H is the conserved truth, T the model-dependent readout).
// ---------------------------------------------------------------------------
std::string SolutionWriter::renderStream(const std::string&   name,
                                         const ProcessStream&  s,
                                         bool                  isTear) const
{
    std::ostringstream o;
    o << "    \"" << name << "\"\n    {\n";
    if (isTear)
        o << "        tear        true;             // restart reseeds this stream\n";
    o << "        T           " << sci(s.T)  << ";   // K\n";
    o << "        P           " << sci(s.P)  << ";   // Pa\n";
    o << "        vf          " << sci(s.vf) << ";   // -\n";
    if (s.H_valid)
        o << "        H           " << sci(s.H)
          << ";   // J/mol  (informational; H conserved, T is the readout)\n";

    // Per-species molar flows (kmol/s, SI canonical).  This is the lossless
    // F/z carrier: total F = sum, z_i = F_i / F.
    o << "        molarFlows                        // kmol/s per species\n        {\n";
    for (std::size_t i = 0; i < compNames_.size(); ++i)
    {
        const scalar zi = (i < s.z.size()) ? s.z[i] : 0.0;
        const scalar Fi = s.F * zi;
        o << "            " << std::left << std::setw(16) << compNames_[i]
          << " " << sci(Fi) << ";\n";
    }
    o << "        }\n";

    // Solid phase (optional): present only when the stream carries solids.
    bool hasSolids = false;
    for (scalar v : s.s) if (v != 0.0) { hasSolids = true; break; }
    if (hasSolids)
    {
        o << "        // solid molar flow per species (kmol/s) --- informational"
             " snapshot\n";
        o << "        solidFlowsMolar\n        {\n";
        for (std::size_t i = 0; i < compNames_.size() && i < s.s.size(); ++i)
            if (s.s[i] != 0.0)
                o << "            " << std::left << std::setw(16) << compNames_[i]
                  << " " << sci(s.s[i]) << ";\n";
        o << "        }\n";
    }
    o << "    }\n";
    return o.str();
}

// ---------------------------------------------------------------------------
void SolutionWriter::writeInstant(
    const SolutionInstantMeta&                   meta,
    const std::map<std::string, ProcessStream>&  streams,
    const std::vector<std::string>&              tears)
{
    std::error_code ec;
    fs::create_directories(solutionDir_, ec);

    const fs::path instDir = fs::path(solutionDir_) / std::to_string(meta.iteration);
    const fs::path tmpDir  = fs::path(solutionDir_)
                           / (".tmp_" + std::to_string(meta.iteration));

    // Clean any stale tmp from a previous aborted write of THIS instant.
    fs::remove_all(tmpDir, ec);
    fs::create_directories(tmpDir, ec);

    std::vector<std::string> tearList(tears.begin(), tears.end());

    // ---- Build the instant body (header + scalars + streams) ----------
    std::ostringstream body;
    body <<
"/*--------------------------------*- Choupo -*----------------------------------*\\\n"
"| Choupo " << CHOUPO_VERSION << "   solution instant   pseudoTime "
         << meta.iteration << "  (recycle outer iteration)\n"
"| solver: " << (meta.solver.empty() ? "recycle" : meta.solver)
         << "   converged: " << (meta.converged ? "true" : "false") << "\n"
"| tearResidual |r|2 = " << sci(meta.tearResidual)
         << "   tol " << sci(meta.tolerance) << "\n"
"| written: " << nowIso() << "\n"
"| SNAPSHOT of the flowsheet stream registry at this iteration.  SI-canonical\n"
"| (T [K], P [Pa], molarFlows [kmol/s]).  Tear inlets differ from computed\n"
"| outlets by |r| until converged.  Reads back via the engine's own dict\n"
"| tokenizer (never JSON/YAML).\n"
"\\*-----------------------------------------------------------------------------*/\n\n";

    body << "pseudoTime      " << meta.iteration << ";\n";
    body << "converged       " << (meta.converged ? "true" : "false") << ";\n";
    body << "tearResidual    " << sci(meta.tearResidual) << ";\n";
    body << "tolerance       " << sci(meta.tolerance) << ";\n";

    body << "tearStreams     ( ";
    for (const auto& t : tearList) body << "\"" << t << "\" ";
    body << ");\n\n";

    std::set<std::string> tearSet(tearList.begin(), tearList.end());

    body << "streams\n{\n";
    for (const auto& [name, s] : streams)
        body << renderStream(name, s, tearSet.count(name) > 0);
    body << "}\n";

    // ---- Durable write: tmp file -> (fsync if flushEach) -> atomic rename ---
    //  flushEach true : fsync the data before rename + fsync solution/ after
    //                   => power-loss durable.
    //  flushEach false: skip the fsyncs (faster, abort-safe-only).
    //  Either way the rename is atomic, so a restart never reads a half write.
    const fs::path tmpFile = tmpDir / "streams";
    {
        std::ofstream f(tmpFile.string(), std::ios::out | std::ios::trunc);
        f << body.str();
        f.flush();
        // D5 (no truncated-success): if the stream went bad mid-write (e.g.
        // ENOSPC), DISCARD the .tmp and warn --- never publish a partial
        // instant as if it converged.
        if (!f.good())
        {
            f.close();
            fs::remove_all(tmpDir, ec);
            std::cerr << "WARNING: solutionControl: write of instant "
                      << meta.iteration << " failed (disk full / I/O error?)"
                         " --- instant NOT published (kept the last good one).\n";
            return;
        }
        f.close();   // hands the OS buffer off before rename
    }
    if (cfg_.flushEach)
        fsyncPath(tmpFile, /*isDir=*/false);   // data on stable storage pre-rename

    // Atomic publish: remove any existing instant dir, then rename tmp -> it.
    fs::remove_all(instDir, ec);
    fs::rename(tmpDir, instDir, ec);
    if (ec)
    {
        // Rename can fail across exotic filesystems; fall back to a copy so we
        // never silently lose the instant.
        fs::create_directories(instDir, ec);
        fs::copy_file(tmpFile, instDir / "streams",
                      fs::copy_options::overwrite_existing, ec);
        fs::remove_all(tmpDir, ec);
    }

    // D1 second half: fsync the parent directory so the new entry survives a
    // power loss (the rename's metadata must reach stable storage too).
    if (cfg_.flushEach)
        fsyncPath(solutionDir_, /*isDir=*/true);

    appendLog(meta);
    refreshLatestSymlink(meta.iteration);

    // Purge old numbered instants (always keep 0/ and the converged final).
    std::vector<int> keep = { 0 };
    if (meta.converged) keep.push_back(meta.iteration);
    purgeOldInstants(meta.iteration, keep);
}

// ---------------------------------------------------------------------------
void SolutionWriter::appendLog(const SolutionInstantMeta& meta) const
{
    const fs::path logp = fs::path(solutionDir_) / "solution.log";
    const bool needHeader = !fs::exists(logp);
    std::ofstream f(logp.string(), std::ios::out | std::ios::app);
    if (needHeader)
        f << "# Choupo solution log --- one line per written instant.\n"
             "# the FINAL converged instant is marked [*]; a mid-convergence row\n"
             "# may carry the SAME iteration number as a later [*] row --- the [*]\n"
             "# row is the canonical answer for that number.\n"
             "# iteration  converged  tearResidual              solver           written\n";
    // D4 (unambiguous log): tag the converged final row so it can never be
    // confused with a mid-convergence row that happens to share its number.
    // sci() can be 24 chars (17 sig-figs scientific) --- setw(26) + an explicit
    // two-space gap so the residual never collides with the solver column.
    f << std::left
      << std::setw(4)  << (meta.converged ? "[*]" : "")
      << std::setw(11) << meta.iteration
      << std::setw(11) << (meta.converged ? "true" : "false")
      << std::setw(26) << sci(meta.tearResidual) << "  "
      << std::setw(15) << (meta.solver.empty() ? "recycle" : meta.solver) << "  "
      << nowIso() << "\n";
    f.flush();
    f.close();
    // D1: a durable instant means a durable log line too (else a power loss
    // could leave an instant on disk with no record of it).
    if (cfg_.flushEach)
        fsyncPath(logp, /*isDir=*/false);
}

// ---------------------------------------------------------------------------
void SolutionWriter::refreshLatestSymlink(int iteration) const
{
    const fs::path link = fs::path(solutionDir_) / "latest";
    std::error_code ec;
    fs::remove(link, ec);
    // Relative target so the tree stays portable if the case is moved.
    fs::create_directory_symlink(std::to_string(iteration), link, ec);
    if (ec)
    {
        // Filesystems without symlink support: drop a plain marker file so
        // `latest` is still discoverable (restart also scans numbered dirs).
        std::ofstream f((fs::path(solutionDir_) / "latest.txt").string(),
                        std::ios::out | std::ios::trunc);
        f << iteration << "\n";
    }
}

// ---------------------------------------------------------------------------
void SolutionWriter::purgeOldInstants(int currentIteration,
                                      const std::vector<int>& alwaysKeep) const
{
    if (cfg_.purgeWrite <= 0) return;   // 0 => keep all

    // Collect existing numbered instant dirs.
    std::vector<int> nums;
    std::error_code ec;
    for (const auto& e : fs::directory_iterator(solutionDir_, ec))
    {
        if (!e.is_directory()) continue;
        const std::string nm = e.path().filename().string();
        if (nm.empty() || !std::all_of(nm.begin(), nm.end(),
                                       [](char c){ return std::isdigit(static_cast<unsigned char>(c)); }))
            continue;
        // D6 (robustness): an all-digit name can still overflow int (e.g. a
        // pathological 30-digit dir).  stoi would throw out_of_range and abort
        // the run --- skip such names rather than crash.
        try { nums.push_back(std::stoi(nm)); }
        catch (const std::exception&) { continue; }
    }
    std::sort(nums.begin(), nums.end());

    std::set<int> keepSet(alwaysKeep.begin(), alwaysKeep.end());
    keepSet.insert(currentIteration);

    // Keep the last `purgeWrite` numbered instants (newest first), beyond the
    // always-keep set.
    int kept = 0;
    for (auto it = nums.rbegin(); it != nums.rend(); ++it)
    {
        if (keepSet.count(*it)) continue;
        if (kept < cfg_.purgeWrite) { keepSet.insert(*it); ++kept; }
    }
    for (int n : nums)
        if (!keepSet.count(n))
            fs::remove_all(fs::path(solutionDir_) / std::to_string(n), ec);
}

// ---------------------------------------------------------------------------
int SolutionWriter::latestInstantNumber() const
{
    std::error_code ec;
    if (!fs::exists(solutionDir_, ec)) return -1;
    int best = -1;
    for (const auto& e : fs::directory_iterator(solutionDir_, ec))
    {
        if (!e.is_directory()) continue;
        const std::string nm = e.path().filename().string();
        if (nm.empty() || !std::all_of(nm.begin(), nm.end(),
                                       [](char c){ return std::isdigit(static_cast<unsigned char>(c)); }))
            continue;
        if (!fs::exists(e.path() / "streams")) continue;
        // D6 (robustness): guard the same overflow as purgeOldInstants.
        try { best = std::max(best, std::stoi(nm)); }
        catch (const std::exception&) { continue; }
    }
    return best;
}

// ---------------------------------------------------------------------------
int SolutionWriter::restartFromLatest(
    std::map<std::string, ProcessStream>& streams,
    const std::vector<std::string>&        tears,
    const ThermoPackage&                   thermo) const
{
    const int n = latestInstantNumber();
    if (n < 0) return -1;

    const fs::path inst = fs::path(solutionDir_) / std::to_string(n) / "streams";
    DictPtr d;
    try { d = Dictionary::fromFile(inst.string()); }
    catch (const std::exception&) { return -1; }
    if (!d->found("streams")) return -1;

    auto sblock = d->subDict("streams");
    std::set<std::string> tearSet(tears.begin(), tears.end());

    // R4 (truthful announcement): count what is ACTUALLY reseeded.  A named
    // tear in the file that no longer exists in the flowsheet (renamed unit,
    // edited topology) reseeds NOTHING --- we must say so, not pretend.
    int reseeded = 0;
    std::vector<std::string> missing;   // flagged-tear in file, absent in flowsheet

    // Reseed ONLY the tear streams (the ones flagged tear true; in the file
    // AND named in the current tear list).  Everything else keeps auto-init.
    for (const auto& sname : sblock->keys())
    {
        if (!tearSet.count(sname)) continue;
        auto sd = sblock->subDict(sname);
        const bool flagged = (sd->lookupWordOrDefault("tear", "false") == "true");
        if (!flagged) continue;
        if (!streams.count(sname))    // a flagged tear that vanished from the flowsheet
        {
            missing.push_back(sname);
            continue;
        }

        ProcessStream& s = streams.at(sname);
        // Reconstruct F and z from the lossless per-species molarFlows.
        if (sd->found("molarFlows"))
        {
            auto mf = sd->subDict("molarFlows");
            sVector Fi(thermo.n(), 0.0);
            scalar Ftot = 0.0;
            for (const auto& key : mf->keys())
            {
                const std::size_t i = thermo.indexOf(key);
                if (i >= thermo.n()) continue;
                Fi[i] = mf->lookupScalar(key);
                Ftot += Fi[i];
            }
            s.F = Ftot;
            s.z.assign(thermo.n(), 0.0);
            for (std::size_t i = 0; i < thermo.n(); ++i)
                s.z[i] = (Ftot > 0.0) ? Fi[i] / Ftot : 0.0;
        }
        s.T  = sd->lookupScalarOrDefault("T",  s.T);
        s.P  = sd->lookupScalarOrDefault("P",  s.P);
        s.vf = sd->lookupScalarOrDefault("vf", s.vf);
        ++reseeded;
    }

    // R4: announce the TRUTH about the reseed.
    std::cout << "  RESTART: reseeded " << reseeded << " of " << tears.size()
              << " tear stream(s) from solution/" << n << "/streams.\n";
    for (const auto& m : missing)
        std::cout << "  WARNING: tear '" << m << "' is flagged in the saved "
                     "instant but no longer exists in the flowsheet --- NOT "
                     "reseeded (topology changed since that write).\n";
    if (reseeded == 0)
        std::cout << "  ERROR-LEVEL ADVISORY: restartFromLatest reseeded ZERO "
                     "tears --- the restart had NO effect; the solve proceeds "
                     "from plain auto-init.  (No tear in solution/" << n
                  << "/streams matched a current tear stream.)\n";
    return n;
}

} // namespace Choupo
