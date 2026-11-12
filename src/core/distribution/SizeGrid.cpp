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

#include "core/distribution/SizeGrid.H"
#include "core/distribution/SizeDistribution.H"
#include "core/Dimensions.H"

#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

SizeGrid::SizeGrid(scalar xMax, scalar ratio, int nClasses)
:
    r_(ratio)
{
    if (!(xMax > 0.0))
        throw std::runtime_error("sizeGrid: `xMax` (the top edge, the feed's "
            "top size) must be positive.");
    if (!(ratio > 1.0))
        throw std::runtime_error("sizeGrid: `ratio` is x_{k+1}/x_k and must be "
            "greater than 1 (sqrt 2 = 1.41421356 is the Tyler sieve series).");
    if (nClasses < 3)
        throw std::runtime_error("sizeGrid: `nClasses` counts the pan and must "
            "be at least 3 -- a grid with fewer classes cannot tell a size "
            "distribution from a cut.");
    //  Ascending: e_0 = 0 (the pan), e_1 = xMax / r^(n-1), ..., e_n = xMax.
    edges_.assign(nClasses + 1, 0.0);
    edges_[nClasses] = xMax;
    for (int k = nClasses - 1; k >= 1; --k) edges_[k] = edges_[k + 1] / ratio;
    edges_[0] = 0.0;
    rep_ = representativeSizes(edges_);
}


SizeGrid SizeGrid::fromDict(const DictPtr& d)
{
    for (const char* key : {"xMax", "ratio", "nClasses"})
        if (!d->found(key))
            throw std::runtime_error(std::string("sizeGrid: `") + key
                + "` is missing.  A size grid is declared by its top edge "
                  "`xMax`, its ratio `ratio` and its number of classes "
                  "`nClasses` (pan included).");
    const scalar xMax  = d->lookupScalar("xMax", Dims::length);
    const scalar ratio = d->lookupScalar("ratio");
    const scalar nC    = d->lookupScalar("nClasses");
    if (std::abs(nC - std::round(nC)) > 1e-9)
        throw std::runtime_error("sizeGrid: `nClasses` must be an integer.");
    return SizeGrid(xMax, ratio, static_cast<int>(std::lround(nC)));
}


bool SizeGrid::sameAs(const std::vector<scalar>& e) const
{
    if (e.size() != edges_.size()) return false;
    for (std::size_t k = 0; k < e.size(); ++k)
    {
        const scalar a = e[k], b = edges_[k];
        if (a == b) continue;
        if (std::abs(a - b) > 1e-9 * std::max(std::abs(a), std::abs(b)))
            return false;
    }
    return true;
}


//  Fraction of a source class [a, b] that lies inside [lo, hi].  Uniform in
//  ln x inside a class; uniform in x inside a pan (a == 0), whose log width
//  is infinite.
static scalar overlapFraction(scalar a, scalar b, scalar lo, scalar hi)
{
    const scalar L = std::max(a, lo), U = std::min(b, hi);
    if (!(U > L)) return 0.0;
    if (a <= 0.0) return (U - L) / b;
    return (std::log(U) - std::log(L)) / (std::log(b) - std::log(a));
}


std::vector<scalar> SizeGrid::mapTable(const std::vector<scalar>& se,
                                       const std::vector<scalar>& sm,
                                       SizeGridMapReport* rep) const
{
    if (se.size() != sm.size() + 1)
        throw std::runtime_error("sizeGrid: a table to re-bin needs one more "
            "edge than it has fractions.");
    const int n = nClasses();
    std::vector<scalar> w(n, 0.0);
    scalar in = 0.0, folded = 0.0;
    for (std::size_t j = 0; j < sm.size(); ++j)
    {
        const scalar M = sm[j];
        in += M;
        if (M == 0.0) continue;
        const scalar a = se[j], b = se[j + 1];
        if (!(b > a) || a < 0.0)
            throw std::runtime_error("sizeGrid: the edges of a table to re-bin "
                "must be ascending and non-negative.");
        scalar placed = 0.0;
        for (int k = 0; k < n; ++k)
        {
            const scalar f = overlapFraction(a, b, edges_[k], edges_[k + 1]);
            w[k] += M * f;
            placed += f;
        }
        //  Whatever of this source class did not land on a grid class lay
        //  ABOVE xMax.  It is FOLDED into the top class, so this source class
        //  hands out exactly M -- the grid's claim is that nothing is larger
        //  than xMax, and the report says how much was.
        const scalar rest = std::max(0.0, 1.0 - placed);
        w[n - 1] += M * rest;
        folded   += M * rest;
    }
    if (rep)
    {
        rep->inputSum = in;
        rep->outputSum = 0.0;
        for (auto v : w) rep->outputSum += v;
        rep->foldedAbove = (in > 0.0) ? folded / in : 0.0;
    }
    return w;
}


