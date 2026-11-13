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

#include "EconomicsPass.H"
#include "EstimateClass.H"
#include "costing/CostingModel.H"
#include "core/Advisory.H"
#include "core/RegistryRefusal.H"
#include "streams/UtilityCircuit.H"

#include "core/Dictionary.H"
#include "core/Dimensions.H"
#include "core/OdsWriter.H"
#include "solver/NewtonRaphson.H"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <limits>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <set>
#include <sstream>
#include <stdexcept>
#include <variant>
#include <vector>

namespace Choupo {

namespace {

namespace fs = std::filesystem;

// Total mass flow [kg/s] of a stream, FLUID + SOLID:
//   fluid = F [kmol/s] * Sigma z_i * MW_i ;   solid = Sigma s_i * MW_i .
// A solid product (e.g. crystalline sugar `Powder`) carries almost all of its
// mass in the solid phase s[] (F / z describe the fluid phases only) -- pricing
// on the fluid mass alone would undercount the product by orders of magnitude
// (the bug this guards against).  Mirrors the JSON `F_mass` + `F_solid_mass`.
// Throws (loud) when a molar mass is missing -- the priced euro/yr would
// otherwise be silent nonsense.
scalar streamMassFlow(const SimulationResult& r, const std::string& streamName)
{
    auto it = r.streams.find(streamName);
    if (it == r.streams.end())
        throw std::runtime_error("EconomicsPass: stream '" + streamName
            + "' (named in constant/economics) not found in the solved flowsheet");

    const auto& s = it->second;
    if (r.componentNames.size() != s.z.size())
        throw std::runtime_error("EconomicsPass: component list / composition "
            "size mismatch on stream '" + streamName + "' -- cannot form a mass "
            "flow for the price calculation");

    auto mwOf = [&](std::size_t i) -> scalar
    {
        auto mit = r.componentMolarMass.find(r.componentNames[i]);
        if (mit == r.componentMolarMass.end())
            throw std::runtime_error("EconomicsPass: molar mass for component '"
                + r.componentNames[i] + "' unavailable -- cannot mass-price "
                "stream '" + streamName + "'");
        return mit->second;
    };

    scalar mwMix = 0.0;                         // kg/kmol of the fluid
    for (std::size_t i = 0; i < s.z.size(); ++i)
        mwMix += s.z[i] * mwOf(i);
    scalar fluidMass = s.F * mwMix;             // kg/s

    scalar solidMass = 0.0;                     // kg/s (crystalline phase)
    for (std::size_t i = 0; i < s.s.size() && i < r.componentNames.size(); ++i)
        solidMass += s.s[i] * mwOf(i);

    return fluidMass + solidMass;               // kg/s, total mass leaving
}

// One priced stream line read from constant/economics (a revenue product or a
// purchased raw material).
struct PricedStream
{
    std::string stream;      // resolved stream name in the flowsheet
    scalar      price = 0.0; // €/kg (canonical: per kg)
    scalar      massFlow = 0.0; // kg/s  (filled at run time)
    std::string provenance;
};

// Load constant/economics relative to the case working directory.  The pass
// runs with CWD == case dir (choupoSolve resolves up to the case root before
// the post chain), so a plain relative path is correct.
DictPtr loadPriceFile(bool& present)
{
    const fs::path p = "constant/economics";
    present = fs::exists(p);
    if (!present) return nullptr;
    return Dictionary::fromFile(p.string());
}

// =========================================================================
//  EVERY RAW-MATERIAL INLET IS PRICED, OR DECLARED FREE (DEV.md 4c C208 (2a),
//  2026-11-02).
//
//  `C_RM` was the sum of the `rawMaterials` ENTRIES, so a boundary inlet with
//  no entry simply was not in it: the stream entered the plant, the appraisal
//  ran, NPV and IRR were printed, and the raw-material bill was short by that
//  stream -- at exit 0, with no line saying so (an acetone feed deleted from
//  `constant/economics` moved C_RM by nothing and refused nothing).  The
//  grammar to say "this one is free" already exists -- an entry with
//  `price 0;` and its `provenance` (the coating air of the tablet plants) --
//  so no new key is needed: the pass lists the plant's raw-material inlets,
//  and each must be named by an entry, priced or free.
//
//  WHAT COUNTS AS A RAW-MATERIAL INLET: a stream some unit consumes and no
//  unit produces (read off the flattened topology, the one home), minus
//  (a) the supply side of a DECLARED utility circuit (cooling water that
//  returns is a utility, billed by the utility allocation, not a purchase)
//  and (b) a feed only OBSERVER units consume (a unit with inputs and no
//  material outputs transforms nothing; `reporting::Topology` makes the same
//  call for the balances).  Names are matched through the declared alias
//  bridge, never by a tail.  Returns the unnamed inlets, sorted.
std::vector<std::string> unpricedRawMaterialInlets(
    const SimulationResult& r, const std::vector<std::string>& named)
{
    std::set<std::string> produced, consumed, byTransformer;
    for (const auto& fu : r.topology)
    {
        for (const auto& o : fu.outs) produced.insert(o);
        for (const auto& i : fu.ins)  consumed.insert(i);
        if (!fu.outs.empty())
            for (const auto& i : fu.ins) byTransformer.insert(i);
    }

    //  declared utility circuits (root flowsheetDict `utilities`); a file
    //  that cannot be read declares none -- which only makes the check
    //  STRICTER (an unreadable declaration cannot excuse an inlet).
    std::set<std::string> utilityStreams;
    try
    {
        if (fs::exists("system/flowsheetDict"))
        {
            const DictPtr fd = Dictionary::fromFile("system/flowsheetDict");
            const auto circuits = utilityCircuits::read(fd);
            for (const auto& kv :
                 utilityCircuits::circuitOfStream(circuits, r.boundaryAliasOf))
                utilityStreams.insert(kv.first);
        }
    }
    catch (const std::exception&) {}

    std::set<std::string> covered(named.begin(), named.end());
    for (const auto& n : named)
    {
        const auto a = r.boundaryAliasOf.find(n);
        if (a != r.boundaryAliasOf.end()) covered.insert(a->second);
        for (const auto& kv : r.boundaryAliasOf)
            if (kv.second == n) covered.insert(kv.first);
    }

    std::vector<std::string> out;
    for (const auto& in : consumed)
    {
        if (produced.count(in) || !byTransformer.count(in)) continue;
        if (utilityStreams.count(in) || covered.count(in)) continue;
        out.push_back(in);
    }
    return out;     // std::set iteration order: already sorted
}

// =========================================================================
//  THE WORKING CAPITAL, BUILT UP FROM WHAT THE PLANT HOLDS AND OWES
//  (2026-10-07, DEV.md 4c C44 slice 4).  Vitor: "quero no final ficar com uma
//  estimativa do capital circulante e de fundo de maneio, que sempre me fez
//  um pouco de confusao".
//
//  OPT-IN, AND THE OLD RULE IS UNTOUCHED.  `workingCapital 0.15;` (or no
//  key) keeps the one fraction of FCI it always was, and every case that
//  says so computes, prints and writes exactly what it did.  Declaring the
//  key as a BLOCK selects this model:
//
//      workingCapital
//      {
//          rawMaterialStock  0 day;   // days of raw-material purchases in stock
//          receivables      30 day;   // days of sales customers still owe
//          payables         30 day;   // days of raw-material purchases owed
//          minimumCash      15 day;   // days of cash operating cost (COM_d)
//      }
//
//  Every key is REQUIRED and must carry its unit (a bare number is SI
//  seconds) -- a default number of days is a policy nobody chose.  A "day"
//  of an annual figure is 1/365 of it, for every line alike.
//
//  THE FIVE CURRENT ASSETS (the gross working capital, "capital circulante"):
//    raw-material stock  a storage item attached to a priced raw-material
//                        stream holds its tank content, valued at the
//                        purchase price; a raw material with no tank holds
//                        `rawMaterialStock` days of its annual purchases;
//    process inventory   every other item's held inventory (slice 3);
//    product stock       a storage item attached to a priced product stream;
//    receivables         `receivables` days of the annual revenue;
//    minimum cash        `minimumCash` days of COM_d (cash cost: COM_d holds
//                        no depreciation).
//  THE CURRENT LIABILITY:
//    payables            `payables` days of the annual raw-material bill.
//  NET ("fundo de maneio") = gross - payables, and it is the NET figure the
//  cash flow invests at year 0 and recovers at the end, as it always did.
//
//  VALUED AT COST, NEVER AT THE SALES PRICE.  Each component held is valued
//  at what it COST the plant: a component a priced raw material brings in
//  at that raw material's price per kg (the raw material carrying most of
//  it, if several do); any other component -- the product made here -- at
//  the plant's cost of manufacture per kg of product, COM_d over the annual
//  mass of the priced products.  The rule is printed per component.
// =========================================================================
WorkingCapitalBuildUp buildWorkingCapital(const DictPtr& model,
    const SimulationResult& result,
    const std::vector<PricedStream>& rawMats,
    const std::vector<PricedStream>& products,
    scalar R, scalar C_RM, scalar COM_d, scalar H, bool verbose)
{
    auto days = [&](const char* key) -> scalar
    {
        if (!model->found(key))
            throw std::runtime_error(std::string("economics: the `workingCapital"
                " { ... }` model needs `") + key + " <n> day;` -- every one of"
                " rawMaterialStock, receivables, payables and minimumCash is"
                " REQUIRED, because a default number of days is a policy nobody"
                " chose.  Write `workingCapital 0.15;` instead to keep the"
                " fraction-of-FCI rule.");
        if (!model->hasDimensions(key))
            throw std::runtime_error(std::string("economics: `workingCapital {"
                " ") + key + " }` carries no unit.  A bare number is read as"
                " SECONDS by the dict grammar; write the unit (`30 day;`).");
        const scalar d = model->lookupScalar(key, Dims::time) / 86400.0;
        if (d < 0.0)
            throw std::runtime_error(std::string("economics: `workingCapital {")
                + " " + key + " }` must not be negative.");
        return d;
    };
    const scalar dRM   = days("rawMaterialStock");
    const scalar dRec  = days("receivables");
    const scalar dPay  = days("payables");
    const scalar dCash = days("minimumCash");

    auto fmt = [](scalar v, int p)
    {
        std::ostringstream o;
        o << std::fixed << std::setprecision(p) << v;
        return o.str();
    };

    //  ---- the unit cost of each component held -------------------------
    scalar productMass = 0.0;                                  // kg/yr
    for (const auto& p : products) productMass += p.massFlow * 3600.0 * H;
    if (!(productMass > 0.0))
        throw std::runtime_error("economics: the `workingCapital { ... }` model"
            " values what the plant holds at its cost of manufacture per kg of"
            " product, and no priced product carries any mass.");
    const scalar cProd = COM_d / productMass;                  // EUR/kg

    auto massFractions = [&](const std::string& stream)
    {
        std::map<std::string, scalar> w;
        const auto& s = result.streams.at(stream);
        scalar mw = 0.0;
        for (std::size_t i = 0; i < s.z.size() && i < result.componentNames.size(); ++i)
            mw += s.z[i] * result.componentMolarMass.at(result.componentNames[i]);
        for (std::size_t i = 0; i < s.z.size() && i < result.componentNames.size(); ++i)
            if (s.z[i] > 0.0 && mw > 0.0)
                w[result.componentNames[i]] =
                    s.z[i] * result.componentMolarMass.at(result.componentNames[i]) / mw;
        return w;
    };
    std::map<std::string, std::pair<scalar, std::string>> unitCost; // EUR/kg, why
    {
        std::map<std::string, scalar> carried;     // kg/s of c in the chosen raw material
        for (const auto& rm : rawMats)
            for (const auto& [c, w] : massFractions(rm.stream))
                if (rm.massFlow * w > carried[c])
                {
                    carried[c] = rm.massFlow * w;
                    unitCost[c] = { rm.price, "the purchase price of raw material "
                                              + rm.stream };
                }
    }
    auto costOf = [&](const std::string& c) -> std::pair<scalar, std::string>
    {
        auto it = unitCost.find(c);
        if (it != unitCost.end()) return it->second;
        return { cProd, "the cost of manufacture per kg of product (COM_d /"
                        " annual product mass)" };
    };
    auto valueOf = [&](const ItemInventory& inv)
    {
        scalar v = 0.0;
        for (const auto& [c, kg] : inv.massOf()) v += kg * costOf(c).first;
        return v;
    };

    std::map<std::string, bool> isRaw, isProd;
    for (const auto& rm : rawMats)  isRaw[rm.stream]  = true;
    for (const auto& p  : products) isProd[p.stream] = true;

    scalar rmTank = 0.0, procInv = 0.0, prodStock = 0.0;
    std::map<std::string, bool> rawHasTank;
    std::size_t nProc = 0, nProdTanks = 0, nRawTanks = 0;
    for (const auto& [id, sz] : result.sizings)
    {
        if (!sz.inventory.present()) continue;
        const scalar v = valueOf(sz.inventory);
        if (!sz.stream.empty() && isProd.count(sz.stream))
        { prodStock += v; ++nProdTanks; }
        else if (!sz.stream.empty() && isRaw.count(sz.stream))
        { rmTank += v; rawHasTank[sz.stream] = true; ++nRawTanks; }
        else
        { procInv += v; ++nProc; }
    }
    scalar rmDays = 0.0;
    for (const auto& rm : rawMats)
        if (!rawHasTank.count(rm.stream))
            rmDays += dRM / 365.0 * rm.price * rm.massFlow * 3600.0 * H;

    WorkingCapitalBuildUp b;
    b.present = true;
    b.productionCostPerKg = cProd;
    b.assets.push_back({ "rawMaterialStock", "raw-material stock",
        rmTank + rmDays,
        std::to_string(nRawTanks) + " raw-material tank(s) at the purchase"
        " price + " + fmt(dRM, 1) + " day/365 x the purchases of every raw"
        " material with no tank" });
    b.assets.push_back({ "processInventory", "process inventory (held in equipment)",
        procInv,
        "the held inventory of " + std::to_string(nProc) + " item(s), each"
        " component at its unit cost" });
    b.assets.push_back({ "productStock", "product stock (in storage)",
        prodStock,
        "the held inventory of " + std::to_string(nProdTanks) + " product"
        " tank(s), each component at its unit cost" });
    b.assets.push_back({ "receivables", "receivables (customers)",
        dRec / 365.0 * R,
        fmt(dRec, 1) + " day/365 x revenue R" });
    b.assets.push_back({ "minimumCash", "minimum cash",
        dCash / 365.0 * COM_d,
        fmt(dCash, 1) + " day/365 x COM_d (the cash cost of manufacture)" });
    b.liabilities.push_back({ "payables", "payables (suppliers)",
        dPay / 365.0 * C_RM,
        fmt(dPay, 1) + " day/365 x the raw-material bill C_RM" });
    for (const auto& a : b.assets)      b.gross += a.value;
    scalar liab = 0.0;
    for (const auto& l : b.liabilities) liab += l.value;
    b.net = b.gross - liab;

    //  The unit costs, printed per component held, so the valuation is
    //  something a reader can redo.  Printed for the base appraisal only: a
    //  sensitivity re-appraisal (C68) builds the same lines again, silently.
    if (!verbose) return b;
    std::set<std::string> held;
    for (const auto& [id, sz] : result.sizings)
        for (const auto& [c, kg] : sz.inventory.massOf()) held.insert(c);
    std::cout << "\n  -- What the held material is worth (at COST, never at"
                 " the sales price) --\n";
    for (const auto& c : held)
    {
        const auto uc = costOf(c);
        std::cout << "    " << std::left << std::setw(8) << c << std::right
                  << std::setw(12) << fmt(uc.first, 4) << " EUR/kg  -- "
                  << uc.second << "\n";
    }
    return b;
}

// Format a NaN-safe number for the CSV (so "never recovers" reads as an empty
// cell, never the literal "nan" which a spreadsheet imports as text).
std::string csvNum(scalar v, int decimals)
{
    if (!std::isfinite(v)) return "";
    std::ostringstream os;
    os << std::fixed << std::setprecision(decimals) << v;
    return os.str();
}

// -------------------------------------------------------------------------
//  Write the year-by-year DCF table to a CSV --- one row per year, then a
//  footer block with the headline scalars + the AACE accuracy band.  Lands at
//  reports/economics/cashFlow.csv (the pass runs with CWD == case dir).
// -------------------------------------------------------------------------
void writeCashFlowCsv(const EconomicsSummary& e)
{
    const fs::path dir = fs::path("reports") / "economics";
    fs::create_directories(dir);
    const fs::path path = dir / "cashFlow.csv";
    std::ofstream f(path);
    if (!f.is_open())
        throw std::runtime_error("EconomicsPass: cannot open " + path.string()
            + " for the cash-flow spreadsheet");

    const std::string cur = e.currency;
    f << "# Discounted-cash-flow appraisal (Perry / Turton Ch.10), currency "
      << cur << "\n";
    f << "# AACE Class-" << e.estimateClass << " estimate -- accuracy band "
      << std::fixed << std::setprecision(0) << e.accLo << "% / +" << e.accHi
      << "%\n";
    //  THE START-UP YEARS (C63): two columns more, and only when the case
    //  declared a timeline beyond the one-year, full-production shape -- so
    //  every other case writes this file byte-for-byte as before.
    const bool ext = e.timelineExtended;
    if (ext)
        f << "# year <= 0: construction (capital at the END of each year);"
             " year 0 = end of construction = start-up, where the WC is"
             " invested; years 1.." << e.projectLife << ": operation\n";
    //  THE LAND (C82): a column of its own, and only when declared.
    const bool hasLand = e.landPresent;
    const bool hasRoyalty = e.royaltyPresent;
    f << "year,investment_" << cur;
    if (hasLand) f << ",land_" << cur;
    if (ext) f << ",productionFraction";
    f << ",revenue_"        << cur
      << ",operatingCost_"  << cur;
    if (hasRoyalty) f << ",royalty_" << cur;
    if (ext) f << ",startupCost_" << cur;
    f << ",depreciation_"   << cur
      << ",taxableIncome_"  << cur
      << ",tax_"            << cur
      << ",afterTaxProfit_" << cur
      << ",cashFlow_"       << cur
      << ",discountFactor"
      << ",discountedCF_"   << cur
      << ",cumulativeDCF_"  << cur << "\n";

    for (const auto& r : e.cashFlow)
    {
        f << r.year
          << "," << csvNum(r.investment,     0);
        if (hasLand) f << "," << csvNum(r.land, 0);
        if (ext) f << "," << csvNum(r.productionFraction, 4);
        f << "," << csvNum(r.revenue,        0)
          << "," << csvNum(r.operatingCost,  0);
        if (hasRoyalty) f << "," << csvNum(r.royalty, 0);
        if (ext) f << "," << csvNum(r.startupCost, 0);
        f << "," << csvNum(r.depreciation,   0)
          << "," << csvNum(r.taxableIncome,  0)
          << "," << csvNum(r.tax,            0)
          << "," << csvNum(r.afterTaxProfit, 0)
          << "," << csvNum(r.cashFlow,       0)
          << "," << csvNum(r.discountFactor, 4)
          << "," << csvNum(r.discountedCF,   0)
          << "," << csvNum(r.cumulativeDCF,  0) << "\n";
    }

    // Footer block --- the headline appraisal, one metric per line.
    f << "\n# --- summary ---\n";
    f << "FCI,"          << csvNum(e.FCI,   0) << "\n";
    f << "WC,"           << csvNum(e.WC,    0) << "\n";
    f << "TCI,"          << csvNum(e.TCI,   0) << "\n";
    if (hasLand)
    {
        f << "land,"              << csvNum(e.landCost,  0) << "\n";
        f << "landPrice_per_m2,"  << csvNum(e.landPrice, 6) << "\n";
        f << "landArea_m2,"       << csvNum(e.landArea,  3) << "\n";
        f << "landAreaFrom,"      << e.landAreaFrom << "\n";
        f << "landInvestedAtYear," << e.landInvestedAtYear << "\n";
        f << "landRecoveredAtYear," << e.landRecoveredAtYear << "\n";
    }
    //  E4/E5: the building, the royalty, the break-even and the working-capital
    //  methods, as `key,value` lines -- present only when the case declares
    //  them, so every other case writes this file as it did.
    for (const auto& kv : e.extensions) f << kv.first << "," << kv.second << "\n";
    f << "COM_d,"        << csvNum(e.COM_d, 0) << "\n";
    f << "revenue,"      << csvNum(e.revenue, 0) << "\n";
    f << "NPV,"          << csvNum(e.NPV,   0) << "\n";
    if (ext)
    {
        f << "NPV_atStartOfConstruction," << csvNum(e.NPV_projectStart, 0) << "\n";
        f << "constructionPeriod_yr," << e.constructionPeriod << "\n";
        f << "capitalSchedule";
        for (const auto x : e.capitalSchedule) f << "," << csvNum(x, 6);
        f << "\n";
        f << "rampUp";
        for (const auto x : e.rampUp) f << "," << csvNum(x, 6);
        f << "\n";
        f << "startupCostFraction," << csvNum(e.startupCostFraction, 6) << "\n";
        f << "startupCost,"         << csvNum(e.startupCost, 0) << "\n";
    }
    f << "IRR_pct,"      << (e.haveIRR ? csvNum(100.0 * e.IRR, 2) : "") << "\n";
    f << "discountedPayback_yr," << csvNum(e.discPayback,   2) << "\n";
    f << "simplePayback_yr,"     << csvNum(e.simplePayback, 2) << "\n";
    f << "discountRate_pct,"     << csvNum(100.0 * e.discountRate, 2) << "\n";
    f << "taxRate_pct,"          << csvNum(100.0 * e.taxRate,      2) << "\n";
    f << "AACE_class,"           << e.estimateClass << "\n";
    f << "accuracyBand_pct,"     << csvNum(e.accLo, 0) << "," << csvNum(e.accHi, 0)
      << "\n";
    f.close();

    std::cout << "  [economics] cash-flow spreadsheet -> " << path.string()
              << "\n";
}

// -------------------------------------------------------------------------
//  The working-capital build-up (C44 slice 4) -> reports/economics/
//  workingCapital.csv: one row per line, then gross, net and the fraction
//  rule it replaced.  Written only when the model is declared.
// -------------------------------------------------------------------------
void writeWorkingCapitalCsv(const EconomicsSummary& e)
{
    const fs::path dir = fs::path("reports") / "economics";
    fs::create_directories(dir);
    const fs::path path = dir / "workingCapital.csv";
    std::ofstream f(path);
    if (!f.is_open())
        throw std::runtime_error("EconomicsPass: cannot open " + path.string());
    const auto& w = e.workingCapital;
    f << "# Working capital built up from what the plant holds and owes, " << e.currency << "\n";
    f << "side,key,value_" << e.currency << ",rule\n";
    auto q = [](const std::string& s) { return "\"" + s + "\""; };
    for (const auto& a : w.assets)
        f << "asset," << a.key << "," << csvNum(a.value, 2) << "," << q(a.rule) << "\n";
    for (const auto& l : w.liabilities)
        f << "liability," << l.key << "," << csvNum(l.value, 2) << "," << q(l.rule) << "\n";
    f << "total,gross," << csvNum(w.gross, 2) << "," << q("sum of the assets (capital circulante)") << "\n";
    f << "total,net," << csvNum(w.net, 2) << "," << q("gross - liabilities (fundo de maneio); the WC of the cash flow") << "\n";
    f << "comparison,fractionRule," << csvNum(w.fractionRule, 2) << ","
      << q(csvNum(w.fractionUsed, 2) + " x FCI") << "\n";
    f << "comparison,productionCostPerKg," << csvNum(w.productionCostPerKg, 6)
      << "," << q("COM_d / annual product mass, EUR/kg") << "\n";
    f.close();
    std::cout << "  [economics] working-capital build-up -> " << path.string() << "\n";
}

// -------------------------------------------------------------------------
//  THE LOAN AND THE EQUITY CASH FLOW (G4) -> reports/economics/financing.csv,
//  written only when the case declares `financing {}`.  cashFlow.csv stays
//  the PROJECT's cash flow, byte for byte what it is without a loan: the
//  equity view is a second file, never a rewrite of the first.
// -------------------------------------------------------------------------
void writeFinancingCsv(const EconomicsSummary& e)
{
    const fs::path dir = fs::path("reports") / "economics";
    fs::create_directories(dir);
    const fs::path path = dir / "financing.csv";
    std::ofstream f(path);
    if (!f.is_open())
        throw std::runtime_error("EconomicsPass: cannot open " + path.string());
    const std::string cur = e.currency;
    f << "# The loan and the EQUITY (levered) cash flow, currency " << cur << "\n";
    f << "# The PROJECT (unlevered) appraisal is cashFlow.csv, unchanged by the"
         " loan: the project's merit does not depend on how it is financed.\n";
    f << "# construction (t <= 0): draws; interest CAPITALISED into the balance."
         "  operation: interest paid and deducted; the capitalised interest"
         " depreciated with the plant; principal repaid after the grace years.\n";
    f << "# equity cash flow = project cash flow + draw - (interestPaid +"
         " idcDepreciation) x (1 - tau) + idcDepreciation - principal\n";
    f << "year,draw_" << cur << ",interestCapitalised_" << cur
      << ",interestPaid_" << cur << ",principal_" << cur
      << ",balance_" << cur << ",idcDepreciation_" << cur
      << ",taxableIncome_" << cur << ",tax_" << cur
      << ",equityCashFlow_" << cur << ",discountFactor"
      << ",discountedCF_" << cur << ",cumulativeDCF_" << cur << "\n";
    for (const auto& y : e.loanSchedule)
        f << y.year
          << "," << csvNum(y.draw, 2)
          << "," << csvNum(y.interestCapitalised, 2)
          << "," << csvNum(y.interestPaid, 2)
          << "," << csvNum(y.principal, 2)
          << "," << csvNum(y.balance, 2)
          << "," << csvNum(y.idcDepreciation, 2)
          << "," << csvNum(y.taxableIncome, 2)
          << "," << csvNum(y.tax, 2)
          << "," << csvNum(y.cashFlow, 2)
          << "," << csvNum(y.discountFactor, 6)
          << "," << csvNum(y.discountedCF, 2)
          << "," << csvNum(y.cumulativeDCF, 2) << "\n";
    f << "\n# --- summary ---\n";
    f << "debtFraction,"       << csvNum(e.debtFraction, 6) << "\n";
    f << "basis,"              << e.debtBasis << "\n";
    f << "rate,"               << csvNum(e.debtRate, 6) << "\n";
    f << "graceYears,"         << e.graceYears << "\n";
    f << "termYears,"          << e.termYears << "\n";
    f << "repayment,"          << e.repayment << "\n";
    f << "equityDiscountRate," << csvNum(e.equityDiscountRate, 6)
      << "," << (e.equityDiscountRateDeclared ? "declared" : "projectRate") << "\n";
    f << "taxRate,"            << csvNum(e.taxRate, 6) << "\n";
    f << "loanDrawn,"          << csvNum(e.loanDrawn, 2) << "\n";
    f << "interestDuringConstruction," << csvNum(e.interestDuringConstruction, 2) << "\n";
    f << "loanAtStartup,"      << csvNum(e.loanAtStartup, 2) << "\n";
    f << "interestPaidTotal,"  << csvNum(e.interestPaidTotal, 2) << "\n";
    f << "equityInvested,"     << csvNum(e.equityInvested, 2) << "\n";
    f << "equityNPV,"          << csvNum(e.equityNPV, 2) << "\n";
    f << "equityIRR_pct,"      << (e.haveEquityIRR ? csvNum(100.0 * e.equityIRR, 4) : "") << "\n";
    f << "equityDiscountedPayback_yr," << csvNum(e.equityDiscPayback, 4) << "\n";
    f << "projectNPV,"         << csvNum(e.NPV, 2) << "\n";
    f << "projectIRR_pct,"     << (e.haveIRR ? csvNum(100.0 * e.IRR, 4) : "") << "\n";
    f.close();
    std::cout << "  [economics] loan and equity cash flow -> " << path.string() << "\n";
}

// -------------------------------------------------------------------------
//  Write the same DCF table to a coloured .ods --- a Perry / Turton appraisal
//  sheet.  Title; Header-styled column row; one numberCell row per year (the
//  payback year, where the cumulative DCF first turns positive, flagged Good);
//  a totals / summary block; the AACE accuracy banner.  Lands at
//  reports/economics/cashFlow.ods.
// -------------------------------------------------------------------------
void writeCashFlowOds(const EconomicsSummary& e)
{
    const fs::path dir = fs::path("reports") / "economics";
    fs::create_directories(dir);
    const fs::path path = dir / "cashFlow.ods";

    const std::string cur = e.currency;

    OdsWriter ods;
    ods.beginSheet("Cash Flow (DCF)");

    // -- Title + AACE banner -------------------------------------------------
    ods.newRow();
    ods.textCell("Discounted cash-flow appraisal (Perry / Turton Ch.10)  ["
                 + cur + "]", OdsWriter::Title);
    ods.newRow();
    {
        std::ostringstream banner;
        banner << "AACE Class-" << e.estimateClass
               << " estimate  --  accuracy band " << std::fixed
               << std::setprecision(0) << e.accLo << "% / +" << e.accHi << "%";
        ods.textCell(banner.str(), OdsWriter::Bad);   // amber-red caution band
    }

    // -- Column header row ---------------------------------------------------
    ods.newRow();
    ods.textCell("Year",                       OdsWriter::Header);
    ods.textCell("Fixed+Working Capital",      OdsWriter::Header);
    if (e.landPresent)
        ods.textCell("Land",                   OdsWriter::Header);
    if (e.timelineExtended)
        ods.textCell("Production fraction",    OdsWriter::Header);
    ods.textCell("Revenue",                    OdsWriter::Header);
    ods.textCell("OPEX (COM_d)",               OdsWriter::Header);
    if (e.royaltyPresent)
        ods.textCell("Royalty",                OdsWriter::Header);
    if (e.timelineExtended)
        ods.textCell("Start-up cost",          OdsWriter::Header);
    ods.textCell("Depreciation",               OdsWriter::Header);
    ods.textCell("Taxable income",             OdsWriter::Header);
    ods.textCell("Tax",                        OdsWriter::Header);
    ods.textCell("After-tax profit",           OdsWriter::Header);
    ods.textCell("Cash flow",                  OdsWriter::Header);
    ods.textCell("Discount factor",            OdsWriter::Header);
    ods.textCell("Discounted CF",              OdsWriter::Header);
    ods.textCell("Cumulative DCF",             OdsWriter::Header);

    // -- One row per year; flag the payback year (first cumulative DCF >= 0).-
    bool paybackFlagged = false;
    for (const auto& r : e.cashFlow)
    {
        // The payback year is the FIRST operating year whose cumulative
        // discounted cash flow first turns non-negative (capital recovered).
        const bool isPayback = (!paybackFlagged && r.year > 0
                                && r.cumulativeDCF >= 0.0);
        const OdsWriter::Style rowSt = isPayback ? OdsWriter::Good
                                                 : OdsWriter::Plain;
        if (isPayback) paybackFlagged = true;

        ods.newRow();
        ods.numberCell(r.year,            0, rowSt);
        ods.numberCell(r.investment,      0, rowSt);
        if (e.landPresent)
            ods.numberCell(r.land,        0, rowSt);
        if (e.timelineExtended)
            ods.numberCell(r.productionFraction, 4, rowSt);
        ods.numberCell(r.revenue,         0, rowSt);
        ods.numberCell(r.operatingCost,   0, rowSt);
        if (e.royaltyPresent)
            ods.numberCell(r.royalty,     0, rowSt);
        if (e.timelineExtended)
            ods.numberCell(r.startupCost, 0, rowSt);
        ods.numberCell(r.depreciation,    0, rowSt);
        ods.numberCell(r.taxableIncome,   0, rowSt);
        ods.numberCell(r.tax,             0, rowSt);
        ods.numberCell(r.afterTaxProfit,  0, rowSt);
        ods.numberCell(r.cashFlow,        0, rowSt);
        ods.numberCell(r.discountFactor,  4, rowSt);
        ods.numberCell(r.discountedCF,    0, rowSt);
        ods.numberCell(r.cumulativeDCF,   0, rowSt);
    }

    // -- Summary block -------------------------------------------------------
    ods.newRow();   // spacer
    ods.newRow();
    ods.textCell("Appraisal summary  [" + cur + "]", OdsWriter::Title);

    auto metric = [&](const std::string& label, scalar v, int dec, bool ok)
    {
        ods.newRow();
        ods.textCell(label, OdsWriter::Bold);
        if (std::isfinite(v))
            ods.numberCell(v, dec, ok ? OdsWriter::Good : OdsWriter::Plain);
        else
            ods.textCell("n/a", OdsWriter::Bad);
    };

    metric("Fixed capital investment (FCI)", e.FCI, 0, false);
    metric("Working capital (WC)",           e.WC,  0, false);
    metric("Total capital investment (TCI)", e.TCI, 0, false);
    if (e.landPresent)
        metric("Land (not in TCI; recovered at end of life)", e.landCost, 0, false);
    metric("Cost of manufacture (COM_d)/yr", e.COM_d,   0, false);
    metric("Annual revenue (R)",             e.revenue, 0, false);
    metric("NPV @ " + csvNum(100.0 * e.discountRate, 1) + "%",
           e.NPV, 0, e.NPV > 0.0);
    if (e.timelineExtended)
    {
        metric("NPV at the start of construction", e.NPV_projectStart, 0,
               e.NPV_projectStart > 0.0);
        metric("Construction period [yr]", e.constructionPeriod, 0, false);
        metric("Start-up cost (year 1)", e.startupCost, 0, false);
    }
    metric("IRR [%]", e.haveIRR ? 100.0 * e.IRR : std::nan(""), 2,
           e.haveIRR);
    metric("Discounted payback [yr]", e.discPayback,   2,
           std::isfinite(e.discPayback));
    metric("Simple payback [yr]",     e.simplePayback, 2,
           std::isfinite(e.simplePayback));

    if (e.irrAmbiguous)
    {
        ods.newRow();
        ods.textCell("!! Multiple-IRR guard: cumulative cash flow changes sign "
                     "more than once -- IRR may be non-unique; USE NPV.",
                     OdsWriter::Bad);
    }

    //  THE EQUITY VIEW (G4), a second sheet, only when a loan is declared;
    //  the first sheet stays the PROJECT's appraisal.
    if (e.financingPresent)
    {
        ods.beginSheet("Financing (equity)");
        ods.newRow();
        ods.textCell("The loan and the EQUITY cash flow  [" + cur + "]  -- the"
                     " project appraisal (first sheet) is unchanged", OdsWriter::Title);
        ods.newRow();
        for (const char* h : { "Year", "Draw", "Interest capitalised",
                               "Interest paid", "Principal", "Balance (end)",
                               "IDC depreciation", "Taxable income", "Tax",
                               "Equity cash flow", "Discount factor",
                               "Discounted CF", "Cumulative DCF" })
            ods.textCell(h, OdsWriter::Header);
        for (const auto& y : e.loanSchedule)
        {
            ods.newRow();
            ods.numberCell(y.year, 0);
            ods.numberCell(y.draw, 0);
            ods.numberCell(y.interestCapitalised, 0);
            ods.numberCell(y.interestPaid, 0);
            ods.numberCell(y.principal, 0);
            ods.numberCell(y.balance, 0);
            ods.numberCell(y.idcDepreciation, 0);
            ods.numberCell(y.taxableIncome, 0);
            ods.numberCell(y.tax, 0);
            ods.numberCell(y.cashFlow, 0);
            ods.numberCell(y.discountFactor, 4);
            ods.numberCell(y.discountedCF, 0);
            ods.numberCell(y.cumulativeDCF, 0);
        }
        ods.newRow();
        ods.newRow();
        metric("Loan drawn", e.loanDrawn, 0, false);
        metric("Interest during construction (capitalised)", e.interestDuringConstruction, 0, false);
        metric("Loan at start-up", e.loanAtStartup, 0, false);
        metric("Equity invested", e.equityInvested, 0, false);
        metric("Equity NPV @ " + csvNum(100.0 * e.equityDiscountRate, 1) + "%",
               e.equityNPV, 0, e.equityNPV > 0.0);
        metric("Equity IRR [%]", e.haveEquityIRR ? 100.0 * e.equityIRR : std::nan(""), 2,
               e.haveEquityIRR);
        metric("Equity discounted payback [yr]", e.equityDiscPayback, 2,
               std::isfinite(e.equityDiscPayback));
        metric("PROJECT NPV (the merit; first sheet)", e.NPV, 0, e.NPV > 0.0);
    }

    ods.save(path.string());

    std::cout << "  [economics] cash-flow spreadsheet -> " << path.string()
              << "  (" << ods.sheetCount() << (ods.sheetCount() == 1 ? " sheet" : " sheets")
              << ", coloured)\n";
}

//  A percentage as the standard prints it: no decimals, sign carried by the
//  value itself.  The band is a convention, not a measurement, and printing
//  it to two decimals would dress it as one.
std::string fmtPct(scalar v)
{
    std::ostringstream os;
    os << std::fixed << std::setprecision(0) << v;
    return os.str();
}

} // anonymous namespace

//  A POLICY CARRIED AS A FLOAT (2026-09-06).
//
//  `refuseOnMissingPrice` is not a magnitude.  It decides whether this pass
//  REFUSES when a price is absent or proceeds with zero revenue -- the
//  difference between an appraisal and a number -- and it was read as
//  `lookupScalarOrDefault("refuseOnMissingPrice", 1.0) != 0.0`: a DECISION
//  behind a comparison, with the default silent.  A case that never mentions
//  the key was refusing on the ENGINE's authority while its output read
//  exactly like a case whose author had chosen to.
//
//  Fixed here: the policy has one home and SAYS WHOSE IT IS when nobody
//  declared it.  A declared value announces nothing, so silence keeps
//  meaning "the author chose".
//
//  NOT fixed, and it is a policy question rather than an oversight: THE KEY
//  STAYS A NUMBER.  Six shipped postDicts write `refuseOnMissingPrice 1;`,
//  two case READMEs and `docs/tutorialsGuide-steady.tex` document `0` and
//  `1`, so spelling it as a word (`yes`/`no`) is a grammar change to authored
//  cases and to published prose.  RESERVED for Vitor.  So is the neighbouring
//  question this one raises: a value that is neither 0 nor 1 is silently read
//  as "refuse" today, and whether that should refuse by name is a decision
//  about the grammar, not about this pass.
namespace {

bool refuseOnMissingPriceOf(const DictPtr& d)
{
    if (d && d->found("refuseOnMissingPrice"))
        return d->lookupScalar("refuseOnMissingPrice") != 0.0;

    const std::string m =
        "refuseOnMissingPrice was NOT declared in the `economics {}` block:"
        " this appraisal REFUSES when a required price is absent, which is"
        " the engine's default policy and not a choice this case made."
        "  Declare `refuseOnMissingPrice 1;` to own the refusal, or `0;` to"
        " proceed with zero revenue and the gap announced.";

    if (AdvisoryLog::instance().add("assumed", "warning", "economics", m))
        std::cout << "  [assumed] economics: " << m << "\n";
    return true;
}

// =========================================================================
//  THE START-UP YEARS: A MULTI-YEAR CONSTRUCTION, A RAMP-UP AND A START-UP
//  COST (2026-10-11, DEV.md 4c C63).  Vitor: "Sabes se foi feita a analise
//  economica com anos de arranque e capital circulante e fundo de maneio?"
//
//  OPT-IN.  A case that declares none of the keys below, and
//  `constructionPeriod 1;` or no such key, computes, prints and writes
//  exactly what it did before (measured against a build of the parent
//  commit on every economics case in the corpus, not argued).
//
//      constructionPeriod  3;                 // whole years, >= 1
//      capitalSchedule     ( 0.3 0.5 0.2 );   // FCI fraction spent at the
//                                             // END of each construction
//                                             // year; must sum to 1
//      rampUp              ( 0.6 0.85 );      // production fraction of the
//                                             // first operating years; 1
//                                             // thereafter
//      startupCostFraction 0.08;              // start-up cost, x FCI
//
//  THE CONVENTION, AND WHERE IT WAS READ.  The capital half was read on
//  2026-10-11 from CAPCOST 2017 (`capcost_2017_rev2.xlsm`, sha256
//  2747f01f...f428e4), the program Turton, Shaeiwitz, Bhattacharyya &
//  Whiting distribute with "Analysis, Synthesis and Design of Chemical
//  Processes" (5th ed.) -- the same file `costing/Turton.cpp` reads its
//  coefficients from.  Its worksheet "COM Summary" asks for a "Construction
//  period" (C47) and a "Distribution of Fixed Capital Investment (must sum
//  to one)" by "End of year One ... Five" (B49:C54), and its worksheet
//  "Cash Flow Analysis" (B48:L63) lays the timeline out as:
//    * the FCI fraction of construction year k spent at the END of year k
//      and discounted as (1+i)^-k (rows 50-51);
//    * the working capital invested at the end of the LAST construction
//      year, the same instant as the last capital fraction (row 52);
//    * operation beginning the year after, for a "Project Life (Years after
//      Startup)" (C45) -- so `projectLife` here counts OPERATING years, as
//      it always did;
//    * depreciation starting in the first operating year (row 53);
//    * the working capital recovered, untaxed, at the end of the last
//      operating year (row 63).
//  The BOOK's chapter was NOT read; what is cited is the authors' program.
//
//  WHERE TIME ZERO IS -- the one place this differs from CAPCOST, and why.
//  CAPCOST's year 0 is the START of the project (before construction).
//  Choupo's year 0 has always been the END of construction -- the start-up
//  instant, where the whole FCI and the WC sat for its one construction
//  year -- and it STAYS there, so every one-year case is unchanged.  The
//  construction years are therefore years 1-N ... 0, and their outflows are
//  COMPOUNDED forward to start-up by the same factor 1/(1+i)^t, with t <= 0.
//  The IRR, both paybacks and the sign of the NPV do not depend on where
//  time zero is; the NPV itself is the CAPCOST one times (1+i)^N, and a
//  run with N > 1 prints both.
//
//  A CONSTRUCTION PERIOD ABOVE 1 WITH NO SCHEDULE REFUSES.  The schedule
//  moves the NPV by an amount of the same order as the construction delay
//  itself (front-loaded or back-loaded spending), and a uniform default
//  would be a policy nobody chose -- the rule `workingCapital {}` already
//  applies to its day counts.  The refusal names the remedy with CAPCOST's
//  own two-year example, (0.6 0.4).
//
//  THE RAMP-UP SCALES THE REVENUE AND THE VARIABLE COSTS, AND NOTHING ELSE.
//  COM_d as this file assembles it is a sum of three groups, each
//  proportional to one direct cost:  0.180 FCI  +  2.73 C_OL  +
//  1.23 (C_RM + C_UT + C_WT).  The first two do not change while a plant
//  learns to run at capacity (the equipment, its maintenance and its crew
//  are all there in year 1); the third is the material, utility and waste
//  bill, which follows the throughput.  So in an operating year at
//  production fraction p:
//      R_t     = p R
//      COM_d,t = 0.180 FCI + 2.73 C_OL + 1.23 p (C_RM + C_UT + C_WT)
//  The split is the equation's own structure, not one invented here: every
//  overhead the 1.23 carries rides on the variable group already.  What is
//  NOT modelled: a ramp-up that degrades yield or quality (p scales the
//  products and the raw materials alike), and a utility bill that is not
//  proportional to throughput.
//
//  THE WORKING CAPITAL DOES NOT FOLLOW THE RAMP-UP.  It is invested IN FULL
//  at the end of construction (CAPCOST's row 52), because the stocks, the
//  cash and the credit lines must be in place before the first product
//  ships, and recovered at the end of life as before.  Announced whenever a
//  ramp-up is declared, so a reader does not assume the opposite.
//
//  THE START-UP COST IS A FRACTION OF FCI, ON ITS OWN LINE, EXPENSED IN THE
//  FIRST OPERATING YEAR.  A fraction because that is how a start-up cost is
//  estimated at this stage (it scales with the plant, and a money amount
//  would not follow the FCI when a sweep moves the plant's size).  It is an
//  EXPENSE of year 1 -- commissioning, off-spec product, training -- so it
//  is deducted from that year's taxable income like COM_d, and it is not
//  depreciated.  NEITHER CHOICE WAS READ IN A BOOK: CAPCOST's cash-flow
//  sheet carries no start-up line at all.  Both are stated defaults of this
//  pass and are printed on the line itself.
// =========================================================================
struct DcfTimeline
{
    int                 constructionPeriod = 1;
    std::vector<scalar> capitalSchedule { 1.0 };   // sums to 1
    std::vector<scalar> rampUp;                    // first operating years
    scalar              startupCostFraction = 0.0;
    bool                scheduleDeclared   = false;
    bool                extended           = false; // anything beyond the old shape

