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
    VIEW, ONE dictionary file per unit that publishes a profile:

        <view>/<SECTOR>/<stream>                  a stream: one file, flat
        <view>/internalStates/<SECTOR>/<unit>     a unit's interior: one file,
                                                  one BLOCK per kind of field
        <view>/internalStates/<unit>              (a flat case: no sector level)

    where `<view>` is `0/` (AUTHORED -- the state the case starts from) or
    `converged/` (ENGINE -- the state it reached).  A STATE DIRECTORY IS A
    RESTARTABLE SNAPSHOT: in OpenFOAM a time directory holds one file per
    FIELD, and that file carries the boundary conditions AND the internal
    field together.  Choupo's state view carries the streams (the boundary)
    and, under `internalStates/`, what each unit holds between them.

    WHY ONE FILE PER UNIT, AND WHY UNDER ITS OWN ROOT (2026-09-06, the
    three-way reflection recorded in
    docs/design/a-state-directory-is-a-restartable-snapshot.md, section 9).
    The first shape, one day old, was a DIRECTORY per unit with one file per
    kind.  Measured: every unit in the corpus publishes exactly ONE kind, so
    every such directory held one file.  A stream is ONE file carrying all its
    quantities; a unit's interior is ONE file carrying all its kinds as
    blocks -- kinds of field on the same object live in one file, distinct
    physical objects get their own files (`design/` keeps its directory
    because its N are distinct PIECES of equipment).  But a unit file BESIDE
    the stream files would remove the only cue that told them apart, and
    nothing forbids a unit and a stream sharing a name: two files at one path
    overwrite each other in silence -- name identity, the defect class this
    project hunts.  So the interior has its own class in the path.  IDENTITY
    IS (kind, sector, name), NEVER name alone: a stream `Flash` and a unit
    `Flash` in one sector are different objects at different paths, and the
    flowsheet ANNOUNCES the homonym rather than refusing it.  The reading, in
    one line: the view shows the boundary directly; the interior is
    namespaced inside the same view.  `internalStates/` in lower case is
    visibly not a CAPS sector, the case-of-name convention already in force.

    IT IS A PROJECTION, NOT A NEW RESULT.  Every unit that has something to
    say about its own inside already says it through `UnitOperation::profile()`
    -- a `UnitProfile` (xAxis, columns, markers) that `Flowsheet::unitProfiles`
    collects into `SimulationResult::profiles`, that `ResultEmitter` publishes
    in the result JSON and that `ProfilesReport` writes as `profile.csv`.  This
    module adds a FOURTH surface for the SAME record and computes nothing: no
    new physics, no new JSON block, no new field on the profile.  A reader who
    opens one of these files and one of those CSVs must find the same numbers,
    and the gate holds it to the JSON.

    THE SAME OBJECT TRAVELS BOTH WAYS.  `write` renders a `UnitProfile` as a
    block; `read` parses one back.  What `converged/` writes must be accepted
    by `0/` unchanged -- that round trip is what makes the snapshot
    RESTARTABLE, and a writer whose output its own reader refuses is a bug in
    both.

    THE BOUNDARY, stated once so the next axis is filed where it belongs:
    internal state is a field over a coordinate of the equipment (position,
    stage, particle size) or its inventory (loadings per component); a
    construction over a parameter sweep (van Heerden, Merkel) is an analysis
    and stays in the reports.  So a profile whose xAxis is `T_K` -- the CSTR's
    van Heerden diagram, the cooling tower's Merkel lines -- is NOT written
    here: it is a picture of how the unit would behave across temperatures,
    not of what it holds at the one it converged to.  It is skipped and
    announced, never silently dropped.

    THE BLOCK'S NAME IS THE KIND OF FIELD, derived mechanically from the axis:

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

    A unit with two kinds gets two blocks.  The result record carries ONE
    profile per unit today (`SimulationResult::profiles` is a map keyed by
    unit), so the writer's N is 1 on every case in the corpus; the grammar
    admits N and the reader parses N -- a block whose name is not a kind
    REFUSES by name.

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

//  THE ROOT, inside a state view, under which every unit interior is filed.
//  One home for the name: the writer, the reader, the stream reader that must
//  IGNORE it, and the tool that cleans a case all read this constant.
inline const char* const ROOT = "internalStates";

//  The block name a profile takes, from its xAxis alone.  Exposed so the
//  announcement ("no declared kind") and the block name come from ONE table.
//  Returns an empty string for an axis this module EXCLUDES (`T_K`).
std::string kindOf(const std::string& xAxis, bool& declared);

//  The kind vocabulary -- every block name the reader accepts.  ONE table:
//  `kindOf` produces from it and `read` checks against it.
const std::vector<std::string>& knownKinds();

//  Write every unit's interior INTO an existing state view (`viewRoot` is the
//  view's own directory, e.g. `<case>/converged`), as
//  `<viewRoot>/internalStates/<SECTOR>/<unit>` -- one file per unit.
//
//  The caller owns the view's freshness: `converged/` is removed and rebuilt
//  whole by the stream writer immediately before this runs, so nothing stale
//  can survive.  A no-op when `result.profiles` is empty.
//
//  `readsByType` says, per unit TYPE, which kinds a unit of that type READS
//  back from `0/` -- `UnitOperation::interiorKindsRead`, asked by the caller
//  because the unit classes live above this layer and the reverse edge must
//  not exist.  It is DATA the writer is handed, never a table kept here: the
//  header sentence each file carries is conditioned on it, so a unit that
//  reads nothing is told what this file IS instead of being told to copy it
//  somewhere the next run refuses.  A type absent from the map reads nothing.
//
//  Returns the number of unit files written.  Throws only when a file cannot
//  be opened; a profile this module declines (`T_K`) is counted and
//  announced, never thrown on, and a profile whose declared axis is not among
//  its own columns is REFUSED -- no file, no block, said aloud, because
//  emitting a header this module's own reader rejects is the bug in both.
std::size_t write(const std::string&      viewRoot,
                  const SimulationResult& result,
                  int                     verbosity,
                  const std::map<std::string, std::vector<std::string>>&
                                          readsByType);

//  Read the DECLARED interiors out of a state view -- `0/`, in practice --
//  keyed by the unit's qualified name and then by kind:
//
//      out["MAIN.C1"]["stageProfile"] == the UnitProfile the case declares
//
//  A unit's file is found at the address its STAMPED sector dictates, so the
//  reader and the writer agree by construction.  Refusals, each by name:
//    * a file under `<view>/internalStates/` that answers to no unit in
//      `topology` is an ORPHAN -- the same posture as an orphan stream file;
//    * a block whose name is not a kind (`knownKinds()`);
//    * an interior RECORD (a dict declaring `recordType internalState;`)
//      found ANYWHERE ELSE in the view -- the retired one-directory-per-unit
//      shape, or a misfiling -- because a declaration silently skipped is
//      the silence this module exists to end.
//  The record identifies itself; nothing here matches a file by name.
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
