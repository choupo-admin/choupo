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

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>

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
    const scalar Tmid = 0.5 * (T_w + T_air);
    scalar cp_air = 0.0;                                                 // J/(mol.K)
    for (std::size_t i = 0; i < n; ++i)
        if (yAir[i] > 0.0 && thermo.comp(i).hasCpIdealGas())
            cp_air += yAir[i] * thermo.comp(i).cpIdealGas().Cp(T_air);
    const scalar cpSolid = sol.hasCpSolid()   ? sol.cpSolid().Cp(Tmid) : 0.0;
    const scalar cpLiq   = solv.hasCpLiquid() ? solv.cpLiquid().Cp(Tmid) : 75.4;

    // Adiabatic outlet T for a GIVEN removed-water rate (air cools to supply the
    // latent + sensible load).  f(T)=supply-demand, bracketed on [T_w, T_air].
    auto Tout_for = [&](scalar water_rem) -> scalar
    {
        auto fEner = [&](scalar Tout) -> scalar
        {
            const scalar supply = F_air * 1000.0 * cp_air * (T_air - Tout);
            const scalar demand = (solid_mol * cpSolid + water_in * cpLiq) * 1000.0 * (Tout - T_w)
                                + water_rem * 1000.0 * solv.Hvap_latent(Tout);
            return supply - demand;
        };
        if (fEner(T_w) < 0.0) return T_w;                    // energy floor
        scalar a = T_w, b = T_air;
        for (int it = 0; it < 80 && (b - a) > 1.0e-4; ++it)
        { const scalar m = 0.5*(a+b); if (fEner(m) >= 0.0) a = m; else b = m; }
        return 0.5*(a+b);
    };

    // Exhaust water activity if 'water_rem' is evaporated into the air at T_out.
    auto aw_exhaust = [&](scalar water_rem, scalar Tout) -> scalar
    {
        const scalar F_ex = F_air + water_rem;
        const scalar y_w  = (F_ex > 0.0)
            ? (yAir[iSolv] * F_air + water_rem) / F_ex : 0.0;
        const scalar Psat = solv.vp().Psat_Pa(Tout);
        return (Psat > 0.0) ? y_w * P / Psat : 1.0;
    };

    // Solve for the removed water: the FIRST limit that binds.  Try removing ALL
    // the free water; if that would over-saturate the exhaust, bisect down to
    // aw_max.  The energy floor is inside Tout_for.
    scalar water_rem;
    std::string limit;
    const scalar Tout_full = Tout_for(water_in);
    const bool energyLimited = (Tout_full <= T_w + 1.0e-6) && (water_in > 0.0);
    if (aw_exhaust(water_in, Tout_full) <= aw_max)
    {
        water_rem = water_in;                                // all free water leaves
        limit = energyLimited ? "energy" : "complete";
    }
    else
    {
        scalar lo = 0.0, hi = water_in;                      // aw increases with water_rem
        for (int it = 0; it < 80 && (hi - lo) > 1.0e-12; ++it)
        {
            const scalar m = 0.5*(lo+hi);
            if (aw_exhaust(m, Tout_for(m)) >= aw_max) hi = m; else lo = m;
        }
        water_rem = 0.5*(lo+hi);
        limit = "saturation";
    }
    if (energyLimited && limit != "energy")
        limit = "energy";                                    // the floor dominates

    const scalar T_out       = Tout_for(water_rem);
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
    dry.s.assign(n, 0.0);  dry.s[iSolid] = solid_mol;
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
    kpis_["air_in_kmol_h"]   = F_air * 3600.0;

    if (limit == "energy")
        std::cout << "  [EvaporativeDryer] WARNING: the hot air cannot supply the"
                     " drying heat -- T_out floored at the feed T; use hotter or"
                     " more air.\n";
    else if (limit == "saturation")
        std::cout << "  [EvaporativeDryer] NOTE: air-capacity limited -- the exhaust"
                     " reached a_w = " << std::fixed << std::setprecision(2) << aw_max
                  << "; residual free water stays on the cake (add more/drier air"
                     " to finish).\n";

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