std::vector<scalar> SizeGrid::mapLaw(const SizeDistribution& law,
                                     SizeGridMapReport* rep) const
{
    //  F3(x): the MASS fraction of the law below x.  Composite Simpson in
    //  u = ln d over [ln dMin, ln min(x, dMax)], normalised by the same rule
    //  over the whole support.  The class masses are DIFFERENCES of F3, so
    //  they telescope to exactly 1 -- the quadrature error moves mass between
    //  neighbouring classes, it never creates or destroys any.
    const int shift = momentBasis::volume - law.declaredBasis();
    const scalar a = law.dMin(), b = law.dMax();
    auto integral = [&](scalar x)
    {
        const scalar hiX = std::min(x, b);
        if (!(hiX > a)) return 0.0;
        const int N = 600;   // even, for Simpson
        const scalar la = std::log(a), lx = std::log(hiX);
        const scalar h = (lx - la) / N;
        auto g = [&](scalar u)
        {
            const scalar d = std::exp(u);
            return law.pdf(d) * std::pow(d, shift + 1);
        };
        scalar s = g(la) + g(lx);
        for (int i = 1; i < N; ++i) s += g(la + i * h) * ((i % 2) ? 4.0 : 2.0);
        return s * h / 3.0;
    };
    const scalar total = integral(b);
    if (!(total > 0.0))
        throw std::runtime_error("sizeGrid: the declared law carries no mass on "
            "its own support -- check dMin/dMax against its parameters.");
    //  A law DECLARED in the mass basis has its own closed-form cumulative
    //  (Rosin-Rammler): used exactly, truncated to the support as `toTabular`
    //  truncates it.  Any other basis is integrated.
    const bool massBasis = (shift == 0);
    const scalar ca = massBasis ? law.cdf(a) : 0.0;
    const scalar cb = massBasis ? law.cdf(b) : 0.0;
    auto F3 = [&](scalar x)
    {
        if (x <= a) return 0.0;
        if (x >= b) return 1.0;
        const scalar v = (massBasis && cb > ca) ? (law.cdf(x) - ca) / (cb - ca)
                                                : integral(x) / total;
        return std::min(1.0, std::max(0.0, v));
    };
    const int n = nClasses();
    std::vector<scalar> Fe(n + 1, 0.0);
    for (int k = 1; k < n; ++k) Fe[k] = F3(edges_[k]);
    Fe[0] = 0.0;
    Fe[n] = 1.0;                       // the top class takes the tail above xMax
    for (int k = 1; k <= n; ++k) Fe[k] = std::max(Fe[k], Fe[k - 1]);
    std::vector<scalar> w(n, 0.0);
    for (int k = 0; k < n; ++k) w[k] = Fe[k + 1] - Fe[k];
    if (rep)
    {
        rep->inputSum = 1.0;
        rep->outputSum = 0.0;
        for (auto v : w) rep->outputSum += v;
        rep->foldedAbove = 1.0 - F3(xMax());
    }
    return w;
}


std::vector<scalar> inferSizeEdges(const std::vector<scalar>& c)
{
    const std::size_t m = c.size();
    if (m == 0) return {};
    for (std::size_t k = 0; k + 1 < m; ++k)
        if (!(c[k + 1] > c[k]) || !(c[k] > 0.0))
            throw std::runtime_error("size distribution: representative sizes "
                "must be positive and strictly ascending to infer class edges.");
    std::vector<scalar> e(m + 1, 0.0);
    if (m == 1)
    {
        e[0] = c[0] / std::sqrt(2.0);
        e[1] = c[0] * std::sqrt(2.0);
        return e;
    }
    for (std::size_t k = 1; k < m; ++k) e[k] = std::sqrt(c[k - 1] * c[k]);
    e[0] = c[0] * c[0] / e[1];
    e[m] = c[m - 1] * c[m - 1] / e[m - 1];
    return e;
}


std::vector<scalar> representativeSizes(const std::vector<scalar>& e)
{
    std::vector<scalar> r;
    if (e.size() < 2) return r;
    r.resize(e.size() - 1);
    for (std::size_t k = 0; k + 1 < e.size(); ++k)
    {
        if (e[k] > 0.0) { r[k] = std::sqrt(e[k] * e[k + 1]); continue; }
        //  The pan [0, e1]: one ratio step below its upper edge.
        const scalar ratio = (e.size() > 2 && e[k + 1] > 0.0)
                           ? e[k + 2] / e[k + 1] : 2.0;
        r[k] = e[k + 1] / std::sqrt(ratio);
    }
    return r;
}


scalar passingSize(const std::vector<scalar>& e,
                   const std::vector<scalar>& w, scalar p)
{
    scalar tot = 0.0;
    for (auto v : w) tot += v;
    if (!(tot > 0.0) || e.size() != w.size() + 1) return 0.0;
    scalar U = 0.0;
    for (std::size_t k = 0; k < w.size(); ++k)
    {
        const scalar wk = w[k] / tot;
        if (U + wk >= p && wk > 0.0)
        {
            const scalar t = (p - U) / wk;
            if (e[k] <= 0.0) return t * e[k + 1];                 // inside the pan
            return std::exp(std::log(e[k])
                            + t * (std::log(e[k + 1]) - std::log(e[k])));
        }
        U += wk;
    }
    return e.back();
}


PsdMoments psdMoments(const std::vector<scalar>& edgesIn,
                      const std::vector<scalar>& centres,
                      const std::vector<scalar>& w)
{
    PsdMoments m;
    if (w.empty()) return m;
    std::vector<scalar> e = edgesIn;
    if (e.empty())
    {
        try { e = inferSizeEdges(centres); }
        catch (const std::exception&) { return m; }
    }
    if (e.size() != w.size() + 1) return m;
    scalar tot = 0.0;
    for (auto v : w) tot += v;
    if (!(tot > 0.0)) return m;
    m.d10 = passingSize(e, w, 0.10);
    m.d50 = passingSize(e, w, 0.50);
    m.d80 = passingSize(e, w, 0.80);
    m.d90 = passingSize(e, w, 0.90);
    //  Sauter on the representative sizes the stream carries:
    //  1/d32 = SUM_k w_k / xbar_k  (mass fractions -> surface per volume).
    scalar inv = 0.0;
    for (std::size_t k = 0; k < w.size(); ++k)
        if (w[k] > 0.0 && centres.size() == w.size() && centres[k] > 0.0)
            inv += (w[k] / tot) / centres[k];
    if (inv > 0.0) { m.d32 = 1.0 / inv; m.Sv = 6.0 / m.d32; }
    m.valid = true;
    return m;
}

} // namespace Choupo
