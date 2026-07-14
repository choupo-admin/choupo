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

#include "Guthrie.H"

#include <cmath>
#include <iostream>
#include <stdexcept>

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
    throw std::runtime_error("Guthrie: no cost correlation for equipment '"
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
    if (P_gauge_bar <= 0.0) return 1.0;
    const scalar sigma_bar = sigma_MPa * 10.0;     // MPa → bar
    const scalar denom = 2.0 * (sigma_bar - 0.6 * P_gauge_bar);
    if (denom <= 0.0) return 1.0;
    const scalar t_w = (D_m * P_gauge_bar) / denom;
    return std::max((t_w + 0.00315) / 0.0063, 1.0);
}

} // anonymous namespace

Guthrie::Guthrie(const DictPtr& dict)
{
    year_      = dict->lookupScalarOrDefault("year",      2026.0);
    cepci_     = dict->lookupScalarOrDefault("cepci",     820.0);
    cepci2001_ = dict->lookupScalarOrDefault("cepci2001", 397.0);
    usdToEur_  = dict->lookupScalarOrDefault("usdToEur",  0.92);
}

CostBreakdown Guthrie::cost(const EquipmentSizing& dim, const Material& mat) const
{
    const auto& c = coeffsFor(dim.equipmentType);

    auto getS = [&]() -> scalar {
        auto it = dim.values.find(c.sizeKey);
        if (it == dim.values.end())
            throw std::runtime_error("Guthrie: dimension '" + c.sizeKey
                + "' missing for " + dim.equipmentType);
        return it->second;
    };
    const scalar S = getS();
    if (S < c.Smin || S > c.Smax)
    {
        // Numerical honesty: extrapolate (do NOT clamp -- that would hide the
        // out-of-range condition), but say so out loud so the student sees the
        // correlation is being used past its fitted range.
        std::cout << "  [validity] WARNING: " << dim.equipmentType << " '"
                  << dim.unitName << "': size " << c.sizeKey << " = " << S
                  << " is OUTSIDE the correlation range [" << c.Smin << ", "
                  << c.Smax << "] -- cost EXTRAPOLATED, treat with caution.\n";
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
        // Use ASME thin-wall formula; needs D and σ_y of the material.
        const scalar D_m   = dim.values.count("D") ? dim.values.at("D") : 0.0;
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
    out.factors["usdToEur"] = usdToEur_;
    out.factors["year"]     = year_;
    out.currency = "EUR";
    return out;
}

} // namespace Choupo
