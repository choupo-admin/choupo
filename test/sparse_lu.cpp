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
Standalone test of solver/SparseLU against the dense LU (partial pivoting) on
RANDOM sparse matrices -- the shape of W = I - h d J of a mechanism: a sparse
pattern, some dense rows and columns (a temperature, a bath gas every third
body reads), every diagonal stored.  For each matrix:
  * the pattern is analysed once and factored TWICE with different values
    (the integrator refactors on a fixed pattern every step);
  * x = A^{-1} b from SparseLU and from luFactor/luSolve agree to 1e-12 of
    |x|, and the residual |A x - b| is at round-off;
  * a matrix that needs a row exchange (zero diagonal) is REFUSED by the
    threshold test (factor() returns false), never answered wrong.
Prints one line per family and "SPARSE_LU_OK" at the end; exit 1 on a failure.
Build (standalone):
    g++ -std=c++17 -O2 -Isrc test/sparse_lu.cpp src/solver/SparseLU.cpp \
        src/solver/LU.cpp src/solver/ODE/ODEIntegrator.cpp \
        src/solver/ODE/RK4.cpp src/solver/ODE/EulerSI.cpp \
        src/solver/ODE/Rosenbrock23.cpp src/solver/ODE/Jacobian.cpp \
        src/solver/BlockTridiagonal.cpp src/core/RegistryRefusal.cpp -o /tmp/sparse_lu
(bin/curate/check_sparse_lu.py builds and runs it.)
\*---------------------------------------------------------------------------*/

#include "solver/SparseLU.H"
#include "solver/LU.H"

#include <cmath>
#include <cstdio>
#include <memory>
#include <random>
#include <set>
#include <vector>

using namespace Choupo;
using namespace Choupo::solver;

namespace
{
struct Case { std::size_t n; double density; std::size_t denseRows; double diagShift; };

SparsePattern randomPattern(std::mt19937_64& rng, const Case& c)
{
    std::uniform_real_distribution<double> u(0.0, 1.0);
    std::vector<std::set<std::size_t>> rows(c.n);
    for (std::size_t i = 0; i < c.n; ++i)
    {
        rows[i].insert(i);
        for (std::size_t j = 0; j < c.n; ++j)
            if (u(rng) < c.density) rows[i].insert(j);
    }
    for (std::size_t d = 0; d < c.denseRows && d < c.n; ++d)   // dense row AND column
    {
        const std::size_t k = c.n - 1 - d;
        for (std::size_t j = 0; j < c.n; ++j) { rows[k].insert(j); rows[j].insert(k); }
    }
    SparsePattern p;
    p.n = c.n;
    p.rowPtr.assign(c.n + 1, 0);
    for (std::size_t i = 0; i < c.n; ++i)
    {
        p.col.insert(p.col.end(), rows[i].begin(), rows[i].end());
        p.rowPtr[i + 1] = p.col.size();
    }
    return p;
}

sVector randomValues(std::mt19937_64& rng, const SparsePattern& p, double diagShift)
{
    std::normal_distribution<double> g(0.0, 1.0);
    sVector v(p.nnz());
    for (std::size_t i = 0; i < p.n; ++i)
    {
        double rowAbs = 0.0;
        std::size_t dq = 0;
        for (std::size_t q = p.rowPtr[i]; q < p.rowPtr[i + 1]; ++q)
        {
            v[q] = g(rng);
            if (p.col[q] == i) dq = q; else rowAbs += std::abs(v[q]);
        }
        //  diagShift 1: diagonally dominant (W of a small step); below one:
        //  a pivot may be small relative to its column (still non-singular)
        v[dq] = (v[dq] >= 0 ? 1.0 : -1.0) * (diagShift * rowAbs + 1.0);
    }
    return v;
}

std::vector<sVector> dense(const SparsePattern& p, const sVector& v)
{
    std::vector<sVector> A(p.n, sVector(p.n, 0.0));
    for (std::size_t i = 0; i < p.n; ++i)
        for (std::size_t q = p.rowPtr[i]; q < p.rowPtr[i + 1]; ++q) A[i][p.col[q]] = v[q];
    return A;
}
}

int main()
{
    std::mt19937_64 rng(20261121);
    const std::vector<Case> cases = {
        {5, 0.3, 0, 1.0}, {10, 0.2, 1, 1.0}, {50, 0.06, 1, 1.0}, {100, 0.04, 2, 1.0},
        {300, 0.02, 3, 1.0}, {300, 0.02, 3, 0.3}, {1000, 0.008, 4, 1.0}, {1000, 0.008, 4, 0.5},
    };
    bool ok = true;
    for (const auto& c : cases)
    {
        const SparsePattern p = randomPattern(rng, c);
        SparseLU lu;
        lu.analyse(p);
        double worst = 0.0, worstRes = 0.0;
        int failed = 0;
        for (int rep = 0; rep < 2; ++rep)
        {
            const sVector v = randomValues(rng, p, c.diagShift);
            sVector b(c.n);
            std::normal_distribution<double> g(0.0, 1.0);
            for (auto& x : b) x = g(rng);
            if (!lu.factor(v)) { ++failed; continue; }
            const sVector xs = lu.solve(b);
            auto A = dense(p, v);
            std::vector<std::size_t> piv;
            luFactor(A, piv);
            const sVector xd = luSolve(A, piv, b);
            double nx = 0.0, d = 0.0;
            for (std::size_t i = 0; i < c.n; ++i)
            { nx = std::max(nx, std::abs(xd[i])); d = std::max(d, std::abs(xs[i] - xd[i])); }
            worst = std::max(worst, d / nx);
            const auto A0 = dense(p, v);
            double res = 0.0, nb = 0.0;
            for (std::size_t i = 0; i < c.n; ++i)
            {
                double r = -b[i];
                for (std::size_t j = 0; j < c.n; ++j) r += A0[i][j] * xs[j];
                res = std::max(res, std::abs(r)); nb = std::max(nb, std::abs(b[i]));
            }
            worstRes = std::max(worstRes, res / nb);
        }
        const bool good = failed == 0 && worst <= 1e-12 && worstRes <= 1e-12;
        std::printf("n %5zu  nnz %7zu  L+U %8zu  dense nodes %zu  flops %.3e (dense %.3e)  "
                    "|xs-xd|/|x| %.2e  residual %.2e  %s\n",
                    c.n, p.nnz(), lu.nnzFactor(), lu.denseNodes(), lu.flopsFactor(),
                    double(c.n) * c.n * c.n / 3.0, worst, worstRes,
                    good ? "ok" : (failed ? "PIVOT REFUSED" : "MISMATCH"));
        ok = ok && good;
    }
    //  A zero pivot that only a row exchange cures: [[0 1][1 0]] -- refused.
    {
        SparsePattern p;
        p.n = 2; p.rowPtr = {0, 2, 4}; p.col = {0, 1, 0, 1};
        SparseLU lu;
        lu.analyse(p);
        const bool refused = !lu.factor({0.0, 1.0, 1.0, 0.0});
        std::printf("zero pivot needing a row exchange: %s\n", refused ? "refused (ok)" : "ACCEPTED");
        ok = ok && refused;
    }
    std::printf(ok ? "SPARSE_LU_OK\n" : "SPARSE_LU_FAILED\n");
    return ok ? 0 : 1;
}
