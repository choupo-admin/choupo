/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    |
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.  See DictCanonical.H for the full notice.

    SPDX-License-Identifier: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

#include "core/DictCanonical.H"

#include "core/Dictionary.H"
#include "core/ReadLog.H"
#include "core/Dimensions.H"
#include "core/Sha256.H"

#include <cstdio>
#include <filesystem>
#include <map>
#include <mutex>
#include <tuple>
#if defined(__unix__) || defined(__APPLE__)
#include <sys/stat.h>
#endif

namespace Choupo {
namespace canonical {

namespace {

//  Round-trip scalar text: 17 significant digits reproduce any double
//  exactly, and the fixed format keeps the dump platform-stable.
std::string num(scalar v)
{
    char buf[40];
    std::snprintf(buf, sizeof(buf), "%.17g", static_cast<double>(v));
    return buf;
}

//  Words/strings enter verbatim between quotes; only the two characters
//  that could break the framing are escaped.
std::string quoted(const std::string& s)
{
    std::string out;
    out.reserve(s.size() + 2);
    out += '"';
    for (char c : s)
    {
        if (c == '"' || c == '\\') out += '\\';
        out += c;
    }
    out += '"';
    return out;
}

void dumpDict(const Dictionary& d, std::string& out)
{
    out += '{';
    for (const auto& key : d.keys())
    {
        out += key;
        out += '=';
        const EntryValue& v = d.entryValue(key);
        if (std::holds_alternative<scalar>(v))
        {
            out += num(std::get<scalar>(v));
            if (d.hasDimensions(key))
            {
                const Dimensions dm = d.dimensionsOf(key);
                out += '[';
                out += std::to_string(dm.M)     + ' ';
                out += std::to_string(dm.L)     + ' ';
                out += std::to_string(dm.T)     + ' ';
                out += std::to_string(dm.Theta) + ' ';
                out += std::to_string(dm.N);
                out += ']';
            }
        }
        else if (std::holds_alternative<std::string>(v))
        {
            out += quoted(std::get<std::string>(v));
        }
        else if (std::holds_alternative<std::vector<scalar>>(v))
        {
            out += '(';
            for (const auto& s : std::get<std::vector<scalar>>(v))
            {
                out += num(s);
                out += ' ';
            }
            out += ')';
        }
        else if (std::holds_alternative<std::vector<std::string>>(v))
        {
            out += '(';
            for (const auto& s : std::get<std::vector<std::string>>(v))
            {
                out += quoted(s);
                out += ' ';
            }
            out += ')';
        }
        else if (std::holds_alternative<std::vector<DictPtr>>(v))
        {
            out += '(';
            for (const auto& sd : std::get<std::vector<DictPtr>>(v))
                if (sd) dumpDict(*sd, out);
            out += ')';
        }
        else if (std::holds_alternative<DictPtr>(v))
        {
            const auto& sd = std::get<DictPtr>(v);
            if (sd) dumpDict(*sd, out);
            else    out += "{}";
        }
        else if (std::holds_alternative<Reference>(v))
        {
            out += '$';
            out += std::get<Reference>(v).name;
        }
        out += ';';
    }
    out += '}';
}

} // anonymous

std::string dump(const Dictionary& d)
{
    std::string out;
    dumpDict(d, out);
    return out;
}

//  ONE HASH PER FILE PER PROCESS (2026-11-22, start-up slice).  verifyPinsStart
//  and finalizePins hash the same records (each a parse + canonical dump +
//  SHA-256), as do the held-copy and identity checks.  The digest is a pure
//  function of the file's bytes, so it is memoised on (path, size, mtime): an
//  edit the process makes or sees changes the size or the modification time
//  and the next call re-parses.  A file that does not parse is never cached
//  (the caller's refusal fires every time, with the parser's own message).
//  The mutex guards the map and the parse and the hash run OUTSIDE the lock.
//  Thread-safety claim, exactly: the cache is; the parse itself is not
//  stronger than before (Dictionary::parseTime_ is a static, non-atomic flag).
//  Every caller hashes from the start-up and end-of-run code, single-threaded.
namespace {

struct HashKey
{
    std::uintmax_t size    = 0;
    std::int64_t   mtimeNs = 0;
    std::uint64_t  ino     = 0;     // POSIX only (0 elsewhere)
    std::int64_t   ctimeNs = 0;     // POSIX only (0 elsewhere)
    bool operator==(const HashKey& o) const
    {
        return size == o.size && mtimeNs == o.mtimeNs
            && ino == o.ino && ctimeNs == o.ctimeNs;
    }
};

struct HashCache
{
    std::mutex                                m;
    std::map<std::string, std::pair<HashKey, std::string>> byPath;
};

HashCache& hashCache()
{
    static HashCache* c = new HashCache();     // leaked: read by static destructors
    return *c;
}

bool statKey(const std::string& path, HashKey& k)
{
    std::error_code ec;
    const auto sz = std::filesystem::file_size(path, ec);
    if (ec) return false;
    const auto mt = std::filesystem::last_write_time(path, ec);
    if (ec) return false;
    k.size    = sz;
    k.mtimeNs = static_cast<std::int64_t>(mt.time_since_epoch().count());
#if defined(__unix__) || defined(__APPLE__)
    struct stat st;
    if (::stat(path.c_str(), &st) == 0)
    {
        k.ino = static_cast<std::uint64_t>(st.st_ino);
#if defined(__APPLE__)
        k.ctimeNs = static_cast<std::int64_t>(st.st_ctimespec.tv_sec) * 1000000000LL
                  + st.st_ctimespec.tv_nsec;
#else
        k.ctimeNs = static_cast<std::int64_t>(st.st_ctim.tv_sec) * 1000000000LL
                  + st.st_ctim.tv_nsec;
#endif
    }
#endif
    return true;
}

} // anonymous

std::string sha256OfFile(const std::string& pathAsGiven)
{
    //  The cache is keyed on the ABSOLUTE path, so the same file reached from
    //  two working directories shares one entry and two files that share a
    //  relative spelling never do.
    std::error_code absEc;
    const std::string path = std::filesystem::absolute(pathAsGiven, absEc).string();
    HashKey key{};
    const bool keyed = !absEc && statKey(path, key);
    if (keyed)
    {
        std::lock_guard<std::mutex> lock(hashCache().m);
        auto it = hashCache().byPath.find(path);
        if (it != hashCache().byPath.end() && it->second.first == key)
            return it->second.second;
    }
    readlog::Pause hashing;   // a hash is a verification, never a consumption (C413)
    DictPtr d = Dictionary::fromFile(pathAsGiven);   // as given: the parser messages name it
    std::string h = sha256::hex(dump(*d));
    if (keyed)
    {
        std::lock_guard<std::mutex> lock(hashCache().m);
        hashCache().byPath[path] = { key, h };
    }
    return h;
}

} // namespace canonical
} // namespace Choupo
