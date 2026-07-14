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

#include "LiquidPhase.H"
#include "core/Constants.H"
#include "thermo/Component.H"
#include "thermo/activityCoefficient/Wilson.H"
#include "thermo/activityCoefficient/UNIFAC.H"
#include "thermo/activityCoefficient/UNIQUAC.H"

namespace Choupo {

LiquidPhase::LiquidPhase(const DictPtr& d,
                         const std::vector<std::string>& names,
                         const std::vector<Component>& comps)
:   name_(d->lookupWordOrDefault("name", "liquid")),
    components_(&comps),
    n_(names.size())
{
    DictPtr act = d->subDict("activity");
    act = injectUnifacGroups(act, names, comps);   // groups resolved from component data (validated copy)
    injectUniquacRQ(act, names, comps);      // UNIQUAC r/q from the component .dat
    // Models self-configure from the resolved components in their constructors
    // -- no Wilson dynamic_cast / setMolarVolumes dance.
    activity_ = ActivityModel::New(act, comps);
}

sVector LiquidPhase::fEffective(scalar T, scalar /*P_Pa*/, const sVector& x) const
{
    auto gamma = activity_->gamma(T, x);
    sVector f(n_);
    for (std::size_t i = 0; i < n_; ++i)
    {
        // f_i = γ_i · f_i^ref  (Pa, the canonical SI internal unit).
        //
        // The reference fugacity is the pure-liquid Psat when the species has
        // a vapour pressure.  For a NONVOLATILE species partitioned between two
        // liquid phases (LLE), Psat is undefined -- but it CANCELS EXACTLY in
        // the two-liquid ratio K = f_i^α/f_i^β, so the kernel uses a UNIT
        // reference (1 Pa) rather than forcing a fake vaporPressure into the
        // component's data.  The hammer lives HERE, explicit and announced,
        // not disguised as a bogus 1e-20 bar Psat in a duplicated record.
        const scalar fRef = (*components_)[i].hasVaporPressure()
            ? (*components_)[i].vp().Psat_Pa(T)
            : 1.0;
        f[i] = gamma[i] * fRef;
    }
    return f;
}

} // namespace Choupo
