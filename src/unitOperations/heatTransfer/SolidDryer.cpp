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

    // ---- Wet solid feed (single input) ---------------------------------
    auto feed = dict->subDict("feed");
    const scalar F = feed->lookupScalar("F", Dims::molarFlow);   // fluid (the bound water)
    const scalar P = feed->lookupScalar("P", Dims::pressure);
    auto comp = dict->subDict("composition");
    sVector z(n, 0.0);
    {
        scalar s = 0.0;
        for (const auto& k : comp->keys()) z[thermo.indexOf(k)] = comp->lookupScalar(k);
        for (auto v : z) s += v;
        if (s > 0.0) for (auto& v : z) v /= s;
    }
    sVector sin(n, 0.0);
    if (dict->found("solids"))
    {
        auto sf = dict->subDict("solids")->subDict("solidMolarFlows");
        for (const auto& k : sf->keys()) sin[thermo.indexOf(k)] = sf->lookupScalar(k);
    }

    // ---- Operation: drying-air condition (hardware) --------------------
    auto oper = dict->subDict("operation");
    const scalar airT = oper->lookupScalar("airTemperature", Dims::temperature);
    const scalar RH   = oper->lookupScalarOrDefault("relativeHumidity", 0.1);  // a_w of the air

    // ---- Identify the wet SOLID (carries the sorption isotherm) and the
    //      SOLVENT (the volatile bound liquid, e.g. water) ---------------
    std::size_t iSolid = n, iSolv = n;
    for (std::size_t i = 0; i < n; ++i)
        if (sin[i] > 0.0 && thermo.comp(i).hasSorption()) iSolid = i;
    for (std::size_t i = 0; i < n; ++i)
        if (z[i] > 0.0 && thermo.comp(i).hasVaporPressure()) iSolv = i;
    if (iSolid == n)
        throw std::runtime_error("SolidDryer: feed has no wet solid with a"
            " `sorption {}` isotherm to dry.");
    if (iSolv == n)
        throw std::runtime_error("SolidDryer: feed carries no volatile"
            " moisture (need a solvent, e.g. water, in the fluid).");

    const Component& sol  = thermo.comp(iSolid);
    const Component& solv = thermo.comp(iSolv);
    const scalar MW_sol  = sol.MW();
    const scalar MW_solv = solv.MW();

    // ---- Dry toward the equilibrium moisture at the air condition ------
    const scalar solid_mol  = sin[iSolid];
    const scalar solid_mass = solid_mol * MW_sol;                       // kg/s
    const scalar water_in   = F * z[iSolv];                             // kmol/s bound water
    const scalar X_in = (solid_mass > 0.0) ? water_in * MW_solv / solid_mass : 0.0;

    // GAB equilibrium moisture at a_w = relative humidity of the air.
    const scalar aw = std::min(0.99, std::max(0.0, RH));
    const scalar Ka = sol.sorpK() * aw;
    scalar X_eq = 0.0;
    if (Ka < 1.0 && sol.sorpXm() > 0.0)
        X_eq = sol.sorpXm() * sol.sorpC() * Ka / ((1.0 - Ka) * (1.0 - Ka + sol.sorpC() * Ka));

    const scalar X_final     = std::min(X_in, X_eq);                    // only dries, never wets
    const scalar water_final = X_final * solid_mass / MW_solv;          // kmol/s kept in the powder
    const scalar water_rem   = std::max(0.0, water_in - water_final);   // kmol/s evaporated

    // ---- Outlet streams ------------------------------------------------
    produced_.clear();
    ProcessStream dry;
    dry.name = "drySolid";
    dry.T = airT; dry.P = P; dry.vf = 0.0;
    dry.F = water_final;
    dry.z.assign(n, 0.0);  if (water_final > 0.0) dry.z[iSolv] = 1.0;
    dry.s.assign(n, 0.0);  dry.s[iSolid] = solid_mol;
    produced_.push_back(dry);

    ProcessStream vap;
    vap.name = "vapour";
    vap.T = airT; vap.P = P; vap.vf = 1.0;
    vap.F = water_rem;
    vap.z.assign(n, 0.0);  if (water_rem > 0.0) vap.z[iSolv] = 1.0;
    produced_.push_back(vap);

    // ---- Duty (RESULT): latent heat to evaporate the removed water -----
    const scalar Q = water_rem * 1000.0 * solv.Hvap_latent(airT);       // W

    kpis_.clear();
    kpis_["X_initial"]      = X_in;            // kg water / kg dry solid
    kpis_["X_equilibrium"]  = X_eq;
    kpis_["X_final"]        = X_final;
    kpis_["moisture_pct_wb"]= 100.0 * X_final / (1.0 + X_final);   // wet-basis %
    kpis_["water_removed"]  = water_rem * MW_solv;   // kg/s
    kpis_["drySolid_flow"]  = solid_mass + water_final * MW_solv;  // kg/s (solid + residual)
    kpis_["duty"]           = Q;               // W
    kpis_["water_activity"] = aw;

    if (verbosity >= 2)
    {
        std::cout << "\n=========================  Solid Dryer Result  ===================\n"
                  << "  Drying air: T = " << std::fixed << std::setprecision(1) << airT
                  << " K (" << (airT - 273.15) << " °C),  RH = " << std::setprecision(2) << aw << "\n"
                  << "  X_in = " << std::setprecision(3) << X_in << "  ->  X_eq = " << X_eq
                  << "  ->  X_final = " << X_final << " kg/kg  ("
                  << std::setprecision(2) << (100.0 * X_final / (1.0 + X_final)) << " wt% wet)\n"
                  << "  Water removed = " << std::scientific << std::setprecision(3)
                  << (water_rem * MW_solv) << " kg/s   dry solid = "
                  << (solid_mass + water_final * MW_solv) << " kg/s\n" << std::fixed
                  << "  Duty Q = " << std::scientific << std::setprecision(3) << Q << " W ("
                  << std::fixed << std::setprecision(1) << (Q / 1000.0) << " kW)\n"
                  << "==================================================================\n\n";
    }
    return 0;
}

} // namespace Choupo
