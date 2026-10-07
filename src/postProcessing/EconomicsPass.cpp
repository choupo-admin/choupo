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
#include "core/Advisory.H"

#include "core/Dictionary.H"
#include "core/Dimensions.H"
#include "core/OdsWriter.H"
#include "solver/NewtonRaphson.H"

#include <cmath>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <set>
#include <sstream>
#include <stdexcept>
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
    scalar R, scalar C_RM, scalar COM_d, scalar H)
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
    //  something a reader can redo.
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
    f << "year,investment_" << cur
      << ",revenue_"        << cur
      << ",operatingCost_"  << cur
      << ",depreciation_"   << cur
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
          << "," << csvNum(r.investment,     0)
          << "," << csvNum(r.revenue,        0)
          << "," << csvNum(r.operatingCost,  0)
          << "," << csvNum(r.depreciation,   0)
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
    f << "COM_d,"        << csvNum(e.COM_d, 0) << "\n";
    f << "revenue,"      << csvNum(e.revenue, 0) << "\n";
    f << "NPV,"          << csvNum(e.NPV,   0) << "\n";
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
    ods.textCell("Revenue",                    OdsWriter::Header);
    ods.textCell("OPEX (COM_d)",               OdsWriter::Header);
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
        ods.numberCell(r.revenue,         0, rowSt);
        ods.numberCell(r.operatingCost,   0, rowSt);
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
    metric("Cost of manufacture (COM_d)/yr", e.COM_d,   0, false);
    metric("Annual revenue (R)",             e.revenue, 0, false);
    metric("NPV @ " + csvNum(100.0 * e.discountRate, 1) + "%",
           e.NPV, 0, e.NPV > 0.0);
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

    ods.save(path.string());

    std::cout << "  [economics] cash-flow spreadsheet -> " << path.string()
              << "  (1 sheet, coloured)\n";
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
    const scalar streamFactor      = econDict_->lookupScalarOrDefault("streamFactor",         0.90);
    const scalar siteFactor        = econDict_->lookupScalarOrDefault("siteFactor",           0.50);
    const scalar contingencyFee    = econDict_->lookupScalarOrDefault("contingencyFee",       1.18);
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
    //  `constructionPeriod` WAS READ BY NOTHING IN THE WHOLE TREE, and the
    //  cash-flow timeline hardcodes ONE year ("Year 0 = construction ... for
    //  a 1-year construction", below).  So a case declaring 2 was discounted
    //  over 1 and nothing said so.
    //
    //  ONE SHIPPED CASE DOES DECLARE 2 -- ammonia02_full_plant, deliberately,
    //  beside `projectLife 15`.  Its published NPV therefore does not match
    //  its own declaration, which is a live finding and a better one than the
    //  coincidence the first draft of this comment claimed.
    //
    //  IT ANNOUNCES; IT DOES NOT REFUSE, and the first version of this code
    //  got that wrong.  Refusing would break a case whose author declared a
    //  two-year construction on purpose -- my judgement overriding theirs --
    //  and implementing a real multi-year draw-down MOVES a published NPV,
    //  which is a scientific decision and is reserved.  Announcing states the
    //  gap beside the answer and moves nothing, which is what this project
    //  does with every other declared-but-unmodelled fact.
    const scalar constructionPeriod = econDict_->lookupScalarOrDefault("constructionPeriod", 1.0);
    if (std::fabs(constructionPeriod - 1.0) > 1e-9)
    {
        std::ostringstream cp;
        cp << "the case declares constructionPeriod = " << constructionPeriod
           << ", and this DCF models a ONE-year construction: the whole FCI"
              " and working capital are placed at t = 0 and operating cash"
              " flows begin in year 1.  A multi-year draw-down is NOT"
              " implemented, so the NPV, IRR and paybacks below are computed"
              " on a 1-year construction whatever this key says.";
        std::cout << "  [economics] " << cp.str() << "\n";
        AdvisoryLog::instance().add("economics", "warning",
                                    "constructionPeriod", cp.str());
    }

    const std::string econMethod   = econDict_->lookupWordOrDefault("method", "discountedCashFlow");
    if (econMethod != "discountedCashFlow")
        throw std::runtime_error("EconomicsPass: unknown method '" + econMethod
            + "'.  Implemented: discountedCashFlow (the only one -- straight-"
              "line or MACRS depreciation inside it is the separate"
              " `depreciation` key).");

    const std::string deprMethod   = econDict_->lookupWordOrDefault("depreciation", "straightLine");

    if (deprMethod != "straightLine")
        std::cerr << "EconomicsPass: depreciation '" << deprMethod
                  << "' not implemented (only straightLine) -- using straightLine.\n";

    const scalar H = streamFactor * 8760.0;   // operating hours per year

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
        if (fB1 != cb.factors.end() && fB2 != cb.factors.end())
            sum_C_BM0 += cb.purchasedCost * (fB1->second + fB2->second);
        else
            sum_C_BM0 += cb.bareModuleCost;  // no base factors: conservative
    }

    const scalar FCI = contingencyFee * sum_C_BM + siteFactor * sum_C_BM0;
    scalar WC  = workingCapital * FCI;     // replaced by the NET working
    scalar TCI = FCI + WC;                 // capital when a model is declared

    // Lang cross-check (solid-fluid 3.63 default) -- a reconciliation line
    // only; NEVER fed into the module-factor FCI (would double-count install).
    const scalar langFactor   = econDict_->lookupScalarOrDefault("langFactor", 3.63);
    const scalar FCI_Lang     = langFactor * sum_Cp;

    // ---- 4.  OPEX -- Turton cost-of-manufacture COM_d (Eq. 8.1) ---------
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
    //  summed; the unallocated ones are COUNTED and named, and the caller is
    //  told the utility bill is a LOWER BOUND rather than a cost.
    scalar C_UT = 0.0;
    std::size_t unpricedDuties = 0;
    for (const auto& a : result.utilityAllocation)
    {
        if (a.allocated) C_UT += a.eur_h;   // €/h, priced against a utility
        else             ++unpricedDuties;  // a real duty nobody could price
    }
    C_UT *= H;                    // €/yr
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
    //   N_OL = (6.29 + 0.23*N_np)^0.5  operators per shift;
    //   ~4.5 shift-positions cover one operating position around the clock;
    //   labour rate (€/h) from constant/economics.
    const scalar N_OL_per_shift = std::sqrt(6.29 + 0.23 * N_np);
    const scalar operatorsTotal = 4.5 * N_OL_per_shift;   // operating positions
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
    const scalar C_OL = operatorsTotal * labourRate * operatorAnnualHours;  // €/yr

    // C_RM: raw materials.  Each `rawMaterials ( { stream; price; } ... )`
    // entry prices a feed stream's mass flow.
    std::vector<PricedStream> rawMats;
    scalar C_RM = 0.0;
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
            C_RM += ps.price * ps.massFlow * 3600.0 * H;     // €/yr
            rawMats.push_back(std::move(ps));
        }
    }
    else if (refuseOnMissing && !priceFilePresent)
    {
        // already handled by the file-missing branch above
    }

    // C_WT: waste treatment -- NOT costed in this Pareto phase.  Explicit zero
    // with a loud line (a real plant must price effluent / solids handling).
    const scalar C_WT = 0.0;

    const scalar COM_d = 0.180 * FCI
                       + 2.73  * C_OL
                       + 1.23  * (C_RM + C_UT + C_WT);

    // ---- 5.  Revenue ----------------------------------------------------
    std::vector<PricedStream> products;
    scalar R = 0.0;             // €/yr
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
            R += ps.price * ps.massFlow * 3600.0 * H;          // €/yr
            products.push_back(std::move(ps));
        }
    }
    if (products.empty())
    {
        if (refuseOnMissing && priceFilePresent)
            return missing("at least one 'products ( { stream; price; } )' entry");
        std::cerr << "EconomicsPass: no priced products -- revenue R = 0 (LOUD: "
                     "NPV/IRR will be a pure cost stream, not an appraisal).\n";
    }

    // ---- 5b. Working capital built up (C44 slice 4), when declared -------
    WorkingCapitalBuildUp wcb;
    if (wcModel)
    {
        wcb = buildWorkingCapital(wcModel, result, rawMats, products,
                                  R, C_RM, COM_d, H);
        wcb.fractionUsed = workingCapital;
        wcb.fractionRule = workingCapital * FCI;
        WC  = wcb.net;
        TCI = FCI + WC;
    }

    // ---- 6.  DCF -- straight-line depreciation, after-tax cash flow -----
    const scalar d_annual = (depreciableLife > 0.0) ? (FCI / depreciableLife) : 0.0;
    const scalar salvage  = salvageFraction * FCI;

    const int    Nlife    = static_cast<int>(std::lround(projectLife));
    const int    Ndepr    = static_cast<int>(std::lround(depreciableLife));

    // Build the cash-flow timeline.  Year 0 = construction (-FCI and -WC at
    // startup are both placed at t=0 here for a 1-year construction; the WC
    // is recovered untaxed at end-of-life, salvage is taxed on the gain).
    std::vector<scalar> cashFlow(Nlife + 1, 0.0);
    cashFlow[0] = -FCI - WC;                 // construction + working capital
    for (int t = 1; t <= Nlife; ++t)
    {
        const scalar d_t  = (t <= Ndepr) ? d_annual : 0.0;
        const scalar CF_t = (R - COM_d - d_t) * (1.0 - taxRate) + d_t;
        cashFlow[t] = CF_t;
    }
    cashFlow[Nlife] += WC + salvage * (1.0 - taxRate);  // WC untaxed; salvage taxed

    auto npvAt = [&](scalar i) -> scalar
    {
        scalar npv = 0.0;
        for (int t = 0; t <= Nlife; ++t)
            npv += cashFlow[t] / std::pow(1.0 + i, t);
        return npv;
    };
    auto dNpvAt = [&](scalar i) -> scalar
    {
        scalar d = 0.0;
        for (int t = 1; t <= Nlife; ++t)
            d += -static_cast<scalar>(t) * cashFlow[t] / std::pow(1.0 + i, t + 1);
        return d;
    };

    const scalar NPV = npvAt(discountRate);

    // ---- 7.  IRR -- bisection bracket on [0,1], Newton polish -----------
    // Multiple-IRR guard: >1 sign change in the CUMULATIVE cash flow means the
    // NPV(i)=0 root may not be unique -> announce, prefer NPV.
    int cumSignChanges = 0;
    {
        scalar cum = 0.0;
        int    prevSign = 0;
        for (int t = 0; t <= Nlife; ++t)
        {
            cum += cashFlow[t];
            const int s = (cum > 0.0) ? 1 : (cum < 0.0 ? -1 : 0);
            if (s != 0 && prevSign != 0 && s != prevSign) ++cumSignChanges;
            if (s != 0) prevSign = s;
        }
    }
    const bool irrAmbiguous = (cumSignChanges > 1);

    scalar IRR        = std::nan("");
    bool   haveIRR    = false;
    {
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

            // Loud scale check: an extreme IRR means the cash flow dwarfs the
            // investment -- usually a throughput too large for the costed
            // equipment (the appraisal is mis-scaled), not a real 1000%-return.
            if (IRR > 2.0)
                std::cerr << "EconomicsPass: IRR = " << (100.0 * IRR)
                          << "% is EXTREME (>200%) -- the annual cash flow dwarfs the"
                             " investment (FCI = " << FCI << " EUR).  Verify the project"
                             " SCALE: a feed/product throughput too large for the costed"
                             " equipment inflates revenue & opex against a tiny CAPEX,"
                             " so the IRR is not physically meaningful.\n";
        }
    }

    // ---- 8.  Payback ----------------------------------------------------
    // Discounted payback (DEFAULT): year the cumulative DISCOUNTED cash flow
    // first turns positive (linear interpolation within the year).
    scalar discPayback = std::nan("");
    {
        scalar cum = 0.0, prevCum = 0.0;
        for (int t = 0; t <= Nlife; ++t)
        {
            const scalar disc = cashFlow[t] / std::pow(1.0 + discountRate, t);
            prevCum = cum;
            cum += disc;
            if (cum >= 0.0 && t > 0)
            {
                const scalar frac = (disc != 0.0) ? (-prevCum / disc) : 0.0;
                discPayback = (t - 1) + frac;
                break;
            }
        }
    }
    // Simple PBP (labelled; understates): FCI / (after-tax operating CF + d).
    const scalar afterTaxOpCF = (R - COM_d - d_annual) * (1.0 - taxRate) + d_annual;
    const scalar simplePayback = (afterTaxOpCF > 0.0) ? (FCI / afterTaxOpCF)
                                                      : std::nan("");

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
    if (!wcb.present)
        std::cout << "    WC  = " << std::setprecision(2) << workingCapital
                  << "*FCI              = "
                  << std::setprecision(0) << std::setw(14) << WC  << " EUR\n";
    else
        std::cout << "    WC  = net working capital    = "
                  << std::setprecision(0) << std::setw(14) << WC
                  << " EUR  (built up below; fundo de maneio)\n";
    std::cout << "    TCI = FCI + WC               = " << std::setw(14) << TCI << " EUR\n";
    std::cout << "    [Lang cross-check] " << std::setprecision(2) << langFactor
              << "*SCp = " << std::setprecision(0) << FCI_Lang
              << " EUR  (purchased-based; NOT used in FCI)\n";

    std::cout << "\n  -- OPEX (Turton Eq. 8.1, COM_d) ------------------------------\n";
    std::cout << "    0.180 x FCI                  = " << std::setw(14) << 0.180 * FCI << " EUR/yr\n";
    std::cout << "    N_OL = sqrt(6.29 + 0.23 x " << std::setprecision(1) << N_np
              << ") = " << std::setprecision(2) << N_OL_per_shift
              << "/shift -> " << std::setprecision(1) << operatorsTotal
              << " operating positions\n";
    std::cout << "    salary/operator = " << std::setprecision(0) << labourRate
              << " EUR/h x " << operatorAnnualHours << " h/yr = "
              << std::setw(0) << (labourRate * operatorAnnualHours) << " EUR/yr\n";
    std::cout << std::setprecision(0);
    std::cout << "    C_OL (labour)                = " << std::setw(14) << C_OL << " EUR/yr\n";
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
    std::cout << "    discount rate i              = " << discountRate << "\n";
    std::cout << "    project life N               = " << std::setprecision(0)
              << projectLife << " yr\n";
    std::cout << "    NPV(i=" << std::setprecision(3) << discountRate << ")        = "
              << std::setprecision(0) << std::setw(14) << NPV << " EUR\n";
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
    std::cout << "=====================================================================\n\n";

    // ---- 10.  Publish headline KPIs (the differentiator) ----------------
    auto& econ = result.kpis["economics"];
    econ["FCI"]          = FCI;
    econ["WC"]           = WC;
    econ["TCI"]          = TCI;
    econ["COM_d"]        = COM_d;
    econ["revenue"]      = R;
    econ["NPV"]          = NPV;
    econ["IRR"]          = haveIRR ? IRR : std::nan("");
    econ["paybackYears"] = std::isfinite(discPayback) ? discPayback : std::nan("");
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

    // ---- 11.  Build the year-by-year DCF table + emit the spreadsheet ----
    // The classic Perry / Turton income/cash-flow statement (years 0..N): the
    // SHEET is the deliverable, the log above is the echo.  Every column is
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
    summary.projectLife   = Nlife;
    summary.estimateClass = estimateClass;
    summary.accLo         = acc_lo;
    summary.accHi         = acc_hi;
    summary.workingCapital = wcb;
    summary.currency      = result.costs.empty()
                          ? std::string("EUR")
                          : result.costs.begin()->second.currency;

    scalar cumDisc = 0.0;
    for (int t = 0; t <= Nlife; ++t)
    {
        CashFlowYear row;
        row.year           = t;
        // Year 0 is construction: the only outflow is the capital (FCI + WC);
        // the operating columns are zero.  cashFlow[0] already carries that
        // negative outflow (-FCI - WC).
        const scalar d_t   = (t >= 1 && t <= Ndepr) ? d_annual : 0.0;
        if (t == 0)
        {
            row.investment    = cashFlow[0];   // -FCI - WC
        }
        else
        {
            row.revenue       = R;
            row.operatingCost = COM_d;
            row.depreciation  = d_t;
            row.taxableIncome = R - COM_d - d_t;
            row.tax           = taxRate * row.taxableIncome;
            row.afterTaxProfit = row.taxableIncome - row.tax;
        }
        row.cashFlow        = cashFlow[t];     // already includes WC/salvage at N
        row.discountFactor  = 1.0 / std::pow(1.0 + discountRate, t);
        row.discountedCF    = cashFlow[t] * row.discountFactor;
        cumDisc            += row.discountedCF;
        row.cumulativeDCF   = cumDisc;
        summary.cashFlow.push_back(row);
    }

    // Persist both the .csv and the coloured .ods (reports/economics/).
    writeCashFlowCsv(summary);
    writeCashFlowOds(summary);
    if (wcb.present) writeWorkingCapitalCsv(summary);

    return 0;
}

} // namespace Choupo
