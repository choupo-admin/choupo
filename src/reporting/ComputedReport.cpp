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

#include "ComputedReport.H"
#include "core/ExprEval.H"
#include "core/Units.H"

#include <filesystem>
#include <fstream>
#include <functional>
#include <iomanip>
#include <iostream>
#include <variant>
#include <vector>

namespace Choupo {

void ComputedReport::run(const DictPtr& /*dict*/, const ReportContext& ctx)
{
    SimulationResult& result = ctx.result;

    // The variables block lives at the root of the flowsheetDict.
    if (!ctx.flowsheetDict || !ctx.flowsheetDict->found("variables")
        || !std::holds_alternative<DictPtr>(ctx.flowsheetDict->entryValue("variables")))
        return;                                  // nothing to compute
    DictPtr vars = ctx.flowsheetDict->subDict("variables");

    // Resolver: <unit>.<kpi> -> KPI; <stream>.<field> -> T|P|F|vf;
    // bare name -> an earlier computed var, or a plain $variable.
    std::function<scalar(const std::string&)> resolve =
        [&](const std::string& id) -> scalar
    {
        auto cit = result.computed.find(id);
        if (cit != result.computed.end()) return cit->second;

        const auto dot = id.find('.');
        if (dot != std::string::npos)
        {
            const std::string head = id.substr(0, dot);
            const std::string tail = id.substr(dot + 1);

            auto kit = result.kpis.find(head);
            if (kit != result.kpis.end())
            {
                auto vit = kit->second.find(tail);
                if (vit != kit->second.end()) return vit->second;
            }
            auto sit = result.streams.find(head);
            if (sit != result.streams.end())
            {
                const ProcessStream& s = sit->second;
                if (tail == "T")  return s.T;
                if (tail == "P")  return s.P;
                if (tail == "F")  return s.F;
                if (tail == "vf") return s.vf;
                throw std::runtime_error("computed: stream '" + head
                    + "' has no field '" + tail + "' (use T | P | F | vf)");
            }
            throw std::runtime_error("computed: cannot resolve '" + id
                + "' --- no KPI '" + tail + "' on unit '" + head
                + "' and no stream named '" + head + "'");
        }

        if (vars->found(id))                     // a plain $variable
        {
            try { return vars->lookupScalar(id); } catch (...) {}
        }
        throw std::runtime_error("computed: cannot resolve identifier '"
            + id + "'");
    };

    struct Row { std::string name, expr, unit; scalar si, disp; };
    std::vector<Row> rows;

    for (const auto& key : vars->keys())
    {
        const auto& ev = vars->entryValue(key);
        if (!std::holds_alternative<DictPtr>(ev)) continue;   // plain scalar
        DictPtr sub = std::get<DictPtr>(ev);
        if (!sub->found("compute")) continue;                 // not computed

        const std::string expr = sub->lookupWord("compute");
        const scalar si = evalExpr(expr, resolve);
        result.computed[key] = si;                            // store SI

        const std::string unit = sub->lookupWordOrDefault("unit", "");
        scalar disp = si;
        if (!unit.empty())
        {
            auto us = units::lookupUnit(unit);
            if (us && !us->affine && us->factor != 0.0) disp = si / us->factor;
        }
        rows.push_back({key, expr, unit, si, disp});
    }

    const std::filesystem::path dir = ctx.outDir("computed", "computed");
    std::filesystem::create_directories(dir);
    const std::filesystem::path path = dir / "values.csv";
    std::ofstream f(path);
    if (!f.is_open())
        throw std::runtime_error("computed: cannot open " + path.string());

    f << "name,value_SI,value_display,unit,expression\n";
    for (const auto& r : rows)
    {
        f << r.name << ','
          << std::setprecision(8) << r.si << ','
          << std::setprecision(8) << r.disp << ','
          << r.unit << ",\"" << r.expr << "\"\n";
    }
    f.close();

    if (ctx.verbosity >= 2)
    {
        std::cout << "  [report] computed -> " << path.string()
                  << "  (" << rows.size() << " variable"
                  << (rows.size() == 1 ? "" : "s") << ")\n";
        for (const auto& r : rows)
            std::cout << "      " << r.name << " = " << r.disp
                      << (r.unit.empty() ? "" : " " + r.unit) << "\n";
    }
}

} // namespace Choupo
