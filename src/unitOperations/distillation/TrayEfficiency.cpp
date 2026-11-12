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

#include "TrayEfficiency.H"

#include <cmath>
#include <sstream>
#include <stdexcept>

namespace Choupo
{

namespace
{
    void requirePositiveFinite(scalar v, const char* what, const char* hint)
    {
        if (!(v > 0.0) || !std::isfinite(v))
        {
            std::ostringstream o;
            o << "TrayEfficiency (AIChE): " << what << " = " << v
              << " is not a positive finite number -- " << hint;
            throw std::runtime_error(o.str());
        }
    }
}

scalar TrayEfficiency::flowPathLength(scalar D, scalar lw)
{
    const scalar R = 0.5 * D;
    const scalar h = 0.5 * lw;
    if (!(h < R))
        throw std::runtime_error("TrayEfficiency: the weir is not shorter than "
            "the tower diameter, so there is no chord and no flow path");
    const scalar chordDepth = R - std::sqrt(R * R - h * h);
    return D - 2.0 * chordDepth;
}

TrayEfficiency::Result TrayEfficiency::evaluate(const Geometry& g, const State& s)
{
    Result r;
    requirePositiveFinite(g.activeArea, "the active area", "declare the tray geometry");
    requirePositiveFinite(s.vapourVolFlow, "the vapour flow", "a tray with no vapour is not a tray");
    requirePositiveFinite(s.liquidVolFlow, "the liquid flow", "a dry tray has no liquid-phase resistance to evaluate");
    requirePositiveFinite(s.rhoV, "the vapour density", "the package must price the vapour");
    requirePositiveFinite(s.ScV, "the vapour Schmidt number", "it needs the gas viscosity and diffusivity");
    requirePositiveFinite(s.DL, "the liquid diffusivity", "it needs a liquid viscosity and Wilke-Chang");

    const scalar hw = g.weirHeight, Z = g.flowPath, zw = g.flowWidth;
    const scalar q  = s.liquidVolFlow;

    //  Treybal Eq. (6.61)-(6.64) and (6.38): the velocity is on the ACTIVE area.
    r.Va = s.vapourVolFlow / g.activeArea;
    r.Fa = r.Va * std::sqrt(s.rhoV);
    r.hL = 6.10e-3 + 0.725 * hw - 0.238 * hw * r.Fa + 1.225 * q / zw;
    requirePositiveFinite(r.hL, "the clear liquid height h_L (Treybal 6.38)",
        "the vapour load is beyond the range of the correlation");
    r.thetaL = r.hL * zw * Z / q;
    r.NG = (0.776 + 4.57 * hw - 0.238 * r.Fa + 104.6 * q / Z) / std::sqrt(s.ScV);
    requirePositiveFinite(r.NG, "N_tG (Treybal 6.61)",
        "the active-area F-factor is beyond the range of the AIChE gas-phase correlation");
    r.NL = 40000.0 * std::sqrt(s.DL) * (0.213 * r.Fa + 0.15) * r.thetaL;
    requirePositiveFinite(r.NL, "N_tL (Treybal 6.62)", "check the liquid diffusivity");

    //  Point efficiency, Treybal (6.51)-(6.52).
    const scalar invNOG = 1.0 / r.NG + s.lambda / r.NL;
    r.NOG = 1.0 / invNOG;
    r.EOG = 1.0 - std::exp(-r.NOG);

    //  Eddy diffusion in the liquid, Treybal (6.57)-(6.59).
    const scalar sqrtDE = 3.93e-3 + 0.0171 * r.Va + 3.67 * q / Z + 0.1800 * hw;
    r.DE  = sqrtDE * sqrtDE;
    r.Pe  = Z * Z / (r.DE * r.thetaL);
    requirePositiveFinite(r.Pe, "the liquid Peclet number", "check the flow path length");
    const scalar lE = s.lambda * r.EOG;
    if (lE <= 1.0e-12)
        r.EMVdry = r.EOG;                       // no stripping effect: back-mixed limit
    else
    {
        r.eta = 0.5 * r.Pe * (std::sqrt(1.0 + 4.0 * lE / r.Pe) - 1.0);
        const scalar ep = r.eta + r.Pe;
        const scalar t1 = (1.0 - std::exp(-ep)) / (ep * (1.0 + ep / r.eta));
        const scalar t2 = (std::exp(r.eta) - 1.0) / (r.eta * (1.0 + r.eta / ep));
        r.EMVdry = r.EOG * (t1 + t2);
    }
    requirePositiveFinite(r.EMVdry, "the dry Murphree efficiency", "check the inputs");

    //  Entrainment, Colburn (Perry 14-98) with Fair's median psi (Perry 14-99).
    r.EMV = r.EMVdry;
    if (s.floodApproach >= 0.0)
    {
        const scalar Phi = s.floodApproach;
        r.psi = std::exp(-3.2108 - 8.9049 * Phi + 11.6291 * Phi * Phi);
        if (r.psi >= 1.0)
            throw std::runtime_error("TrayEfficiency: Fair's entrainment correlation"
                " gives psi >= 1 at this approach to flood -- the tray is past"
                " entrainment flood and has no Murphree efficiency to report");
        r.EMV = r.EMVdry / (1.0 + r.EMVdry * r.psi / (1.0 - r.psi));
    }
    return r;
}

} // namespace Choupo
