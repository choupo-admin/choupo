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

#include "BagFilter.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

int BagFilter::solve(const DictPtr& dict,
                     const ThermoPackage& thermo,
                     int verbosity)
{
    constexpr scalar R = 8314.462;          // J/(kmol·K)
    const std::size_t n = thermo.n();

    // ---- Inlet gas ------------------------------------------------------
    auto feed = dict->subDict("feed");
    const scalar F = feed->lookupScalar("F", Dims::molarFlow);   // gas kmol/s
    const scalar T = feed->lookupScalar("T", Dims::temperature);
    const scalar P = feed->lookupScalar("P", Dims::pressure);
    auto comp = dict->subDict("composition");
    sVector y(n, 0.0);
    {
        for (const auto& k : comp->keys()) y[thermo.indexOf(k)] = comp->lookupScalar(k);
        scalar s = 0.0;
        for (auto v : y) s += v;
        if (s > 0.0) for (auto& v : y) v /= s;
    }

    // ---- Hardware / operation ------------------------------------------
    auto oper = dict->subDict("operation");
    const scalar area = oper->lookupScalar("filterArea", Dims::area);
    if (area <= 0.0) throw std::runtime_error("BagFilter: filterArea must be > 0");
    const scalar K1 = oper->lookupScalarOrDefault("K1", 1.0e9);          // 1/m
    const scalar K2 = oper->lookupScalarOrDefault("K2", 1.0e10);         // m/kg
    const scalar W  = oper->lookupScalarOrDefault("arealDustLoad", 0.5); // kg/m^2
    const scalar P0 = oper->lookupScalarOrDefault("penetration0", 0.02); // [-]
    const scalar dc = oper->lookupScalarOrDefault("dCharacteristic", 1.0e-6); // m

    // ---- Gas properties: density + viscosity ---------------------------
    scalar MWg = 0.0;
    for (std::size_t i = 0; i < n; ++i) MWg += y[i] * thermo.comp(i).MW();   // kg/kmol
    const scalar rho_g = P * MWg / (R * T);                                  // kg/m^3
    if (!thermo.hasTransport())
        throw std::runtime_error("BagFilter: needs a gas viscosity --- add "
            "`transport { viscosity { model Chung; } }` to the thermoPackage.");
    const scalar mu = thermo.viscosityGas(T, y);                            // Pa·s

    // Face velocity (air-to-cloth ratio) + Darcy pressure drop -----------
    const scalar Q  = F * R * T / P;            // volumetric gas flow [m^3/s]
    const scalar V  = Q / area;                 // face velocity [m/s]
    const scalar dP = mu * V * (K1 + K2 * W);   // [Pa]

    // ---- No solids in the feed: pass the gas through clean --------------
    if (!dict->found("solids"))
    {
        produced_.clear();
        ProcessStream cg;  cg.name = "cleanGas";
        cg.F = F; cg.T = T; cg.P = P; cg.z = y; cg.vf = 1.0;
        produced_.push_back(cg);
        ProcessStream cs;  cs.name = "capturedSolids";
        cs.F = 0.0; cs.T = T; cs.P = P; cs.z.assign(n, 0.0); cs.vf = 0.0;
        produced_.push_back(cs);
        kpis_.clear();
        kpis_["efficiency"] = 0.0; kpis_["dP_filter"] = dP;
        kpis_["faceVelocity"] = V; kpis_["solidsIn_mass"] = 0.0;
        if (verbosity >= 2)
            std::cout << "\n[BagFilter] feed carries no solids --- gas passes through clean.\n\n";
        return 0;
    }

    // ---- Inlet solids + PSD --------------------------------------------
    auto sol = dict->subDict("solids");
    sVector sin(n, 0.0);
    {
        auto sf = sol->subDict("solidMolarFlows");
        for (const auto& k : sf->keys()) sin[thermo.indexOf(k)] = sf->lookupScalar(k);
    }
    std::vector<scalar> d  = sol->lookupList("diameters");      // m
    std::vector<scalar> mf = sol->lookupList("massFractions");
    if (d.empty() || d.size() != mf.size())
        throw std::runtime_error("BagFilter: PSD diameters / massFractions "
            "missing or mismatched.");
    { scalar s = 0.0; for (auto v : mf) s += v; if (s > 0.0) for (auto& v : mf) v /= s; }

    scalar sMassTot = 0.0;
    for (std::size_t i = 0; i < n; ++i)
        if (sin[i] > 0.0) sMassTot += sin[i] * thermo.comp(i).MW();   // kg/s

    // ---- Grade efficiency per bin: eta(d) = 1 - P0 exp(-d/d_c) ----------
    const int nb = static_cast<int>(d.size());
    std::vector<scalar> eta(nb, 0.0);
    scalar etaGlobal = 0.0, sumCap = 0.0, sumEsc = 0.0;
    for (int k = 0; k < nb; ++k)
    {
        eta[k] = 1.0 - P0 * std::exp(-d[k] / dc);
        if (eta[k] < 0.0) eta[k] = 0.0;
        if (eta[k] > 1.0) eta[k] = 1.0;
        etaGlobal += eta[k] * mf[k];
        sumCap    += eta[k] * mf[k];
        sumEsc    += (1.0 - eta[k]) * mf[k];
    }

    // ---- Split each solid component by the overall mass efficiency ------
    sVector sCap(n, 0.0), sEsc(n, 0.0);
    for (std::size_t i = 0; i < n; ++i)
    {
        sCap[i] = sin[i] * etaGlobal;
        sEsc[i] = sin[i] * (1.0 - etaGlobal);
    }
    ParticleSizeDistribution psdCap, psdEsc;
    for (int k = 0; k < nb; ++k)
    {
        if (sumCap > 0.0)
        { psdCap.diameter.push_back(d[k]); psdCap.massFrac.push_back(eta[k]*mf[k]/sumCap); }
        if (sumEsc > 0.0)
        { psdEsc.diameter.push_back(d[k]); psdEsc.massFrac.push_back((1.0-eta[k])*mf[k]/sumEsc); }
    }

    // ---- Outlet streams ------------------------------------------------
    produced_.clear();
    ProcessStream cg;  cg.name = "cleanGas";
    cg.F = F; cg.T = T; cg.P = P; cg.z = y; cg.vf = 1.0;
    cg.s = sEsc; cg.psd = psdEsc;            // the few fines that penetrate
    produced_.push_back(cg);

    ProcessStream cs;  cs.name = "capturedSolids";
    cs.F = 0.0; cs.T = T; cs.P = P; cs.z.assign(n, 0.0); cs.vf = 0.0;
    cs.s = sCap; cs.psd = psdCap;            // the cake
    produced_.push_back(cs);

    // ---- KPIs ----------------------------------------------------------
    kpis_.clear();
    kpis_["filterArea"]      = area;          // m^2
    kpis_["efficiency"]      = etaGlobal;     // mass collection efficiency
    kpis_["penetration"]     = 1.0 - etaGlobal;
    kpis_["dP_filter"]       = dP;            // Pa
    kpis_["faceVelocity"]    = V;             // m/s (air-to-cloth ratio)
    kpis_["airToCloth_m_min"]= V * 60.0;      // m/min (the trade convention)
    kpis_["arealDustLoad"]   = W;             // kg/m^2
    kpis_["mu_gas"]          = mu;
    kpis_["rho_gas"]         = rho_g;
    kpis_["solidsIn_mass"]   = sMassTot;                      // kg/s
    kpis_["solidsCaptured_mass"] = sMassTot * etaGlobal;
    kpis_["solidsEscaped_mass"]  = sMassTot * (1.0 - etaGlobal);

    // ---- Profile: grade-efficiency curve + the three PSDs --------------
    UnitProfile prof;
    prof.xAxis = "diameter_micron";
    std::vector<scalar> dax, etac, mfin, mfClean, mfCap;
    for (int k = 0; k < nb; ++k)
    {
        dax.push_back(d[k]*1.0e6);
        etac.push_back(eta[k]);
        mfin.push_back(mf[k]);
        mfClean.push_back(sumEsc > 0.0 ? (1.0-eta[k])*mf[k]/sumEsc : 0.0);
        mfCap.push_back(sumCap > 0.0 ? eta[k]*mf[k]/sumCap : 0.0);
    }
    prof.columns["diameter_micron"]   = dax;
    prof.columns["grade_efficiency"]  = etac;
    prof.columns["massFrac_in"]       = mfin;
    prof.columns["massFrac_cleanGas"] = mfClean;
    prof.columns["massFrac_captured"] = mfCap;
    profile_ = prof;

    // ---- Report --------------------------------------------------------
    if (verbosity >= 2)
    {
        std::cout << "\n=========================  Bag Filter  ===========================\n"
                  << "  Filter area A   = " << std::fixed << std::setprecision(1) << area
                  << " m^2\n"
                  << "  Gas: " << std::scientific << std::setprecision(3) << Q
                  << " m^3/s,  face velocity V = " << std::fixed << std::setprecision(4) << V
                  << " m/s  (" << std::setprecision(2) << (V*60.0) << " m/min air-to-cloth)\n"
                  << "  Pressure drop dP = " << std::setprecision(0) << dP
                  << " Pa   (cloth " << std::setprecision(0) << (mu * V * K1)
                  << " + cake " << (mu * V * K2 * W) << " Pa; W = "
                  << std::setprecision(2) << W << " kg/m^2)\n"
                  << "  Darcy constants:  K1 = " << std::scientific << std::setprecision(1)
                  << K1 << " 1/m, K2 = " << K2 << " m/kg"
                  << (oper->found("K1") || oper->found("K2") ? "  (case-declared)" : "  (library defaults -- override in operation{})")
                  << std::fixed << "\n"
                  << "  Grade law:        eta(d) = 1 - P0 exp(-d/dc),  P0 = "
                  << std::setprecision(3) << P0 << ", dc = " << std::scientific
                  << std::setprecision(1) << dc << " m"
                  << (oper->found("penetration0") || oper->found("dCharacteristic") ? "  (case-declared)" : "  (library defaults)")
                  << std::fixed << "\n"
                  << "  Overall collection efficiency = " << std::setprecision(3)
                  << (100.0*etaGlobal) << " %   (penetration "
                  << std::scientific << std::setprecision(2) << (1.0-etaGlobal) << ")\n"
                  << std::fixed
                  << "  Solids: " << std::scientific << std::setprecision(3) << sMassTot
                  << " kg/s in,  " << (sMassTot*etaGlobal) << " kg/s captured\n"
                  << "==================================================================\n\n";
    }
    return 0;
}

} // namespace Choupo
