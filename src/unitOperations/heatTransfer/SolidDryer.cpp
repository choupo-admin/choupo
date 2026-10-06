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

#include "SolidDryer.H"
#include "Psychrometry.H"
#include "thermo/ThermoPackage.H"
#include "core/Advisory.H"
#include "unitOperations/flash/StreamEquilibrium.H"   // the ONE resolve-and-price home

#include <algorithm>
#include <cmath>
#include "solver/NewtonRaphson.H"
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include "thermo/vaporPressure/VaporPressureModel.H"
#include "thermo/heatCapacity/HeatCapacityModel.H"

namespace Choupo {

int SolidDryer::solve(const DictPtr& dict,
                      const ThermoPackage& thermo,
                      int verbosity)
{
    const std::size_t n = thermo.n();

    // ---- TWO real input streams: a wet solid + a HOT-AIR stream --------
    //  No more (airTemperature, RH) parameters + a phantom duty: the drying
    //  air is a genuine flowsheet stream that BRINGS the heat (its sensible
    //  cooling) and CARRIES AWAY the moisture (a humid exhaust).  Information
    //  follows the streams; the energy closes with real streams, no duty.
    auto ins = dict->lookupDictList("inputStreams");
    if (ins.size() < 2)
        throw std::runtime_error("SolidDryer: needs TWO inputs -- a wet solid and"
            " a hot-air stream, e.g. inputs ( wetSolid hotAir ).");

    auto readComp = [&](const DictPtr& sd) -> sVector
    {
        sVector v(n, 0.0); auto c = sd->subDict("composition"); scalar s = 0.0;
        for (const auto& k : c->keys()) v[thermo.indexOf(k)] = c->lookupScalar(k);
        for (auto x : v) s += x;
        if (s > 0.0) for (auto& x : v) x /= s;
        return v;
    };
    auto readSolids = [&](const DictPtr& sd) -> sVector
    {
        sVector v(n, 0.0);
        if (sd->found("solids") && sd->subDict("solids")->found("solidMolarFlows"))
        {
            auto mf = sd->subDict("solids")->subDict("solidMolarFlows");
            for (const auto& k : mf->keys()) v[thermo.indexOf(k)] = mf->lookupScalar(k);
        }
        return v;
    };

    // Identify which input is the wet solid (carries solids with a sorption
    // isotherm) and which is the air (the other one).
    DictPtr solidDict, airDict;
    for (const auto& s : ins)
    {
        const sVector sj = readSolids(s);
        bool isWet = false;
        for (std::size_t i = 0; i < n; ++i)
            if (sj[i] > 0.0 && thermo.comp(i).hasSorption()) isWet = true;
        if (isWet && !solidDict) solidDict = s; else if (!airDict) airDict = s;
    }
    if (!solidDict || !airDict)
        throw std::runtime_error("SolidDryer: could not identify the wet solid (a"
            " stream carrying solids with a `sorption {}` isotherm) and the air.");

    const scalar F_w  = solidDict->lookupScalar("F", Dims::molarFlow);   // bound water [kmol/s]
    const scalar T_w  = solidDict->lookupScalar("T", Dims::temperature);
    const scalar P    = solidDict->lookupScalar("P", Dims::pressure);
    const sVector zW  = readComp(solidDict);
    const sVector sW  = readSolids(solidDict);
    const scalar F_air = airDict->lookupScalar("F", Dims::molarFlow);    // dry+humid air [kmol/s]
    const scalar T_air = airDict->lookupScalar("T", Dims::temperature);
    const sVector yAir = readComp(airDict);
    const scalar P_air = airDict->lookupScalarOrDefault("P", P);

    // ---- Identify the wet SOLID (sorption) and the SOLVENT (water) -----
    std::size_t iSolid = n, iSolv = n;
    for (std::size_t i = 0; i < n; ++i)
        if (sW[i] > 0.0 && thermo.comp(i).hasSorption()) iSolid = i;
    // The moisture is the volatile in the WET SOLID's bound liquid (zW) -- NOT
    // any volatile in the air (N2/O2 carry an extrapolated Psat and would be
    // picked wrongly as "the solvent").
    for (std::size_t i = 0; i < n; ++i)
        if (zW[i] > 0.0 && thermo.comp(i).hasVaporPressure()) { iSolv = i; break; }
    if (iSolid == n)
        throw std::runtime_error("SolidDryer: no wet solid with a `sorption {}` isotherm.");
    if (iSolv == n)
        throw std::runtime_error("SolidDryer: no volatile moisture (need water with a vapour pressure).");

    const Component& sol  = thermo.comp(iSolid);
    const Component& solv = thermo.comp(iSolv);
    const scalar MW_sol  = sol.MW();
    const scalar MW_solv = solv.MW();

    // ---- Relative humidity FROM THE AIR STREAM (not a parameter) -------
    const scalar Psat_air = solv.vp().Psat_Pa(T_air);
    const scalar p_w_air  = yAir[iSolv] * P;
    const scalar aw = std::min(0.99, std::max(0.0, (Psat_air > 0.0) ? p_w_air / Psat_air : 0.0));

    // ---- GAB equilibrium moisture at the air's a_w --------------------
    const scalar solid_mol  = sW[iSolid];
    const scalar solid_mass = solid_mol * MW_sol;                       // kg/s
    const scalar water_in   = F_w * zW[iSolv];                          // kmol/s bound water
    const scalar X_in = (solid_mass > 0.0) ? water_in * MW_solv / solid_mass : 0.0;
    //  ONE home for the GAB expression (Psychrometry.H).  Until 2026-09-29
    //  an out-of-domain isotherm (K a_w >= 1) or a non-positive Xm set X_eq
    //  to ZERO here, silently -- a dryer that then dried to bone-dry; it is
    //  refused by name now, as the batch dryer always refused it.
    const scalar X_eq = psychrometry::gabMoisture(sol, aw, "SolidDryer");
    //  The moisture the isotherm allows.  NOT yet the moisture the powder
    //  leaves with: the air may be unable to pay for it, or its exhaust
    //  unable to carry it (see below).
    const scalar X_target    = std::min(X_in, X_eq);
    const scalar water_rem_target =
        std::max(0.0, water_in - X_target * solid_mass / MW_solv);      // kmol/s

    // ---- Adiabatic energy balance -> outlet T_out (no duty) -----------
    //   Hot air cools (T_air -> T_out); the solid, its moisture and the
    //   evaporated water leave at T_out.  The dryer declares no duty, so the
    //   whole balance is
    //       H(dry solid, T_out) + H(humid exhaust, T_out)
    //           = H(wet solid, T_w) + H(hot air, T_air),
    //   solved for T_out in [T_floor, T_air], T_floor the GAS'S WET BULB.
    //
    //   ON THE SURFACE THE STREAMS ARE PRICED ON, AND NEVER BY INVENTING HEAT
    //   (2026-09-27).  This used to be a constant-Cp air balance against a
    //   Watson latent heat -- a surface the published streams are not priced
    //   on -- and, when the air could not supply the heat even with the solid
    //   leaving at its feed temperature, it FLOORED T_out at T_w and
    //   evaporated the full isotherm target anyway.  The heat for that water
    //   came from nowhere: on the flagship plant, +10.2352 kW on DRYING.BD,
    //   the unit's whole row in the first-law report, announced only as a
    //   console line.  Every enthalpy is now `flashState::priceState` (+
    //   `priceSolids`), the call the energy report's own rule is.  When the
    //   air cannot pay, the solid still leaves at T_w -- this model's
    //   declared floor, unchanged -- and the evaporation is what the air CAN
    //   pay for, so the powder leaves WETTER than the isotherm allows, and the
    //   run says so.
    //
    //   THE FLOOR IS THE GAS'S WET BULB (2026-10-05, DEV.md C35 item 7,
    //   Vitor's ruling).  The powder and the exhaust leave at ONE
    //   temperature, and a wet solid in a gas cools toward the gas's wet-bulb
    //   (adiabatic-saturation) temperature, not toward its own feed
    //   temperature: until 2026-10-05 the floor was T_w, so a warm powder
    //   could not give its sensible heat to the evaporation (the flagship's
    //   DRYING.BD, energy-limited at its 349.68 K feed T) and a cold one let
    //   the exhaust leave below the gas's wet bulb.  The wet bulb is the
    //   shared psychrometry's (`psychrometry::gasWetBulb`).
    const std::string who = "solidDryer '" + (dict->name().empty() ? type() : dict->name()) + "'";
    //  The inlets' phases: an UNPINNED authored inlet means its own
    //  equilibrium (R-E2), single phase included -- `priceState` keeps the
    //  CARRIED value on a single-phase answer, and the carried default 0
    //  priced this unit's own undeclared hot air as a liquid (solidDryer01,
    //  365.78 kW, 2026-09-27).  Produced inlets keep their producer's answer
    //  (DEV.md C33/C34).
    const bool   pinnedW   = solidDict->lookupScalarOrDefault("phasePinned", 0.0) > 0.5;
    const scalar vfW       = flashState::resolvedInletVaporFraction(
        solidDict, T_w, P, zW, thermo, who + " wet solid");
    const bool   pinnedAir = airDict->lookupScalarOrDefault("phasePinned", 0.0) > 0.5;
    const scalar vfAir     = !airDict->found("vf") ? 1.0
        : flashState::resolvedInletVaporFraction(airDict, T_air, P_air, yAir,
                                                 thermo, who + " hot air");
    const scalar H_in =
          flashState::priceState(T_w, P, zW, F_w, pinnedW, vfW, thermo,
                                 who + " wet solid", nullptr)
        + flashState::priceSolids(sW, T_w, thermo)
        + flashState::priceState(T_air, P_air, yAir, F_air, pinnedAir, vfAir,
                                 thermo, who + " hot air", nullptr);        // kW
    sVector sDry(n, 0.0); sDry[iSolid] = solid_mol;
    sVector zWater(n, 0.0); zWater[iSolv] = 1.0;
    auto exhaustComp = [&](scalar rem, scalar& Fex)
    {
        Fex = F_air + rem;
        sVector z(n, 0.0);
        if (Fex > 0.0)
            for (std::size_t i = 0; i < n; ++i)
                z[i] = (yAir[i] * F_air + (i == iSolv ? rem : 0.0)) / Fex;
        return z;
    };
    //  The two outlets, exactly as they are published below (unpinned).
    auto H_out = [&](scalar T, scalar rem) -> scalar                      // kW
    {
        const scalar wf = std::max(0.0, water_in - rem);
        scalar H = flashState::priceSolids(sDry, T, thermo);
        if (wf > 0.0)
            H += flashState::priceState(T, P, zWater, wf, false, 0.0, thermo,
                                        who + " dry solid", nullptr);
        scalar Fex = 0.0;
        const sVector zex = exhaustComp(rem, Fex);
        H += flashState::priceState(T, P, zex, Fex, false, 1.0, thermo,
                                    who + " exhaust", nullptr);
        return H;
    };
    const scalar T_floor = psychrometry::gasWetBulb(thermo, yAir, iSolv,
                                                    T_air, P_air, who);
    if (H_out(T_floor, 0.0) - H_in > 0.0)
    {
        std::ostringstream m;
        m << std::setprecision(4) << std::fixed << who << ": the air cannot"
             " bring the wet solid from its feed temperature (" << T_w
          << " K) up to the air's wet-bulb temperature (" << T_floor
          << " K, this model's floor) even evaporating nothing -- it is "
          << (H_out(T_floor, 0.0) - H_in) << " kW short.  The outlet would"
             " lie below the air's wet bulb, where this model does not go."
             "  Use more or hotter air, or a warmer feed.";
        throw std::runtime_error(m.str());
    }
    //  The outlet T for an evaporation `rem` the air can pay for above the
    //  floor (H_out(T_floor, rem) <= H_in): the root of H(out) = H(in) in
    //  [T_floor, T_air].
    auto Tout_for = [&](scalar rem) -> scalar
    {
        auto g  = [&](scalar T) { return H_out(T, rem) - H_in; };
        auto dg = [&](scalar T) { const scalar dT = 1.0e-3;
                                  return (g(T + dT) - g(T - dT)) / (2.0 * dT); };
        solver::NROptions o;
        o.tolerance = 1.0e-9;                 // kW -- a microwatt
        o.maxIter   = 200;
        o.lower     = T_floor;
        o.upper     = T_air;
        o.bracket   = true;
        o.monotoneIncreasing = true;
        auto r = solver::newton1D(g, dg, 0.5 * (std::max(T_w, T_floor) + T_air), o);
        if (!r.converged)
            throw std::runtime_error(who + ": the adiabatic energy balance"
                " H(out) = H(in) did not converge for T_out in [T_floor, T_air]"
                " (residual " + std::to_string(r.residual) + " kW).");
        return r.x;
    };

    // ---- THE EXHAUST MAY NOT BE SUPERSATURATED (2026-10-05, DEV.md C37
    //      item 3, Vitor's ruling) ---------------------------------------
    //
    //  Until 2026-10-05 this unit had no limit on what its exhaust could
    //  carry: the evaporation was the isotherm's target (or what the heat
    //  paid for), whatever humidity that left in the gas at T_out.  An
    //  exhaust carrying more water than saturation allows at its own T_out
    //  was then PRICED at its condensed equilibrium (`priceState` resolves
    //  the split) and PUBLISHED as vf = 1 -- a fog sold as a vapour.
    //  Measured (DEV.md C35 item 7): solidDryer01 with its air cut to
    //  100 kmol/h still reached its isotherm, at 318.6 K.  Now the exhaust's
    //  humidity ratio may not exceed Y_sat(T_out), i.e. its water activity
    //  a_w = p_w / p_sat(T_out) may not exceed 1 -- the two statements are
    //  one, through the shared psychrometry (`psychrometry::Ysat`,
    //  `airWaterActivity`, the construction the evaporative dryer, the
    //  convective dryer and the cooling tower read).  `airWaterActivity` is
    //  used because it stays defined where Y_sat does not (p_sat >= 0.95 P).
    //  The limit is SATURATION itself, a_w = 1: unlike `evaporativeDryer`'s
    //  `maxExhaustHumidity` (a design margin, default 0.95) it is not a knob.
    scalar mDryCarrier = 0.0, nDryCarrier = 0.0;          // per kmol of air
    for (std::size_t i = 0; i < n; ++i)
        if (i != iSolv && yAir[i] > 0.0)
        { nDryCarrier += yAir[i]; mDryCarrier += yAir[i] * thermo.comp(i).MW(); }
    if (!(nDryCarrier > 0.0))
        throw std::runtime_error(who + ": the drying air carries no dry"
            " carrier -- its humidity ratio is not defined");
    const scalar Mc = mDryCarrier / nDryCarrier;          // kg/kmol
    auto aw_exhaust = [&](scalar rem, scalar T) -> scalar
    {
        const scalar Y = (yAir[iSolv] * F_air + rem) * MW_solv
                       / (mDryCarrier * F_air);            // kg/kg dry carrier
        return psychrometry::airWaterActivity(solv, MW_solv, Mc, P, T, Y, who);
    };

    // ---- WHICH LIMIT BINDS, decided at the answer ----------------------
    //  heat:  the air cannot pay for the isotherm's target even with the
    //         solid leaving at the floor -> evaporate what it CAN pay for
    //         there (H_out is monotone increasing in the evaporation --
    //         vapour costs more than liquid);
    //  saturation: the exhaust of that evaporation, at its own T_out, would
    //         be supersaturated -> the evaporation is the one that leaves
    //         the exhaust exactly saturated (a_w rises monotonically with the
    //         evaporation: more water in the gas AND a colder outlet), taken
    //         on the unsaturated side of the bisection;
    //  isotherm: neither binds.
    const bool heatBinds = (H_out(T_floor, water_rem_target) - H_in > 0.0);
    scalar water_pay = water_rem_target;                  // kmol/s
    if (heatBinds)
    {
        scalar lo = 0.0, hi = water_rem_target;
        for (int it = 0; it < 200 && (hi - lo) > 1.0e-15 * std::max(1.0, water_rem_target); ++it)
        { const scalar m = 0.5*(lo+hi); if (H_out(T_floor, m) - H_in > 0.0) hi = m; else lo = m; }
        water_pay = 0.5 * (lo + hi);
    }
    //  At the heat limit the solid leaves at its floor by construction
    //  (water_pay is the balance's root there), so the floor is written,
    //  not searched.
    const scalar T_cap = heatBinds ? T_floor : Tout_for(water_pay);
    scalar T_out, water_rem;
    std::string limit;
    if (aw_exhaust(water_pay, T_cap) <= 1.0)
    {
        water_rem = water_pay;
        T_out     = T_cap;
        limit     = heatBinds ? "heat-bound" : "isotherm-reached";
    }
    else
    {
        scalar lo = 0.0, hi = water_pay;
        for (int it = 0; it < 200 && (hi - lo) > 1.0e-13 * water_pay; ++it)
        {
            const scalar m = 0.5*(lo+hi);
            if (aw_exhaust(m, Tout_for(m)) > 1.0) hi = m; else lo = m;
        }
        water_rem = lo;                                    // a_w <= 1
        T_out     = Tout_for(water_rem);
        limit     = "saturation-bound";
    }
    const scalar aw_out = aw_exhaust(water_rem, T_out);
    const scalar water_final = std::max(0.0, water_in - water_rem);    // kept in the powder
    const scalar X_final     = (solid_mass > 0.0) ? water_final * MW_solv / solid_mass : 0.0;

    // ---- Outlet streams: dry solid + HUMID EXHAUST (air + moisture) ----
    produced_.clear();
    ProcessStream dry;
    dry.name = "drySolid";  dry.T = T_out;  dry.P = P;  dry.vf = 0.0;
    dry.F = water_final;
    dry.z.assign(n, 0.0);  if (water_final > 0.0) dry.z[iSolv] = 1.0;
    dry.s.assign(n, 0.0);  dry.s[iSolid] = solid_mol;
    produced_.push_back(dry);

    ProcessStream ex;
    ex.name = "humidExhaust";  ex.T = T_out;  ex.P = P;  ex.vf = 1.0;
    ex.F = F_air + water_rem;                              // air + evaporated moisture
    ex.z.assign(n, 0.0);
    if (ex.F > 0.0)
        for (std::size_t i = 0; i < n; ++i)
            ex.z[i] = (yAir[i] * F_air + (i == iSolv ? water_rem : 0.0)) / ex.F;
    produced_.push_back(ex);

    kpis_.clear();
    kpis_["X_initial"]      = X_in;
    kpis_["X_equilibrium"]  = X_eq;
    kpis_["X_final"]        = X_final;
    kpis_["moisture_pct_wb"]= 100.0 * X_final / (1.0 + X_final);
    kpis_["water_removed"]  = water_rem * MW_solv;        // kg/s
    kpis_["drySolid_flow"]  = solid_mass + water_final * MW_solv;
    kpis_["water_activity"] = aw;
    kpis_["T_out"]          = T_out;
    kpis_["T_wetbulb"]      = T_floor;                // K, the floor
    kpis_["exhaust_humidity"] = aw_out;               // a_w at T_out, <= 1
    kpis_["air_in_kmol_h"]  = F_air * 3600.0;

    //  THE LIMIT THAT BINDS IS ANNOUNCED (C37 item 3): all three in the
    //  result block below (`[isotherm-reached]`, `[heat-bound]`,
    //  `[saturation-bound]`); the two that leave the powder wetter than the
    //  isotherm allows also as a WARNING that rides AdvisoryLog into the
    //  caveat block, printed only when AdvisoryLog takes it as new (an
    //  identical message from a recycle's re-solve is not printed again).
    if (limit == "heat-bound")
    {
        std::ostringstream msg;
        msg << std::setprecision(4) << std::fixed
            << "the hot air cannot pay for drying to the isotherm's equilibrium"
               " moisture: with the solid leaving at the air's wet-bulb"
               " temperature (" << T_floor << " K, this model's floor) it"
               " evaporates "
            << (water_rem * MW_solv * 3600.0) << " kg/h of the "
            << (water_rem_target * MW_solv * 3600.0) << " kg/h the isotherm"
               " would remove, so the powder leaves at X = " << X_final
            << " kg/kg instead of X_eq = " << X_eq << ".  Use hotter or more"
               " air.";
        if (AdvisoryLog::instance().add("drying", "warning", who, msg.str()))
            std::cout << "  [SolidDryer] WARNING: " << msg.str() << "\n";
    }
    else if (limit == "saturation-bound")
    {
        std::ostringstream msg;
        msg << std::setprecision(4) << std::fixed
            << "the exhaust saturates before the powder reaches the isotherm's"
               " equilibrium moisture: at T_out = " << T_out << " K it carries "
            << (water_rem * MW_solv * 3600.0) << " kg/h (a_w = " << aw_out
            << ") of the " << (water_rem_target * MW_solv * 3600.0)
            << " kg/h the isotherm would remove";
        if (heatBinds)
            msg << " (its heat, cooled to the air's wet bulb, could have paid"
                   " for " << (water_pay * MW_solv * 3600.0) << " kg/h)";
        msg << ", so the powder leaves at X = " << X_final << " kg/kg instead"
               " of X_eq = " << X_eq << ".  More evaporation would leave a fog"
               " in the exhaust.  Use more or drier air.";
        if (AdvisoryLog::instance().add("drying", "warning", who, msg.str()))
            std::cout << "  [SolidDryer] WARNING: " << msg.str() << "\n";
    }
    if (verbosity >= 2)
        std::cout << "\n=========================  Solid Dryer Result  ===================\n"
                  << "  Hot air IN: T = " << std::fixed << std::setprecision(1) << T_air
                  << " K, " << std::setprecision(1) << (F_air*3600.0) << " kmol/h, a_w = "
                  << std::setprecision(3) << aw << "  (RH " << std::setprecision(1) << (100.0*aw) << "%)\n"
                  << "  X_in = " << std::setprecision(3) << X_in << "  ->  X_eq = " << X_eq
                  << "  ->  X_final = " << X_final << " kg/kg  ("
                  << std::setprecision(2) << (100.0*X_final/(1.0+X_final)) << " wt% wet)\n"
                  << "  Water evaporated into the air = " << std::scientific << std::setprecision(3)
                  << (water_rem*MW_solv) << " kg/s\n" << std::fixed
                  << "  Adiabatic outlet T_out = " << std::setprecision(1) << T_out
                  << " K   (air cooled " << std::setprecision(1) << (T_air - T_out)
                  << " K to supply the heat -- NO external duty)\n"
                  << "  Exhaust a_w at T_out = " << std::setprecision(4) << aw_out
                  << "   [" << limit << "]\n"
                  << "==================================================================\n\n";
    return 0;
}

} // namespace Choupo
