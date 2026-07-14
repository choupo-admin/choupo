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
    SPDX-License-Identifier: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

#include "TSATwinBed.H"

#include "thermo/adsorbent/Adsorbent.H"
#include "thermo/adsorbent/AdsorbentRegistry.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

int TSATwinBed::solve(const DictPtr& dict,
                      const ThermoPackage& thermo,
                      int verbosity)
{
    const std::size_t nComp = thermo.n();
    auto feed = dict->subDict("feed");
    const scalar F = feed->lookupScalar("F", Dims::molarFlow);       // kmol/s
    const scalar P = feed->lookupScalar("P", Dims::pressure);        // Pa
    if (F <= 0.0 || P <= 0.0)
        throw std::runtime_error("tsaTwinBed: feed F and P must be positive");

    sVector z(nComp, 0.0);
    scalar zSum = 0.0;
    auto composition = dict->subDict("composition");
    for (const auto& key : composition->keys())
    {
        const std::size_t i = thermo.indexOf(key);
        z[i] = composition->lookupScalar(key);
        zSum += z[i];
    }
    if (std::abs(zSum - 1.0) > 1.0e-6)
        throw std::runtime_error("tsaTwinBed: feed composition must sum to 1"
            " (Sigma z = " + std::to_string(zSum) + ")");

    auto op = dict->subDict("operation");
    for (const auto& key : op->keys())
    {
        if (key != "adsorbent" && key != "mAdsPerColumn" && key != "tCycle"
         && key != "T_ads" && key != "T_regen" && key != "lightKey"
         && key != "purgeRatio")
            throw std::runtime_error("tsaTwinBed operation{}: unknown key '"
                + key + "'. Grammar: adsorbent; mAdsPerColumn; tCycle; T_ads;"
                  " T_regen; lightKey; purgeRatio.");
    }

    const std::string adsName = op->lookupWord("adsorbent");
    const scalar mAds = op->lookupScalar("mAdsPerColumn", Dims::mass);
    const scalar tCycle = op->lookupScalar("tCycle", Dims::time);
    const scalar Tads = op->lookupScalar("T_ads", Dims::temperature);
    const scalar Tregen = op->lookupScalar("T_regen", Dims::temperature);
    const std::string lightKey = op->lookupWord("lightKey");
    const scalar purgeRatio = op->lookupScalar("purgeRatio");
    const std::size_t iLight = thermo.indexOf(lightKey);

    if (mAds <= 0.0 || tCycle <= 0.0)
        throw std::runtime_error("tsaTwinBed: mAdsPerColumn and tCycle must be positive");
    if (Tads <= 0.0 || Tregen <= Tads)
        throw std::runtime_error("tsaTwinBed: require T_regen > T_ads > 0;"
            " temperature is the regeneration driving force");
    if (purgeRatio < 0.0 || purgeRatio >= 1.0)
        throw std::runtime_error("tsaTwinBed: purgeRatio must be in [0,1)");

    const Adsorbent& ads = AdsorbentRegistry::byName(adsName);
    if (ads.cpSolid() <= 0.0)
        throw std::runtime_error("tsaTwinBed: adsorbent '" + adsName
            + "' has no positive cpSolid in its intrinsic identity; curate"
              " cpSolid [J/(kg.K)] with provenance before pricing regeneration");

    std::map<std::string, scalar> partialP;
    for (std::size_t i = 0; i < nComp; ++i)
        partialP[thermo.comp(i).name()] = z[i] * P;

    sVector qAds(nComp, 0.0), qRegen(nComp, 0.0), dQ(nComp, 0.0);
    sVector captured(nComp, 0.0), productRaw(nComp, 0.0);
    scalar adsorptionHeatJ = 0.0;

    for (std::size_t i = 0; i < nComp; ++i)
    {
        const std::string name = thermo.comp(i).name();
        qAds[i] = ads.loading(name, partialP, Tads);
        qRegen[i] = ads.loading(name, partialP, Tregen);
        dQ[i] = qAds[i] - qRegen[i];

        if (i == iLight || !ads.has(name))
        {
            productRaw[i] = z[i] * F;
            continue;
        }
        if (dQ[i] <= 0.0)
            throw std::runtime_error("tsaTwinBed: adsorbate '" + name
                + "' has non-positive thermal working capacity q(T_ads)-q(T_regen);"
                  " inspect dH_ads and the declared temperatures");

        const scalar loadMol = z[i] * F * 1000.0 * tCycle;
        const scalar capacityMol = mAds * dQ[i];
        if (loadMol > capacityMol * (1.0 + 1.0e-10))
        {
            throw std::runtime_error("tsaTwinBed: column capacity exceeded for '"
                + name + "': feed loads " + std::to_string(loadMol)
                + " mol during tCycle but mAdsPerColumn*[q(T_ads)-q(T_regen)] = "
                + std::to_string(capacityMol) + " mol. Increase mAdsPerColumn,"
                  " shorten tCycle, or change the regeneration conditions;"
                  " breakthrough is never hidden by a clamp.");
        }

        captured[i] = z[i] * F;
        const IsothermModel* iso = ads.isotherm(name);
        adsorptionHeatJ += loadMol * (-iso->dHAds());
    }

    scalar rawProductTotal = 0.0;
    for (scalar v : productRaw) rawProductTotal += v;
    if (rawProductTotal <= 0.0)
        throw std::runtime_error("tsaTwinBed: every feed component is captured;"
            " no product remains to provide purge gas");

    sVector product(nComp, 0.0), regen(nComp, 0.0);
    for (std::size_t i = 0; i < nComp; ++i)
    {
        product[i] = (1.0 - purgeRatio) * productRaw[i];
        regen[i] = captured[i] + purgeRatio * productRaw[i];
    }

    scalar Fproduct = 0.0, Fregen = 0.0;
    for (std::size_t i = 0; i < nComp; ++i)
    {
        Fproduct += product[i];
        Fregen += regen[i];
    }

    out_.clear();
    ProcessStream clean;
    clean.name = "product";
    clean.F = Fproduct; clean.T = Tads; clean.P = P; clean.vf = 1.0;
    clean.z.assign(nComp, 0.0);
    for (std::size_t i = 0; i < nComp; ++i) clean.z[i] = product[i] / Fproduct;
    out_.push_back(clean);

    ProcessStream offgas;
    offgas.name = "regenerationGas";
    offgas.F = Fregen; offgas.T = Tads; offgas.P = P; offgas.vf = 1.0;
    offgas.z.assign(nComp, 0.0);
    for (std::size_t i = 0; i < nComp; ++i) offgas.z[i] = regen[i] / Fregen;
    out_.push_back(offgas);

    const scalar sensibleJ = mAds * ads.cpSolid() * (Tregen - Tads);
    const scalar QregenKW = (sensibleJ + adsorptionHeatJ) / tCycle / 1000.0;

    kpis_.clear();
    kpis_["Q_regeneration_kW"] = QregenKW;
    kpis_["Q_adsorption_cooling_kW"] = -QregenKW;
    kpis_["Q_sensible_per_cycle_kJ"] = sensibleJ / 1000.0;
    kpis_["Q_desorption_per_cycle_kJ"] = adsorptionHeatJ / 1000.0;
    kpis_["purgeRatio"] = purgeRatio;
    kpis_["tCycle_s"] = tCycle;
    kpis_["mAdsPerColumn_kg"] = mAds;
    const scalar lightFeed = z[iLight] * F;
    kpis_["recovery_" + lightKey] = lightFeed > 0.0
        ? product[iLight] / lightFeed : 0.0;
    kpis_["purity_" + lightKey] = Fproduct > 0.0
        ? product[iLight] / Fproduct : 0.0;
    for (std::size_t i = 0; i < nComp; ++i)
    {
        const std::string name = thermo.comp(i).name();
        kpis_["q_ads_" + name] = qAds[i];
        kpis_["q_regen_" + name] = qRegen[i];
        kpis_["Dq_" + name] = dQ[i];
        if (i != iLight && captured[i] > 0.0)
            kpis_["capacity_utilisation_" + name] =
                captured[i] * 1000.0 * tCycle / (mAds * dQ[i]);
    }

    profile_ = UnitProfile{};
    profile_->xAxis = "componentIndex";
    sVector index(nComp), feedFrac = z, qA = qAds, qR = qRegen, dq = dQ;
    for (std::size_t i = 0; i < nComp; ++i) index[i] = static_cast<scalar>(i);
    profile_->columns["componentIndex"] = std::move(index);
    profile_->columns["y_feed"] = std::move(feedFrac);
    profile_->columns["q_ads_molkg"] = std::move(qA);
    profile_->columns["q_regen_molkg"] = std::move(qR);
    profile_->columns["Dq_molkg"] = std::move(dq);

    if (verbosity >= 2)
    {
        std::cout << "\n==================== Temperature-swing twin bed ====================\n"
                  << "  Interpretation: two columns alternate; tCycle is the"
                     " time between switches, so one bed regenerates per tCycle.\n"
                  << "  Adsorbent: " << ads.name() << "  m/column = " << mAds
                  << " kg  cpSolid = " << ads.cpSolid() << " J/(kg.K)\n"
                  << "  Swing: " << Tads << " -> " << Tregen << " K at "
                  << P << " Pa; equilibrium shortcut uses the SAME feed partial"
                     " pressures at both temperatures.\n"
                  << "  Duty in:  " << QregenKW << " kW regeneration\n"
                  << "  Duty out: " << -QregenKW << " kW adsorption/cooldown\n"
                  << "  These are gross cyclic duties; their signed sum is zero"
                     " for the cyclic solid inventory, not free heat.\n"
                  << "  Product: " << Fproduct << " kmol/s; regeneration gas: "
                  << Fregen << " kmol/s; purge = " << purgeRatio << " of raw product\n"
                  << "  This is a cycle-AVERAGED equilibrium sizing model. It"
                     " does not resolve ramps, LDF fronts, Ergun pressure drop"
                     " or CSS; those belong to A4-A6.\n"
                  << "=================================================================\n\n";
    }

    return 0;
}

} // namespace Choupo
