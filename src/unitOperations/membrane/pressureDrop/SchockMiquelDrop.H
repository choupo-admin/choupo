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
Class
    Choupo::SchockMiquelDrop

Description
    Spacer-channel friction pressure drop (Schock & Miquel, Desalination 64
    (1987) 339):

        Re = rho u d_h / mu,   lambda = a Re^-b,
        dP/dz = lambda * rho u^2 / (2 d_h).

    Defaults a = 6.23, b = 0.3.  Calibratable (other spacer fits are the same
    power-law form with different a / b).
\*---------------------------------------------------------------------------*/

#pragma once

#include "PressureDropModel.H"

#include <cmath>

namespace Choupo {

class SchockMiquelDrop : public PressureDropModel
{
public:
    const std::string& type() const override { return type_; }

    void readParameters(const DictPtr& d) override
    {
        a_ = d->lookupScalarOrDefault("a", 6.23);
        b_ = d->lookupScalarOrDefault("b", 0.30);
    }

    scalar dPdz(const PressureDropContext& c) const override
    {
        if (c.d_h <= 0.0 || c.mu <= 0.0 || c.rho <= 0.0 || c.u <= 0.0)
            return 0.0;
        const scalar Re     = c.rho * c.u * c.d_h / c.mu;
        const scalar lambda = a_ * std::pow(Re, -b_);
        return lambda * c.rho * c.u * c.u / (2.0 * c.d_h);
    }

private:
    inline static const std::string type_ = "SchockMiquel";
    scalar a_ = 6.23, b_ = 0.30;
};

} // namespace Choupo
