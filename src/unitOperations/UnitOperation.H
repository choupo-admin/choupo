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
    Choupo::UnitOperation

Description
    Abstract base for every unit operation, with an explicit run-time
    selection ("factory") consistent with VaporPressureModel,
    ActivityModel, EquationOfState and HeatCapacityModel.

    Selection by dictionary:

        UnitOperation::New(unitDict)
            reads `type` from the dictionary (e.g. "cstr", "isothermalFlash",
            "distillationColumn") and returns a default-constructed
            std::unique_ptr<UnitOperation>.

    Built-in types are registered explicitly in registerBuiltins(), which
    the main application must call once at start-up.  Adding a new unit
    operation requires:
        1.  Implement it under  src/unitOperations/<category>/MyOp.{H,cpp}.
        2.  #include it inside UnitOperation.cpp and add a one-line entry
            to UnitOperation::registerBuiltins().
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"
#include "streams/ProcessStream.H"
#include "unitOperations/UnitProfile.H"

#include <functional>
#include <map>
#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace Choupo {

// The unit-op interface passes the thermodynamics BY REFERENCE only -- a
// forward declaration keeps ThermoPackage.H (and everything it drags) out
// of the 95-unit include fan-out; each .cpp that actually CALLS package
// methods includes thermo/ThermoPackage.H itself (build hygiene 3/6).
class ThermoPackage;

class UnitOperation
{
public:
    virtual ~UnitOperation() = default;

    virtual const std::string& type() const = 0;

    // Carry out the calculation; print its own report.  Returns 0 on success.
    virtual int solve(const DictPtr& dict,
                      const ThermoPackage& thermo,
                      int verbosity) = 0;

    // Streams produced by the last successful call to solve().  Order is
    // part of each unit-op's contract; the Flowsheet binds them to names
    // via its `outputs (... )` declaration.
    virtual std::vector<ProcessStream> producedStreams() const { return {}; }

    // Key Performance Indicators emitted by this unit at its last solve().
    // Each unit op exposes scalar values useful for outer-driver layers
    // (sensitivity / optimisation / parameter estimation) and for
    // post-processing (sizing, costing).  Default: empty.
    //
    // Typical conventions:
    //    CSTR           :  V_R, T, X_limiting, tau, k, F_out
    //    PFR            :  V_R, T, X, tau
    //    IsothermalFlash:  T, P, V_over_F
    //    AdiabaticFlash :  T_out, V_over_F, Q_required
    //    Heater         :  Q, Q_kW, T_in, T_out, dT
    //    DistillationCol:  nStages, R, D, B, T_top, T_bottom
    //    Mixer / Splitter :  F_total, T_out
    virtual std::map<std::string, scalar> kpis() const { return {}; }

    // ---- Convergence history ---------------------------------------------
    // Per-iteration residual (or |dx|, whichever the unit's inner loop
    // monitors).  Pushed by the unit op from its solve() loop; consumed
    // by Flowsheet to populate SimulationResult.convergence so the GUI
    // can draw a semilog convergence plot.  Empty for algebraic units.
    void recordResidual(scalar r) { residuals_.push_back(r); }
    const std::vector<scalar>& residuals() const { return residuals_; }
    void clearResiduals() { residuals_.clear(); }

    // 1-D profile of the unit's internal state (axial sweep for PFR,
    // stage table for a column,...).  Default: no profile.  Empty
    // optional means "do not show a profile plot for this unit".
    virtual std::optional<UnitProfile> profile() const { return std::nullopt; }

    // Demand-driven INPUT flows the unit op computed during solve().
    // Used to push a utility stream's actual consumption back into the
    // Flowsheet's stream registry, so the Streams panel reflects what
    // was really used (e.g. effect1's heating-steam demand) and not
    // a placeholder zero.  The key is the input-stream index (matching
    // the unit's `inputs (... )` list); the value is F in canonical
    // SI (kmol/s).  Default: empty (no writeback).
    virtual std::map<std::size_t, scalar> consumedInputs() const { return {}; }

    // Input indices that a unit declares as utility-typed (0-based, matching
    // the order of `boundary.inlets` in the case's flowsheetDict).  A port
    // listed here is contract to accept ONLY a stream marked as a utility
    // (`category` non-empty, typically populated by `utility <name>;`).  The
    // Flowsheet emits a non-fatal warning at wiring time if a non-utility
    // stream is cabled to such a port, or a utility stream is cabled to a
    // process port — guards a typical student mistake (steam header on a
    // feed inlet, raw-juice on a steam chest).
    //
    // Defaults to empty (all inputs are process-side) — opt in per unit op
    // that has a clearly hardware-distinct utility line.  Typical overrides:
    //     Evaporator     → { 1 }      // input 1 is the heating-side stream
    //     DynamicCSTR    → { 1 }      // input 1 is the jacket stream
    virtual std::vector<std::size_t> utilityPorts() const { return {}; }

    // ---- Run-time selection (explicit registry) ----------------------------
    using Factory = std::function<std::unique_ptr<UnitOperation>()>;

    static void registerType(const std::string& name, Factory f);

    // Construct a unit op given a unit-block dictionary that contains a
    // `type <word>;` entry.
    static std::unique_ptr<UnitOperation> New(const DictPtr& unitDict);

    // Construct directly from a type name.
    static std::unique_ptr<UnitOperation> New(const std::string& type);

    // Register all built-in unit-operation types.  Call once at start-up.
    static void registerBuiltins();

    // Diagnostics: list registered type names.
    static std::vector<std::string> availableTypes();

private:
    std::vector<scalar>                    residuals_;
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
