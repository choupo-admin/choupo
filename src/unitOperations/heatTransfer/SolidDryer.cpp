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

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>

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
    const scalar Ka = sol.sorpK() * aw;
    scalar X_eq = 0.0;
    if (Ka < 1.0 && sol.sorpXm() > 0.0)
        X_eq = sol.sorpXm() * sol.sorpC() * Ka / ((1.0 - Ka) * (1.0 - Ka + sol.sorpC() * Ka));
    const scalar X_final     = std::min(X_in, X_eq);
    const scalar water_final = X_final * solid_mass / MW_solv;          // kept in the powder
    const scalar water_rem   = std::max(0.0, water_in - water_final);   // evaporated into the air

    // ---- Adiabatic energy balance -> outlet T_out (no duty) -----------
    //   Hot air cools (T_air -> T_out); its sensible heat heats the solid +
    //   residual water from T_w to T_out and evaporates the removed water:
    //     F_air*cp_air*(T_air-T_out)
    //        = [solid*cpSolid + water_in*cpLiq]*(T_out-T_w) + water_rem*dHvap
    //   Solved by bisection on T_out in [T_w, T_air].
    scalar cp_air = 0.0;                                                // J/(mol.K)
    for (std::size_t i = 0; i < n; ++i)
        if (yAir[i] > 0.0 && thermo.comp(i).hasCpIdealGas())
            cp_air += yAir[i] * thermo.comp(i).cpIdealGas().Cp(T_air);
    const scalar cpSolid = sol.hasCpSolid()  ? sol.cpSolid().Cp(0.5*(T_w+T_air)) : 0.0;
    const scalar cpLiq   = solv.hasCpLiquid() ? solv.cpLiquid().Cp(0.5*(T_w+T_air)) : 75.4;
    auto fEner = [&](scalar Tout) -> scalar
    {
        const scalar supply = F_air * 1000.0 * cp_air * (T_air - Tout);          // W
        const scalar demand = (solid_mol * cpSolid + water_in * cpLiq) * 1000.0 * (Tout - T_w)
                            + water_rem * 1000.0 * solv.Hvap_latent(Tout);       // W
        return supply - demand;
    };
    scalar T_out;
    const bool energyLimited = fEner(T_w) < 0.0;     // air cannot even supply the duty at T_w
    if (energyLimited) T_out = T_w;                  // honest floor (warned below)
    else { scalar a = T_w, b = T_air;                // f(T_w)>=0, f(T_air)<0 -> bracketed
           for (int it = 0; it < 80 && (b - a) > 1.0e-4; ++it)
           { const scalar m = 0.5*(a+b); if (fEner(m) >= 0.0) a = m; else b = m; }
           T_out = 0.5*(a+b); }

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
    kpis_["air_in_kmol_h"]  = F_air * 3600.0;

    if (energyLimited)
        std::cout << "  [SolidDryer] WARNING: the hot air cannot supply the drying"
                     " heat -- T_out floored at the feed T; use hotter or more air.\n";
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
                  << "==================================================================\n\n";
    return 0;
}

} // namespace Choupo
