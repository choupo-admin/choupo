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
    Choupo::SolutionWriter

Description
    OpenFOAM-style solution-directory writer for the steady recycle solver.

    Each retained OUTER recycle iteration is one "instant" --- a complete
    snapshot of the flowsheet stream registry written as ONE plain Choupo
    dict at `solution/<it>/streams`.  The recycle outer-iteration counter is
    the "pseudo-time": it is NOT physical time and NOT the inner Newton
    iterations of a flash or column --- it is the march toward the tear
    fixed point.  `ls solution/` is the convergence history at a glance.

    The instant file is a self-describing dict the engine's own tokenizer can
    read back verbatim (never JSON/YAML).  Stream values are SI-canonical
    (T [K], P [Pa], F via per-species `molarFlows { name kmol/s; }` so F and
    z reconstruct LOSSLESSLY without a Sigma z = 1 renormalisation).  Tear
    streams are flagged `tear true;` in-line and listed in `tearStreams`, so
    a restart reseeds exactly those.

    DURABILITY (the abort-survival contract): each instant is written to
    `solution/<it>/.tmp/streams`, flushed + closed, then the directory is
    rename()'d atomically into `solution/<it>/`.  A restart therefore never
    reads a half-written instant.  One line per instant is appended (and
    flushed) to `solution/solution.log`.  A `latest` symlink tracks the
    newest instant; `purgeWrite` keeps only the last N numbered instants
    (0/ and the converged final are always retained).

    The whole mechanism is opt-in: absent `solutionControl{}` in controlDict
    => the callback is never installed => zero behavioural change.
\*---------------------------------------------------------------------------*/

#pragma once

#include "streams/ProcessStream.H"
#include "core/Types.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class ThermoPackage;

// One instant's metadata --- the scalars that ride alongside the streams.
struct SolutionInstantMeta
{
    int         iteration  = 0;        // pseudo-time = recycle outer iteration
    std::string solver;                // "newtonOnTears" | "wegstein" | "seed"
    scalar      tearResidual = 0.0;    // |r|2 of the tear residual at this instant
    scalar      tolerance    = 0.0;    // the recycle tolerance (for the header)
    bool        converged    = false;  // true ONLY for the final converged instant
};

// Configuration parsed from controlDict's `solutionControl{}` sub-dict.
// `write == false` (the default when the block is absent) means the whole
// feature is OFF and the writer is never constructed.
struct SolutionControl
{
    bool        write         = false;       // MASTER opt-in (absent block => off)
    int         writeInterval = 5;           // write every N outer iterations
    int         purgeWrite    = 3;           // keep last N numbered instants (0 => keep all)
    std::string startFrom     = "startTime"; // startTime (fresh) | latestTime (restart)
    bool        flushEach      = true;       // flush+close each instant (abort-survival)
};

class SolutionWriter
{
public:
    // `caseDir` is the directory that will hold `solution/` (typically the
    // current working directory --- the case root).  `compNames` are the
    // flattened thermo component names, in index order, used to label the
    // per-species `molarFlows` entries.
    SolutionWriter(std::string caseDir,
                   const SolutionControl& cfg,
                   std::vector<std::string> compNames);

    // Write one instant: `solution/<meta.iteration>/streams` (atomic rename),
    // append to `solution.log`, refresh the `latest` symlink, and purge old
    // numbered instants per `purgeWrite`.  `tears` names the tear streams so
    // each is flagged `tear true;`.
    void writeInstant(const SolutionInstantMeta&                   meta,
                      const std::map<std::string, ProcessStream>&  streams,
                      const std::vector<std::string>&              tears);

    // ---- Restart (Slice 1) --------------------------------------------
    //  Read `solution/<n>/streams` for the highest numbered instant n (the
    //  `latest` target) and return ITS iteration number.  The reseeded tear
    //  streams are written back into `streams` (only the entries flagged
    //  `tear true;` in the file AND present in `tears`).  Non-tear streams
    //  are left untouched (they keep normal auto-init).  Returns -1 (and
    //  leaves `streams` untouched) if no instant is available to restart
    //  from.  Loud by design --- the caller announces the reseed.
    int restartFromLatest(std::map<std::string, ProcessStream>& streams,
                          const std::vector<std::string>&        tears,
                          const ThermoPackage&                   thermo) const;

    // True iff a numbered instant exists under `solution/` (so a caller can
    // decide whether `startFrom latestTime` has anything to resume from).
    int latestInstantNumber() const;

private:
    std::string                solutionDir_;   // <caseDir>/solution
    SolutionControl            cfg_;
    std::vector<std::string>   compNames_;
    bool                       logHeaderWritten_ = false;

    // Render one stream as a parser-valid dict sub-block (text).
    std::string renderStream(const std::string&   name,
                             const ProcessStream&  s,
                             bool                  isTear) const;

    void refreshLatestSymlink(int iteration) const;
    void purgeOldInstants(int currentIteration,
                          const std::vector<int>& alwaysKeep) const;
    void appendLog(const SolutionInstantMeta& meta) const;
};

} // namespace Choupo
