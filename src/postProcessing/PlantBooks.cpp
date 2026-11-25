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

#include "PlantBooks.H"

#include "core/OdsWriter.H"

#include <algorithm>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace fs = std::filesystem;

namespace Choupo {

std::string plantBooksYearKey(int year)
{
    return year < 0 ? "ym" + std::to_string(-year) : "y" + std::to_string(year);
}

void buildPlantBooks(EconomicsSummary& e)
{
    if (e.cashFlow.empty())
        throw std::runtime_error("PlantBooks: the appraisal has no yearly rows.");
    const std::size_t n = e.cashFlow.size();
    const bool        fin = e.financingPresent;
    if (fin && e.loanSchedule.size() != n)
        throw std::runtime_error("PlantBooks: the loan schedule and the cash flow"
                                 " have different numbers of years.");
    const int     Nc  = e.constructionPeriod;
    const int     N   = e.cashFlow.back().year;
    const scalar  tau = e.taxRate;
    const scalar  land = e.landPresent ? e.landCost : 0.0;
    const bool    haveWC = e.workingCapital.present;

    //  The working-capital lines by key (all zero when only a fraction of FCI).
    auto wcLine = [&](const char* key, bool liab) -> scalar
    {
        if (!haveWC) return 0.0;
        for (const auto& l : (liab ? e.workingCapital.liabilities
                                   : e.workingCapital.assets))
            if (l.key == key) return l.value;
        return 0.0;
    };
    const scalar wcRaw  = wcLine("rawMaterialStock", false);
    const scalar wcProc = wcLine("processInventory", false);
    const scalar wcProd = wcLine("productStock",     false);
    const scalar wcRec  = wcLine("receivables",      false);
    const scalar wcCash = wcLine("minimumCash",      false);
    const scalar wcPay  = wcLine("payables",         true);
    //  Without the build-up the working capital is one undivided number.
    const scalar wcUndivided = haveWC ? 0.0 : e.WC;
    //  The net working capital the appraisal invests at year 0 and releases at N.
    const scalar WCnet = e.WC;

    PlantBooks& B = e.books;
    B = PlantBooks();
    B.present = true;
    B.basis   = fin ? "equity" : "project";

    //  One vector per account, one entry per year.
    auto vec = [&]() { return std::vector<scalar>(n, 0.0); };
    std::vector<scalar> revenue = vec(), variable = vec(), gross = vec(), fixedc = vec(),
        royalty = vec(), startup = vec(), ebitda = vec(), dep = vec(), ebit = vec(),
        interest = vec(), pbt = vec(), tax = vec(), pat = vec(), dispRes = vec(),
        dispTax = vec(), net = vec();
    std::vector<scalar> capex = vec(), landBuy = vec(), wcInv = vec(), wcRel = vec(),
        landSold = vec(), proceeds = vec(), taxSale = vec(), opCash = vec(),
        invCash = vec(), paidIn = vec(), draw = vec(), repaid = vec(), divid = vec(),
        finCash = vec(), change = vec(), opening = vec(), closing = vec(),
        flowApp = vec(), flowTie = vec();
    std::vector<scalar> cost = vec(), accDep = vec(), netFixed = vec(), landA = vec(),
        raw = vec(), proc = vec(), prod = vec(), inv = vec(), rec = vec(), resv = vec(),
        undiv = vec(), cashA = vec(), assets = vec(), pay = vec(), loan = vec(),
        liab = vec(), share = vec(), re = vec(), equity = vec(), le = vec(), diff = vec();

    scalar cumCost = 0, cumDep = 0, cumShare = 0, cumRE = 0, cash = 0;
    scalar worstIncome = 0, worstRE = 0;
    std::vector<scalar> reStep = vec();
    for (std::size_t i = 0; i < n; ++i)
    {
        const CashFlowYear& r = e.cashFlow[i];
        const LoanYear*     y = fin ? &e.loanSchedule[i] : nullptr;
        const int           t = r.year;
        const bool          operating = (t >= 1);
        const bool          last      = (t == N);

        // ---- income statement ------------------------------------------
        const scalar idcDep = y ? y->idcDepreciation : 0.0;
        if (operating)
        {
            revenue[i]  = r.revenue;
            fixedc[i]   = e.fixedOperatingCost;
            variable[i] = r.operatingCost - fixedc[i];
            gross[i]    = revenue[i] - variable[i];
            royalty[i]  = r.royalty;
            startup[i]  = r.startupCost;
            ebitda[i]   = gross[i] - fixedc[i] - royalty[i] - startup[i];
            dep[i]      = r.depreciation + idcDep;
            ebit[i]     = ebitda[i] - dep[i];
            interest[i] = y ? y->interestPaid : 0.0;
            pbt[i]      = ebit[i] - interest[i];
            tax[i]      = y ? y->tax : r.tax;
            pat[i]      = pbt[i] - tax[i];
            worstIncome = std::max(worstIncome,
                                   std::abs(ebit[i] + idcDep - r.taxableIncome));
        }

        // ---- capital and the wind-up ------------------------------------
        if (t <= 0)
        {
            const int k = t + Nc;     // construction year k of Nc
            if (k >= 1 && k <= Nc)
                capex[i] = e.capitalSchedule[static_cast<std::size_t>(k - 1)] * e.FCI;
            if (e.landPresent && t == -Nc) landBuy[i] = land;
            if (t == 0) wcInv[i] = WCnet;
        }
        const scalar idcCap = y ? y->interestCapitalised : 0.0;
        cumCost += capex[i] + idcCap;
        cumDep  += dep[i];
        const scalar bookValue = cumCost - cumDep;
        if (last)
        {
            wcRel[i]    = WCnet;
            landSold[i] = land;
            proceeds[i] = e.salvage;
            taxSale[i]  = tau * e.salvage;
            dispRes[i]  = e.salvage - bookValue;
            dispTax[i]  = taxSale[i];
        }
        net[i] = pat[i] + dispRes[i] - dispTax[i];

        // ---- cash-flow statement -----------------------------------------
        opCash[i]  = pat[i] + dep[i];
        invCash[i] = -capex[i] - landBuy[i] - wcInv[i]
                   + wcRel[i] + landSold[i] + proceeds[i] - taxSale[i];
        draw[i]    = y ? y->draw : 0.0;
        repaid[i]  = y ? y->principal : 0.0;
        flowApp[i] = y ? y->cashFlow : r.cashFlow;
        flowTie[i] = (opCash[i] + invCash[i] + draw[i] - repaid[i]) - flowApp[i];
        //  The owners pay in what the construction costs beyond the loan: the
        //  appraisal's own (negative) flow of a construction year, sign changed.
        if (t <= 0) paidIn[i] = -flowApp[i];
        finCash[i] = paidIn[i] + draw[i] - repaid[i] - divid[i];
        opening[i] = cash;
        change[i]  = opCash[i] + invCash[i] + finCash[i];
        cash      += change[i];
        closing[i] = cash;

        // ---- balance sheet (end of the year) -------------------------------
        cumShare += paidIn[i];
        const scalar reBefore = cumRE;
        cumRE    += net[i] - divid[i];
        reStep[i] = std::abs(cumRE - reBefore - (net[i] - divid[i]));
        worstRE   = std::max(worstRE, reStep[i]);
        const bool plantHeld = !last;         // the wind-up turns it all into cash
        cost[i]     = plantHeld ? cumCost : 0.0;
        accDep[i]   = plantHeld ? -cumDep : 0.0;
        netFixed[i] = cost[i] + accDep[i];
        landA[i]    = (plantHeld && e.landPresent && t >= -Nc) ? land : 0.0;
        const bool wcHeld = plantHeld && t >= 0;
        raw[i]   = wcHeld ? wcRaw  : 0.0;
        proc[i]  = wcHeld ? wcProc : 0.0;
        prod[i]  = wcHeld ? wcProd : 0.0;
        inv[i]   = raw[i] + proc[i] + prod[i];
        rec[i]   = wcHeld ? wcRec  : 0.0;
        resv[i]  = wcHeld ? wcCash : 0.0;
        undiv[i] = wcHeld ? wcUndivided : 0.0;
        pay[i]   = wcHeld ? wcPay  : 0.0;
        cashA[i] = closing[i];
        assets[i] = netFixed[i] + landA[i] + inv[i] + rec[i] + resv[i] + undiv[i] + cashA[i];
        loan[i]   = y ? y->balance : 0.0;
        liab[i]   = pay[i] + loan[i];
        share[i]  = cumShare;
        re[i]     = cumRE;
        equity[i] = share[i] + re[i];
        le[i]     = liab[i] + equity[i];
        diff[i]   = assets[i] - le[i];
        B.years.push_back(t);
    }

    // ---- the identities ------------------------------------------------------
    scalar scale = 0.0;
    for (std::size_t i = 0; i < n; ++i)
        scale = std::max({ scale, std::abs(assets[i]), std::abs(le[i]) });
    if (!(scale > 0.0)) scale = 1.0;
    auto track = [&](scalar absErr, std::size_t i, const char* name, scalar& slot)
    {
        const scalar rel = absErr / scale;
        if (rel > slot) slot = rel;
        if (rel > B.worstError)
        {
            B.worstError = rel; B.worstYear = e.cashFlow[i].year;
            B.worstIdentity = name;
        }
    };
    for (std::size_t i = 0; i < n; ++i)
    {
        track(std::abs(diff[i]),    i, "assets = liabilities + equity", B.balanceError);
        track(std::abs(flowTie[i]), i, "statement flows = the appraisal's cash flow",
              B.cashTieError);
        track(reStep[i],            i, "retained earnings roll forward", B.retainedError);
    }
    B.incomeTieError = worstIncome / scale;
    if (B.incomeTieError > B.worstError)
    {
        B.worstError = B.incomeTieError;
        B.worstIdentity = "EBIT = the appraisal's taxable income";
        B.worstYear = 0;
    }
    scalar ownersLhs = 0.0, paidTotal = 0.0, divTotal = 0.0, netTotal = 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        ownersLhs += flowApp[i]; paidTotal += paidIn[i];
        divTotal += divid[i];    netTotal  += net[i];
    }
    B.ownersError = std::abs(ownersLhs - (closing.back() + divTotal - paidTotal)) / scale;
    if (B.ownersError > B.worstError)
    {
        B.worstError = B.ownersError;
        B.worstIdentity = "sum of owners' flows = closing cash + dividends - paid in";
        B.worstYear = N;
    }
    B.closingCash    = closing.back();
    B.paidIn         = paidTotal;
    B.netProfitTotal = netTotal;
    for (std::size_t i = 0; i < n; ++i)
        if (closing[i] < -1e-9 * scale) B.cashOverdrawn = true;
    B.totalAssets = assets; B.totalLiabilities = liab; B.totalEquity = equity;

