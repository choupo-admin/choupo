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

#include "HeatCapacityFit.H"
#include "core/Dictionary.H"
#include "core/Units.H"
#include "thermo/ThermoPackage.H"
#include "thermo/Component.H"

#include <algorithm>
#include <cmath>
#include <fstream>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

namespace {
scalar convUnit(scalar v, const std::string& unit)
{
    // Cp units are passed through (Choupo uses J/(mol·K) numerically); T via the table.
    if (unit == "J/(mol·K)" || unit == "J/mol/K" || unit == "J/molK"
        || unit == "J/(mol.K)" || unit == "frac" || unit == "-")
        return v;
    auto spec = units::lookupUnit(unit);
    if (!spec) throw std::runtime_error("heatCapacityFit dataset: unknown unit '" + unit + "'");
    return spec->affine ? units::affineToK(v, unit) : v * spec->factor;
}

// Solve the (n x n) linear system M x = b by Gaussian elimination with partial
// pivoting.  Small, dense, well-conditioned (a low-degree Vandermonde normal
// system) -- good enough for a teaching polynomial fit.
bool gaussSolve(std::vector<std::vector<scalar>> M, std::vector<scalar> b,
                std::vector<scalar>& x)
{
    const std::size_t n = b.size();
    for (std::size_t col = 0; col < n; ++col)
    {
        std::size_t piv = col; scalar best = std::abs(M[col][col]);
        for (std::size_t r = col + 1; r < n; ++r)
            if (std::abs(M[r][col]) > best) { best = std::abs(M[r][col]); piv = r; }
        if (best < 1e-300) return false;
        std::swap(M[col], M[piv]); std::swap(b[col], b[piv]);
        for (std::size_t r = col + 1; r < n; ++r)
        {
            const scalar f = M[r][col] / M[col][col];
            for (std::size_t c = col; c < n; ++c) M[r][c] -= f * M[col][c];
            b[r] -= f * b[col];
        }
    }
    x.assign(n, 0.0);
    for (std::size_t i = n; i-- > 0;)
    {
        scalar s = b[i];
        for (std::size_t c = i + 1; c < n; ++c) s -= M[i][c] * x[c];
        x[i] = s / M[i][i];
    }
    return true;
}
}

