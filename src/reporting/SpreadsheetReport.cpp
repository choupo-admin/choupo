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

#include "SpreadsheetReport.H"
#include "BalanceMath.H"
#include "OdsWriter.H"
#include "Topology.H"
#include "streams/StreamMass.H"

#include <algorithm>
#include <cmath>
#include <iostream>
#include <set>
#include <vector>

namespace Choupo {

void SpreadsheetReport::run(const DictPtr& dict, const ReportContext& ctx)
{
    using reporting::componentMassFlow;
    using reporting::closurePct;

    const std::string outFile =
        dict->lookupWordOrDefault("file", "report.ods");
    const scalar closureTol = dict->lookupScalarOrDefault("closureTol", 0.5);
    const scalar Tref       = dict->lookupScalarOrDefault("Tref", 298.15);

    const auto topo   = reporting::readTopology(ctx.flowsheetDict);
    const auto units  = reporting::resolveUnits(topo, ctx.result);  // flattened (plant-aware)
    const auto& comps = ctx.result.componentNames;
    const std::size_t n = comps.size();

    auto roleOf = [&](const std::string& nm) -> std::string {
        if (topo.feeds.count(nm))    return "feed";
        if (topo.products.count(nm)) return "product";
        return "intermediate";
    };
    auto roleStyle = [&](const std::string& nm) -> OdsWriter::Style {
        if (topo.feeds.count(nm))    return OdsWriter::Feed;
        if (topo.products.count(nm)) return OdsWriter::Product;
        return OdsWriter::Plain;
    };

    OdsWriter ods;

    // ============================ Stream Table ===========================
    ods.beginSheet("Stream Table");
    ods.newRow();
    ods.textCell("Stream table", OdsWriter::Title);
    ods.newRow();   // header
    ods.textCell("stream",     OdsWriter::Header);
    ods.textCell("role",       OdsWriter::Header);
    ods.textCell("F [kmol/h]", OdsWriter::Header);
    ods.textCell("F [kg/h]",   OdsWriter::Header);
    ods.textCell("T [K]",      OdsWriter::Header);
    ods.textCell("P [bar]",    OdsWriter::Header);
    ods.textCell("vapFrac",    OdsWriter::Header);
    for (const auto& c : comps) ods.textCell("x_" + c, OdsWriter::Header);

    // feed -> intermediate -> product, then by name
    auto rank = [&](const std::string& nm) {
        const std::string r = roleOf(nm);
        return r == "feed" ? 0 : r == "intermediate" ? 1 : 2;
    };
    std::vector<std::string> names;
    for (const auto& kv : ctx.result.streams) names.push_back(kv.first);
    std::sort(names.begin(), names.end(), [&](const std::string& a, const std::string& b){
        const int ra = rank(a), rb = rank(b);
        return ra != rb ? ra < rb : a < b;
    });

    for (const auto& nm : names)
    {
        const auto& s = ctx.result.streams.at(nm);
        const OdsWriter::Style st = roleStyle(nm);
        ods.newRow();
        ods.textCell(nm, st);
        ods.textCell(roleOf(nm), st);
        ods.numberCell(s.F * 3600.0, 4, st);
        ods.numberCell(F_mass(s, ctx.thermo) * 3600.0, 4, st);
        ods.numberCell(s.T, 2, st);
        ods.numberCell(s.P / 1.0e5, 4, st);
        ods.numberCell(s.vf, 4, st);
        for (std::size_t i = 0; i < n; ++i)
            ods.numberCell(i < s.z.size() ? s.z[i] : 0.0, 6, st);
    }

    // ========================= Mass Balance (global) =====================
    ods.beginSheet("Mass Balance");
    ods.newRow();
    ods.textCell("Mass balance (global, per component)", OdsWriter::Title);
    ods.newRow();
    ods.textCell("component",  OdsWriter::Header);
    ods.textCell("in [kg/h]",  OdsWriter::Header);
    ods.textCell("out [kg/h]", OdsWriter::Header);
    ods.textCell("net [kg/h]", OdsWriter::Header);

    std::vector<scalar> in(n, 0.0), out(n, 0.0);
    for (const auto& nm : topo.feeds)
    {
        auto it = ctx.result.streams.find(nm);
        if (it == ctx.result.streams.end()) continue;
        const auto m = componentMassFlow(it->second, ctx.thermo);
        for (std::size_t i = 0; i < n; ++i) in[i] += m[i];
    }
    for (const auto& nm : topo.products)
    {
        auto it = ctx.result.streams.find(nm);
        if (it == ctx.result.streams.end()) continue;
        const auto m = componentMassFlow(it->second, ctx.thermo);
        for (std::size_t i = 0; i < n; ++i) out[i] += m[i];
    }
    scalar totIn = 0.0, totOut = 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        ods.newRow();
        ods.textCell(comps[i]);
        ods.numberCell(in[i], 4);
        ods.numberCell(out[i], 4);
        ods.numberCell(out[i] - in[i], 4);
        totIn += in[i]; totOut += out[i];
    }
    const scalar gClosure = closurePct(totIn, totOut);
    const OdsWriter::Style closeSt =
        (std::abs(gClosure - 100.0) <= closureTol) ? OdsWriter::Good : OdsWriter::Bad;
    ods.newRow();
    ods.textCell("TOTAL", OdsWriter::Bold);
    ods.numberCell(totIn, 4, OdsWriter::Bold);
    ods.numberCell(totOut, 4, OdsWriter::Bold);
    ods.numberCell(totOut - totIn, 4, OdsWriter::Bold);
    ods.newRow();
    ods.textCell("closure [%]", OdsWriter::Bold);
    ods.numberCell(gClosure, 4, closeSt);

