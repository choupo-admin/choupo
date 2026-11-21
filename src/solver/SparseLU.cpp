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

#include "SparseLU.H"

#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <string>

namespace Choupo::solver
{

namespace
{
using Adj = std::vector<std::vector<std::size_t>>;

//  a := (a U b) \ {skip1, skip2}, both sorted ascending.
void mergeInto(std::vector<std::size_t>& a, const std::vector<std::size_t>& b,
               std::size_t skip1, std::size_t skip2)
{
    std::vector<std::size_t> out;
    out.reserve(a.size() + b.size());
    std::size_t i = 0, j = 0;
    while (i < a.size() || j < b.size())
    {
        std::size_t v;
        if (j >= b.size() || (i < a.size() && a[i] < b[j])) v = a[i++];
        else if (i >= a.size() || b[j] < a[i])               v = b[j++];
        else { v = a[i]; ++i; ++j; }
        if (v != skip1 && v != skip2) out.push_back(v);
    }
    a.swap(out);
}

//  The symmetrised pattern A + A^T without the diagonal.
Adj symmetrise(const SparsePattern& p)
{
    Adj g(p.n);
    for (std::size_t i = 0; i < p.n; ++i)
        for (std::size_t q = p.rowPtr[i]; q < p.rowPtr[i + 1]; ++q)
        {
            const std::size_t j = p.col[q];
            if (j == i) continue;
            g[i].push_back(j);
            g[j].push_back(i);
        }
    for (auto& r : g)
    {
        std::sort(r.begin(), r.end());
        r.erase(std::unique(r.begin(), r.end()), r.end());
    }
    return g;
}

//  STAGE 1: minimum degree on the explicit elimination graph, dense nodes last.
std::vector<std::size_t> minimumDegree(Adj g, std::size_t& nDense)
{
    const std::size_t n = g.size();
    const std::size_t denseDeg = std::max<std::size_t>(16,
        static_cast<std::size_t>(10.0 * std::sqrt(static_cast<double>(n))));
    std::vector<char> dense(n, 0), alive(n, 1);
    std::vector<std::size_t> denseList;
    for (std::size_t i = 0; i < n; ++i)
        if (g[i].size() > denseDeg) { dense[i] = 1; alive[i] = 0; denseList.push_back(i); }
    nDense = denseList.size();
    //  the dense nodes leave the graph: every list forgets them
    if (nDense)
        for (auto& r : g)
            r.erase(std::remove_if(r.begin(), r.end(),
                        [&](std::size_t v) { return dense[v] != 0; }), r.end());

    std::vector<std::size_t> order;
    order.reserve(n);
    for (std::size_t step = 0; step < n - nDense; ++step)
    {
        std::size_t v = n, best = static_cast<std::size_t>(-1);
        for (std::size_t i = 0; i < n; ++i)
            if (alive[i] && g[i].size() < best) { best = g[i].size(); v = i; }
        order.push_back(v);
        alive[v] = 0;
        const std::vector<std::size_t> nb = g[v];           // its live neighbours
        for (std::size_t u : nb) mergeInto(g[u], nb, u, v);  // they become a clique
        g[v].clear();
    }
    //  dense nodes last, the least connected first
    std::stable_sort(denseList.begin(), denseList.end(),
        [&](std::size_t a, std::size_t b) { return g[a].size() < g[b].size(); });
    order.insert(order.end(), denseList.begin(), denseList.end());
    return order;
}
}

void SparseLU::analyse(std::shared_ptr<const SparsePattern> p)
{
    analyse(*p);
    held_ = std::move(p);
}

void SparseLU::analyse(const SparsePattern& p)
{
    held_.reset();
    auto S = std::make_shared<Symbolic>();
    const std::size_t n = p.n;
    S->n = n;
    S->nnzPattern = p.nnz();
    if (p.rowPtr.size() != n + 1)
        throw std::runtime_error("SparseLU: the pattern's rowPtr has "
            + std::to_string(p.rowPtr.size()) + " entries for n = " + std::to_string(n));
    for (std::size_t i = 0; i < n; ++i)
        if (!std::binary_search(p.col.begin() + static_cast<std::ptrdiff_t>(p.rowPtr[i]),
                                p.col.begin() + static_cast<std::ptrdiff_t>(p.rowPtr[i + 1]), i))
            throw std::runtime_error("SparseLU: the pattern has no diagonal entry in row "
                + std::to_string(i) + " (W = I - h d J needs every one)");

    // ---- 1. ordering ------------------------------------------------------
    const Adj g = symmetrise(p);
    S->perm = minimumDegree(g, S->dense);
    S->iperm.assign(n, 0);
    for (std::size_t k = 0; k < n; ++k) S->iperm[S->perm[k]] = k;

    // ---- 2. symbolic factorisation in the permuted numbering ---------------
    //  Eliminating column k joins every remaining neighbour of k into a
    //  clique: the neighbours above k ARE column k of L (and, the pattern
    //  being symmetric, row k of U).
    Adj h(n);
    for (std::size_t i = 0; i < n; ++i)
    {
        for (std::size_t j : g[i]) h[S->iperm[i]].push_back(S->iperm[j]);
        std::sort(h[S->iperm[i]].begin(), h[S->iperm[i]].end());
    }
    S->Lp.assign(n + 1, 0);
    for (std::size_t k = 0; k < n; ++k)
    {
        std::vector<std::size_t> Lk;
        for (std::size_t i : h[k]) if (i > k) Lk.push_back(i);
        for (std::size_t i : Lk) mergeInto(h[i], Lk, i, k);
        S->Li.insert(S->Li.end(), Lk.begin(), Lk.end());
        S->Lp[k + 1] = S->Li.size();
        h[k].clear();
        h[k].shrink_to_fit();
    }
    //  U by columns = the transpose of L's pattern (columns visited ascending,
    //  so every U column comes out sorted)
    std::vector<std::size_t> cnt(n + 1, 0);
    for (std::size_t i : S->Li) ++cnt[i + 1];
    S->Up.assign(n + 1, 0);
    for (std::size_t k = 0; k < n; ++k) S->Up[k + 1] = S->Up[k] + cnt[k + 1];
    S->Ui.assign(S->Li.size(), 0);
    std::vector<std::size_t> next(S->Up.begin(), S->Up.end() - 1);
    for (std::size_t j = 0; j < n; ++j)
        for (std::size_t t = S->Lp[j]; t < S->Lp[j + 1]; ++t)
            S->Ui[next[S->Li[t]]++] = j;
    //  the numeric cost: column k does, for each j in U(:,k), |L(:,j)| updates
    S->flops = 0.0;
    for (std::size_t k = 0; k < n; ++k)
        for (std::size_t t = S->Up[k]; t < S->Up[k + 1]; ++t)
        {
            const std::size_t j = S->Ui[t];
            S->flops += static_cast<double>(S->Lp[j + 1] - S->Lp[j]);
        }

    // ---- the caller's CSR entries, gathered by permuted column -------------
    std::vector<std::size_t> cc(n + 1, 0);
    for (std::size_t q = 0; q < p.nnz(); ++q) ++cc[S->iperm[p.col[q]] + 1];
    S->Ap.assign(n + 1, 0);
    for (std::size_t k = 0; k < n; ++k) S->Ap[k + 1] = S->Ap[k] + cc[k + 1];
    S->Ai.assign(p.nnz(), 0);
    S->Amap.assign(p.nnz(), 0);
    std::vector<std::size_t> at(S->Ap.begin(), S->Ap.end() - 1);
    for (std::size_t i = 0; i < n; ++i)
        for (std::size_t q = p.rowPtr[i]; q < p.rowPtr[i + 1]; ++q)
        {
            const std::size_t k = S->iperm[p.col[q]];
            S->Ai[at[k]] = S->iperm[i];
            S->Amap[at[k]] = q;
            ++at[k];
        }

    sym_ = S;
    analysedFor_ = &p;
    Lx_.assign(S->Li.size(), 0.0);
    Ux_.assign(S->Ui.size(), 0.0);
    D_.assign(n, 0.0);
    rowScale_.assign(n, 1.0);
    work_.assign(n, 0.0);
}

//  STAGE 3: left-looking Doolittle, column k of the permuted matrix:
//      w = A(:,k);  for j in U(:,k) ascending: U(j,k) = w_j,
//                                               w_i -= L(i,j) U(j,k)  (i in L(:,j));
//      U(k,k) = w_k (threshold-tested);  L(i,k) = w_i / U(k,k).
//  Every update lands inside column k's filled pattern (the symbolic stage
//  closed it), so a dense work vector cleared on that pattern is enough.
bool SparseLU::factor(const sVector& values, scalar pivotTol)
{
    if (!sym_) throw std::runtime_error("SparseLU::factor before analyse");
    const Symbolic& S = *sym_;
    const std::size_t n = S.n;
    sVector& w = work_;
    //  ROW EQUILIBRATION first: each row divided by its largest entry, so the
    //  threshold test compares numbers of one size.  W = I - h d J mixes a
    //  temperature row (K/s per kmol) with mole-number rows; unscaled, the T
    //  row's entries dwarf every pivot of its column and the test would refuse
    //  a factorisation that is perfectly stable on the scaled rows.
    for (std::size_t k = 0; k < n; ++k) rowScale_[k] = 0.0;
    for (std::size_t t = 0; t < S.Ai.size(); ++t)
        rowScale_[S.Ai[t]] = std::max(rowScale_[S.Ai[t]], std::abs(values[S.Amap[t]]));
    for (std::size_t k = 0; k < n; ++k)
    {
        if (!(rowScale_[k] > 0.0) || !std::isfinite(rowScale_[k])) return false;
        rowScale_[k] = 1.0 / rowScale_[k];
    }
    for (std::size_t k = 0; k < n; ++k)
    {
        for (std::size_t t = S.Ap[k]; t < S.Ap[k + 1]; ++t)
            w[S.Ai[t]] = values[S.Amap[t]] * rowScale_[S.Ai[t]];
        for (std::size_t t = S.Up[k]; t < S.Up[k + 1]; ++t)
        {
            const std::size_t j = S.Ui[t];
            const scalar ujk = w[j];
            Ux_[t] = ujk;
            w[j] = 0.0;
            if (ujk != 0.0)
                for (std::size_t s = S.Lp[j]; s < S.Lp[j + 1]; ++s)
                    w[S.Li[s]] -= Lx_[s] * ujk;
        }
        const scalar d = w[k];
        w[k] = 0.0;
        scalar colMax = 0.0;
        for (std::size_t s = S.Lp[k]; s < S.Lp[k + 1]; ++s)
            colMax = std::max(colMax, std::abs(w[S.Li[s]]));
        if (!std::isfinite(d) || d == 0.0 || std::abs(d) < pivotTol * colMax)
        {
            for (std::size_t s = S.Lp[k]; s < S.Lp[k + 1]; ++s) w[S.Li[s]] = 0.0;
            return false;
        }
        D_[k] = d;
        const scalar inv = 1.0 / d;
        for (std::size_t s = S.Lp[k]; s < S.Lp[k + 1]; ++s)
        {
            Lx_[s] = w[S.Li[s]] * inv;
            w[S.Li[s]] = 0.0;
        }
    }
    return true;
}

sVector SparseLU::solve(const sVector& b) const
{
    const Symbolic& S = *sym_;
    const std::size_t n = S.n;
    sVector& y = work_;
    for (std::size_t k = 0; k < n; ++k) y[k] = b[S.perm[k]] * rowScale_[k];   // R P b
    for (std::size_t k = 0; k < n; ++k)                 // L y = P b   (unit L)
    {
        const scalar yk = y[k];
        if (yk != 0.0)
            for (std::size_t s = S.Lp[k]; s < S.Lp[k + 1]; ++s) y[S.Li[s]] -= Lx_[s] * yk;
    }
    for (std::size_t k = n; k-- > 0;)                   // U x = y
    {
        const scalar xk = y[k] / D_[k];
        y[k] = xk;
        if (xk != 0.0)
            for (std::size_t t = S.Up[k]; t < S.Up[k + 1]; ++t) y[S.Ui[t]] -= Ux_[t] * xk;
    }
    sVector x(n);
    for (std::size_t k = 0; k < n; ++k) { x[S.perm[k]] = y[k]; y[k] = 0.0; }
    return x;
}

std::size_t SparseLU::nnzFactor() const
{ return sym_ ? sym_->Li.size() + sym_->Ui.size() + sym_->n : 0; }
std::size_t SparseLU::nnzPattern() const { return sym_ ? sym_->nnzPattern : 0; }
double SparseLU::flopsFactor() const { return sym_ ? sym_->flops : 0.0; }
std::size_t SparseLU::denseNodes() const { return sym_ ? sym_->dense : 0; }

} // namespace Choupo::solver
