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
Namespace
    Choupo::StreamStateIO
Description
    Per-stream state files, OpenFOAM-style -- the persistent state model
    ratified 2026-07-06 (docs/architecture/stream-state-architecture.md sec.3).
    A stream's STATE lives in its OWN file under a state directory (`0/`,
    `converged/`, ...), one file per stream.  Two ORTHOGONAL axes, each a small
    registry of accepted keyword combinations (no StreamSpec class hierarchy):

      MATERIAL  -- exactly ONE of: componentMolarFlows / componentMassFlows /
                   molarFlow+moleFractions / massFlow+massFractions  (a second
                   form is FATAL; `componentFlows` is a legacy fluid-only alias).
      CLOSURE   -- exactly ONE pair: T+P (implemented), or PH/PS/TQ/PQ (recognised,
                   flash-resolution deferred), or a resolved T+P+phases{} snapshot.
                   THREE top-level state vars over-specify -> FATAL: a MIXTURE
                   declaring T, P AND `vaporFraction` is refused by name (a stream
                   of known component flows has TWO intensive degrees of freedom,
                   Duhem; for a mixture (T, P) fix the split).  The ONE exception is
                   a PURE component in two phases, whose (T, P) sit on its saturation
                   curve and do not fix the split: `vaporFraction q` stays its pin.
                   `phase gas|liquid;` is the single-phase pin for either.  ONE state
                   var alone is not refused today (said plainly: the under-specified
                   half of the old promise is not implemented; T and P default to 0).

    componentMolarFlows is the OVERALL material; a phases{} block decomposes it and
    sums back exactly.  A legacy derived{ vaporFraction } of an old snapshot is still
    read (diagnostics, never a constraint); the writer no longer emits one.  Every
    DIMENSIONAL value carries its unit; the writer drops numerically-negligible
    species, and writes `vaporFraction` only for a pure two-phase stream.

    The flattened solver name `SECTOR.sub.stream` maps to the path
    `<dir>/SECTOR/sub/stream` (dots -> directory separators): the sector owns its
    streams (the plant/sector tree).  The writer emits ONE deterministic resolved form;
    the reader accepts every authored form and normalises to internal molar flows.
\*---------------------------------------------------------------------------*/

#pragma once

#include "streams/ProcessStream.H"
#include <filesystem>
#include <map>
#include <set>
#include <string>

namespace Choupo
{

class ThermoPackage;

namespace StreamStateIO
{
    /** Write ONE stream's state to `file` in the canonical componentFlows
     *  grammar (per-component molar flow F*z_i, solids, T, P, phase). */
    void writeStreamState(const ProcessStream&  stream,
                          const ThermoPackage&  thermo,
                          const std::filesystem::path& file);

    /** Materialise a whole state directory (`converged/`, `0/`, ...) from the
     *  solver's final stream registry: each stream `SECTOR.sub.name` becomes
     *  `<dir>/SECTOR/sub/name`.  Creates parent directories as needed. */
    void writeStateDir(const std::map<std::string, ProcessStream>& streams,
                       const ThermoPackage&  thermo,
                       const std::filesystem::path& dir,
                       const std::map<std::string, std::filesystem::path>& ownedPath);

    /** Read ONE stream-state file (canonical componentFlows grammar) back into
     *  a ProcessStream.  The total flow F and mole fractions z are the derived
     *  view (F = Σ componentFlows; z_i = flow_i / F). */
    ProcessStream readStreamState(const std::filesystem::path& file,
                                  const std::string&    name,
                                  const ThermoPackage&  thermo);

    /** True iff a file body looks like a Choupo stream-state file: it carries at
     *  least one canonical material-flow keyword (componentMolarFlows /
     *  componentFlows / molarFlow / componentMassFlows / massFlow).  The
     *  distinguisher from a per-iteration SolutionWriter snapshot that shares the
     *  `0/` name but not the grammar. */
    bool looksLikeStreamState(const std::string& body);

    /** Read a whole state directory back into a stream registry: every file
     *  `<dir>/SECTOR/sub/name` (except manifest.dat) becomes the stream
     *  `SECTOR.sub.name`.  The inverse of writeStateDir. */
    std::map<std::string, ProcessStream>
    readStateDir(const std::filesystem::path& dir, const ThermoPackage& thermo);
}

}
