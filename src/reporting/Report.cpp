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
\*---------------------------------------------------------------------------*/

#include "Report.H"
#include "ComputedReport.H"
#include "DesignReport.H"
#include "EconomicsReport.H"
#include "EnergyBalanceReport.H"
#include "EnergyStreamsReport.H"
#include "ElementBalanceReport.H"
#include "MassBalanceReport.H"
#include "ProfilesReport.H"
#include "SpreadsheetReport.H"
#include "StreamTableReport.H"
#include "UtilitiesReport.H"
#include "UtilityAllocationReport.H"

#include <stdexcept>

namespace Choupo {

std::map<std::string, Report::Factory>& Report::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void Report::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<Report> Report::New(const std::string& name)
{
    auto it = registry().find(name);
    if (it == registry().end())
    {
        std::string msg = "Report: unknown type '" + name
                        + "'.  Available:";
        for (const auto& kv : registry()) msg += "  " + kv.first;
        throw std::runtime_error(msg);
    }
    return it->second();
}

void Report::registerBuiltins()
{
    registerType("streamTable",   []{ return std::make_unique<StreamTableReport>();   });
    registerType("massBalance",   []{ return std::make_unique<MassBalanceReport>();   });
    registerType("elementBalance",[]{ return std::make_unique<ElementBalanceReport>();});
    registerType("energyBalance", []{ return std::make_unique<EnergyBalanceReport>(); });
    registerType("utilities",     []{ return std::make_unique<UtilitiesReport>();     });
    registerType("utilityAllocation", []{ return std::make_unique<UtilityAllocationReport>(); });
    registerType("energyStreams", []{ return std::make_unique<EnergyStreamsReport>(); });
    registerType("computed",      []{ return std::make_unique<ComputedReport>();      });
    registerType("profiles",      []{ return std::make_unique<ProfilesReport>();      });
    registerType("design",        []{ return std::make_unique<DesignReport>();        });
    registerType("economics",     []{ return std::make_unique<EconomicsReport>();     });
    registerType("spreadsheet",   []{ return std::make_unique<SpreadsheetReport>();   });
}

std::vector<std::pair<std::unique_ptr<Report>, DictPtr>>
Report::buildChain(const DictPtr& reportsDict)
{
    std::vector<std::pair<std::unique_ptr<Report>, DictPtr>> chain;
    for (const auto& key : reportsDict->keys())
    {
        DictPtr opts;
        try {
            opts = reportsDict->subDict(key);
        } catch (const std::exception&) {
            throw std::runtime_error(
                "reports: entry '" + key + "' must be a sub-dictionary "
                "(e.g. `" + key + " { }`)");
        }
        // The concrete type defaults to the block key; an explicit
        // `type <name>;` inside overrides (lets two instances share a type).
        const std::string typeName = opts->lookupWordOrDefault("type", key);
        chain.emplace_back(Report::New(typeName), opts);
    }
    return chain;
}

} // namespace Choupo
