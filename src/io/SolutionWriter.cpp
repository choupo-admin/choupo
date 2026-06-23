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
    // FAITHFUL to OpenFOAM: instants are TIME DIRECTORIES at the CASE ROOT
    // (`0/ 1/ 2/ 3/`, next to constant/ system/ and the sector folders), not
    // under a solution/ wrapper.  The log + latest symlink also live here.
    caseRoot_ = fs::path(caseDir).string();

    // D3 (reap litter): a prior run aborted mid-write leaves an orphan
    // `.tmp_<it>` (or `.tmp_*`) dir at the case root.  It is never published
    // (no rename happened), so it is pure garbage --- sweep it on construction
    // so the tree is clean before the first write and `ls` is honest.  We touch
    // ONLY our own `.tmp_*` litter, never the case's versioned folders.
    std::error_code ec;
    if (fs::exists(caseRoot_, ec))
        for (const auto& e : fs::directory_iterator(caseRoot_, ec))
        {
            const std::string nm = e.path().filename().string();
            if (nm.rfind(".tmp_", 0) == 0)
                fs::remove_all(e.path(), ec);
        }
}

// True iff `nm` is a non-empty, purely-numeric directory name (an instant).
static bool isNumericName(const std::string& nm)
{
    return !nm.empty()
        && std::all_of(nm.begin(), nm.end(),
                       [](char c){ return std::isdigit(static_cast<unsigned char>(c)); });
}

// ---------------------------------------------------------------------------
//  Classify every stream into a boundary role from the flattened units'
//  ins/outs (the resolved GLOBAL dotted keys = the registry keys) + the tear
//  set.  A stream produced-but-never-consumed is a PRODUCT; consumed-but-
//  never-produced is a FEED; both => INTERIOR; the tear set overrides all
//  (an internal torn stream).  Reuses the engine's own connectivity, no new
//  DOF logic.  A stream that does not touch any unit (rare boundary alias)
//  stays Interior (no tag) --- we never invent a role we can't justify.
// ---------------------------------------------------------------------------
std::map<std::string, SolutionWriter::Bc> SolutionWriter::classifyStreams(
    const std::vector<FlatUnit>&                 units,
    const std::set<std::string>&                 tearSet,
    const std::map<std::string, ProcessStream>&  streams) const
{
    std::set<std::string> produced;   // appears as some unit's output
    std::set<std::string> consumed;   // appears as some unit's input
    for (const auto& u : units)
    {
        for (const auto& in  : u.ins)  consumed.insert(in);
        for (const auto& out : u.outs) produced.insert(out);
    }

    std::map<std::string, Bc> roles;
    for (const auto& [name, s] : streams)
    {
        (void)s;
        if (tearSet.count(name))                    roles[name] = Bc::Tear;
        else if (consumed.count(name) && !produced.count(name))
                                                    roles[name] = Bc::Feed;
        else if (produced.count(name) && !consumed.count(name))
                                                    roles[name] = Bc::Product;
        else                                        roles[name] = Bc::Interior;
    }
    return roles;
}

const char* SolutionWriter::bcWord(Bc bc)
{
    switch (bc)
    {
        case Bc::Feed:     return "fixedValue";   // Dirichlet: the DOF you OWN
        case Bc::Product:  return "computed";     // read off the producing unit
        case Bc::Tear:     return "tear";         // internal torn (tear true;)
        case Bc::Interior: return "";             // no tag
    }
    return "";
}

