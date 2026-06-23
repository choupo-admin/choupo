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
    snapshot of the flowsheet stream registry.  FAITHFUL to OpenFOAM, the
    instant is a TIME DIRECTORY at the CASE ROOT (a bare iteration NUMBER:
    `0/ 1/ 2/ 3/`, next to `constant/`, `system/` and the fractal sector
    folders), NOT nested under a `solution/` wrapper --- "the time speaks for
    itself".  The recycle outer-iteration counter is the "pseudo-time": it is
    NOT physical time and NOT the inner Newton iterations of a flash or column
    --- it is the march toward the tear fixed point.  `ls <caseRoot>` shows the
    convergence history at a glance.

    "latest" is the highest-numbered instant, discovered by max integer dir
    name (OpenFOAM `latestTime` style); a `latest` convenience symlink is also
    kept at the case root, but restart works by max-number discovery even when
    the symlink is absent (symlink-hostile filesystems).

    LOADER SAFETY: numeric instant dirs at the case root are NEVER mistaken for
    fractal sectors.  The fractal loader (Flowsheet flattenNode) iterates the
    DECLARED `children (...)` from flowsheetDict --- not a filesystem scan ---
    and only loads a child as a sector when `<child>/system/flowsheetDict`
    exists.  An instant dir has neither, so the case runs correctly with
    `0/ 1/ 2/ 3/` sitting beside the sector folders.

    THE PAYLOAD `<n>/streams`: a self-describing dict the engine's own tokenizer
    reads back verbatim (never JSON/YAML).  A Choupo stream IS the flux between
    two units --- exactly OpenFOAM's surfaceScalarField `phi`: stored ONCE per
    face, shared by the two owner/neighbour cells (units).  The file holds the
    FACE-FLUXES; a shared (internal) stream is written ONCE and projected into
    both touching units' byUnit/ports.  Units are 0-D cells (no internalField).
    The file carries:
      - the header (pseudoTime/converged/tearResidual/tolerance);
      - a read-only `topology{}` echo (tearStreams + connections) so the
        instant is self-describing without re-parsing the flowsheetDict tree
        (this echo is WHY the topology authoring source need not move);
      - per-stream `bc` tag, mechanical from the feed/tear/product role:
        `bc fixedValue;` feed (Dirichlet), `bc computed;` product, `tear true;`
        internal torn, NO tag for an ordinary interior stream;
      - the lossless body: T/P/vf/H + per-species `molarFlows { name kmol/s; }`
        (so F and z reconstruct without a Sigma z = 1 renormalisation) + solids.

    PER-UNIT PROJECTION `<n>/byUnit/<dotted.unit>/` (gated by `byUnit`, default
    true): a relative symlink `streams -> ../../streams` (the SINGLE source) and
    a generated `ports` dict (inlets/outlets, each with its global dotted key +
    bc role).  A stream shared by two units appears in BOTH ports lists but is
    stored ONCE in `streams` --- the internal-face invariant, by structure.

    DURABILITY (gated by `flushEach`, UNCHANGED from Slice 0): each instant is
    written to `<caseRoot>/.tmp_<it>/` (the streams payload + byUnit/ tree),
    then the directory is rename()'d atomically into `<caseRoot>/<it>/`.  What
    "atomic" buys depends on `flushEach`:

      flushEach true  (default): the temp file's data is fsync()'d before the
        rename, and the parent (case root) directory is fsync()'d after the
        rename.  An instant published this way survives BOTH a process abort
        (kill -9) AND a power loss / kernel panic --- on recovery the directory
        entry is either absent or fully present with its data on stable storage
        (no ext4 rename-without-fsync zero-length-file trap).

      flushEach false: the fsyncs are skipped (faster).  The rename is still
        atomic w.r.t. the running kernel, so the instant survives a process
        abort (kill -9) --- a restart never reads a half-written instant.  It is
        NOT power-loss durable (a crash may lose or truncate the most recent
        instant), which is the honest trade for the speed.

    A restart therefore never reads a half-written instant in either mode.  One
    line per instant is appended to `<caseRoot>/solution.log` (fsync'd too when
    flushEach is true).  A `latest` symlink tracks the newest instant;
    `purgeWrite` keeps only the last N numbered instants (0/ and the converged
    final are always retained).

    The whole mechanism is opt-in: absent `solutionControl{}` in controlDict
    => the callback is never installed => zero behavioural change.
