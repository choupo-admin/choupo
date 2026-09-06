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

#include "ChungViscosity.H"
#include "core/Advisory.H"
#include "thermo/Component.H"

#include <cmath>
#include <string>

namespace Choupo {

scalar ChungViscosity::neufeldOmega(scalar Tstar)
{
    return 1.16145 / std::pow(Tstar, 0.14874)
         + 0.52487 / std::exp(0.77320 * Tstar)
         + 2.16178 / std::exp(2.43787 * Tstar);
}

scalar ChungViscosity::kernel(scalar M, scalar Tc, scalar Pc, scalar w, scalar T)
{
    // Critical volume from Zc(omega): Vc = Zc R Tc / Pc  [cm^3/mol].
    const scalar Zc        = 0.2918 - 0.0928 * w;
    const scalar R_cm3_bar = 83.14;                 // cm^3·bar/(mol·K)
    const scalar Vc        = Zc * R_cm3_bar * Tc / Pc;

    // Neufeld collision integral at Chung's reduced temperature.
    const scalar Tstar = 1.2593 * T / Tc;
    const scalar Omega = neufeldOmega(Tstar);

    const scalar Fc = 1.0 - 0.2756 * w;             // non-polar

    // Chung low-pressure gas viscosity in micropoise, then -> Pa·s.
    const scalar eta_uP = 40.785 * Fc * std::sqrt(M * T)
                        / (std::pow(Vc, 2.0 / 3.0) * Omega);
    return eta_uP * 1.0e-7;                          // 1 μP = 1e-7 Pa·s
}

scalar ChungViscosity::viscosityGasPure(const Component& c, scalar T) const
{
    //  ANNOUNCED, not commented (2026-09-05).  The two departures from the
    //  1988 paper below are facts about THIS run's answer for THIS component,
    //  so they ride the AdvisoryLog into the result JSON and the end-of-run
    //  caveat block.  The log deduplicates on (category, locus, message), so
    //  a package rebuilt per pass announces each component once per run.
    AdvisoryLog::instance().add(
        "model", "info",
        "Chung gas viscosity, component '" + c.name() + "'",
        "Vc ESTIMATED as Zc R Tc / Pc with Zc = 0.2918 - 0.0928 omega (no"
        " catalogue record carries a critical volume), and the polar (mu_r)"
        " and association (kappa) terms of Chung et al. (1988) are DROPPED"
        " -- the non-polar truncation F_c = 1 - 0.2756 omega is applied to"
        " this component whatever its polarity");

    return kernel(c.MW(), c.Tc(), c.Pc(), c.omega(), T);
}

std::string ChungViscosity::windowNote(const Component& c, scalar T) const
{
    const scalar Tstar = 1.2593 * T / c.Tc();
    if (Tstar < 0.3 || Tstar > 100.0)
        return "T* = " + std::to_string(Tstar) + " is outside the Neufeld"
               " fit's stated domain 0.3 <= T* <= 100 -- the collision"
               " integral is extrapolated";
    return "";
}

CorrelationVerify ChungViscosity::verify() const
{
    //  ARITHMETIC, not physics.  The Neufeld fit at T* = 1 is the sum of its
    //  three published terms; the literal below was computed ONCE from the
    //  coefficients as printed in the paper and written here as a number, so
    //  a mis-typed coefficient or exponent fails while the code's own
    //  evaluation of the same sum would not.  It says nothing about whether
    //  Chung's correlation is right for any gas -- the catalogue holds no
    //  measured viscosity to say that with.
    CorrelationVerify v;
    v.value_choupo = neufeldOmega(1.0);
    v.value_published = 1.592520;
    v.dev = std::abs(v.value_choupo - v.value_published) / v.value_published;
    v.kind = "arithmetic";
    v.anchor = "Neufeld Omega_v at T* = 1: the fit's own three-term value "
               "1.59252, written as a literal.  This arm checks the "
               "TRANSCRIPTION of the collision-integral fit, not the physics";
    return v;
}

} // namespace Choupo