    // ---- the rows (labels and plain-language definitions: one home) ----------
    auto add = [](std::vector<BooksRow>& v, const char* key, const char* label,
                  const char* help, const std::vector<scalar>& values,
                  bool subtotal = false)
    {
        BooksRow r;
        r.key = key; r.label = label; r.help = help; r.values = values;
        r.subtotal = subtotal;
        v.push_back(std::move(r));
    };
    auto& I = B.income;
    add(I, "revenue",            "Revenue", "What the plant sells in the year: price x quantity sold.", revenue);
    add(I, "variableCost",       "Variable cost", "Raw materials, utilities and waste, with Turton's 1.23 factor: it grows and shrinks with production.", variable);
    add(I, "grossMargin",        "Gross margin", "Revenue less variable cost: what is left to pay the plant's fixed costs.", gross, true);
    add(I, "fixedOperatingCost", "Fixed operating cost", "0.180 x fixed capital + 2.73 x operating labour: paid whatever is produced.", fixedc);
    add(I, "royalty",            "Royalty", "A licence fee on sales or on the cost of manufacture, only if the case declares one.", royalty);
    add(I, "startupCost",        "Start-up cost", "A one-off cost of starting the plant, expensed in year 1.", startup);
    add(I, "ebitda",             "EBITDA", "Earnings before interest, tax, depreciation and amortisation: the plant's cash earnings before financing and tax.", ebitda, true);
    add(I, "depreciation",       "Depreciation", "The plant's cost spread over its depreciable life (plus the capitalised loan interest): a cost with no cash leaving.", dep);
    add(I, "ebit",               "EBIT", "Earnings before interest and tax: EBITDA less depreciation.", ebit, true);
    add(I, "interest",           "Interest", "Interest paid on the loan in the year (zero without a declared loan).", interest);
    add(I, "profitBeforeTax",    "Profit before tax", "EBIT less interest: the profit the tax is charged on.", pbt, true);
    add(I, "tax",                "Tax", "Tax rate x profit before tax; a loss earns a credit (negative) or nothing, as the case's taxOnLoss says.", tax);
    add(I, "profitAfterTax",     "Profit after tax", "What the operation earned for the owners in the year.", pat, true);
    add(I, "disposalResult",     "Result on disposal of the plant", "Last year only: the plant's sale price less its book value (cost less accumulated depreciation).", dispRes);
    add(I, "disposalTax",        "Tax on the sale", "Last year only: the tax rate x the sale price, as the appraisal charges it.", dispTax);
    add(I, "netProfit",          "Net profit", "Profit after tax plus the result on disposal less its tax: what goes to retained earnings.", net, true);

