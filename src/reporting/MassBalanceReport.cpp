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

#include "core/Advisory.H"
#include "MassBalanceReport.H"
#include "BalanceMath.H"
#include "Topology.H"
#include "streams/StreamMass.H"

#include <fstream>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <vector>

namespace Choupo {

using reporting::componentMassFlow;
using reporting::closurePct;

void MassBalanceReport::run(const DictPtr& /*dict*/, const ReportContext& ctx)
{
    const auto topo = reporting::readTopology(ctx.flowsheetDict, ctx.result);
    const auto& comps = ctx.result.componentNames;
    const std::size_t n = comps.size();

    const std::filesystem::path dir = ctx.outDir("massBalance", "balances");
    std::filesystem::create_directories(dir);

    // ---- Global per-component balance (feeds in, products out) ----------
    // The boundary counts matter entering TRANSFORMING paths: a feed consumed
    // only by observer units (topo.observedFeeds) is a state being examined,
    // not matter being processed, and counting it made bubbleT01 publish
    // closure 0 % about a correct saturation case.
    std::vector<scalar> in(n, 0.0), out(n, 0.0);
    for (const auto& name : topo.balanceFeeds)
    {
        auto it = ctx.result.streams.find(name);
        if (it == ctx.result.streams.end()) continue;
        const auto m = componentMassFlow(it->second, ctx.thermo);
        for (std::size_t i = 0; i < n; ++i) in[i] += m[i];
    }
    for (const auto& name : topo.products)
    {
        auto it = ctx.result.streams.find(name);
        if (it == ctx.result.streams.end()) continue;
        const auto m = componentMassFlow(it->second, ctx.thermo);
        for (std::size_t i = 0; i < n; ++i) out[i] += m[i];
    }

    {
        const std::filesystem::path path = dir / "massBalance.csv";
        std::ofstream f(path);
        if (!f.is_open())
            throw std::runtime_error("massBalance: cannot open " + path.string());
        f << "component,in_kg_per_h,out_kg_per_h,net_kg_per_h\n";
        scalar totIn = 0.0, totOut = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            f << comps[i] << "," << std::fixed << std::setprecision(4)
              << in[i] << "," << out[i] << "," << (out[i] - in[i]) << "\n";
            totIn += in[i]; totOut += out[i];
        }
        f << "TOTAL," << std::fixed << std::setprecision(4)
          << totIn << "," << totOut << "," << (totOut - totIn) << "\n";
        // With NOTHING crossing the boundary (a closed cycle, or every feed
        // observed) there is no closure to state: a 0/0 printed as 0.0000
        // reads as the worst violation possible, about nothing.  `n/a` -- the
        // reason is in massBalance.meta and on the console.
        const bool noBoundary = (totIn == 0.0 && totOut == 0.0);
        if (noBoundary)
            f << "closure_pct,,,n/a\n";
        else
            f << "closure_pct,,," << std::setprecision(4)
              << closurePct(totIn, totOut) << "\n";
        f.close();

        // Data/metadata separation (the elementBalance.meta contract): the
        // CSV stays a regular table; WHY a closure is n/a, which units are
        // observers and which feeds they hold live in the narrow sidecar,
        // written on EVERY run so a stale copy cannot contradict the table.
        {
            std::ofstream meta(dir / "massBalance.meta");
            meta << "key,value\n"
                 << "status," << (noBoundary ? "NOT_APPLICABLE" : "FULL")
                 << "\n";
            for (const auto& u : topo.observerUnits)
                meta << "observerUnit." << u
                     << ",\"declares no material outputs (a saturation"
                        " observer): it interrogates a state and transforms"
                        " no matter\"\n";
            for (const auto& s : topo.observedFeeds)
                meta << "observedFeed." << s
                     << ",\"consumed only by observer units -- excluded from"
                        " the material boundary\"\n";
            if (noBoundary && topo.observedFeeds.empty())
                meta << "closedCycle,\"no boundary material streams; the"
                        " per-unit balances carry the verification\"\n";
        }

        if (ctx.verbosity >= 2)
        {
            std::cout << "  [report] massBalance -> " << path.string();
            if (noBoundary)
                std::cout << "   (no material boundary -- "
                          << (topo.observedFeeds.empty()
                              ? "closed cycle; the per-unit balances carry"
                                " the verification"
                              : "every feed is a state under observation,"
                                " not matter being processed")
                          << ")\n";
            else
                std::cout << "   (global closure "
                          << std::fixed << std::setprecision(3)
                          << closurePct(totIn, totOut) << " %)\n";
        }
    }

