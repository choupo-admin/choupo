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

#include "GibbsMapOp.H"
#include "unitOperations/reactor/gibbsMethod/ElementPotential.H"

#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace Choupo {

int GibbsMapOp::run(const DictPtr& dict, const ThermoPackage& thermo, int verbosity)
{
    // ---- elements + species (the gibbsReactor's own glass-box shape) -------
    const auto elems = dict->lookupWordList("elements");
    const std::size_t M = elems.size();

    GibbsProblem prob;
    prob.thermo = &thermo;
    std::vector<std::string> spNames;
    for (const auto& s : dict->lookupDictList("species"))
    {
        const std::string nm = s->lookupWord("name");
        std::size_t idx = thermo.n();
        for (std::size_t i = 0; i < thermo.n(); ++i)
            if (thermo.comp(i).name() == nm) { idx = i; break; }
        if (idx == thermo.n())
            throw std::runtime_error("gibbsMap: species '" + nm
                + "' is not in the thermoPackage component list");
        auto at = s->lookupList("atoms");
        if (at.size() != M)
            throw std::runtime_error("gibbsMap: species '" + nm + "' atoms list"
                " length != elements length");
        prob.compIdx.push_back(idx);
        prob.condensable.push_back(thermo.comp(idx).hasVaporPressure());
        spNames.push_back(nm);
        if (prob.A.empty()) prob.A.assign(M, {});
        for (std::size_t j = 0; j < M; ++j) prob.A[j].push_back(at[j]);
    }
    const std::size_t N = prob.compIdx.size();
    if (N <= M)
        throw std::runtime_error("gibbsMap: need more species than elements");

    // ---- feed (moles; basis-free) -> element totals -------------------------
    auto feed = dict->subDict("feed");
    prob.nIn.assign(N, 0.0);
    for (std::size_t i = 0; i < N; ++i)
        prob.nIn[i] = feed->lookupScalarOrDefault(spNames[i], 0.0);
    prob.b.assign(M, 0.0);
    for (std::size_t j = 0; j < M; ++j)
        for (std::size_t i = 0; i < N; ++i)
            prob.b[j] += prob.A[j][i] * prob.nIn[i];
    for (std::size_t j = 0; j < M; ++j)
        if (prob.b[j] <= 0.0)
            throw std::runtime_error("gibbsMap: element '" + elems[j]
                + "' has zero feed total");

    // ---- grids ---------------------------------------------------------------
    auto Tg = dict->subDict("Tgrid");
    auto Pg = dict->subDict("Pgrid");
    const scalar T0 = Tg->lookupScalar("from"), T1 = Tg->lookupScalar("to");
    const int    nT = static_cast<int>(Tg->lookupScalarOrDefault("n", 25));
    const scalar P0 = Pg->lookupScalar("from"), P1 = Pg->lookupScalar("to");
    const int    nP = static_cast<int>(Pg->lookupScalarOrDefault("n", 25));
    const bool   logP = Pg->found("log")
                      && Pg->lookupWordOrDefault("log", "false") == "true";

    prob.dTapproach = dict->lookupScalarOrDefault("temperatureApproach", 0.0);
    const int dTtag = static_cast<int>(std::lround(prob.dTapproach));
    if (prob.dTapproach != 0.0 && verbosity >= 1)
        std::cout << "  [gibbsMap] temperatureApproach = " << prob.dTapproach
                  << " K -- REACTION equilibrium at T+dT, physical state at T."
                     "  Empirical, calibrated, GLOBAL (cannot resolve"
                     " per-reaction approaches); 0 = true equilibrium.\n";

    // ---- metric ---------------------------------------------------------------
    auto met = dict->subDict("metric");
    const std::string mtype = met->lookupWord("type");
    std::size_t mSpecies = N;      // local index into the species list
    std::size_t mElem = M;
    if (mtype == "moleFraction" || mtype == "elementYield")
    {
        const std::string target = met->lookupWord(
            mtype == "moleFraction" ? "species" : "product");
        for (std::size_t i = 0; i < N; ++i)
            if (spNames[i] == target) mSpecies = i;
        if (mSpecies == N)
            throw std::runtime_error("gibbsMap: metric target '" + target
                + "' is not in the species list");
        if (mtype == "elementYield")
        {
            const std::string e = met->lookupWord("element");
            for (std::size_t j = 0; j < M; ++j) if (elems[j] == e) mElem = j;
            if (mElem == M)
                throw std::runtime_error("gibbsMap: metric element '" + e
                    + "' is not in the elements list");
            if (prob.A[mElem][mSpecies] <= 0.0)
                throw std::runtime_error("gibbsMap: product carries none of"
                    " the key element -- yield would be identically 0");
        }
    }
    else
        throw std::runtime_error("gibbsMap: metric type must be moleFraction"
            " or elementYield (banned: species conversion for produced"
            " species, extents -- see the forum record)");

    auto metricOf = [&](const GibbsEquilibrium& eq) -> scalar
    {
        if (mtype == "moleFraction")
            return eq.nGas[mSpecies] / eq.Ntotal_gas;
        // elementYield: atoms of E in the product / E fed
        return prob.A[mElem][mSpecies] * eq.nGas[mSpecies] / prob.b[mElem];
    };

    // ---- the sweep -------------------------------------------------------------
    ElementPotential solver;
    std::ofstream csv(dict->subDict("output")->lookupWord("file"));
    if (!csv.is_open()) throw std::runtime_error("gibbsMap: cannot open output file");
    csv << "T_K,P_Pa,deltaT_K,converged,metric";
    for (const auto& nm : spNames) csv << ",x_" << nm;
    csv << "\n" << std::scientific << std::setprecision(8);

    int nBad = 0;
    for (int it = 0; it < nT; ++it)
    {
        const scalar T = T0 + (T1 - T0) * (nT > 1 ? scalar(it) / (nT - 1) : 0.0);
        for (int ip = 0; ip < nP; ++ip)
        {
            const scalar f = (nP > 1 ? scalar(ip) / (nP - 1) : 0.0);
            const scalar P = logP ? P0 * std::pow(P1 / P0, f)
                                  : P0 + (P1 - P0) * f;
            prob.P = P;
            GibbsEquilibrium eq = solver.equilibrium(prob, T, {});
            csv << T << "," << P << "," << prob.dTapproach << ","
                << (eq.converged ? 1 : 0) << ",";
            if (eq.converged)
            {
                csv << metricOf(eq);
                for (std::size_t i = 0; i < N; ++i)
                    csv << "," << eq.nGas[i] / eq.Ntotal_gas;
            }
            else
            {
                ++nBad;
                csv << "nan";
                for (std::size_t i = 0; i < N; ++i) csv << ",nan";
            }
            csv << "\n";
        }
    }
    csv.close();

    // ---- anchor KPIs (deltaT embedded in the NAME -- the goldens break loudly
    //      if someone edits the approach) ---------------------------------------
    if (dict->found("anchors"))
    {
        for (const auto& a : dict->lookupDictList("anchors"))
        {
            const scalar Ta = a->lookupScalar("T");
            const scalar Pa = a->lookupScalar("P");
            prob.P = Pa;
            GibbsEquilibrium eq = solver.equilibrium(prob, Ta, {});
            std::ostringstream key;
            key << "metric_T" << static_cast<int>(std::lround(Ta - 273.15))
                << "C_P" << static_cast<int>(std::lround(Pa / 101325.0)) << "atm";
            if (dTtag != 0) key << "_dT" << dTtag;
            diag_[key.str()] = eq.converged ? metricOf(eq)
                                            : std::nan("");
            headline_.push_back(key.str());
        }
    }
    diag_["n_cells"]       = static_cast<scalar>(nT * nP);
    diag_["n_unconverged"] = static_cast<scalar>(nBad);
    if (prob.dTapproach != 0.0) diag_["temperatureApproach_K"] = prob.dTapproach;
    headline_.push_back("n_unconverged");

    if (verbosity >= 2)
        std::cout << "gibbsMap: " << nT << " x " << nP << " grid ("
                  << nT * nP << " Gibbs solves), " << nBad
                  << " unconverged (hatched in the GUI, never interpolated);"
                     " metric = " << mtype << ".\n";
    return 0;
}

} // namespace Choupo