    // ====================== Mass Balance (per unit) ======================
    ods.beginSheet("Mass Balance by Unit");
    ods.newRow();
    ods.textCell("Mass balance per unit", OdsWriter::Title);
    ods.newRow();
    ods.textCell("unit",        OdsWriter::Header);
    ods.textCell("in [kg/h]",   OdsWriter::Header);
    ods.textCell("out [kg/h]",  OdsWriter::Header);
    ods.textCell("diff [kg/h]", OdsWriter::Header);
    ods.textCell("closure [%]", OdsWriter::Header);
    for (const auto& u : units)
    {
        scalar uin = 0.0, uout = 0.0;
        for (const auto& s : u.ins)
        {
            auto it = ctx.result.streams.find(s);
            if (it != ctx.result.streams.end())
                uin += F_mass(it->second, ctx.thermo) * 3600.0;
        }
        for (const auto& s : u.outs)
        {
            auto it = ctx.result.streams.find(s);
            if (it != ctx.result.streams.end())
                uout += F_mass(it->second, ctx.thermo) * 3600.0;
        }
        const scalar cl = closurePct(uin, uout);
        const OdsWriter::Style st =
            (std::abs(cl - 100.0) <= closureTol) ? OdsWriter::Good : OdsWriter::Bad;
        ods.newRow();
        ods.textCell(u.name);
        ods.numberCell(uin, 4);
        ods.numberCell(uout, 4);
        ods.numberCell(uout - uin, 4);
        ods.numberCell(cl, 4, st);
    }

    // ========================= Energy Balance ============================
    ods.beginSheet("Energy Balance");
    ods.newRow();
    ods.textCell("Energy balance per unit  (dH = implied duty)", OdsWriter::Title);
    ods.newRow();
    ods.textCell("unit",       OdsWriter::Header);
    ods.textCell("H_in [kW]",  OdsWriter::Header);
    ods.textCell("H_out [kW]", OdsWriter::Header);
    ods.textCell("dH [kW]",    OdsWriter::Header);
    ods.textCell("reference",  OdsWriter::Header);
    auto lookup = [&](const std::vector<std::string>& nms) {
        std::vector<const ProcessStream*> v;
        for (const auto& s : nms)
        {
            auto it = ctx.result.streams.find(s);
            v.push_back(it == ctx.result.streams.end() ? nullptr : &it->second);
        }
        return v;
    };
    for (const auto& u : units)
    {
        // ONE datum (elements): a present species with no formation path
        // throws naming the component -- surface it as a curation gap row,
        // never a silent sensible fallback.
        reporting::UnitEnergy e;
        bool gap = false;
        try {
            e = reporting::unitEnergyBalance(lookup(u.ins), lookup(u.outs),
                                             ctx.thermo, Tref);
        } catch (const std::exception&) { gap = true; }
        ods.newRow();
        ods.textCell(u.name);
        if (gap)
        {
            ods.textCell("n/a"); ods.textCell("n/a");
            ods.textCell("n/a"); ods.textCell("gap", OdsWriter::Bad);
        }
        else if (e.ref == reporting::EnergyRef::None)
        {
            ods.textCell("n/a"); ods.textCell("n/a");
            ods.textCell("n/a"); ods.textCell("n/a", OdsWriter::Bad);
        }
        else
        {
            ods.numberCell(e.hIn, 4);
            ods.numberCell(e.hOut, 4);
            ods.numberCell(e.hOut - e.hIn, 4);
            // ONE datum: every unit that resolves any stream is on the
            // elements reference (the sensible fallback was deleted).
            ods.textCell("elements", OdsWriter::Good);
        }
    }

    // ============================ Utilities ==============================
    ods.beginSheet("Utilities");
    ods.newRow();
    ods.textCell("Plant utilities (aggregated by category)", OdsWriter::Title);
    ods.newRow();
    ods.textCell("category",   OdsWriter::Header);
    ods.textCell("kg/h",       OdsWriter::Header);
    ods.textCell("kg/s",       OdsWriter::Header);
    if (ctx.result.utilities.empty())
    {
        ods.newRow();
        ods.textCell("(none)");
        ods.numberCell(0.0, 2);
        ods.numberCell(0.0, 4);
    }
    else
    {
        scalar total = 0.0;
        for (const auto& [cat, kgs] : ctx.result.utilities)
        {
            ods.newRow();
            ods.textCell(cat);
            ods.numberCell(kgs * 3600.0, 2);
            ods.numberCell(kgs, 6);
            total += kgs;
        }
        ods.newRow();
        ods.textCell("TOTAL", OdsWriter::Bold);
        ods.numberCell(total * 3600.0, 2, OdsWriter::Bold);
        ods.numberCell(total, 6, OdsWriter::Bold);
    }

