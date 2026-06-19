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

#include "VaporPressureFit.H"
#include "core/Constants.H"
#include "core/Dictionary.H"
#include "core/Units.H"

#include <algorithm>
#include <cmath>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

namespace {
scalar convUnit(scalar v, const std::string& unit)
{
    if (unit == "frac" || unit == "-" || unit == "[-]" || unit == "dimensionless") return v;
    auto spec = units::lookupUnit(unit);
    if (!spec) throw std::runtime_error("vaporPressureFit dataset: unknown unit '" + unit + "'");
    return spec->affine ? units::affineToK(v, unit) : v * spec->factor;
}
}

int VaporPressureFit::run(const DictPtr& dict,
                          const ThermoPackage& /*thermo*/,
                          int verbosity)
{
    diag_.clear();
    const std::string comp = dict->lookupWordOrDefault("component", "");

    // -- read (T, Psat) ; convert T->K, Psat->bar (Antoine convention) -------
    auto ds = Dictionary::fromFile(dict->lookupWord("dataset"));
    auto cols = ds->lookupDictList("columns");
    auto grid = ds->lookupList("data");
    const std::size_t nc = cols.size();
    if (nc < 2 || grid.empty() || grid.size() % nc != 0)
        throw std::runtime_error("vaporPressureFit dataset: need >=2 columns + matching grid");
    int cT = -1, cP = -1;
    std::vector<std::string> unit(nc);
    for (std::size_t j = 0; j < nc; ++j)
    {
        const std::string name = cols[j]->lookupWord("name");
        unit[j] = cols[j]->lookupWord("unit");
        if      (name == "T" || name == "temperature") cT = static_cast<int>(j);
        else if (name == "Psat" || name == "P" || name == "psat") cP = static_cast<int>(j);
    }
    if (cT < 0 || cP < 0)
        throw std::runtime_error("vaporPressureFit dataset needs columns T and Psat");

    const std::size_t N = grid.size() / nc;
    std::vector<scalar> T, y;   // y = log10(Psat[bar])
    scalar Tmin = 1e30, Tmax = 0.0;
    for (std::size_t r = 0; r < N; ++r)
    {
        const scalar Tk   = convUnit(grid[r * nc + cT], unit[cT]);         // K
        const scalar P_Pa = convUnit(grid[r * nc + cP], unit[cP]);         // Pa
        if (P_Pa <= 0.0) continue;
        const scalar Pbar = P_Pa / units::bar_to_Pa;
        T.push_back(Tk); y.push_back(std::log10(Pbar));
        Tmin = std::min(Tmin, Tk); Tmax = std::max(Tmax, Tk);
    }
    if (T.size() < 3)
        throw std::runtime_error("vaporPressureFit: need >=3 (T, Psat) points");

    // -- fit log10(P) = A − B/(T+C): linear (A,B) for fixed C, golden-section C -
    auto solveAtC = [&](scalar C, scalar& A, scalar& B) -> scalar
    {
        scalar su = 0, sy = 0, suu = 0, suy = 0; const scalar n = static_cast<scalar>(T.size());
        for (std::size_t i = 0; i < T.size(); ++i)
        {
            const scalar u = 1.0 / (T[i] + C);
            su += u; sy += y[i]; suu += u * u; suy += u * y[i];
        }
        const scalar denom = suu - su * su / n;
        const scalar m = (denom != 0.0) ? (suy - su * sy / n) / denom : 0.0;  // slope y vs u = -B
        B = -m; A = sy / n - m * su / n;
        scalar sse = 0.0;
        for (std::size_t i = 0; i < T.size(); ++i)
        {
            const scalar yh = A - B / (T[i] + C);
            sse += (y[i] - yh) * (y[i] - yh);
        }
        return sse;
    };
    // C must keep (T+C) > 0 for every point; search below Tmin.
    scalar Clo = -(Tmin) + 5.0, Chi = 300.0;
    const scalar gr = 0.6180339887498949;
    scalar a = Clo, b = Chi, A1 = 0, B1 = 0, A2 = 0, B2 = 0;
    scalar c1 = b - gr * (b - a), d1 = a + gr * (b - a);
    scalar f1 = solveAtC(c1, A1, B1), f2 = solveAtC(d1, A2, B2);
    for (int it = 0; it < 120; ++it)
    {
        if (f1 < f2) { b = d1; d1 = c1; f2 = f1; c1 = b - gr * (b - a); f1 = solveAtC(c1, A1, B1); }
        else         { a = c1; c1 = d1; f1 = f2; d1 = a + gr * (b - a); f2 = solveAtC(d1, A2, B2); }
    }
    scalar C = 0.5 * (a + b), A = 0, B = 0;
    const scalar sse = solveAtC(C, A, B);

    scalar ybar = 0; for (scalar v : y) ybar += v; ybar /= static_cast<scalar>(y.size());
    scalar ssTot = 0; for (scalar v : y) ssTot += (v - ybar) * (v - ybar);
    const scalar R2 = (ssTot > 0.0) ? 1.0 - sse / ssTot : 0.0;

    // Clausius–Clapeyron dHvap with the (T+C) correction, at the highest T.
    const scalar dHvap = constant::R * std::log(10.0) * B
                       * (Tmax / (Tmax + C)) * (Tmax / (Tmax + C));   // J/mol

    // -- output: T, Psat_data, Psat_fit (bar) -------------------------------
    std::ofstream csv(dict->subDict("output")->lookupWord("file"));
    csv << "T_K,Psat_data,Psat_fit\n";   // Psat in canonical SI (Pa); GUI display-converts
    std::vector<std::size_t> order(T.size());
    for (std::size_t i = 0; i < T.size(); ++i) order[i] = i;
    std::sort(order.begin(), order.end(), [&](std::size_t i, std::size_t j) { return T[i] < T[j]; });
    for (std::size_t k : order)
        csv << T[k] << "," << std::pow(10.0, y[k]) * units::bar_to_Pa << ","
            << std::pow(10.0, A - B / (T[k] + C)) * units::bar_to_Pa << "\n";

    diag_["A"]               = A;
    diag_["B"]               = B;
    diag_["C"]               = C;
    diag_["R2"]              = R2;
    diag_["n_points"]        = static_cast<scalar>(T.size());
    diag_["dHvap_kJ_per_mol"] = dHvap / 1000.0;

    if (verbosity >= 2)
        std::cout << "  VaporPressureFit (" << comp << ", " << T.size() << " pts):\n"
                  << "    Antoine  log10(Psat[bar]) = " << A << " - " << B
                  << "/(T" << (C >= 0 ? "+" : "") << C << ")   R2 = " << R2 << "\n"
                  << "    Clausius-Clapeyron dHvap(" << Tmax << " K) = "
                  << dHvap / 1000.0 << " kJ/mol\n";
    return 0;
}

} // namespace Choupo
