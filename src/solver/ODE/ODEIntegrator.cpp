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
#include "RK4.H"
#include "EulerSI.H"
#include "Rosenbrock23.H"

#include <stdexcept>

namespace Choupo::solver
{

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
        throw std::runtime_error("Unknown ODE integrator '" + name
            + "' (known: RK4, EulerSI, Rosenbrock23)");
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
}

} // namespace Choupo::solver
