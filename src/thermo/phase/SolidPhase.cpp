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

#include "SolidPhase.H"
#include "thermo/Component.H"

#include <stdexcept>

namespace Choupo {

SolidPhase::SolidPhase(const DictPtr& d,
                       const std::vector<std::string>& /*names*/,
                       const std::vector<Component>& /*comps*/)
:   name_(d->lookupWordOrDefault("name", "solid"))
{
    const std::string m = d->lookupWordOrDefault("mode", "inert");
    if      (m == "inert")         mode_ = Mode::Inert;
    else if (m == "crystallizing") mode_ = Mode::Crystallizing;
    else throw std::runtime_error(
        "SolidPhase: unknown mode '" + m + "' (expected 'inert' or 'crystallizing')");
}

sVector SolidPhase::fEffective(scalar, scalar, const sVector&) const
{
    if (mode_ == Mode::Inert)
        throw std::runtime_error(
            "SolidPhase[inert] '" + name_ + "': does not participate in "
            "phase equilibrium.  Inert solids are propagated as a phase of "
            "the Stream, but the flash must skip them.  This path will be "
            "implemented.");
    throw std::runtime_error(
        "SolidPhase[crystallizing] '" + name_ + "': SLE is scheduled "
        "for.  The Phase abstraction is in place; only fEffective() "
        "needs a concrete model (e.g. pure-crystal reference fugacity).");
}

} // namespace Choupo