    //  Production fraction of operating year t (t >= 1).
    scalar productionFraction(int t) const
    {
        return (t >= 1 && t <= static_cast<int>(rampUp.size()))
             ? rampUp[static_cast<std::size_t>(t - 1)] : 1.0;
    }
};

std::string fmtList(const std::vector<scalar>& v)
{
    std::ostringstream os;
    os << "(";
    for (const auto x : v) os << " " << x;
    os << " )";
    return os.str();
}

DcfTimeline readTimeline(const DictPtr& d, int projectLife)
{
    DcfTimeline tl;

    const scalar cp = d->lookupScalarOrDefault("constructionPeriod", 1.0);
    if (!(cp >= 1.0) || std::fabs(cp - std::round(cp)) > 1e-9)
    {
        std::ostringstream m;
        m << "economics: constructionPeriod " << cp << " is not a whole number"
             " of years >= 1.  The cash flow places each construction year's"
             " capital at the END of that year, so the period is counted in"
             " whole years: declare 1, 2, 3, ...";
        throw std::runtime_error(m.str());
    }
    tl.constructionPeriod = static_cast<int>(std::lround(cp));
    const int N = tl.constructionPeriod;

    if (d->found("capitalSchedule"))
    {
        tl.scheduleDeclared = true;
        tl.capitalSchedule  = d->lookupList("capitalSchedule");
        if (static_cast<int>(tl.capitalSchedule.size()) != N)
        {
            std::ostringstream m;
            m << "economics: capitalSchedule " << fmtList(tl.capitalSchedule)
              << " carries " << tl.capitalSchedule.size() << " fraction(s) and"
                 " constructionPeriod is " << N << ": declare exactly one FCI"
                 " fraction per construction year, spent at the END of that"
                 " year.";
            throw std::runtime_error(m.str());
        }
        scalar sum = 0.0;
        for (const auto f : tl.capitalSchedule)
        {
            if (!(f >= 0.0) || f > 1.0)
                throw std::runtime_error(
                    "economics: capitalSchedule " + fmtList(tl.capitalSchedule)
                    + " holds a fraction outside [0, 1]; each entry is the share"
                      " of the FCI spent in one construction year.");
            sum += f;
        }
        if (std::fabs(sum - 1.0) > 1e-9)
        {
            std::ostringstream m;
            m << std::setprecision(12)
              << "economics: capitalSchedule " << fmtList(tl.capitalSchedule)
              << " sums to " << sum << ", not 1.  The schedule distributes"
                 " the WHOLE fixed capital investment over the construction"
                 " years; a sum below 1 would leave capital unspent and one"
                 " above 1 would spend more than the FCI the costing priced.";
            throw std::runtime_error(m.str());
        }
    }
    else if (N > 1)
    {
        std::ostringstream m;
        m << "economics: constructionPeriod is " << N << " and no"
             " capitalSchedule is declared.  How the fixed capital is spent"
             " over the " << N << " years moves the NPV (spending late is"
             " cheaper in present value than spending early), and an even"
             " split would be a policy nobody chose.  Declare one FCI fraction"
             " per construction year, summing to 1, spent at the END of each"
             " year -- e.g. `capitalSchedule ( 0.6 0.4 );`, the two-year"
             " example of CAPCOST 2017, the costing program of Turton et al.";
        throw std::runtime_error(m.str());
    }

    if (d->found("rampUp"))
    {
        tl.rampUp = d->lookupList("rampUp");
        if (tl.rampUp.empty())
            throw std::runtime_error(
                "economics: rampUp ( ) is empty.  Declare the production"
                " fraction of each of the first operating years, e.g."
                " `rampUp ( 0.6 0.85 );`, or delete the key for full production"
                " from year 1.");
        if (static_cast<int>(tl.rampUp.size()) > projectLife)
        {
            std::ostringstream m;
            m << "economics: rampUp " << fmtList(tl.rampUp) << " lists "
              << tl.rampUp.size() << " operating years and projectLife is "
              << projectLife << ": a ramp-up longer than the plant's life is"
                 " a declaration error.";
            throw std::runtime_error(m.str());
        }
        for (const auto p : tl.rampUp)
            if (!(p >= 0.0) || p > 1.0)
                throw std::runtime_error(
                    "economics: rampUp " + fmtList(tl.rampUp) + " holds a"
                    " fraction outside [0, 1]; each entry is the share of the"
                    " design production reached in one operating year.");
    }

    if (d->found("startupCostFraction"))
    {
        tl.startupCostFraction = d->lookupScalar("startupCostFraction");
        if (!(tl.startupCostFraction >= 0.0))
        {
            std::ostringstream m;
            m << "economics: startupCostFraction " << tl.startupCostFraction
              << " is negative; it is the start-up cost as a fraction of the"
                 " FCI (e.g. 0.08).";
            throw std::runtime_error(m.str());
        }
    }

    tl.extended = (N > 1) || !tl.rampUp.empty()
               || d->found("startupCostFraction");
    return tl;
}

// =========================================================================
//  THE LAND (2026-10-17, DEV.md 4c C82).  Vitor: "o layout acaba por ser
//  importante para avaliar os m2 de implementacao e o custo do terreno".
//
//  OPT-IN.  A case that declares no `land` block computes, prints, publishes
//  and writes exactly what it did (measured on every economics case of the
//  corpus against a build of the parent commit, not argued).
//
//      land
//      {
//          price   30;         // currency per m2 (the costing's), a bare
//                              // number or `[0 -2 0 0 0] 30`
//          source  "...";      // where the price comes from
//          reason  "...";      // why it is the right one for this plant
//          // area 25000 m2;   // ONLY where the run publishes no plot area
//      }
//
//  THE AREA HAS ONE HOME.  Where the case declares a plot plan, the area is
//  the layout's published plot area (`layout.plot`, PlantLayout.cpp
//  `plotOf`), and an `area` declared here beside it is REFUSED -- two homes
//  for one number.  Where the run publishes no plot area, `area` must be
//  declared; with neither, the land REFUSES by name.  Under an outer driver
//  the layout is checked AFTER the post-processing chain, so a land block
//  there needs its declared `area` (the refusal says so).
//
//  WHERE THE LAND SITS IN THE CASH FLOW, and where it was read.  The land is
//  bought at the START of construction and recovered at the END of the
//  project at its purchase value; it is NOT depreciated, and its recovery is
//  untaxed (no gain is assumed, so none is taxed; no appreciation is
//  modelled).  Read on 2026-10-17 in CAPCOST 2017 (`capcost_2017_rev2.xlsm`,
//  the same file, sha256 2747f01f...f428e4, `readTimeline` cites): 'COM
//  Summary'!B15:C15 is the "Cost of Land" (`costLand`); 'Cash Flow
//  Analysis'!C49 places it at year 0, the START of the project, before the
//  first construction year's capital (C50 = FCI x the year-1 fraction);
//  and 'Cash Flow Analysis'!I63 recovers it at the end of the project life
//  together with the working capital, `=workingCapital/10^6 +
//  costLand/10^6`, outside the taxed line.  CAPCOST's year 0 is Choupo's
//  t = -constructionPeriod (Choupo's year 0 is the END of construction,
//  `readTimeline`), so a land price adds ONE row to the timeline, t = -Nc.
//  The BOOK's chapter was not read.
//
//  NOT IN TCI.  TCI stays FCI + WC as Turton's ladder defines it here; the
//  land is a third capital line printed beside it, with its own dates.
// =========================================================================
struct LandDeclaration
{
    bool        present = false;
    scalar      price   = 0.0;     // currency per m2
    scalar      area    = 0.0;     // m2
    std::string areaFrom;          // layoutPlot | declared
    std::string source, reason;

