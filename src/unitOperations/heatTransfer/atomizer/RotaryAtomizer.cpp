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

#include "RotaryAtomizer.H"
#include "core/Dimensions.H"

#include <cmath>
#include <sstream>
#include <stdexcept>

namespace Choupo {

namespace { constexpr scalar PI = 3.14159265358979323846; }

RotaryAtomizer::RotaryAtomizer(const DictPtr& dict)
{
    Nrpm_  = dict->lookupScalarOrDefault("wheelSpeed", 10000.0);   // rpm
    Ddisk_ = dict->lookupScalar("wheelDiameter", Dims::length);    // m
    if (Ddisk_ <= 0.0)
        throw std::runtime_error("RotaryAtomizer: wheelDiameter must be > 0");
}

Atomizer::DropletResult RotaryAtomizer::dropletSize(const Feed& feed) const
{
    // Friedman/Marshall rotary-disc d32 -- the EXACT expression the SprayDryer
    // carried before the atomizer library (kept byte-for-byte so sprayDryer01's
    // golden master is unchanged).
    const scalar N_rev = Nrpm_ / 60.0;                      // rev/s
    const scalar Gamma = feed.mFeed / (PI * Ddisk_);        // kg/(m.s)
    DropletResult out;
    if (Gamma > 0.0 && N_rev > 0.0)
        out.d32 = 0.4 * Ddisk_
            * std::pow(Gamma / (feed.rhoL * N_rev * Ddisk_ * Ddisk_), 0.6)
            * std::pow(feed.muL / Gamma, 0.2)
            * std::pow(feed.sigma * feed.rhoL * Ddisk_ / (Gamma * Gamma), 0.1);
    // Rotary wheels give a comparatively NARROW distribution -> a higher
    // Rosin-Rammler spread than a pressure nozzle (Masters; Handbook).
    out.spread = 2.2;
    out.note   = "rotary d32 (Friedman/Marshall wheel correlation; empirical over the "
                 "tested mu/sigma/rho range)";

    // Break-up REGIME by Tanasawa's critical flow rates (Lefebvre & McDonell,
    // Atomization and Sprays pp.126-129): as the feed rises the rim goes direct
    // drop -> ligament (the design regime the Friedman d32 assumes) -> sheet
    // (broad, coarse -- a WARNING).  cgs: q cm3/s, D cm, n rpm, rho g/cm3,
    // sigma dyn/cm, mu poise.  The tip speed U = pi D N is the true lever.
    const scalar q   = (feed.rhoL > 0.0) ? feed.mFeed / feed.rhoL * 1.0e6 : 0.0;   // cm3/s
    const scalar Dcm = Ddisk_ * 100.0, n = Nrpm_;
    const scalar rho = feed.rhoL / 1000.0, sig = feed.sigma * 1000.0, mu = feed.muL * 10.0;
    const scalar U   = PI * Ddisk_ * N_rev;                                        // tip speed m/s
    std::ostringstream ex;
    ex << "; tip speed U=" << U << " m/s";
    if (q > 0.0 && Dcm > 0.0 && n > 0.0 && rho > 0.0 && sig > 0.0 && mu > 0.0)
    {
        const scalar base = std::pow(Dcm / n, 2.0 / 3.0) * (sig / rho);
        const scalar qDir = 2.8 * base / (1.0 + 10.0 * std::pow(mu / std::sqrt(rho * sig * Dcm), 1.0 / 3.0));
        const scalar qFilm = (Dcm * rho / mu < 30.0)
            ? 5.3 * base * std::pow(rho / mu, 1.0 / 3.0)
            : 20.0 * std::sqrt(Dcm) * std::pow(1.0 / n, 2.0 / 3.0) * std::pow(sig / rho, 5.0 / 6.0);
        ex << "; regime: "
           << (q <= qDir  ? "direct-drop (near-monodisperse; Friedman over-estimates here)"
             : q <  qFilm ? "ligament (design regime -- Friedman valid)"
                          : "SHEET/FILM -- broad, coarse spray; lower the feed or raise the speed");
    }

    // SHAFT POWER estimate.  Two terms: (1) the kinetic energy imparted to the
    // liquid, accelerated centre->rim to the tip speed U, P_liq = 0.5 m U^2 (EXACT);
    // (2) WINDAGE -- the wheel dragging the surrounding gas, the classic rotating-
    // disk drag (von Karman 1921 / Schlichting, Boundary Layer Theory):
    // P_wind = 0.5 C_M rho_g omega^3 R^5, C_M = 0.146 Re^-0.2 (turbulent),
    // Re = omega R^2 / nu.  This is the SMOOTH free disk -- a VANED wheel draws
    // MORE (the vanes pump air like a fan), so it is a LOWER BOUND.  eta ~ 0.9 drive.
    const scalar eta = 0.9;
    const scalar Pliq = 0.5 * feed.mFeed * U * U;                               // W (exact)
    const scalar omega = 2.0 * PI * N_rev, R = 0.5 * Ddisk_;
    scalar Pwind = 0.0;
    if (feed.rhoGas > 0.0 && feed.muGas > 0.0 && R > 0.0)
    {
        const scalar Re = omega * R * R * feed.rhoGas / feed.muGas;
        const scalar Cm = (Re > 0.0) ? 0.146 * std::pow(Re, -0.2) : 0.0;        // turbulent free disk
        Pwind = 0.5 * Cm * feed.rhoGas * omega * omega * omega * R * R * R * R * R;
    }
    out.power = (Pliq + Pwind) / eta;
    ex << "; shaft power ~" << out.power << " W (liquid KE " << Pliq
       << " + windage " << Pwind << " W [smooth-disk LOWER bound; vanes draw more] / eta="
       << eta << ")";

    out.note += ex.str();
    return out;
}

} // namespace Choupo