    auto& S = B.balance;
    add(S, "fixedAssetsAtCost",       "Fixed assets at cost", "The capital spent on the plant so far, including interest capitalised during construction.", cost);
    add(S, "accumulatedDepreciation", "Accumulated depreciation", "The depreciation charged so far (negative: it lowers the plant's book value).", accDep);
    add(S, "netFixedAssets",          "Net fixed assets", "The plant's book value: cost less accumulated depreciation.", netFixed, true);
    add(S, "land",                    "Land", "The plot, at purchase cost; never depreciated.", landA);
    add(S, "rawMaterialStock",        "Raw-material stock", "Feed held in store (working capital).", raw);
    add(S, "processInventory",        "Process inventory", "Material held inside the equipment (working capital).", proc);
    add(S, "productStock",            "Product stock", "Product waiting to be sold, valued at its cost (working capital).", prod);
    add(S, "receivables",             "Receivables", "Sales delivered and not yet paid by customers.", rec);
    add(S, "operatingCashReserve",    "Operating cash reserve", "The minimum cash the working capital keeps for day-to-day payments.", resv);
    add(S, "undividedWorkingCapital", "Working capital (undivided)", "Used when the case states working capital as a fraction of the fixed capital, with no split.", undiv);
    add(S, "cash",                    "Cash", "Cash the plant has accumulated; negative means the project does not fund itself that year.", cashA);
    add(S, "totalAssets",             "Total assets", "Everything the plant owns.", assets, true);
    add(S, "payables",                "Payables", "Bills from suppliers not yet paid (working capital).", pay);
    add(S, "loan",                    "Loan", "What is still owed to the lender (including interest capitalised in construction).", loan);
    add(S, "totalLiabilities",        "Total liabilities", "Everything the plant owes.", liab, true);
    add(S, "shareCapital",            "Share capital", "What the owners paid in: it covers the part of the construction the loan does not.", share);
    add(S, "retainedEarnings",        "Retained earnings", "Profits kept in the plant (no dividends are paid).", re);
    add(S, "totalEquity",             "Total equity", "The owners' stake: share capital plus retained earnings.", equity, true);
    add(S, "totalLiabilitiesAndEquity","Total liabilities and equity", "Must equal total assets in every year.", le, true);
    add(S, "difference",              "Difference (assets - liabilities - equity)", "The check: zero to rounding.", diff);