    std::string areaSentence() const
    {
        return areaFrom == "layoutPlot"
            ? std::string("the layout's published plot area")
            : std::string("declared in the land block -- the run publishes no plot area");
    }
};

LandDeclaration readLand(const DictPtr& econ, const SimulationResult& result)
{
    LandDeclaration L;
    if (!econ->found("land")) return L;
    const std::string where = "economics { land { ... } }";
    if (!std::holds_alternative<DictPtr>(econ->entryValue("land")))
        throw std::runtime_error("economics: `land` must be a block -- `land {"
            " price <currency per m2>; source \"...\"; reason \"...\"; }`.");
    const DictPtr d = econ->subDict("land");

    if (!d->found("price"))
        throw std::runtime_error(where + ": `price` is not declared -- the"
            " price of the land in the costing's currency per m2 (`price 30;`"
            " or `price [0 -2 0 0 0] 30;`).  No price is defaulted.");
    L.price = d->lookupScalar("price", Dimensions(0, -2, 0, 0, 0));
    if (!(L.price >= 0.0))
    {
        std::ostringstream m;
        m << where << ": `price " << L.price << ";` -- a land price cannot be"
             " negative.";
        throw std::runtime_error(m.str());
    }
    for (const char* key : { "source", "reason" })
    {
        if (!d->found(key) || d->lookupWord(key).empty())
            throw std::runtime_error(where + ": `" + key + " \"...\";` is not"
                " declared -- a land price is an assumption the case owes its"
                " reader: where it comes from (`source`) and why it is this"
                " plant's (`reason`).");
    }
    L.source = d->lookupWord("source");
    L.reason = d->lookupWord("reason");

    const bool plotPublished = result.layout.plot.present;
    if (d->found("area"))
    {
        if (plotPublished)
        {
            std::ostringstream m;
            m << where << ": `area` is declared, and this run's layout"
                 " publishes the plot area (" << result.layout.plot.plotArea
              << " m2, system/layoutDict) -- one plot, one area.  Delete"
                 " `area`; the land is priced on the plot the layout"
                 " publishes (its margin is `plot { margin; }` in"
                 " system/layoutDict).";
            throw std::runtime_error(m.str());
        }
        L.area = d->lookupScalar("area", Dims::area);
        if (!(L.area > 0.0))
            throw std::runtime_error(where + ": `area` must be a positive"
                " area (`area 25000 m2;`).");
        L.areaFrom = "declared";
    }
    else if (plotPublished)
    {
        L.area     = result.layout.plot.plotArea;
        L.areaFrom = "layoutPlot";
    }
    else
        throw std::runtime_error(where + ": a land price is declared and this"
            " run has no plot area to price -- the case declares no"
            " system/layoutDict, or (under an outer driver) the layout is"
            " checked only after the post-processing chain.  Declare a plot"
            " plan (system/layoutDict) and its area is used, or declare"
            " `area <m2>;` in the land block.  No area is invented.");
    L.present = true;
    return L;
}

// =========================================================================
//  DEBT FINANCING: A LOAN, ITS INTEREST DURING CONSTRUCTION, AND THE EQUITY
//  VIEW (2026-10-20, DEV.md 4c C110 G4).  Students' projects finance part of
//  the investment with a bank loan, compute the interest during construction
//  ("juros intercalares") and repay the loan in the cash flow; this pass was
//  unlevered and had no debt.
//
//  OPT-IN.  A case that declares no `financing` block computes, prints,
//  publishes and writes exactly what it did (measured on every economics
//  case of the corpus against a build of the parent commit, not argued).
//
//      financing
//      {
//          debtFraction  0.5;           // share of the financed capital lent
//          basis         fixedCapital;  // fixedCapital (FCI) | totalCapital (FCI + WC)
//          rate          0.06;          // annual interest on the balance
//          graceYears    2;             // operating years paying interest only
//          termYears     8;             // repayment years AFTER the grace
//          repayment     annuity;       // annuity | linear
//          source        "...";         // where the terms come from
//          reason        "...";         // why they are this project's
//          // equityDiscountRate 0.12;  // optional; absent = discountRate, ANNOUNCED
//      }
//
//  THE PROJECT'S MERIT DOES NOT DEPEND ON HOW IT IS FINANCED.  The NPV, IRR
//  and paybacks this pass always published are UNLEVERED -- the plant's
//  cash flow, whoever supplies the capital -- and they stay exactly what they
//  were, in the same KPIs, files and lines.  The financing adds a SECOND
//  view beside them, the EQUITY (levered) one: what the owners put in and
//  get back once a lender has been paid.  It never replaces the first, and
//  the printed table says so.  A plant that destroys value cannot be made
//  good by borrowing at a rate below its return; the equity view only shows
//  how the same value is split between owners and lender, plus the tax
//  shield the interest buys.
//
//  STATED DEFAULTS (the grammar requires every key that moves the answer;
//  what follows is the convention, said on the printed lines):
//    * THE DRAWS FOLLOW THE CAPITAL SCHEDULE (C63).  The loan lends
//      `debtFraction` of each capital outlay it finances, at the instant the
//      outlay is made: the FCI fraction of construction year k at the END of
//      that year (t = k - Nc), and, with `basis totalCapital`, the working
//      capital at t = 0.  The land (C82) is never financed by this loan.
//    * INTEREST DURING CONSTRUCTION IS CAPITALISED: in each construction year
//      the interest r B on the balance already drawn is ADDED to the balance;
//      no cash moves.  So the loan at start-up is the draws compounded to
//      t = 0, and a ONE-year construction, which spends its whole capital at
//      its END (t = 0), accrues none -- the timeline's own convention, said
//      on the line when it happens.
//    * THE CAPITALISED INTEREST IS DEPRECIATED WITH THE PLANT, straight line
//      over `depreciableLife` from operating year 1, in the equity view only
//      (IAS 23 "Borrowing Costs" capitalises the borrowing costs of a
//      qualifying asset into its cost; NCRF 10 is the Portuguese standard of
//      the same name).  The tax law of a given country may differ.
//    * OPERATING YEARS: interest r B on the opening balance is PAID and
//      DEDUCTED from the taxable income; a loss offsets other income (the
//      pass's standing convention, C63).  Grace years pay interest only.
//      Then `termYears` repayments: `annuity` (a constant payment A = P r /
//      (1 - (1+r)^-n), principal = A - interest) or `linear` (a constant
//      principal P/n, the interest falling with the balance).  The last
//      repayment clears the balance exactly.  graceYears + termYears may not
//      exceed projectLife: a loan outliving the plant is refused, not
//      balloon-paid.
//    * THE EQUITY CASH FLOW is the project's, plus the draws (t <= 0), less
//      the interest after tax, plus the tax shield of the capitalised
//      interest's depreciation, less the principal; the end-of-life
//      recoveries (WC, salvage, land) are the project's.  It is discounted at
//      `equityDiscountRate`, default the project's `discountRate` --
//      ANNOUNCED, because the owners of a levered project carry more risk
//      and usually ask more (a reader comparing the two NPVs at one rate
//      must know it).
// =========================================================================
struct FinancingDeclaration
{
    bool        present       = false;
    scalar      debtFraction  = 0.0;
    std::string basis;                  // fixedCapital | totalCapital
    scalar      rate          = 0.0;
    int         graceYears    = 0;
    int         termYears     = 0;
    std::string repayment;              // annuity | linear
    scalar      equityDiscountRate = 0.0;
    bool        equityRateDeclared = false;
    std::string source, reason;
};

FinancingDeclaration readFinancing(const DictPtr& econ, int projectLife,
                                   scalar discountRate)
{
    FinancingDeclaration F;
    if (!econ->found("financing")) return F;
    const std::string where = "economics { financing { ... } }";
    if (!std::holds_alternative<DictPtr>(econ->entryValue("financing")))
        throw std::runtime_error("economics: `financing` must be a block --"
            " `financing { debtFraction 0.5; basis fixedCapital; rate 0.06;"
            " graceYears 2; termYears 8; repayment annuity; source \"...\";"
            " reason \"...\"; }`.");
    const DictPtr d = econ->subDict("financing");

    const std::vector<std::string> known
        { "debtFraction", "basis", "rate", "graceYears", "termYears",
          "repayment", "source", "reason", "equityDiscountRate" };
    for (const auto& k : d->keys())
        if (std::find(known.begin(), known.end(), k) == known.end())
            throw std::runtime_error("economics: "
                + registryRefusal::message("financing key", k, known, "Accepted"));
    for (const char* k : { "debtFraction", "basis", "rate", "graceYears",
                           "termYears", "repayment", "source", "reason" })
        if (!d->found(k))
            throw std::runtime_error(where + ": `" + k + "` is not declared."
                "  Every term of a loan moves the equity view, so none is"
                " defaulted: declare debtFraction, basis (fixedCapital |"
                " totalCapital), rate, graceYears, termYears, repayment"
                " (annuity | linear), source and reason.");

    F.debtFraction = d->lookupScalar("debtFraction");
    if (!(F.debtFraction > 0.0) || !(F.debtFraction < 1.0))
    {
        std::ostringstream m;
        m << where << ": `debtFraction " << F.debtFraction << ";` must lie"
             " strictly between 0 and 1 -- the share of the financed capital"
             " the loan lends.  0 is no loan (delete the block); 1 or more"
             " leaves the owners nothing invested, and an equity return on"
             " nothing has no meaning.";
        throw std::runtime_error(m.str());
    }
    F.basis = d->lookupWord("basis");
    if (F.basis != "fixedCapital" && F.basis != "totalCapital")
        throw std::runtime_error("economics: " + registryRefusal::message(
            "financing basis", F.basis, { "fixedCapital", "totalCapital" },
            "Accepted") + "  fixedCapital: the loan lends its share of the FCI"
            " as the capital schedule spends it; totalCapital: of the FCI and"
            " of the working capital invested at start-up.");
    F.rate = d->lookupScalar("rate");
    if (!(F.rate >= 0.0) || !(F.rate < 1.0))
    {
        std::ostringstream m;
        m << where << ": `rate " << F.rate << ";` is the annual interest as a"
             " FRACTION, in [0, 1) -- 6 % is `rate 0.06;`.";
        throw std::runtime_error(m.str());
    }
    auto wholeYears = [&](const char* key, int lo) -> int
    {
        const scalar v = d->lookupScalar(key);
        if (!(v >= lo) || std::fabs(v - std::round(v)) > 1e-9)
        {
            std::ostringstream m;
            m << where << ": `" << key << " " << v << ";` must be a whole number"
                 " of years >= " << lo << ".";
            throw std::runtime_error(m.str());
        }
        return static_cast<int>(std::lround(v));
    };
    F.graceYears = wholeYears("graceYears", 0);
    F.termYears  = wholeYears("termYears", 1);
    if (F.graceYears + F.termYears > projectLife)
    {
        std::ostringstream m;
        m << where << ": graceYears " << F.graceYears << " + termYears "
          << F.termYears << " = " << (F.graceYears + F.termYears)
          << " operating years, and projectLife is " << projectLife
          << ": the loan would outlive the plant.  A balance left at the end"
             " of the project is not modelled (no balloon payment); shorten"
             " the loan or lengthen the declared life.";
        throw std::runtime_error(m.str());
    }
    F.repayment = d->lookupWord("repayment");
    if (F.repayment != "annuity" && F.repayment != "linear")
        throw std::runtime_error("economics: " + registryRefusal::message(
            "financing repayment", F.repayment, { "annuity", "linear" },
            "Accepted") + "  annuity: a constant payment; linear: a constant"
            " principal.");
    for (const char* key : { "source", "reason" })
        if (d->lookupWord(key).empty())
            throw std::runtime_error(where + ": `" + key + " \"...\";` is"
                " empty -- the terms of a loan are an assumption the case owes"
                " its reader: where they come from (`source`) and why they are"
                " this project's (`reason`).");
    F.source = d->lookupWord("source");
    F.reason = d->lookupWord("reason");

    if (d->found("equityDiscountRate"))
    {
        F.equityDiscountRate = d->lookupScalar("equityDiscountRate");
        F.equityRateDeclared = true;
        if (!(F.equityDiscountRate > -1.0))
            throw std::runtime_error(where + ": `equityDiscountRate` at or"
                " below -100 % has no present value.");
    }
    else
    {
        F.equityDiscountRate = discountRate;
        std::ostringstream m;
        m << "equityDiscountRate was NOT declared in the `financing {}` block,"
             " so the EQUITY cash flow is discounted at the project's"
             " discountRate (" << discountRate << ").  The owners of a levered"
             " project carry more risk than the project and usually ask a"
             " higher return; declare `equityDiscountRate` to own it.";
        if (AdvisoryLog::instance().add("assumed", "warning", "economics", m.str()))
            std::cout << "  [assumed] economics: " << m.str() << "\n";
    }
    F.present = true;
    return F;
}

// =========================================================================
//  THE ECONOMIC EXTENSIONS OF THE PIF REPORTS (2026-11-04, DEV.md 4c C195
//  items E4 and E5; docs/reviews/2026-11-02-pif-reports-synthesis.md §3).
//  Of eighteen previous-year plant-design reports fourteen computed a
//  break-even, all took the working capital from whichever of three methods
//  suited, the royalty was charged after the patent had expired, and the
//  building cost varied fivefold.  Each of the four items below is OPT-IN:
//  a case that declares none of them computes, prints, publishes and writes
//  exactly what it did (measured on every economics case of the corpus), and
//  NO NUMBER IS SHIPPED -- every price, fraction and year is the case's own,
//  with a source and a reason.
//
//  E4  `buildings { price; gradePrice { A..CNC }; source; reason; }`
//      A building cost from the GMP interior's ROOM AREAS.
//          area_building = SUM of `room.area` over EVERY room the case's
//                          `building {}` declares, on every floor.
//      A room belongs to ONE floor, so a multi-floor building is the sum of
//      its floors' rooms; a double-height room counts its plan once; the
//      walls, corridors and stairwells the case does not list as rooms are
//      NOT counted, so the area is a LOWER bound, said on every run.  A
//      room is priced at its grade's price when `gradePrice` declares that
//      grade, else at `price`; a room whose grade has neither REFUSES by name
//      (a clean room does not cost what a warehouse costs, and the engine
//      will not pick the one that is cheaper).
//      WHERE IT SITS: the building is an installed FACILITY, exactly as a
//      declared `kind facility` quote (DeclaredQuote.H): C_BM = area x price
//      enters the FCI ladder as a bare module, FCI gains contingencyFee x
//      C_BM, and it adds NOTHING to the siteFactor base (a building IS an
//      auxiliary facility).  It is therefore depreciated WITH THE PLANT
//      (straight line is the only schedule this pass has), inside FCI, TCI
//      and COM_d's 0.180 FCI.  ONE home: no second building line is added.
//
//  E5a `breakEven {}` -- two break-evens from the base appraisal, which say
//      different things and the output says why.
//      (1) OPERATING: the fraction x of nameplate production at which the
//      year's sales equal the year's cost of production at full production,
//          x = F / (R - V)
//      with a CLASSIFICATION that is a modelling choice the student sees:
//          VARIABLE V = 1.23 (C_RM + C_UT + C_WT)         (scales with x)
//          FIXED    F = 0.180 FCI + 2.73 C_OL + depreciation
//      (a royalty carried by operating year 1 is added on its basis: on sales
//      it lowers the revenue slope, on the cost of manufacture it multiplies
//      the cash cost).  The start-up cost, the ramp-up and the tax are not in
//      it.
//      (2) NPV: the fraction s of nameplate production (the stream factor
//      scaled by s, the capital and the labour fixed) at which NPV = 0,
//      found by `appraise` on a copy -- the cash flow has ONE home.  It
//      differs from (1) because it carries the capital charge, the tax, the
//      working capital, the ramp-up, the royalty window and discounting.
//      Both use the SAME revenue as the NPV.  No threshold, no verdict.
//
//  E5b `royalty { rate; basis sales|costOfManufacture; expiry <year>; ...}`
//      A cost of the operating years 1..expiry only (the patent window), on
//      the year's sales or its COM_d, deducted before the tax like the other
//      costs of manufacture.  REFUSED without a window (a royalty with no end
//      is the error the reports make) and without source and reason.
//
//  E5c `workingCapitalMethods { fractionOfSales; fractionOfFixedCapital; }`
//      The three methods side by side -- the itemised build-up (when the
//      case declares `workingCapital {}`), a fraction of the annual sales and
//      a fraction of the fixed capital -- each from a DECLARED fraction; a
//      method without its input is named, not defaulted.  The spread is
//      printed.  The method the APPRAISAL uses stays the case's own choice
//      (`workingCapital`), and the table says which one it was.
// =========================================================================
struct RoyaltyDeclaration
{
    bool        present = false;
    scalar      rate    = 0.0;     // fraction of the basis
    std::string basis;             // sales | costOfManufacture
    int         expiry  = 0;       // the last operating year that carries it
    std::string source, reason;
};

RoyaltyDeclaration readRoyalty(const DictPtr& econ)
{
    RoyaltyDeclaration Ry;
    if (!econ->found("royalty")) return Ry;
    const std::string where = "economics { royalty { ... } }";
    if (!std::holds_alternative<DictPtr>(econ->entryValue("royalty")))
        throw std::runtime_error("economics: `royalty` must be a block --"
            " `royalty { rate 0.03; basis sales; expiry 8; source \"...\";"
            " reason \"...\"; }`.");
    const DictPtr d = econ->subDict("royalty");
    const std::vector<std::string> known
        { "rate", "basis", "expiry", "source", "reason" };
    for (const auto& k : d->keys())
        if (std::find(known.begin(), known.end(), k) == known.end())
            throw std::runtime_error("economics: "
                + registryRefusal::message("royalty key", k, known, "Accepted"));
    if (!d->found("expiry"))
        throw std::runtime_error(where + ": `expiry <project year>;` is not"
            " declared.  A royalty is paid for a patent window, and a royalty"
            " with no end is the error previous plant designs made (charged"
            " after the patent had expired).  Declare the last operating year"
            " that carries it; no window is assumed.");
    for (const char* k : { "rate", "basis", "source", "reason" })
        if (!d->found(k))
            throw std::runtime_error(where + ": `" + k + "` is not declared."
                "  Declare rate (a fraction), basis (sales | costOfManufacture),"
                " expiry, source and reason; none is defaulted.");
    for (const char* k : { "source", "reason" })
        if (d->lookupWord(k).empty())
            throw std::runtime_error(where + ": `" + k + "` is empty -- a"
                " royalty is an assumption the case owes its reader.");
    Ry.rate = d->lookupScalar("rate");
    if (!(Ry.rate > 0.0) || !(Ry.rate < 1.0))
    {
        std::ostringstream m;
        m << where << ": `rate " << Ry.rate << ";` must lie strictly between"
             " 0 and 1 -- a fraction of the basis (0.03 is 3 %).";
        throw std::runtime_error(m.str());
    }
    Ry.basis = d->lookupWord("basis");
    if (Ry.basis != "sales" && Ry.basis != "costOfManufacture")
        throw std::runtime_error("economics: " + registryRefusal::message(
            "royalty basis", Ry.basis,
            std::vector<std::string>{ "sales", "costOfManufacture" },
            "Accepted"));
    const scalar ex = d->lookupScalar("expiry");
    if (!(ex >= 1.0) || std::fabs(ex - std::round(ex)) > 1e-9)
    {
        std::ostringstream m;
        m << where << ": `expiry " << ex << ";` must be a whole operating year"
             " >= 1 (year 1 is the first year of operation).";
        throw std::runtime_error(m.str());
    }
    Ry.expiry = static_cast<int>(std::lround(ex));
    Ry.source = d->lookupWord("source");
    Ry.reason = d->lookupWord("reason");
    Ry.present = true;
    return Ry;
}

struct BuildingsDeclaration
{
    bool        present = false;
    bool        havePrice = false;
    scalar      price   = 0.0;                  // currency per m2, every grade
    std::map<std::string, scalar> gradePrice;   // grade -> currency per m2
    std::string source, reason;
    scalar      area = 0.0, cost = 0.0;         // m2, C_BM in currency
    int         nRooms = 0;
    std::map<std::string, scalar> areaByGrade, costByGrade;
};

BuildingsDeclaration readBuildings(const DictPtr& econ,
                                   const SimulationResult& result)
{
    BuildingsDeclaration B;
    if (!econ->found("buildings")) return B;
    const std::string where = "economics { buildings { ... } }";
    if (!std::holds_alternative<DictPtr>(econ->entryValue("buildings")))
        throw std::runtime_error("economics: `buildings` must be a block --"
            " `buildings { price 800; gradePrice { C 2500; CNC 600; } source"
            " \"...\"; reason \"...\"; }`.");
    const DictPtr d = econ->subDict("buildings");
    const std::vector<std::string> known
        { "price", "gradePrice", "source", "reason" };
    for (const auto& k : d->keys())
        if (std::find(known.begin(), known.end(), k) == known.end())
            throw std::runtime_error("economics: "
                + registryRefusal::message("buildings key", k, known, "Accepted"));
    for (const char* k : { "source", "reason" })
        if (!d->found(k) || d->lookupWord(k).empty())
            throw std::runtime_error(where + ": `" + k + " \"...\";` is not"
                " declared -- a building price is an assumption the case owes"
                " its reader: where it comes from (`source`) and why it is"
                " this plant's (`reason`).");
    B.source = d->lookupWord("source");
    B.reason = d->lookupWord("reason");
    const std::vector<std::string> grades { "A", "B", "C", "D", "CNC" };
    if (d->found("price"))
    {
        B.price = d->lookupScalar("price", Dimensions(0, -2, 0, 0, 0));
        if (!(B.price >= 0.0))
            throw std::runtime_error(where + ": `price` cannot be negative.");
        B.havePrice = true;
    }
    if (d->found("gradePrice"))
    {
        if (!std::holds_alternative<DictPtr>(d->entryValue("gradePrice")))
            throw std::runtime_error(where + ": `gradePrice` must be a block"
                " of `<grade> <currency per m2>;` lines, grades A B C D CNC.");
        const DictPtr g = d->subDict("gradePrice");
        for (const auto& k : g->keys())
        {
            if (std::find(grades.begin(), grades.end(), k) == grades.end())
                throw std::runtime_error("economics: "
                    + registryRefusal::message("room grade", k, grades, "Accepted"));
            const scalar v = g->lookupScalar(k, Dimensions(0, -2, 0, 0, 0));
            if (!(v >= 0.0))
                throw std::runtime_error(where + ": `gradePrice { " + k
                    + " ... }` cannot be negative.");
            B.gradePrice[k] = v;
        }
    }
    if (!B.havePrice && B.gradePrice.empty())
        throw std::runtime_error(where + ": declares no price -- give `price"
            " <currency per m2>;` for every room, a `gradePrice {}` per grade,"
            " or both.  No price is invented.");
    if (!result.building.present)
        throw std::runtime_error(where + ": a building price is declared and"
            " this run has no building to price -- the case declares no"
            " `building {}` in system/layoutDict, or (under an outer driver)"
            " the layout is checked only after the post-processing chain."
            "  Declare the GMP interior and its room areas are used; no area"
            " is invented.");
    for (const auto& r : result.building.rooms)
    {
        const auto gp = B.gradePrice.find(r.grade);
        scalar p = 0.0;
        if (gp != B.gradePrice.end()) p = gp->second;
        else if (B.havePrice)         p = B.price;
        else
            throw std::runtime_error(where + ": room '" + r.name + "' is grade "
                + (r.grade.empty() ? std::string("(none)") : r.grade)
                + " and the block declares neither a `gradePrice { "
                + r.grade + " ...}` nor a general `price`.  A clean room does"
                " not cost what a warehouse costs, and the engine will not"
                " choose the cheaper.");
        B.area += r.area;
        B.cost += r.area * p;
        B.areaByGrade[r.grade] += r.area;
        B.costByGrade[r.grade] += r.area * p;
        ++B.nRooms;
    }
    B.present = true;
    return B;
}

// =========================================================================
//  ONE APPRAISAL, ONE HOME (2026-10-12, DEV.md 4c C68).
//
//  Everything from the annual bills to the NPV, the IRR and the paybacks is
//  computed HERE, from one bundle of inputs, and nowhere else.  The base
//  appraisal calls it once; the opt-in `sensitivity {}` block (below) calls
//  it again once per declared input and end, with that ONE input moved.  A
//  sensitivity that re-derived the cash flow in a second copy would be a
//  second home for the appraisal, and the day the two copies disagreed --
//  a working capital that follows the revenue in one and not the other, a
//  ramp-up honoured in one only -- every tornado bar would be a number
//  about a plant this pass does not price.  So the sensitivity has no
//  arithmetic of its own: it edits a copy of the inputs and calls this.
//
//  The function is the body `run()` used to carry inline, moved verbatim
//  (the same operations in the same order), so the base appraisal of every
//  case is byte-identical to what it was.  The only additions are the
//  `verbose` flag, which silences the two things a re-appraisal must not
//  repeat (the held-material valuation table and the extreme-IRR warning),
//  and the per-utility scale, which is empty -- every factor 1 -- in the
//  base case.
// =========================================================================
struct AppraisalInputs
{
    //  ---- what a sensitivity may move --------------------------------
    scalar FCI          = 0.0;       // EUR, Turton Eq. 7.5
    scalar streamFactor = 0.90;      // fraction of 8760 h on stream
    scalar discountRate = 0.10;
    scalar taxRate      = 0.21;
    //  TAX ON A LOSS (2026-11-09, DEV.md 4c C269 decision (2)).  `true` is
    //  `taxOnLoss credit;` and the default: a loss year's tax is NEGATIVE, a
    //  credit worth tau x the loss, which assumes the owner has OTHER
    //  taxable profit to set the loss against (a group's consolidated
    //  return).  `false` is `taxOnLoss none;`, the stand-alone reading: a
    //  loss year pays no tax and earns no credit; the loss is not carried
    //  forward either (not modelled, said).
    bool   lossTaxCredit = true;
    scalar labourRate   = 0.0;       // EUR/h
    std::vector<PricedStream> rawMats;    // price EUR/kg, massFlow kg/s
    std::vector<PricedStream> products;
    //  The ALLOCATED utility rows, in the allocation's order: (utility
    //  name, EUR/h).  A carried or unserved row has no price and is not
    //  here.  `utilityScale` multiplies every row of one utility (C68's
    //  `utility.<name>`); absent, a row is summed as published.
    std::vector<std::pair<std::string, scalar>> utilityEurH;
    std::map<std::string, scalar>               utilityScale;
    //  THE LAND (C82): absent unless the case declares a land price.  A
    //  sensitivity may move `landPrice` (`land.price`); the area is the
    //  layout's (or the declared) and is never moved here.
    bool   landPresent = false;
    scalar landPrice   = 0.0;        // currency per m2
    scalar landArea    = 0.0;        // m2
    //  THE FINANCING (G4): absent unless the case declares `financing {}`.
    //  A sensitivity may move `fin.rate` (`financing.rate`) and
    //  `fin.debtFraction` (`financing.debtFraction`); they move the EQUITY
    //  view only -- the project's cash flow does not see them.
    FinancingDeclaration fin;
    //  THE ROYALTY (E5b): absent unless the case declares `royalty {}`.  A
    //  sensitivity may move `rate` (`royalty.rate`); the basis and the
    //  expiry year are the case's and are never moved.
    RoyaltyDeclaration royalty;

