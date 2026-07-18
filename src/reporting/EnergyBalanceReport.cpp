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

#include <algorithm>
#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <set>
#include <sstream>
#include <string>
#include <vector>

namespace Choupo {

void EnergyBalanceReport::run(const DictPtr& dict, const ReportContext& ctx)
{
    const scalar Tref = dict->lookupScalarOrDefault("Tref", 298.15);
    const auto topo = reporting::readTopology(ctx.flowsheetDict, ctx.result);

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
    // Σ of each unit's genuine STREAM-boundary energy (heat/work crossing the
    // boundary INTO that unit's process streams), accumulated with EXACTLY the
    // same exclusions the per-unit closure uses: internal process-to-process
    // exchangers contribute 0 (their duty is internal), and a unit with NO
    // process streams (an electricLoad generator -- a pure energy SINK whose
    // shaft work already left the streams at the turbine) is skipped entirely.
    // This is the global plant boundary's Q_boundary -- see the block below.
    scalar globalQext = 0.0;
    for (const auto& u : units)
    {
        // ONE datum (elements): a present species with no elements/formation
        // phase path THROWS naming the component (Vitor's law -- no silent
        // sensible fallback).  For a DISPLAY report we surface that single
        // unit's gap LOUDLY (a `gap:<reason>` row + the named component on
        // stderr) and carry on, so one curation gap does not nuke the whole
        // run's report.  The fix is to CURATE the component's standardThermochemistry,
        // never to re-add the second datum.
        // The unit's genuine external duty KPIs (independent of the enthalpy
        // datum -- it only reads the KPIs), so a unit whose stream-enthalpy
        // datum is MISSING (a gap) still has its real boundary duty counted.
        int nItems = 0;
        const scalar sumExternal = externalItemsSum(u.name, nItems);

        reporting::UnitEnergy e;
        try {
            e = reporting::unitEnergyBalance(lookup(u.ins), lookup(u.outs),
                                             ctx.thermo, Tref);
        } catch (const std::exception& ex) {
            std::cerr << "WARNING: energyBalance: unit '" << u.name
                      << "' has no elements-datum enthalpy -- " << ex.what()
                      << "  (curate the standardThermochemistry block; the per-unit "
                         "closure is reported as a gap, not a sensible "
                         "fallback)\n";
            f << u.name << ",n/a,n/a,n/a,n/a,n/a,gap\n";
            ++gapCount;
            // A GAPPED unit still has process streams (the datum is missing,
            // not the topology), so its real boundary duty crosses the boundary
            // -- keep it in the plant-boundary sum, matching the pre-refactor
            // blind KPI sweep (the old behaviour on curation-gap cases).
            globalQext += sumExternal;
            continue;
        }

        if (e.ref == reporting::EnergyRef::None)
        {
            // No stream-enthalpy datum, but the unit may still declare a duty.
            // A unit that resolves to NO process streams is a pure energy SINK /
            // conversion node (the electricLoad generator) -- its KPI is energy
            // that already crossed at the upstream unit, so it is NOT added to
            // the plant-boundary sum (it would double-count).
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
        // Plant-boundary accumulator: ONLY the genuine external-duty KPIs
        // (Q_kW / reboiler / condenser / shaft work), never `qBoundary`.  A
        // utility medium's heat (qBoundary) is carried by its steam/condensate
        // streams, which are themselves system feeds/products counted in
        // Σ H(feeds)/Σ H(products) below -- adding qBoundary here would double
        // count it (the old evaporator trap).  Internal process-to-process
        // exchangers (the HRSG) contribute 0; no-process-stream sinks (the
        // electricLoad generator) never reach this branch and are skipped.
        if (!internalExchanger) globalQext += sumExternal;
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
        // pass-12 (student): a ~1% first-law gap sat silently in the CSV while
        // every default announces aloud -- the ledger now SPEAKS when a unit's
        // closure leaves 100 +- 0.5%.
        if (declares && std::abs(closure - 100.0) > 0.5)
            std::cout << "  [energy] " << u.name << ": closure "
                      << std::fixed << std::setprecision(2) << closure
                      << "% (dH = " << std::setprecision(2) << dH
                      << " kW vs declared items " << items << " kW) -- an"
                         " UNEXPLAINED first-law residual; inspect the unit's"
                         " enthalpy paths (reports/balances has the ledger).\n";
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
    // products, and boundary heat/work survive.  Q_boundary is `globalQext` --
    // the Σ of each unit's per-unit `supplied` accumulated above, NOT a blind
    // KPI sweep.  That distinction is what makes a combined-cycle close:
    //   * an internal process-to-process exchanger (the HRSG) is EXCLUDED -- its
    //     duty moves heat between two internal streams, never across the boundary;
    //   * a turbine's shaft work (its negative `W_shaft_kW`) IS counted -- that
    //     energy leaves the fluid and the boundary;
    //   * the electricLoad generator that converts that SAME work to electricity
    //     carries NO process stream, so it is skipped (it would double-count);
    //   * the evaporator's utility-medium `duty_kW` stays excluded (its chest
    //     steam is already a feed in Σ H(feeds)), exactly as it is per-unit.
    // This is the single number the GUI shows green and the regression asserts on.
    {
        scalar Hfeeds = 0.0, Hprods = 0.0;
        const scalar Qext = globalQext;
        int    nFeed = 0, nProd = 0, nGap = 0;
        // No-silent-crutch: a boundary stream that genuinely CARRIES a species
        // with no elements-datum enthalpy (z_i > 0 but no standardThermochemistry / no
        // aqueous-ion reference) cannot be placed on the datum.  Dropping it
        // and still printing a closure % is the silent hole this report used to
        // have -- so we collect the offenders and REFUSE the global number
        // below (the energy balance only; the mass balance needs no enthalpy).
        // A composition-absent species (z_i = 0) is NOT a gap and stays silent.
        std::vector<std::string> gapStreams;
        std::set<std::string>    gapComponents;
        std::vector<std::string> gapOther;     // datum present but a Cp leg gone
        auto sumStream = [&](const std::string& name, scalar& acc, int& cnt)
        {
            auto it = ctx.result.streams.find(name);
            if (it == ctx.result.streams.end()) return;
            const auto miss = reporting::missingEnthalpyData(it->second,
                                                             ctx.thermo);
            if (!miss.empty())
            {
                gapStreams.push_back(name);
                for (const auto& m : miss) gapComponents.insert(m);
                ++nGap;
                return;
            }
            try { acc += reporting::streamH_elements(it->second, ctx.thermo);
                  ++cnt; }
            catch (const std::exception& ex)
            {
                // The formation datum exists but a downstream leg (a Cp block)
                // is absent -- still a real gap, named from the kernel message.
                gapStreams.push_back(name);
                gapOther.emplace_back(ex.what());
                ++nGap;
            }
        };
        for (const auto& s : topo.feeds)    sumStream(s, Hfeeds, nFeed);
        for (const auto& s : topo.products) sumStream(s, Hprods, nProd);

        // ---- REFUSAL --------------------------------------------------------
        // One or more boundary streams could not be placed on the elements
        // datum because a PRESENT component has no enthalpy datum.  Present a
        // NO number (no misleading residual_pct); name the culprits loudly.
        if (nGap > 0)
        {
            auto join = [](const auto& cont, const std::string& sep)
            {
                std::string out; bool first = true;
                for (const auto& v : cont)
                { if (!first) out += sep; out += v; first = false; }
                return out;
            };
            std::ostringstream msg;
            msg << "energy balance cannot close: ";
            if (!gapComponents.empty())
                msg << "component(s) '" << join(gapComponents, "', '")
                    << "' have no enthalpy datum (no standardThermochemistry, no "
                       "aqueous-ion reference)";
            else
                msg << join(gapOther, "; ");
            msg << " -- present in boundary stream(s) '"
                << join(gapStreams, "', '") << "'.  "
                << "Add standardThermochemistry{ dHf_298; s_298; phase; } to the "
                   "component .dat, or configure it as an electrolyte "
                   "(electrolyte{ cation; anion; } + ions in the catalogue).  "
                << "The ENERGY balance is REFUSED; the mass balance is "
                   "unaffected (it needs no enthalpy datum).";

            std::cerr << "ERROR: energyBalance: " << msg.str() << "\n";

            const std::filesystem::path gpath = dir / "globalEnergyBoundary.csv";
            std::ofstream g(gpath);
            if (g.is_open())
            {
                // A REFUSED record -- deliberately NO residual_pct.  A reader
                // (the GUI, the regression) sees status=REFUSED, never a
                // closure number computed from a partial sum.
                std::string reason = msg.str();
                std::replace(reason.begin(), reason.end(), ',', ';');
                std::replace(reason.begin(), reason.end(), '\n', ' ');
                g << "quantity,value\n"
                  << "status,REFUSED\n"
                  << "reason," << reason << "\n"
                  << "n_gap," << nGap << "\n"
                  << "gap_components," << join(gapComponents, " ") << "\n"
                  << "gap_streams," << join(gapStreams, " ") << "\n";
                g.close();
            }
            if (ctx.verbosity >= 1)
                std::cout << "  [report] globalEnergyBoundary -> REFUSED ("
                          << nGap << " boundary stream(s) with no enthalpy "
                             "datum)\n";
            return;
        }

        const scalar residual = Hfeeds + Qext - Hprods;
        // Normalise the residual by the LARGEST energy magnitude in play, not by
        // |Hfeeds| alone: a CLOSED LOOP (a recycle Rankine, rankine02) has no
        // boundary feeds (Hfeeds == 0), so |Hfeeds| would collapse the denom to
        // 1e-9 and turn a ~0 residual into a phantom 21 % -- a silent fake hole
        // next to the headline closure.  Using max(|feeds|,|products|,|Qext|)
        // gives an honest small percentage when the loop balances, and leaves
        // every open plant (|Hfeeds| dominates) unchanged.
        const scalar denom    = std::max({std::abs(Hfeeds), std::abs(Hprods),
                                          std::abs(Qext), 1.0e-9});
        // A fully CLOSED loop (no boundary feeds AND no products -- rankine02's
        // recycle) has nothing crossing the boundary: feeds, products and Qext
        // are all ~0 and the first law is vacuous.  Report 0 % rather than
        // dividing a floating-point-noise residual by the 1e-9 floor (the
        // phantom 21 %).  Any OPEN plant has a real denom and is unaffected.
        const bool   noBoundary = (nFeed == 0 && nProd == 0 && denom <= 1.0e-6);
        const scalar relPct   = noBoundary ? 0.0 : 100.0 * residual / denom;

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