    auto& C = B.cash;
    add(C, "profitAfterTax",          "Profit after tax", "From the income statement (operation only).", pat);
    add(C, "depreciation",            "Depreciation added back", "A cost with no cash leaving, so it is added back.", dep);
    add(C, "operatingCash",           "Cash from operations", "Cash the operation produces, after interest and tax.", opCash, true);
    add(C, "capex",                   "Capital spent", "The plant paid for in the construction years.", capex);
    add(C, "landPurchase",            "Land bought", "The plot, bought when construction starts.", landBuy);
    add(C, "workingCapitalInvested",  "Working capital invested", "Stocks, receivables and cash reserve, less payables, put in at start-up (year 0).", wcInv);
    add(C, "workingCapitalReleased",  "Working capital released", "Recovered at the end of life.", wcRel);
    add(C, "landSold",                "Land sold", "Recovered at its purchase cost at the end of life.", landSold);
    add(C, "plantProceeds",           "Plant sold", "The salvage value of the plant at the end of life.", proceeds);
    add(C, "taxOnSale",               "Tax on the sale", "Tax rate x the sale price, as the appraisal charges it.", taxSale);
    add(C, "investingCash",           "Cash from investing", "Capital out, recoveries in.", invCash, true);
    add(C, "shareCapitalPaidIn",      "Share capital paid in", "The owners' money that covers the construction beyond the loan.", paidIn);
    add(C, "loanDrawn",               "Loan drawn", "Money borrowed in the year.", draw);
    add(C, "loanRepaid",              "Loan repaid", "Principal paid back in the year.", repaid);
    add(C, "dividends",               "Dividends", "None: the cash stays in the plant.", divid);
    add(C, "financingCash",           "Cash from financing", "Owners' money and loan flows.", finCash, true);
    add(C, "netChange",               "Net change in cash", "Operations + investing + financing.", change, true);
    add(C, "openingCash",             "Opening cash", "Closing cash of the year before.", opening);
    add(C, "closingCash",             "Closing cash", "The balance sheet's cash.", closing, true);
    add(C, "appraisalFlow",           "Check: the appraisal's cash flow", "The cash flow the NPV discounts (equity cash flow if a loan is declared), before the owners' paid-in capital.", flowApp);
    add(C, "flowTieError",            "Check: statement flows - appraisal", "Operations + investing + loan flows less the line above: zero to rounding.", flowTie);
}