int HeatCapacityFit::run(const DictPtr& dict,
                         const ThermoPackage& thermo,
                         int verbosity)
{
    diag_.clear();
    const std::string comp = dict->lookupWordOrDefault("component", "");
    const int degree = dict->found("degree")
        ? static_cast<int>(dict->lookupScalar("degree")) : 2;
    if (degree < 1 || degree > 5)
        throw std::runtime_error("heatCapacityFit: degree must be 1..5");

    // -- read (T, Cp) -------------------------------------------------------
    auto ds = Dictionary::fromFile(dict->lookupWord("dataset"));
    auto cols = ds->lookupDictList("columns");
    auto grid = ds->lookupList("data");
    const std::size_t nc = cols.size();
    if (nc < 2 || grid.empty() || grid.size() % nc != 0)
        throw std::runtime_error("heatCapacityFit dataset: need >=2 columns + matching grid");
    int cT = -1, cCp = -1;
    std::vector<std::string> unit(nc);
    for (std::size_t j = 0; j < nc; ++j)
    {
        const std::string name = cols[j]->lookupWord("name");
        unit[j] = cols[j]->lookupWord("unit");
        if      (name == "T" || name == "temperature") cT = static_cast<int>(j);
        else if (name == "Cp" || name == "cp")          cCp = static_cast<int>(j);
    }
    if (cT < 0 || cCp < 0)
        throw std::runtime_error("heatCapacityFit dataset needs columns T and Cp");

    const std::size_t N = grid.size() / nc;
    std::vector<scalar> T, Cp;
    scalar Tmin = 1e30, Tmax = 0.0;
    for (std::size_t r = 0; r < N; ++r)
    {
        const scalar Tk = convUnit(grid[r * nc + cT], unit[cT]);
        const scalar c  = convUnit(grid[r * nc + cCp], unit[cCp]);
        T.push_back(Tk); Cp.push_back(c);
        Tmin = std::min(Tmin, Tk); Tmax = std::max(Tmax, Tk);
    }
    const std::size_t M = T.size();
    if (static_cast<int>(M) < degree + 1)
        throw std::runtime_error("heatCapacityFit: need >= degree+1 points");

    // -- linear least squares: normal equations for a degree-d polynomial ----
    const std::size_t P = static_cast<std::size_t>(degree) + 1;
    // Power moments S[k] = Σ T^k (k = 0..2d); rhs[j] = Σ Cp·T^j (j = 0..d).
    std::vector<scalar> Spow(2 * degree + 1, 0.0), rhs(P, 0.0);
    for (std::size_t i = 0; i < M; ++i)
    {
        scalar tp = 1.0;
        for (std::size_t k = 0; k <= 2 * static_cast<std::size_t>(degree); ++k) { Spow[k] += tp; tp *= T[i]; }
        tp = 1.0;
        for (std::size_t j = 0; j < P; ++j) { rhs[j] += Cp[i] * tp; tp *= T[i]; }
    }
    std::vector<std::vector<scalar>> A(P, std::vector<scalar>(P, 0.0));
    for (std::size_t j = 0; j < P; ++j)
        for (std::size_t k = 0; k < P; ++k) A[j][k] = Spow[j + k];
    std::vector<scalar> coef;
    if (!gaussSolve(A, rhs, coef))
        throw std::runtime_error("heatCapacityFit: normal equations singular (ill-posed degree?)");

    auto cpFit = [&](scalar t) -> scalar
    { scalar v = 0, tp = 1.0; for (std::size_t j = 0; j < P; ++j) { v += coef[j] * tp; tp *= t; } return v; };

    scalar mean = 0; for (scalar v : Cp) mean += v; mean /= static_cast<scalar>(M);
    scalar ssTot = 0, ssRes = 0;
    for (std::size_t i = 0; i < M; ++i)
    { ssTot += (Cp[i] - mean) * (Cp[i] - mean); const scalar r = Cp[i] - cpFit(T[i]); ssRes += r * r; }
    const scalar R2 = (ssTot > 0.0) ? 1.0 - ssRes / ssTot : 0.0;

    const scalar Tmid = 0.5 * (Tmin + Tmax);
    const scalar CpMid = cpFit(Tmid);

    // -- output -------------------------------------------------------------
    std::ofstream csv(dict->subDict("output")->lookupWord("file"));
    csv << "T_K,Cp_data,Cp_fit\n";
    std::vector<std::size_t> ord(M); for (std::size_t i = 0; i < M; ++i) ord[i] = i;
    std::sort(ord.begin(), ord.end(), [&](std::size_t i, std::size_t j) { return T[i] < T[j]; });
    for (std::size_t i : ord) csv << T[i] << "," << Cp[i] << "," << cpFit(T[i]) << "\n";

    for (std::size_t j = 0; j < P; ++j) diag_["A" + std::to_string(j)] = coef[j];
    diag_["R2"]          = R2;
    diag_["n_points"]    = static_cast<scalar>(M);
    diag_["Cp_at_Tmid"]  = CpMid;
    diag_["degree"]      = static_cast<scalar>(degree);

    // -- Kirchhoff cross-check: d(ΔHvap)/dT = Cp_ig − Cp_L ------------------
    scalar CpIg = std::numeric_limits<scalar>::quiet_NaN(), dHvapdT = CpIg;
    for (std::size_t i = 0; i < thermo.n(); ++i)
        if (thermo.comp(i).name() == comp)
        { CpIg = thermo.comp(i).cpIdealGas().Cp(Tmid); dHvapdT = CpIg - CpMid; break; }
    if (std::isfinite(CpIg)) { diag_["Cp_ig_at_Tmid"] = CpIg; diag_["dHvap_dT_kirchhoff"] = dHvapdT; }

    if (verbosity >= 2)
    {
        std::cout << "  HeatCapacityFit (" << comp << ", " << M << " pts, degree " << degree
                  << "):  Cp(" << Tmid << " K) = " << CpMid << " J/(mol K),  R2 = " << R2 << "\n";
        if (std::isfinite(CpIg))
            std::cout << "    Kirchhoff: d(dHvap)/dT = Cp_ig - Cp_L = " << CpIg << " - " << CpMid
                      << " = " << dHvapdT << " J/(mol K)  (dHvap falls with T)\n";
    }
    return 0;
}

} // namespace Choupo
