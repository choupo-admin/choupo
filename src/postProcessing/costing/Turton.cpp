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

#include "Turton.H"

#include "core/Advisory.H"
#include "core/RegistryRefusal.H"

#include <cmath>
#include <map>
#include <iostream>
#include <iomanip>
#include <sstream>
#include <stdexcept>
#include <vector>

namespace Choupo {

namespace {

// Turton 4th/5th ed. Appendix A. Costs in 2001 USD (baseYear); the CostingPass
// updates each to the target year via the CEPCI ratio, so EVERY correlation
// here MUST be on the same 2001 basis or the CEPCI scaling is wrong.
//
// Two purchased-cost forms are supported, both 2001 USD:
//   * Turton log-quadratic  : log10(Cp) = K1 + K2 log10 S + K3 (log10 S)^2
//   * single-anchor power law: Cp = Cp_ref * (S / S_ref)^n
// The power-law form is used for equipment Turton App. A does not tabulate as
// a log-quadratic (crystalliser, spray dryer, cyclone); each anchor names its
// PRIMARY source in the comment beside it (glass-box: one cited point + the
// classic six-/seven-tenths exponent).
struct EquipCoeffs
{
    scalar K1, K2, K3;     // C_p log-quadratic correlation (Turton form)
    scalar B1, B2;         // bare-module
    scalar C1, C2, C3;     // pressure-factor correlation
    scalar Smin, Smax;     // sizing parameter validity range
    std::string sizeKey;   // which EquipmentSizing value provides S
    bool   powerLaw  = false;  // true: use the Cp_ref/(S_ref,n) anchor below
    scalar Cp_ref    = 0.0;    // anchor purchased cost [2001 USD]
    scalar S_ref     = 1.0;    // anchor size (same units as the sizeKey)
    scalar n_exp     = 0.6;    // power-law exponent
    scalar baseYear  = 2001.0; // CEPCI basis of this correlation
};

// Process Vessels (vertical/horizontal) — Turton table A.1
// S = V_R [m³];   P in bar gauge for F_P
const EquipCoeffs vesselCoeffs {
    3.4974, 0.4485, 0.1074,
    2.25,   1.82,
    -0.4045, 0.1859, 0.0,
    0.3, 520.0,
    "V_R"
};

// Heat Exchanger (shell & tube fixed-tube) — Turton table A.1
const EquipCoeffs hxCoeffs {
    4.3247, -0.3030, 0.1634,
    1.63,   1.66,
    0.03881, -0.11272, 0.08183,
    10.0, 1000.0,
    "A"
};

// Evaporator (long-tube / forced-circulation) — Turton 5th ed. App. A Table A.1
// S = A [m²] heat-transfer area;  near-atmospheric -> the vessel ASME F_P path
// is not used (F_P=1).  C1..C3 unused (no polynomial F_P for this item).
const EquipCoeffs evaporatorCoeffs {
    5.0238, 0.3475, 0.0703,
    2.25,   1.82,
    0.0, 0.0, 0.0,
    10.0, 1000.0,
    "A"
};

// Crystalliser (continuous forced-circulation / MSMPR) — single cited anchor.
//   PRIMARY: Seider, Seader, Lewin & Widagdo, "Product & Process Design
//   Principles" 3rd ed., crystalliser cost chart (continuous, jacketed).
//   Anchor: ~10 m³ magma working volume -> ~3.0e5 USD (2001 basis); six-tenths
//   scaling.  Near-atmospheric -> F_P=1.
const EquipCoeffs crystalliserCoeffs {
    0.0, 0.0, 0.0,
    2.25, 1.82,                 // vessel-like bare-module (installed field unit)
    0.0, 0.0, 0.0,
    1.0, 200.0,
    "V_magma",
    true,  3.0e5, 10.0, 0.60, 2001.0
};

// Spray dryer — single cited anchor on the water-evaporation rate.
//   PRIMARY: Turton et al. 5th ed. App. A "dryer" chart (spray); evaporation
//   rate as the size driver.  Anchor: ~0.1 kg/s evaporated -> ~1.8e5 USD
//   (2001 basis); six-tenths scaling.  Near-atmospheric -> F_P=1.
const EquipCoeffs sprayDryerCoeffs {
    0.0, 0.0, 0.0,
    1.60, 1.20,                 // packaged dryer module factors (lighter than a vessel)
    0.0, 0.0, 0.0,
    0.005, 5.0,
    "W_evap",
    true,  1.8e5, 0.10, 0.60, 2001.0
};

// Cyclone (gas-solid) — single cited anchor on the inlet volumetric gas flow.
//   PRIMARY: Sinnott & Towler, "Chemical Engineering Design" 6th ed., gas
//   cyclone cost vs. gas throughput.  Anchor: ~1 m³/s -> ~2.5e3 USD (2001
//   basis); seven-tenths scaling.  Near-atmospheric -> F_P=1.
const EquipCoeffs cycloneCoeffs {
    0.0, 0.0, 0.0,
    1.30, 0.90,                 // light fabricated item
    0.0, 0.0, 0.0,
    0.05, 50.0,
    "Q_gas",
    true,  2.5e3, 1.0, 0.70, 2001.0
};

// Centrifugal compressor (+ electric drive) -- Turton table A.1 / A.6.  Size
// driver = shaft power [kW].  F_BM = 2.7 (direct, incl. drive; F_P = 1 --
// Turton folds the discharge pressure into the power, not a separate factor).
// Correlation validity 450-3000 kW; the range is widened here to cover a
// world-scale syngas compressor, an EXTRAPOLATION the pass flags aloud.
const EquipCoeffs compressorCoeffs {
    2.2897, 1.3604, -0.1027,
    2.70, 0.0,
    0.0, 0.0, 0.0,
    450.0, 30000.0,
    "power",
    false, 0.0, 1.0, 0.6, 2001.0
};

//  ---- A STORAGE TANK (2026-10-07, DEV.md 4c C44 slice 2) -----------------
//
//  An ATMOSPHERIC API FIXED-ROOF TANK, S = V [m3] of ONE tank:
//
//      log10 C_p = K1 + K2 log10 V + K3 (log10 V)^2        (2001 USD)
//      C_BM      = C_p x (B1 + B2 F_M F_P) = 1.1 C_p       (B2 = 0)
//
//  WHERE EVERY NUMBER WAS READ.  Transcribed on 2026-10-07 from CAPCOST 2017
//  (`capcost_2017_rev2.xlsm`, sha256 2747f01f...f428e4), the same program and
//  the same download as the tray set below: worksheet "Equipment Cost Data",
//  block "Tank Data", row "Fixed Roof", cells C204:I204 -- K1 4.8509, K2
//  -0.3973, K3 0.1445, B1 1.1, B2 0, Vmin 90, Vmax 30000.  The block's own
//  header labels the range "Vmin(m3/s) Vmax(m3/s)"; the program's input
//  sheet ("Equipment Summary", cell C58) asks for the storage tank's
//  "Volume (cubic meters)", so the range is read as m3 -- a volume, which
//  is what a tank's size is.  The BOOK's table was NOT read.  B2 = 0 means
//  the program prices a tank with NO material and NO pressure factor: the
//  `material` an item declares is recorded on its sheet and moves no euro.
//  The "Floating Roof" row (C205:I205) is NOT transcribed: no item here
//  declares a floating roof, and a set nothing reaches is a set nothing
//  checks.
//
//  WHAT IT DOES NOT PRICE, said on every run that uses it.  The program
//  carries no refrigerated, insulated or double-containment tank.  A
//  refrigerated store priced on this row is a LOWER BOUND, and the item
//  carries the word (`service refrigerated`) so the costing line says so
//  -- no factor is invented to close the gap.
const EquipCoeffs storageTankCoeffs {
    4.8509, -0.3973, 0.1445,
    1.1,    0.0,
    0.0, 0.0, 0.0,
    90.0, 30000.0,
    "V_R"
};

//  ---- THE TRAY STACK (2026-10-05, DEV.md 4c C38 item 1) -------------------
//
//  A tray is bought BY THE TRAY, so its shape is not the per-item one above:
//
//      log10 C_p0  = K1 + K2 log10 A + K3 (log10 A)^2     (one tray, 2001 USD)
//      C_p         = N x C_p0                             (the whole stack)
//      C_BM        = C_p x F_BM x F_q
//      log10 F_q   = 0.4771 + 0.08516 log10 N - 0.3473 (log10 N)^2  if N < 20
//      F_q         = 1                                              if N >= 20
//
//  with A the tower cross-section [m2] and N the number of trays.  No
//  pressure factor (a tray does not hold pressure) and no material factor
//  F_M: Turton prices the tray's material through F_BM, by material class.
//
//  WHERE EVERY NUMBER BELOW WAS READ, and what was NOT read.  The values were
//  transcribed on 2026-10-05 from CAPCOST 2017 (file `capcost_2017_rev2.xlsm`),
//  the costing program the authors distribute with Turton, Shaeiwitz,
//  Bhattacharyya & Whiting, "Analysis, Synthesis and Design of Chemical
//  Processes", 5th ed. (Pearson, 2018), downloaded from Richard Turton's
//  faculty page at West Virginia University:
//    * K1, K2, K3, Amin, Amax  -- worksheet "Equipment Cost Data", block
//      "Tower Trays", row "Sieve", cells C257:G257;
//    * F_BM                    -- same worksheet, block "FBM", column
//      "Sieve", rows "CS" (D262), "SS" (D263) and "Ni-alloy" (D265);
//    * F_q and its N < 20 rule -- the formula printed in cell B267, and the
//      program's own macro `calculateTrayCosts`, which also states the shape
//      above (C_p = N x 10^(...) x CEPCI/397; C_BM = C_p x F_BM x F_q;
//      F_q = 1 for N >= 20).
//  The BOOK's own table and page were NOT read: the program is the authors'
//  machine-readable copy of the same Appendix A, and two facts tie it to the
//  data this file already carried -- its vertical-vessel set is identical, to
//  the last digit, to `vesselCoeffs` above (3.4974, 0.4485, 0.1074, 0.3-520,
//  B1 2.25, B2 1.82), and its own worked tower (T-101: 32 sieve trays,
//  D 2.1 m, H 23 m) reproduces from these numbers on the CEPCI-397 basis --
//  `check_design_sheet` arm (m) recomputes that anchor.  The CAPCOST VALVE-tray
//  and demister rows are NOT transcribed: no Choupo unit sizes either (the
//  hydraulics pass rates sieve trays only), and a set no item can reach is a
//  coefficient nobody checks.
struct TrayCoeffs
{
    scalar K1, K2, K3;
    scalar Amin, Amax;            // validity range of A [m2]
};

const TrayCoeffs sieveTrayCoeffs { 2.9949, 0.4465, 0.3961, 0.07, 12.3 };

//  F_BM by the tray's MATERIAL CLASS.  The case DECLARES the class
//  (`trayMaterial` in the column's designRules): trays are often a different
//  material from the shell -- CAPCOST's own example is stainless trays in a
//  carbon-steel tower -- and reading a class out of a construction-material
//  record's NAME would be the name identity this project bans.
struct TrayMaterialFactor
{
    const char* word;
    scalar      F_BM;
};

const TrayMaterialFactor sieveTrayFBM[] =
{
    { "carbonSteel",    1.00 },
    { "stainlessSteel", 1.83 },
    { "nickelAlloy",    5.58 },
};

scalar trayQuantityFactor(scalar N)
{
    if (N >= 20.0) return 1.0;
    const scalar l = std::log10(N);
    return std::pow(10.0, 0.4771 + 0.08516 * l - 0.3473 * l * l);
}

const EquipCoeffs& coeffsFor(const std::string& equipType)
{
    if (equipType == "stirredTank")  return vesselCoeffs;
    if (equipType == "vessel")       return vesselCoeffs;
    if (equipType == "shellTubeHX")  return hxCoeffs;
    if (equipType == "evaporator")   return evaporatorCoeffs;
    if (equipType == "crystalliser") return crystalliserCoeffs;
    if (equipType == "sprayDryer")   return sprayDryerCoeffs;
    if (equipType == "cyclone")      return cycloneCoeffs;
    if (equipType == "compressor")   return compressorCoeffs;
    if (equipType == "storageTank")  return storageTankCoeffs;

    //  The TRAY STACK does not come through here: it is bought by the tray,
    //  on its own correlation shape, and `Turton::cost` routes it to
    //  `costTrayStack` before this lookup is reached (2026-10-05, DEV.md 4c
    //  C38 item 1).

    throw std::runtime_error("Turton: no cost correlation for equipment '"
        + equipType + "'");
}

scalar log10Cp(const EquipCoeffs& c, scalar S)
{
    const scalar logS = std::log10(S);
    return c.K1 + c.K2 * logS + c.K3 * logS * logS;
}

// Polynomial pressure factor (Turton A.2 — heat exchangers, pumps, …).
scalar pressureFactor_poly(const EquipCoeffs& c, scalar P_bar)
{
    if (P_bar <= 0.0) return 1.0;
    const scalar logP = std::log10(P_bar);
    const scalar fp = std::pow(10.0,
                                c.C1 + c.C2 * logP + c.C3 * logP * logP);
    return std::max(fp, 1.0);
}

// ASME §VIII Div.1 thin-wall pressure factor for process vessels.
//   t_w = (D · P_g) / (2(σ - 0.6 P_g))   [m]
//   F_P = (t_w + 0.00315) / 0.0063, clamped to ≥ 1
// Turton 4th ed., Eq. A.6 / A.7.
scalar pressureFactor_vessel(scalar D_m, scalar P_gauge_bar, scalar sigma_MPa)
{
    // Preconditions (checked by the caller, which knows the material and
    // unit NAMES): sigma_MPa > 0 and denom > 0.  Until 2026-08-22 all three
    // missing-data paths returned F_P = 1.0 -- the CHEAPEST possible factor
    // for exactly the vessels whose data was absent, including a material
    // whose allowable stress cannot contain the design pressure at all.
    if (P_gauge_bar <= 0.0) return 1.0;
    const scalar sigma_bar = sigma_MPa * 10.0;     // MPa → bar
    const scalar denom = 2.0 * (sigma_bar - 0.6 * P_gauge_bar);
    if (denom <= 0.0) return 1.0;
    const scalar t_w = (D_m * P_gauge_bar) / denom;
    return std::max((t_w + 0.00315) / 0.0063, 1.0);
}

} // anonymous namespace

//  THE FOUR PRICE-INDEX CONSTANTS, IN ONE PLACE, AND EACH ANNOUNCED WHEN IT
//  IS USED (2026-09-06).
//
//  They used to be six literals: `2026.0`, `820.0`, `397.0`, `0.92` in the
//  constructor's `lookupScalarOrDefault` calls AND the same four again as
//  in-class member initialisers, plus `2026.0` and `820.0` a THIRD time
//  inside `CostingPass`'s header line, which read the dict itself.  Three
//  homes for two of them.  The literals all agreed, so nothing was wrong
//  today and everything would be wrong the day one moved.
//
//  Announcing matters more here than the tidiness does.  A CEPCI is the
//  factor that turns a 2001 correlation into this year's money: a total
//  priced on an ASSUMED index and a total priced on a DECLARED one are
//  different claims, and until now they printed identically.  Every corpus
//  case declares all four (measured 2026-09-06: 8 of 8 costing cases), so no
//  shipped case changes -- which is exactly why the default path had never
//  been looked at.
namespace {

struct PriceIndexDefault
{
    const char* key;
    scalar      value;
    const char* why;
};

const PriceIndexDefault priceIndexDefaults[] =
{
    { "year",      2026.0, "the target year the cost is quoted in" },
    { "cepci",      820.0, "the target-year CEPCI (Chemical Engineering Plant"
                           " Cost Index).  It is PUBLISHED MONTHLY and this"
                           " number is not a curated datum: quote the index"
                           " for the year you are reporting in" },
    { "cepci2001",  397.0, "the CEPCI of the correlations' own 2001 basis;"
                           " changing it re-bases every coefficient in"
                           " Turton App. A and should not be done casually" },
    { "usdToEur",     0.92, "the USD->EUR rate the 2001 USD correlation is"
                            " converted at; a rate is a date, so declare the"
                            " one your report is dated on" },
};

//  The declared value, or the default ANNOUNCED.  A DECLARED value announces
//  nothing: silence keeps meaning "nothing was assumed".
scalar priceIndexOr(const DictPtr& dict, const PriceIndexDefault& d)
{
    if (dict && dict->found(d.key)) return dict->lookupScalar(d.key);

    std::ostringstream v;
    v << std::defaultfloat << std::setprecision(6) << d.value;

    std::ostringstream m;
    m << d.key << " was NOT declared in the `costing {}` block: every capital"
         " cost below was priced with the engine's built-in default "
      << v.str() << " -- " << d.why << ".  Declare `" << d.key << " "
      << v.str() << ";` (or your own value) to make it the author's choice"
         " rather than the engine's assumption.";

    if (AdvisoryLog::instance().add("assumed", "warning", "costing", m.str()))
        std::cout << "  [assumed] costing: " << m.str() << "\n";
    return d.value;
}

} // anonymous namespace

Turton::Turton(const DictPtr& dict)
{
    year_      = priceIndexOr(dict, priceIndexDefaults[0]);
    cepci_     = priceIndexOr(dict, priceIndexDefaults[1]);
    cepci2001_ = priceIndexOr(dict, priceIndexDefaults[2]);
    usdToEur_  = priceIndexOr(dict, priceIndexDefaults[3]);
}

//  ONE SET OF MEMBERS, TWO READERS.  `cost()` writes these same four values
//  into every `CostBreakdown::factors`, so the header line the pass draws and
//  the per-unit provenance line under it are two printings of one fact and
//  cannot drift apart.
std::map<std::string, scalar> Turton::pricingFactors() const
{
    return { { "year",      year_      },
             { "cepci",     cepci_     },
             { "cepci2001", cepci2001_ },
             { "usdToEur",  usdToEur_  } };
}

CostBreakdown Turton::cost(const EquipmentSizing& dim, const Material& mat) const
{
    //  A CATALYST CHARGE IS PRICED FROM A DECLARED UNIT PRICE, AND THE LINE
    //  SAYS SO (2026-09-26).  This is the SECOND cost shape in this file and
    //  it is deliberately not a ninth coefficient set: a catalyst is bought
    //  by the kilogram at a vendor's price in TODAY's money, so
    //
    //      C_p = catalystPrice x m_catalyst        [case currency, no index]
    //      C_BM = C_TM = C_p                         (F_BM = 1, no contingency)
    //
    //  -- no CEPCI rebasing (the price is not a 2001-USD correlation), no
    //  currency conversion (it is declared in the currency the run totals
    //  in), no bare-module or total-module factor (those install a fabricated
    //  item; a charge is loaded into a vessel that carries its own).  Every
    //  one of those "no"s is a fact a reader must be able to see on the
    //  printed line, so `correlation` carries its own word and the pass
    //  prints the price where the other shapes print K1..K3.
    //
    //  ABSENT THE PRICE OR THE MASS, THIS REFUSES BY NAME, and the costing
    //  pass's INCOMPLETE mechanism -- the one home, the tray precedent --
    //  names the item under the total.  A default price would be a number
    //  with no source, costed into a capital total as though somebody had
    //  chosen it.
    if (dim.equipmentType == "catalystCharge")
    {
        auto pit = dim.costInputs.find("catalystPrice");
        auto mit = dim.values.find("m_catalyst_kg");
        if (mit == dim.values.end())
            throw std::runtime_error("Turton: the CATALYST CHARGE of '"
                + dim.unitName + "' has no mass to price: the sizer derived"
                  " none (its basis reads \"" + dim.basis + "\").\n  Declare"
                  " `catalystBulkDensity <kg/m3>;` in this unit's designRules"
                  " so m_catalyst = V_R x rho_bulk exists.  Until then the"
                  " total below is INCOMPLETE by exactly this charge.");
        if (pit == dim.costInputs.end())
            throw std::runtime_error("Turton: the CATALYST CHARGE of '"
                + dim.unitName + "' is not costed: no `catalystPrice` is"
                  " declared in this unit's designRules, and Choupo carries no"
                  " catalyst price and will not invent one.\n  Declare"
                  " `catalystPrice <" + std::string("EUR") + " per kg>;` -- a"
                  " vendor quotation or a stated assumption, in the currency"
                  " this run totals in, today's money (no index is applied)."
                  "\n  Until then this bed's capital cost is its shell alone,"
                  " and the `TOTALS (EUR) -- INCOMPLETE` line above says so.");
        const scalar price = pit->second;
        const scalar m_kg  = mit->second;
        if (!(price >= 0.0) || !(m_kg > 0.0))
            throw std::runtime_error("Turton: the CATALYST CHARGE of '"
                + dim.unitName + "' has a negative price or a non-positive"
                  " mass -- nothing is priced from that");
        const scalar Cp = price * m_kg;

        CostBreakdown out;
        out.unitName        = dim.unitName;
        out.purchasedCost   = Cp;
        out.bareModuleCost  = Cp;
        out.totalModuleCost = Cp;
        //  THE FACTORS THAT ARE NOT APPLIED, STATED AS ONES.  A reader of
        //  the row sees `F_M 1.00  F_P 1.00` beside a shell at 3.05 / 36 and
        //  the provenance line names the reason; a blank would read as a
        //  factor the pass forgot.
        out.factors["F_M"]            = 1.0;
        out.factors["F_P"]            = 1.0;
        out.factors["B1"]             = 1.0;
        out.factors["B2"]             = 0.0;
        out.factors["C_TM_over_C_BM"] = 1.0;
        out.factors["S"]              = m_kg;
        out.factors["catalystPrice"]  = price;      // the DECLARED input, republished
        //  The four index constants ride along UNAPPLIED so that the header
        //  and `costs.csv` still carry the run's index beside every row --
        //  the reader is told the index and told, by the shape word, that
        //  this row did not use it.
        out.factors["cepci"]    = cepci_;
        out.factors["cepci2001"]= cepci2001_;
        out.factors["usdToEur"] = usdToEur_;
        out.factors["year"]     = year_;
        out.sizeKey     = "m_catalyst_kg";
        out.correlation = "declared-unit-price";
        out.material    = "none: catalyst priced per kg";
        out.currency    = "EUR";
        return out;
    }

    //  THE TRAY STACK, ON ITS OWN SHAPE (2026-10-05, DEV.md 4c C38 item 1).
    //  The set, its source and what was not read are at `sieveTrayCoeffs`.
    //  Absent a declared tray material class this REFUSES BY NAME, and the
    //  costing pass's INCOMPLETE mechanism names the item under the total --
    //  the same home the catalyst charge uses; there is no default class,
    //  because F_BM moves the stack's cost by a factor of up to 5.6.
    if (dim.equipmentType == "sieveTrays")
    {
        auto need = [&](const char* k) -> scalar {
            auto it = dim.values.find(k);
            if (it == dim.values.end())
                throw std::runtime_error("Turton: the TRAY STACK of '"
                    + dim.unitName + "' has no '" + k + "' in its sizing"
                      " record -- nothing to price it from");
            return it->second;
        };
        const scalar A = need("A");
        const scalar N = need("nTrays");
        if (!(A > 0.0) || !(N >= 1.0))
            throw std::runtime_error("Turton: the TRAY STACK of '"
                + dim.unitName + "' has a non-positive tray area or fewer"
                  " than one tray -- nothing is priced from that");

        std::vector<std::string> accepted;
        for (const auto& f : sieveTrayFBM) accepted.push_back(f.word);
        auto wit = dim.costWords.find("trayMaterial");
        if (wit == dim.costWords.end())
        {
            std::string list;
            for (const auto& w : accepted) list += (list.empty() ? "" : " | ") + w;
            throw std::runtime_error("Turton: the TRAY STACK of '"
                + dim.unitName + "' is not costed: its material class is not"
                  " declared.\n  Declare `trayMaterial <" + list + ">;` in"
                  " this column's designRules.  Turton prices a tray's"
                  " material through its bare-module factor F_BM (1.00 /"
                  " 1.83 / 5.58 for sieve trays), not through the shell's"
                  " F_M, and trays are often\n  a different material from"
                  " the shell -- so the class is the author's to state and"
                  " is never read off the\n  construction material's name."
                  "  Until then the total below is INCOMPLETE by exactly the"
                  " trays.");
        }
        const std::string& word = wit->second;
        scalar F_BM = -1.0;
        for (const auto& f : sieveTrayFBM)
            if (word == f.word) F_BM = f.F_BM;
        if (F_BM < 0.0)
            throw std::runtime_error("Turton: the TRAY STACK of '"
                + dim.unitName + "': "
                + registryRefusal::message("tray material class", word,
                                           accepted, "Accepted"));

        const auto& t = sieveTrayCoeffs;
        if (A < t.Amin || A > t.Amax)
        {
            std::ostringstream v;
            v << std::defaultfloat << std::setprecision(4)
              << "  [validity] WARNING: sieveTrays '" << dim.unitName
              << "': tray area A = " << A << " m2 is OUTSIDE the correlation"
                 " range [" << t.Amin << ", " << t.Amax << "] -- cost"
                 " EXTRAPOLATED, treat with caution.\n";
            std::cout << v.str();
        }

        const scalar lA       = std::log10(A);
        const scalar Cp0_2001 = std::pow(10.0, t.K1 + t.K2 * lA + t.K3 * lA * lA);
        const scalar Cp_2001  = N * Cp0_2001;
        const scalar Cp       = Cp_2001 * (cepci_ / cepci2001_) * usdToEur_;
        const scalar F_q      = trayQuantityFactor(N);
        const scalar C_BM     = Cp * F_BM * F_q;
        const scalar C_TM     = 1.18 * C_BM;

        CostBreakdown out;
        out.unitName        = dim.unitName;
        out.purchasedCost   = Cp;
        out.bareModuleCost  = C_BM;
        out.totalModuleCost = C_TM;
        //  F_M and F_P are NOT applied, and are published as ones so the
        //  shared table's columns read true rather than blank.
        out.factors["F_M"]            = 1.0;
        out.factors["F_P"]            = 1.0;
        out.factors["F_BM"]           = F_BM;
        out.factors["F_q"]            = F_q;
        out.factors["N"]              = N;
        out.factors["K1"]             = t.K1;
        out.factors["K2"]             = t.K2;
        out.factors["K3"]             = t.K3;
        out.factors["S"]              = A;
        out.factors["Cp_2001"]        = Cp_2001;
        out.factors["C_TM_over_C_BM"] = 1.18;
        out.factors["cepci"]          = cepci_;
        out.factors["cepci2001"]      = cepci2001_;
        out.factors["usdToEur"]       = usdToEur_;
        out.factors["year"]           = year_;
        out.sizeKey     = "A";
        out.correlation = "tray-stack";
        out.material    = word;
        out.currency    = "EUR";
        return out;
    }

    const auto& c = coeffsFor(dim.equipmentType);

    auto getS = [&]() -> scalar {
        auto it = dim.values.find(c.sizeKey);
        if (it == dim.values.end())
            throw std::runtime_error("Turton: dimension '" + c.sizeKey
                + "' missing for " + dim.equipmentType);
        return it->second;
    };
    const scalar S = getS();
    if (S < c.Smin || S > c.Smax)
    {
        // Numerical honesty: extrapolate (do NOT clamp -- that would hide the
        // out-of-range condition), but say so out loud so the student sees the
        // correlation is being used past its fitted range.
        //  PRINT WHAT WAS COMPARED.  This line inherited the ambient stream
        //  precision and on process02_with_design read "size V_R = 0 is
        //  OUTSIDE the correlation range [0, 520]" -- for V_R = 0.005 m^3
        //  against Smin = 0.3.  The verdict was right and the sentence was
        //  false: a reader cannot see why 0 is outside [0, 520].  A validity
        //  line too coarse to reproduce is worse than none (the costing
        //  table paid for the same lesson on B1/B2 on 2026-08-27).  Found
        //  2026-09-02 writing the case's README.
        {
            std::ostringstream v;
            v << std::defaultfloat << std::setprecision(4)
              << "  [validity] WARNING: " << dim.equipmentType << " '"
              << dim.unitName << "': size " << c.sizeKey << " = " << S
              << " is OUTSIDE the correlation range [" << c.Smin << ", "
              << c.Smax << "] -- cost EXTRAPOLATED, treat with caution.\n";
            std::cout << v.str();
        }
    }

    //  A REFRIGERATED STORE PRICED AS AN ATMOSPHERIC TANK SAYS SO ON ITS OWN
    //  COSTING LINE (C44): the sizing pass announced it once per store; the
    //  costing table is where a reader looks at the money, so the floor is
    //  named there too, per tank.
    if (dim.equipmentType == "storageTank")
    {
        auto sw = dim.costWords.find("service");
        if (sw != dim.costWords.end() && sw->second == "refrigerated")
            std::cout << "  [lower bound] storageTank '" << dim.itemId()
                      << "': priced as an ATMOSPHERIC API fixed-roof tank"
                         " (CAPCOST 2017, the only tank row read); a"
                         " REFRIGERATED double-containment tank costs more,"
                         " so this cost is a FLOOR.\n";
    }

    // Purchased cost in 2001 USD -- Turton log-quadratic OR single-anchor
    // power law, whichever this equipment's correlation declares.
    const scalar Cp_2001_USD = c.powerLaw
        ? c.Cp_ref * std::pow(S / c.S_ref, c.n_exp)
        : std::pow(10.0, log10Cp(c, S));

    // Update to target year + currency
    const scalar Cp_target = Cp_2001_USD
                           * (cepci_ / cepci2001_)
                           * usdToEur_;

    // Pressure factor (gauge): P_gauge = P_design - 1 bar atmosphere
    const scalar P_des_bar  = dim.values.count("pressureDesign")
        ? dim.values.at("pressureDesign") : 1.0;
    const scalar P_gauge    = std::max(P_des_bar - 1.0, 0.0);
    scalar F_P = 1.0;
    if (dim.equipmentType == "stirredTank" || dim.equipmentType == "vessel")
    {
        // ASME thin-wall formula; needs D and sigma_y.  A vessel under
        // gauge pressure with NO declared allowable stress, or one whose
        // stress cannot contain the pressure, is not priceable at the
        // cheapest factor -- it is not priceable at all (I5).
        if (P_gauge > 0.0 && mat.sigma_y <= 0.0)
            throw std::runtime_error("Turton costing, unit '" + dim.unitName
                + "': material '" + mat.name + "' declares no allowable"
                " stress (sigma_y) and this is a pressure vessel at "
                + std::to_string(P_des_bar) + " bar design -- the pressure"
                " factor cannot be priced.  Add `sigma_y <MPa>;` to the"
                " material record (see data/standards/assets/SS304.dat).");
        if (P_gauge > 0.0 && 2.0 * (mat.sigma_y * 10.0 - 0.6 * P_gauge) <= 0.0)
            throw std::runtime_error("Turton costing, unit '" + dim.unitName
                + "': material '" + mat.name + "' (sigma_y "
                + std::to_string(mat.sigma_y) + " MPa) cannot contain a "
                + std::to_string(P_des_bar) + " bar design pressure -- the"
                " ASME thin-wall denominator is non-positive, so no wall"
                " thickness exists.  Pick a stronger material or lower"
                " pressureDesign.");
        const scalar D_m   = dim.values.count("D") ? dim.values.at("D") : 0.0;
        if (P_gauge > 0.0 && D_m <= 0.0)
            AdvisoryLog::instance().add("costing", "warning",
                "Turton " + dim.unitName,
                "pressure vessel with no diameter in its sizing record: the"
                " pressure factor is priced at its LOWER BOUND (F_P = 1.0),"
                " so the bare-module cost is a floor, not an estimate.");
        F_P = pressureFactor_vessel(D_m, P_gauge, mat.sigma_y);
    }
    else
    {
        F_P = pressureFactor_poly(c, P_gauge);
    }

    const scalar F_M        = (mat.F_M > 0.0) ? mat.F_M : 1.0;

    const scalar C_BM       = Cp_target * (c.B1 + c.B2 * F_M * F_P);
    const scalar C_TM       = 1.18 * C_BM;

    CostBreakdown out;
    out.unitName        = dim.unitName;
    out.purchasedCost   = Cp_target;
    out.bareModuleCost  = C_BM;
    out.totalModuleCost = C_TM;
    out.factors["F_M"]      = F_M;
    out.factors["F_P"]      = F_P;
    out.factors["B1"]       = c.B1;
    out.factors["B2"]       = c.B2;
    out.factors["Cp_2001"]  = Cp_2001_USD;
    out.factors["cepci"]    = cepci_;
    out.factors["cepci2001"]= cepci2001_;
    out.factors["usdToEur"] = usdToEur_;
    out.factors["year"]     = year_;

    //  The size this cost was computed FROM, and the coefficients that turned
    //  it into money.  Published because a total nobody can reconstruct is a
    //  total nobody can defend: with these, `C_p = 10^(K1 + K2 log10 S + K3
    //  (log10 S)^2) x CEPCI/CEPCI_2001 x EUR/USD` is arithmetic a reader can
    //  redo, and without them it is an assertion.
    out.factors["S"]        = S;
    out.factors["C_TM_over_C_BM"] = 1.18;
    if (c.powerLaw)
    {
        out.factors["Cp_ref"] = c.Cp_ref;
        out.factors["S_ref"]  = c.S_ref;
        out.factors["n_exp"]  = c.n_exp;
    }
    else
    {
        out.factors["K1"] = c.K1;
        out.factors["K2"] = c.K2;
        out.factors["K3"] = c.K3;
    }
    out.sizeKey     = c.sizeKey;
    out.correlation = c.powerLaw ? "power-law" : "log-quadratic";
    out.material    = mat.name;
    out.currency = "EUR";
    return out;
}

} // namespace Choupo
