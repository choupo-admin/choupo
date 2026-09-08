/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
-------------------------------------------------------------------------------
File
    src/unitOperations/storage/StorageTank.cpp
\*---------------------------------------------------------------------------*/

#include "StorageTank.H"
#include "core/Advisory.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace Choupo {

//  THE WORKING VOLUME OF A TANK IS NOT ITS GEOMETRIC VOLUME.  0.80 is the
//  ordinary allowance for ullage and the low-level heel; it is a DESIGN
//  CONVENTION, not a measurement, so it is announced wherever it is used.
static constexpr scalar kDefaultFillFraction = 0.80;

//  WHICH TANK.  The augmented dict a unit is handed STRIPS the `name` entry
//  and carries the unit's name as the DICTIONARY'S OWN name -- reading
//  lookupWordOrDefault("name") gets the fallback every time, which on a plant
//  with a raw-material tank and a product tank files two advisories that read
//  identically.  ShortcutColumn.cpp paid for this once and wrote it down; this
//  is the second site, and the note there is why it took minutes rather than
//  an afternoon.
static std::string tankLocus(const DictPtr& dict)
{
    return "storageTank '"
         + (dict->name().empty() ? std::string("?") : dict->name()) + "'";
}

int StorageTank::solve(const DictPtr& dict,
                       const ThermoPackage& thermo,
                       int verbosity)
{
    auto feedDict = dict->subDict("feed");
    auto operDict = dict->subDict("operation");
    auto compDict = dict->subDict("composition");

    const scalar F  = feedDict->lookupScalar("F",     Dims::molarFlow);    // kmol/s
    const scalar T  = feedDict->lookupScalar("Tfeed", Dims::temperature);
    const scalar P  = feedDict->lookupScalar("Pfeed", Dims::pressure);
    //  THE FEED'S OWN VAPOUR FRACTION, read rather than assumed: the key is
    //  `vf`, as every other unit reads it.  The first version looked for
    //  `vaporFraction`, found nothing, defaulted to 0, and asked the package
    //  for the LIQUID density of a 25-bar syngas at 300 K -- which correctly
    //  refused, on a stream that is entirely vapour.
    const scalar vf = feedDict->lookupScalarOrDefault("vf", 0.0);

    //  DECLARED, NEVER DEFAULTED.  A holdup nobody declared is not a holdup,
    //  and inventing one puts working capital on a student's balance sheet
    //  that no engineer chose.
    if (!operDict->found("residenceTime"))
        throw std::runtime_error(
            "storageTank: `operation { residenceTime <t>; }` is REQUIRED and"
            " has no default.  The holdup this unit reports IS the residence"
            " time times the throughput, so a tank with no declared residence"
            " time has no inventory to report -- and a default would invent"
            " working capital nobody chose.  Declare the time the design"
            " basis calls for (e.g. `residenceTime 48 h;` for a product tank"
            " sized to two days of production).");
    const scalar tau = operDict->lookupScalar("residenceTime", Dims::time);
    if (!(tau > 0.0))
        throw std::runtime_error(
            "storageTank: `residenceTime` must be > 0 (got "
            + std::to_string(tau) + " s).");

    const bool  fillDeclared = operDict->found("fillFraction");
    const scalar fill = fillDeclared ? operDict->lookupScalar("fillFraction")
                                     : kDefaultFillFraction;
    if (!(fill > 0.0 && fill <= 1.0))
        throw std::runtime_error(
            "storageTank: `fillFraction` must be in (0, 1] (got "
            + std::to_string(fill) + ").");

    const std::size_t n = thermo.n();
    sVector z(n, 0.0);
    scalar zsum = 0.0;
    for (const auto& key : compDict->keys())
    {
        z[thermo.indexOf(key)] = compDict->lookupScalar(key);
        zsum += z[thermo.indexOf(key)];
    }
    if (zsum > 0.0) for (auto& v : z) v /= zsum;

    //  A BUFFER HOLDING A BOILING MIXTURE IS A DIFFERENT UNIT.  It has a
    //  level, a vapour space and a duty, and this models none of them --
    //  refused by name rather than silently priced on one phase.
    if (vf > 1.0e-9 && vf < 1.0 - 1.0e-9)
        throw std::runtime_error(
            "storageTank: the inlet is TWO-PHASE (vapour fraction "
            + std::to_string(vf) + ").  A buffer holding a boiling mixture has"
              " a liquid level, a vapour space and a heat duty, and this unit"
              " models none of them: its holdup would be the mass of ONE phase"
              " reported as the mass of both.  Put the tank where the stream is"
              " single-phase, or model the drum explicitly.");

    const bool isVapour = (vf >= 1.0 - 1.0e-9);
    const DensityPhase ph = isVapour ? DensityPhase::Vapour
                                     : DensityPhase::Liquid;

    //  ---- ASK THE PACKAGE ABOUT A COMPOSITION IT CAN PRICE ---------------
    //
    //  A liquid ammonia product tank at 250 K carries ~1.4 mol % of dissolved
    //  H2, N2 and Ar.  Those are supercritical there: they have no liquid
    //  molar volume, and the mole-weighted Rackett the package uses returned
    //  NaN for the whole mixture because of them -- 98.6 % ammonia priced as
    //  nothing.
    //
    //  This unit does NOT compute a density of its own (that would be a
    //  second home for a rule `ThermoPackage::density` owns).  It chooses the
    //  QUESTION: the same call, over the components the package can actually
    //  price, renormalised -- and it ANNOUNCES which components it left out
    //  and how much of the stream they are, so the reader judges the
    //  approximation instead of being handed it.  A large excluded fraction
    //  is a finding this unit reports, not one it decides about.
    sVector zPriced(n, 0.0);
    scalar  keptFrac = 0.0;
    std::string dropped;
    scalar      droppedFrac = 0.0;
    for (std::size_t i = 0; i < n && i < z.size(); ++i)
    {
        if (!(z[i] > 0.0)) continue;
        sVector pure(n, 0.0); pure[i] = 1.0;
        scalar rhoPure = 0.0;
        try { rhoPure = thermo.density(T, P, pure, ph); }
        catch (const std::exception&) { rhoPure = 0.0; }
        if (rhoPure > 0.0 && std::isfinite(rhoPure))
        { zPriced[i] = z[i]; keptFrac += z[i]; }
        else
        {
            droppedFrac += z[i];
            if (!dropped.empty()) dropped += ", ";
            dropped += thermo.comp(i).name();
        }
    }
    if (!(keptFrac > 0.0))
        throw std::runtime_error(
            "storageTank: NO component present has a "
            + std::string(isVapour ? "vapour" : "liquid")
            + " density at T = " + std::to_string(T) + " K, P = "
            + std::to_string(P * 1.0e-5) + " bar, so the holdup MASS cannot be"
              " computed -- and a tank whose inventory is unknown is exactly"
              " the number this unit exists to supply.");
    for (auto& v : zPriced) v /= keptFrac;

    if (!dropped.empty())
    {
        //  NO ITERATE IN AN ADVISORY.  The excluded fraction moves with every
        //  Newton pass of a recycle loop, so embedding it filed a NEW advisory
        //  per pass -- three lines for one tank, differing only in digits the
        //  reader cannot rank.  The advisory states the RULE and names the
        //  components; the converged magnitude is the KPI
        //  `densityPricedFraction` and the console line below.
        std::ostringstream m;
        m << "the " << (isVapour ? "vapour" : "liquid") << " density is taken"
             " over the components the package can price, renormalised: "
          << dropped << " ha"
          << (dropped.find(',') != std::string::npos ? "ve" : "s")
          << " no " << (isVapour ? "vapour" : "liquid") << " density there"
             " -- dissolved supercritical gases have no liquid molar volume."
             "  The HOLDUP MASS still counts every component (it is the volume"
             " times this density), so what the approximation touches is the"
             " density, not the inventory's composition.  The excluded share"
             " of this stream is the KPI `densityPricedFraction`";
        if (AdvisoryLog::instance().add("approximation", "warning",
                                        tankLocus(dict), m.str())
            && verbosity >= 1)
            std::cerr << "  [tank] " << m.str() << ".\n";
    }

    scalar rho = 0.0;                                   // kg/m^3
    try
    {
        rho = thermo.density(T, P, zPriced, ph);
    }
    catch (const std::exception& ex)
    {
        throw std::runtime_error(
            std::string("storageTank: the package cannot give a ")
            + (isVapour ? "VAPOUR" : "LIQUID") + " density at T = "
            + std::to_string(T) + " K, P = " + std::to_string(P * 1.0e-5)
            + " bar, so the holdup MASS cannot be computed -- and a tank whose"
              " inventory is unknown is exactly the number this unit exists to"
              " supply.  " + ex.what());
    }
    if (!(rho > 0.0) || !std::isfinite(rho))
        throw std::runtime_error(
            "storageTank: the package returned a non-physical density ("
            + std::to_string(rho) + " kg/m^3).");

    //  Mass throughput [kg/s] from the component molar masses -- the same
    //  arithmetic every mass report uses.
    scalar MWavg = 0.0;                                 // kg/kmol
    for (std::size_t i = 0; i < n && i < z.size(); ++i)
        MWavg += z[i] * thermo.comp(i).MW();
    const scalar mdot = F * MWavg;                      // kmol/s * kg/kmol
    const scalar Qvol = (rho > 0.0) ? mdot / rho : 0.0; // m^3/s

    const scalar V_holdup = Qvol * tau;                 // m^3
    const scalar m_holdup = V_holdup * rho;             // kg
    const scalar V_vessel = V_holdup / fill;            // m^3

    if (!fillDeclared)
    {
        //  THE LOCUS NAMES THE TANK, and the message states the RULE rather
        //  than the iterate.  Both halves were wrong on first contact and
        //  both are the same defect seen from two sides: the first version
        //  read `name` off the FEED sub-dict, which has none, so a plant with
        //  a raw-material tank and a product tank filed two advisories that
        //  read identically ("storageTank on 'feed'"); and it embedded the
        //  converging volumes, so a recycle loop filed a NEW advisory on
        //  every Newton pass -- four lines for two tanks, differing only in
        //  digits the reader has no way to rank.  An advisory says which
        //  state it is about (2026-08-24); the numbers are the KPIs' job
        //  (`vesselVolume_m3`, `holdupVolume_m3`, `holdupMass_kg`), and the
        //  console line below still prints the converged ones per pass.
        std::ostringstream m;
        m << "no `fillFraction` declared -- the VESSEL volume uses the "
          << kDefaultFillFraction << " working-volume convention (ullage plus"
             " the low-level heel), so V_vessel = V_holdup / "
          << kDefaultFillFraction << ".  The HOLDUP itself is unaffected: it"
             " is the throughput times the residence time, and this default"
             " touches only the vessel that has to contain it";
        if (AdvisoryLog::instance().add("default", "info",
                                        tankLocus(dict), m.str())
            && verbosity >= 2)
            std::cout << "  [tank] " << m.str() << ".\n";
    }

    // ---- Outlet: the inlet, unchanged.  Mass and energy close exactly. ----
    produced_.clear();
    ProcessStream o;
    o.name = "out";
    o.F = F; o.T = T; o.P = P; o.z = z; o.vf = vf;
    produced_.push_back(o);

    // ---- KPIs ------------------------------------------------------------
    kpis_.clear();
    kpis_["residenceTime_s"]     = tau;
    kpis_["fillFraction"]        = fill;
    kpis_["density_kg_m3"]       = rho;
    //  What fraction of the stream the density was actually priced over: 1
    //  when every component has a molar volume on this rung, less when a
    //  dissolved supercritical gas does not.  Published so the approximation
    //  the advisory names carries a number the reader can act on.
    kpis_["densityPricedFraction"] = 1.0 - droppedFrac;
    kpis_["massFlow_kg_s"]       = mdot;
    kpis_["volumetricFlow_m3_s"] = Qvol;
    kpis_["holdupVolume_m3"]     = V_holdup;
    kpis_["holdupMass_kg"]       = m_holdup;
    kpis_["vesselVolume_m3"]     = V_vessel;
    //  PER COMPONENT, because an inventory has to be VALUED and the ammonia
    //  in a product tank is not worth what the syngas in a feed tank is.
    for (std::size_t i = 0; i < n && i < z.size(); ++i)
        if (z[i] > 0.0)
            kpis_["holdupMass_" + thermo.comp(i).name() + "_kg"] =
                (MWavg > 0.0) ? m_holdup * z[i] * thermo.comp(i).MW() / MWavg
                              : 0.0;

    if (verbosity >= 2)
        std::cout << "  [tank] residence time " << std::fixed
                  << std::setprecision(1) << (tau / 3600.0) << " h  ->  holdup "
                  << std::setprecision(2) << V_holdup << " m^3, "
                  << std::setprecision(0) << m_holdup << " kg  (rho "
                  << std::setprecision(1) << rho << " kg/m^3); vessel "
                  << std::setprecision(2) << V_vessel << " m^3 at fill "
                  << fill << "\n";

    return 0;
}

} // namespace Choupo
