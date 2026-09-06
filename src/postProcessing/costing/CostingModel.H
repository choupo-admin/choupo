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
    Choupo::CostingModel

Description
    Abstract base for a capital-cost estimation method (Guthrie/Turton,
    Lang factors,...).  Reads a EquipmentSizing record + a
    Material record and produces a CostBreakdown.

    All built-in models use CEPCI to update the base-year cost to the
    user-specified target year.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "result/SimulationResult.H"
#include "materials/Material.H"

#include <functional>
#include <map>
#include <memory>
#include <string>

namespace Choupo {

class CostingModel
{
public:
    virtual ~CostingModel() = default;
    virtual const std::string& type() const = 0;

    // The configuration dict (e.g. costingDict subset) is given at
    // construction; per-equipment data comes through `cost()`.
    virtual CostBreakdown cost(const EquipmentSizing& dim,
                                const Material&   mat) const = 0;

    //  THE CONSTANTS THIS MODEL WILL ACTUALLY PRICE WITH (2026-09-06).
    //
    //  `CostingPass` printed its header line -- `Year: ... CEPCI: ...` -- by
    //  RE-READING the costing dict with its OWN defaults (2026 / 820) while
    //  the model resolved the same two keys with ITS own (also 2026 / 820)
    //  and did the pricing.  The literals agreed, so the banner was
    //  ACCIDENTALLY true: change one of the four and the console states one
    //  price index while every cost under it uses another, silently, at exit
    //  0.  And that banner is exactly what `check_cost_provenance` teaches a
    //  student to defend the total with.
    //
    //  So the header DRAWS what the model publishes, on the 2026-09-05
    //  first-law rule: `globalEnergyBoundary` travels on the result and the
    //  GUI draws it; absent, the GUI says the report did not run and computes
    //  NOTHING in its place, because a fallback computation is the second
    //  home under another name.  Same posture here -- a model that publishes
    //  no price index gets a header that says so, not a header with a number
    //  the pass invented.
    //
    //  The keys are the same words `CostBreakdown::factors` already carries
    //  (`year`, `cepci`, `cepci2001`, `usdToEur`), and both come off the same
    //  members, so the banner and the per-unit provenance line cannot
    //  disagree.  The base returns an empty map: a model that says nothing
    //  claims nothing.
    virtual std::map<std::string, scalar> pricingFactors() const { return {}; }

    using Factory = std::function<std::unique_ptr<CostingModel>(const DictPtr&)>;
    static void                          registerType(const std::string& name, Factory f);
    static std::unique_ptr<CostingModel> New(const DictPtr& costingDict);
    static void                          registerBuiltins();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
