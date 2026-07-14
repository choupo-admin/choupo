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

#include "HenrysLaw.H"
#include "thermo/ThermoAnnounce.H"
#include <iostream>
#include "core/Constants.H"

#include <cmath>
#include <stdexcept>

namespace Choupo {

void HenrysLaw::readFromDict(const DictPtr& d)
{
    solute_  = d->lookupWord("solute");
    solvent_ = d->lookupWord("solvent");
    model_   = d->lookupWordOrDefault("model", "vantHoff");
    if (model_ != "vantHoff")
        throw std::runtime_error("HenrysLaw '" + solute_ + "-" + solvent_ +
            "': only `model vantHoff;` is implemented");

    H_ref_   = d->lookupScalar("H_ref",   Dims::pressure);
    T_ref_   = d->lookupScalar("T_ref",   Dims::temperature);
    dHdiss_  = d->lookupScalar("enthalpy", Dims::molarEnergy);

    // Optional Krichevsky-Kasarnovsky / Krichevsky-Ilinskaya constants.
    v_inf_     = d->lookupScalarOrDefault("v_inf",     0.0);   // m^3/mol (raw SI)
    margulesA_ = d->lookupScalarOrDefault("margulesA", 0.0);   // J/mol   (raw SI)

    if (d->found("Trange"))
    {
        auto r = d->lookupList("Trange");
        if (r.size() == 2) { T_min_ = r[0]; T_max_ = r[1]; hasTrange_ = true; }
    }
}

scalar HenrysLaw::H(scalar T) const
{
    // Round-4 (professor): Trange was stored but never consumed -- silent
    // extrapolation.  Announce it once per pair per run; never refuse (the
    // van't Hoff form extrapolates smoothly and refusing would break sweeps),
    // but the student SEES the model leave its data.
    if (T < T_min_ || T > T_max_)
        if (announceOnce("henryTrange:" + solute_ + "-" + solvent_))
            std::cerr << "[henry] " << solute_ << "-" << solvent_
                      << ": T = " << T << " K is outside "
                      << (hasTrange_ ? "the fitted Trange [" : "the DEFAULT window [")
                      << T_min_ << ", " << T_max_ << "]"
                      << (hasTrange_ ? "" : " (no Trange declared in the pair file)")
                      << " -- van't Hoff EXTRAPOLATION, treat with caution.\n";
    // van't Hoff:  H(T) = H_ref * exp[ +dHdiss/R * (1/T - 1/T_ref) ]
    //
    // Sign: from d(ln K_sol)/dT = dHdiss/(R T^2) with K_sol = 1/H, so
    //   ln H = ln H_ref + dHdiss/R * (1/T - 1/T_ref).
    // With dHdiss < 0 (exothermic dissolution) and T > T_ref, both
    // factors are negative -> exp(+) > 1 -> H RISES with T, i.e. the
    // gas is LESS soluble hot (ammonia boils out of warm water).  The
    // earlier `-dHdiss` inverted this; it was latent because every case
    // ran at T_ref = 298 K, where H = H_ref regardless of sign.
    return H_ref_ * std::exp(dHdiss_ / constant::R * (1.0/T - 1.0/T_ref_));
}

} // namespace Choupo
