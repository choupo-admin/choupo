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
-------------------------------------------------------------------------------
\*---------------------------------------------------------------------------*/

#include "EvaporativeDryer.H"
#include "Psychrometry.H"
#include "thermo/ThermoPackage.H"
#include "core/Advisory.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <limits>
#include <sstream>
#include <stdexcept>
#include "thermo/vaporPressure/VaporPressureModel.H"
#include "thermo/heatCapacity/HeatCapacityModel.H"

namespace Choupo {

int EvaporativeDryer::solve(const DictPtr& dict,
                            const ThermoPackage& thermo,
                            int verbosity)
{
    const std::size_t n = thermo.n();

    auto ins = dict->lookupDictList("inputStreams");
    if (ins.size() < 2)
        throw std::runtime_error("EvaporativeDryer: needs TWO inputs -- a wet solid"
            " and a hot-air stream, e.g. inputs ( wetSolid hotAir ).");

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

    // Identify the wet solid (carries ANY solid in s[]) vs the air (the other).
    // NO sorption requirement -- free surface moisture, not GAB-sorbed water.
    DictPtr solidDict, airDict;
    for (const auto& s : ins)
    {
        const sVector sj = readSolids(s);
        bool hasSolid = false;
        for (std::size_t i = 0; i < n; ++i) if (sj[i] > 0.0) hasSolid = true;
        if (hasSolid && !solidDict) solidDict = s; else if (!airDict) airDict = s;
    }
    if (!solidDict || !airDict)
        throw std::runtime_error("EvaporativeDryer: could not identify the wet solid"
            " (a stream carrying solids in s[]) and the air.");

    const scalar F_w   = solidDict->lookupScalar("F", Dims::molarFlow);   // free water [kmol/s]
    const scalar T_w   = solidDict->lookupScalar("T", Dims::temperature);
    const scalar P     = solidDict->lookupScalar("P", Dims::pressure);
    const sVector zW   = readComp(solidDict);
    const sVector sW   = readSolids(solidDict);
    const scalar F_air = airDict->lookupScalar("F", Dims::molarFlow);
    const scalar T_air = airDict->lookupScalar("T", Dims::temperature);
    const sVector yAir = readComp(airDict);

    // The dried solid (first solid in s[]) and the free moisture (the volatile
    // in the wet solid's fluid flow -- water with a vapour pressure).
    std::size_t iSolid = n, iSolv = n;
    for (std::size_t i = 0; i < n; ++i) if (sW[i] > 0.0) { iSolid = i; break; }
    for (std::size_t i = 0; i < n; ++i)
        if (zW[i] > 0.0 && thermo.comp(i).hasVaporPressure()) { iSolv = i; break; }
    if (iSolid == n)
        throw std::runtime_error("EvaporativeDryer: no solid in the wet feed.");
    if (iSolv == n)
        throw std::runtime_error("EvaporativeDryer: no volatile moisture (need water"
            " with a vapour pressure) in the wet solid.");

    const Component& sol  = thermo.comp(iSolid);
    const Component& solv = thermo.comp(iSolv);
    const scalar MW_sol  = sol.MW();
    const scalar MW_solv = solv.MW();

    const scalar solid_mol  = sW[iSolid];
    const scalar solid_mass = solid_mol * MW_sol;                        // kg/s
    const scalar water_in   = F_w * zW[iSolv];                           // kmol/s free water
    const scalar X_in = (solid_mass > 0.0) ? water_in * MW_solv / solid_mass : 0.0;

    // Target maximum exhaust water activity (the air-capacity limit).  Default
    // 0.95: a real dryer never quite saturates its exhaust.  Optional override.
    const scalar aw_max = dict->found("operation")
                       && dict->subDict("operation")->found("maxExhaustHumidity")
        ? dict->subDict("operation")->lookupScalar("maxExhaustHumidity") : 0.95;

    // Sensible heat capacities (evaluated at the mean film T).
    //
    //  THIS UNIT'S ENERGY BALANCE IS ITS OWN HAND SURFACE, and that is named
    //  rather than hidden (2026-10-05, DEV.md C26).  The spray and solid
    //  dryers moved to the formation surface the energy report prices on
    //  (`flashState::priceState`, 2026-09-27); this one cannot follow them on
    //  its corpus today, because the crystal it dries in every shipped case
    //  (NaCl, Li2CO3) carries no formation datum -- a salt's solid enthalpy is
    //  ION-DERIVED by rule (CLAUDE.md 5), so outside an electrolyte package
    //  the report REFUSES the energy balance of these cases and `priceState`
    //  would refuse the unit.  Moving it is therefore a change to what the
    //  engine refuses, and is Vitor's.  What this surface must not do is
    //  default a heat capacity in silence, so each default that is USED is
    //  announced below.
    const std::string who = "evaporativeDryer '"
        + (dict->name().empty() ? type() : dict->name()) + "'";
    const scalar Tmid = 0.5 * (T_w + T_air);
    scalar cp_air = 0.0;                                                 // J/(mol.K)
    for (std::size_t i = 0; i < n; ++i)
        if (yAir[i] > 0.0 && thermo.comp(i).hasCpIdealGas())
            cp_air += yAir[i] * thermo.comp(i).cpIdealGas().Cp(T_air);
    const scalar cpSolid = sol.hasCpSolid()   ? sol.cpSolid().Cp(Tmid) : 0.0;
    const scalar cpLiq   = solv.hasCpLiquid() ? solv.cpLiquid().Cp(Tmid) : 75.4;
    if (!sol.hasCpSolid() && solid_mol > 0.0)
    {
        const std::string msg = "'" + sol.name() + "' carries no"
            " `solidHeatCapacity {}`, so the sensible heat of warming the"
            " crystal from its feed temperature to the outlet is taken as ZERO"
            " in this unit's energy balance (a default, not a datum).  Curate"
            " the record's solid heat capacity to price it.";
        if (AdvisoryLog::instance().add("drying", "warning", who, msg))
            std::cout << "  [EvaporativeDryer] DEFAULT: " << msg << "\n";
    }
    if (!solv.hasCpLiquid() && water_in > 0.0)
    {
        const std::string msg = "'" + solv.name() + "' carries no liquid"
            " heat capacity, so the free water is warmed at a fixed 75.4"
            " J/(mol K) (liquid water near 25 C -- a default, not a datum).";
        if (AdvisoryLog::instance().add("drying", "warning", who, msg))
            std::cout << "  [EvaporativeDryer] DEFAULT: " << msg << "\n";
    }

    // The energy balance on this surface, in W: what the air gives up cooling
    // from T_air to Tout, minus what warming (or cooling) the solid and its
    // water from their feed T_w to Tout and evaporating `water_rem` at Tout
    // cost.
    auto fEner = [&](scalar Tout, scalar water_rem) -> scalar
    {
        const scalar supply = F_air * 1000.0 * cp_air * (T_air - Tout);
        const scalar demand = (solid_mol * cpSolid + water_in * cpLiq) * 1000.0 * (Tout - T_w)
                            + water_rem * 1000.0 * solv.Hvap_latent(Tout);
        return supply - demand;
    };

    // ---- THE FLOOR IS THE GAS'S WET BULB (2026-10-05, DEV.md C35 item 7) --
    //
    //  The solid and the exhaust leave at ONE temperature, and a wet solid in
    //  a gas cools toward the gas's wet-bulb temperature -- the adiabatic-
    //  saturation temperature of that gas -- not toward its own feed
    //  temperature.  Until 2026-10-05 the floor was the solid's feed T: a
    //  warm cake could not give its own sensible heat to the evaporation,
    //  and a cold one let the exhaust leave below the gas's wet bulb.  The
    //  wet bulb is the shared psychrometry's (`psychrometry::gasWetBulb`,
    //  the construction the cooling tower and the convective and batch
    //  dryers read).
    const scalar T_floor = psychrometry::gasWetBulb(thermo, yAir, iSolv,
                                                    T_air, P, who);

    // ---- THE OUTLET T IS THE FIRST ROOT ABOVE THE FLOOR (2026-10-05) -----
    //
    //  This surface's latent heat is Watson's, which VANISHES at the
    //  moisture's critical temperature, while the free water is warmed as a
    //  liquid at a constant cp -- so close below Tc the demand can FALL with
    //  T, and fEner has a second, spurious root there and a third above Tc.
    //  The bisection on [floor, T_air] took its first midpoint above Tc
    //  whenever the gas was hot (the lithium plant's 950 K flue gas with a
    //  20 % gas margin: T_out 672.28 K, DEV.md C35 item 11).  Now the
    //  bracket stops at the moisture's critical temperature -- this surface
    //  cannot price the water past it -- and the root taken is the FIRST
    //  sign change above the floor: a scan of 400 steps, then a bisection
    //  inside the step to 1e-9 K.  When the balance has no root below Tc
    //  the answer is NaN, and the caller decides (a trial: below the cap;
    //  the answer: refused by name).
    const scalar T_top = std::min(T_air, std::nextafter(solv.Tc(), 0.0));
    auto Tout_for = [&](scalar water_rem) -> scalar
    {
        if (fEner(T_floor, water_rem) < 0.0) return T_floor;   // energy floor
        if (!(T_top > T_floor)) return T_floor;
        constexpr int NSCAN = 400;
        const scalar dT = (T_top - T_floor) / NSCAN;
        scalar a = T_floor;
        for (int k = 1; k <= NSCAN; ++k)
        {
            const scalar b = (k == NSCAN) ? T_top : T_floor + dT * k;
            if (fEner(b, water_rem) < 0.0)
            {
                scalar lo = a, hi = b;
                for (int it = 0; it < 100 && (hi - lo) > 1.0e-9; ++it)
                {
                    const scalar m = 0.5*(lo+hi);
                    if (fEner(m, water_rem) >= 0.0) lo = m; else hi = m;
                }
                return 0.5*(lo+hi);
            }
            a = b;
        }
        return std::numeric_limits<scalar>::quiet_NaN();   // no root below Tc
    };

    // Exhaust water activity if 'water_rem' is evaporated into the air at T_out.
    //  A trial whose balance has no root below the moisture's critical
    //  temperature puts the exhaust above it, where p_sat exceeds every
    //  partial pressure an exhaust below the critical pressure can carry:
    //  that trial is below any cap a_w_max < 1, and is reported as 0.
    auto aw_exhaust = [&](scalar water_rem, scalar Tout) -> scalar
    {
        if (std::isnan(Tout)) return 0.0;
        const scalar F_ex = F_air + water_rem;
        const scalar y_w  = (F_ex > 0.0)
            ? (yAir[iSolv] * F_air + water_rem) / F_ex : 0.0;
        const scalar Psat = thermo.Psat(iSolv, Tout);
        return (Psat > 0.0) ? y_w * P / Psat : 1.0;
    };

    // ---- WHICH LIMIT BINDS, decided at the answer (2026-10-05) -----------
    //
    //  THE HEAT THE AIR CAN PAY FOR.  With the solid leaving at its floor
    //  T_floor (the gas's wet bulb) the balance above is linear in the
    //  evaporation, so its root is closed-form:
    //      water_pay = [F_air cp_air (T_air - T_floor)
    //                   - (n_s cp_s + n_w cp_w)(T_floor - T_w)] / lambda(T_floor).
    //  (Until 2026-10-05 the floor WAS T_w and the sensible term vanished.)
    //  Until 2026-10-05 this unit asked only whether removing ALL the free
    //  water hit the floor, and two defects followed from that one question,
    //  the first of them the solid dryer's of 2026-09-27:
    //    * when the floor bound and the exhaust stayed below its cap, it
    //      evaporated ALL the free water anyway with T_out at T_w -- the heat
    //      for every kilogram beyond water_pay came from nowhere;
    //    * when the exhaust cap bound first (evapDryer02, the lithium plant's
    //      FINISHING.dryer), it still LABELLED the answer energy-limited and
    //      warned that T_out was floored at the feed T, beside a T_out tens of
    //      kelvin above it -- a hypothetical (all the water) reported as the
    //      answer's limit.
    //  Now the evaporation is capped by what the air can pay for, the exhaust
    //  cap is solved inside that, and the limit announced is the one that
    //  binds the answer.
    const scalar lambda_f  = solv.Hvap_latent(T_floor);                  // J/mol
    const scalar heat_f    = fEner(T_floor, 0.0);                         // W
    if (heat_f < 0.0)
    {
        std::ostringstream m;
        m << std::setprecision(4) << std::fixed << who << ": the gas cannot"
             " bring the wet solid from its feed temperature (" << T_w
          << " K) up to the gas's wet-bulb temperature (" << T_floor
          << " K, this model's floor) even evaporating nothing -- it is "
          << (-heat_f / 1000.0) << " kW short.  The outlet would lie below"
             " the gas's wet bulb, where this model does not go.  Use more"
             " or hotter gas, or a warmer feed.";
        throw std::runtime_error(m.str());
    }
    const scalar water_pay = (lambda_f > 0.0)
        ? heat_f / (1000.0 * lambda_f) : water_in;                        // kmol/s
    const bool   heatBinds = water_pay < water_in;
    const scalar water_cap = heatBinds ? water_pay : water_in;           // kmol/s

    scalar water_rem;
    std::string limit;
    if (aw_exhaust(water_cap, Tout_for(water_cap)) <= aw_max)
    {
        water_rem = water_cap;
        limit = heatBinds ? "energy" : "complete";
    }
    else
    {
        scalar lo = 0.0, hi = water_cap;                     // aw increases with water_rem
        for (int it = 0; it < 80 && (hi - lo) > 1.0e-12; ++it)
        {
            const scalar m = 0.5*(lo+hi);
            if (aw_exhaust(m, Tout_for(m)) >= aw_max) hi = m; else lo = m;
        }
        water_rem = 0.5*(lo+hi);
        limit = "saturation";
    }

    //  At the energy limit the solid leaves at its floor by construction
    //  (water_pay is the balance's root there); Tout_for would return it only
    //  to within its own 1e-4 K bracket, so the floor is written, not searched.
    const scalar T_out       = (limit == "energy") ? T_floor : Tout_for(water_rem);
    if (std::isnan(T_out))
    {
        std::ostringstream m;
        m << std::setprecision(2) << std::fixed << who << ": the energy"
             " balance has no outlet temperature below the moisture's critical"
             " temperature (" << solv.Tc() << " K) for the "
          << (water_rem * MW_solv * 3600.0) << " kg/h it evaporates -- the"
             " gas (" << T_air << " K, " << (F_air * 3600.0) << " kmol/h)"
             " carries more heat than the evaporation and the warm-up absorb"
             " below it.  This unit prices the free water as a liquid and"
             " evaporates it at a Watson latent heat that vanishes at Tc, so"
             " it cannot price an outlet there.  Use less or cooler gas.";
        throw std::runtime_error(m.str());
    }
    const scalar water_final = std::max(0.0, water_in - water_rem);      // stays on the cake
    const scalar X_final     = (solid_mass > 0.0) ? water_final * MW_solv / solid_mass : 0.0;
    const scalar aw_out      = aw_exhaust(water_rem, T_out);

    // ---- Outlet streams: dry solid + humid exhaust --------------------
    produced_.clear();
    ProcessStream dry;
    dry.name = "drySolid";  dry.T = T_out;  dry.P = P;  dry.vf = 0.0;
    // The dried cake keeps its SOLIDS + residual water + ALL dissolved
    // non-volatile solutes: only water evaporates, so a dissolved salt (e.g.
    // the Li2CO3 left in the mother liquor after crystallisation) STAYS on the
    // cake -- it must never vanish from the mass balance.
    scalar dryFluid = water_final;
    for (std::size_t i = 0; i < n; ++i)
        if (i != iSolv) dryFluid += F_w * zW[i];
    dry.F = dryFluid;
    dry.z.assign(n, 0.0);
    if (dryFluid > 0.0)
        for (std::size_t i = 0; i < n; ++i)
            dry.z[i] = (i == iSolv ? water_final : F_w * zW[i]) / dryFluid;
    //  EVERY crystal the feed carried leaves on the cake.  This copied the
    //  FIRST solid only, so a feed carrying two crystalline phases lost the
    //  second in silence (no corpus case carries two, so nothing moves).
    dry.s = sW;
    produced_.push_back(dry);

    ProcessStream ex;
    ex.name = "humidExhaust";  ex.T = T_out;  ex.P = P;  ex.vf = 1.0;
    ex.F = F_air + water_rem;
    ex.z.assign(n, 0.0);
    if (ex.F > 0.0)
        for (std::size_t i = 0; i < n; ++i)
            ex.z[i] = (yAir[i] * F_air + (i == iSolv ? water_rem : 0.0)) / ex.F;
    produced_.push_back(ex);

    kpis_.clear();
    kpis_["X_initial"]       = X_in;
    kpis_["X_final"]         = X_final;
    kpis_["moisture_pct_wb"] = 100.0 * X_final / (1.0 + X_final);
    kpis_["water_removed"]   = water_rem * MW_solv;                      // kg/s
    kpis_["drySolid_flow"]   = solid_mass + water_final * MW_solv;       // kg/s
    kpis_["exhaust_humidity"]= aw_out;
    kpis_["T_out"]           = T_out;
    kpis_["T_wetbulb"]       = T_floor;                                  // K, the floor
    kpis_["air_in_kmol_h"]   = F_air * 3600.0;

    if (limit == "energy")
    {
        std::ostringstream msg;
        msg << std::setprecision(4) << std::fixed
            << "the hot air cannot pay for evaporating all the free water:"
               " with the solid leaving at the gas's wet-bulb temperature ("
            << T_floor
            << " K, this model's floor) it evaporates "
            << (water_rem * MW_solv * 3600.0) << " kg/h of the "
            << (water_in * MW_solv * 3600.0) << " kg/h fed, so the solid"
               " leaves at X = " << X_final << " kg/kg with the exhaust at"
               " a_w = " << aw_out << ", below its cap.  Use hotter or more"
               " air.";
        if (AdvisoryLog::instance().add("drying", "warning", who, msg.str()))
            std::cout << "  [EvaporativeDryer] WARNING: " << msg.str() << "\n";
    }
    else if (limit == "saturation")
    {
        std::cout << "  [EvaporativeDryer] NOTE: air-capacity limited -- the exhaust"
                     " reached a_w = " << std::fixed << std::setprecision(2) << aw_max
                  << " at T_out = " << std::setprecision(1) << T_out << " K"
                  << " having carried " << (water_rem * MW_solv * 3600.0)
                  << " kg/h";
        if (heatBinds)
            std::cout << ", before the air ran out of heat (cooled to the"
                         " gas's wet bulb it could pay for "
                      << (water_pay * MW_solv * 3600.0) << " kg/h)";
        std::cout << "; residual free water stays on the cake (add more/drier"
                     " air to finish).\n";
    }

    if (verbosity >= 2)
        std::cout << "\n======================  Evaporative Dryer Result  ================\n"
                  << "  FREE-moisture drying (constant-rate; no sorption isotherm)\n"
                  << "  Hot air IN: T = " << std::fixed << std::setprecision(1) << T_air
                  << " K, " << (F_air*3600.0) << " kmol/h\n"
                  << "  X_in = " << std::setprecision(3) << X_in
                  << "  ->  X_final = " << X_final << " kg/kg  ("
                  << std::setprecision(2) << (100.0*X_final/(1.0+X_final)) << " wt% wet)"
                  << "   [" << limit << "-limited]\n"
                  << "  Water evaporated = " << std::scientific << std::setprecision(3)
                  << (water_rem*MW_solv) << " kg/s;  exhaust a_w = " << std::fixed
                  << std::setprecision(2) << aw_out << "\n"
                  << "  Adiabatic outlet T_out = " << std::setprecision(1) << T_out
                  << " K   (air cooled " << std::setprecision(1) << (T_air - T_out)
                  << " K -- NO external duty)\n"
                  << "==================================================================\n\n";
    return 0;
}

} // namespace Choupo
