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

#include "EnergyBalanceReport.H"
#include "BalanceMath.H"
#include "Topology.H"

#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <vector>

namespace Choupo {

void EnergyBalanceReport::run(const DictPtr& dict, const ReportContext& ctx)
{
    const scalar Tref = dict->lookupScalarOrDefault("Tref", 298.15);
    const auto topo = reporting::readTopology(ctx.flowsheetDict);

    const std::filesystem::path dir = ctx.outDir("energyBalance", "balances");
    std::filesystem::create_directories(dir);
    const std::filesystem::path path = dir / "energyBalance_byUnit.csv";
    std::ofstream f(path);
    if (!f.is_open())
        throw std::runtime_error("energyBalance: cannot open " + path.string());

    // Per unit: the stream enthalpy balance (dH = implied duty), the sum of
    // the unit's DECLARED energy items (the curated heat/work KPIs --- a
    // column's reboiler+condenser, a heater's Q, a compressor's shaft work),
    // and the closure (declared items vs dH).  The `reference` column says
    // which datum dH used (elements carries the reaction heat).
    f << "unit,H_in_kW,H_out_kW,dH_kW,energy_items_kW,energy_closure_pct,reference\n";

    auto lookup = [&](const std::vector<std::string>& names) {
        std::vector<const ProcessStream*> v;
        for (const auto& s : names)
        {
            auto it = ctx.result.streams.find(s);
            v.push_back(it == ctx.result.streams.end() ? nullptr
                                                     : &it->second);
        }
        return v;
    };

    // Sum of a unit's GENUINE EXTERNAL energy items (curated, signed
    // +supplied/-removed).  EXCLUDES any duty whose heat is delivered through
    // the unit's own utility streams (the evaporator's `duty_kW`): that heat is
    // already counted as the steam/condensate enthalpy drop in `qBoundary`, so
    // summing the KPI too is the old double-count.  A bare Q_kW / reboiler /
    // condenser duty has no stream medium and IS a boundary item.
    auto externalItemsSum = [&](const std::string& unit, int& n) -> scalar {
        scalar s = 0.0; n = 0;
        auto it = ctx.result.kpis.find(unit);
        if (it != ctx.result.kpis.end())
            for (const auto& [k, v] : it->second)
                if (reporting::isEnergyItemKpi(k)
                    && !reporting::isInternalMediumDutyKpi(k)) { s += v; ++n; }
        return s;
    };

    const auto units = reporting::resolveUnits(topo, ctx.result);
    int naCount = 0, gapCount = 0;
    for (const auto& u : units)
    {
        // ONE datum (elements): a present species with no elements/formation
        // phase path THROWS naming the component (Vitor's law -- no silent
        // sensible fallback).  For a DISPLAY report we surface that single
        // unit's gap LOUDLY (a `gap:<reason>` row + the named component on
        // stderr) and carry on, so one curation gap does not nuke the whole
        // run's report.  The fix is to CURATE the component's gibbsFormation,
        // never to re-add the second datum.
        reporting::UnitEnergy e;
        try {
            e = reporting::unitEnergyBalance(lookup(u.ins), lookup(u.outs),
                                             ctx.thermo, Tref);
        } catch (const std::exception& ex) {
            std::cerr << "WARNING: energyBalance: unit '" << u.name
                      << "' has no elements-datum enthalpy -- " << ex.what()
                      << "  (curate the gibbsFormation block; the per-unit "
                         "closure is reported as a gap, not a sensible "
                         "fallback)\n";
            f << u.name << ",n/a,n/a,n/a,n/a,n/a,gap\n";
            ++gapCount;
            continue;
        }
        int nItems = 0;
        const scalar sumExternal = externalItemsSum(u.name, nItems);

        if (e.ref == reporting::EnergyRef::None)
        {
            // No stream-enthalpy datum, but the unit may still declare a duty.
            f << u.name << ",n/a,n/a,n/a,";
            if (nItems > 0) f << std::fixed << std::setprecision(4) << sumExternal;
            f << ",n/a,n/a\n";
            ++naCount;
            continue;
        }

        // A process-to-process heat exchanger transfers its declared duty
        // BETWEEN its own two process streams (hot in/out + cold in/out), so
        // the heat is INTERNAL -- the four process streams already net it, and
        // the unit's overall dH is ~0 (adiabatic envelope).  Its duty KPI is
        // therefore not a boundary item (counting it double-counts, the old
        // -3663 % on heatExchanger01).  Detected structurally: >=2 process
        // inlets AND >=2 process outlets, with no utility stream.  A heater /
        // flash (one process side + a boundary Q) is NOT this and keeps its
        // duty as a genuine boundary item.
        const bool internalExchanger =
            (e.nProcIn >= 2 && e.nProcOut >= 2
             && std::abs(e.qBoundary) <= 1.0e-9);

        // Process-stream change vs the heat that crossed the boundary.
        //   dH       = hOut - hIn over the PROCESS streams
        //   supplied = qBoundary (utility-stream drop) + the external duty KPIs
        // A unit declares heat to reconcile against EITHER as a utility medium
        // (qBoundary) OR as a bare external duty KPI (a flash/heater Q_kW),
        // UNLESS that duty is internal to a process-to-process exchanger.
        const scalar dH       = e.hOut - e.hIn;
        const scalar supplied = internalExchanger ? 0.0
                                                  : (e.qBoundary + sumExternal);
        const bool   declares = !internalExchanger
            && ((nItems > 0) || (std::abs(e.qBoundary) > 1.0e-9));

        // When the unit DECLARES boundary heat, closure reconciles the process
        // enthalpy rise against it: 100 % when dH == supplied.  When it declares
        // NONE (adiabatic mixer, fermentor, dryer running on its own air), the
        // dH IS its implied net duty by definition -> closure is trivially
        // 100 % (there is nothing external to reconcile against).
        scalar closure, items;
        if (declares)
        {
            closure = (std::abs(supplied) > 1.0e-9)
                ? 100.0 * dH / supplied
                : (std::abs(dH) < 1.0e-6 ? 100.0 : 0.0);
            items   = supplied;
        }
        else
        {
            closure = 100.0;   // net duty = dH by definition
            items   = dH;
        }

        f << u.name << "," << std::fixed << std::setprecision(4)
          << e.hIn << "," << e.hOut << "," << dH << ","
          << items << "," << std::setprecision(2) << closure << ","
          << "elements" << "\n";
    }

    // Breakdown: each unit's individual declared energy items.
    f << "\n# declared energy items (kW)\nunit,item,value\n";
    for (const auto& u : units)
    {
        auto it = ctx.result.kpis.find(u.name);
        if (it == ctx.result.kpis.end()) continue;
        for (const auto& [k, v] : it->second)
            if (reporting::isEnergyItemKpi(k))
                f << u.name << "," << k << "," << std::fixed
                  << std::setprecision(4) << v << "\n";
    }
    f.close();

    // ---- GLOBAL plant boundary (the first law over the whole flowsheet) ----
    //   Σ H_elements(feeds) + Σ Q_boundary  =  Σ H_elements(products)
    // On the ONE datum (elements, 25 C) every INTERNAL stream cancels (it is
    // one unit's outlet and another's inlet), so only the true system feeds,
    // products, and boundary duties survive.  Boundary duties = the external
    // duty KPIs whose heat is NOT already carried by a boundary stream: the
    // evaporator `duty_kW` is EXCLUDED (its chest steam is the PlantSteam feed,
    // already in Σ H(feeds)), exactly as it is excluded per-unit.  This is the
    // single number the GUI shows green and the regression's T2 asserts < 1 %.
    {
        scalar Hfeeds = 0.0, Hprods = 0.0, Qext = 0.0;
        int    nFeed = 0, nProd = 0, nGap = 0;
        auto sumStream = [&](const std::string& name, scalar& acc, int& cnt)
        {
            auto it = ctx.result.streams.find(name);
            if (it == ctx.result.streams.end()) return;
            try { acc += reporting::streamH_elements(it->second, ctx.thermo);
                  ++cnt; }
            catch (const std::exception&) { ++nGap; }
        };
        for (const auto& s : topo.feeds)    sumStream(s, Hfeeds, nFeed);
        for (const auto& s : topo.products) sumStream(s, Hprods, nProd);
        for (const auto& [unit, kv] : ctx.result.kpis)
            for (const auto& [k, v] : kv)
                if (reporting::isEnergyItemKpi(k)
                    && !reporting::isInternalMediumDutyKpi(k))
                    Qext += v;   // signed: + heat into the process

        const scalar residual = Hfeeds + Qext - Hprods;
        const scalar denom    = std::max(std::abs(Hfeeds), 1.0e-9);
        const scalar relPct   = 100.0 * residual / denom;

        const std::filesystem::path gpath = dir / "globalEnergyBoundary.csv";
        std::ofstream g(gpath);
        if (g.is_open())
        {
            g << "quantity,value_kW\n" << std::fixed << std::setprecision(6)
              << "H_feeds,"        << Hfeeds   << "\n"
              << "Q_boundary,"     << Qext     << "\n"
              << "H_products,"     << Hprods   << "\n"
              << "inputs,"         << (Hfeeds + Qext) << "\n"
              << "outputs,"        << Hprods   << "\n"
              << "residual,"       << residual << "\n"
              << "residual_pct,"   << std::setprecision(4) << relPct << "\n"
              << "n_feeds,"        << nFeed    << "\n"
              << "n_products,"     << nProd    << "\n"
              << "n_gap,"          << nGap     << "\n";
            g.close();
            if (ctx.verbosity >= 2)
                std::cout << "  [report] globalEnergyBoundary -> " << gpath.string()
                          << "  (|in-out|/in = " << std::setprecision(3)
                          << std::abs(relPct) << " %)\n";
        }
    }

    if (ctx.verbosity >= 2)
    {
        std::cout << "  [report] energyBalance_byUnit -> " << path.string()
                  << "  (" << units.size() << " units";
        if (naCount > 0)  std::cout << ", " << naCount << " n/a";
        if (gapCount > 0) std::cout << ", " << gapCount << " curation-gap";
        std::cout << ")\n";
    }
}

} // namespace Choupo
