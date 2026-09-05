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
    Choupo::InternalStateWriter

Description
    WHAT HAPPENS INSIDE THE EQUIPMENT, one dictionary file per unit that
    publishes a profile, under the case root:

        internalStates/<SECTOR>/<unit>/<kind>
        internalStates/<unit>/<kind>              (a flat case: no sector level)

    IT IS A PROJECTION, NOT A NEW RESULT.  Every unit that has something to
    say about its own inside already says it through `UnitOperation::profile()`
    -- a `UnitProfile` (xAxis, columns, markers) that `Flowsheet::unitProfiles`
    collects into `SimulationResult::profiles`, that `ResultEmitter` publishes
    in the result JSON and that `ProfilesReport` writes as `profile.csv`.  This
    writer adds a FOURTH surface for the SAME record and computes nothing: no
    new physics, no new JSON block, no new field on the profile.  A reader who
    opens one of these files and one of those CSVs must find the same numbers,
    and the gate holds it to the JSON.

    THE BOUNDARY, stated once so the next axis is filed where it belongs:
    internal state is a field over a coordinate of the equipment (position,
    stage, particle size) or its inventory (loadings per component); a
    construction over a parameter sweep (van Heerden, Merkel) is an analysis
    and stays in the reports.  So a profile whose xAxis is `T_K` -- the CSTR's
    van Heerden diagram, the cooling tower's Merkel lines -- is NOT written
    here: it is a picture of how the unit would behave across temperatures,
    not of what it holds at the one it converged to.  It is skipped and
    announced, never silently dropped.

    THE FILE'S NAME IS THE KIND OF FIELD, derived mechanically from the axis:

        stage                          -> stageProfile
        V, z, z_m, position            -> axialProfile
        L_micron, diameter_micron      -> sizeDistribution
        componentIndex                 -> swingTable   (PSA / TSA loadings per
                                                        component: an inventory,
                                                        ruled internal state
                                                        2026-09-05)
        anything else                  -> profile, and ANNOUNCED ("axis <x>
                                          has no declared kind"), so a new axis
                                          reaches the tree under an honest
                                          generic name instead of being lost.

    THE DIRECTORY REPEATS THE PLANT.  The sector is the one the flatten seam
    STAMPED on `FlatUnit::sector` and carried in `result.topology`; it is
    never recovered by splitting the dotted name (name identity, the crossing
    this project bans).  Empty is not a sector called "root": a flat case
    gains no level.  Same address rule as `design/`, same reason.

    IT IS A PHOTOGRAPH, NOT A SEAM.  Removed and rewritten whole on every run,
    exactly as `converged/` and `design/` are; written only when the run
    converged; a case whose units publish nothing gets no directory at all.
    Nothing reads it back; it is written in the dict grammar so that the day
    something does, the reader is cheap.

\*---------------------------------------------------------------------------*/

#ifndef Choupo_InternalStateWriter_H
#define Choupo_InternalStateWriter_H

#include "result/SimulationResult.H"

#include <cstddef>
#include <string>

namespace Choupo
{

namespace InternalStateWriter
{

//  The file name a profile takes, from its xAxis alone.  Exposed so the
//  announcement ("no declared kind") and the file name come from ONE table.
//  Returns an empty string for an axis this writer EXCLUDES (`T_K`).
std::string kindOf(const std::string& xAxis, bool& declared);

//  Write the whole `internalStates/` tree for `result`, under `caseRoot`.
//
//  A no-op when `result.profiles` is empty: a case with nothing to show
//  inside its units gets no directory, so an empty tree can never be read as
//  "every unit is hollow".  An existing tree is REMOVED first -- stale files
//  from a previous topology must never linger beside fresh ones.
//
//  Returns the number of files written.  Throws only when a file cannot be
//  opened; a profile this writer declines (`T_K`) is counted and announced,
//  never thrown on.
std::size_t write(const std::string&      caseRoot,
                  const SimulationResult& result,
                  int                     verbosity);

} // namespace InternalStateWriter
} // namespace Choupo

#endif

// ************************************************************************* //