    //  ---- what it never moves -----------------------------------------
    scalar  projectLife            = 10.0;
    scalar  depreciableLife        = 9.0;
    scalar  salvageFraction        = 0.0;
    scalar  workingCapitalFraction = 0.15;
    DictPtr wcModel;                       // non-null: the built-up WC
    scalar  operatorsTotal         = 0.0;  // operating positions
    scalar  operatorAnnualHours    = 1960.0;
    DcfTimeline timeline;
};

struct AppraisalOutcome
{
    scalar H = 0.0;                        // operating hours per year
    scalar C_OL = 0.0, C_RM = 0.0, C_UT = 0.0, C_UT_credit = 0.0;
    scalar C_WT = 0.0, R = 0.0, COM_d = 0.0;
    scalar WC = 0.0, TCI = 0.0;
    WorkingCapitalBuildUp wcb;
    scalar d_annual = 0.0, salvage = 0.0, startupCost = 0.0;
    scalar land = 0.0;                     // C82: price x area, 0 when absent
    int    Nc = 1, tFirst = 0, Nlife = 0;
    scalar NPV = 0.0, NPV_projectStart = 0.0;
    scalar IRR = std::nan("");
    bool   haveIRR = false, irrAmbiguous = false;
    int    cumSignChanges = 0;
    scalar discPayback = std::nan(""), simplePayback = std::nan("");
    std::vector<CashFlowYear> cashFlowRows;
    //  THE LOSS YEARS (C269): how many operating years of the project view
    //  had a negative taxable income; the credits they earned (undiscounted,
    //  > 0) and the same credits discounted to start-up (their share of the
    //  NPV) -- both 0 under `taxOnLoss none`, where the years still count.
    int    lossYears = 0;
    scalar taxCreditTotal = 0.0, taxCreditDiscounted = 0.0;
    //  THE FINANCING (G4), filled only when `in.fin.present`: the loan and
    //  the EQUITY view beside the project's (which the fields above are).
    scalar loanDrawn = 0.0, IDC = 0.0, loanAtStartup = 0.0;
    scalar interestPaidTotal = 0.0, equityInvested = 0.0;
    scalar equityNPV = 0.0, equityIRR = std::nan("");
    bool   haveEquityIRR = false, equityIrrAmbiguous = false;
    int    equityCumSignChanges = 0;
    scalar equityDiscPayback = std::nan("");
    std::vector<LoanYear> loanRows;
};

AppraisalOutcome appraise(const AppraisalInputs& in,
                          const SimulationResult& result, bool verbose)
{
    AppraisalOutcome o;
    const scalar FCI          = in.FCI;
    const scalar discountRate = in.discountRate;
    const scalar taxRate      = in.taxRate;
    const DcfTimeline& timeline = in.timeline;
    //  THE TAX OF A YEAR, from its taxable income (C269 decision (2)): tau x
    //  the income, negative on a loss (a credit) under `taxOnLoss credit`;
    //  floored at zero under `taxOnLoss none`.  Every cash flow below that
    //  carries a tax reads it from here; the `credit` branches keep the
    //  `(1 - tau)` expressions they always had, so no default moves.
    auto taxOf = [&](scalar taxable) -> scalar
    {
        return (in.lossTaxCredit || taxable >= 0.0) ? taxRate * taxable : 0.0;
    };

    const scalar H = in.streamFactor * 8760.0;   // operating hours per year
    o.H = H;

    // ---- the utility bill (allocated rows only; credits summed) ---------
    scalar C_UT = 0.0;
    scalar C_UT_credit = 0.0;               // the negative part, EUR/yr (<= 0)
    for (const auto& [utility, eurH0] : in.utilityEurH)
    {
        const auto   sc   = in.utilityScale.find(utility);
        const scalar eurH = (sc == in.utilityScale.end()) ? eurH0
                                                          : eurH0 * sc->second;
        C_UT += eurH;                       // €/h, priced against a utility
        if (eurH < 0.0) C_UT_credit += eurH;
    }
    C_UT        *= H;             // €/yr
    C_UT_credit *= H;             // €/yr

    // ---- labour, raw materials, waste, COM_d (Turton Eq. 8.1) -----------
    const scalar C_OL = in.operatorsTotal * in.labourRate * in.operatorAnnualHours;  // €/yr
    scalar C_RM = 0.0;
    for (const auto& ps : in.rawMats)
        C_RM += ps.price * ps.massFlow * 3600.0 * H;     // €/yr
    //  C_WT: waste treatment -- NOT costed in this Pareto phase.  Explicit
    //  zero with a loud line (a real plant must price effluent / solids
    //  handling).
    const scalar C_WT = 0.0;
    const scalar COM_d = 0.180 * FCI
                       + 2.73  * C_OL
                       + 1.23  * (C_RM + C_UT + C_WT);

    // ---- revenue ---------------------------------------------------------
    scalar R = 0.0;             // €/yr
    for (const auto& ps : in.products)
        R += ps.price * ps.massFlow * 3600.0 * H;          // €/yr

    // ---- working capital: a fraction of FCI, or built up (C44 slice 4) --
    scalar WC  = in.workingCapitalFraction * FCI;
    scalar TCI = FCI + WC;
    WorkingCapitalBuildUp wcb;
    if (in.wcModel)
    {
        wcb = buildWorkingCapital(in.wcModel, result, in.rawMats, in.products,
                                  R, C_RM, COM_d, H, verbose);
        wcb.fractionUsed = in.workingCapitalFraction;
        wcb.fractionRule = in.workingCapitalFraction * FCI;
        WC  = wcb.net;
        TCI = FCI + WC;
    }

    // ---- DCF -- straight-line depreciation, after-tax cash flow ---------
    const scalar d_annual = (in.depreciableLife > 0.0) ? (FCI / in.depreciableLife) : 0.0;
    const scalar salvage  = in.salvageFraction * FCI;

    const int    Nlife    = static_cast<int>(std::lround(in.projectLife));
    const int    Ndepr    = static_cast<int>(std::lround(in.depreciableLife));

    //  Build the cash-flow timeline (C63; see `readTimeline` for the
    //  convention and where it was read).  Year 0 is the END of
    //  construction, the start-up instant; construction year k of N spends
    //  its capital fraction at t = k - N (t <= 0), the working capital is
    //  invested at t = 0, and the plant operates in years 1..Nlife.  With
    //  N = 1 and no ramp-up or start-up cost declared this is exactly the
    //  old one-year timeline: -FCI - WC at t = 0, full production from year
    //  1.  The WC is recovered untaxed at end-of-life, salvage is taxed on
    //  the gain.  cashFlow[k] holds year t = k + tFirst.
    const int    Nc     = timeline.constructionPeriod;
    //  THE LAND (C82) adds ONE year, the START of construction (t = -Nc,
    //  CAPCOST's year 0), when the case declares a land price; absent, the
    //  timeline is exactly what it was.
    const int    tFirst = in.landPresent ? -Nc : 1 - Nc;
    const int    Nrows  = Nlife + 1 - tFirst;    // years tFirst..Nlife
    const scalar land   = in.landPresent ? in.landPrice * in.landArea : 0.0;
    auto at = [&](int t) -> std::size_t { return static_cast<std::size_t>(t - tFirst); };

    const scalar C_var        = C_RM + C_UT + C_WT;   // the variable group
    const scalar startupCost  = timeline.startupCostFraction * FCI;
    auto revenueAt  = [&](int t) { return timeline.productionFraction(t) * R; };
    auto comAt      = [&](int t)
    {
        const scalar p = timeline.productionFraction(t);
        return (p == 1.0) ? COM_d
                          : 0.180 * FCI + 2.73 * C_OL + 1.23 * (p * C_var);
    };
    auto startupAt  = [&](int t) { return (t == 1) ? startupCost : 0.0; };
    //  THE ROYALTY (E5b): a cost of the operating years up to the declared
    //  expiry, on the year's sales or on the year's COM_d -- taxed like the
    //  other costs of manufacture (deducted before the tax).  Zero, exactly,
    //  when absent or past the window.
    auto royaltyAt  = [&](int t) -> scalar
    {
        if (!in.royalty.present || t > in.royalty.expiry) return 0.0;
        return in.royalty.rate
             * (in.royalty.basis == "sales" ? revenueAt(t) : comAt(t));
    };

    std::vector<scalar> cashFlow(static_cast<std::size_t>(Nrows), 0.0);
    std::vector<scalar> capitalOut(static_cast<std::size_t>(Nrows), 0.0);
    for (int k = 1; k <= Nc; ++k)                // construction, end of year k
        capitalOut[at(k - Nc)] = -(timeline.capitalSchedule[static_cast<std::size_t>(k - 1)] * FCI);
    capitalOut[at(0)] -= WC;                     // working capital at start-up
    //  THE LAND (C82), bought at the START of construction -- CAPCOST 2017's
    //  'Cash Flow Analysis'!C49 (`=costLand`, year 0, before the first
    //  construction year's capital) -- and NOT depreciated.
    if (in.landPresent) capitalOut[at(-Nc)] -= land;
    for (int t = tFirst; t <= 0; ++t) cashFlow[at(t)] = capitalOut[at(t)];
    //  The project's taxable income of each operating year is kept, so the
    //  equity view (G4) deducts the loan's interest FROM it rather than
    //  restating the income statement.
    std::vector<scalar> projectTaxable(static_cast<std::size_t>(Nrows), 0.0);
    for (int t = 1; t <= Nlife; ++t)
    {
        const scalar d_t  = (t <= Ndepr) ? d_annual : 0.0;
        projectTaxable[at(t)] = revenueAt(t) - comAt(t) - royaltyAt(t) - startupAt(t) - d_t;
        const scalar CF_t = in.lossTaxCredit
            ? projectTaxable[at(t)] * (1.0 - taxRate) + d_t
            : projectTaxable[at(t)] - taxOf(projectTaxable[at(t)]) + d_t;
        cashFlow[at(t)] = CF_t;
    }
    cashFlow[at(Nlife)] += WC + salvage * (1.0 - taxRate);  // WC untaxed; salvage taxed
    //  THE LAND (C82) recovered at its PURCHASE value at the end of the last
    //  operating year, beside the working capital and untaxed (no gain is
    //  assumed, so none is taxed) -- CAPCOST 2017's 'Cash Flow Analysis'!I63
    //  (`=workingCapital/10^6 + costLand/10^6`).  No appreciation is modelled.
    if (in.landPresent) cashFlow[at(Nlife)] += land;

    //  THE FINANCING (G4), only when declared: the loan's draws, its
    //  capitalised interest during construction, its repayment, and the
    //  EQUITY cash flow -- the project's cash flow above, plus the draws,
    //  less the interest after tax, plus the tax shield of the capitalised
    //  interest's depreciation, less the principal.  Derived FROM
    //  `cashFlow`, so the two views can differ only by the loan.  See
    //  `readFinancing` for every convention.  Absent, nothing below runs.
    std::vector<scalar>   equityFlow;
    std::vector<LoanYear> loanRows;
    scalar loanDrawn = 0.0, IDC = 0.0, loanAtStartup = 0.0;
    scalar interestPaidTotal = 0.0, equityInvested = 0.0;
    if (in.fin.present)
    {
        const FinancingDeclaration& fin = in.fin;
        const scalar r = fin.rate;
        //  The draws: the loan's share of each financed outlay, at its date.
        std::vector<scalar> draw(static_cast<std::size_t>(Nrows), 0.0);
        for (int k = 1; k <= Nc; ++k)
            draw[at(k - Nc)] += fin.debtFraction
                * (timeline.capitalSchedule[static_cast<std::size_t>(k - 1)] * FCI);
        if (fin.basis == "totalCapital") draw[at(0)] += fin.debtFraction * WC;

        loanRows.resize(static_cast<std::size_t>(Nrows));
        //  Construction: the interest on the balance already drawn is
        //  CAPITALISED -- added to the balance, no cash moves.
        scalar B = 0.0;
        for (int t = tFirst; t <= 0; ++t)
        {
            LoanYear& y = loanRows[at(t)];
            y.year                = t;
            y.interestCapitalised = r * B;
            y.draw                = draw[at(t)];
            B                    += y.interestCapitalised + y.draw;
            y.balance             = B;
            IDC                  += y.interestCapitalised;
            loanDrawn            += y.draw;
        }
        loanAtStartup = B;
        const scalar P = B;
        const int    g = fin.graceYears;
        const int    n = fin.termYears;
        const scalar annuity = (fin.repayment == "annuity")
            ? (r > 0.0 ? P * r / (1.0 - std::pow(1.0 + r, -n)) : P / n)
            : 0.0;
        const scalar dIdc = (in.depreciableLife > 0.0) ? (IDC / in.depreciableLife) : 0.0;
        //  Operation: the interest is PAID and deducted; grace years repay
        //  nothing; then `n` repayments, the last clearing the balance.
        for (int t = 1; t <= Nlife; ++t)
        {
            LoanYear& y = loanRows[at(t)];
            y.year         = t;
            y.interestPaid = r * B;
            scalar pr = 0.0;
            if (t > g && t <= g + n)
                pr = (t == g + n) ? B
                   : (fin.repayment == "annuity" ? annuity - y.interestPaid
                                                 : P / n);
            y.principal        = pr;
            B                 -= pr;
            y.balance          = B;
            y.idcDepreciation  = (t <= Ndepr) ? dIdc : 0.0;
            interestPaidTotal += y.interestPaid;
        }

        equityFlow.assign(static_cast<std::size_t>(Nrows), 0.0);
        for (int t = tFirst; t <= 0; ++t)
        {
            equityFlow[at(t)] = cashFlow[at(t)] + draw[at(t)];
            equityInvested   -= equityFlow[at(t)];
        }
        for (int t = 1; t <= Nlife; ++t)
        {
            LoanYear&    y   = loanRows[at(t)];
            y.taxableIncome  = projectTaxable[at(t)]
                             - y.interestPaid - y.idcDepreciation;
            y.tax            = taxOf(y.taxableIncome);
            //  Under `credit` the expression it always was; under `none` the
            //  same identity written through the two taxes (the project's
            //  put back, the equity's taken), each floored at zero.
            equityFlow[at(t)] = in.lossTaxCredit
                ? cashFlow[at(t)]
                  - (y.interestPaid + y.idcDepreciation) * (1.0 - taxRate)
                  + y.idcDepreciation - y.principal
                : cashFlow[at(t)] + taxOf(projectTaxable[at(t)]) - y.tax
                  - y.interestPaid - y.principal;
        }
    }

    //  The NPV, the IRR, the discounted payback and the multiple-IRR guard,
    //  each written ONCE for any cash-flow vector over years tFirst..Nlife:
    //  the project's always, the equity's when the case is financed.
    auto npvOf = [&](const std::vector<scalar>& cf, scalar i) -> scalar
    {
        scalar npv = 0.0;
        for (int t = tFirst; t <= Nlife; ++t)
            npv += cf[at(t)] / std::pow(1.0 + i, t);
        return npv;
    };
    auto dNpvOf = [&](const std::vector<scalar>& cf, scalar i) -> scalar
    {
        scalar d = 0.0;
        for (int t = tFirst; t <= Nlife; ++t)
        {
            if (t == 0) continue;                // the t = 0 term has no slope
            d += -static_cast<scalar>(t) * cf[at(t)] / std::pow(1.0 + i, t + 1);
        }
        return d;
    };

    const scalar NPV = npvOf(cashFlow, discountRate);

    // ---- IRR -- bisection bracket on [0,1], Newton polish ---------------
    // Multiple-IRR guard: >1 sign change in the CUMULATIVE cash flow means the
    // NPV(i)=0 root may not be unique -> announce, prefer NPV.
    auto signChangesOf = [&](const std::vector<scalar>& cf) -> int
    {
        int    changes = 0;
        scalar cum = 0.0;
        int    prevSign = 0;
        for (int t = tFirst; t <= Nlife; ++t)
        {
            cum += cf[at(t)];
            const int s = (cum > 0.0) ? 1 : (cum < 0.0 ? -1 : 0);
            if (s != 0 && prevSign != 0 && s != prevSign) ++changes;
            if (s != 0) prevSign = s;
        }
        return changes;
    };
    const int  cumSignChanges = signChangesOf(cashFlow);
    const bool irrAmbiguous = (cumSignChanges > 1);

    //  The root of NPV(i) = 0: `.first` the IRR (NaN if none), `.second`
    //  whether one was found.
    auto irrOf = [&](const std::vector<scalar>& cf) -> std::pair<scalar, bool>
    {
        scalar IRR        = std::nan("");
        bool   haveIRR    = false;
        auto npvAt  = [&](scalar i) { return npvOf(cf, i); };
        auto dNpvAt = [&](scalar i) { return dNpvOf(cf, i); };
        // Bracket by scanning [0, iScanMax] for a sign change of NPV(i).  A very
        // profitable project can have IRR well above 100 % (NPV still positive at
        // i=1), so the scan reaches 500 % -- otherwise a healthy project reports
        // a bare "no break-even" which is misleading (it breaks even immediately,
        // the root is just past 1).  Step held at 0.5 % for resolution.
        const scalar iScanMax = 5.0;
        const int    nScan = static_cast<int>(iScanMax / 0.005);
        scalar       iLo = 0.0, iHi = iScanMax;
        scalar       fLo = npvAt(0.0);
        bool         bracketed = false;
        scalar       prevI = 0.0, prevF = fLo;
        for (int k = 1; k <= nScan; ++k)
        {
            const scalar i = iScanMax * static_cast<scalar>(k) / static_cast<scalar>(nScan);
            const scalar f = npvAt(i);
            if (std::isfinite(prevF) && std::isfinite(f) && prevF * f < 0.0)
            {
                iLo = prevI; iHi = i; bracketed = true;
                break;
            }
            prevI = i; prevF = f;
        }

        // A wildly profitable project (a tiny investment against a huge cash flow)
        // can have an IRR far above the scan ceiling -- NPV is still POSITIVE at
        // iScanMax.  Do NOT report nan: extend the bracket to capture the (very
        // high) root.  Such an IRR almost always signals a MIS-SCALED appraisal
        // (a throughput too large for the costed equipment), flagged loudly below.
        if (!bracketed && std::isfinite(prevF) && prevF > 0.0)
        {
            iLo = iScanMax;  iHi = 1000.0;   // up to 100 000 %
            bracketed = true;
        }

        if (bracketed)
        {
            // Bisection seed (robust, monotone shrink), then Newton polish.
            scalar a = iLo, b = iHi;
            scalar fa = npvAt(a);
            for (int it = 0; it < 60; ++it)
            {
                const scalar m  = 0.5 * (a + b);
                const scalar fm = npvAt(m);
                if (fa * fm <= 0.0) { b = m; } else { a = m; fa = fm; }
                if (b - a < 1.0e-7) break;
            }
            const scalar seed = 0.5 * (a + b);

            solver::NROptions opt;
            opt.tolerance = 1.0e-10;
            opt.maxIter   = 50;
            opt.lower     = iLo;
            opt.upper     = iHi;
            opt.bracket   = true;
            auto nr = solver::newton1D(
                [&](scalar i) { return npvAt(i); },
                [&](scalar i) { return dNpvAt(i); },
                seed, opt);

            IRR     = nr.converged ? nr.x : seed;
            haveIRR = true;
        }
        return { IRR, haveIRR };
    };

    const auto   projectIrr = irrOf(cashFlow);
    const scalar IRR        = projectIrr.first;
    const bool   haveIRR    = projectIrr.second;

    // Loud scale check: an extreme IRR means the cash flow dwarfs the
    // investment -- usually a throughput too large for the costed
    // equipment (the appraisal is mis-scaled), not a real 1000%-return.
    if (haveIRR && verbose && IRR > 2.0)
        std::cerr << "EconomicsPass: IRR = " << (100.0 * IRR)
                  << "% is EXTREME (>200%) -- the annual cash flow dwarfs the"
                     " investment (FCI = " << FCI << " EUR).  Verify the project"
                     " SCALE: a feed/product throughput too large for the costed"
                     " equipment inflates revenue & opex against a tiny CAPEX,"
                     " so the IRR is not physically meaningful.\n";

    // ---- Payback --------------------------------------------------------
    // Discounted payback (DEFAULT): year the cumulative DISCOUNTED cash flow
    // first turns positive (linear interpolation within the year).  It is
    // counted in OPERATING years after start-up; a multi-year construction
    // enters through its capital, compounded to start-up (C63).
    auto discPaybackOf = [&](const std::vector<scalar>& cf, scalar rate) -> scalar
    {
        scalar payback = std::nan("");
        scalar cum = 0.0, prevCum = 0.0;
        for (int t = tFirst; t <= Nlife; ++t)
        {
            const scalar disc = cf[at(t)] / std::pow(1.0 + rate, t);
            prevCum = cum;
            cum += disc;
            if (cum >= 0.0 && t > 0)
            {
                const scalar frac = (disc != 0.0) ? (-prevCum / disc) : 0.0;
                payback = (t - 1) + frac;
                break;
            }
        }
        return payback;
    };
    const scalar discPayback = discPaybackOf(cashFlow, discountRate);

    // Simple PBP (labelled; understates): FCI / (after-tax operating CF + d).
    //  With a RAMP-UP or a START-UP COST the operating cash flow is not one
    //  number, so the closed form would describe a plant that does not
    //  exist: the payback is then the operating time after start-up at which
    //  the UNDISCOUNTED operating cash flows (end-of-life recovery excluded)
    //  first add up to the FCI, interpolated within the year.  With a
    //  constant cash flow the two are the same rule, and the closed form is
    //  kept for that case so nothing it printed moves.
    const scalar afterTaxOpCF = in.lossTaxCredit
        ? (R - COM_d - d_annual) * (1.0 - taxRate) + d_annual
        : (R - COM_d - d_annual) - taxOf(R - COM_d - d_annual) + d_annual;
    scalar simplePayback = (afterTaxOpCF > 0.0) ? (FCI / afterTaxOpCF)
                                                : std::nan("");
    if (!timeline.rampUp.empty() || startupCost != 0.0 || in.royalty.present)
    {
        simplePayback = std::nan("");
        scalar cum = 0.0;
        for (int t = 1; t <= Nlife; ++t)
        {
            const scalar d_t  = (t <= Ndepr) ? d_annual : 0.0;
            const scalar tx_t = revenueAt(t) - comAt(t) - royaltyAt(t) - startupAt(t) - d_t;
            const scalar CF_t = in.lossTaxCredit ? tx_t * (1.0 - taxRate) + d_t
                                                 : tx_t - taxOf(tx_t) + d_t;
            if (CF_t > 0.0 && cum + CF_t >= FCI)
            {
                simplePayback = (t - 1) + (FCI - cum) / CF_t;
                break;
            }
            cum += CF_t;
        }
    }

    // ---- The year-by-year table (years tFirst..Nlife) -------------------
    // The classic Perry / Turton income/cash-flow statement.  A construction
    // year (t <= 0) carries only its capital -- the FCI fraction spent at its
    // end, plus the working capital at t = 0; an operating year carries the
    // revenue and COM_d at its production fraction, the start-up cost in
    // year 1, the depreciation and the tax.  Built once here so the console
    // table, the CSV, the .ods and the result JSON draw the SAME rows.
    std::vector<CashFlowYear> cashFlowRows;
    {
        scalar cumDisc = 0.0;
        for (int t = tFirst; t <= Nlife; ++t)
        {
            CashFlowYear row;
            row.year           = t;
            const scalar d_t   = (t >= 1 && t <= Ndepr) ? d_annual : 0.0;
            if (t <= 0)
            {
                row.investment         = capitalOut[at(t)];   // <= 0
                row.productionFraction = 0.0;
            }
            else
            {
                row.productionFraction = timeline.productionFraction(t);
                row.revenue       = revenueAt(t);
                row.operatingCost = comAt(t);
                row.startupCost   = startupAt(t);
                row.royalty       = royaltyAt(t);
                row.depreciation  = d_t;
                row.taxableIncome = row.revenue - row.operatingCost
                                  - row.royalty - row.startupCost - d_t;
                row.tax           = taxOf(row.taxableIncome);
                row.afterTaxProfit = row.taxableIncome - row.tax;
                if (row.taxableIncome < 0.0)
                {
                    ++o.lossYears;
                    if (row.tax < 0.0)
                    {
                        o.taxCreditTotal      += -row.tax;
                        o.taxCreditDiscounted += -row.tax / std::pow(1.0 + discountRate, t);
                    }
                }
            }
            //  THE LAND (C82) on its own cell, and OUT of `investment`, whose
            //  name is the fixed and working capital: the outlay at t = -Nc,
            //  the recovery at N.  The cash flow carries both.
            if (in.landPresent)
            {
                row.land = (t == -Nc ? -land : 0.0) + (t == Nlife ? land : 0.0);
                if (t == -Nc) row.investment += land;
            }
            row.cashFlow        = cashFlow[at(t)];   // includes WC/salvage (and land) at N
            row.discountFactor  = 1.0 / std::pow(1.0 + discountRate, t);
            row.discountedCF    = cashFlow[at(t)] * row.discountFactor;
            cumDisc            += row.discountedCF;
            row.cumulativeDCF   = cumDisc;
            cashFlowRows.push_back(row);
        }
    }

    o.C_OL = C_OL;  o.C_RM = C_RM;  o.C_UT = C_UT;  o.C_UT_credit = C_UT_credit;
    o.C_WT = C_WT;  o.R = R;        o.COM_d = COM_d;
    o.WC = WC;      o.TCI = TCI;    o.wcb = wcb;
    o.d_annual = d_annual;  o.salvage = salvage;  o.startupCost = startupCost;
    o.land = land;
    o.Nc = Nc;  o.tFirst = tFirst;  o.Nlife = Nlife;
    o.NPV = NPV;
    //  The NPV referred to the START of construction, CAPCOST's own year 0
    //  (see `readTimeline`): N years before start-up.
    o.NPV_projectStart = NPV / std::pow(1.0 + discountRate, Nc);
    o.IRR = IRR;  o.haveIRR = haveIRR;
    o.irrAmbiguous = irrAmbiguous;  o.cumSignChanges = cumSignChanges;
    o.discPayback = discPayback;  o.simplePayback = simplePayback;
    o.cashFlowRows = std::move(cashFlowRows);

    //  THE EQUITY VIEW (G4): the same NPV, IRR, payback and guard, applied
    //  to the equity cash flow at the equity discount rate.
    if (in.fin.present)
    {
        const scalar ie = in.fin.equityDiscountRate;
        o.loanDrawn         = loanDrawn;
        o.IDC               = IDC;
        o.loanAtStartup     = loanAtStartup;
        o.interestPaidTotal = interestPaidTotal;
        o.equityInvested    = equityInvested;
        o.equityNPV         = npvOf(equityFlow, ie);
        const auto eIrr     = irrOf(equityFlow);
        o.equityIRR         = eIrr.first;
        o.haveEquityIRR     = eIrr.second;
        o.equityCumSignChanges = signChangesOf(equityFlow);
        o.equityIrrAmbiguous   = (o.equityCumSignChanges > 1);
        o.equityDiscPayback    = discPaybackOf(equityFlow, ie);
        scalar cumDisc = 0.0;
        for (int t = tFirst; t <= Nlife; ++t)
        {
            LoanYear& y      = loanRows[at(t)];
            y.cashFlow       = equityFlow[at(t)];
            y.discountFactor = 1.0 / std::pow(1.0 + ie, t);
            y.discountedCF   = y.cashFlow * y.discountFactor;
            cumDisc         += y.discountedCF;
            y.cumulativeDCF  = cumDisc;
        }
        o.loanRows = std::move(loanRows);
    }
    return o;
}

// =========================================================================
//  THE ECONOMIC SENSITIVITY: ONE INPUT AT A TIME (2026-10-12, DEV.md 4c
//  C68).  Vitor accepted "the feasibility cases gain a preliminary CAPEX and
//  a sensitivity"; the CAPEX was there, the sensitivity was not, and an
//  outer `sweep` could not supply it: a sweep varies FLOWSHEET paths, while
//  what a feasibility-stage sensitivity varies -- the capital, the prices,
//  the discount rate, the time on stream -- lives in this pass.
//
//  OPT-IN.  A case that declares no `sensitivity` block computes, prints,
//  publishes and writes exactly what it did; nothing is announced.
//
//      economics
//      {
//          ...
//          sensitivity
//          {
//              FCI                 { relative accuracyBand; }      // the declared band, -30/+50 %
//              price.ProductNH3    { relative ( -0.20 0.20 ); }    // a fraction of the base price
//              discountRate        { absolute ( 0.08 0.12 ); }     // the input's own value
//              utility.electricity { relative ( -0.20 0.20 ); }    // scales that utility's bill
//          }
//      }
//
//  Each entry names ONE input and says, explicitly, whether its two numbers
//  are RELATIVE changes (fractions of the base value) or ABSOLUTE values of
//  the input; `relative accuracyBand` reads the FCI's two ends from the
//  `accuracyBand` this block already declares (or the class's default,
//  announced as such), so the band has one home and finally reaches the NPV.
//
//  THE INPUTS, and what each one moves through `appraise` (nothing else):
//    FCI              relative       the fixed capital, and every term that is
//                                    a function of it -- the 0.180 FCI of
//                                    COM_d, the depreciation, the salvage,
//                                    the start-up cost, and the working
//                                    capital (the fraction rule, or the
//                                    built-up model's minimum cash and its
//                                    stocks valued at COM_d per kg)
//    price.<stream>   rel. / abs.    the EUR/kg of a stream constant/economics
//                                    prices (a raw material or a product)
//    utility.<name>   relative       the bill of one allocated utility --
//                                    every row it serves, credits included
//                                    (a steam CREDIT is the same price)
//    labourRate       rel. / abs.    EUR/h of operating labour
//    discountRate     rel. / abs.
//    taxRate          rel. / abs.
//    streamFactor     rel. / abs.    the hours on stream: every annual flow
//                                    is an hourly rate times 8760 x this
//
//  NO RE-SOLVE.  Every input above enters AFTER the flowsheet: prices and
//  rates do not move a flow, and the time on stream scales the hours, not
//  the rates.  So each bar is the SAME converged pass priced again, which is
//  why the block lives here and not in an outer driver.
//
//  A SENSITIVITY IS NOT AN UNCERTAINTY ANALYSIS.  No probability is attached
//  to any end, the inputs are moved one at a time (their correlations --
//  the hydrogen price and the electricity price, say -- are not), and the
//  table answers "which input is the NPV most exposed to", never "how
//  likely is a loss".  The header of every table says so.
// =========================================================================
struct SensitivityInput
{
    std::string key;                 // as declared: FCI, price.H2Feed, ...
    std::string kpiKey;              // the same with every non-word char -> '_'
    std::string mode;                // "relative" | "absolute"
    bool        fromBand = false;    // FCI { relative accuracyBand; }
    scalar      declLo = 0.0, declHi = 0.0;   // as declared
    std::string unit;                // of the input's VALUE
    scalar      base = 0.0, lo = 0.0, hi = 0.0;   // the input's value
    AppraisalOutcome atLo, atHi;
};

//  The input's value in an appraisal bundle.  A utility's "value" is the
//  factor on its bill, 1 in the base case.
scalar sensitivityValue(const AppraisalInputs& in, const std::string& key)
{
    if (key == "FCI")          return in.FCI;
    if (key == "discountRate") return in.discountRate;
    if (key == "taxRate")      return in.taxRate;
    if (key == "streamFactor") return in.streamFactor;
    if (key == "labourRate")   return in.labourRate;
    if (key == "land.price")   return in.landPrice;
    if (key == "royalty.rate") return in.royalty.rate;
    if (key == "financing.rate")         return in.fin.rate;
    if (key == "financing.debtFraction") return in.fin.debtFraction;
    if (key.rfind("price.", 0) == 0)
    {
        const std::string s = key.substr(6);
        for (const auto& p : in.rawMats)  if (p.stream == s) return p.price;
        for (const auto& p : in.products) if (p.stream == s) return p.price;
    }
    if (key.rfind("utility.", 0) == 0)
    {
        const auto it = in.utilityScale.find(key.substr(8));
        return it == in.utilityScale.end() ? 1.0 : it->second;
    }
    throw std::logic_error("EconomicsPass: sensitivityValue reached an input"
                           " readSensitivity did not accept: " + key);
}

//  A copy of the bundle with ONE input set to `v`.  Everything the input
//  moves downstream is moved by `appraise`, not here.
AppraisalInputs withSensitivityValue(AppraisalInputs in, const std::string& key,
                                     scalar v)
{
    if      (key == "FCI")          in.FCI          = v;
    else if (key == "discountRate") in.discountRate = v;
    else if (key == "taxRate")      in.taxRate      = v;
    else if (key == "streamFactor") in.streamFactor = v;
    else if (key == "labourRate")   in.labourRate   = v;
    else if (key == "land.price")   in.landPrice    = v;
    else if (key == "royalty.rate") in.royalty.rate = v;
    else if (key == "financing.rate")         in.fin.rate         = v;
    else if (key == "financing.debtFraction") in.fin.debtFraction = v;
    else if (key.rfind("price.", 0) == 0)
    {
        const std::string s = key.substr(6);
        for (auto& p : in.rawMats)  if (p.stream == s) p.price = v;
        for (auto& p : in.products) if (p.stream == s) p.price = v;
    }
    else if (key.rfind("utility.", 0) == 0) in.utilityScale[key.substr(8)] = v;
    else
        throw std::logic_error("EconomicsPass: withSensitivityValue reached an"
                               " input readSensitivity did not accept: " + key);
    return in;
}

void resolveSensitivityEnds(SensitivityInput& s, scalar accLoPct, scalar accHiPct);

//  Read and check the `sensitivity {}` block.  Every refusal names the entry
//  and the remedy; nothing here defaults a number.
std::vector<SensitivityInput> readSensitivity(const DictPtr& block,
                                              const AppraisalInputs& base)
{
    const std::string where = "economics { sensitivity { ... } }";

    //  The accepted names, built from what THIS case prices: a price or a
    //  utility the case does not price cannot be perturbed, and the list in
    //  a refusal is the list that would have been accepted.
    std::vector<std::string> pricedStreams, pricedUtilities;
    for (const auto& p : base.rawMats)  pricedStreams.push_back(p.stream);
    for (const auto& p : base.products) pricedStreams.push_back(p.stream);
    for (const auto& [u, eurH] : base.utilityEurH)
        if (std::find(pricedUtilities.begin(), pricedUtilities.end(), u)
            == pricedUtilities.end())
            pricedUtilities.push_back(u);
    std::vector<std::string> accepted
        { "FCI", "discountRate", "labourRate", "streamFactor", "taxRate" };
    for (const auto& s : pricedStreams)   accepted.push_back("price." + s);
    for (const auto& u : pricedUtilities) accepted.push_back("utility." + u);
    if (base.landPresent) accepted.push_back("land.price");
    if (base.royalty.present) accepted.push_back("royalty.rate");
    if (base.fin.present)
    {
        accepted.push_back("financing.debtFraction");
        accepted.push_back("financing.rate");
    }

    auto list = [](const std::vector<std::string>& v)
    {
        std::string s;
        for (const auto& x : v) s += (s.empty() ? "" : " ") + x;
        return s.empty() ? std::string("(none)") : s;
    };

    if (block->keys().empty())
        throw std::runtime_error(where + " declares no input.  Name at least"
            " one, e.g. `FCI { relative accuracyBand; }`, or delete the block."
            "  Accepted in this case: " + list(accepted));

    std::vector<SensitivityInput> out;
    for (const auto& key : block->keys())
    {
        //  ---- which input -------------------------------------------
        const bool isPrice   = key.rfind("price.", 0) == 0;
        const bool isUtility = key.rfind("utility.", 0) == 0;
        if (std::find(accepted.begin(), accepted.end(), key) == accepted.end())
        {
            if (key == "land.price")
                throw std::runtime_error(where + ": `land.price` moves the price"
                    " of the land, and this economics block declares none (no"
                    " `land { price; source; reason; }`).  A sensitivity moves a"
                    " price the case DECLARES; it never invents one.");
            if (key == "royalty.rate")
                throw std::runtime_error(where + ": `royalty.rate` moves the"
                    " rate of a royalty, and this economics block declares none"
                    " (no `royalty { rate; basis; expiry; source; reason; }`)."
                    "  A sensitivity moves a term the case DECLARES; it never"
                    " invents one.");
            if (key == "financing.rate" || key == "financing.debtFraction")
                throw std::runtime_error(where + ": `" + key + "` moves a term"
                    " of the loan, and this economics block declares no loan (no"
                    " `financing { ... }`).  A sensitivity moves a term the case"
                    " DECLARES; it never invents one.");
            if (isPrice)
                throw std::runtime_error(where + ": `" + key + "` perturbs the"
                    " price of stream '" + key.substr(6) + "', and"
                    " constant/economics prices no such stream (neither a"
                    " `products` nor a `rawMaterials` entry).  A sensitivity"
                    " moves a price the case DECLARES; it never invents one."
                    "  Priced streams: " + list(pricedStreams));
            if (isUtility)
                throw std::runtime_error(where + ": `" + key + "` scales the"
                    " bill of utility '" + key.substr(8) + "', and no duty of"
                    " this run is allocated to it, so it has no bill to scale."
                    "  Utilities this run prices: " + list(pricedUtilities));
            throw std::runtime_error("economics: "
                + registryRefusal::message("economic sensitivity input", key,
                                           accepted, "Accepted"));
        }

        SensitivityInput s;
        s.key = key;
        s.kpiKey = key;
        for (auto& c : s.kpiKey)
            if (!(std::isalnum(static_cast<unsigned char>(c)) || c == '_')) c = '_';

        //  ---- its form: { relative (lo hi); } | { absolute (lo hi); } --
        const EntryValue& ev = block->entryValue(key);
        if (!std::holds_alternative<DictPtr>(ev))
            throw std::runtime_error(where + ": `" + key + "` must be a block"
                " saying whether its two numbers are fractions or values --"
                " `" + key + " { relative ( -0.2 0.2 ); }` or `" + key
                + " { absolute ( lo hi ); }`.  A bare list would leave that to"
                " a guess.");
        const DictPtr e = block->subDict(key);
        for (const auto& k : e->keys())
            if (k != "relative" && k != "absolute")
                throw std::runtime_error(where + ": `" + key + " { " + k
                    + " ... }` is not a form this block knows.  Declare exactly"
                      " one of `relative ( lo hi );` (fractions of the base"
                      " value) or `absolute ( lo hi );` (values of the input).");
        const bool rel = e->found("relative"), abs = e->found("absolute");
        if (rel == abs)
            throw std::runtime_error(where + ": `" + key + "` must declare"
                " exactly ONE of `relative ( lo hi );` and `absolute ( lo hi );`"
                + std::string(rel ? " -- it declares both." : " -- it declares neither."));
        s.mode = rel ? "relative" : "absolute";

        const bool relOnly = (key == "FCI") || isUtility;
        if (!rel && relOnly)
            throw std::runtime_error(where + ": `" + key + "` takes `relative`"
                " only -- " + (isUtility
                    ? std::string("a utility's bill is many rows at many prices,"
                                  " so only a factor on it has one meaning")
                    : std::string("the capital is the costing's answer, and its"
                                  " ends are fractions of it (or the declared"
                                  " `accuracyBand`, `relative accuracyBand;`)"))
                + ".");

        const EntryValue& form = e->entryValue(s.mode);
        if (std::holds_alternative<std::string>(form))
        {
            const std::string w = std::get<std::string>(form);
            if (w != "accuracyBand" || key != "FCI")
                throw std::runtime_error(where + ": `" + key + " { " + s.mode
                    + " " + w + "; }` -- the only word this slot takes is"
                      " `accuracyBand`, on `FCI { relative accuracyBand; }`;"
                      " every other entry declares its two numbers,"
                      " `( lo hi )`.");
            e->lookupWord(s.mode);              // consulted: the audit sees it
            s.fromBand = true;
        }
        else
        {
            if (!std::holds_alternative<std::vector<scalar>>(form))
                throw std::runtime_error(where + ": `" + key + " { " + s.mode
                    + " ... }` must be two numbers, `( lo hi )`.");
            const std::vector<scalar> v = e->lookupList(s.mode);
            if (v.size() != 2 || !(v[0] < v[1]))
            {
                std::ostringstream m;
                m << where << ": `" << key << " { " << s.mode << " ( ";
                for (const auto x : v) m << x << " ";
                m << "); }` must be exactly two numbers, the LOW end first and"
                     " below the HIGH one.";
                throw std::runtime_error(m.str());
            }
            s.declLo = v[0];
            s.declHi = v[1];
        }

        if      (key == "FCI" || isPrice) s.unit = isPrice ? "EUR/kg" : "EUR";
        else if (key == "labourRate")     s.unit = "EUR/h";
        else if (key == "land.price")     s.unit = "EUR/m2";
        else if (isUtility)               s.unit = "x bill";
        else                              s.unit = "-";
        s.base = sensitivityValue(base, key);
        //  Declared ends are checked HERE, before a number is printed; the
        //  band's ends wait for the band (resolved after it is read).
        if (!s.fromBand) resolveSensitivityEnds(s, 0.0, 0.0);
        out.push_back(std::move(s));
    }
    return out;
}

//  The two ends of one input, as values, checked against what the input can
//  physically be.  Called once the accuracy band is known.
void resolveSensitivityEnds(SensitivityInput& s, scalar accLoPct, scalar accHiPct)
{
    const std::string where = "economics { sensitivity { " + s.key + " } }";
    if (s.fromBand)
    {
        s.declLo = accLoPct / 100.0;
        s.declHi = accHiPct / 100.0;
    }
    if (s.mode == "relative")
    {
        s.lo = s.base * (1.0 + s.declLo);
        s.hi = s.base * (1.0 + s.declHi);
    }
    else
    {
        s.lo = s.declLo;
        s.hi = s.declHi;
    }

    auto refuse = [&](const std::string& why)
    {
        std::ostringstream m;
        m << std::setprecision(6) << where << ": the ends evaluate to "
          << s.lo << " and " << s.hi << " (base " << s.base << "), and " << why;
        throw std::runtime_error(m.str());
    };
    const bool isPrice = s.key.rfind("price.", 0) == 0;
    if (s.key == "FCI" && !(s.lo > 0.0))
        refuse("a fixed capital must stay positive (a relative low end must be"
               " above -1).");
    if ((isPrice || s.key == "labourRate" || s.key == "land.price"
         || s.key.rfind("utility.", 0) == 0)
        && !(s.lo >= 0.0))
        refuse("a price, a labour rate or a utility bill factor cannot be"
               " negative.");
    if (s.key == "discountRate" && !(s.lo > -1.0))
        refuse("a discount rate at or below -100 % has no present value.");
    if (s.key == "taxRate" && !(s.lo >= 0.0 && s.hi < 1.0))
        refuse("a tax rate lies in [0, 1).");
    if (s.key == "streamFactor" && !(s.lo > 0.0 && s.hi <= 1.0))
        refuse("a stream factor is a fraction of the year, in (0, 1].");
    if (s.key == "royalty.rate" && !(s.lo >= 0.0 && s.hi < 1.0))
        refuse("a royalty rate is a fraction in [0, 1).");
    if (s.key == "financing.rate" && !(s.lo >= 0.0 && s.hi < 1.0))
        refuse("a loan's interest rate is a fraction in [0, 1).");
    if (s.key == "financing.debtFraction" && !(s.lo > 0.0 && s.hi < 1.0))
        refuse("a debt fraction lies strictly between 0 and 1.");
}

//  The NPV swing of one input: what separates its two bars.
scalar npvSwing(const SensitivityInput& s)
{
    return std::fabs(s.atHi.NPV - s.atLo.NPV);
}

//  "low", "high", "both" or "" -- which end turns the NPV's sign against
//  the base case's.  An NPV of exactly zero is a break-even, not a flip.
std::string npvSignFlip(const SensitivityInput& s, scalar baseNPV)
{
    auto flips = [&](scalar v) { return (baseNPV > 0.0 && v < 0.0)
                                     || (baseNPV < 0.0 && v > 0.0); };
    const bool l = flips(s.atLo.NPV), h = flips(s.atHi.NPV);
    return (l && h) ? "both" : l ? "low" : h ? "high" : "";
}

//  The inputs in tornado order: largest NPV swing first, a tie kept in the
//  order the block declares them.
std::vector<const SensitivityInput*> tornadoOrder(const std::vector<SensitivityInput>& v)
{
    std::vector<const SensitivityInput*> o;
    for (const auto& s : v) o.push_back(&s);
    std::stable_sort(o.begin(), o.end(),
        [](const SensitivityInput* a, const SensitivityInput* b)
        { return npvSwing(*a) > npvSwing(*b); });
    return o;
}

//  The header every sensitivity table carries, console and CSV alike.
const char* const kSensitivityCaveat =
    "A SENSITIVITY, NOT AN UNCERTAINTY ANALYSIS: each input is moved ALONE to"
    " its declared low and high end, every other input held at its base value,"
    " on the SAME converged flowsheet (no re-solve: every flow and duty is the"
    " base run's) and through the SAME cash-flow arithmetic as the base"
    " appraisal.  No probability is attached to any end and no correlation"
    " between inputs is taken: the table says which input the NPV is most"
    " exposed to, not how likely any outcome is.";

std::string fmtValue(scalar v, const std::string& unit)
{
    std::ostringstream os;
    if (unit == "EUR")         os << std::fixed << std::setprecision(0) << v;
    else if (unit == "x bill") os << "x" << std::fixed << std::setprecision(3) << v;
    else                       os << std::defaultfloat << std::setprecision(6) << v;
    return os.str();
}

std::string fmtIRR(const AppraisalOutcome& o)
{
    if (!o.haveIRR || !std::isfinite(o.IRR)) return "none";
    std::ostringstream os;
    os << std::fixed << std::setprecision(2) << 100.0 * o.IRR << " %";
    return os.str();
}

void printSensitivity(const std::vector<SensitivityInput>& v,
                      const AppraisalOutcome& base, const std::string& cur,
                      bool equity)
{
    std::cout << "\n==============  Economic sensitivity (one input at a time)  ==============\n";
    //  The caveat, wrapped at the table's width.
    {
        std::istringstream words(kSensitivityCaveat);
        std::string w, line = "  ";
        while (words >> w)
        {
            if (line.size() + w.size() + 1 > 78) { std::cout << line << "\n"; line = "  "; }
            line += (line.size() > 2 ? " " : "") + w;
        }
        std::cout << line << "\n";
    }
    std::cout << std::fixed << std::setprecision(0)
              << "  base: NPV = " << base.NPV << " " << cur << ", IRR = "
              << fmtIRR(base) << ", discounted payback = ";
    if (std::isfinite(base.discPayback))
        std::cout << std::setprecision(2) << base.discPayback << " yr\n";
    else
        std::cout << "never within the project life\n";
    std::cout << "  sorted by NPV swing |NPV(high) - NPV(low)|, largest first; "
                 "`relative` ends are\n  fractions of the base value, `absolute`"
                 " ends are values of the input.\n\n";

    std::cout << "    " << std::left << std::setw(28) << "input" << std::right
              << std::setw(14) << "low" << std::setw(14) << "high"
              << std::setw(16) << "NPV(low)" << std::setw(16) << "NPV(high)"
              << std::setw(15) << "swing" << std::setw(11) << "IRR(low)"
              << std::setw(11) << "IRR(high)" << "  NPV sign flips";
    //  THE EQUITY NPV at each end (G4), only when a loan is declared.
    if (equity)
        std::cout << std::setw(18) << "equity NPV(low)" << std::setw(18) << "equity NPV(high)";
    std::cout << "\n";
    for (const auto* s : tornadoOrder(v))
    {
        std::cout << "    " << std::left << std::setw(28) << s->key << std::right
                  << std::setw(14) << fmtValue(s->lo, s->unit)
                  << std::setw(14) << fmtValue(s->hi, s->unit)
                  << std::fixed << std::setprecision(0)
                  << std::setw(16) << s->atLo.NPV << std::setw(16) << s->atHi.NPV
                  << std::setw(15) << npvSwing(*s)
                  << std::setw(11) << fmtIRR(s->atLo) << std::setw(11) << fmtIRR(s->atHi);
        const std::string f = npvSignFlip(*s, base.NPV);
        std::cout << "  " << (f.empty() ? "no" : "at the " + f + " end");
        if (equity)
            std::cout << std::setprecision(0) << std::setw(18) << s->atLo.equityNPV
                      << std::setw(18) << s->atHi.equityNPV;
        std::cout << "\n";
    }
    if (equity)
        std::cout << "    `financing.*` moves the EQUITY view only: the project NPV"
                     " does not see a loan, so its swing\n    is zero by construction"
                     " -- the project's merit does not depend on how it is financed.\n";
    for (const auto& s : v)
        if (s.fromBand)
            std::cout << "    (FCI's ends are the declared accuracy band, "
                      << std::setprecision(0) << 100.0 * s.declLo << " % / +"
                      << 100.0 * s.declHi << " %, read from `accuracyBand`)\n";
    std::cout << "=====================================================================\n\n";
}

void writeSensitivityCsv(const std::vector<SensitivityInput>& v,
                         const AppraisalOutcome& base, const std::string& cur,
                         bool equity)
{
    const fs::path dir = fs::path("reports") / "economics";
    fs::create_directories(dir);
    const fs::path path = dir / "sensitivity.csv";
    std::ofstream f(path);
    if (!f.is_open())
        throw std::runtime_error("EconomicsPass: cannot open " + path.string());
    f << "# One-at-a-time economic sensitivity (tornado), currency " << cur << "\n";
    f << "# " << kSensitivityCaveat << "\n";
    f << "# base: NPV_" << cur << "," << csvNum(base.NPV, 0)
      << ",IRR_pct," << (base.haveIRR ? csvNum(100.0 * base.IRR, 4) : "")
      << ",discountedPayback_yr," << csvNum(base.discPayback, 4) << "\n";
    f << "input,mode,declaredLow,declaredHigh,unit,baseValue,valueLow,valueHigh,"
         "NPV_low_" << cur << ",NPV_high_" << cur << ",NPVswing_" << cur
      << ",IRR_low_pct,IRR_high_pct,discountedPayback_low_yr,"
         "discountedPayback_high_yr,NPVsignFlip";
    if (equity) f << ",equityNPV_low_" << cur << ",equityNPV_high_" << cur;
    f << "\n";
    auto irr = [](const AppraisalOutcome& o)
    { return (o.haveIRR && std::isfinite(o.IRR)) ? csvNum(100.0 * o.IRR, 4) : std::string(); };
    for (const auto* s : tornadoOrder(v))
        f << s->key << "," << s->mode << (s->fromBand ? " accuracyBand" : "")
          << "," << csvNum(s->declLo, 6) << "," << csvNum(s->declHi, 6)
          << "," << s->unit << "," << csvNum(s->base, 6)
          << "," << csvNum(s->lo, 6) << "," << csvNum(s->hi, 6)
          << "," << csvNum(s->atLo.NPV, 0) << "," << csvNum(s->atHi.NPV, 0)
          << "," << csvNum(npvSwing(*s), 0)
          << "," << irr(s->atLo) << "," << irr(s->atHi)
          << "," << csvNum(s->atLo.discPayback, 4) << "," << csvNum(s->atHi.discPayback, 4)
          << "," << npvSignFlip(*s, base.NPV)
          << (equity ? "," + csvNum(s->atLo.equityNPV, 0) + "," + csvNum(s->atHi.equityNPV, 0)
                     : std::string())
          << "\n";
    f.close();
    std::cout << "  [economics] sensitivity table -> " << path.string() << "\n";
}

} // anonymous namespace

EconomicsPass::EconomicsPass(const DictPtr& economicsDict)
:   econDict_(economicsDict)
{}

int EconomicsPass::run(SimulationResult& result)
{
    // ---- 0.  Pre-flight: CAPEX must already be in result.costs ----------
    if (result.costs.empty())
    {
        std::cerr << "EconomicsPass: result.costs is empty -- did the "
                     "sizing+costing passes run first?\n";
        return 1;
    }

    // ---- 1.  Dict knobs (cited teaching defaults, Turton §10/§8) --------
    const scalar projectLife       = econDict_->lookupScalarOrDefault("projectLife",        10.0);
    const scalar discountRate      = econDict_->lookupScalarOrDefault("discountRate",        0.10);
    const scalar taxRate           = econDict_->lookupScalarOrDefault("taxRate",             0.21);
    const scalar depreciableLife   = econDict_->lookupScalarOrDefault("depreciableLife",      9.0);
    const scalar salvageFraction   = econDict_->lookupScalarOrDefault("salvageFraction",      0.0);
    //  `workingCapital` IS EITHER A FRACTION OF FCI OR A MODEL (C44 slice
    //  4): a number keeps the rule it always was, a BLOCK builds the working
    //  capital up from what the plant holds and owes (`buildWorkingCapital`).
    //  The fraction 0.15 is also the comparison line a model prints.
    constexpr scalar workingCapitalDefault = 0.15;
    DictPtr wcModel;
    scalar  workingCapital = workingCapitalDefault;
    if (econDict_->found("workingCapital")
        && std::holds_alternative<DictPtr>(econDict_->entryValue("workingCapital")))
        wcModel = econDict_->subDict("workingCapital");
    else
        workingCapital = econDict_->lookupScalarOrDefault("workingCapital",
                                                          workingCapitalDefault);
    //  THE HOURS ON STREAM, OR THE BATCH PLAN'S YEAR (DEV.md 4c C99).  A
    //  number is the fraction of 8760 h the plant runs at its flowsheet
    //  rate, as it always was.  The WORD `fromBatchPlan` says the flowsheet
    //  is the material balance per unit of product and the year is the batch
    //  plan's production Q: every annual flow is the hourly flow x Q / r_P,
    //  so the factor is DERIVED (`BatchPlanPass`, `streamFactor` there) and
    //  the year's flows have one home.  A NUMBER beside a batch plan is
    //  REFUSED: it would be a second home for the same hours, and the two
    //  would disagree the day either moved.
    const bool sfFromPlan = econDict_->found("streamFactor")
        && std::holds_alternative<std::string>(econDict_->entryValue("streamFactor"));
    if (sfFromPlan)
    {
        const std::string w = econDict_->lookupWord("streamFactor");
        if (w != "fromBatchPlan")
            throw std::runtime_error("economics: `streamFactor " + w + ";` --"
                " a fraction of the year (e.g. 0.90), or the word fromBatchPlan"
                " (the year's flows from the batch plan's production).");
        if (!result.batchPlan.present)
            throw std::runtime_error("economics: `streamFactor fromBatchPlan;`"
                " and no batch plan ran before this pass -- declare `batchPlan"
                " { ... }` above `economics { ... }` in system/postDict, or"
                " declare the stream factor as a number.");
    }
    else if (result.batchPlan.present && econDict_->found("streamFactor"))
    {
        std::ostringstream m;
        m << "economics: `streamFactor " << econDict_->lookupScalar("streamFactor")
          << ";` is declared beside a batch plan, which fixes the year's"
             " production (" << result.batchPlan.productPerYear << " kg of "
          << result.batchPlan.product << ") and so the factor ("
          << result.batchPlan.streamFactor << ").  Two homes for the same hours"
             " disagree the day either moves: declare `streamFactor"
             " fromBatchPlan;`.";
        throw std::runtime_error(m.str());
    }
    const scalar streamFactor = sfFromPlan
        ? result.batchPlan.streamFactor
        : econDict_->lookupScalarOrDefault("streamFactor",         0.90);
    const scalar siteFactor        = econDict_->lookupScalarOrDefault("siteFactor",           0.50);
    //  THE DEFAULT IS THE COSTING TABLE'S OWN FACTOR (DEV.md 4c C110, G8):
    //  every row of that table prints C_TM = costing::contingencyAndFee x
    //  C_BM, and this is the factor the FCI below charges on the same C_BM.
    //  One home for the number; a case that DECLARES another value is told
    //  that its table's C_TM column was not priced at it (announced below).
    const scalar contingencyFee    = econDict_->lookupScalarOrDefault("contingencyFee",
                                                                      costing::contingencyAndFee);
    if (std::abs(contingencyFee - costing::contingencyAndFee) > 1e-12
        && !result.costs.empty())
    {
        std::ostringstream m;
        m << "the economics block declares `contingencyFee " << contingencyFee
          << ";`, and the FCI charges it on SUM C_BM -- but the costing"
             " table's C_TM column (and costs.csv, the design sheets and the"
             " result JSON's totalModule) was priced at Turton's "
          << costing::contingencyAndFee << " x C_BM.  The FCI is the number"
             " that decides; read each item's C_TM as C_BM x "
          << contingencyFee << " for this run.";
        if (AdvisoryLog::instance().add("economics", "warning",
                                        "contingencyFee", m.str()))
            std::cout << "  [economics] " << m.str() << "\n";
    }
    const scalar N_np              = econDict_->lookupScalarOrDefault("N_np",                  7.0);
    const int    estimateClass     = static_cast<int>(
                                      econDict_->lookupScalarOrDefault("estimateClass",       4.0));
    //  A DECLARED NUMBER THE ENGINE DISPATCHES ON MUST REFUSE ONE IT DOES NOT
    //  KNOW (2026-09-07).  The old code branched on `estimateClass <= 4`, so
    //  0, 9 or -3 selected a band by arithmetic accident and said nothing.
    const Choupo::estimateClass::Row* const ecl =
        Choupo::estimateClass::find(estimateClass);
    if (!ecl)
        throw std::runtime_error(
            "economics: estimateClass " + std::to_string(estimateClass)
            + " is not an AACE 18R-97 class.  Registered: "
            + Choupo::estimateClass::registered()
            + " (5 = concept screening, least defined; 1 = check estimate,"
              " most defined).  See src/postProcessing/EstimateClass.H.");
    const bool   refuseOnMissing   = refuseOnMissingPriceOf(econDict_);

    //  `method` WAS DECORATIVE.  Three tutorial cases declare
    //  `method discountedCashFlow;` and nothing read it: the pass is
    //  hardcoded DCF, so the key parsed, sat there, and the author believed
    //  they had SELECTED something.  Found by the postDict audit on its first
    //  corpus run, 2026-08-27.  Reading it costs nothing and moves no number
    //  -- there is one method and every case names it -- but a key that does
    //  not exist must now say so instead of being quietly ignored.
    //  THE START-UP YEARS (2026-10-11, DEV.md 4c C63).  `constructionPeriod`
    //  was read by nothing until 2026-08-27 and then only ANNOUNCED as not
    //  implemented, so `ammonia02_full_plant`, which declares 2, was
    //  discounted over one.  It is honoured now, with the capital schedule,
    //  the ramp-up and the start-up cost beside it -- see `readTimeline`
    //  above for the grammar, the convention and where it was read.
    const DcfTimeline timeline =
        readTimeline(econDict_, static_cast<int>(std::lround(projectLife)));

    const std::string econMethod   = econDict_->lookupWordOrDefault("method", "discountedCashFlow");
    if (econMethod != "discountedCashFlow")
        throw std::runtime_error("EconomicsPass: unknown method '" + econMethod
            + "'.  Implemented: discountedCashFlow (the only one -- straight-"
              "line or MACRS depreciation inside it is the separate"
              " `depreciation` key).");

    const std::string deprMethod   = econDict_->lookupWordOrDefault("depreciation", "straightLine");
    //  TAX ON A LOSS (C269 decision (2)): `credit` (absent = this, the reading
    //  every case had) or `none` (stand-alone); any other word refuses by
    //  name.  Read beside `method` and `depreciation`, the block's other words.
    const std::string taxOnLoss    = econDict_->lookupWordOrDefault("taxOnLoss", "credit");
    if (taxOnLoss != "credit" && taxOnLoss != "none")
        throw std::runtime_error("EconomicsPass: `taxOnLoss " + taxOnLoss + ";` --"
            " the reading of a loss year's tax is `credit` (the default: tau x the"
            " loss is a tax CREDIT, which assumes the owner has other taxable"
            " profit to set the loss against) or `none` (stand-alone: a loss"
            " year pays no tax and earns no credit; no loss carry-forward).");

    if (deprMethod != "straightLine")
        std::cerr << "EconomicsPass: depreciation '" << deprMethod
                  << "' not implemented (only straightLine) -- using straightLine.\n";

    // ---- 2.  Prices (constant/economics tier; refuse if absent) ---------
    bool priceFilePresent = false;
    DictPtr prices = loadPriceFile(priceFilePresent);

    auto missing = [&](const std::string& what) -> int
    {
        std::cerr << "\nEconomicsPass: REQUIRED PRICE MISSING -- " << what << "\n"
                  << "  Remedy: add it to the case-scoped 'constant/economics' file,\n"
                  << "  each value dated and primary-cited (provenance { origin; method; }).\n"
                  << "  No price ever defaults to a literal in code (glass-box policy).\n"
                  << "  To proceed anyway with loud-but-defaulted prices, set\n"
                  << "  'refuseOnMissingPrice 0;' in the economics{} postDict block.\n\n";
        return 1;
    };

    if (!priceFilePresent)
    {
        if (refuseOnMissing) return missing("the file 'constant/economics' does not exist");
        std::cerr << "EconomicsPass: 'constant/economics' absent and "
                     "refuseOnMissingPrice=0 -- proceeding with ZERO revenue and "
                     "raw-material cost (LOUD: the appraisal is CAPEX/utility only).\n";
    }

    // CEPCI-target consistency note: the CostingPass already updated every
    // C_BM to the target year via its own cepci/cepci2001 ratio; the FCI we
    // build here inherits that year.  We surface the costing year for audit.

    // ---- 3.  CAPEX ladder from result.costs (Turton Eq. 7.5) ------------
    //   C_BM°  (base CS, P=1, F_M=F_P=1) is recovered from the stored
    //   purchased cost and the B1/B2 factors:  C_BM° = Cp * (B1 + B2).
    scalar sum_C_BM  = 0.0;   // S C_BM,i   (actual material/pressure)
    scalar sum_C_BM0 = 0.0;   // S C_BM°,i  (base case)
    scalar sum_Cp    = 0.0;   // S purchased  (for the Lang cross-check)
    for (const auto& [uname, cb] : result.costs)
    {
        sum_C_BM += cb.bareModuleCost;
        sum_Cp   += cb.purchasedCost;

        const auto fB1 = cb.factors.find("B1");
        const auto fB2 = cb.factors.find("B2");
        //  A DECLARED QUOTE (DEV.md 4c C98) publishes its base value itself:
        //  its C_BM for a machine, ZERO for a facility (a building IS an
        //  auxiliary facility, so the siteFactor estimate of further ones
        //  must not multiply it).  No other record carries the key.
        const auto fBase = cb.factors.find("C_BM_base");
        if (fBase != cb.factors.end())
            sum_C_BM0 += fBase->second;
        else if (fB1 != cb.factors.end() && fB2 != cb.factors.end())
            sum_C_BM0 += cb.purchasedCost * (fB1->second + fB2->second);
        else
            sum_C_BM0 += cb.bareModuleCost;  // no base factors: conservative
    }

    //  WHICH PART OF THE CAPITAL IS THE CASE'S OWN QUOTES (DEV.md 4c C98),
    //  so the CAPEX lines below can say it; zero, and unprinted, on a case
    //  that declares none.
    scalar      quoted_C_BM  = 0.0, quoted_C_BM0 = 0.0;
    std::size_t nQuotes      = 0;
    for (const auto& [item, cb] : result.costs)
    {
        (void)item;
        auto fBase = cb.factors.find("C_BM_base");
        if (fBase == cb.factors.end()) continue;
        ++nQuotes;
        quoted_C_BM  += cb.bareModuleCost;
        quoted_C_BM0 += fBase->second;
    }

    //  THE BUILDING (E4), when declared: an installed facility, C_BM = the
    //  rooms' areas x their prices, entering the ladder like a `kind facility`
    //  quote -- contingencyFee x C_BM in the FCI, NOTHING in the siteFactor
    //  base.  Zero, and the sum unchanged to the last bit, when absent.
    const BuildingsDeclaration bldg = readBuildings(econDict_, result);
    const scalar FCI = contingencyFee * (sum_C_BM + bldg.cost)
                     + siteFactor * sum_C_BM0;
    //  WC = workingCapital x FCI, or the NET working capital when a model
    //  is declared, and TCI = FCI + WC: both computed in `appraise`.

    // Lang cross-check (solid-fluid 3.63 default) -- a reconciliation line
    // only; NEVER fed into the module-factor FCI (would double-count install).
    const scalar langFactor   = econDict_->lookupScalarOrDefault("langFactor", 3.63);
    const scalar FCI_Lang     = langFactor * sum_Cp;

    // ---- 4.  OPEX inputs -- the bills COM_d (Turton Eq. 8.1) is built from
    //  Gathered here, priced in `appraise` (the ONE home of the arithmetic,
    //  C68): the utility rows, the labour rate, the raw materials and the
    //  products, each refused here, in this order, when absent.
    AppraisalInputs baseIn;
    baseIn.FCI                    = FCI;
    baseIn.streamFactor           = streamFactor;
    baseIn.discountRate           = discountRate;
    baseIn.taxRate                = taxRate;
    baseIn.lossTaxCredit          = (taxOnLoss == "credit");
    baseIn.projectLife            = projectLife;
    baseIn.depreciableLife        = depreciableLife;
    baseIn.salvageFraction        = salvageFraction;
    baseIn.workingCapitalFraction = workingCapital;
    baseIn.wcModel                = wcModel;
    baseIn.timeline               = timeline;

    // C_UT: reuse the already-computed utility allocation (€/h) * annual H.
    //  SUM THE ALLOCATED ROWS, AND SAY WHAT WAS NOT (AS4).  This loop used
    //  to sum `eur_h` across EVERY row without consulting `a.allocated`,
    //  though its own comment said "allocated".  An unallocated row carries
    //  eur_h = 0, so with no utility catalogue loaded -- a documented, common
    //  case -- C_UT came out 0 EUR/yr and NPV/IRR printed strongly positive
    //  for a plant whose steam is free.  The printed line read
    //  "C_UT (utilities, allocated) = 0 EUR/yr": a zero, not a refusal, and
    //  the parenthetical actively asserted the completeness it did not have.
    //
    //  A number that cannot be computed is not zero.  The allocated rows are
    //  summed (in `appraise`); the unallocated ones are COUNTED and named,
    //  and the caller is told the utility bill is a LOWER BOUND rather than
    //  a cost.
    //
    //  A CARRIED DUTY IS NOT AN UNPRICED ONE (DEV.md 4c C52).  The loop used
    //  to count every unallocated row, and a carried row -- a process-process
    //  exchanger's recovered heat, a duty met by a utility stream or a heat
    //  link -- is unallocated BY DESIGN: there is nothing to buy.  So the
    //  green-ammonia FEHE was counted as one of "2 duties that could not be
    //  allocated" and its C_UT called a lower bound for a heat nobody pays
    //  for.  Only an UNSERVED duty (no catalogue utility can meet it) leaves a
    //  hole in the bill.
    //
    //  A CREDIT IS SUMMED, NEVER CLAMPED.  A row with a negative eur_h is heat
    //  or power the plant SELLS or reuses (steam raised in a waste-heat
    //  boiler, electricity generated); it reduces C_UT, and the credits are
    //  printed on their own line so a net bill never hides a gross one.
    std::size_t unpricedDuties = 0;
    for (const auto& a : result.utilityAllocation)
    {
        if (a.allocated)
            baseIn.utilityEurH.emplace_back(a.utility, a.eur_h);  // €/h
        else if (!a.carried) ++unpricedDuties;  // a real duty nobody could price
    }
    if (unpricedDuties)
    {
        std::cerr << "[economics] " << unpricedDuties << " heat duty/duties"
                     " could not be allocated to a catalogue utility, so they"
                     " are NOT in C_UT.\n            The utility bill below is"
                     " a LOWER BOUND, and every figure derived from it"
                     " (COM_d, NPV, IRR) inherits that.\n            Load a"
                     " utility catalogue, or declare the missing service, to"
                     " make it a cost.\n";
        AdvisoryLog::instance().add("economics", "warning", "unpriced-utility",
                                    std::to_string(unpricedDuties) +
                                    " duty/duties absent from C_UT");
    }

    // C_OL: operating labour, Turton Eq. 8.3.
    //   N_OL = (6.29 + 31.7*P^2 + 0.23*N_np)^0.5  operators per shift;
    //   ~4.5 shift-positions cover one operating position around the clock;
    //   labour rate (€/h) from constant/economics.
    //
    //  THE PARTICULATE TERM (DEV.md 4c C98, Vitor's ruling 2026-10-18: "P
    //  declarado pelo caso").  P is the number of processing steps that
    //  handle PARTICULATE SOLIDS -- transport, size control, particulate
    //  removal, in Turton's own examples -- and N_np the non-particulate ones.
    //  This line used to read sqrt(6.29 + 0.23 N_np): the P term was dropped,
    //  so a plant that dries, blends, compacts, mills, tablets and coats was
    //  staffed like a fluid plant.  It is not the engine's to count: a step
    //  is a judgement about the plant (a flowsheet placeholder may be two
    //  steps, a unit may be none), so the case DECLARES it,
    //
    //      particulateSteps { count 6; source "..."; reason "..."; }
    //
    //  and absent it P = 0 -- every case that predates the term computes
    //  exactly what it did.  A P = 0 that was NOT declared is ANNOUNCED when
    //  the flowsheet holds a unit whose type handles particulate solids
    //  (`particulateUnitTypes` below), because there the zero is the engine's
    //  choice, not the author's; a declared value announces nothing.
    //
    //  THE DECLARED CREW (DEV.md 4c C98 round 2, Vitor's ruling 2026-10-19:
    //  "Equipa declarada pelo caso").  Turton's correlation is a regression
    //  over CONTINUOUS chemical plants; a campaign suite, a batch line or a
    //  pilot plant is staffed room by room, and its operators per shift are
    //  a fact the case can state.  So a case may DECLARE its crew,
    //
    //      operatingCrew
    //      {
    //          areas ( { area "solvent section"; operatorsPerShift 1; } ... );
    //          source "...";  reason "...";
    //      }
    //
    //  and the labour is then SUM operatorsPerShift through the SAME
    //  positions factor and the SAME wage arithmetic the correlation route
    //  uses (`positionsPerOperatorPerShift`, `appraise`).  The correlation is
    //  still computed -- with the declared or the absent P -- and PRINTED
    //  beside it as a COMPARISON that enters no total.  `particulateSteps`
    //  and `operatingCrew` coexist: P then drives only that comparison.
    //  Absent the block, nothing here is read and nothing is printed.
    struct CrewArea { std::string name; scalar operatorsPerShift = 0.0; };
    std::vector<CrewArea> crewAreas;
    bool        crewDeclared = false;
    std::string crewSource, crewReason;
    if (econDict_->found("operatingCrew"))
    {
        const std::string where = "economics { operatingCrew { ... } }";
        if (!std::holds_alternative<DictPtr>(econDict_->entryValue("operatingCrew")))
            throw std::runtime_error("economics: `operatingCrew` must be a block"
                " -- `operatingCrew { areas ( { area \"...\"; operatorsPerShift"
                " <n>; } ... ); source \"...\"; reason \"...\"; }`.");
        const DictPtr cd = econDict_->subDict("operatingCrew");
        for (const char* key : { "source", "reason" })
            if (!cd->found(key) || cd->lookupWord(key).empty())
                throw std::runtime_error(where + ": `" + key + " \"...\";` is"
                    " not declared -- a declared crew is the case's staffing"
                    " plan in place of Turton's correlation, and it owes its"
                    " reader where the numbers come from (`source`) and why"
                    " they are this plant's (`reason`).  Nothing is defaulted.");
        crewSource = cd->lookupWord("source");
        crewReason = cd->lookupWord("reason");
        if (!cd->found("areas"))
            throw std::runtime_error(where + ": `areas ( ... );` is not declared"
                " -- one `{ area \"<name>\"; operatorsPerShift <n>; }` per"
                " staffed area.");
        //  `areas ( );` parses as an empty list of SCALARS, not of blocks, so
        //  the empty case is told apart here before the typed read.
        const EntryValue& av = cd->entryValue("areas");
        const bool emptyList =
            (std::holds_alternative<std::vector<scalar>>(av)
                 && std::get<std::vector<scalar>>(av).empty())
            || (std::holds_alternative<std::vector<std::string>>(av)
                 && std::get<std::vector<std::string>>(av).empty());
        const std::vector<DictPtr> al =
            emptyList ? std::vector<DictPtr>{} : cd->lookupDictList("areas");
        if (al.empty())
            throw std::runtime_error(where + ": `areas` is EMPTY -- a crew of"
                " nobody is not a staffing plan.  Declare at least one area, or"
                " delete the block and the correlation is used.");
        std::set<std::string> names;
        for (const auto& a : al)
        {
            if (!a->found("area") || a->lookupWord("area").empty())
                throw std::runtime_error(where + ": an `areas` entry has no"
                    " `area \"<name>\";`.");
            CrewArea ca;
            ca.name = a->lookupWord("area");
            if (!names.insert(ca.name).second)
                throw std::runtime_error(where + ": area \"" + ca.name + "\" is"
                    " declared TWICE -- one area, one crew.  Merge the two"
                    " entries.");
            if (!a->found("operatorsPerShift"))
                throw std::runtime_error(where + ": area \"" + ca.name + "\" has"
                    " no `operatorsPerShift`.");
            ca.operatorsPerShift = a->lookupScalar("operatorsPerShift");
            if (!(ca.operatorsPerShift > 0.0)
                || std::fabs(ca.operatorsPerShift
                             - std::round(ca.operatorsPerShift)) > 1e-9)
            {
                std::ostringstream m;
                m << where << ": area \"" << ca.name << "\" declares `operatorsPerShift "
                  << ca.operatorsPerShift << ";` -- operators are whole people, one"
                     " or more (an area nobody staffs is left out).";
                throw std::runtime_error(m.str());
            }
            crewAreas.push_back(ca);
        }
        crewDeclared = true;
    }

    scalar P_particulate = 0.0;
    bool   P_declared    = false;
    std::string P_source, P_reason;
    if (econDict_->found("particulateSteps"))
    {
        const std::string where = "economics { particulateSteps { ... } }";
        if (!std::holds_alternative<DictPtr>(econDict_->entryValue("particulateSteps")))
            throw std::runtime_error("economics: `particulateSteps` must be a"
                " block -- `particulateSteps { count <steps>; source \"...\";"
                " reason \"...\"; }` -- because the count is an assumption the"
                " case owes its reader a source and a reason for.");
        const DictPtr pd = econDict_->subDict("particulateSteps");
        if (!pd->found("count"))
            throw std::runtime_error(where + ": `count` is not declared -- the"
                " number of processing steps that handle particulate solids"
                " (Turton's P in N_OL = (6.29 + 31.7 P^2 + 0.23 N_np)^0.5).");
        P_particulate = pd->lookupScalar("count");
        if (!(P_particulate >= 0.0)
            || std::fabs(P_particulate - std::round(P_particulate)) > 1e-9)
        {
            std::ostringstream m;
            m << where << ": `count " << P_particulate << ";` -- a number of"
                 " processing steps is a whole number, zero or more.";
            throw std::runtime_error(m.str());
        }
        for (const char* key : { "source", "reason" })
            if (!pd->found(key) || pd->lookupWord(key).empty())
                throw std::runtime_error(where + ": `" + key + " \"...\";` is"
                    " not declared -- which steps were counted and where the"
                    " count comes from (`source`), and why it is this plant's"
                    " (`reason`).  Nothing is defaulted.");
        P_source   = pd->lookupWord("source");
        P_reason   = pd->lookupWord("reason");
        P_declared = true;
    }
    else
    {
        //  The registered unit types whose model handles particulate solids
        //  (UnitOperation.cpp registerBuiltins; each class's own header says
        //  so): the dryers (SprayDryer.H, SolidDryer.H, ConvectiveDryer.H,
        //  EvaporativeDryer.H), the crystalliser (Crystalliser.H -- it MAKES
        //  the particles), pneumatic conveying (PneumaticConveyor.H), and
        //  the gas-solid separators (Cyclone.H, BagFilter.H,
        //  GasSolidSplitter.H).  A `mixer` or `splitter` carrying solids is
        //  NOT listed: they are generic, and a fluid plant has dozens.
        static const std::set<std::string> particulateUnitTypes = {
            "sprayDryer", "solidDryer", "convectiveDryer", "evaporativeDryer",
            "crystalliser", "pneumaticConveyor",
            "cyclone", "bagFilter", "gasSolidSplitter" };
        std::string seen;
        for (const auto& fu : result.topology)
            if (particulateUnitTypes.count(fu.type))
                seen += (seen.empty() ? "" : ", ") + fu.name + " (" + fu.type + ")";
        //  With a DECLARED crew, P drives only the printed comparison, and the
        //  comparison line itself says P was not declared -- so the zero is
        //  not the labour's and is not announced.
        if (!seen.empty() && !crewDeclared)
        {
            const std::string m =
                "particulateSteps was NOT declared, so the operator count takes"
                " P = 0 particulate-solids processing steps (Turton Eq. 8.3,"
                " N_OL = (6.29 + 31.7 P^2 + 0.23 N_np)^0.5) -- and this"
                " flowsheet holds units that handle particulate solids: " + seen
                + ".  Declare `particulateSteps { count <steps>; source \"...\";"
                  " reason \"...\"; }` in the economics block to own the count"
                  " (it is the case's judgement which steps count, so the"
                  " engine does not count them).";
            if (AdvisoryLog::instance().add("assumed", "warning", "economics", m))
                std::cout << "  [assumed] economics: " << m << "\n";
        }
    }
    const scalar N_OL_per_shift =
        std::sqrt(6.29 + 31.7 * P_particulate * P_particulate + 0.23 * N_np);
    //  THE ONE HOME of the positions factor: ~4.5 shift-positions cover one
    //  operating position around the clock.  Both routes -- the correlation
    //  and a declared crew -- go through it.
    constexpr scalar positionsPerOperatorPerShift = 4.5;
    scalar crewPerShift = 0.0;
    for (const auto& a : crewAreas) crewPerShift += a.operatorsPerShift;
    //  The operators per shift that PRICE the labour: the declared crew when
    //  there is one, else the correlation.
    const scalar operatorsPerShiftUsed = crewDeclared ? crewPerShift : N_OL_per_shift;
    const scalar operatorsTotal =
        positionsPerOperatorPerShift * operatorsPerShiftUsed;   // operating positions
    const scalar operatorsTotalCorrelation =
        positionsPerOperatorPerShift * N_OL_per_shift;         // the comparison
    scalar labourRate = 0.0;      // €/h
    bool   haveLabour = false;
    if (prices && prices->found("labourRate"))
    {
        labourRate = prices->lookupScalar("labourRate");
        haveLabour = true;
    }
    if (!haveLabour)
    {
        if (refuseOnMissing) return missing("labourRate (€/h, e.g. Eurostat/BLS chem sector)");
        std::cerr << "EconomicsPass: labourRate absent -- C_OL set to 0 (LOUD).\n";
    }
    // Labour cost = total operating positions * annual salary per operator.
    // The salary is the LOADED hourly rate * the hours ONE operator works in a
    // year (operatorAnnualHours, ~1960 h = 49 wk x 40 h, Eurostat/BLS basis) --
    // NOT the plant's annual operating hours H.  (Conflating the two would pay
    // each operator the full 7884 plant-hours, a ~4x overstatement: the bug
    // this guards against.  Turton Sec. 8 cross-check: ~66 kUSD/yr/operator.)
    const scalar operatorAnnualHours =
        econDict_->lookupScalarOrDefault("operatorAnnualHours", 1960.0);
    baseIn.labourRate          = labourRate;
    baseIn.operatorsTotal      = operatorsTotal;
    baseIn.operatorAnnualHours = operatorAnnualHours;

    // C_RM: raw materials.  Each `rawMaterials ( { stream; price; } ... )`
    // entry prices a feed stream's mass flow.
    if (prices && prices->found("rawMaterials"))
    {
        for (const auto& rm : prices->lookupDictList("rawMaterials"))
        {
            PricedStream ps;
            ps.stream = rm->lookupWord("stream");
            ps.price  = rm->lookupScalar("price");           // €/kg
            ps.massFlow = streamMassFlow(result, ps.stream); // kg/s
            ps.provenance = rm->found("provenance")
                ? rm->subDict("provenance")->lookupWordOrDefault("origin", "")
                : "";
            baseIn.rawMats.push_back(std::move(ps));
        }
    }
    //  (2a) Every raw-material inlet must be NAMED by an entry (priced, or
    //  free with `price 0;` and its provenance) -- see
    //  `unpricedRawMaterialInlets`.  Only when a price file exists: its
    //  absence was handled above, and with `refuseOnMissingPrice 0` the
    //  unnamed inlets are announced and left out, as every other loud default.
    if (priceFilePresent)
    {
        std::vector<std::string> named;
        for (const auto& ps : baseIn.rawMats) named.push_back(ps.stream);
        const auto unnamed = unpricedRawMaterialInlets(result, named);
        if (!unnamed.empty())
        {
            std::string list;
            for (const auto& u : unnamed) list += (list.empty() ? "" : ", ") + u;
            const std::string what =
                "the raw-material price of boundary inlet(s) " + list
                + ".\n  These streams enter the plant and no `rawMaterials` entry names them, so"
                  " C_RM would silently leave them out.\n  Declare each in constant/economics:"
                  " `{ stream <name>; price <EUR/kg>; costYear <y>; provenance { origin \"...\";"
                  " method \"...\"; } }`,\n  or, if it is genuinely free (air, process water on"
                  " site), the same entry with `price 0;` and the provenance saying why.";
            if (refuseOnMissing) return missing(what);
            std::cerr << "EconomicsPass: " << what << "\n  refuseOnMissingPrice=0 -- these"
                         " inlets are left out of C_RM (LOUD).\n";
        }
    }

    // ---- 5.  Revenue ----------------------------------------------------
    if (prices && prices->found("products"))
    {
        for (const auto& pr : prices->lookupDictList("products"))
        {
            PricedStream ps;
            ps.stream   = pr->lookupWord("stream");
            ps.price    = pr->lookupScalar("price");           // €/kg
            ps.massFlow = streamMassFlow(result, ps.stream);   // kg/s
            ps.provenance = pr->found("provenance")
                ? pr->subDict("provenance")->lookupWordOrDefault("origin", "")
                : "";
            baseIn.products.push_back(std::move(ps));
        }
    }
    const std::vector<PricedStream>& products = baseIn.products;
    if (products.empty())
    {
        if (refuseOnMissing && priceFilePresent)
            return missing("at least one 'products ( { stream; price; } )' entry");
        std::cerr << "EconomicsPass: no priced products -- revenue R = 0 (LOUD: "
                     "NPV/IRR will be a pure cost stream, not an appraisal).\n";
    }

    // ---- 5a. THE LAND (C82), read and checked BEFORE any number is printed.
    //  Absent, nothing is read and nothing said.  See `readLand` for the
    //  grammar, the area's one home and the placement in the cash flow.
    const LandDeclaration landDecl = readLand(econDict_, result);
    if (landDecl.present)
    {
        baseIn.landPresent = true;
        baseIn.landPrice   = landDecl.price;
        baseIn.landArea    = landDecl.area;
    }

    // ---- 5a''. THE ROYALTY (E5b), read and checked BEFORE any number is
    //  printed.  Absent, nothing is read and nothing said.
    baseIn.royalty = readRoyalty(econDict_);

    // ---- 5a'. THE FINANCING (G4), read and checked BEFORE any number is
    //  printed.  Absent, nothing is read and nothing said.  See
    //  `readFinancing` for the grammar and every convention.
    baseIn.fin = readFinancing(econDict_, static_cast<int>(std::lround(projectLife)),
                               discountRate);
    const FinancingDeclaration& fin = baseIn.fin;

    // ---- 5b. The sensitivity block (C68), read and checked BEFORE any
    //  number is printed, so a malformed declaration refuses the appraisal
    //  instead of trailing it.  Absent, nothing is read and nothing said.
    std::vector<SensitivityInput> sensitivity;
    if (econDict_->found("sensitivity"))
    {
        if (!std::holds_alternative<DictPtr>(econDict_->entryValue("sensitivity")))
            throw std::runtime_error("economics: `sensitivity` must be a block,"
                " `sensitivity { FCI { relative accuracyBand; } ... }`.");
        sensitivity = readSensitivity(econDict_->subDict("sensitivity"), baseIn);
    }

    // ---- 6-8b.  THE APPRAISAL: bills, COM_d, working capital (built up
    //  when declared, C44 slice 4), the DCF timeline (C63), NPV, IRR,
    //  paybacks and the year-by-year table -- ONE call to the ONE home.
    const AppraisalOutcome base = appraise(baseIn, result, /*verbose*/ true);
    const scalar H             = base.H;
    const scalar C_OL          = base.C_OL;
    const scalar C_RM          = base.C_RM;
    const scalar C_UT          = base.C_UT;
    const scalar C_UT_credit   = base.C_UT_credit;
    const scalar C_WT          = base.C_WT;
    const scalar COM_d         = base.COM_d;
    const scalar R             = base.R;
    const scalar WC            = base.WC;
    const scalar TCI           = base.TCI;
    const WorkingCapitalBuildUp& wcb = base.wcb;
    const scalar d_annual      = base.d_annual;
    const int    Nc            = base.Nc;
    const int    Nlife         = base.Nlife;
    const scalar startupCost   = base.startupCost;
    const scalar NPV           = base.NPV;
    const scalar IRR           = base.IRR;
    const bool   haveIRR       = base.haveIRR;
    const bool   irrAmbiguous  = base.irrAmbiguous;
    const int    cumSignChanges = base.cumSignChanges;
    const scalar discPayback   = base.discPayback;
    const scalar simplePayback = base.simplePayback;
    const scalar NPV_projectStart = base.NPV_projectStart;
    const std::vector<CashFlowYear>& cashFlowRows = base.cashFlowRows;

    // ---- 9.  Report (glass-box: every term on its own printed line) -----
    //  THE ACCURACY BAND COMES FROM ONE HOME, AND A DECLARED ONE IS THE
    //  AUTHOR'S (2026-09-25).  This used to be a two-branch step whose
    //  comparison was INVERTED -- `estimateClass <= 4` selected the WIDE
    //  band, so the crudest class printed the narrowest interval and
    //  Classes 1 through 4 all printed the same one.  It also disagreed with
    //  the hand-written table in `docs/design-heuristics.md`: two homes for
    //  one fact, neither of them the standard.  `EstimateClass.H` is the one
    //  home now and carries 18R-97's own RANGE OF RANGES; the standard says
    //  the band "should always be determined through risk analysis of the
    //  specific project and should never be pre-determined", so a case may
    //  DECLARE it and the engine announces when it has supplied one instead.
    scalar acc_lo = ecl->accLoWide;
    scalar acc_hi = ecl->accHiWide;
    if (econDict_ && econDict_->found("accuracyBand"))
    {
        const std::vector<scalar> band = econDict_->lookupList("accuracyBand");
        if (band.size() != 2 || band[0] >= 0.0 || band[1] <= 0.0)
            throw std::runtime_error(
                "economics: `accuracyBand` must be a list of exactly two"
                " numbers, a NEGATIVE low and a POSITIVE high, in per cent --"
                " e.g. `accuracyBand ( -25 40 );`.  AACE 18R-97 gives Class-"
                + std::to_string(ecl->cls) + " the ranges L "
                + fmtPct(ecl->accLoNarrow) + " to " + fmtPct(ecl->accLoWide)
                + " and H +" + fmtPct(ecl->accHiNarrow) + " to +"
                + fmtPct(ecl->accHiWide)
                + "; the point inside that box is this project's risk"
                  " analysis, not the class's.");
        acc_lo = band[0];
        acc_hi = band[1];
    }
    else
    {
        const std::string m =
            "accuracyBand was NOT declared, so this appraisal reports the"
            " PESSIMISTIC CORNER of AACE 18R-97's Class-"
            + std::to_string(ecl->cls) + " range of ranges ("
            + fmtPct(acc_lo) + " % / +" + fmtPct(acc_hi) + " %).  The"
            " standard gives a range of ranges, not a pair -- L "
            + fmtPct(ecl->accLoNarrow) + " to " + fmtPct(ecl->accLoWide)
            + " and H +" + fmtPct(ecl->accHiNarrow) + " to +"
            + fmtPct(ecl->accHiWide) + " -- and says the accuracy \"should"
            " always be determined through risk analysis of the specific"
            " project and should never be pre-determined\".  Declare"
            " `accuracyBand ( lo hi );` to own it.";
        if (AdvisoryLog::instance().add("assumed", "warning", "economics", m))
            std::cout << "  [assumed] economics: " << m << "\n";
    }

    std::cout << std::fixed;
    std::cout << "\n=======================  Economic Appraisal  ========================\n";
    std::cout << "  AACE Class-" << estimateClass << " estimate -- accuracy band "
              << std::setprecision(0) << acc_lo << "% / +" << acc_hi << "%\n";
    if (sfFromPlan)
        std::cout << "  Equivalent hours H = Q / r_P = "
                  << std::setprecision(2) << result.batchPlan.productPerYear
                  << " kg/yr / " << std::setprecision(6)
                  << result.batchPlan.productRate << " kg/h = "
                  << std::setprecision(0) << H << " h/yr  (streamFactor "
                  << std::setprecision(6) << streamFactor
                  << ", from the batch plan: the flowsheet is the balance per"
                     " unit of product)\n";
    else
        std::cout << "  Operating hours H = streamFactor x 8760 = "
                  << std::setprecision(2) << streamFactor << " x 8760 = "
                  << std::setprecision(0) << H << " h/yr\n";

    std::cout << "\n  -- CAPEX (Turton Eq. 7.5) ------------------------------------\n";
    std::cout << std::setprecision(0);
    std::cout << "    SUM C_BM           " << std::setw(16) << sum_C_BM  << " EUR\n";
    std::cout << "    SUM C_BM_base      " << std::setw(16) << sum_C_BM0 << " EUR  (CS, P=1)\n";
    std::cout << "    FCI = " << std::setprecision(2) << contingencyFee
              << "*SC_BM + " << siteFactor << "*SC_BM_base = "
              << std::setprecision(0) << std::setw(14) << FCI << " EUR\n";
    if (nQuotes)
        //  THE CASE'S OWN QUOTES INSIDE THE TWO SUMS (C98), printed only when
        //  declared, so every other case's ladder reads as it did.
        std::cout << "      of which DECLARED QUOTES (" << nQuotes << " item(s)):"
                     " SC_BM " << quoted_C_BM << " EUR, SC_BM_base "
                  << quoted_C_BM0 << " EUR  (a facility adds nothing to the"
                     " base; see the costing table)\n";
    if (bldg.present)
    {
        //  THE BUILDING (E4): its arithmetic, its placement, its lower bound.
        const std::ios::fmtflags keep = std::cout.flags();
        std::cout << "    Building (" << bldg.nRooms << " room(s), "
                  << std::setprecision(1) << bldg.area << " m2 of room area)"
                  << "  C_BM = " << std::setprecision(0) << std::right
                  << std::setw(12) << bldg.cost << " EUR\n";
        for (const auto& kv : bldg.areaByGrade)
            std::cout << "      grade " << std::left << std::setw(4)
                      << (kv.first.empty() ? std::string("-") : kv.first)
                      << std::right << std::setw(10) << std::setprecision(1)
                      << kv.second << " m2  ->  " << std::setprecision(0)
                      << std::setw(12) << bldg.costByGrade.at(kv.first)
                      << " EUR\n";
        std::cout << "      an installed FACILITY: in SC_BM (x " << std::setprecision(2)
                  << contingencyFee << " = " << std::setprecision(0)
                  << contingencyFee * bldg.cost << " EUR in the FCI), nothing in"
                     " SC_BM_base; depreciated WITH THE PLANT (straight line),"
                     " inside FCI, TCI and 0.180 FCI\n"
                  << "      area = the sum of the declared rooms' floor areas on"
                     " every floor (walls, corridors and stairwells not listed"
                     " as rooms are NOT counted: a lower bound)\n"
                  << "      price: " << bldg.source << "\n";
        std::cout.flags(keep);
    }
    if (!wcb.present)
        std::cout << "    WC  = " << std::setprecision(2) << workingCapital
                  << "*FCI              = "
                  << std::setprecision(0) << std::setw(14) << WC  << " EUR\n";
    else
        std::cout << "    WC  = net working capital    = "
                  << std::setprecision(0) << std::setw(14) << WC
                  << " EUR  (built up below; fundo de maneio)\n";
    std::cout << "    TCI = FCI + WC               = " << std::setw(14) << TCI << " EUR\n";
    if (landDecl.present)
    {
        //  THE LAND (C82), on its own line and NOT in TCI: a third capital
        //  line, invested and recovered on its own dates.  The stream's
        //  alignment is restored after, so nothing printed below moves.
        const std::ios::fmtflags keep = std::cout.flags();
        std::cout << "    Land = " << std::setprecision(4) << landDecl.price
                  << " EUR/m2 x " << std::setprecision(1) << landDecl.area
                  << " m2  = " << std::setprecision(0) << std::right << std::setw(14) << base.land
                  << " EUR  (area: " << landDecl.areaSentence() << ")\n"
                  << "      bought at the START of construction (t = " << -Nc
                  << "), NOT depreciated, recovered at its purchase value,"
                     " untaxed, at the end of year " << Nlife
                  << "; NOT in TCI\n"
                  << "      price: " << landDecl.source << "\n";
        std::cout.flags(keep);
    }
    std::cout << "    [Lang cross-check] " << std::setprecision(2) << langFactor
              << "*SCp = " << std::setprecision(0) << FCI_Lang
              << " EUR  (purchased-based; NOT used in FCI)\n";

    std::cout << "\n  -- OPEX (Turton Eq. 8.1, COM_d) ------------------------------\n";
    std::cout << "    0.180 x FCI                  = " << std::setw(14) << 0.180 * FCI << " EUR/yr\n";
    //  A DECLARED CREW (C98 round 2) prices the labour; its arithmetic is
    //  printed first, area by area, and the correlation follows it as a
    //  COMPARISON that enters no total.  Absent a crew, the correlation line
    //  is printed exactly as it was.
    if (crewDeclared)
    {
        std::cout << "    operating crew, DECLARED:";
        for (std::size_t i = 0; i < crewAreas.size(); ++i)
            std::cout << (i ? " + " : " ") << crewAreas[i].name << " "
                      << std::setprecision(0) << crewAreas[i].operatorsPerShift;
        std::cout << " = " << std::setprecision(0) << crewPerShift
                  << "/shift -> " << std::setprecision(1) << operatorsTotal
                  << " operating positions (x "
                  << positionsPerOperatorPerShift << ")\n"
                  << "      source: " << crewSource << "\n"
                  << "      reason: " << crewReason << "\n";
    }
    //  THE PARTICULATE TERM IS ON THE LINE (C98), declared or not, so the
    //  arithmetic printed is the arithmetic done.
    std::cout << (crewDeclared ? "    [comparison, enters NO total] " : "    ")
              << "N_OL = sqrt(6.29 + 31.7 x P^2 + 0.23 x N_np) = sqrt(6.29 + 31.7 x "
              << std::setprecision(0) << P_particulate << "^2 + 0.23 x "
              << std::setprecision(1) << N_np
              << ") = " << std::setprecision(2) << N_OL_per_shift
              << "/shift -> " << std::setprecision(1) << operatorsTotalCorrelation
              << " operating positions";
    if (crewDeclared && !P_declared)
        std::cout << "  (P = 0: particulateSteps NOT declared)";
    std::cout << "\n";
    if (P_declared)
        std::cout << "      P = " << std::setprecision(0) << P_particulate
                  << " particulate-solids steps, DECLARED -- source: " << P_source
                  << "\n      reason: " << P_reason << "\n";
    std::cout << "    salary/operator = " << std::setprecision(0) << labourRate
              << " EUR/h x " << operatorAnnualHours << " h/yr = "
              << std::setw(0) << (labourRate * operatorAnnualHours) << " EUR/yr\n";
    std::cout << std::setprecision(0);
    std::cout << "    C_OL (labour)                = " << std::setw(14) << C_OL << " EUR/yr\n";
    //  THE CORRELATION'S LABOUR, BESIDE A DECLARED CREW (C98 round 2): the
    //  priced C_OL scaled by the ratio of positions, so the wage arithmetic
    //  keeps its one home in `appraise`.  It enters no total.
    const scalar C_OL_correlation =
        (crewDeclared && operatorsTotal > 0.0)
        ? C_OL * operatorsTotalCorrelation / operatorsTotal : C_OL;
    if (crewDeclared)
        std::cout << "      [comparison, enters NO total] C_OL by the correlation = "
                  << std::setw(0) << C_OL_correlation << " EUR/yr\n";
    std::cout << "    2.73  x C_OL                 = " << std::setw(14) << 2.73 * C_OL << " EUR/yr\n";
    std::cout << "    C_RM (raw materials)         = " << std::setw(14) << C_RM << " EUR/yr\n";
    //  The LABEL must not assert a completeness the number does not have.
    std::cout << "    "
              << (unpricedDuties ? "C_UT (utilities, LOWER BOUND)"
                                 : "C_UT (utilities, allocated)  ")
              << "= " << std::setw(14) << C_UT << " EUR/yr";
    if (unpricedDuties)
        std::cout << "   <-- " << unpricedDuties
                  << " duty/duties unpriced and NOT included";
    std::cout << "\n";
    if (C_UT_credit < 0.0)
        std::cout << "      of which CREDITS         = " << std::setw(14) << C_UT_credit
                  << " EUR/yr  (steam raised / power generated; purchases = "
                  << (C_UT - C_UT_credit) << " EUR/yr)\n";
    std::cout << "    C_WT (waste)  NOT COSTED     = " << std::setw(14) << C_WT
              << " EUR/yr  (explicit zero -- effluent/solids unpriced)\n";
    std::cout << "    1.23  x (C_RM+C_UT+C_WT)     = " << std::setw(14)
              << 1.23 * (C_RM + C_UT + C_WT) << " EUR/yr\n";
    std::cout << "    COM_d (total)                = " << std::setw(14) << COM_d
              << " EUR/yr   [depreciation NOT included]\n";

    std::cout << "\n  -- Revenue ---------------------------------------------------\n";
    for (const auto& p : products)
        std::cout << "    " << std::left << std::setw(18) << p.stream << std::right
                  << " " << std::setprecision(4) << p.massFlow << " kg/s x "
                  << p.price << " EUR/kg  -> " << std::setprecision(0)
                  << std::setw(12) << (p.price * p.massFlow * 3600.0 * H) << " EUR/yr\n";
    std::cout << "    R (total revenue)            = " << std::setw(14) << R << " EUR/yr\n";

    //  THE GROSS MARGIN, BEFORE ANY CAPITAL (DEV.md 4c C57).  A design is
    //  screened on its margin before it is costed: R - C_RM is the margin of
    //  a route on paper (stoichiometry and prices), and R - C_RM - C_UT is
    //  the margin once the heat and power the balances demand are priced.
    //  Both are the SAME R, C_RM and C_UT printed above -- no second
    //  arithmetic -- and neither depends on FCI, labour or COM_d's factors.
    //  The second inherits C_UT's completeness: an unpriced duty makes it an
    //  UPPER bound, and the label says so.
    const scalar grossMargin_RM    = R - C_RM;
    const scalar grossMargin_RM_UT = R - C_RM - C_UT;
    std::cout << "\n  -- Gross margin (no capital, no labour) ------------------------\n";
    std::cout << "    R - C_RM                     = " << std::setw(14) << grossMargin_RM
              << " EUR/yr\n";
    std::cout << "    R - C_RM - C_UT              = " << std::setw(14) << grossMargin_RM_UT
              << " EUR/yr"
              << (unpricedDuties ? "   <-- an UPPER bound: C_UT omits unpriced duties" : "")
              << "\n";

    if (wcb.present)
    {
        std::cout << "\n  -- Working capital, built up (what the plant holds and owes) --\n"
                     "    WORKING CAPITAL is the money a running plant keeps tied up in"
                     " things that\n"
                     "    are not equipment: the material in its tanks and vessels, what"
                     " its customers\n"
                     "    still owe it, and the cash it keeps to pay its bills.  Their sum"
                     " is the GROSS\n"
                     "    working capital -- the current assets (capital circulante).  Part"
                     " of it is\n"
                     "    financed by the suppliers, who are paid later than they deliver"
                     " (payables, a\n"
                     "    current liability); what is left is the NET working capital"
                     " (fundo de maneio),\n"
                     "    the part the owners must put in.  It is invested once, at"
                     " start-up, and\n"
                     "    recovered when the plant stops, so the cash flow below carries"
                     " the NET figure\n"
                     "    at year 0 and returns it in the last year.  Everything held is"
                     " valued at COST.\n";
        std::cout << "    production cost = COM_d / annual product mass = "
                  << std::setprecision(4) << wcb.productionCostPerKg
                  << " EUR/kg\n" << std::setprecision(0);
        for (const auto& a : wcb.assets)
            std::cout << "    + " << std::left << std::setw(38) << a.label
                      << std::right << std::setw(14) << a.value << " EUR   ("
                      << a.rule << ")\n";
        std::cout << "    = GROSS working capital (capital circulante)"
                  << std::setw(10) << wcb.gross << " EUR\n";
        for (const auto& l : wcb.liabilities)
            std::cout << "    - " << std::left << std::setw(38) << l.label
                      << std::right << std::setw(14) << l.value << " EUR   ("
                      << l.rule << ")\n";
        std::cout << "    = NET working capital (fundo de maneio)    "
                  << std::setw(10) << wcb.net << " EUR   <- the WC in the cash flow\n";
        std::cout << "    for comparison, the fraction rule this replaces: "
                  << std::setprecision(2) << wcb.fractionUsed << " x FCI = "
                  << std::setprecision(0) << wcb.fractionRule << " EUR\n";
    }

    std::cout << "\n  -- DCF (straight-line depreciation) --------------------------\n";
    std::cout << "    depreciation d = FCI/" << std::setprecision(0) << depreciableLife
              << "         = " << std::setw(14) << d_annual << " EUR/yr\n";
    std::cout << "    tax rate tau                 = " << std::setprecision(3)
              << taxRate << "\n";
    //  TAX ON A LOSS (C269 decision (2)): the reading is printed on every
    //  run; when a loss year exists it is ANNOUNCED into the caveat block
    //  and the result, with the size of what it assumes.
    std::cout << "    tax on a loss                = " << taxOnLoss
              << (econDict_->found("taxOnLoss") ? " (declared)" : " (the default)")
              << (taxOnLoss == "credit"
                    ? ": a loss year's tax is a CREDIT, tau x the loss\n"
                    : ": a loss year pays no tax and earns no credit (stand-alone)\n");
    if (base.lossYears > 0)
    {
        const std::string cur = result.costs.empty()
            ? std::string("EUR") : result.costs.begin()->second.currency;
        std::ostringstream m;
        m << std::fixed << std::setprecision(0);
        if (taxOnLoss == "credit")
            m << base.lossYears << " operating year(s) have a NEGATIVE taxable"
                 " income and are credited tax: " << base.taxCreditTotal << " "
              << cur << " over the project (" << base.taxCreditDiscounted
              << " " << cur << " discounted to start-up, i.e. of the NPV)."
                 "  This assumes the owner has OTHER taxable profit to set the"
                 " loss against (a group's return); a stand-alone project has"
                 " none.  Declare `taxOnLoss none;` for the stand-alone"
                 " reading (no credit; a loss carry-forward is not modelled).";
        else
            m << base.lossYears << " operating year(s) have a NEGATIVE taxable"
                 " income and pay no tax (`taxOnLoss none;`, the stand-alone"
                 " reading): the loss earns no credit and is not carried"
                 " forward against later profits (not modelled), so the later"
                 " years' tax is not reduced by it.";
        if (AdvisoryLog::instance().add("assumed",
                taxOnLoss == "credit" ? "warning" : "info", "economics", m.str()))
            std::cout << "  [assumed] economics: " << m.str() << "\n";
    }
    std::cout << "    discount rate i              = " << discountRate << "\n";
    std::cout << "    project life N               = " << std::setprecision(0)
              << projectLife << " yr\n";
    if (timeline.extended)
    {
        //  THE START-UP YEARS (C63), printed so every number the table below
        //  carries can be redone by hand.  Silent when nothing was declared,
        //  so a one-year case prints exactly what it did.
        std::cout << "    construction period Nc       = " << Nc
                  << " yr; capital at the END of each construction year: "
                  << fmtList(timeline.capitalSchedule) << " x FCI\n"
                  << "    year 0 = end of construction (start-up); construction"
                     " years are t = " << (1 - Nc) << ".." << 0
                  << ": discounted by 1/(1+i)^t like every year,\n"
                     "      so a t < 0 outflow is COMPOUNDED to start-up\n";
        if (!timeline.rampUp.empty())
        {
            std::cout << "    ramp-up p_t                  = "
                      << fmtList(timeline.rampUp) << ", 1 thereafter\n"
                      << "      R_t = p_t R ;  COM_d,t = 0.180 FCI + 2.73 C_OL"
                         " + 1.23 p_t (C_RM + C_UT + C_WT)\n";
            const std::string m =
                "the ramp-up scales the revenue and the variable costs only;"
                " the working capital is invested IN FULL at the end of"
                " construction (t = 0) and does NOT follow the ramp-up -- the"
                " stocks, cash and credit lines are in place before the first"
                " product ships (CAPCOST 2017 places the whole WC at the end"
                " of construction).  A ramped working capital is not modelled.";
            if (AdvisoryLog::instance().add("assumed", "warning", "economics", m))
                std::cout << "  [assumed] economics: " << m << "\n";
        }
        if (econDict_->found("startupCostFraction"))
            std::cout << "    start-up cost = " << std::setprecision(3)
                      << timeline.startupCostFraction << " x FCI   = "
                      << std::setprecision(0) << std::setw(14) << startupCost
                      << " EUR, an EXPENSE of operating year 1 (deducted from"
                         " its taxable income, not depreciated)\n";
    }
    std::cout << "    NPV(i=" << std::setprecision(3) << discountRate << ")        = "
              << std::setprecision(0) << std::setw(14) << NPV << " EUR\n";
    if (Nc > 1)
        std::cout << "    NPV at the START of construction = NPV/(1+i)^" << Nc
                  << " = " << std::setprecision(0) << NPV_projectStart
                  << " EUR  (CAPCOST's year 0; the IRR and paybacks do not"
                     " depend on it)\n";
    if (haveIRR)
        std::cout << "    IRR (bisection+Newton)       = " << std::setprecision(2)
                  << 100.0 * IRR << " %\n";
    else
        std::cout << "    IRR                          = (no sign change of NPV(i) on "
                     "[0,1] -- project never breaks even)\n";
    if (irrAmbiguous)
        std::cout << "    !! MULTIPLE-IRR GUARD: " << cumSignChanges
                  << " sign changes in cumulative CF -> IRR may be non-unique; "
                     "USE NPV.\n";
    if (std::isfinite(discPayback))
        std::cout << "    discounted payback (default) = " << std::setprecision(2)
                  << discPayback << " yr\n";
    else
        std::cout << "    discounted payback           = (never recovered within N)\n";
    if (std::isfinite(simplePayback))
        std::cout << "    simple payback (understates) = " << std::setprecision(2)
                  << simplePayback << " yr\n";
    if (timeline.extended)
    {
        //  The table a student audits from, year by year, in the console as
        //  well as in reports/economics/cashFlow.csv -- printed only when the
        //  timeline is more than the one-year shape (the old run printed no
        //  table, and a one-year case still prints none).
        std::cout << "\n    year by year (" << (result.costs.empty() ? std::string("EUR")
                                    : result.costs.begin()->second.currency)
                  << "; t <= 0 construction, t = 0 also the WC"
                  << (landDecl.present ? "; the land bought at t = " + std::to_string(-Nc)
                                         + " and recovered at t = " + std::to_string(Nlife)
                                       : std::string())
                  << "):\n"
                  << "    " << std::setw(4) << "t" << std::setw(7) << "p_t"
                  << std::setw(15) << "capital";
        if (landDecl.present) std::cout << std::setw(15) << "land";
        std::cout << std::setw(15) << "revenue"
                  << std::setw(15) << "COM_d,t";
        if (baseIn.royalty.present) std::cout << std::setw(14) << "royalty";
        std::cout << std::setw(14) << "start-up"
                  << std::setw(14) << "deprec." << std::setw(14) << "tax"
                  << std::setw(15) << "cash flow" << std::setw(11) << "1/(1+i)^t"
                  << std::setw(16) << "cumulative DCF" << "\n";
        for (const auto& r : cashFlowRows)
        {
            std::cout << "    " << std::setw(4) << r.year
                      << std::setw(7) << std::setprecision(3) << r.productionFraction
                      << std::setprecision(0)
                      << std::setw(15) << r.investment;
            if (landDecl.present) std::cout << std::setw(15) << r.land;
            std::cout << std::setw(15) << r.revenue
                      << std::setw(15) << r.operatingCost;
            if (baseIn.royalty.present) std::cout << std::setw(14) << r.royalty;
            std::cout << std::setw(14) << r.startupCost
                      << std::setw(14) << r.depreciation << std::setw(14) << r.tax
                      << std::setw(15) << r.cashFlow
                      << std::setw(11) << std::setprecision(4) << r.discountFactor
                      << std::setprecision(0) << std::setw(16) << r.cumulativeDCF << "\n";
        }
    }
    if (fin.present)
    {
        //  THE FINANCING (G4): the loan and the EQUITY view, BESIDE the
        //  project's figures above, which it does not replace.  Every number
        //  is `appraise`'s; this block only prints them.
        const std::string cur = result.costs.empty() ? std::string("EUR")
                              : result.costs.begin()->second.currency;
        std::cout << "\n  -- Financing: the EQUITY view (the PROJECT figures above are unchanged) --\n"
                     "    The NPV, IRR and paybacks above are the PROJECT's (unlevered): they say\n"
                     "    whether the plant earns its capital, whoever lends it.  The project's\n"
                     "    merit must not depend on how it is financed, so this view does NOT\n"
                     "    replace them: it shows what the OWNERS put in and get back once the\n"
                     "    lender is paid.\n";
        std::cout << "    loan = " << std::setprecision(3) << fin.debtFraction << " x "
                  << (fin.basis == "totalCapital"
                        ? "the total capital (FCI as the capital schedule spends it, and the WC at t = 0)"
                        : "the fixed capital (FCI), drawn as the capital schedule spends it")
                  << "; the land is not financed\n";
        std::cout << "    rate r = " << std::setprecision(4) << fin.rate
                  << "/yr; grace " << fin.graceYears << " operating yr (interest only);"
                     " repaid over " << fin.termYears << " yr, "
                  << (fin.repayment == "annuity" ? "annuity (constant payment)"
                                                 : "linear (constant principal)")
                  << "\n";
        std::cout << "    source: " << fin.source << "\n"
                  << "    reason: " << fin.reason << "\n";
        std::cout << std::setprecision(0)
                  << "    loan drawn                   = " << std::setw(14) << base.loanDrawn << " " << cur << "\n"
                  << "    interest during construction = " << std::setw(14) << base.IDC << " " << cur
                  << "  (CAPITALISED: added to the balance, no cash moves)\n";
        if (base.IDC == 0.0)
            std::cout << "      none accrues: "
                      << (Nc == 1 ? "a one-year construction spends its capital at its END"
                                    " (t = 0), so nothing is owed before start-up"
                                  : "nothing is owed before the last draw")
                      << "\n";
        std::cout << "    loan at start-up P           = " << std::setw(14) << base.loanAtStartup << " " << cur << "\n"
                  << "    interest paid in operation   = " << std::setw(14) << base.interestPaidTotal << " " << cur
                  << "  (deducted from the taxable income)\n"
                  << "    capitalised interest depreciated with the plant, straight line over "
                  << depreciableLife << " yr (IAS 23 / NCRF 10)\n"
                  << "    equity invested              = " << std::setw(14) << base.equityInvested << " " << cur << "\n";
        std::cout << "\n    year by year (" << cur << "; equity CF = project CF + draw"
                     " - (interest + IDC depr.) x (1 - tau) + IDC depr. - principal):\n"
                  << "    " << std::setw(4) << "t" << std::setw(15) << "draw"
                  << std::setw(14) << "IDC capit." << std::setw(14) << "interest"
                  << std::setw(15) << "principal" << std::setw(15) << "balance"
                  << std::setw(13) << "IDC depr." << std::setw(14) << "tax"
                  << std::setw(15) << "equity CF" << std::setw(11) << "1/(1+ie)^t"
                  << std::setw(16) << "cumulative DCF" << "\n";
        for (const auto& y : base.loanRows)
            std::cout << "    " << std::setw(4) << y.year << std::setprecision(0)
                      << std::setw(15) << y.draw << std::setw(14) << y.interestCapitalised
                      << std::setw(14) << y.interestPaid << std::setw(15) << y.principal
                      << std::setw(15) << y.balance << std::setw(13) << y.idcDepreciation
                      << std::setw(14) << y.tax << std::setw(15) << y.cashFlow
                      << std::setw(11) << std::setprecision(4) << y.discountFactor
                      << std::setprecision(0) << std::setw(16) << y.cumulativeDCF << "\n";
        std::cout << "    equity NPV(ie=" << std::setprecision(3) << fin.equityDiscountRate
                  << (fin.equityRateDeclared ? "" : ", the project's rate -- not declared")
                  << ") = " << std::setprecision(0) << base.equityNPV << " " << cur << "\n";
        if (base.haveEquityIRR)
            std::cout << "    equity IRR                   = " << std::setprecision(2)
                      << 100.0 * base.equityIRR << " %\n";
        else
            std::cout << "    equity IRR                   = (no sign change of the equity NPV(i)"
                         " -- the owners never break even)\n";
        if (base.equityIrrAmbiguous)
            std::cout << "    !! MULTIPLE-IRR GUARD: " << base.equityCumSignChanges
                      << " sign changes in the cumulative equity CF -> the equity IRR"
                         " may be non-unique; USE the equity NPV.\n";
        if (std::isfinite(base.equityDiscPayback))
            std::cout << "    equity discounted payback    = " << std::setprecision(2)
                      << base.equityDiscPayback << " yr\n";
        else
            std::cout << "    equity discounted payback    = (never recovered within N)\n";
        std::cout << "    project NPV " << std::setprecision(0) << NPV << " " << cur
                  << " beside equity NPV " << base.equityNPV << " " << cur
                  << ": the project's is the merit, the equity's is the owners' share of it\n";
    }
    std::cout << "=====================================================================\n\n";

    // ---- 9b. THE SENSITIVITY (C68), only when declared: each input's two
    //  ends priced by the SAME `appraise`, silently, on a copy of the base
    //  inputs with that one input moved.  The FCI's ends may be the band
    //  just printed (`relative accuracyBand`), which is why this follows it.
    const std::string sensCurrency = result.costs.empty()
                                   ? std::string("EUR")
                                   : result.costs.begin()->second.currency;
    for (auto& s : sensitivity)
    {
        if (s.fromBand) resolveSensitivityEnds(s, acc_lo, acc_hi);
        s.atLo = appraise(withSensitivityValue(baseIn, s.key, s.lo), result, false);
        s.atHi = appraise(withSensitivityValue(baseIn, s.key, s.hi), result, false);
    }
    if (!sensitivity.empty()) printSensitivity(sensitivity, base, sensCurrency, fin.present);

    // ---- 9b.  THE ECONOMIC EXTENSIONS (E4/E5), each opt-in --------------
    //  Everything below is a reading of `base` (and of `appraise` on a copy
    //  for the NPV break-even); nothing here is a second copy of the cash
    //  flow.  Published as KPIs (so the golden `kpi` kind pins them) and as
    //  `key,value` lines in reports/economics.
    std::vector<std::pair<std::string, scalar>>      extKpis;
    std::vector<std::pair<std::string, std::string>> extCsv;
    const std::string curStr = result.costs.empty() ? std::string("EUR")
                             : result.costs.begin()->second.currency;
    if (bldg.present)
    {
        extKpis.emplace_back("building_area_m2", bldg.area);
        extKpis.emplace_back("building_C_BM", bldg.cost);
        extKpis.emplace_back("building_inFCI", contingencyFee * bldg.cost);
        extCsv.emplace_back("building_area_m2", csvNum(bldg.area, 3));
        extCsv.emplace_back("building_C_BM", csvNum(bldg.cost, 0));
        extCsv.emplace_back("building_inFCI", csvNum(contingencyFee * bldg.cost, 0));
        extCsv.emplace_back("building_rooms", std::to_string(bldg.nRooms));
        for (const auto& kv : bldg.areaByGrade)
        {
            const std::string g = kv.first.empty() ? std::string("none") : kv.first;
            extKpis.emplace_back("building_area_m2_grade" + g, kv.second);
            extKpis.emplace_back("building_C_BM_grade" + g, bldg.costByGrade.at(kv.first));
        }
    }
    if (baseIn.royalty.present)
    {
        const RoyaltyDeclaration& ry = baseIn.royalty;
        scalar total = 0.0;
        int nYears = 0;
        for (const auto& r : cashFlowRows)
            if (r.year >= 1) { total += r.royalty; if (r.royalty != 0.0) ++nYears; }
        const int lastYear = std::min(ry.expiry, Nlife);
        std::cout << std::fixed << std::setprecision(4)
                  << "\n  -- ROYALTY (declared patent window) -------------------------\n"
                  << "    rate " << ry.rate << " of "
                  << (ry.basis == "sales" ? "the year's sales"
                                          : "the year's COM_d (cost of manufacture)")
                  << "; carried by operating years 1.." << lastYear
                  << (ry.expiry >= Nlife
                        ? " -- the window OUTLASTS the project life (" + std::to_string(Nlife)
                          + " yr): every operating year carries it"
                        : "; years " + std::to_string(ry.expiry + 1) + ".."
                          + std::to_string(Nlife) + " do not (the patent has expired)")
                  << "\n    a cost of manufacture: deducted before the tax like"
                     " COM_d; NOT inside COM_d above; total over the project "
                  << std::setprecision(0) << total << " " << curStr << "\n"
                  << "    source: " << ry.source << "\n";
        extKpis.emplace_back("royalty_total", total);
        extKpis.emplace_back("royalty_years", static_cast<scalar>(nYears));
        extCsv.emplace_back("royalty_rate", csvNum(ry.rate, 6));
        extCsv.emplace_back("royalty_basis", ry.basis);
        extCsv.emplace_back("royalty_expiryYear", std::to_string(ry.expiry));
        extCsv.emplace_back("royalty_yearsCharged", std::to_string(nYears));
        extCsv.emplace_back("royalty_total", csvNum(total, 0));
    }
    //  ---- E5a: the break-evens -------------------------------------------
    bool breakEvenOn = false;
    if (econDict_->found("breakEven"))
    {
        if (std::holds_alternative<DictPtr>(econDict_->entryValue("breakEven")))
            breakEvenOn = true;
        else
        {
            const std::string w = econDict_->lookupWord("breakEven");
            if (w != "on" && w != "true" && w != "yes")
                throw std::runtime_error("economics: `breakEven " + w + ";` --"
                    " write `breakEven on;` or a block `breakEven {}` to"
                    " publish the break-evens; delete the line for none.");
            breakEvenOn = true;
        }
    }
    std::vector<EconomicBreakEvenPrice> bePrices;
    if (breakEvenOn)
    {
        const RoyaltyDeclaration& ry = baseIn.royalty;
        const scalar rS = (ry.present && ry.basis == "sales") ? ry.rate : 0.0;
        const scalar rC = (ry.present && ry.basis == "costOfManufacture") ? ry.rate : 0.0;
        const scalar F0 = 0.180 * FCI + 2.73 * C_OL;
        const scalar Vc = 1.23 * (C_RM + C_UT + C_WT);
        const scalar slopeRev = R * (1.0 - rS);
        const scalar slopeVar = Vc * (1.0 + rC);
        const scalar Fx       = F0 * (1.0 + rC) + d_annual;
        const bool   haveOp   = slopeRev > slopeVar;
        const scalar xOp      = haveOp ? Fx / (slopeRev - slopeVar) : std::nan("");
        //  the NPV break-even: the capacity scale s with NPV(s) = 0
        auto npvAt = [&](scalar sc)
        {
            AppraisalInputs in = baseIn;
            in.streamFactor = baseIn.streamFactor * sc;
            return appraise(in, result, false).NPV;
        };
        scalar sNpv = std::nan("");
        std::string npvNote;
        {
            //  THE SEARCH STARTS AT NO PRODUCTION, AND A COPY THAT MAKES
            //  NOTHING MAY BE REFUSED (2026-11-08, PIF readiness review).
            //  The itemised `workingCapital { ... }` values what the plant
            //  holds at its cost per kg of product, and a copy with zero
            //  product mass has no such cost: `appraise` REFUSES it, which is
            //  right for a plant and was wrong for this search point -- every
            //  tablet base case declares the itemised block, so adding
            //  `breakEven {}` to one stopped the whole run with a message
            //  about the working capital.  A plant that makes nothing and
            //  bought anything has a negative NPV; the refusal is read as
            //  that sign, and the search goes on.  Only the s = 0 point is
            //  read this way: at any positive scale the copy carries mass,
            //  and a refusal there is a real one and still stops the run.
            scalar f0;
            try { f0 = npvAt(0.0); }
            catch (const std::exception&)
            {
                f0 = -std::numeric_limits<scalar>::infinity();
            }
            if (f0 >= 0.0) { sNpv = 0.0; npvNote = "NPV >= 0 even with no production"; }
            else
            {
                scalar lo = 0.0, hi = 1.0;
                bool bracketed = false;
                for (int k = 0; k < 11; ++k)
                {
                    if (npvAt(hi) >= 0.0) { bracketed = true; break; }
                    lo = hi;  hi *= 2.0;
                }
                if (!bracketed)
                    npvNote = "NPV stays negative up to 1024 x the nameplate production";
                else
                {
                    for (int it = 0; it < 100; ++it)
                    {
                        const scalar mid = 0.5 * (lo + hi);
                        if (npvAt(mid) >= 0.0) hi = mid; else lo = mid;
                    }
                    sNpv = 0.5 * (lo + hi);
                }
            }
        }
        const scalar npvAtFound = std::isfinite(sNpv) ? npvAt(sNpv) : std::nan("");

        //  (3) PRICE (2026-11-13): `breakEven { price ( <stream> ... ); }`.
        //  For each named stream the price of THAT stream, every other price
        //  held, at which NPV = 0 -- found by `appraise` on a copy, exactly
        //  as (2): the cash flow has ONE home.  A product's is the minimum
        //  selling price; a raw material's is the highest purchase price the
        //  plant can bear.  Whatever the NPV carries moves with the price as
        //  a price end of `sensitivity {}` moves it (receivables, the
        //  built-up working capital, tax, the royalty on sales).
        std::vector<std::string> priceStreams;
        if (std::holds_alternative<DictPtr>(econDict_->entryValue("breakEven")))
        {
            const DictPtr beBlock = econDict_->subDict("breakEven");
            for (const auto& k : beBlock->keys())
                if (k != "price")
                    throw std::runtime_error("economics { breakEven { " + k + " } }:"
                        " the only key of the block is `price ( <stream> ... );`,"
                        " the priced streams whose break-even price to publish;"
                        " delete the line for none.");
            if (beBlock->found("price")) priceStreams = beBlock->lookupWordList("price");
        }
        {
            std::vector<std::string> priced;
            for (const auto& p : baseIn.rawMats)  priced.push_back(p.stream);
            for (const auto& p : baseIn.products) priced.push_back(p.stream);
            std::string pricedList;
            for (const auto& x : priced) pricedList += (pricedList.empty() ? "" : " ") + x;
            for (std::size_t i = 0; i < priceStreams.size(); ++i)
            {
                const std::string& name = priceStreams[i];
                const std::string where = "economics { breakEven { price ( " + name + " ) } }";
                for (std::size_t j = 0; j < i; ++j)
                    if (priceStreams[j] == name)
                        throw std::runtime_error(where + ": stream '" + name
                            + "' is named twice; name each once.");
                bool isProduct = false, found = false;
                for (const auto& p : baseIn.products) if (p.stream == name) { found = true; isProduct = true; }
                for (const auto& p : baseIn.rawMats)  if (p.stream == name) { found = true; }
                if (!found)
                    throw std::runtime_error(where + ": constant/economics prices no"
                        " such stream, so this appraisal neither sells nor buys it"
                        " and has no price to break even on.  Add it to `products`"
                        " or `rawMaterials` of constant/economics with a price, or"
                        " name one of the priced streams: "
                        + (pricedList.empty() ? std::string("(none)") : pricedList));
                const std::string key = "price." + name;
                const scalar declared = sensitivityValue(baseIn, key);
                auto npvAtPrice = [&](scalar pr)
                {
                    return appraise(withSensitivityValue(baseIn, key, pr), result, false).NPV;
                };
                //  NPV rises with a product's price and falls with a raw
                //  material's; the bracket opens at price 0 and doubles from
                //  the declared price (1 if it is 0), 60 times at most.
                const scalar f0 = npvAtPrice(0.0);
                scalar lo = 0.0, hi = declared > 0.0 ? declared : 1.0;
                scalar root = std::nan("");
                scalar fHi = f0;
                if (isProduct)
                {
                    if (f0 >= 0.0) root = 0.0;
                    else
                    {
                        for (int k = 0; k < 60; ++k)
                        {
                            fHi = npvAtPrice(hi);
                            if (fHi >= 0.0) break;
                            lo = hi;  hi *= 2.0;
                        }
                        if (fHi < 0.0)
                            throw std::runtime_error(where + ": no price in [0, "
                                + csvNum(hi, 4) + "] " + curStr + "/kg makes the NPV"
                                " zero (NPV " + csvNum(f0, 0) + " at price 0, "
                                + csvNum(fHi, 0) + " at the upper end).  The"
                                " stream's revenue cannot offset the costs at any"
                                " finite price -- is its mass flow zero?  Check the"
                                " stream's flow in the converged case, or drop it"
                                " from `price ( ... )`.");
                    }
                }
                else
                {
                    if (f0 < 0.0)
                        throw std::runtime_error(where + ": the NPV is negative"
                            " (" + csvNum(f0, 0) + " " + curStr + ") even when '"
                            + name + "' is free, so no purchase price of it makes"
                            " the NPV zero.  The plant does not pay whatever this"
                            " raw material costs; drop it from `price ( ... )`.");
                    for (int k = 0; k < 60; ++k)
                    {
                        fHi = npvAtPrice(hi);
                        if (fHi < 0.0) break;
                        lo = hi;  hi *= 2.0;
                    }
                    if (fHi >= 0.0)
                        throw std::runtime_error(where + ": no price in [0, "
                            + csvNum(hi, 4) + "] " + curStr + "/kg makes the NPV"
                            " zero (NPV " + csvNum(f0, 0) + " at price 0, "
                            + csvNum(fHi, 0) + " at the upper end): the NPV does"
                            " not depend on this price.  Is the stream's mass flow"
                            " zero?  Drop it from `price ( ... )`.");
                }
                if (!std::isfinite(root))
                {
                    //  NPV >= 0 is the side a product's price rises into and
                    //  a raw material's price falls out of.
                    for (int it = 0; it < 200; ++it)
                    {
                        const scalar mid = 0.5 * (lo + hi);
                        const bool ok = npvAtPrice(mid) >= 0.0;
                        if (ok == isProduct) hi = mid; else lo = mid;
                    }
                    root = 0.5 * (lo + hi);
                }
                EconomicBreakEvenPrice b;
                b.stream = name;  b.role = isProduct ? "product" : "rawMaterial";
                b.declared = declared;  b.breakEven = root;
                bePrices.push_back(std::move(b));
            }
        }
        std::cout << std::fixed << std::setprecision(0)
                  << (bePrices.empty()
                        ? "\n  -- BREAK-EVEN (two answers, two questions) -----------------\n"
                        : "\n  -- BREAK-EVEN (three answers, three questions) -------------\n")
                  << "    (1) OPERATING: the fraction x of nameplate production at which"
                     " sales = cost of production, year at full production\n"
                  << "        FIXED    F = 0.180 FCI + 2.73 C_OL + depreciation = "
                  << std::setw(14) << Fx << " " << curStr << "/yr"
                  << (rC > 0.0 ? "  (x (1 + royalty) on the cash part)" : "") << "\n"
                  << "        VARIABLE V = 1.23 (C_RM + C_UT + C_WT) at x = 1      = "
                  << std::setw(14) << slopeVar << " " << curStr << "/yr\n"
                  << "        SALES    R = " << std::setw(14) << slopeRev << " " << curStr
                  << "/yr at x = 1" << (rS > 0.0 ? "  (net of the royalty on sales)" : "")
                  << "\n        x = F / (R - V) = ";
        if (haveOp)
            std::cout << std::setprecision(4) << xOp << "  (sales at break-even "
                      << std::setprecision(0) << xOp * R << " " << curStr << "/yr; margin"
                      << " of safety " << std::setprecision(4) << 1.0 - xOp << ")\n";
        else
            std::cout << "(none: at full production the sales do not exceed the variable"
                         " cost; no volume covers the fixed cost)\n";
        std::cout << "        start-up cost, ramp-up, tax and the capital charge are NOT"
                     " in it; the classification (fixed / variable) is the modelling"
                     " choice above\n"
                  << "    (2) NPV: the fraction s of nameplate production (capital and"
                     " labour fixed) at which NPV = 0, by `appraise` on a copy: ";
        if (std::isfinite(sNpv))
            std::cout << std::setprecision(4) << sNpv << "  (NPV there "
                      << std::setprecision(0) << (std::fabs(npvAtFound) < 0.5 ? 0.0 : npvAtFound)
                      << " " << curStr << ")\n";
        else
            std::cout << "(none: " << npvNote << ")\n";
        for (const auto& b : bePrices)
        {
            const bool prod = b.role == "product";
            std::cout << "    (3) PRICE of " << b.stream << " (" << (prod
                          ? "the minimum selling price of this product"
                          : "the highest purchase price of this raw material the plant can bear")
                      << "): NPV = 0 at " << std::setprecision(4) << b.breakEven << " "
                      << curStr << "/kg, every other price held; declared "
                      << b.declared << " " << curStr << "/kg, ratio "
                      << (b.declared > 0.0 ? b.breakEven / b.declared : std::nan(""))
                      << "\n";
        }
        if (!bePrices.empty())
            std::cout << "        found by `appraise` on a copy with only that price moved: the"
                         " receivables, the working capital, the tax and the royalty on sales"
                         " move with it exactly as at a price end of `sensitivity {}`.\n"
                      << std::setprecision(0);
        std::cout << "    They differ because (2) carries the capital charge, the tax, the"
                     " working capital, the ramp-up, the royalty window and discounting,"
                     " and (1) is one year's operating cost against its sales.\n"
                  << "    Both use the SAME revenue R as the NPV (the products priced"
                     " in constant/economics).\n";
        extKpis.emplace_back("breakEven_operating_fraction", xOp);
        extKpis.emplace_back("breakEven_operating_fixed", Fx);
        extKpis.emplace_back("breakEven_operating_variable", slopeVar);
        extKpis.emplace_back("breakEven_operating_sales", slopeRev);
        extKpis.emplace_back("breakEven_npv_fraction", sNpv);
        extCsv.emplace_back("breakEven_operating_fraction", csvNum(xOp, 6));
        extCsv.emplace_back("breakEven_operating_fixed", csvNum(Fx, 0));
        extCsv.emplace_back("breakEven_operating_variable", csvNum(slopeVar, 0));
        extCsv.emplace_back("breakEven_operating_sales", csvNum(slopeRev, 0));
        extCsv.emplace_back("breakEven_npv_fraction", csvNum(sNpv, 6));
        for (const auto& b : bePrices)
        {
            extKpis.emplace_back("breakEven_price_" + b.stream, b.breakEven);
            extCsv.emplace_back("breakEven_price_" + b.stream, csvNum(b.breakEven, 6));
        }
    }
    //  ---- E5c: the working capital by three methods ----------------------
    if (econDict_->found("workingCapitalMethods"))
    {
        const std::string where = "economics { workingCapitalMethods { ... } }";
        if (!std::holds_alternative<DictPtr>(econDict_->entryValue("workingCapitalMethods")))
            throw std::runtime_error("economics: `workingCapitalMethods` must be a"
                " block -- `workingCapitalMethods { fractionOfSales 0.10;"
                " fractionOfFixedCapital 0.15; source \"...\"; reason \"...\"; }`.");
        const DictPtr d = econDict_->subDict("workingCapitalMethods");
        const std::vector<std::string> known
            { "fractionOfSales", "fractionOfFixedCapital", "source", "reason" };
        for (const auto& k : d->keys())
            if (std::find(known.begin(), known.end(), k) == known.end())
                throw std::runtime_error("economics: " + registryRefusal::message(
                    "workingCapitalMethods key", k, known, "Accepted"));
        for (const char* k : { "source", "reason" })
            if (!d->found(k) || d->lookupWord(k).empty())
                throw std::runtime_error(where + ": `" + k + " \"...\";` is not"
                    " declared -- a working-capital fraction is an assumption the"
                    " case owes its reader.");
        if (!d->found("fractionOfSales") && !d->found("fractionOfFixedCapital"))
            throw std::runtime_error(where + ": declares no fraction -- give"
                " `fractionOfSales` and/or `fractionOfFixedCapital`; no number is"
                " shipped.");
        auto frac = [&](const char* k) -> scalar
        {
            const scalar v = d->lookupScalar(k);
            if (!(v > 0.0) || !(v < 1.0))
                throw std::runtime_error(where + ": `" + k + "` must lie strictly"
                    " between 0 and 1.");
            return v;
        };
        const bool haveS = d->found("fractionOfSales");
        const bool haveF = d->found("fractionOfFixedCapital");
        const scalar fS = haveS ? frac("fractionOfSales") : 0.0;
        const scalar fF = haveF ? frac("fractionOfFixedCapital") : 0.0;
        const scalar wcSales = fS * R, wcFixed = fF * FCI;
        std::vector<scalar> avail;
        std::cout << std::fixed
                  << "\n  -- WORKING CAPITAL BY THREE METHODS ---------------------------\n";
        std::cout << std::setprecision(0);
        if (wcb.present)
        {
            std::cout << "    itemised build-up            = " << std::setw(14) << wcb.net
                      << " " << curStr << "\n";
            avail.push_back(wcb.net);
            extKpis.emplace_back("WCm_itemised", wcb.net);
            extCsv.emplace_back("WCm_itemised", csvNum(wcb.net, 0));
        }
        else
            std::cout << "    itemised build-up            : NOT computed -- no"
                         " `workingCapital {}` block is declared\n";
        if (haveS)
        {
            std::cout << "    " << std::setprecision(4) << fS << " x annual sales       = "
                      << std::setprecision(0) << std::setw(14) << wcSales << " " << curStr << "\n";
            avail.push_back(wcSales);
            extKpis.emplace_back("WCm_sales", wcSales);
            extCsv.emplace_back("WCm_sales", csvNum(wcSales, 0));
        }
        else
            std::cout << "    % of annual sales            : NOT computed -- no"
                         " `fractionOfSales` is declared\n";
        if (haveF)
        {
            std::cout << "    " << std::setprecision(4) << fF << " x fixed capital      = "
                      << std::setprecision(0) << std::setw(14) << wcFixed << " " << curStr << "\n";
            avail.push_back(wcFixed);
            extKpis.emplace_back("WCm_fixedCapital", wcFixed);
            extCsv.emplace_back("WCm_fixedCapital", csvNum(wcFixed, 0));
        }
        else
            std::cout << "    % of fixed capital           : NOT computed -- no"
                         " `fractionOfFixedCapital` is declared\n";
        const std::string used = wcb.present
            ? std::string("itemised build-up (`workingCapital {}`)")
            : "a fraction of the fixed capital (`workingCapital "
              + std::to_string(workingCapital) + ";`)";
        std::cout << "    USED IN THE APPRAISAL        = " << std::setw(14) << WC
                  << " " << curStr << "  <- " << used << "\n";
        extKpis.emplace_back("WCm_used", WC);
        extCsv.emplace_back("WCm_usedMethod", wcb.present ? "itemised" : "fractionOfFixedCapital");
        if (avail.size() >= 2)
        {
            const scalar mx = *std::max_element(avail.begin(), avail.end());
            const scalar mn = *std::min_element(avail.begin(), avail.end());
            std::cout << "    spread (max - min)           = " << std::setw(14) << mx - mn
                      << " " << curStr << "  (max / min = " << std::setprecision(2)
                      << (mn > 0.0 ? mx / mn : std::nan("")) << ")\n";
            extKpis.emplace_back("WCm_spread", mx - mn);
            extCsv.emplace_back("WCm_spread", csvNum(mx - mn, 0));
        }
        else
            std::cout << "    spread                       : needs at least two methods"
                         " with inputs\n";
        std::cout << "    fractions: " << d->lookupWord("source") << "\n";
    }

    // ---- 10.  Publish headline KPIs (the differentiator) ----------------
    auto& econ = result.kpis["economics"];
    econ["FCI"]          = FCI;
    econ["WC"]           = WC;
    econ["TCI"]          = TCI;
    econ["COM_d"]        = COM_d;
    //  The utility bill and its credits (C52): COM_d moves with C_UT, and a
    //  bill that is not published cannot be pinned -- nor can the credit a
    //  declared steam generation earns, which was invisible inside COM_d.
    econ["C_UT"]         = C_UT;
    econ["C_UT_credit"]  = C_UT_credit;
    //  THE LOSS YEARS (C269), published only when there are any, so every
    //  case without one keeps its KPI list: the years, the credit they earn
    //  (0 under `taxOnLoss none`) and that credit discounted to start-up.
    if (base.lossYears > 0)
    {
        econ["lossYears"]           = static_cast<scalar>(base.lossYears);
        econ["taxCreditOnLoss"]     = base.taxCreditTotal;
        econ["taxCreditOnLoss_NPV"] = base.taxCreditDiscounted;
    }
    econ["revenue"]      = R;
    //  The raw-material bill and the two gross margins (C57): published so a
    //  golden can pin the margin a feasibility study is decided on.
    econ["C_RM"]              = C_RM;
    //  THE LABOUR, published so a golden pins it (C98 round 2): the
    //  operators per shift that priced it (a declared crew, or the
    //  correlation), the operating positions and C_OL.  Beside a declared
    //  crew the correlation's own two numbers too -- the comparison the
    //  console prints, pinned so that it cannot drift unseen; absent a crew
    //  they are the first two and are not repeated.
    econ["operatorsPerShift"]  = operatorsPerShiftUsed;
    econ["operatingPositions"] = operatorsTotal;
    econ["C_OL"]               = C_OL;
    if (crewDeclared)
    {
        econ["operatorsPerShift_correlation"] = N_OL_per_shift;
        econ["C_OL_correlation"]              = C_OL_correlation;
    }
    econ["grossMargin_RM"]    = grossMargin_RM;
    econ["grossMargin_RM_UT"] = grossMargin_RM_UT;
    econ["NPV"]          = NPV;
    econ["IRR"]          = haveIRR ? IRR : std::nan("");
    econ["paybackYears"] = std::isfinite(discPayback) ? discPayback : std::nan("");
    //  THE LAND (C82), only when declared, so every other case publishes
    //  exactly what it did: its cost and the area it was priced on.
    if (landDecl.present)
    {
        econ["land"]     = base.land;
        econ["landArea"] = landDecl.area;
    }
    //  THE E4/E5 EXTENSIONS, only when declared (building, royalty,
    //  break-even, working-capital methods).
    for (const auto& kv : extKpis) econ[kv.first] = kv.second;
    //  THE FINANCING (G4), only when declared, so every other case publishes
    //  exactly what it did.  The PROJECT's NPV / IRR / paybackYears above are
    //  untouched; these are the loan and the EQUITY view beside them, each a
    //  KPI the golden `kpi` kind pins (published implies pinned).
    if (fin.present)
    {
        econ["debt_drawn"]          = base.loanDrawn;
        econ["debt_IDC"]            = base.IDC;
        econ["debt_atStartup"]      = base.loanAtStartup;
        econ["debt_interestPaid"]   = base.interestPaidTotal;
        econ["equity_invested"]     = base.equityInvested;
        econ["equity_NPV"]          = base.equityNPV;
        econ["equity_IRR"]          = base.haveEquityIRR ? base.equityIRR : std::nan("");
        econ["equity_paybackYears"] = std::isfinite(base.equityDiscPayback)
                                    ? base.equityDiscPayback : std::nan("");
    }
    //  THE BUILD-UP IS PUBLISHED LINE BY LINE (C44 slice 4) -- and only when
    //  declared, so a fraction-of-FCI case publishes exactly what it did.
    //  `WC` above is then the NET figure the cash flow uses.
    if (wcb.present)
    {
        for (const auto& a : wcb.assets)      econ["WC_" + a.key] = a.value;
        for (const auto& l : wcb.liabilities) econ["WC_" + l.key] = l.value;
        econ["WC_gross"]            = wcb.gross;
        econ["WC_net"]              = wcb.net;
        econ["WC_fractionRule"]     = wcb.fractionRule;
        econ["productionCostPerKg"] = wcb.productionCostPerKg;
    }
    //  THE SENSITIVITY, two ends per declared input (C68) -- published only
    //  when declared, so every other case publishes exactly what it did.
    //  `sens_<input>_...`, the input's name with every character a golden
    //  key cannot carry ('.' of `price.<stream>`) written as '_'.  An IRR or
    //  a payback that does not exist at an end is NaN, as the base's are.
    for (const auto& s : sensitivity)
    {
        const std::string k = "sens_" + s.kpiKey + "_";
        econ[k + "NPV_low"]      = s.atLo.NPV;
        econ[k + "NPV_high"]     = s.atHi.NPV;
        econ[k + "IRR_low"]      = s.atLo.haveIRR ? s.atLo.IRR : std::nan("");
        econ[k + "IRR_high"]     = s.atHi.haveIRR ? s.atHi.IRR : std::nan("");
        econ[k + "payback_low"]  = s.atLo.discPayback;
        econ[k + "payback_high"] = s.atHi.discPayback;
        //  The input's own value at each end (2026-10-17): the label of each
        //  tornado bar, pinned here so the result's `economics.sensitivity`
        //  block carries no number that no golden row reads.
        econ[k + "value_low"]    = s.lo;
        econ[k + "value_high"]   = s.hi;
        //  The EQUITY NPV at each end (G4), only when a loan is declared.
        if (fin.present)
        {
            econ[k + "equityNPV_low"]  = s.atLo.equityNPV;
            econ[k + "equityNPV_high"] = s.atHi.equityNPV;
        }
    }

    // ---- 11.  Build the year-by-year DCF table + emit the spreadsheet ----
    // The classic Perry / Turton income/cash-flow statement (years 1-Nc..N,
    // so 0..N for one construction year), built in 8b: the SHEET is the
    // deliverable, the log above is the echo.  Every column is
    // reconstructed from the same scalars the log printed (glass-box: the .ods
    // adds NOTHING the student cannot also read in the log).
    EconomicsSummary& summary = result.economics;
    summary.present       = true;
    summary.FCI           = FCI;
    summary.WC            = WC;
    summary.TCI           = TCI;
    summary.COM_d         = COM_d;
    summary.revenue       = R;
    summary.depreciation  = d_annual;
    summary.NPV           = NPV;
    summary.IRR           = haveIRR ? IRR : std::nan("");
    summary.haveIRR       = haveIRR;
    summary.irrAmbiguous  = irrAmbiguous;
    summary.discPayback   = discPayback;
    summary.simplePayback = simplePayback;
    summary.discountRate  = discountRate;
    summary.taxRate       = taxRate;
    summary.taxOnLoss     = taxOnLoss;
    summary.lossYears     = base.lossYears;
    summary.taxCreditOnLoss = base.taxCreditTotal;
    summary.projectLife   = Nlife;
    summary.estimateClass = estimateClass;
    summary.accLo         = acc_lo;
    summary.accHi         = acc_hi;
    summary.workingCapital = wcb;
    summary.currency      = result.costs.empty()
                          ? std::string("EUR")
                          : result.costs.begin()->second.currency;

    summary.cashFlow      = cashFlowRows;
    summary.royaltyPresent = baseIn.royalty.present;
    summary.extensions    = extCsv;
    summary.timelineExtended   = timeline.extended;
    summary.constructionPeriod = Nc;
    summary.capitalSchedule    = timeline.capitalSchedule;
    summary.rampUp             = timeline.rampUp;
    summary.startupCostFraction = timeline.startupCostFraction;
    summary.startupCost        = startupCost;
    summary.NPV_projectStart   = NPV_projectStart;
    summary.operatingHours     = H;
    summary.operatingHoursFrom = sfFromPlan ? "batchPlan"
        : (econDict_->found("streamFactor") ? "declared" : "default");
    summary.utilityBill        = C_UT;
    //  THE BATCH PLAN'S BASES (C264) gain the annual basis the economics used:
    //  the line a student needs between "168 h" and "3840 h".
    if (result.batchPlan.present)
        result.batchPlan.bases.push_back({ "annualFlowHours",
            "the hours every annual flow cost uses", H, "h/yr",
            std::string("H = streamFactor x 8760: raw materials C_RM, utilities"
            " C_UT and revenue are the balance's hourly figure x H")
            + (sfFromPlan ? " (`streamFactor fromBatchPlan;`, so H = H_eq above)"
                          : " (a streamFactor NOT taken from the plan)")
            + ".  The labour C_OL is the declared crew's own year and the fixed"
              " charges are fractions of FCI: neither is multiplied by H",
            sfFromPlan ? std::string("batchPlan.equivalentHours")
                       : std::string("economics.operatingHours") });
    if (landDecl.present)
    {
        summary.landPresent         = true;
        summary.landPrice           = landDecl.price;
        summary.landArea            = landDecl.area;
        summary.landAreaFrom        = landDecl.areaFrom;
        summary.landCost            = base.land;
        summary.landInvestedAtYear  = -Nc;
        summary.landRecoveredAtYear = Nlife;
        summary.landSource          = landDecl.source;
        summary.landReason          = landDecl.reason;
    }
    //  THE SENSITIVITY ON THE RESULT (2026-10-17): the rows the CSV below
    //  writes, in the SAME order (`tornadoOrder`), so the GUI draws the
    //  engine's ranking and recomputes none of it.
    if (!sensitivity.empty())
    {
        summary.sensitivityCaveat = kSensitivityCaveat;
        for (const auto* s : tornadoOrder(sensitivity))
        {
            EconomicSensitivityRow r;
            r.input        = s->key;
            r.kpiKey       = s->kpiKey;
            r.mode         = s->mode;
            r.fromBand     = s->fromBand;
            r.declaredLow  = s->declLo;
            r.declaredHigh = s->declHi;
            r.unit         = s->unit;
            r.baseValue    = s->base;
            r.valueLow     = s->lo;
            r.valueHigh    = s->hi;
            r.NPV_low      = s->atLo.NPV;
            r.NPV_high     = s->atHi.NPV;
            r.NPVswing     = npvSwing(*s);
            r.NPVsignFlip  = npvSignFlip(*s, base.NPV);
            r.equityNPV_low  = s->atLo.equityNPV;
            r.equityNPV_high = s->atHi.equityNPV;
            summary.sensitivity.push_back(std::move(r));
        }
    }

    summary.breakEvenPrices = bePrices;

    //  THE FINANCING (G4) on the result, only when declared.
    if (fin.present)
    {
        summary.financingPresent           = true;
        summary.debtFraction               = fin.debtFraction;
        summary.debtBasis                  = fin.basis;
        summary.debtRate                   = fin.rate;
        summary.graceYears                 = fin.graceYears;
        summary.termYears                  = fin.termYears;
        summary.repayment                  = fin.repayment;
        summary.equityDiscountRate         = fin.equityDiscountRate;
        summary.equityDiscountRateDeclared = fin.equityRateDeclared;
        summary.financingSource            = fin.source;
        summary.financingReason            = fin.reason;
        summary.loanDrawn                  = base.loanDrawn;
        summary.interestDuringConstruction = base.IDC;
        summary.loanAtStartup              = base.loanAtStartup;
        summary.interestPaidTotal          = base.interestPaidTotal;
        summary.equityInvested             = base.equityInvested;
        summary.equityNPV                  = base.equityNPV;
        summary.equityIRR                  = base.haveEquityIRR ? base.equityIRR : std::nan("");
        summary.haveEquityIRR              = base.haveEquityIRR;
        summary.equityIrrAmbiguous         = base.equityIrrAmbiguous;
        summary.equityDiscPayback          = base.equityDiscPayback;
        summary.loanSchedule               = base.loanRows;
    }

    // Persist both the .csv and the coloured .ods (reports/economics/).
    writeCashFlowCsv(summary);
    writeCashFlowOds(summary);
    if (wcb.present) writeWorkingCapitalCsv(summary);
    if (!sensitivity.empty()) writeSensitivityCsv(sensitivity, base, summary.currency, fin.present);
    if (fin.present) writeFinancingCsv(summary);

    return 0;
}

} // namespace Choupo
