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
#include "streams/UtilityCircuit.H"

#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
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
    //  THE SECOND SCOPE (2026-09-08).  A case may DECLARE that a pair of
    //  boundary streams is an auxiliary circuit; the TOTAL scope below is
    //  unchanged by that declaration, and a PROCESS scope is presented beside
    //  it with those streams left out.  THE SEPARATION IS PRESENTATION,
    //  NEVER VALIDATION SCOPE -- the per-unit balances further down, the
    //  element balance and the energy balance all keep counting every stream.
    //  The declaration itself is read, and every refusal it can earn is
    //  raised, by `streams/UtilityCircuit` at the flowsheet seam; here it is
    //  only a set of names to present apart.
    const auto circuits = utilityCircuits::read(ctx.flowsheetDict);
    const auto excluded = utilityCircuits::excludedStreams(circuits);

    std::vector<scalar> in(n, 0.0), out(n, 0.0);
    std::vector<scalar> inProc(n, 0.0), outProc(n, 0.0);
    //  What the declaration takes out, kg/h, counted on the SUPPLY side only:
    //  the return side carries the same matter (the engine refuses a declared
    //  pair that does not conserve component-wise), so adding both would
    //  report twice the mass that was set aside.
    scalar utilityMass = 0.0;
    for (const auto& name : topo.balanceFeeds)
    {
        auto it = ctx.result.streams.find(name);
        if (it == ctx.result.streams.end()) continue;
        const auto m = componentMassFlow(it->second, ctx.thermo);
        const bool util = excluded.count(name) > 0;
        for (std::size_t i = 0; i < n; ++i)
        {
            in[i] += m[i];
            if (util) utilityMass += m[i];
            else      inProc[i]   += m[i];
        }
    }
    for (const auto& name : topo.products)
    {
        auto it = ctx.result.streams.find(name);
        if (it == ctx.result.streams.end()) continue;
        const auto m = componentMassFlow(it->second, ctx.thermo);
        const bool util = excluded.count(name) > 0;
        for (std::size_t i = 0; i < n; ++i)
        {
            out[i] += m[i];
            if (!util) outProc[i] += m[i];
        }
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

        //  THE PROCESS SCOPE IS APPENDED, AND NOTHING ABOVE MOVES.  `TOTAL`
        //  and `closure_pct` are the same rows in the same places they have
        //  always been -- they remain the TOTAL scope, over every boundary
        //  stream -- and a case that declares no circuit writes a
        //  byte-identical file.  The rows below follow the file's own
        //  convention: a named row carries in/out/net, and a closure row
        //  carries only the fourth column.
        scalar procIn = 0.0, procOut = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            procIn  += inProc[i];
            procOut += outProc[i];
        }
        const bool noProcBoundary = (procIn == 0.0 && procOut == 0.0);
        if (!circuits.empty())
        {
            for (const auto& c : circuits)
            {
                scalar cs = 0.0, cr = 0.0;
                auto si = ctx.result.streams.find(c.supply);
                auto ri = ctx.result.streams.find(c.ret);
                if (si != ctx.result.streams.end())
                    for (const auto v : componentMassFlow(si->second, ctx.thermo)) cs += v;
                if (ri != ctx.result.streams.end())
                    for (const auto v : componentMassFlow(ri->second, ctx.thermo)) cr += v;
                f << "utility." << c.name << "," << std::fixed << std::setprecision(4)
                  << cs << "," << cr << "," << (cr - cs) << "\n";
            }
            f << "PROCESS_TOTAL," << std::fixed << std::setprecision(4)
              << procIn << "," << procOut << "," << (procOut - procIn) << "\n";
            if (noProcBoundary)
                f << "process_closure_pct,,,n/a\n";
            else
                f << "process_closure_pct,,," << std::setprecision(4)
                  << closurePct(procIn, procOut) << "\n";
        }
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

        //  THE PLANT-BOUNDARY MATERIAL SUMMARY TRAVELS ON THE RESULT, in two
        //  scopes, so the GUI DRAWS the engine's arithmetic instead of summing
        //  streams itself -- the 2026-09-05 first-law rule, applied to matter.
        {
            auto& gm = ctx.result.globalMassBoundary;
            gm.present            = true;
            gm.declared           = !circuits.empty();
            gm.n_circuits         = static_cast<int>(circuits.size());
            gm.total_in_kg_per_h  = totIn;
            gm.total_out_kg_per_h = totOut;
            gm.total_closure_pct  = closurePct(totIn, totOut);
            gm.total_closure_available = !noBoundary;
            //  With NO declaration the process scope IS the total one: the
            //  fields are equal because the two questions have one answer,
            //  never because a number was invented for a scope that does not
            //  exist.
            gm.process_in_kg_per_h  = procIn;
            gm.process_out_kg_per_h = procOut;
            gm.process_closure_pct  = closurePct(procIn, procOut);
            gm.process_closure_available = !noProcBoundary;
            gm.utility_excluded_kg_per_h = utilityMass;
            gm.utility_fraction_pct = (totIn > 0.0) ? 100.0 * utilityMass / totIn
                                                    : 0.0;
        }

        //  ANNOUNCED, never discovered.  A student must SEE that a scope was
        //  narrowed and by how much: on ammonia02 the declared cooling water
        //  is 99.2 % of the mass in the balance, which is the whole reason
        //  its 100.0000 % total closure said nothing about the process.
        if (!circuits.empty())
        {
            std::ostringstream msg;
            msg.setf(std::ios::fixed);
            msg.precision(3);
            msg << "excluded " << utilityMass << " kg/h declared as utility ("
                << ((totIn > 0.0) ? 100.0 * utilityMass / totIn : 0.0)
                << " % of the total) across " << circuits.size()
                << " declared circuit(s); ";
            if (noProcBoundary)
                msg << "the process scope has no material boundary left, so "
                       "there is no process closure to state";
            else
                msg << "process closure " << closurePct(procIn, procOut)
                    << " % computed on " << procIn << " kg/h.  The TOTAL "
                       "scope above is unchanged and still counts every "
                       "boundary stream";
            AdvisoryLog::instance().add("massBalance", "info",
                                        "declared utility circuits", msg.str());
            if (ctx.verbosity >= 2)
                std::cout << "  [utilities] " << msg.str() << "\n";
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
