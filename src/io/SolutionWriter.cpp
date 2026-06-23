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

namespace fs = std::filesystem;

namespace Choupo {

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

    // ---- Durable write: tmp file, flush+close, atomic rename ----------
    {
        std::ofstream f((tmpDir / "streams").string(),
                        std::ios::out | std::ios::trunc);
        f << body.str();
        f.flush();
        f.close();   // ensures the OS buffer is handed off before rename
    }

    // Atomic publish: remove any existing instant dir, then rename tmp -> it.
    fs::remove_all(instDir, ec);
    fs::rename(tmpDir, instDir, ec);
    if (ec)
    {
        // Rename can fail across exotic filesystems; fall back to a copy so we
        // never silently lose the instant.
        fs::create_directories(instDir, ec);
        fs::copy_file(tmpDir / "streams", instDir / "streams",
                      fs::copy_options::overwrite_existing, ec);
        fs::remove_all(tmpDir, ec);
    }

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
             "# iteration  converged  tearResidual          solver        written\n";
    f << std::left << std::setw(11) << meta.iteration
      << std::setw(11) << (meta.converged ? "true" : "false")
      << std::setw(22) << sci(meta.tearResidual)
      << std::setw(14) << (meta.solver.empty() ? "recycle" : meta.solver)
      << nowIso() << "\n";
    f.flush();
    f.close();
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
        nums.push_back(std::stoi(nm));
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
        best = std::max(best, std::stoi(nm));
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

    // Reseed ONLY the tear streams (the ones flagged tear true; in the file
    // AND named in the current tear list).  Everything else keeps auto-init.
    for (const auto& sname : sblock->keys())
    {
        if (!tearSet.count(sname)) continue;
        auto sd = sblock->subDict(sname);
        const bool flagged = (sd->lookupWordOrDefault("tear", "false") == "true");
        if (!flagged) continue;
        if (!streams.count(sname)) continue;   // unknown after re-flatten: skip

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
    }
    return n;
}

} // namespace Choupo
