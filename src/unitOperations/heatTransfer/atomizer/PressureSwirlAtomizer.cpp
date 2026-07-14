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

#include "PressureSwirlAtomizer.H"
#include "core/Dimensions.H"

#include <cmath>
#include <string>
#include <stdexcept>

namespace Choupo {

namespace { constexpr scalar PI = 3.14159265358979323846; }

PressureSwirlAtomizer::PressureSwirlAtomizer(const DictPtr& dict)
{
    correlation_ = dict->lookupWordOrDefault("correlation", "classAverage");
    // deltaP is now OPTIONAL: the atomising pressure normally comes from the FEED
    // stream (pFeed - pChamber, imposed by the pump).  `deltaP` is an override for
    // a bare-atomiser study where no feed pressure is set.  Resolved in dropletSize.
    dP_          = dict->lookupScalarOrDefault("deltaP", 0.0, Dims::pressure);   // Pa
    filmT_       = dict->lookupScalarOrDefault("filmThickness", 5.0e-5);    // m
    // half spray-cone angle; default 60 deg, accepted in radians via the dict.
    coneHalf_    = dict->lookupScalarOrDefault("coneAngle", PI / 3.0);      // rad
}

Atomizer::DropletResult PressureSwirlAtomizer::dropletSize(const Feed& feed) const
{
    DropletResult out;
    out.spread = 1.8;   // wider than a rotary wheel (Masters; Handbook)

    // The atomising pressure = the FEED stream pressure above the chamber (the pump
    // imposes it); fall back to the `deltaP` override for a bare study.  vf follows
    // the stream, not a free knob.
    const bool fromStream = (feed.pFeed > feed.pChamber);
    const scalar dP = fromStream ? (feed.pFeed - feed.pChamber) : dP_;
    if (dP <= 0.0)
        throw std::runtime_error("PressureSwirlAtomizer: no atomising pressure -- give the "
            "feed stream a pressure above the chamber, or an operation `deltaP` override");
    const char* pSrc = fromStream ? " [dP = feed pressure - chamber]" : " [dP = operation override]";

    // Pumping SHAFT power: hydraulic Q*dP, over a pump efficiency (~0.7).
    const scalar eta = 0.7;
    out.power = (feed.rhoL > 0.0) ? (feed.mFeed / feed.rhoL) * dP / eta : 0.0;   // W
    const std::string pNote = std::string(pSrc) + "; pump shaft power ~"
        + std::to_string(out.power) + " W (Q*dP / eta=" + std::to_string(eta) + ")";

    if (correlation_ == "wangLefebvre")
    {
        // Physics-based two-term SMD (Wang & Lefebvre 1987, DOI 10.2514/3.22946):
        // resolves sigma and mu_L, so a viscous/low-tension feed -> coarser drop.
        const scalar tcos = filmT_ * std::cos(coneHalf_);
        const scalar t1 = 4.52 * std::pow(feed.sigma * feed.muL * feed.muL
                              / (feed.rhoGas * dP * dP), 0.25)
                              * std::pow(tcos, 0.25);
        const scalar t2 = 0.39 * std::pow(feed.sigma * feed.rhoL
                              / (feed.rhoGas * dP), 0.25)
                              * std::pow(tcos, 0.75);
        out.d32  = t1 + t2;
        out.note = "pressure-swirl d32 (Wang & Lefebvre 1987, DOI 10.2514/3.22946; "
                   "two-term, resolves sigma & mu_L; sensitive to film thickness t "
                   "and cone angle -- supply them or the defaults are rough)" + pNote;
        return out;
    }

    // DEFAULT -- the class-average design curve d32[um] = 9575 * dP[Pa]^(-1/3)
    // (Marshall 1954 / Handbook of Industrial Drying), 1e-6 -> metres.  ONE input;
    // it is what the course's casein/whey problems use.  NOT property-resolved.
    out.d32  = 9575.0 * std::pow(dP, -1.0 / 3.0) * 1.0e-6;
    out.note = "pressure-swirl d32 = 9575*dP^(-1/3) um (class-average design curve, "
               "Marshall/Handbook; a rough class average, NOT resolved for mu_L/sigma "
               "-- use correlation wangLefebvre to resolve liquid properties)" + pNote;
    return out;
}

} // namespace Choupo
