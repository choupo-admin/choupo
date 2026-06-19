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

#include "GasSolidSplitter.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

int GasSolidSplitter::solve(const DictPtr& dict,
                            const ThermoPackage& thermo,
                            int verbosity)
{
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

    // ---- Specified split (the "hardware" here is a spec) ----------------
    auto oper = dict->subDict("operation");
    const scalar etaS = oper->lookupScalarOrDefault("solidsRecovery", 1.0);
    const scalar gC   = oper->lookupScalarOrDefault("gasCarryover", 0.0);
    if (etaS < 0.0 || etaS > 1.0)
        throw std::runtime_error("GasSolidSplitter: solidsRecovery must be in [0,1]");
    if (gC < 0.0 || gC > 1.0)
        throw std::runtime_error("GasSolidSplitter: gasCarryover must be in [0,1]");

    // ---- Solids in (optional) ------------------------------------------
    sVector sin(n, 0.0);
    ParticleSizeDistribution psd;
    scalar sMassTot = 0.0;
    if (dict->found("solids"))
    {
        auto sol = dict->subDict("solids");
        auto sf  = sol->subDict("solidMolarFlows");
        for (const auto& k : sf->keys()) sin[thermo.indexOf(k)] = sf->lookupScalar(k);
        if (sol->found("diameters"))
        {
            psd.diameter = sol->lookupList("diameters");
            psd.massFrac = sol->lookupList("massFractions");
        }
        for (std::size_t i = 0; i < n; ++i)
            if (sin[i] > 0.0) sMassTot += sin[i] * thermo.comp(i).MW();   // kg/s
    }

    // ---- Apply the split: solids by etaS, gas by gC --------------------
    // The PSD passes through UNCHANGED into both outlets (no classification).
    sVector sCap(n, 0.0), sEsc(n, 0.0);
    for (std::size_t i = 0; i < n; ++i)
    {
        sCap[i] = sin[i] * etaS;
        sEsc[i] = sin[i] * (1.0 - etaS);
    }

    produced_.clear();
    ProcessStream cg;  cg.name = "cleanGas";
    cg.F = F * (1.0 - gC); cg.T = T; cg.P = P; cg.z = y; cg.vf = 1.0;
    cg.s = sEsc; if (!psd.empty()) cg.psd = psd;
    produced_.push_back(cg);

    ProcessStream cs;  cs.name = "capturedSolids";
    cs.F = F * gC; cs.T = T; cs.P = P; cs.z = y; cs.vf = (gC > 0.0) ? 1.0 : 0.0;
    cs.s = sCap; if (!psd.empty()) cs.psd = psd;
    produced_.push_back(cs);

    // ---- KPIs ----------------------------------------------------------
    kpis_.clear();
    kpis_["solidsRecovery"]      = etaS;
    kpis_["gasCarryover"]        = gC;
    kpis_["solidsIn_mass"]       = sMassTot;                  // kg/s
    kpis_["solidsCaptured_mass"] = sMassTot * etaS;
    kpis_["solidsEscaped_mass"]  = sMassTot * (1.0 - etaS);
    kpis_["gasToCleanGas"]       = F * (1.0 - gC);            // kmol/s
    kpis_["gasToSolids"]         = F * gC;

    if (verbosity >= 2)
    {
        std::cout << "\n=====================  Gas-Solid Splitter  =======================\n"
                  << "  Specified split:  solidsRecovery = " << std::fixed
                  << std::setprecision(3) << etaS
                  << ",  gasCarryover = " << gC << "\n"
                  << "  Solids: " << std::scientific << std::setprecision(3) << sMassTot
                  << " kg/s in  ->  " << (sMassTot*etaS) << " captured, "
                  << (sMassTot*(1.0-etaS)) << " with the gas\n"
                  << "  (ideal spec'd separator --- PSD passes through unchanged)\n"
                  << "==================================================================\n\n";
    }
    return 0;
}

} // namespace Choupo
