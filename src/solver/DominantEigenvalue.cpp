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
                           const DominantEigenvalueOptions& o)
{
    auto it = table().find(name);
    if (it == table().end())
        throw std::runtime_error("FixedPointAccelerator::New: unknown '" + name
                                 + "'.  Registered: " + registeredList());
    return it->second(n, o);
}

void FixedPointAccelerator::registerBuiltins()
{
    registerType("DominantEigenvalue",
        [](std::size_t n, const DominantEigenvalueOptions& o) {
            return std::make_unique<DominantEigenvalue>(n, o);
        });
}

DominantEigenvalue::DominantEigenvalue(std::size_t n,
                                       const DominantEigenvalueOptions& o)
:   n_(n), o_(o), dPrev_(n, 0.0)
{}

sVector DominantEigenvalue::step(const sVector& x, const sVector& gx)
{
    note_.clear();
    // d = X_n - X_{n-1} in the paper's notation (X_{n-1} = x, X_n = gx).
    sVector d(n_);
    scalar dd = 0.0;
    for (std::size_t i = 0; i < n_; ++i) { d[i] = gx[i] - x[i]; dd += d[i]*d[i]; }

    ++count_;
    auto direct = [&](const std::string& why) {
        if (!why.empty()) { ++nFallback_; note_ = "direct substitution (" + why + ")"; }
        dPrev_ = d;
        return gx;
    };

    if (count_ < 2) return direct("");

    scalar pp = 0.0, pd = 0.0;
    for (std::size_t i = 0; i < n_; ++i) { pp += dPrev_[i]*dPrev_[i]; pd += dPrev_[i]*d[i]; }
    if (pp < 1.0e-300 || dd < 1.0e-300)
    {
        haveLambda_ = false;
        return direct("differences vanish, lambda undefined");
    }
    // Eq 17 (norm ratio) with the sign of the projection (rule (b)).
    const scalar mag    = std::sqrt(dd / pp);
    const scalar lambda = (pd < 0.0 ? -mag : mag);
    const scalar cosv   = std::abs(pd) / std::sqrt(pp * dd);

    const bool   hadLambda  = haveLambda_;
    const scalar lambdaPrev = lambdaPrev_;
    haveLambda_ = true;
    lambdaPrev_ = lambda;

    // Eq 15 holds when successive apparent lambda are close; needs two
    // lambda, i.e. three differences = the paper's "three more iterations".
    if (!hadLambda) return direct("");
    std::ostringstream m; m.precision(4);
    if (std::abs(lambda - lambdaPrev) > o_.lambdaTol * std::abs(lambda))
        return direct("");   // Eq 15 not yet obeyed: not an event, keep iterating
    if (std::abs(lambda) > o_.lambdaMax)
    {
        m << "lambda=" << lambda << " outside +-" << o_.lambdaMax;
        return direct(m.str());
    }
    if (cosv < o_.minCosine)
    {
        m << "lambda=" << lambda << ", |cos(dX_n,dX_n-1)|=" << cosv
          << " < " << o_.minCosine << ": differences not parallel (complex or several modes)";
        return direct(m.str());
    }
    // Eq 18:  X_s' = X_{n-1} + alpha (X_n - X_{n-1}) / (1 - lambda).
    const scalar f = o_.alpha / (1.0 - lambda);
    sVector xn(n_);
    for (std::size_t i = 0; i < n_; ++i) xn[i] = x[i] + f * d[i];
    ++nExtrap_;
    m << "dominant-eigenvalue move (Orbach-Crowe Eq 18): lambda=" << lambda
      << ", alpha=" << o_.alpha << ", |cos|=" << cosv;
    if (lambda > 0.0)   // Eq 21; the paper's lambda<0 example does not follow from it
        m << ", estimated true error = " << lambda / (1.0 - lambda) << " x |dX|";
    note_ = m.str();
    // The moved point is off the direct trajectory: restart the count (rule (d)).
    count_ = 0; haveLambda_ = false;
    return xn;
}

} // namespace Choupo::solver
