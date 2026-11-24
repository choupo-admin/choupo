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
-------------------------------------------------------------------------------
Class
    Choupo::restartTears

Description
    The exact restart record of the recycle loop; see RestartTears.H.

\*---------------------------------------------------------------------------*/

#include "io/RestartTears.H"

#include <algorithm>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <set>
#include <sstream>
#include <vector>

namespace fs = std::filesystem;

namespace Choupo
{
namespace restartTears
{

namespace
{

//  Two FNV-1a lanes, 128 bits in all, as 32 hex characters.
struct Hasher
{
    std::uint64_t a = 0xcbf29ce484222325ULL;
    std::uint64_t b = 0x84222325cbf29ce4ULL;
    void bytes(const char* p, std::size_t n)
    {
        for (std::size_t i = 0; i < n; ++i)
        {
            const std::uint64_t c = static_cast<unsigned char>(p[i]);
            a = (a ^ c) * 0x100000001b3ULL;
            b = (b ^ (c + 0x9e)) * 0x1000193ULL;
        }
    }
    void str(const std::string& s) { bytes(s.data(), s.size()); bytes("\0", 1); }
    std::string hex() const
    {
        char buf[40];
        std::snprintf(buf, sizeof buf, "%016llx%016llx",
                      static_cast<unsigned long long>(a),
                      static_cast<unsigned long long>(b));
        return buf;
    }
};

bool hashFile(Hasher& h, const fs::path& p)
{
    std::ifstream in(p, std::ios::binary);
    if (!in) return false;
    std::vector<char> buf(1 << 16);
    std::uint64_t total = 0;
    while (in)
    {
        in.read(buf.data(), static_cast<std::streamsize>(buf.size()));
        const std::streamsize n = in.gcount();
        if (n > 0) { h.bytes(buf.data(), static_cast<std::size_t>(n)); total += static_cast<std::uint64_t>(n); }
    }
    h.str(std::to_string(total));
    return true;
}

//  Directories a run WRITES, at any depth: never inputs.
bool isOutputDir(const std::string& n)
{
    return n == "converged" || n == "reports" || n == "design"
        || n == "postProcessing" || n == "iterations";
}

std::string hexOf(scalar v)
{
    char buf[48];
    std::snprintf(buf, sizeof buf, "%a", v);
    return buf;
}

} // namespace

fs::path recordPath(const fs::path& caseDir)
{
    return caseDir / "converged.restart";
}

std::string hashInputs(const fs::path& caseDirIn)
{
    std::error_code ec;
    const fs::path caseDir = fs::weakly_canonical(caseDirIn, ec);
    Hasher h;
    //  (1) the case itself
    std::vector<fs::path> files;
    for (fs::recursive_directory_iterator it(caseDir, ec), end; it != end;
         it.increment(ec))
    {
        if (ec) break;
        const fs::path rel = fs::relative(it->path(), caseDir);
        if (it->is_directory(ec))
        {
            if (isOutputDir(rel.filename().string())) it.disable_recursion_pending();
            continue;
        }
        if (!it->is_regular_file(ec)) continue;
        const std::string r = rel.generic_string();
        if (r == "converged.restart") continue;
        //  Act after the solve (post-processing and the layout check); a
        //  restart may differ in exactly these two files.
        if (r == "system/layoutDict" || r == "system/postDict") continue;
        files.push_back(rel);
    }
    std::sort(files.begin(), files.end());
    for (const auto& rel : files)
    {
        h.str(rel.generic_string());
        if (!hashFile(h, caseDir / rel)) return std::string();
    }
    //  (2) the folder cascade the engine reads (main.cpp resolveUp: six levels)
    fs::path p = caseDir;
    for (int up = 1; up <= 6; ++up)
    {
        if (p.parent_path() == p) break;
        p = p.parent_path();
        for (const char* sub : {"system", "constant"})
        {
            const fs::path q = p / sub;
            if (!fs::is_directory(q, ec)) continue;
            std::vector<fs::path> fl;
            for (fs::recursive_directory_iterator it(q, ec), end; it != end;
                 it.increment(ec))
            {
                if (ec) break;
                if (it->is_regular_file(ec)) fl.push_back(fs::relative(it->path(), p));
            }
            std::sort(fl.begin(), fl.end());
            for (const auto& rel : fl)
            {
                h.str(std::to_string(up) + "/" + rel.generic_string());
                if (!hashFile(h, p / rel)) return std::string();
            }
        }
    }
    return h.hex();
}

std::string hashBinary()
{
#if defined(__linux__) && !defined(__EMSCRIPTEN__)
    std::error_code ec;
    const fs::path exe = fs::read_symlink("/proc/self/exe", ec);
    if (ec) return std::string();
    Hasher h;
    if (!hashFile(h, exe)) return std::string();
    //  the shared libraries mapped from the executable's own directory
    std::set<std::string> libs;
    std::ifstream maps("/proc/self/maps");
    std::string line;
    while (std::getline(maps, line))
    {
        const auto slash = line.find('/');
        if (slash == std::string::npos) continue;
        const fs::path lib(line.substr(slash));
        if (lib.parent_path() == exe.parent_path() && lib != exe)
            libs.insert(lib.string());
    }
    for (const auto& l : libs)
    {
        h.str(fs::path(l).filename().string());
        if (!hashFile(h, l)) return std::string();
    }
    return h.hex();
#else
    return std::string();
#endif
}

bool write(const fs::path& path, const Record& r)
{
    std::ofstream o(path);
    if (!o) return false;
    o << "// Exact restart record of the recycle loop (choupoSolve --restart-tears).\n"
         "// Every number is a C99 hexadecimal float: the bits of the value the\n"
         "// solver entered its last pass with.  Not a result: converged/ is.\n";
    o << "recordType restartTears;\n"
      << "binary " << r.binaryHash << ";\n"
      << "inputs " << r.inputHash << ";\n"
      << "package " << r.packageIdentity << ";\n"
      << "solver " << r.solver << ";\n"
      << "converged " << (r.converged ? 1 : 0) << ";\n"
      << "residual " << hexOf(r.residual) << ";\n"
      << "iteration " << r.iteration << ";\n";
    for (const auto& kv : r.tears)
    {
        const ProcessStream& s = kv.second;
        o << "tear " << kv.first << " F " << hexOf(s.F) << " T " << hexOf(s.T)
          << " P " << hexOf(s.P) << " vf " << hexOf(s.vf)
          << " z " << s.z.size();
        for (auto v : s.z) o << " " << hexOf(v);
        o << " s " << s.s.size();
        for (auto v : s.s) o << " " << hexOf(v);
        o << ";\n";
    }
    return static_cast<bool>(o);
}

bool read(const fs::path& path, Record& r, std::string& why)
{
    std::ifstream in(path);
    if (!in) { why = "no record " + path.string(); return false; }
    std::string line;
    bool sawType = false;
    auto num = [](const std::string& t) { return std::strtod(t.c_str(), nullptr); };
    while (std::getline(in, line))
    {
        if (line.empty() || line.rfind("//", 0) == 0) continue;
        if (line.back() == ';') line.pop_back();
        std::istringstream ls(line);
        std::string key; ls >> key;
        if (key == "recordType") { std::string v; ls >> v; sawType = (v == "restartTears"); }
        else if (key == "binary")    ls >> r.binaryHash;
        else if (key == "inputs")    ls >> r.inputHash;
        else if (key == "package")   { std::getline(ls >> std::ws, r.packageIdentity); }
        else if (key == "solver")    ls >> r.solver;
        else if (key == "converged") { int v = 0; ls >> v; r.converged = (v != 0); }
        else if (key == "residual")  { std::string v; ls >> v; r.residual = num(v); }
        else if (key == "iteration") ls >> r.iteration;
        else if (key == "tear")
        {
            std::string name, tag, v;
            ls >> name;
            ProcessStream s; s.name = name;
            ls >> tag >> v; s.F  = num(v);
            ls >> tag >> v; s.T  = num(v);
            ls >> tag >> v; s.P  = num(v);
            ls >> tag >> v; s.vf = num(v);
            std::size_t nz = 0, ns = 0;
            ls >> tag >> nz;
            if (!ls || nz > 100000) { why = "malformed tear line for '" + name + "'"; return false; }
            s.z.resize(nz);
            for (auto& z : s.z) { ls >> v; z = num(v); }
            ls >> tag >> ns;
            if (!ls || ns > 100000) { why = "malformed tear line for '" + name + "'"; return false; }
            s.s.resize(ns);
            for (auto& x : s.s) { ls >> v; x = num(v); }
            if (!ls) { why = "malformed tear line for '" + name + "'"; return false; }
            r.tears[name] = std::move(s);
        }
        else { why = "unknown key '" + key + "'"; return false; }
    }
    if (!sawType || r.tears.empty()) { why = "not a restartTears record"; return false; }
    return true;
}

} // namespace restartTears
} // namespace Choupo
