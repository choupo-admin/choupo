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

namespace Choupo {

LiquidPhase::LiquidPhase(const DictPtr& d,
                         const std::vector<std::string>& names,
                         const std::vector<Component>& comps)
:   name_(d->lookupWordOrDefault("name", "liquid")),
    components_(&comps),
    n_(names.size())
{
    DictPtr act = d->subDict("activity");
    injectUnifacGroups(act, names, comps);   // UNIFAC groups from the component .dat
    activity_ = ActivityModel::New(act, names);

    // Wilson needs pure-component molar volumes injected after construction.
    if (auto* w = dynamic_cast<Wilson*>(activity_.get()))
    {
        sVector V(n_);
        for (std::size_t i = 0; i < n_; ++i) V[i] = comps[i].Vliq();
        w->setMolarVolumes(V);
    }
}

sVector LiquidPhase::fEffective(scalar T, scalar /*P_Pa*/, const sVector& x) const
{
    auto gamma = activity_->gamma(T, x);
    sVector f(n_);
    for (std::size_t i = 0; i < n_; ++i)
    {
        // f_i = γ_i · Psat_i  (in Pa, the canonical SI internal unit).
        // The older code multiplied a bar-valued Psat by
        // bar_to_Pa here; now that Psat_Pa is already in Pa the
        // multiplication is gone.
        f[i] = gamma[i] * (*components_)[i].vp().Psat_Pa(T);
    }
    return f;
}

} // namespace Choupo
