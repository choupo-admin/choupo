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
    Choupo::SchockMiquel

Description
    Sherwood-correlation mass transfer for a spacer-filled feed channel:

        Re = rho u d_h / mu,   Sc = mu / (rho D),
        Sh = a Re^b Sc^c,      k_film = Sh D / d_h.

    Defaults a = 0.065, b = 0.875, c = 0.25 (Schock & Miquel, Desalination
    64 (1987) 339).  a / b / c are calibratable, so other spacer fits
    (Da Costa, Koutsou, Guillen-Hoek) are reached by changing them.
\*---------------------------------------------------------------------------*/

#pragma once

#include "MassTransferModel.H"
#include "thermo/Dimensionless.H"

#include <cmath>

namespace Choupo {

class SchockMiquel : public MassTransferModel
{
public:
    const std::string& type() const override { return type_; }

    void readParameters(const DictPtr& d) override
    {
        a_ = d->lookupScalarOrDefault("a", 0.065);
        b_ = d->lookupScalarOrDefault("b", 0.875);
        c_ = d->lookupScalarOrDefault("c", 0.25);
    }

    scalar kFilm(const MassTransferContext& c) const override
    {
        if (c.d_h <= 0.0 || c.D <= 0.0 || c.mu <= 0.0 || c.rho <= 0.0)
            return 0.0;
        const scalar Re = dimensionless::reynolds(c.rho, c.u, c.d_h, c.mu);
        const scalar Sc = dimensionless::schmidt(c.mu, c.rho, c.D);
        const scalar Sh = a_ * std::pow(Re, b_) * std::pow(Sc, c_);
        return Sh * c.D / c.d_h;
    }

private:
    inline static const std::string type_ = "SchockMiquel";
    scalar a_ = 0.065, b_ = 0.875, c_ = 0.25;
};

} // namespace Choupo
