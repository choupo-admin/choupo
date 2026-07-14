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
    Choupo::Database

Description
    Locates and loads component files from a `data/components/` directory.

    Resolution order for the data root:
        1. constructor argument          (explicit override)
        2. $CHOUPO_HOME/data   (env var)
        3../data                        (case-relative)
        4.../../data                    (tutorial-relative, depth 2)
\*---------------------------------------------------------------------------*/

#pragma once

#include "Component.H"

#include <map>
#include <string>

namespace Choupo {

class Database
{
public:
    explicit Database(const std::string& explicitRoot = "");

    Component loadComponent(const std::string& name) const;

    // Resolve a token to its CANONICAL component stem.  Exact-name ALWAYS wins
    // (returns the token unchanged if components/<token>.dat exists -- O(1) path
    // concat, the index untouched); only on a miss is the generated ALIASES index
    // consulted (loaded ONCE, never a directory walk); an unknown token is
    // returned unchanged so the existing not-found error still fires downstream.
    std::string canonicalName(const std::string& token) const;

    const std::string& root() const { return root_; }

    // Globally accessible path to the active Database root.
    // Set on every Database construction; used by ActivityModel
    // implementations to locate `data/standards/binaryPairs/...` files
    // without threading the database object through their factory.
    static const std::string& currentRoot() { return current_; }

private:
    std::string root_;
    std::string resolveRoot(const std::string& explicitRoot) const;

    inline static std::string current_;

    // Alias index (alias -> canonical stem), loaded ONCE from
    // data/standards/components/ALIASES on the first canonicalName miss.
    mutable std::map<std::string, std::string> aliasIndex_;
    mutable bool aliasLoaded_ = false;
};

} // namespace Choupo
