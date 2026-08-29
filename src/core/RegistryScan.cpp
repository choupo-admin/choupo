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

#include <filesystem>
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
            // A SEALED case-local mirror is not an override: the case runs
            // the catalogue record, sha256-verified by its own
            // constant/propertyManifest -- the words "override ... replaces"
            // told a student recipe01 deliberately runs DIFFERENT steam
            // properties than the catalogue, which is the opposite of the
            // truth.  Detect the seal by walking up from the winning file to
            // a constant/ directory carrying a propertyManifest.
            bool sealedMirror = false;
            {
                namespace fs = std::filesystem;
                fs::path p = fs::path(file).parent_path();
                for (int up = 0; up < 4 && !p.empty(); ++up)
                {
                    if (p.filename() == "constant"
                        && fs::exists(p / "propertyManifest"))
                    { sealedMirror = true; break; }
                    p = p.parent_path();
                }
            }
            if (sealedMirror)
                std::cerr << "[sealed] " << noun_ << " '" << key
                          << "' read from the case's own mirror " << file
                          << " (manifest-verified copy of " << prev->second
                          << ")\n";
            else
                std::cerr << "[override] " << noun_ << " '" << key
                          << "' read from " << file << " -- replaces "
                          << prev->second << "\n";
        }
    }
    claimed()[tag] = file;
}

} // namespace records
} // namespace Choupo
