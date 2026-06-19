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
    Choupo::PostProcessor

Description
    Abstract base for any *post-processing* pass that runs after a single
    simulator pass.  Consumes the SimulationResult and either:
      * augments it in place (e.g. equipment sizing populates Equipment
        dimensions inside the result), or
      * emits a side-effect file/report (CSV, JSON, plot).

    Examples:
      * EquipmentSize       — applies design rules per unit op and
                               produces dimensions (D, H, A,...)
      * CostingModel        — converts dimensions + materials → cost
      * CSVReporter         — writes the stream table to CSV
      * JSONReporter        — full result as JSON (for web viz / web UI)

    Pure post-processing: NEVER re-runs the simulator, NEVER modifies the
    flowsheetDict.  If the user wants iterations over a design variable
    that depend on costing → that's the OuterDriver layer's job (which
    can chain the simulator pass + a PostProcessor pass internally).

    Concrete post-processors register themselves via
    `PostProcessor::registerType()` and `registerBuiltins()`.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/SimulationResult.H"

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {

class PostProcessor
{
public:
    virtual ~PostProcessor() = default;

    virtual const std::string& type() const = 0;

    // Apply the post-processor to a result.  May read other dicts
    // (materials registry, costing parameters, etc.) — these are
    // resolved at construction time from the postDict.
    virtual int run(SimulationResult& result) = 0;

    // ---- Factory (explicit registry) ---------------------------------------
    using Factory = std::function<std::unique_ptr<PostProcessor>(const DictPtr&)>;

    static void                              registerType(const std::string& name, Factory f);
    static std::unique_ptr<PostProcessor>    New(const std::string& type,
                                                  const DictPtr&     params);
    static void                              registerBuiltins();
    static std::vector<std::string>          availableTypes();

    // Build the chain of post-processors declared in a `system/postDict`.
    // The postDict has one sub-dict per pass type (e.g. "sizing",
    // "costing", "report"); each is instantiated and returned in order.
    static std::vector<std::unique_ptr<PostProcessor>>
        buildChain(const DictPtr& postDict);

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