\*---------------------------------------------------------------------------*/

#pragma once

#include "streams/ProcessStream.H"
#include "core/SimulationResult.H"   // FlatUnit (flattened unit interface)
#include "core/Types.H"

#include <map>
#include <set>
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
    bool        byUnit        = true;        // write the per-unit byUnit/<unit>/ projection
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

    // Write one instant: `<caseRoot>/<meta.iteration>/streams` (atomic rename
    // of the whole instant dir, including the byUnit/ projection), append to
    // `<caseRoot>/solution.log`, refresh the `latest` symlink, and purge old
    // numbered instants per `purgeWrite`.  `tears` names the tear streams so
    // each is flagged `tear true;`; `units` is the flattened unit interface
    // (FlatUnit name/type/ins/outs) used to echo `topology{}`, tag each
    // stream's `bc` (feed/product/interior), and project the shared
    // face-fluxes into each unit's `byUnit/<unit>/ports`.
    void writeInstant(const SolutionInstantMeta&                   meta,
                      const std::map<std::string, ProcessStream>&  streams,
                      const std::vector<std::string>&              tears,
                      const std::vector<FlatUnit>&                 units);

    // ---- Restart (Slice 1) --------------------------------------------
    //  Read `<caseRoot>/<n>/streams` for the highest numbered instant n (max
    //  integer dir name) and reseed the tear streams flagged `tear true;` in the
    //  file AND present in `tears`.  Non-tear streams are left untouched (they
    //  keep normal auto-init).  Returns ITS iteration number, or -1 (leaving
    //  `streams` untouched) if no instant is available to restart from.
    //
    //  TRUTHFUL by design (no silent crutch): this method announces the COUNT
    //  of tears actually reseeded, and on its own warns loudly for every named
    //  tear in the file that no longer exists in the flowsheet.  If ZERO tears
    //  reseeded it emits an error-level advisory --- the restart did nothing,
    //  the caller's "resumed" line must not pretend otherwise.
    int restartFromLatest(std::map<std::string, ProcessStream>& streams,
                          const std::vector<std::string>&        tears,
                          const ThermoPackage&                   thermo) const;

    // True iff a numbered instant exists at the case root (so a caller can
    // decide whether `startFrom latestTime` has anything to resume from).
    int latestInstantNumber() const;

private:
    // A stream's boundary role, derived MECHANICALLY from the topology: a feed
    // is consumed but never produced (Dirichlet); a product is produced but
    // never consumed; a tear is an internal torn stream; everything else is an
    // ordinary interior stream (no tag).
    enum class Bc { Feed, Product, Tear, Interior };

    std::string                caseRoot_;      // the case root (instants live here)
    SolutionControl            cfg_;
    std::vector<std::string>   compNames_;
    bool                       logHeaderWritten_ = false;

    // Classify every stream into a Bc role from the flattened units' ins/outs
    // (which carry the resolved GLOBAL dotted keys = the registry keys) + the
    // tear set.  The map key is the global stream name.
    std::map<std::string, Bc> classifyStreams(
        const std::vector<FlatUnit>&     units,
        const std::set<std::string>&     tearSet,
        const std::map<std::string, ProcessStream>& streams) const;

    static const char* bcWord(Bc bc);

    // Render one stream as a parser-valid dict sub-block (text).
    std::string renderStream(const std::string&   name,
                             const ProcessStream&  s,
                             Bc                    bc) const;

    // Render the read-only topology{} echo (tearStreams + connections).
    std::string renderTopology(const std::vector<FlatUnit>&     units,
                               const std::vector<std::string>&  tears) const;

    // Write the per-unit byUnit/<unit>/ projection under `instTmpDir`: one
    // relative `streams -> ../../streams` symlink + a generated `ports` dict.
    void writeByUnit(const std::string&                  instTmpDir,
                     const std::vector<FlatUnit>&        units,
                     const std::map<std::string, Bc>&    roles) const;

    void refreshLatestSymlink(int iteration) const;
    void purgeOldInstants(int currentIteration,
                          const std::vector<int>& alwaysKeep) const;
    void appendLog(const SolutionInstantMeta& meta) const;
};

} // namespace Choupo
