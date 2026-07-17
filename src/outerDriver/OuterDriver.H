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
    Choupo::OuterDriver

Description
    Abstract base for any *outer* algorithm that runs the simulator
    repeatedly with varied inputs.  Examples:

      * SweepDriver           — sensitivity sweep over one or two design
                                 variables on a regular grid
      * ParameterEstimation   — fit dict-stored parameters to experimental
                                 data (least-squares / Levenberg-Marquardt)
      * OptimizationDriver    — minimise an objective over design vars
                                 (Nelder-Mead, BFGS, SQP wrappers)
      * MonteCarloDriver      — propagate uncertainty by random sampling

    All of them share the same skeleton:

        1. read `system/outerDict`         — algorithm-specific config
        2. for each design point selected by the algorithm:
             a. clone the flowsheetDict;
             b. write target paths via `setScalarAtPath`;
             c. run the simulator → SimulationResult;
             d. extract scalar responses (KPIs or stream properties);
             e. let the algorithm update its state with (point, responses).
        3. report results (csv, plot, summary).

    Concrete drivers register themselves via `OuterDriver::registerType()`
    and `OuterDriver::registerBuiltins()` (explicit factory, consistent
    with all other base classes in Choupo).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/SimulationResult.H"
#include "streams/StreamOverrides.H"

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {

class OuterDriver
{
public:
    // Callable handed in by the main application:
    //   given a modified flowsheetDict, run the full simulator pass and
    //   return the (streams + KPIs) result.  The driver does NOT itself
    //   know about ThermoPackage / Flowsheet — it stays algorithm-pure.
    // The pass's inputs, BOTH explicit (forum #55 D4): the dict and the
    // driver's declared hand on stream state.  A pass without manipulations
    // passes an empty StreamOverrides{} -- never a global, never a default.
    using Simulator =
        std::function<SimulationResult(const DictPtr&        flowsheetDict,
                                       const StreamOverrides& overrides)>;

    virtual ~OuterDriver() = default;

    virtual const std::string& type() const = 0;

    void setSimulator(Simulator f) { simulator_ = std::move(f); }
    void setFlowsheetDict(DictPtr d) { flowsheetDict_ = std::move(d); }

    // Reference to the case's thermo dict, kept for driver-side inspection.
    // NO concrete driver mutates it today: Sweep/GridSweep/DesignSpec/
    // Optimization clone and mutate the flowsheetDict only, and the
    // simulator rebuilds the thermo package from its own dict on every
    // evaluation (pure-function semantics).  A future fitting driver that
    // varies property parameters must deepCopy the manifest per pass --
    // never mutate this shared pointer in place.
    void setThermoDict(DictPtr d) { thermoDict_ = std::move(d); }

    // OptimizationDriver-style drivers may want to run the post-processing
    // chain (sizing + costing) after each simulator pass to use the
    // computed cost as the objective.  The base just stores the dict;
    // concrete drivers decide whether to build a chain from it.
    void setPostDict(DictPtr d) { postDict_ = std::move(d); }

    // The main entry point: execute the algorithm.  Reads config from the
    // outerDict it was constructed with.
    virtual int run() = 0;

    // Representative final pass --- e.g. the replay at the optimum for
    // OptimizationDriver / DesignSpec.  Lets the main application run the
    // controlDict `reports {}` chain for outer-driver cases too.  Drivers
    // without a single representative pass (sweep, fit) leave this unset.
    bool                    hasFinalResult() const { return hasFinalResult_; }
    const SimulationResult& finalResult()    const { return finalResult_; }

    // ---- Factory (explicit registry) ---------------------------------------
    using Factory = std::function<std::unique_ptr<OuterDriver>(const DictPtr&)>;

    static void                          registerType(const std::string& name, Factory f);
    static std::unique_ptr<OuterDriver>  New(const DictPtr& outerDict);
    static void                          registerBuiltins();
    static std::vector<std::string>      availableTypes();

protected:
    // Concrete drivers call this after their final/representative pass.
    void setFinalResult(const SimulationResult& r)
    { finalResult_ = r; hasFinalResult_ = true; }

    Simulator   simulator_;
    DictPtr     flowsheetDict_;     // template — cloned per design point
    DictPtr     thermoDict_;        // optional, mutated by parameter-estimation drivers
    DictPtr     postDict_;          // optional, used by optimisation over cost
    SimulationResult finalResult_;
    bool             hasFinalResult_ = false;

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