// ---------------------------------------------------------------------------
//  Render one stream as a parser-valid Choupo dict sub-block.
//
//  Composition is written as per-species `molarFlows { name kmol/s; }` so
//  that F and z reconstruct LOSSLESSLY on read (readSourceStream sums the
//  per-species flows to F and divides for z --- no Sigma z = 1 renormalise,
//  no information lost).  T/P/vf/H are SI-canonical scalars; H is labelled
//  informational (H is the conserved truth, T the model-dependent readout).
//
//  The `bc` tag is the stream's prescribed/computed status read off the
//  topology: a feed is `bc fixedValue;` (Dirichlet), a product `bc computed;`,
//  a tear keeps the original `tear true;`, an interior stream gets no tag.
// ---------------------------------------------------------------------------
std::string SolutionWriter::renderStream(const std::string&   name,
                                         const ProcessStream&  s,
                                         Bc                    bc) const
{
    std::ostringstream o;
    o << "    \"" << name << "\"\n    {\n";
    if (bc == Bc::Tear)
        o << "        tear        true;             // INTERNAL torn stream; restart reseeds it\n";
    else if (bc == Bc::Feed)
        o << "        bc          fixedValue;       // FEED (Dirichlet) -- the DOF you own\n";
    else if (bc == Bc::Product)
        o << "        bc          computed;         // PRODUCT -- read off the producing unit\n";
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
//  The read-only topology{} echo: the tear streams + the flattened
//  who-feeds-whom connections.  Reconstructed from the units' ins/outs --- a
//  connection is "producer.out -> consumer.in" where both endpoints carry the
//  same GLOBAL stream key (the shared face).  This makes the instant SELF-
//  describing without re-parsing the flowsheetDict tree, and is exactly WHY
//  the topology authoring source need not be moved.
// ---------------------------------------------------------------------------
std::string SolutionWriter::renderTopology(
    const std::vector<FlatUnit>&     units,
    const std::vector<std::string>&  tears) const
{
    // Map each global stream to its producer unit (the unit emitting it) and
    // each consumer.  A feed has no producer (it enters from the boundary); a
    // product has no consumer (it leaves to the boundary).
    std::map<std::string, std::string>               producerOf;
    std::map<std::string, std::vector<std::string>>  consumersOf;
    for (const auto& u : units)
    {
        for (const auto& out : u.outs) producerOf[out] = u.name;
        for (const auto& in  : u.ins)  consumersOf[in].push_back(u.name);
    }

    std::ostringstream o;
    o << "// ---- TOPOLOGY this instant was solved on (read-only echo of the "
         "\"mesh\") ----\n"
         "//   The instant is SELF-DESCRIBING: who-feeds-whom without re-parsing\n"
         "//   the flowsheetDict.  Written by the engine, never hand-edited.\n";
    o << "topology\n{\n";
    o << "    tearStreams ( ";
    for (const auto& t : tears) o << "\"" << t << "\" ";
    o << ");\n";
    o << "    connections                      // { from <unit|\"feed\"> ; via <stream> ; to <unit> ; }\n    (\n";
    for (const auto& u : units)
        for (const auto& in : u.ins)
        {
            // The face `in` flows from its producer (or, with no producer, a
            // boundary feed) into u.  ALL values are QUOTED so the dict reads
            // back through the engine's own tokenizer (a bare `(feed)` would be
            // mis-tokenised as a list, and a dotted unit name is fine quoted).
            auto pit = producerOf.find(in);
            const std::string from = (pit != producerOf.end())
                                   ? ("\"" + pit->second + "\"")
                                   : "\"feed\"";
            o << "        { from " << std::left << std::setw(30) << (from + ";")
              << " via " << std::setw(36) << ("\"" + in + "\";")
              << " to \"" << u.name << "\"; }\n";
        }
    o << "    );\n}\n";
    return o.str();
}

// ---------------------------------------------------------------------------
//  The per-unit byUnit/<dotted.unit>/ projection.  For each flattened unit:
//    - a relative symlink `streams -> ../../streams` (the SINGLE source);
//    - a generated `ports` dict naming this unit's inlets/outlets by their
//      GLOBAL dotted key + bc role.
//  A stream shared by two units (an interior face) appears in BOTH units'
//  ports lists but is stored ONCE in <n>/streams.  Written under the instant's
//  TMP dir so it publishes atomically with the streams payload (relative
//  symlinks survive the rename of the parent dir).
// ---------------------------------------------------------------------------
void SolutionWriter::writeByUnit(
    const std::string&                instTmpDir,
    const std::vector<FlatUnit>&      units,
    const std::map<std::string, Bc>&  roles) const
{
    std::error_code ec;
    const fs::path byUnit = fs::path(instTmpDir) / "byUnit";
    fs::create_directories(byUnit, ec);

    auto roleWord = [&](const std::string& g) -> std::string {
        auto it = roles.find(g);
        if (it == roles.end()) return "interior";
        switch (it->second)
        {
            case Bc::Feed:     return "fixedValue";
            case Bc::Product:  return "computed";
            case Bc::Tear:     return "tear";
            case Bc::Interior: return "interior";
        }
        return "interior";
    };

    for (const auto& u : units)
    {
        const fs::path udir = byUnit / u.name;   // u.name is the dotted address
        fs::create_directories(udir, ec);

        // (1) the single-source symlink: byUnit/<unit>/streams -> ../../streams
        const fs::path link = udir / "streams";
        fs::remove(link, ec);
        fs::create_symlink("../../streams", link, ec);
        // (a symlink-hostile filesystem just drops the convenience link; the
        //  ports dict below still carries every global key as plain text.)

        // (2) the ports dict: which global keys are this unit's in/outlets.
        std::ostringstream p;
        p << "// byUnit/" << u.name << "/ports --- this unit's slice of the\n"
             "// single-source ../../streams face-flux field.  Each entry names\n"
             "// the GLOBAL stream key + its bc role; an interior stream shared\n"
             "// with the neighbour unit also appears in THAT unit's ports.\n";
        p << "unit        \"" << u.name << "\";\n";
        p << "type        " << (u.type.empty() ? "?" : u.type) << ";\n";
        p << "streams     \"../../streams\";       // the single-source projection target\n";
        p << "inlets\n{\n";
        for (std::size_t i = 0; i < u.ins.size(); ++i)
            p << "    port" << i << " { global \"" << u.ins[i] << "\"; bc "
              << roleWord(u.ins[i]) << "; }\n";
        p << "}\n";
        p << "outlets\n{\n";
        for (std::size_t i = 0; i < u.outs.size(); ++i)
            p << "    port" << i << " { global \"" << u.outs[i] << "\"; bc "
              << roleWord(u.outs[i]) << "; }\n";
        p << "}\n";

        std::ofstream f((udir / "ports").string(), std::ios::out | std::ios::trunc);
        f << p.str();
        f.close();
    }
}

// ---------------------------------------------------------------------------
void SolutionWriter::writeInstant(
    const SolutionInstantMeta&                   meta,
    const std::map<std::string, ProcessStream>&  streams,
    const std::vector<std::string>&              tears,
    const std::vector<FlatUnit>&                 units)
{
    std::error_code ec;
    fs::create_directories(caseRoot_, ec);

    const fs::path instDir = fs::path(caseRoot_) / std::to_string(meta.iteration);
    const fs::path tmpDir  = fs::path(caseRoot_)
                           / (".tmp_" + std::to_string(meta.iteration));

    // Clean any stale tmp from a previous aborted write of THIS instant.
    fs::remove_all(tmpDir, ec);
    fs::create_directories(tmpDir, ec);

    std::vector<std::string> tearList(tears.begin(), tears.end());
    std::set<std::string> tearSet(tearList.begin(), tearList.end());

    // Classify every stream into a bc role (feed/product/tear/interior) from
    // the flattened topology --- mechanical, reuses the engine's connectivity.
    const std::map<std::string, Bc> roles =
        classifyStreams(units, tearSet, streams);

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
"| (T [K], P [Pa], molarFlows [kmol/s]).  A stream IS the flux between two\n"
"| units (OpenFOAM's surfaceField phi): stored ONCE here, projected per-unit\n"
"| in byUnit/.  Tear inlets differ from computed outlets by |r| until\n"
"| converged.  Reads back via the engine's own dict tokenizer (never JSON).\n"
"\\*-----------------------------------------------------------------------------*/\n\n";

    body << "pseudoTime      " << meta.iteration << ";\n";
    body << "converged       " << (meta.converged ? "true" : "false") << ";\n";
    body << "tearResidual    " << sci(meta.tearResidual) << ";\n";
    body << "tolerance       " << sci(meta.tolerance) << ";\n\n";

    // Read-only topology{} echo (the "mesh" this instant was solved on).
    body << renderTopology(units, tearList) << "\n";

    body << "streams\n{\n";
    for (const auto& [name, s] : streams)
    {
        auto rit = roles.find(name);
        body << renderStream(name, s, rit != roles.end() ? rit->second : Bc::Interior);
    }
    body << "}\n";

    // ---- Durable write: tmp file -> (fsync if flushEach) -> atomic rename ---
    //  flushEach true : fsync the data before rename + fsync the case root after
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

    // ---- Per-unit byUnit/ projection (gated, written into the SAME tmp dir
    //      so it publishes atomically with the streams payload) -------------
    //  The relative symlinks (streams -> ../../streams) are valid the moment
    //  the parent dir is renamed into place; we resolve them from instDir's
    //  vantage, which the rename makes correct.
    if (cfg_.byUnit)
        writeByUnit(tmpDir.string(), units, roles);

    // Atomic publish: remove any existing instant dir, then rename tmp -> it.
    fs::remove_all(instDir, ec);
    fs::rename(tmpDir, instDir, ec);
    if (ec)
    {
        // Rename can fail across exotic filesystems; fall back to a recursive
        // copy so we never silently lose the instant (streams + byUnit/).  The
        // relative byUnit symlinks copy as symlinks (copy_symlinks), staying
        // valid because the ../../streams target moves with them.
        fs::remove_all(instDir, ec);
        fs::copy(tmpDir, instDir,
                 fs::copy_options::recursive | fs::copy_options::copy_symlinks
                     | fs::copy_options::overwrite_existing, ec);
        fs::remove_all(tmpDir, ec);
    }

    // D1 second half: fsync the parent directory so the new entry survives a
    // power loss (the rename's metadata must reach stable storage too).
    if (cfg_.flushEach)
        fsyncPath(caseRoot_, /*isDir=*/true);

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
    const fs::path logp = fs::path(caseRoot_) / "solution.log";
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
    const fs::path link = fs::path(caseRoot_) / "latest";
    std::error_code ec;
    fs::remove(link, ec);
    // Relative target so the tree stays portable if the case is moved.
    fs::create_directory_symlink(std::to_string(iteration), link, ec);
    if (ec)
    {
        // Filesystems without symlink support: drop a plain marker file so
        // `latest` is still discoverable (restart also scans numbered dirs by
        // max-number, so this marker is purely a human convenience).
        std::ofstream f((fs::path(caseRoot_) / "latest.txt").string(),
                        std::ios::out | std::ios::trunc);
        f << iteration << "\n";
    }
}

// ---------------------------------------------------------------------------
void SolutionWriter::purgeOldInstants(int currentIteration,
                                      const std::vector<int>& alwaysKeep) const
{
    if (cfg_.purgeWrite <= 0) return;   // 0 => keep all

    // Collect existing numbered instant dirs.  We iterate the CASE ROOT, which
    // also holds the versioned sector folders (names), constant/, system/, and
    // the case's .cho / dicts --- so the all-digit filter is load-bearing: ONLY
    // purely-numeric directories are ours to manage.  A sector named e.g.
    // CONCENTRATION is never numeric, so it can never be purged.
    std::vector<int> nums;
    std::error_code ec;
    for (const auto& e : fs::directory_iterator(caseRoot_, ec))
    {
        if (!e.is_directory()) continue;
        const std::string nm = e.path().filename().string();
        if (!isNumericName(nm)) continue;
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
            fs::remove_all(fs::path(caseRoot_) / std::to_string(n), ec);
}

// ---------------------------------------------------------------------------
int SolutionWriter::latestInstantNumber() const
{
    // OpenFOAM `latestTime` style: the highest-numbered instant dir at the case
    // root that actually carries a `streams` payload.  The all-digit + streams
    // filter means sector folders / constant/ / system/ are never candidates,
    // and a half-written (payload-less) dir is skipped.  This is the source of
    // truth for restart even when the `latest` symlink is missing.
    std::error_code ec;
    if (!fs::exists(caseRoot_, ec)) return -1;
    int best = -1;
    for (const auto& e : fs::directory_iterator(caseRoot_, ec))
    {
        if (!e.is_directory()) continue;
        const std::string nm = e.path().filename().string();
        if (!isNumericName(nm)) continue;
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

    const fs::path inst = fs::path(caseRoot_) / std::to_string(n) / "streams";
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
              << " tear stream(s) from instant " << n << "/streams.\n";
    for (const auto& m : missing)
        std::cout << "  WARNING: tear '" << m << "' is flagged in the saved "
                     "instant but no longer exists in the flowsheet --- NOT "
                     "reseeded (topology changed since that write).\n";
    if (reseeded == 0)
        std::cout << "  ERROR-LEVEL ADVISORY: restartFromLatest reseeded ZERO "
                     "tears --- the restart had NO effect; the solve proceeds "
                     "from plain auto-init.  (No tear in instant " << n
                  << "/streams matched a current tear stream.)\n";
    return n;
}

} // namespace Choupo