    // ---- Per-unit total mass balance ------------------------------------
    {
        const std::filesystem::path path = dir / "massBalance_byUnit.csv";
        std::ofstream f(path);
        if (!f.is_open())
            throw std::runtime_error("massBalance: cannot open " + path.string());
        f << "unit,in_kg_per_h,out_kg_per_h,diff_kg_per_h,closure_pct\n";
        const auto units = reporting::resolveUnits(topo, ctx.result);
        for (const auto& u : units)
        {
            // An observer has no mass balance to state: it consumes matter
            // in no physical sense (bubbleT's feed is the SUBJECT of a
            // question, not a plant intake), so a row "in 2643, out 0,
            // closure 0 %" plus the defect warning below would be two false
            // claims about a correct unit.  Announced, never silent.
            if (topo.observerUnits.count(u.name))
            {
                if (ctx.verbosity >= 2)
                    std::cout << "  [report]   unit '" << u.name
                              << "': no material outputs declared (observer)"
                                 " -- no mass balance to state\n";
                continue;
            }
            scalar uin = 0.0, uout = 0.0;
            for (const auto& s : u.ins)
            {
                auto it = ctx.result.streams.find(s);
                if (it != ctx.result.streams.end())
                    uin += F_massTotal(it->second, ctx.thermo) * 3600.0;
            }
            for (const auto& s : u.outs)
            {
                auto it = ctx.result.streams.find(s);
                if (it != ctx.result.streams.end())
                    uout += F_massTotal(it->second, ctx.thermo) * 3600.0;
            }
            const scalar pct = closurePct(uin, uout);
            f << u.name << "," << std::fixed << std::setprecision(4)
              << uin << "," << uout << "," << (uout - uin)
              << "," << std::setprecision(4) << pct << "\n";

            //  A BALANCE THAT DOES NOT CLOSE MUST NOT FINISH QUIETLY.
            //  This row was written and nothing else happened: flash21's
            //  freezer reported 58.8 % -- 857 kg/h of ice unaccounted -- and
            //  the run exited 0 with no warning anywhere, which is how it
            //  reached the owner instead of the engine.  Mass conservation is
            //  the curriculum; a unit that breaks it is the loudest thing a
            //  run can have to say.  0.1 % is the numerical band (recycles
            //  and stream-file rounding), not a physics judgement.
            if (uin > 0.0 && std::fabs(pct - 100.0) > 0.1)
            {
                const std::string msg =
                    "unit '" + u.name + "' does not close on MASS: in "
                    + std::to_string(uin) + " kg/h, out " + std::to_string(uout)
                    + " kg/h (" + std::to_string(pct) + " %).  Matter is not "
                    "created or destroyed by a unit operation -- this is a "
                    "defect in the unit, in its stream assembly, or in a "
                    "phase the report is not counting.";
                AdvisoryLog::instance().add("massBalance", "warning",
                                            "unit '" + u.name + "'", msg);
                std::cerr << "WARNING: massBalance: " << msg << "\n";
            }
        }
        f.close();
        if (ctx.verbosity >= 2)
        {
            const std::size_t nObs = topo.observerUnits.size();
            std::cout << "  [report] massBalance_byUnit -> " << path.string()
                      << "  (" << (units.size() - nObs) << " units";
            if (nObs > 0) std::cout << ", " << nObs << " observer";
            std::cout << ")\n";
        }
    }
}

} // namespace Choupo
