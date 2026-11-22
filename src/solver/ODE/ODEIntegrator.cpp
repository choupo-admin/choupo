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

#include "ODEIntegrator.H"
#include "core/RegistryRefusal.H"
#include "RK4.H"
#include "EulerSI.H"
#include "Rosenbrock23.H"
#include "Seulex.H"

#include <algorithm>
#include <map>
#include <memory>
#include <stdexcept>

namespace Choupo::solver
{

std::size_t SparsePattern::find(std::size_t i, std::size_t j) const
{
    const auto b = col.begin() + static_cast<std::ptrdiff_t>(rowPtr[i]);
    const auto e = col.begin() + static_cast<std::ptrdiff_t>(rowPtr[i + 1]);
    const auto it = std::lower_bound(b, e, j);
    return (it != e && *it == j) ? static_cast<std::size_t>(it - col.begin())
                                 : static_cast<std::size_t>(-1);
}

std::vector<sVector> SparseJacobian::dense(const SparsePattern& p) const
{
    std::vector<sVector> J(p.n, sVector(p.n, 0.0));
    for (std::size_t i = 0; i < p.n; ++i)
        for (std::size_t q = p.rowPtr[i]; q < p.rowPtr[i + 1]; ++q)
            J[i][p.col[q]] = values[q];
    if (!u.empty() && !v.empty())
    {
        const std::vector<std::size_t> b = blocks.empty()
            ? std::vector<std::size_t>{0, p.n} : blocks;
        for (std::size_t k = 0; k + 1 < b.size(); ++k)
            for (std::size_t i = b[k]; i < b[k + 1]; ++i)
                if (u[i] != 0.0)
                    for (std::size_t j = b[k]; j < b[k + 1]; ++j)
                        if (v[j] != 0.0) J[i][j] += u[i] * v[j];
    }
    return J;
}

std::map<std::string, ODEIntegrator::Factory>& ODEIntegrator::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void ODEIntegrator::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

bool ODEIntegrator::known(const std::string& name)
{
    return registry().count(name) != 0;
}

std::unique_ptr<ODEIntegrator> ODEIntegrator::New(const std::string& name)
{
    auto it = registry().find(name);
    if (it == registry().end())
        throw std::runtime_error(registryRefusal::message(
            "ODE integrator", name, registryRefusal::keysOf(registry())));
    return it->second();
}

// Explicit registration -- no static-init macros (pedagogical clarity, and no
// linker discard surprises).  Called once at start-up.
void ODEIntegrator::registerBuiltins()
{
    registerType("RK4",
        [] { return std::make_unique<RK4>(); });
    registerType("EulerSI",
        [] { return std::make_unique<EulerSI>(); });
    registerType("Rosenbrock23",
        [] { return std::make_unique<Rosenbrock23>(); });
    registerType("Rodas4",
        [] { return std::make_unique<Rosenbrock23>(
                 Rosenbrock23::Scheme::Rodas4); });
    registerType("seulex",
        [] { return std::make_unique<Seulex>(); });
}

} // namespace Choupo::solver
