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
#include "core/Dimensions.H"
#include "core/Sha256.H"

#include <cstdio>

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

std::string sha256OfFile(const std::string& path)
{
    DictPtr d = Dictionary::fromFile(path);
    return sha256::hex(dump(*d));
}

} // namespace canonical
} // namespace Choupo
