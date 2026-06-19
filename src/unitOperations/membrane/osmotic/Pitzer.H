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
    Choupo::Pitzer

Description
    Pitzer ion-interaction osmotic coefficient for a 1:1 electrolyte:

        phi = 1 - A_phi sqrt(I)/(1 + b sqrt(I)) + m B^phi + m^2 C^phi,
        B^phi = beta0 + beta1 exp(-alpha sqrt(I)),
        I ~ m ~ c  (1:1 salt, dilute-molality approximation),

    and the osmotic pressure  pi = phi(I) * nu R T c.  Defaults are NaCl at
    25 C; all coefficients are calibratable.
\*---------------------------------------------------------------------------*/

#pragma once

#include "OsmoticModel.H"

#include <cmath>

namespace Choupo {

class Pitzer : public OsmoticModel
{
public:
    const std::string& type() const override { return type_; }

    void readParameters(const DictPtr& d) override
    {
        A_phi_ = d->lookupScalarOrDefault("A_phi", 0.391);
        b_     = d->lookupScalarOrDefault("b",     1.2);
        alpha_ = d->lookupScalarOrDefault("alpha", 2.0);
        beta0_ = d->lookupScalarOrDefault("beta0", 0.0765);
        beta1_ = d->lookupScalarOrDefault("beta1", 0.2664);
        Cphi_  = d->lookupScalarOrDefault("Cphi",  0.00127);
    }

    scalar osmoticPressure(const OsmoticContext& c) const override
    {
        const scalar m = c.c;            // kmol/m^3 ~ mol/kg (dilute aqueous)
        if (m <= 0.0) return 0.0;
        const scalar sI    = std::sqrt(m);        // I = m for a 1:1 salt
        const scalar Bphi  = beta0_ + beta1_ * std::exp(-alpha_ * sI);
        const scalar phi   = 1.0
            - A_phi_ * sI / (1.0 + b_ * sI)
            + m * Bphi
            + m * m * Cphi_;
        return phi * c.nu * R_Pa_kmol * c.T * c.c;
    }

private:
    inline static const std::string type_ = "Pitzer";
    scalar A_phi_ = 0.391, b_ = 1.2, alpha_ = 2.0;
    scalar beta0_ = 0.0765, beta1_ = 0.2664, Cphi_ = 0.00127;
};

} // namespace Choupo