std::string plantBooksLogLine(const PlantBooks& b)
{
    std::ostringstream os;
    os << "  [economics] plant books: assets = liabilities + equity, cash tied to the"
          " appraisal, retained earnings rolled -- worst relative error "
       << std::scientific << std::setprecision(2) << b.worstError;
    if (b.worstError > 1e-12)
        os << " (" << b.worstIdentity << ", year " << b.worstYear << ")";
    if (b.cashOverdrawn)
        os << "; cash is NEGATIVE in some year (the project does not fund itself)";
    return os.str();
}

namespace {

std::string num(scalar v, int d)
{
    std::ostringstream os;
    os << std::fixed << std::setprecision(d) << v;
    return os.str();
}

void writeStatementCsv(const fs::path& path, const EconomicsSummary& e,
                       const char* title, const std::vector<BooksRow>& rows,
                       const char* note)
{
    std::ofstream f(path);
    if (!f.is_open())
        throw std::runtime_error("PlantBooks: cannot open " + path.string());
    f << "# " << title << ", " << e.currency << ".  Accounts down, years across"
         " (year 0 = end of construction).\n";
    f << "# " << note << "\n";
    f << "# Definitions of every account: docs/design/plant-books.md.\n";
    f << "account";
    for (int y : e.books.years) f << "," << y;
    f << "\n";
    for (const auto& r : rows)
    {
        f << r.label;
        for (scalar v : r.values) f << "," << num(v, 2);
        f << "\n";
    }
}

void odsStatement(OdsWriter& ods, const EconomicsSummary& e, const char* sheet,
                  const char* title, const std::vector<BooksRow>& rows)
{
    ods.beginSheet(sheet);
    ods.newRow();
    ods.textCell(std::string(title) + "  [" + e.currency + "]", OdsWriter::Title);
    ods.newRow();
    ods.textCell("Account", OdsWriter::Header);
    for (int y : e.books.years) ods.textCell("Year " + std::to_string(y), OdsWriter::Header);
    for (const auto& r : rows)
    {
        ods.newRow();
        ods.textCell(r.label, r.subtotal ? OdsWriter::Bold : OdsWriter::Plain);
        for (scalar v : r.values)
            ods.numberCell(v, 0, r.subtotal ? OdsWriter::Bold : OdsWriter::Plain);
    }
}

} // namespace

void writePlantBooksCsv(const EconomicsSummary& e)
{
    if (!e.books.present) return;
    const fs::path dir = fs::path("reports") / "economics";
    fs::create_directories(dir);
    writeStatementCsv(dir / "incomeStatement.csv", e, "Income statement", e.books.income,
        "Revenue - variable cost = gross margin; - fixed cost, royalty, start-up = EBITDA;"
        " - depreciation = EBIT; - interest = profit before tax; - tax = profit after tax.");
    writeStatementCsv(dir / "balanceSheet.csv", e, "Balance sheet (end of each year)",
        e.books.balance,
        "Total assets = total liabilities + total equity, every year.  The last year is"
        " after the wind-up (plant, land and working capital turned into cash).");
    writeStatementCsv(dir / "cashFlowStatement.csv", e, "Cash-flow statement",
        e.books.cash,
        "Closing cash = the balance sheet's cash.  Operations + investing + loan flows ="
        " the appraisal's cash flow of the year.");
    std::cout << "  [economics] income statement, balance sheet, cash-flow statement -> "
              << dir.string() << "/{incomeStatement,balanceSheet,cashFlowStatement}.csv\n";
}

void addPlantBooksSheets(OdsWriter& ods, const EconomicsSummary& e)
{
    if (!e.books.present) return;
    odsStatement(ods, e, "Income statement", "Income statement", e.books.income);
    odsStatement(ods, e, "Balance sheet", "Balance sheet (end of each year)", e.books.balance);
    odsStatement(ods, e, "Cash-flow statement", "Cash-flow statement", e.books.cash);
}

} // namespace Choupo
