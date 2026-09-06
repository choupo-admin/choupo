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
    Choupo::InternalStateIO

Description
    WHAT HAPPENS INSIDE THE EQUIPMENT -- read and written as part of a STATE
    VIEW, one dictionary file per unit that publishes a profile:

        <view>/<SECTOR>/<unit>/<kind>
        <view>/<unit>/<kind>                     (a flat case: no sector level)

    where `<view>` is `0/` (AUTHORED -- the state the case starts from) or
    `converged/` (ENGINE -- the state it reached).  A STATE DIRECTORY IS A
    RESTARTABLE SNAPSHOT: in OpenFOAM a time directory holds one file per
    FIELD, and that file carries the boundary conditions AND the internal
    field together.  Choupo's state directories carried only the streams --
    the boundary half -- and what each unit holds inside it lived in a
    separate top-level `internalStates/` view (2026-09-05).  That view is
    RETIRED: a stage profile is STATE, so it belongs beside the streams whose
    state it completes, in the same directory, at the same instant.  In a
    state view a FILE is a stream and a DIRECTORY is a unit's interior.

    IT IS A PROJECTION, NOT A NEW RESULT.  Every unit that has something to
    say about its own inside already says it through `UnitOperation::profile()`
    -- a `UnitProfile` (xAxis, columns, markers) that `Flowsheet::unitProfiles`
    collects into `SimulationResult::profiles`, that `ResultEmitter` publishes
    in the result JSON and that `ProfilesReport` writes as `profile.csv`.  This
    module adds a FOURTH surface for the SAME record and computes nothing: no
    new physics, no new JSON block, no new field on the profile.  A reader who
    opens one of these files and one of those CSVs must find the same numbers,
    and the gate holds it to the JSON.

    THE SAME OBJECT TRAVELS BOTH WAYS.  `write` renders a `UnitProfile`; `read`
    parses one back.  What `converged/` writes must be accepted by `0/`
    unchanged -- that round trip is what makes the snapshot RESTARTABLE, and a
    writer whose output its own reader refuses is a bug in both.

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

    THE ENGINE'S HALF IS A PHOTOGRAPH.  `converged/` is removed and rewritten
    whole on every run by its own writer, and the interiors are written into
    it right after the streams, so a stale interior can never linger beside a
    fresh stream.  `0/` IS NEVER WRITTEN HERE: it is the author's, and a
    declared interior is a SEED the case owns.

\*---------------------------------------------------------------------------*/

#ifndef Choupo_InternalStateIO_H
#define Choupo_InternalStateIO_H

#include "core/FlatUnit.H"
#include "result/SimulationResult.H"
#include "result/UnitProfile.H"

#include <cstddef>
#include <map>
#include <string>
#include <vector>

namespace Choupo
{

namespace InternalStateIO
{

//  The file name a profile takes, from its xAxis alone.  Exposed so the
//  announcement ("no declared kind") and the file name come from ONE table.
//  Returns an empty string for an axis this module EXCLUDES (`T_K`).
std::string kindOf(const std::string& xAxis, bool& declared);

//  Write every unit's interior INTO an existing state view (`viewRoot` is the
//  view's own directory, e.g. `<case>/converged`), as
//  `<viewRoot>/<SECTOR>/<unit>/<kind>`.
//
//  The caller owns the view's freshness: `converged/` is removed and rebuilt
//  whole by the stream writer immediately before this runs, so nothing stale
//  can survive.  A no-op when `result.profiles` is empty.
//
//  Returns the number of files written.  Throws only when a file cannot be
//  opened; a profile this module declines (`T_K`) is counted and announced,
//  never thrown on.
std::size_t write(const std::string&      viewRoot,
                  const SimulationResult& result,
                  int                     verbosity);

//  Read the DECLARED interiors out of a state view -- `0/`, in practice --
//  keyed by the unit's qualified name and then by kind:
//
//      out["MAIN.C1"]["stageProfile"] == the UnitProfile the case declares
//
//  A unit's directory is found at the address its STAMPED sector dictates, so
//  the reader and the writer agree by construction.  A directory anywhere
//  under the view that holds an interior RECORD (a dict declaring
//  `recordType internalState;`) and answers to no unit in `topology` is an
//  ORPHAN and REFUSES by name -- the same posture as an orphan stream file.
//  The record identifies itself; nothing here matches a directory by name.
//
//  What this does NOT judge: whether any unit READS the kind it found.  That
//  needs the unit classes, which live above this layer, so the caller (the
//  flowsheet) asks each unit and refuses a declared field nobody reads.
std::map<std::string, std::map<std::string, UnitProfile>>
read(const std::string&           viewRoot,
     const std::vector<FlatUnit>& topology,
     int                          verbosity);

} // namespace InternalStateIO
} // namespace Choupo

#endif

// ************************************************************************* //
