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
\*---------------------------------------------------------------------------*/

#include "DominantEigenvalue.H"

#include <cmath>
#include <map>
#include <sstream>
#include <stdexcept>

namespace Choupo::solver {

namespace {
std::map<std::string, FixedPointAccelerator::Factory>& table()
{
    static std::map<std::string, FixedPointAccelerator::Factory> t;
    return t;
}
}

void FixedPointAccelerator::registerType(const std::string& name, Factory f)
{
    table()[name] = std::move(f);
}

bool FixedPointAccelerator::isRegistered(const std::string& name)
{
    return table().count(name) > 0;
}

std::string FixedPointAccelerator::registeredList()
{
    std::string s;
    for (const auto& kv : table()) s += (s.empty() ? "" : ", ") + kv.first;
    return s;
}

std::unique_ptr<FixedPointAccelerator>
FixedPointAccelerator::New(const std::string& name, std::size_t n,
                           scalar a, scalar b)
{
    auto it = table().find(name);
    if (it == table().end())
        throw std::runtime_error("FixedPointAccelerator::New: unknown '" + name
                                 + "'.  Registered: " + registeredList());
    return it->second(n, a, b);
}

void FixedPointAccelerator::registerBuiltins()
{
    registerType("DominantEigenvalue",
        [](std::size_t n, scalar a, scalar b) {
            return std::make_unique<DominantEigenvalue>(n, a, b);
        });
}

DominantEigenvalue::DominantEigenvalue(std::size_t n, scalar lambdaMax,
                                       scalar minCosine, int interval)
:   n_(n), lambdaMax_(lambdaMax), minCosine_(minCosine),
    interval_(interval < 1 ? 1 : interval), dPrev_(n, 0.0)
{}

sVector DominantEigenvalue::step(const sVector& x, const sVector& gx)
{
    note_.clear();
    sVector d(n_);
    scalar dd = 0.0;
    for (std::size_t i = 0; i < n_; ++i) { d[i] = gx[i] - x[i]; dd += d[i]*d[i]; }

    auto direct = [&](const std::string& why) {
        if (!why.empty()) { ++nFallback_; note_ = "direct substitution (" + why + ")"; }
        dPrev_ = d; havePrev_ = true; ++sinceExtrap_;
        return gx;
    };

    if (!havePrev_) return direct("");
    if (sinceExtrap_ < interval_) return direct("");

    scalar pp = 0.0, pd = 0.0;
    for (std::size_t i = 0; i < n_; ++i) { pp += dPrev_[i]*dPrev_[i]; pd += dPrev_[i]*d[i]; }
    std::ostringstream m; m.precision(4);
    if (pp < 1.0e-300 || dd < 1.0e-300)
        return direct("differences vanish, lambda undefined");
    const scalar lambda = pd / pp;
    const scalar cosv = std::abs(pd) / std::sqrt(pp * dd);
    lambda_ = lambda;
    if (std::abs(lambda) > lambdaMax_)
    {
        m << "lambda=" << lambda << " outside +-" << lambdaMax_;
        return direct(m.str());
    }
    if (cosv < minCosine_)
    {
        m << "lambda=" << lambda << ", |cos(d_k,d_k-1)|=" << cosv
          << " < " << minCosine_ << ": several modes alive";
        return direct(m.str());
    }
    const scalar f = lambda / (1.0 - lambda);
    sVector xn(n_);
    for (std::size_t i = 0; i < n_; ++i) xn[i] = gx[i] + f * d[i];
    ++nExtrap_;
    m << "dominant-eigenvalue extrapolation: lambda=" << lambda
      << ", lambda/(1-lambda)=" << f << ", |cos|=" << cosv;
    note_ = m.str();
    // History restarts: the extrapolated point is off the direct trajectory.
    havePrev_ = false; sinceExtrap_ = 0;
    return xn;
}

} // namespace Choupo::solver
