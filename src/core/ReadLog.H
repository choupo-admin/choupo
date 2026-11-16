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

/*---------------------------------------------------------------------------*\
  ReadLog -- every record file the run PARSED, noted at the one place a record
  file becomes a dictionary (Dictionary::fromFile).  DEV.md 4c C413, slice 1.

  WHY HERE.  The consumption ledger (thermo/RecordResolver.H) records what a
  run asked the resolver seam for.  Measured 2026-11-16: component asks in an
  unsealed case and every file a directory scan returns were not noted, and
  fifteen registries scan data/standards/ directly.  A pin list built from the
  seam would therefore be a subset of what the run read -- exactly the
  under-staging the importer's closure had twice.  A record is read by parsing
  it, and parsing goes through ONE function, so noting there cannot miss a
  reader.  The consumer (thermo/PinCheck) turns the paths into
  standards-relative names and decides which are the catalogue's.

  Checks that must hash a record WITHOUT consuming it (the pin verification,
  the identity comparison of a declared variation) pause the log with
  readlog::Pause: an observation of the run must not contain the run's own
  verification.

  The state is leaked on purpose: the consumption ledger writes it from a
  static destructor, and a destroyed set read by a destructor is the hang the
  ledger's own header records.
\*---------------------------------------------------------------------------*/

#pragma once

#include <set>
#include <string>

namespace Choupo {
namespace readlog {

struct State
{
    std::set<std::string> paths;   // as opened (absolute or relative)
    int                   paused = 0;
};

inline State& state()
{
    static State* s = new State();
    return *s;
}

inline void note(const std::string& path)
{
    State& s = state();
    if (s.paused == 0) s.paths.insert(path);
}

struct Pause
{
    Pause()  { ++state().paused; }
    ~Pause() { --state().paused; }
    Pause(const Pause&) = delete;
    Pause& operator=(const Pause&) = delete;
};

} // namespace readlog
} // namespace Choupo
