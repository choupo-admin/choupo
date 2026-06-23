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

#include "UtilityAllocationReport.H"
#include "thermo/utility/UtilityCatalogue.H"

#include <algorithm>
#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <map>
#include <set>
#include <vector>

namespace Choupo {

// ===========================================================================
//  allocateUtilities --- the single source of truth.
//
//  Sizes a plant utility for every unallocated heat duty by temperature
//  level: a unit's generic `Q`, plus a distillation column's reboiler
//  (heating, bottoms T) and condenser (cooling, top T).  A duty already
//  carried by a physical utility STREAM, or by a heat-LINK at either end,
//  is flagged carried and not re-allocated (no double-count).
//
//  Used BOTH by the utilityAllocation report (CSV / console) AND by the
//  application before emitting the result JSON, so the GUI sees the same
//  numbers without re-running the pick.
// ===========================================================================
std::vector<UtilityAllocation>
allocateUtilities(const SimulationResult& result, const DictPtr& flowsheet, scalar dTmin)
{
    // Process temperature: prefer explicit `T`, fall back to `T_out`.
    auto unitT = [](const std::map<std::string, scalar>& k) -> scalar
    {
        auto it = k.find("T");      if (it != k.end()) return it->second;
        it      = k.find("T_out");  if (it != k.end()) return it->second;
        return -1.0;                       // unknown
    };

    // Lowest-grade catalogue utility that serves a duty of sign(Q) at T
    // (tightest feasible temperature margin).
    auto pick = [&](bool heating, scalar T) -> const Utility*
    {
        const Utility* best = nullptr;
        scalar bestMargin = std::numeric_limits<scalar>::infinity();
        for (const auto& name : UtilityCatalogue::availableNames())
        {
            const Utility& u = UtilityCatalogue::byName(name);
            if (heating && u.tier != "heating") continue;
            if (!heating && u.tier != "cooling") continue;
            if (u.dutyPerKg <= 0.0) continue;
            scalar margin;
            if (heating) { if (u.T_in < T + dTmin) continue; margin = u.T_in - T; }
            else         { if (u.T_in > T - dTmin) continue; margin = T - u.T_in; }
            if (margin < bestMargin) { bestMargin = margin; best = &u; }
        }
        return best;
    };

    // ---- carriers from topology (utility streams) -------------------------
    std::map<std::string, std::string> carrier;   // unit -> carrying utility stream
    {
        std::map<std::string, std::string> utilStreams;
        for (const auto& [sname, s] : result.streams)
            if (!s.category.empty()) utilStreams[sname] = s.category;

        if (flowsheet && flowsheet->found("units"))
            for (const auto& ud : flowsheet->lookupDictList("units"))
            {
                const std::string uname = ud->lookupWordOrDefault("name", "");
                if (uname.empty()) continue;
                std::vector<std::string> touched;
                if (ud->found("in"))      touched.push_back(ud->lookupWord("in"));
                if (ud->found("inputs"))  for (auto& s : ud->lookupWordList("inputs"))  touched.push_back(s);
                if (ud->found("outputs")) for (auto& s : ud->lookupWordList("outputs")) touched.push_back(s);
                for (const auto& s : touched)
                {
                    auto it = utilStreams.find(s);
                    if (it != utilStreams.end()) { carrier[uname] = s; break; }
                }
            }
    }

    // ---- explicit per-port utility (column condenser/reboiler block) ------
    std::map<std::string, std::string> portUtility;   // "<unit>/<port>" -> utility
    if (flowsheet && flowsheet->found("units"))
        for (const auto& ud : flowsheet->lookupDictList("units"))
        {
            const std::string uname = ud->lookupWordOrDefault("name", "");
            if (uname.empty() || !ud->found("operation")) continue;
            auto op = ud->subDict("operation");
            for (const char* port : {"reboiler", "condenser"})
                if (op && op->found(port))
                {
                    auto pd = op->subDict(port);
                    if (pd && pd->found("utility"))
                        portUtility[uname + "/" + port] = pd->lookupWord("utility");
                }
        }

    // ---- heat-links (energy wires kind heat): BOTH ends carried -----------
    std::map<std::string, std::string> heatLinkUnit;   // consumer -> "<src>.<port>"
    std::map<std::string, std::string> heatLinkPort;   // "<unit>/<port>" -> consumer
    if (flowsheet && flowsheet->found("units"))
        for (const auto& ud : flowsheet->lookupDictList("units"))
        {
            const std::string uname = ud->lookupWordOrDefault("name", "");
            if (uname.empty() || !ud->found("energyInputs")) continue;
            for (const auto& ein : ud->lookupDictList("energyInputs"))
            {
                if (ein->lookupWordOrDefault("kind", "work") != "heat") continue;
                const std::string from = ein->lookupWordOrDefault("from", "");
                if (from.empty()) continue;
                heatLinkUnit[uname] = from;
                const auto dot = from.find('.');
                if (dot != std::string::npos)
                    heatLinkPort[from.substr(0, dot) + "/" + from.substr(dot + 1)] = uname;
            }
        }

    // ---- unit types + work-COUPLED units (for the electrical tier) --------
    //   A unit is mechanically coupled by a work WIRE --- and therefore NOT
    //   billed as grid electricity --- if it EITHER receives shaft work
    //   (an energyInput of kind work) OR exports its shaft work to another
    //   unit (its shaft port is the `from` of some energyInput).  The latter
    //   is the combined-cycle compressor: its load is summed into the gas
    //   turbine's generator, so charging it again to the grid double-counts.
    std::map<std::string, std::string> unitType;
    std::set<std::string> workCoupled;
    if (flowsheet && flowsheet->found("units"))
        for (const auto& ud : flowsheet->lookupDictList("units"))
        {
            const std::string uname = ud->lookupWordOrDefault("name", "");
            if (uname.empty()) continue;
            unitType[uname] = ud->lookupWordOrDefault("type", "");
            if (ud->found("energyInputs"))
                for (const auto& ein : ud->lookupDictList("energyInputs"))
                {
                    if (ein->lookupWordOrDefault("kind", "work") != "work") continue;
                    workCoupled.insert(uname);                      // driven by a wire
                    const std::string from = ein->lookupWordOrDefault("from", "");
                    const auto dot = from.find('.');
                    if (dot != std::string::npos)
                        workCoupled.insert(from.substr(0, dot));    // source exports work
                }
        }

    // ---- one row per duty -------------------------------------------------
    std::vector<UtilityAllocation> rows;
    for (const auto& [unit, k] : result.kpis)
    {
        const auto& kmap = k;          // C++17: cannot capture a structured binding
        auto kf = [&kmap](const char* key) -> const scalar* {
            auto it = kmap.find(key); return it == kmap.end() ? nullptr : &it->second;
        };
        struct Duty { scalar W; scalar T; std::string port; };
        std::vector<Duty> duties;
        if (auto q = kf("Q"))             duties.push_back({*q, unitT(k), ""});
        if (auto q = kf("Q_reboiler_kW")) { auto tb = kf("T_bottom");
            duties.push_back({*q * 1000.0, tb ? *tb : unitT(k), "reboiler"}); }
        if (auto q = kf("Q_condenser_kW")) { auto tt = kf("T_top");
            duties.push_back({*q * 1000.0, tt ? *tt : unitT(k), "condenser"}); }

        for (const auto& dty : duties)
        {
            const scalar Q = dty.W;                    // W, + heating / - cooling
            if (std::abs(Q) < 1.0) continue;            // ignore ~0 (adiabatic)

            UtilityAllocation r;
            r.unit = unit;  r.port = dty.port;
            r.duty_kW = Q / 1000.0;  r.T = dty.T;
            r.tier = (Q > 0.0) ? "heating" : "cooling";

            // Carried (not re-allocated) when the heat has a carrier: a
            // physical utility STREAM, or a heat-LINK at either end.
            std::string carriedBy;
            if (dty.port.empty())
            {
                auto cit = carrier.find(unit);     if (cit != carrier.end()) carriedBy = cit->second;
                auto hit = heatLinkUnit.find(unit); if (hit != heatLinkUnit.end()) carriedBy = "heat-link " + hit->second;
            }
            else
            {
                auto pit = heatLinkPort.find(unit + "/" + dty.port);
                if (pit != heatLinkPort.end()) carriedBy = "heat-link -> " + pit->second;
            }
            if (!carriedBy.empty())
            {
                r.utility = "(carried: " + carriedBy + ")";
                rows.push_back(std::move(r));
                continue;
            }

            // Explicit per-port utility wins over the auto-pick.
            const Utility* u = nullptr;
            if (!dty.port.empty())
            {
                auto pit = portUtility.find(unit + "/" + dty.port);
                if (pit != portUtility.end())
                    try { u = &UtilityCatalogue::byName(pit->second); }
                    catch (const std::exception&) { u = nullptr; }
            }
            if (!u && r.T > 0.0) u = pick(Q > 0.0, r.T);
            if (u)
            {
                r.allocated = true;
                r.utility   = u->name;
                r.kg_s      = std::abs(Q) / u->dutyPerKg;
                r.MW        = std::abs(Q) / 1.0e6;
                r.eur_h     = (std::abs(Q) * 3600.0 / 1.0e9) * u->cost;   // W->GJ/h, €/GJ->€/h
            }
            else
            {
                r.utility = (r.T > 0.0) ? "(none adequate)" : "(unit T unknown)";
            }
            rows.push_back(std::move(r));
        }
    }

    // ---- electrical power (tier "power") ----------------------------------
    //   Rotating equipment crosses the plant boundary as electricity: pump &
    //   compressor MOTORS draw it from the grid; an electricLoad (generator)
    //   feeds it back.  W supplied by a WIRE (turbine -> compressor) is
    //   mechanical and is skipped.  Net = drawn - generated, priced at the
    //   electricity tariff -- the power bill alongside steam / cooling water.
    //   Graceful if the catalogue has no `electricity` entry.
    const Utility* elec = nullptr;
    try { elec = &UtilityCatalogue::byName("electricity"); }
    catch (const std::exception&) { elec = nullptr; }
    if (elec)
    {
        const scalar eff = (elec->driveEfficiency > 0.0) ? elec->driveEfficiency : 1.0;
        auto eurPerW = [&](scalar W) { return (W * 3600.0 / 1.0e9) * elec->cost; }; // W->€/h
        for (const auto& [unit, k] : result.kpis)
        {
            auto tIt = unitType.find(unit);
            const std::string ty = (tIt != unitType.end()) ? tIt->second : "";
            const auto& kmap = k;
            auto kf = [&kmap](const char* key) -> const scalar* {
                auto it = kmap.find(key); return it == kmap.end() ? nullptr : &it->second; };

            if (ty == "pump" || ty == "compressor")        // electric-motor consumer
            {
                if (workCoupled.count(unit)) continue;      // mechanically wire-coupled
                auto w = kf("W_shaft");
                if (!w || *w <= 1.0) continue;              // none / ~0 / not positive
                const scalar Pelec = *w / eff;              // grid draw incl. motor losses
                UtilityAllocation r;
                r.unit = unit;  r.tier = "power";  r.utility = "electricity";
                r.T = -1.0;     r.allocated = true;
                r.duty_kW = Pelec / 1000.0;  r.MW = Pelec / 1.0e6;  r.eur_h = eurPerW(Pelec);
                rows.push_back(std::move(r));
            }
            else if (ty == "electricLoad")                  // generator -> grid
            {
                auto w = kf("W_electric");
                if (!w || *w <= 1.0) continue;
                UtilityAllocation r;
                r.unit = unit;  r.tier = "power";  r.utility = "electricity (generated)";
                r.T = -1.0;     r.allocated = true;
                r.duty_kW = *w / 1000.0;  r.MW = *w / 1.0e6;  r.eur_h = -eurPerW(*w);  // credit
                rows.push_back(std::move(r));
            }
        }
    }

    return rows;
}

// ===========================================================================
//  The report object: compute via allocateUtilities(), then write CSV +
//  console.  (The application populates result.utilityAllocation separately
//  for the JSON; both call the same function.)
// ===========================================================================
void UtilityAllocationReport::run(const DictPtr& dict, const ReportContext& ctx)
{
    const scalar dTmin = dict ? dict->lookupScalarOrDefault("dTmin", 10.0) : 10.0;
    const auto rows = allocateUtilities(ctx.result, ctx.flowsheetDict, dTmin);

    std::map<std::string, std::pair<scalar,scalar>> byUtil;   // util -> (kg/s, €/h)
    for (const auto& r : rows)
        if (r.allocated) { byUtil[r.utility].first += r.kg_s; byUtil[r.utility].second += r.eur_h; }

    // ---- CSV --------------------------------------------------------------
    //  Default layout: the file sits directly in reports/ (legacySub "");
    //  postProcessing layout: postProcessing/utilityAllocation/<n>/.
    const std::filesystem::path uaDir = ctx.outDir("utilityAllocation", "");
    std::filesystem::create_directories(uaDir);
    std::ofstream csv(uaDir / "utilityAllocation.csv");
    csv << "unit,port,duty_kW,process_T_K,tier,utility,massflow_kg_s,load_MW,cost_eur_h\n";
    for (const auto& r : rows)
        csv << r.unit << ',' << r.port << ',' << r.duty_kW << ',' << r.T << ',' << r.tier << ','
            << r.utility << ',' << r.kg_s << ',' << r.MW << ',' << r.eur_h << '\n';
    csv.close();

    if (ctx.verbosity < 2) return;

    // ---- console ----------------------------------------------------------
    std::cout << "\n================  Utility allocation (from duties)  ================\n";
    if (rows.empty())
    {
        std::cout << "  (no unit reported a duty Q --- nothing to allocate)\n";
        std::cout << "====================================================================\n\n";
        return;
    }
    std::cout << "  unit         port        duty[kW]    T[K]   tier      utility          kg/s     EUR/h\n"
              << "  ----------  ----------  ---------  -------  --------  --------------  -------  -------\n";
    for (const auto& r : rows)
        std::cout << "  " << std::left << std::setw(11) << r.unit
                  << "  " << std::left << std::setw(10) << (r.port.empty() ? "-" : r.port) << std::right
                  << std::fixed << std::setprecision(3) << std::setw(10) << r.duty_kW
                  << std::setprecision(1) << std::setw(9) << r.T
                  << "  " << std::left << std::setw(8) << r.tier << std::right
                  << "  " << std::left << std::setw(14) << r.utility << std::right
                  << std::setprecision(4) << std::setw(9) << r.kg_s
                  << std::setprecision(2) << std::setw(9) << r.eur_h << "\n";
    if (!byUtil.empty())
    {
        std::cout << "  ---------------------------------------------------------------\n";
        std::cout << "  Totals by utility:\n";
        for (const auto& [name, agg] : byUtil)
            std::cout << "    " << std::left << std::setw(16) << name << std::right
                      << std::fixed << std::setprecision(4) << std::setw(9) << agg.first
                      << " kg/s   " << std::setprecision(2) << std::setw(9) << agg.second
                      << " EUR/h\n";
    }
    std::cout << "====================================================================\n\n";
}

} // namespace Choupo
