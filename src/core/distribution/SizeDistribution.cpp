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

#include "core/distribution/SizeDistribution.H"

#include "core/distribution/TabularSizeDistribution.H"
#include "core/distribution/RosinRammler.H"
#include "core/distribution/LogNormalSize.H"

#include <cmath>
#include <stdexcept>

namespace Choupo {

std::map<std::string, SizeDistribution::Factory>& SizeDistribution::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}


void SizeDistribution::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}


std::vector<std::string> SizeDistribution::availableTypes()
{
    std::vector<std::string> names;
    for (const auto& kv : registry()) names.push_back(kv.first);
    return names;
}


std::unique_ptr<SizeDistribution> SizeDistribution::New(const DictPtr& d)
{
    if (!d->found("model"))
        throw std::runtime_error("sizeDistribution: no `model` declared.  "
            "Choose one of the registered models, or `tabular` with explicit "
            "`diameters`/`massFractions`.  A distribution with no model is a "
            "table pretending to be a physical claim.");
    const std::string m = d->lookupWord("model");
    auto it = registry().find(m);
    if (it == registry().end())
    {
        std::string avail;
        for (const auto& kv : registry()) avail += " " + kv.first;
        throw std::runtime_error("sizeDistribution: unknown model '" + m
            + "'.  Registered:" + (avail.empty() ? " (none)" : avail));
    }
    return it->second(d);
}


void SizeDistribution::registerBuiltins()
{
    //  EXPLICIT, and in one readable place -- the same posture as
    //  UnitOperation::registerBuiltins.  A student can see the whole family
    //  without grepping for a macro.
    registerType("tabular",
        [](const DictPtr& d) { return TabularSizeDistribution::create(d); });
    registerType("RosinRammler",
        [](const DictPtr& d) { return RosinRammler::create(d); });
    registerType("logNormal",
        [](const DictPtr& d) { return LogNormalSize::create(d); });
}


//  NUMERICAL FALLBACK for the raw moment.  Simpson on a log-spaced grid,
//  which suits distributions spanning decades of diameter far better than a
//  uniform one.  A subclass with a closed form overrides this and the
//  integration never runs -- which is exactly the split OpenFOAM draws with
//  its `unintegrable` base.
scalar SizeDistribution::rawMoment(int n) const
{
    const scalar a = dMin(), b = dMax();
    if (!(b > a)) return 0.0;

    const int N = 2000;                       // even, for Simpson
    const scalar la = std::log(a), lb = std::log(b);
    const scalar h = (lb - la) / N;

    //  Substituting d = exp(u) gives INT f(d) d^n dd = INT f(e^u) e^{u(n+1)} du
    auto g = [&](scalar u)
    {
        const scalar d = std::exp(u);
        return pdf(d) * std::pow(d, n + 1);
    };

    scalar s = g(la) + g(lb);
    for (int i = 1; i < N; ++i)
        s += g(la + i * h) * ((i % 2) ? 4.0 : 2.0);
    return s * h / 3.0;
}


scalar SizeDistribution::moment(int k, int basis) const
{
    //  m_k^(S) = INT d^(k+S-Q) f_Q dd / INT d^(S-Q) f_Q dd
    const int shift = basis - Q_;
    const scalar num = rawMoment(k + shift);
    const scalar den = rawMoment(shift);
    if (den <= 0.0)
        throw std::runtime_error("sizeDistribution: the normalising moment is "
            "zero or negative -- the distribution has no mass in the requested "
            "basis, so no mean exists in it.");
    return num / den;
}


scalar SizeDistribution::d32() const
{
    //  Sauter: the ratio of the third to the second moment OF THE NUMBER
    //  density.  Written through `moment` so the basis conversion is the one
    //  shared implementation rather than a second, hand-rolled one here.
    const scalar m3 = rawMoment(3 - Q_ + 0);   //  INT d^3 f_number
    const scalar m2 = rawMoment(2 - Q_ + 0);   //  INT d^2 f_number
    if (m2 <= 0.0)
        throw std::runtime_error("sizeDistribution: d32 undefined -- the "
            "second moment of the number density is not positive.");
    return m3 / m2;
}


scalar SizeDistribution::dPercentile(scalar p, int basis) const
{
    if (!(p > 0.0 && p < 1.0))
        throw std::runtime_error("sizeDistribution: percentile must lie "
            "strictly between 0 and 1 (d50 is p = 0.5).");

    //  Bisection on the cumulative in the REQUESTED basis.  Monotone by
    //  construction, so bisection cannot miss; ~50 halvings is exact to
    //  double precision over any physical size range.
    const int shift = basis - Q_;
    const scalar total = rawMoment(shift);
    if (total <= 0.0)
        throw std::runtime_error("sizeDistribution: no mass in the requested "
            "basis, so no percentile exists in it.");

    auto below = [&](scalar x)
    {
        //  partial INT_a^x d^shift f_Q dd, by the same log-Simpson rule
        const scalar a = dMin();
        if (x <= a) return 0.0;
        const int N = 400;
        const scalar la = std::log(a), lx = std::log(x);
        const scalar h = (lx - la) / N;
        auto g = [&](scalar u)
        {
            const scalar d = std::exp(u);
            return pdf(d) * std::pow(d, shift + 1);
        };
        scalar s = g(la) + g(lx);
        for (int i = 1; i < N; ++i)
            s += g(la + i * h) * ((i % 2) ? 4.0 : 2.0);
        return s * h / 3.0;
    };

    scalar lo = dMin(), hi = dMax();
    for (int it = 0; it < 100; ++it)
    {
        const scalar mid = 0.5 * (lo + hi);
        if (below(mid) / total < p) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
}


void SizeDistribution::toTabular(int nBins,
                                 std::vector<scalar>& diameter,
                                 std::vector<scalar>& massFrac) const
{
    if (nBins < 2)
        throw std::runtime_error("sizeDistribution: nBins must be >= 2 to "
            "discretise a continuous law.");

    diameter.clear();
    massFrac.clear();
    diameter.reserve(nBins);
    massFrac.reserve(nBins);

    //  Log-spaced EDGES, representative diameter at the geometric centre --
    //  the convention a sieve stack imposes and the one every consumer here
    //  already assumes.
    const scalar la = std::log(dMin()), lb = std::log(dMax());
    const scalar h = (lb - la) / nBins;

    const int shift = momentBasis::volume - Q_;   // mass-weighted bins
    scalar sum = 0.0;
    std::vector<scalar> w(nBins, 0.0);

    for (int k = 0; k < nBins; ++k)
    {
        const scalar u0 = la + k * h, u1 = la + (k + 1) * h;
        const scalar d0 = std::exp(u0), d1 = std::exp(u1);
        diameter.push_back(std::sqrt(d0 * d1));

        //  three-point Simpson across the bin in log space
        const scalar um = 0.5 * (u0 + u1);
        auto g = [&](scalar u)
        {
            const scalar d = std::exp(u);
            return pdf(d) * std::pow(d, shift + 1);
        };
        w[k] = (g(u0) + 4.0 * g(um) + g(u1)) * (u1 - u0) / 6.0;
        sum += w[k];
    }

    if (sum <= 0.0)
        throw std::runtime_error("sizeDistribution: discretisation produced no "
            "mass -- check the declared support (dMin/dMax) against the "
            "model's parameters.");

    for (int k = 0; k < nBins; ++k) massFrac.push_back(w[k] / sum);
}

} // namespace Choupo