    // ===================== Profiles (one sheet per unit) =================
    int profileSheets = 0;
    for (const auto& [unit, prof] : ctx.result.profiles)
    {
        if (prof.columns.empty()) continue;
        std::vector<std::string> cols;
        if (prof.columns.count(prof.xAxis)) cols.push_back(prof.xAxis);
        for (const auto& [name, vec] : prof.columns)
        {
            (void)vec;
            if (name != prof.xAxis) cols.push_back(name);
        }
        if (cols.empty()) continue;
        std::size_t nrows = 0;
        for (const auto& c : cols) nrows = std::max(nrows, prof.columns.at(c).size());

        std::string sheet = "Profile: " + unit;
        if (sheet.size() > 31) sheet = sheet.substr(0, 31);   // reader cap
        ods.beginSheet(sheet);
        ods.newRow();
        ods.textCell("Internal profile of unit '" + unit + "'", OdsWriter::Title);
        ods.newRow();
        for (const auto& c : cols) ods.textCell(c, OdsWriter::Header);
        for (std::size_t r = 0; r < nrows; ++r)
        {
            ods.newRow();
            for (const auto& c : cols)
            {
                const auto& v = prof.columns.at(c);
                if (r < v.size()) ods.numberCell(v[r], 6);
                else              ods.emptyCell();
            }
        }
        ++profileSheets;
    }

    // ====================== Design (equipment sizing) ====================
    int extraSheets = 0;
    if (!ctx.result.sizings.empty())
    {
        std::set<std::string> keys;
        for (const auto& [u, sz] : ctx.result.sizings)
            for (const auto& [k, v] : sz.values) { (void)v; keys.insert(k); }

        ods.beginSheet("Design");
        ods.newRow();
        ods.textCell("Equipment sizing", OdsWriter::Title);
        ods.newRow();
        ods.textCell("unit", OdsWriter::Header);
        ods.textCell("equipmentType", OdsWriter::Header);
        ods.textCell("material", OdsWriter::Header);
        for (const auto& k : keys) ods.textCell(k, OdsWriter::Header);
        for (const auto& [u, sz] : ctx.result.sizings)
        {
            ods.newRow();
            ods.textCell(u);
            ods.textCell(sz.equipmentType);
            ods.textCell(sz.material);
            for (const auto& k : keys)
            {
                auto it = sz.values.find(k);
                if (it != sz.values.end()) ods.numberCell(it->second, 5);
                else                       ods.emptyCell();
            }
        }
        ++extraSheets;
    }

    // ========================= Economics (CAPEX) =========================
    if (!ctx.result.costs.empty())
    {
        const std::string cur = ctx.result.costs.begin()->second.currency;
        ods.beginSheet("Economics");
        ods.newRow();
        ods.textCell("CAPEX (Guthrie/Turton, " + cur + ")", OdsWriter::Title);
        ods.newRow();
        ods.textCell("unit", OdsWriter::Header);
        ods.textCell("purchased", OdsWriter::Header);
        ods.textCell("bareModule", OdsWriter::Header);
        ods.textCell("totalModule", OdsWriter::Header);
        scalar tp = 0.0, tb = 0.0, tt = 0.0;
        for (const auto& [u, c] : ctx.result.costs)
        {
            ods.newRow();
            ods.textCell(u);
            ods.numberCell(c.purchasedCost, 2);
            ods.numberCell(c.bareModuleCost, 2);
            ods.numberCell(c.totalModuleCost, 2);
            tp += c.purchasedCost; tb += c.bareModuleCost; tt += c.totalModuleCost;
        }
        ods.newRow();
        ods.textCell("TOTAL", OdsWriter::Bold);
        ods.numberCell(tp, 2, OdsWriter::Bold);
        ods.numberCell(tb, 2, OdsWriter::Bold);
        ods.numberCell(tt, 2, OdsWriter::Bold);
        ++extraSheets;
    }

    // Default layout: the .ods sits directly in reports/ (legacySub "");
    // postProcessing layout: postProcessing/spreadsheet/<n>/<outFile>.
    const std::filesystem::path sdir = ctx.outDir("spreadsheet", "");
    std::filesystem::create_directories(sdir);
    const std::filesystem::path path = sdir / outFile;
    ods.save(path.string());

    if (ctx.verbosity >= 2)
        std::cout << "  [report] spreadsheet -> " << path.string()
                  << "   (" << (5 + profileSheets + extraSheets)
                  << " sheets, coloured)\n";
}

} // namespace Choupo
