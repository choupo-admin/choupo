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

#include "core/Dictionary.H"
#include "solver/NewtonRaphson.H"

#include <cmath>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <vector>

namespace Choupo {

namespace {

namespace fs = std::filesystem;

// Mass flow [kg/s] of a stream = F [kmol/s] * Sigma z_i * MW_i [kg/kmol].
// Mirrors ResponseExtractor::MW_mix; falls back to molar F (MW=1) only when
// the molar-mass map is incomplete -- which is loud because the printed €/yr
// would then be nonsense, so we instead THROW and tell the author.
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

    scalar mw = 0.0;
    for (std::size_t i = 0; i < s.z.size(); ++i)
    {
        auto mit = r.componentMolarMass.find(r.componentNames[i]);
        if (mit == r.componentMolarMass.end())
            throw std::runtime_error("EconomicsPass: molar mass for component '"
                + r.componentNames[i] + "' unavailable -- cannot mass-price "
                "stream '" + streamName + "'");
        mw += s.z[i] * mit->second;
    }
    return s.F * mw;     // kg/s
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
    const scalar workingCapital    = econDict_->lookupScalarOrDefault("workingCapital",       0.15);
    const scalar streamFactor      = econDict_->lookupScalarOrDefault("streamFactor",         0.90);
    const scalar siteFactor        = econDict_->lookupScalarOrDefault("siteFactor",           0.50);
    const scalar contingencyFee    = econDict_->lookupScalarOrDefault("contingencyFee",       1.18);
    const scalar N_np              = econDict_->lookupScalarOrDefault("N_np",                  7.0);
    const int    estimateClass     = static_cast<int>(
                                      econDict_->lookupScalarOrDefault("estimateClass",       4.0));
    const bool   refuseOnMissing   = econDict_->lookupScalarOrDefault("refuseOnMissingPrice", 1.0) != 0.0;

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
    const scalar WC  = workingCapital * FCI;
    const scalar TCI = FCI + WC;

    // Lang cross-check (solid-fluid 3.63 default) -- a reconciliation line
    // only; NEVER fed into the module-factor FCI (would double-count install).
    const scalar langFactor   = econDict_->lookupScalarOrDefault("langFactor", 3.63);
    const scalar FCI_Lang     = langFactor * sum_Cp;

    // ---- 4.  OPEX -- Turton cost-of-manufacture COM_d (Eq. 8.1) ---------
    // C_UT: reuse the already-computed utility allocation (€/h) * annual H.
    scalar C_UT = 0.0;
    for (const auto& a : result.utilityAllocation)
        C_UT += a.eur_h;          // €/h summed across allocated duties
    C_UT *= H;                    // €/yr

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
    const scalar C_OL = operatorsTotal * labourRate * H;   // €/yr

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
        // Bracket by scanning [0,1] for a sign change of NPV(i).
        const int    nScan = 200;
        scalar       iLo = 0.0, iHi = 1.0;
        scalar       fLo = npvAt(0.0);
        bool         bracketed = false;
        scalar       prevI = 0.0, prevF = fLo;
        for (int k = 1; k <= nScan; ++k)
        {
            const scalar i = static_cast<scalar>(k) / static_cast<scalar>(nScan);
            const scalar f = npvAt(i);
            if (std::isfinite(prevF) && std::isfinite(f) && prevF * f < 0.0)
            {
                iLo = prevI; iHi = i; bracketed = true;
                break;
            }
            prevI = i; prevF = f;
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
    const scalar acc_lo = (estimateClass <= 4) ? -30.0 : -15.0;
    const scalar acc_hi = (estimateClass <= 4) ? +50.0 : +25.0;

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
    std::cout << "    WC  = " << std::setprecision(2) << workingCapital
              << "*FCI              = "
              << std::setprecision(0) << std::setw(14) << WC  << " EUR\n";
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
    std::cout << std::setprecision(0);
    std::cout << "    C_OL (labour)                = " << std::setw(14) << C_OL << " EUR/yr\n";
    std::cout << "    2.73  x C_OL                 = " << std::setw(14) << 2.73 * C_OL << " EUR/yr\n";
    std::cout << "    C_RM (raw materials)         = " << std::setw(14) << C_RM << " EUR/yr\n";
    std::cout << "    C_UT (utilities, allocated)  = " << std::setw(14) << C_UT << " EUR/yr\n";
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

    return 0;
}

} // namespace Choupo
