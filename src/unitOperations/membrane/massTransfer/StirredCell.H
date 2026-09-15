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
    Choupo::StirredCell

Description
    Sherwood-correlation mass transfer in a STIRRED (dead-end / Amicon-type)
    cell:

        Re = omega r^2 / nu,   Sc_i = nu / D_i,
        Sh_i = a Re^b Sc_i^c,  k_c,i = Sh_i D_i / r,

    with omega the stirrer angular velocity [rad/s], r the stirrer radius
    [m] and nu = mu / rho the kinematic viscosity from the context.  The
    defaults a = 0.23, b = 0.567, c = 0.33 are the correlation Geraldes &
    Afonso, J. Membr. Sci. 300 (2007) 20-27, use for the Amicon 8200 cell of
    their Table 1 (footnote), taken from Bowen, Mohammad & Hilal, J. Membr.
    Sci. 126 (1997) 91-105.  The Reynolds number of that cell -- r = 2.4 cm,
    omega = 41.9 rad/s, nu = 8.97e-7 m2/s -- is 26907, which the paper
    prints and this model reproduces.

    WHY omega AND r ARE PARAMETERS OF THE MODEL, NOT FIELDS OF THE CONTEXT.
    `MassTransferContext` carries what the spiral-wound module MARCHES: the
    local crossflow velocity u and the channel's hydraulic diameter d_h,
    both of which change along z.  A stirred cell has neither -- its
    hydraulics are set once by the stirrer and do not move with any
    channel coordinate.  Adding omega and r to the context would give every
    channel model two slots it must ignore, and read nothing for them; the
    model holds them as parameters, declared in its own block:

        massTransfer
        {
            model     StirredCell;
            omega     41.9;           // rad/s
            radius    2.4 cm;
            // a 0.23;  b 0.567;  c 0.33;
            viscosity 8.97e-4;        // Pa.s  (read by the unit as mu)
        }

    The context's u and d_h are not read; its mu, rho and D are.
\*---------------------------------------------------------------------------*/

#pragma once

#include "MassTransferModel.H"
#include "core/Dimensions.H"

#include <cmath>
#include <stdexcept>

namespace Choupo {

class StirredCell : public MassTransferModel
{
public:
    const std::string& type() const override { return type_; }

    void readParameters(const DictPtr& d) override
    {
        a_ = d->lookupScalarOrDefault("a", 0.23);
        b_ = d->lookupScalarOrDefault("b", 0.567);
        c_ = d->lookupScalarOrDefault("c", 0.33);
        if (!d->found("omega") || !d->found("radius"))
            throw std::runtime_error(
                "massTransfer { model StirredCell; }: `omega` (rad/s) and"
                " `radius` (the stirrer radius, a length) are REQUIRED -- a"
                " stirred cell's hydraulics are its stirrer's, and the unit"
                " marches no channel that could supply them.");
        omega_  = d->lookupScalar("omega");
        radius_ = d->lookupScalar("radius", Dims::length);
        if (!(omega_ > 0.0) || !(radius_ > 0.0))
            throw std::runtime_error("massTransfer { model StirredCell; }:"
                " omega and radius must be positive");
    }

    scalar kFilm(const MassTransferContext& c) const override
    {
        if (c.D <= 0.0 || c.mu <= 0.0 || c.rho <= 0.0) return 0.0;
        const scalar nu = c.mu / c.rho;
        const scalar Re = omega_ * radius_ * radius_ / nu;
        const scalar Sc = nu / c.D;
        const scalar Sh = a_ * std::pow(Re, b_) * std::pow(Sc, c_);
        return Sh * c.D / radius_;
    }

    scalar reynolds(const MassTransferContext& c) const
    {
        return (c.mu > 0.0 && c.rho > 0.0) ? omega_ * radius_ * radius_ / (c.mu / c.rho) : 0.0;
    }

private:
    inline static const std::string type_ = "StirredCell";
    scalar a_ = 0.23, b_ = 0.567, c_ = 0.33;
    scalar omega_ = 0.0, radius_ = 0.0;
};

} // namespace Choupo
