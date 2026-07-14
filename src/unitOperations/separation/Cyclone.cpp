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

#include "Cyclone.H"
#include "cycloneModel/CycloneModel.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

int Cyclone::solve(const DictPtr& dict,
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

    // ---- Inlet solids + PSD --------------------------------------------
    if (!dict->found("solids"))
    {
        // No solids in the feed (e.g. a dryer exhaust carrying no entrained
        // fines): there is nothing to separate --- pass the gas through clean
        // rather than fail.  (A cyclone fed dust-laden gas takes the normal
        // path below.)
        produced_.clear();
        ProcessStream cg;  cg.name = "cleanGas";
        cg.F = F; cg.T = T; cg.P = P; cg.z = y; cg.vf = 1.0;
        produced_.push_back(cg);
        ProcessStream cs;  cs.name = "capturedSolids";
        cs.F = 0.0; cs.T = T; cs.P = P; cs.z.assign(n, 0.0); cs.vf = 0.0;
        produced_.push_back(cs);
        kpis_["efficiency"]    = 0.0;
        kpis_["solidsIn_mass"] = 0.0;
        if (verbosity >= 2)
            std::cout << "\n[Cyclone] feed carries no solids --- gas passes through clean.\n\n";
        return 0;
    }
    auto sol = dict->subDict("solids");
    sVector sin(n, 0.0);
    {
        auto sf = sol->subDict("solidMolarFlows");
        for (const auto& k : sf->keys()) sin[thermo.indexOf(k)] = sf->lookupScalar(k);
    }
    std::vector<scalar> d  = sol->lookupList("diameters");      // m
    std::vector<scalar> mf = sol->lookupList("massFractions");
    if (d.empty() || d.size() != mf.size())
        throw std::runtime_error("Cyclone: PSD diameters / massFractions "
            "missing or mismatched.");
    { scalar s = 0.0; for (auto v : mf) s += v; if (s > 0.0) for (auto& v : mf) v /= s; }

    // ---- Operation: HARDWARE = body diameter (+ effective turns) --------
    auto oper = dict->subDict("operation");
    const scalar Dc  = oper->lookupScalar("bodyDiameter", Dims::length);
    const scalar Ne  = oper->lookupScalarOrDefault("numberOfTurns", 5.0);
    if (Dc <= 0.0) throw std::runtime_error("Cyclone: bodyDiameter must be > 0");

    // ---- Gas properties: density + viscosity ---------------------------
    scalar MWg = 0.0;
    for (std::size_t i = 0; i < n; ++i) MWg += y[i] * thermo.comp(i).MW();   // kg/kmol
    const scalar rho_g = P * MWg / (R * T);                                  // kg/m^3
    if (!thermo.hasTransport())
        throw std::runtime_error("Cyclone: needs a gas viscosity --- add "
            "`transport { viscosity { model Chung; } }` to the thermoPackage.");
    const scalar mu = thermo.viscosityGas(T, y);                             // Pa·s

    // ---- Particle density (mass-weighted over the solid components) -----
    scalar rho_p = 0.0, sMassTot = 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        if (sin[i] <= 0.0) continue;
        const scalar mi = sin[i] * thermo.comp(i).MW();      // kg/s of solid i
        rho_p += mi * (thermo.comp(i).rho_p() > 0.0 ? thermo.comp(i).rho_p() : 0.0);
        sMassTot += mi;
    }
    rho_p = (sMassTot > 0.0) ? rho_p / sMassTot : 0.0;
    if (rho_p <= 0.0)
        throw std::runtime_error("Cyclone: the solid has no particle density"
            " --- add `solid { rho_p <kg/m^3>; }` to its component.dat.");

    // ---- Select the collection sub-model (Lapple / LeithLicht /...) ---
    //  The variant lives in the `model` slot RIGHT AFTER `type` (project-
    //  wide convention); its parameters stay in `operation` (they are
    //  values).  Falls back to a `model` key inside operation for old cases.
    const std::string modelName = dict->lookupWordOrDefault(
        "model", oper->lookupWordOrDefault("model", "Lapple"));
    auto model = CycloneModel::New(modelName);
    model->readParameters(oper);

    // ---- Model context + cut diameter ----------------------------------
    const scalar Q   = F * R * T / P;          // volumetric gas flow [m^3/s]
    const scalar A   = Dc * Dc / 8.0;          // inlet area (Lapple standard)
    const scalar vi  = Q / A;                  // inlet velocity [m/s]
    const scalar gasMass = F * MWg;            // kg/s of gas
    CycloneContext ctx;
    ctx.Dc = Dc; ctx.Ne = Ne; ctx.Q = Q; ctx.vi = vi;
    ctx.mu = mu; ctx.rho_g = rho_g; ctx.rho_p = rho_p; ctx.T = T;
    ctx.loading = (gasMass > 0.0) ? sMassTot / gasMass : 0.0;   // kg solid/kg gas
    // Full standard-cyclone geometry for the flow-pattern models (Iozia-Leith);
    // each dimension defaults to its Stairmand HE ratio x Dc (a Dc-only case runs).
    auto geom = oper->found("geometry") ? oper->subDict("geometry") : oper;
    ctx.a  = geom->lookupScalarOrDefault("inletHeight",    0.5   * Dc, Dims::length);
    ctx.b  = geom->lookupScalarOrDefault("inletWidth",     0.2   * Dc, Dims::length);
    ctx.De = geom->lookupScalarOrDefault("exitDiameter",   0.5   * Dc, Dims::length);
    ctx.S  = geom->lookupScalarOrDefault("vortexLength",   0.5   * Dc, Dims::length);
    ctx.h  = geom->lookupScalarOrDefault("cylinderHeight", 1.5   * Dc, Dims::length);
    ctx.H  = geom->lookupScalarOrDefault("totalHeight",    4.0   * Dc, Dims::length);
    ctx.B  = geom->lookupScalarOrDefault("dustOutlet",     0.375 * Dc, Dims::length);
    const scalar d50 = model->cutDiameter(ctx);
    const scalar dP  = model->pressureDrop(ctx);

    // ---- Grade efficiency per bin (from the chosen model) + split ------
    const int nb = static_cast<int>(d.size());
    std::vector<scalar> eta(nb, 0.0);
    scalar etaGlobal = 0.0, sumCap = 0.0, sumEsc = 0.0;
    for (int k = 0; k < nb; ++k)
    {
        eta[k] = model->gradeEfficiency(d[k], ctx);
        etaGlobal += eta[k] * mf[k];
        sumCap += eta[k] * mf[k];
        sumEsc += (1.0 - eta[k]) * mf[k];
    }

    // Each solid component is split by the same overall mass efficiency
    // (they share the PSD); the OUTLET PSDs differ (coarse captured, fine
    // escaping).
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
    cg.s = sEsc; cg.psd = psdEsc;            // fines escape with the gas
    produced_.push_back(cg);

    ProcessStream cs;  cs.name = "capturedSolids";
    cs.F = 0.0; cs.T = T; cs.P = P; cs.z.assign(n, 0.0); cs.vf = 0.0;
    cs.s = sCap; cs.psd = psdCap;            // coarse captured
    produced_.push_back(cs);

    // ---- KPIs ----------------------------------------------------------
    const scalar massIn  = sMassTot;
    kpis_.clear();
    kpis_["bodyDiameter"]   = Dc;
    kpis_["Q_gas"]          = Q;              // m^3/s  volumetric gas flow (sizing parameter)
    kpis_["d50"]            = d50;            // m
    kpis_["d50_micron"]     = d50 * 1.0e6;
    kpis_["efficiency"]     = etaGlobal;      // mass collection efficiency
    kpis_["dP_cyclone"]     = dP;             // Pa
    kpis_["eulerNumber"]    = (rho_g > 0.0 && vi > 0.0)
                              ? dP / (0.5 * rho_g * vi * vi) : 0.0;
    kpis_["loading"]        = ctx.loading;    // kg solid / kg gas
    kpis_["inletVelocity"]  = vi;
    kpis_["numberOfTurns"]  = Ne;
    kpis_["rho_gas"]        = rho_g;
    kpis_["mu_gas"]         = mu;
    kpis_["rho_particle"]   = rho_p;
    kpis_["solidsIn_mass"]  = massIn;                         // kg/s
    kpis_["solidsCaptured_mass"] = massIn * etaGlobal;
    kpis_["solidsEscaped_mass"]  = massIn * (1.0 - etaGlobal);

    // ---- Profile: grade-efficiency curve η(d) + the three PSDs ---------
    //  massFrac_in      : feed particle-size distribution
    //  massFrac_cleanGas: fines that escape with the gas (sub-d50 tail)
    //  massFrac_captured: coarse fraction collected
    //  -> the GUI plots these three to SHOW the size classification.
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
        std::cout << "\n=================  Cyclone  (model: " << modelName << ")"
                  << std::string(std::max(0, 22 - (int)modelName.size()), '=') << "\n"
                  << "  Body diameter D_c = " << std::fixed << std::setprecision(3) << Dc
                  << " m,  N_e = " << std::setprecision(1) << Ne << " turns\n"
                  << "  Gas: " << std::scientific << std::setprecision(3) << Q
                  << " m^3/s,  v_in = " << std::fixed << std::setprecision(2) << vi
                  << " m/s,  rho_g = " << std::setprecision(3) << rho_g
                  << " kg/m^3,  mu = " << std::scientific << std::setprecision(3) << mu << " Pa.s\n"
                  << "  Particle rho_p = " << std::fixed << std::setprecision(0) << rho_p
                  << " kg/m^3\n"
                  << "  Cut diameter d50 = " << std::setprecision(2) << (d50*1.0e6)
                  << " micron\n"
                  << "  Pressure drop dP = " << std::setprecision(0) << dP
                  << " Pa  (Eu = " << std::setprecision(1)
                  << (rho_g > 0 && vi > 0 ? dP/(0.5*rho_g*vi*vi) : 0.0)
                  << " velocity heads; " << model->pressureDropName() << ")"
                  << ",  inlet loading = " << std::scientific << std::setprecision(3)
                  << ctx.loading << " kg/kg\n" << std::fixed
                  << "  ------  grade efficiency by size  ------\n";
        for (int k = 0; k < nb; ++k)
            std::cout << "    d = " << std::setw(6) << std::setprecision(2) << (d[k]*1.0e6)
                      << " um   eta = " << std::setprecision(3) << eta[k]
                      << "   (massFrac " << std::setprecision(3) << mf[k] << ")\n";
        std::cout << "  Overall collection efficiency = " << std::setprecision(1)
                  << (100.0*etaGlobal) << " %  ("
                  << std::scientific << std::setprecision(3) << (massIn*etaGlobal)
                  << " of " << massIn << " kg/s captured)\n"
                  << "==================================================================\n\n";
    }
    return 0;
}

} // namespace Choupo
