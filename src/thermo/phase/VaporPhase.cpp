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

#include "VaporPhase.H"
#include "core/Constants.H"
#include "thermo/Component.H"

namespace Choupo {

VaporPhase::VaporPhase(const DictPtr& d,
                       const std::vector<std::string>& names,
                       const std::vector<Component>& comps)
:   name_(d->lookupWordOrDefault("name", "vapor")),
    n_(names.size())
{
    eos_ = EquationOfState::New(d->subDict("eos"), comps);
}

sVector VaporPhase::fEffective(scalar T, scalar P_Pa, const sVector& y) const
{
    auto phi = eos_->phi(T, P_Pa, y);
    sVector f(n_);
    for (std::size_t i = 0; i < n_; ++i) f[i] = phi[i] * P_Pa;
    return f;
}

} // namespace Choupo
