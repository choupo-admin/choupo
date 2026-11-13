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
File
    src/unitOperations/dynamic/VariableVolumeHoldup.cpp

Description
    See VariableVolumeHoldup.H.
\*---------------------------------------------------------------------------*/

#include "VariableVolumeHoldup.H"
#include "thermo/LiquidPropertyDoor.H"

#include <algorithm>
#include <cmath>
#include <sstream>
#include <stdexcept>

namespace Choupo {
namespace VariableVolumeHoldup {

namespace {
constexpr scalar pi_ = 3.14159265358979323846;
}

scalar VerticalCylinder::area() const { return 0.25 * pi_ * diameter * diameter; }
scalar VerticalCylinder::fullVolume() const { return area() * height; }

VerticalCylinder VerticalCylinder::read(const DictPtr& g, const std::string& who)
{
    if (!g)
        throw std::runtime_error(who + ": no `geometry {}` -- a level needs the"
            " cross-section of a DECLARED vessel (`geometry { shape"
            " verticalCylinder; diameter ..; height ..; }`); none is assumed");
    const std::string shape = g->lookupWordOrDefault("shape", "");
    if (shape != "verticalCylinder")
        throw std::runtime_error(who + ": geometry.shape '" + shape + "' is not"
            " one this vessel reads -- the one shape is `verticalCylinder`");
    VerticalCylinder c;
    c.diameter = g->lookupScalar("diameter");
    c.height   = g->lookupScalar("height");
    if (!(c.diameter > 0.0) || !(c.height > 0.0))
        throw std::runtime_error(who + ": geometry diameter and height must be"
            " positive (got " + std::to_string(c.diameter) + " m, "
            + std::to_string(c.height) + " m)");
    return c;
}

LiquidState liquidState(const ThermoPackage& thermo, const sVector& n,
                        scalar T, scalar P_Pa, const std::string& who,
                        const std::string& consumerType,
                        const std::string& consumerUnit)
{
    LiquidState s;
    sVector x(n.size(), 0.0);
    scalar mass = 0.0;
    for (std::size_t i = 0; i < n.size(); ++i)
    {
        const scalar ni = std::max<scalar>(n[i], 0.0);
        s.nTotal += ni;
        mass     += ni * thermo.comp(i).MW();
    }
    if (s.nTotal <= 0.0) return s;
    for (std::size_t i = 0; i < n.size(); ++i)
        x[i] = std::max<scalar>(n[i], 0.0) / s.nTotal;
    s.meanMW = mass / s.nTotal;
    try
    {
        s.density = liquidProperty::evaluate(thermo, liquidProperty::Property::density, T, P_Pa, x, liquidProperty::Consumer{consumerType, consumerUnit}).value;
    }
    catch (const std::exception& e)
    {
        throw std::runtime_error(who + ": the case's package cannot price a"
            " liquid density at T = " + std::to_string(T) + " K (" + e.what()
            + ") -- a vessel with a level needs one; no density is assumed."
            "  Declare `Vliq` (and Tc, Pc, omega) on the components");
    }
    if (!(s.density > 0.0) || !std::isfinite(s.density))
        throw std::runtime_error(who + ": the liquid density is not a finite"
            " positive number (" + std::to_string(s.density) + " kg/m3)");
    s.volume = mass / s.density;
    return s;
}

scalar level(const VerticalCylinder& g, scalar volume)
{
    return volume / g.area();
}

scalar staticHead(scalar rho, scalar lvl)
{
    return rho * gravity * std::max<scalar>(lvl, 0.0);
}

scalar wettedArea(const VerticalCylinder& g, scalar lvl)
{
    const scalar h = std::max<scalar>(0.0, std::min<scalar>(lvl, g.height));
    return pi_ * g.diameter * h + g.area();
}

void refuseDryOrOverflow(const VerticalCylinder& g, const LiquidState& s,
                         scalar t, const std::string& who)
{
    std::ostringstream m;
    if (!(s.volume > 0.0))
    {
        m << who << ": the vessel RAN DRY at t = " << t << " s (liquid volume "
          << s.volume << " m3, level 0 m).  Refused, not clamped: a vessel that"
             " empties no longer describes the case it declares -- lower the"
             " outflow, raise the inflow or the setpoint";
        throw std::runtime_error(m.str());
    }
    if (s.level > g.height)
    {
        m << who << ": the vessel OVERFLOWED at t = " << t << " s (level "
          << s.level << " m against a declared height of " << g.height
          << " m).  Refused, not clamped: the liquid that would spill is"
             " neither in the vessel nor in any stream -- raise the outflow,"
             " lower the inflow or declare a taller vessel";
        throw std::runtime_error(m.str());
    }
}

Valve Valve::read(const DictPtr& d, const std::string& who)
{
    if (!d)
        throw std::runtime_error(who + ": mode valve needs a `valve { Cv ..;"
            " downstreamPressure ..; }` block");
    Valve v;
    v.Cv = d->lookupScalar("Cv");
    v.P_downstream_Pa = d->lookupScalar("downstreamPressure");
    if (!(v.Cv > 0.0))
        throw std::runtime_error(who + ": valve.Cv must be positive (it is the"
            " effective flow area in m2: Q = Cv x opening x sqrt(dP/rho))");
    return v;
}

scalar valveVolumetricFlow(const Valve& v, scalar opening, scalar rho,
                           scalar P_vessel_Pa, scalar lvl, bool strict,
                           const std::string& who)
{
    if (!(rho > 0.0)) return 0.0;
    const scalar dP = (P_vessel_Pa + rho * gravity * std::max<scalar>(lvl, 0.0))
                      - v.P_downstream_Pa;
    if (dP < 0.0)
    {
        if (strict)
            throw std::runtime_error(who + ": the downstream pressure ("
                + std::to_string(v.P_downstream_Pa) + " Pa) exceeds the"
                " pressure at the outlet ("
                + std::to_string(dP + v.P_downstream_Pa)
                + " Pa = vessel pressure + static head): the flow would"
                " REVERSE.  Refused -- this valve has no back-flow model");
        return 0.0;
    }
    return v.Cv * opening * std::sqrt(dP / rho);
}

scalar valveSteadyLevel(const Valve& v, scalar opening, scalar Q, scalar rho,
                        scalar P_vessel_Pa)
{
    const scalar u = Q / (v.Cv * opening);
    return u * u / gravity - (P_vessel_Pa - v.P_downstream_Pa) / (rho * gravity);
}

scalar mixtureEnthalpy(const ThermoPackage& thermo, const sVector& n, scalar T)
{
    scalar nt = 0.0;
    for (auto v : n) nt += std::max<scalar>(v, 0.0);
    if (nt <= 0.0) return 0.0;
    sVector x(n.size(), 0.0);
    for (std::size_t i = 0; i < n.size(); ++i)
        x[i] = std::max<scalar>(n[i], 0.0) / nt;
    //  THE mixture surface -- the same H_liquid_formation every balance reads,
    //  electrolyte aqueous-ion branch included.
    return thermo.H_liquid_formation(T, x);              // J/mol
}

scalar temperatureFromEnthalpy(const ThermoPackage& thermo, const sVector& n,
                               scalar H, scalar Tguess)
{
    //  1-D Newton on the SAME surface, derivative taken numerically from it
    //  (one surface, one derivative).  H in kJ; hMix in J/mol == kJ/kmol.
    scalar nt = 0.0;
    for (auto v : n) nt += std::max<scalar>(v, 0.0);
    if (nt <= 0.0) return Tguess;
    scalar T = Tguess;
    for (int it = 0; it < 50; ++it)
    {
        const scalar r  = nt * mixtureEnthalpy(thermo, n, T) - H;                // kJ
        const scalar cp = nt * (mixtureEnthalpy(thermo, n, T + 0.5)
                                - mixtureEnthalpy(thermo, n, T - 0.5));          // kJ/K
        if (std::abs(cp) < 1.0e-30) break;
        const scalar dT = -r / cp;
        T += std::max<scalar>(-25.0, std::min<scalar>(25.0, dT));
        if (std::abs(dT) < 1.0e-10) return T;
    }
    return T;
}

} // namespace VariableVolumeHoldup
} // namespace Choupo
