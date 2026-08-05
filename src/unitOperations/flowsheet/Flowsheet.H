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
    Choupo::Flowsheet

Description
    The sequential-modular flowsheet orchestrator.  A flowsheetDict declares
    TOPOLOGY only -- units and their stream connections; the stream STATE
    lives in the case's `0/` directory, one file per stream (the stream-state
    architecture, docs/architecture/stream-state-architecture.md).  A
    `streams {}` block in any flowsheetDict is refused loudly.

    The node is FRACTAL: a LEAF carries `type` directly ("a unit op is a
    flowsheet of one"), a FLAT case carries an inline `units ( {...} {...} )`
    dict list, and a COMPOSITE lists member folders (`sectors` / `units` as
    word lists) cabled by named-edge `connections {}` -- flattenNode collapses
    the whole tree into ONE flat solver problem with `plant.sector.unit`
    names (the hierarchy is authoring/namespace only, never a recursive
    solver).

Dictionary form (topology only -- state in 0/):

        units                             // ordered list -- one block per UO
        (
            {
                name      reactor;
                type      cstr;
                in        feed;           // stream name (state in 0/feed)
                outputs   (reactorOut );  // names to bind producedStreams()
                operation { V_R 0.005; }
                reaction  {... }
            }
            {
                name      separator;
                type      isothermalFlash;
                in        reactorOut;
                outputs   (liquidProduct  vaporProduct );
                operation { T 370; P 1.0; }
            }
        );

    The Flowsheet:
      1. reads the raw `0/` tree, flattens the node, then seeds its stream
         registry via the canonical manifest (StreamOwnership) -- the
         COMPLETENESS contract (N graph streams == N state files) is
         enforced BEFORE the solve;
      2. iterates through the flattened units in order; for each unit,
         builds an *augmented* dict that grafts the input stream's state
         into synthetic `feed` / `composition` sub-dicts, then calls
         `unit->solve(...)` and binds `producedStreams()` by index to the
         `outputs (... )` names;
      3. with tear streams (declared, or collected from composite levels),
         wraps the sweep in the recycle outer loop -- Newton-on-tears on
         per-component molar flows + T (the default) or Wegstein -- and
         finishes with one fully-logged sweep at the converged point;
      4. special modes bail at the seam where the flat unit list, the
         seeded registry and the tear list all exist: `-init0` materialises
         the missing 0/ files (runInit0), `--lint` validates and stops
         (runLint) -- both without running the solver.
\*---------------------------------------------------------------------------*/

#pragma once

#include "streams/StreamOverrides.H"

#include "core/Dictionary.H"
#include "result/SimulationResult.H"
#include "streams/ProcessStream.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/UnitOperation.H"

#include <functional>
#include <map>
#include <memory>
#include <set>
#include <string>
#include <vector>

namespace Choupo {

class Flowsheet : public UnitOperation
{
public:
    Flowsheet() = default;

    const std::string& type() const override { return type_; }

    // External configuration (defaults that the user can override per-unit).
    void setSolverDict   (DictPtr d) { solverDict_    = std::move(d); }
    void setReactionsDict(DictPtr d) { reactionsDict_ = std::move(d); }
    void setDryingKineticsDict(DictPtr d) { dryingKineticsDict_ = std::move(d); }
    void setCrystallisationDict(DictPtr d) { crystallisationDict_ = std::move(d); }

    // Per-unit thermo override.  A unit may carry a `thermo {... }`
    // block selecting different models (e.g. SRK for a high-P compressor,
    // NRTL for a non-ideal-liquid column).  These give the Flowsheet what it
    // needs to rebuild a ThermoPackage = global COMPONENTS + the unit's
    // override MODELS.  Without them every unit uses the global thermo.
    void setDatabase  (const Database* db) { db_ = db; }
    void setThermoDict(DictPtr d)          { thermoDict_ = std::move(d); }
    // The case's AUTHORED v2 system (the root of the per-unit override merge
    // -- Codex-ratified 2026-07-18: a thermo{} override is a typed v2
    // FRAGMENT applied onto the node's effective authored system).
    void setAuthoredV2(DictPtr d)          { authoredV2_ = std::move(d); }

    // ---- Solution-directory hook (OpenFOAM-style per-iteration writer) ----
    //  An OPTIONAL callback, invoked once per recycle OUTER iteration with
    //  `streams_` in the correct post-sweep state, plus a seed (0/) call
    //  before the loop and a converged-final call after the last sweep.
    //  Default empty => the feature is OFF and adds one null-test per
    //  iteration, ZERO behavioural change.  The callback gets:
    //    - iteration counter (pseudo-time)
    //    - solver tag ("seed" | "wegstein" | "newtonOnTears")
    //    - tear residual at this instant
    //    - converged flag (true only for the final instant)
    //    - the full stream registry (read-only snapshot)
    //    - the tear-stream names (so the writer can flag them)
    //    - the FLATTENED unit interface (FlatUnit: name/type/ins/outs), so the
    //      writer can echo the topology{} (who-feeds-whom) and project the
    //      shared face-fluxes into each unit's byUnit/ports view.  A stream is
    //      the flux between two units --- OpenFOAM's surfaceScalarField `phi`,
    //      stored ONCE per face and projected into the owner/neighbour cells.
    //  The writer lives OUTSIDE the Flowsheet (in main.cpp), so the engine
    //  has no I/O policy baked in --- it only reports its state.
    //  `massResidual` and `energyResidual` are the PHYSICAL, feed-normalised
    //  global residuals of the tear closure at this iteration (the recycle
    //  mass / energy imbalance divided by a plant-inlet scale --- see
    //  computeTearImbalance() in Flowsheet.cpp).  They march to 0 alongside
    //  the (scaled, dimensionless) `tearResidual`, and feed the convergence
    //  residual plot.  Both are 0 for the "seed" instant (no sweep yet).
    using InstantCallback = std::function<void(
        int                                          iteration,
        const char*                                  solver,
        scalar                                       tearResidual,
        scalar                                       massResidual,
        scalar                                       energyResidual,
        bool                                         converged,
        const std::map<std::string, ProcessStream>&  streams,
        const std::vector<std::string>&              tears,
        const std::vector<FlatUnit>&                 units)>;
    void setInstantCallback(InstantCallback cb) { onInstant_ = std::move(cb); }

    // ---- Restart hook (Slice 1) -------------------------------------------
    //  An OPTIONAL callback invoked AFTER tear auto-init and BEFORE the
    //  recycle loop, with `streams_` mutable.  It reseeds the tear streams
    //  from `solution/latest/streamFaces` (reads the durable instant) and
    //  returns the iteration number to resume from, or -1 if nothing to
    //  resume.  Default empty => fresh start (today's behaviour).
    using RestartHook = std::function<int(
        std::map<std::string, ProcessStream>& streams,
        const std::vector<std::string>&        tears)>;
    void setRestartHook(RestartHook h) { onRestart_ = std::move(h); }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    // choupo-init0 (stream-state architecture, ratified build-order step 2):
    // compose the graph, read whatever 0/ states the author supplied, then --
    // instead of solving -- MATERIALISE every missing stream file by explicit
    // propagation from the authored inlets (+ any tear seeds).  `force`
    // regenerates internal/outlet files that already exist; an inlet file is
    // never touched.  solve() returns right after writing.
    void setInit0Mode(bool on, bool force)
    { init0_ = on; init0Force_ = force; }

    // choupo-lint: compose the graph, seed from 0/ (completeness enforced),
    // resolve tears -- then, instead of solving, VALIDATE what the load path
    // alone cannot see (unknown unit types, duplicate names) and report the
    // topology-inferred stream roles.  Strictly read-only: solve() returns
    // at the same seam -init0 uses, before anything is written or run.
    void setLintMode(bool on) { lint_ = on; }

    // The pass's stream manipulations (forum #55 D4): handed in EXPLICITLY,
    // one immutable copy per pass, applied once to the fresh seeded state.
    void setStreamOverrides(const StreamOverrides& ov) { streamOverrides_ = ov; }

    // Accessors used by the outer-driver / post-processor layers to
    // harvest the simulation result without re-parsing the log.
    const std::set<std::string>& boundaryAliases() const { return boundaryAliases_; }
    // alias/label -> the stream IDENTITY it copies (reports count the
    // identity ONCE, displayed under its boundary name)
    const std::map<std::string,std::string>& boundaryAliasOf() const
    { return boundaryAliasOf_; }
    const std::map<std::string, ProcessStream>& streams() const
    { return streams_; }

    // Model-boundary audit findings from the last solve() (empty unless
    // adjacent units use different thermo models).  Surfaced in the result JSON.
    const std::vector<ModelBoundaryFinding>& modelBoundaries() const
    { return modelBoundaries_; }

    // KPIs collected from every unit op during the last solve(),
    // indexed by user-given unit name.
    const std::map<std::string, std::map<std::string, scalar>>& unitKpis() const
    { return unitKpis_; }

    // Per-iteration residual history for each unit op (empty for units
    // with no iterative solver).  Used by the GUI's convergence plot.
    const std::map<std::string, std::vector<scalar>>& unitResiduals() const
    { return unitResiduals_; }

    // GLOBAL recycle-closure residuals, one entry per OUTER recycle iteration
    // (the same physical, feed-normalised mass / energy tear imbalance that
    // feeds the CLI residual plot via residuals.dat -- see computeTearImbalance
    // in Flowsheet.cpp).  Empty for a tear-free flowsheet (no recycle loop).
    // These march to ~0 alongside the dimensionless tear residual and are
    // surfaced as two named curves in SimulationResult.convergence so the GUI
    // convergence plot draws the mass / energy closure, not just per-unit
    // inner residuals.  Reused (not recomputed) from the recycle loop.
    const std::vector<scalar>& globalMassResiduals() const
    { return globalMassResiduals_; }
    const std::vector<scalar>& globalEnergyResiduals() const
    { return globalEnergyResiduals_; }

    // 1-D internal profile (axial sweep / stage table) for units that
    // expose one.  Used by the GUI's profile plot.
    const std::map<std::string, UnitProfile>& unitProfiles() const
    { return unitProfiles_; }

    // Flattened unit interface (name / type / resolved in / out stream
    // names) from the last solve(), in execution order.  Lets the per-unit
    // reports iterate the real equipment even for a composite plant (the
    // flowsheetDict at the top would only expose the boundary).
    const std::vector<FlatUnit>& topology() const { return topology_; }

    // Energy wires resolved during the last solve().  See
    // EnergyWire in SimulationResult.H.  The value reflects the FINAL
    // converged pass (after the recycle loop, where applicable).
    const std::vector<EnergyWire>& energyWires() const { return energyWires_; }

private:
    inline static const std::string type_ = "flowsheet";

    // Returns the ThermoPackage a unit should use: its `thermo {}` override
    // (built once from global components + override models, then cached) or
    // the global one when the unit has no override.
    const ThermoPackage& thermoFor(const std::string& uname,
                                   const DictPtr&       udict,
                                   const ThermoPackage& global);

    // The init0 pass itself (called from solve() at the seam where the flat
    // unit list, the seeded streams_ and the tear list all exist).
    int runInit0(const std::vector<DictPtr>&   units,
                 const ThermoPackage&          thermo,
                 int                           verbosity,
                 const std::set<std::string>&  authored,
                 const std::vector<std::string>& tears);

    // The lint pass (called from solve() at the same seam as runInit0).
    // Collects EVERY finding into one list before refusing -- a lint tool
    // reports the whole state of the case, not just the first defect.
    // `planFindings` carries the sequential-plan verdict computed in solve()
    // (shared with the normal run), merged ahead of lint's own findings.
    int runLint(const std::vector<DictPtr>&     units,
                int                             verbosity,
                const std::vector<std::string>& tears,
                const std::vector<std::string>& planFindings);

    // Sequential-plan validation (the tear/order contract, settled
    // 2026-07-25).  The solver executes the flattened list IN DECLARED
    // ORDER, and the 0/ completeness contract pre-seeds EVERY stream -- so
    // a unit consuming a stream before its producer has run silently reads
    // the 0/ seed (the old "not in registry" guard can no longer fire).
    // This validation restores that protection statically:
    //   every material input must be (a) a domain inlet, (b) an output of
    //   an EARLIER unit, or (c) a declared tear; and every declared tear
    //   must be a backward edge that closes a REAL material cycle.
    // Subsumes "graph minus tears is acyclic" AND validates the order
    // itself -- the thing the solver actually consumes.  Returns the
    // findings (empty = valid); a valid plan with tears announces its
    // cycles and cuts (glass-box).  Uses topology_, so it must run after
    // the flatten step; skipped under -init0 (which keeps its own honest
    // UNREACHED accounting).
    std::vector<std::string> validateSequentialPlan(
        const std::vector<std::string>& tears,
        int                             verbosity) const;

    bool init0_      = false;
    bool init0Force_ = false;
    bool lint_       = false;
    StreamOverrides streamOverrides_;

    std::map<std::string, ProcessStream>                   streams_;
    std::set<std::string>                                  boundaryAliases_;  // plant-boundary outlet aliases (state writer skips)
    std::map<std::string,std::string>                      boundaryAliasOf_;  // alias -> source identity
    std::vector<ModelBoundaryFinding>                      modelBoundaries_;
    std::vector<FlatUnit>                                  topology_;
    std::vector<EnergyWire>                                energyWires_;
    std::map<std::string, std::map<std::string, scalar>>   unitKpis_;
    std::map<std::string, std::vector<scalar>>             unitResiduals_;
    // GLOBAL recycle-closure residual history (one per outer iteration).
    std::vector<scalar>                                    globalMassResiduals_;
    std::vector<scalar>                                    globalEnergyResiduals_;
    std::map<std::string, UnitProfile>                     unitProfiles_;
    DictPtr solverDict_;
    DictPtr reactionsDict_;
    DictPtr dryingKineticsDict_;   // constant/dryingKinetics (drying-curve library)
    DictPtr crystallisationDict_;  // constant/crystallisation (crystal-kinetics library)

    // Per-unit thermo overrides.
    const Database*                                        db_ = nullptr;
    DictPtr                                                thermoDict_;
    DictPtr                                                authoredV2_;
    std::map<std::string, std::unique_ptr<ThermoPackage>>  unitThermo_;

    // Solution-directory hooks (default empty => feature OFF, zero change).
    InstantCallback                                        onInstant_;
    RestartHook                                            onRestart_;
};

} // namespace Choupo
