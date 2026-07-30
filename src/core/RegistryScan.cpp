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
    This file is part of Choupo.  See RegistryScan.H for the full notice.

    SPDX-License-Identifier: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

#include "core/RegistryScan.H"

#include <iostream>
#include <map>
#include <set>
#include <stdexcept>

namespace Choupo {
namespace records {

namespace {

// Who claimed each key, across every scan of this process: "<registry>|<key>"
// -> the file that claimed it.  Remembering the FILE (not merely that the key
// exists) is what separates a tier override from a plain re-load.
std::map<std::string, std::string>& claimed()
{
    static std::map<std::string, std::string> c;
    return c;
}

// One announcement per (registry, key) pair, however many times a registry is
// reloaded.
bool announceOnce(const std::string& tag)
{
    static std::set<std::string> said;
    return said.insert(tag).second;
}

} // namespace

ScanGuard::ScanGuard(std::string what, std::string noun)
:
    what_(std::move(what)),
    noun_(std::move(noun))
{}

void ScanGuard::claim(const std::string& key, const std::string& file)
{
    auto here = seen_.find(key);
    if (here != seen_.end())
    {
        throw std::runtime_error(
            what_ + ": two files in the same directory both declare the "
            + noun_ + " '" + key + "':\n    " + here->second + "\n    " + file
            + "\nThe registry is keyed by the name INSIDE the file, so the"
              " answer would be whichever the filesystem listed last -- which"
              " is not sorted and not the same on two machines.  Remove or"
              " rename one of them; a name is a record's identity, and two"
              " records may not share it.");
    }
    seen_.emplace(key, file);

    const std::string tag = what_ + "|" + key;
    auto prev = claimed().find(tag);
    if (prev != claimed().end() && prev->second != file)
    {
        if (announceOnce(tag))
        {
            std::cerr << "[override] " << noun_ << " '" << key << "' read from "
                      << file << " -- replaces " << prev->second << "\n";
        }
    }
    claimed()[tag] = file;
}

} // namespace records
} // namespace Choupo
