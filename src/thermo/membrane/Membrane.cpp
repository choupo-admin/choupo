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

#include "Membrane.H"

#include <stdexcept>

namespace Choupo {

void Membrane::readFromDict(const DictPtr& d)
{
    name_         = d->lookupWordOrDefault("name", "");
    kind_         = d->lookupWordOrDefault("kind", "");
    manufacturer_ = d->lookupWordOrDefault("manufacturer", "");

    A_w_      = d->lookupScalar       ("A_w", Dims::permeabilityWater);   // required
    P_max_    = d->lookupScalarOrDefault("P_max",    0.0);
    T_max_    = d->lookupScalarOrDefault("T_max",    0.0);
    pH_min_   = d->lookupScalarOrDefault("pH_min",   0.0);
    pH_max_   = d->lookupScalarOrDefault("pH_max",   0.0);
    MWCO_     = d->lookupScalarOrDefault("MWCO",     0.0);

    // Per-solute permeabilities: a sub-dict where each entry maps a
    // component name to its B_s.  Example:
    //   permeabilities
    //   {
    //       NaCl     1.2e-7;
    //       glucose  3.5e-8;
    //   }
    if (d->found("permeabilities"))
    {
        auto sd = d->subDict("permeabilities");
        for (const auto& key : sd->keys())
            Bs_[key] = sd->lookupScalar(key, Dims::permeabilitySolute);
    }

    // ---- DSPM-DE charged-pore tier (optional) ------------------------------
    // A `poreModel { ... }` block carries the Donnan-steric-dielectric geometry.
    // r_p (raw SI metres, like ions.dat radius) and the porosity-over-thickness
    // (either as `porosityOverThickness` directly, or `porosity` + `thickness`)
    // are MANDATORY when the block is present; X_d and eps_p are optional (their
    // absence = steric-only / Born-off, handled by DSPM_DE).  A membrane WITHOUT
    // the block cannot select DSPM-DE -- the transport law refuses loudly.
    if (d->found("poreModel"))
    {
        auto pm = d->subDict("poreModel");
        hasPore_ = true;

        r_p_ = pm->lookupScalar("poreRadius");      // [m], raw SI

        if (pm->found("porosityOverThickness"))
        {
            AkdX_ = pm->lookupScalar("porosityOverThickness");   // [1/m]
        }
        else if (pm->found("porosity") && pm->found("thickness"))
        {
            const scalar A_k = pm->lookupScalar("porosity");      // [-]
            const scalar dx  = pm->lookupScalar("thickness");     // [m]
            if (dx <= 0.0)
                throw std::runtime_error("Membrane '" + name_ + "' poreModel{}: "
                    "`thickness` must be > 0");
            AkdX_ = A_k / dx;
        }
        else
        {
            throw std::runtime_error("Membrane '" + name_ + "' poreModel{}: "
                "needs either `porosityOverThickness <A_k/delta_x [1/m]>;` OR "
                "both `porosity <A_k [-]>;` and `thickness <delta_x [m]>;`.");
        }
        if (r_p_ <= 0.0 || AkdX_ <= 0.0)
            throw std::runtime_error("Membrane '" + name_ + "' poreModel{}: "
                "poreRadius and porosity/thickness must be > 0.");

        // X_d: signed fixed charge density [mol/m^3].  Absent => 0 (steric only).
        if (pm->found("chargeDensity"))
        {
            X_d_   = pm->lookupScalar("chargeDensity");   // [mol/m^3], signed
            hasXd_ = true;
        }
        // eps_p: pore dielectric [-].  Absent => 0 => DSPM_DE uses epsWater(T)
        // (Born term off = plain DSPM with Donnan only).
        eps_p_ = pm->lookupScalarOrDefault("poreDielectric", 0.0);
        if (pm->found("poreDielectric") && eps_p_ <= 0.0)
            throw std::runtime_error("Membrane '" + name_ + "' poreModel{}: "
                "`poreDielectric` must be > 0 (it is a relative permittivity).");
    }
}

scalar Membrane::B_s(const std::string& solute) const
{
    auto it = Bs_.find(solute);
    return (it == Bs_.end()) ? 0.0 : it->second;
}

} // namespace Choupo
