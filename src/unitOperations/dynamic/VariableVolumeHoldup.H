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
    src/unitOperations/dynamic/VariableVolumeHoldup.H

Description
    THE ONE HOME of the variable-volume liquid holdup (DEV.md 4c C205, D1, D2,
    D4).  A vessel whose liquid inventory MOVES (a tank, a variable-volume
    CSTR, a flash drum's liquid) needs the same few pieces of arithmetic, and
    they live here so that each vessel CALLS them and none copies them:

      * the liquid VOLUME of a holdup  V = sum_i n_i MW_i / rho(T, P, x),
        rho from the CASE's package (ThermoPackage::density, liquid branch --
        the mole-weighted molar volume per component, anchored on the record's
        own Vliq).  A package that cannot price a liquid density REFUSES by
        name; no density is ever assumed;
      * the LEVEL of a declared vertical cylinder  h = V / (pi D^2 / 4);
      * the DRY and OVERFLOW refusals (never a clamp: a vessel that runs
        dry or overflows is a case that ceased to describe what it declares);
      * the VALVE law on an outlet,
            Q = Cv x opening x sqrt(dP / rho),   Q [m^3/s]
            dP = (P_vessel + rho g h) - P_downstream,
        Cv is therefore an effective flow AREA [m^2] (the orifice equation's
        Cd A), the outlet sits at the bottom (elevation 0) and `opening` is
        the fraction of the full stroke in [0, 1] (linear characteristic);
      * its closed-form STEADY LEVEL, so a witness can print the answer the
        run must reach beside the run's own value;
      * the mixture ENTHALPY of the holdup on the package's liquid surface
        (H_liquid_formation, the elements datum) and the inverse T(H) -- the
        route dynamicCSTR calls its MIXTURE-H route.  One surface, one Newton:
        dynamicCSTR delegates to these two instead of keeping its own copy.

    Units: n [kmol], T [K], P [Pa], V [m^3], h [m], MW [kg/kmol], rho [kg/m^3],
    H [kJ] (molar enthalpy J/mol == kJ/kmol).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"
#include "thermo/ThermoPackage.H"

#include <string>

namespace Choupo {
namespace VariableVolumeHoldup {

//- Standard gravity [m/s^2] (ISO 80000-3): the one place it is written.
constexpr scalar gravity = 9.80665;

//- A vertical cylindrical vessel, outlet at the bottom (elevation 0).
struct VerticalCylinder
{
    scalar diameter = 0;     // m
    scalar height   = 0;     // m (the overflow level)
    scalar area()       const;      // m^2
    scalar fullVolume() const;      // m^3
    //- Read `geometry { shape verticalCylinder; diameter ..; height ..; }`;
    //  refuses a missing key, a non-positive size and any other shape by name.
    static VerticalCylinder read(const DictPtr& geom, const std::string& who);
};

//- The liquid holdup resolved at one instant.
struct LiquidState
{
    scalar volume = 0;       // m^3
    scalar density = 0;      // kg/m^3
    scalar meanMW = 0;       // kg/kmol
    scalar nTotal = 0;       // kmol
    scalar level = 0;        // m (set by the caller from the geometry)
};

//- Resolve volume, density and mean MW of the holdup n at (T, P).  Negative
//  mole numbers count as zero (a trial state of an RK stage).  An empty
//  holdup returns volume 0 and density 0; a package that cannot price the
//  liquid density throws, naming `who`.  The density is priced through the
//  property door as the consumer `consumerType` named `consumerUnit` (the
//  vessel's real type and the case's unit name -- never the message `who`),
//  so the liquid-properties table can name it and match its declaration
//  (review DX-05).
LiquidState liquidState(const ThermoPackage& thermo, const sVector& n,
                        scalar T, scalar P_Pa, const std::string& who,
                        const std::string& consumerType,
                        const std::string& consumerUnit);

//- Level from volume.
scalar level(const VerticalCylinder& g, scalar volume);

//- Static head rho g h [Pa] of a liquid column: the pressure at the outlet
//  nozzle above the pressure over the liquid.
scalar staticHead(scalar rho, scalar level);

//- Wetted wall area of the vertical cylinder at `level` [m^2]:  the side wall
//  up to the liquid plus the flat bottom,  A_w = pi D h + pi D^2/4.  A jacket
//  that covers the whole vessel exchanges heat through exactly this area, so a
//  variable-volume vessel scales its UA by A_w(h)/A_w(H) (UA declared at the
//  FULL height H).  The level is clamped to [0, H] here: the area of a wall
//  that is not there is not a number (the overflow itself is refused apart).
scalar wettedArea(const VerticalCylinder& g, scalar level);

//- REFUSE (throw, by name, with the instant) a vessel that is dry
//  (volume <= 0) or over its declared height.  Never clamps.
void refuseDryOrOverflow(const VerticalCylinder& g, const LiquidState& s,
                         scalar t, const std::string& who);

//- The valve on the outlet (declared by the case).
struct Valve
{
    scalar Cv = 0;                 // m^2, effective flow area
    scalar P_downstream_Pa = 0;    // Pa
    //  Read `valve { Cv ..; downstreamPressure ..; }`; refuses a missing key
    //  or a non-positive Cv by name.
    static Valve read(const DictPtr& d, const std::string& who);
};

//- Q [m^3/s] through the valve at `opening` in [0,1].  dP is the static
//  head plus the vessel pressure minus the downstream pressure.  A negative
//  dP would reverse the flow: with `strict` it THROWS by name (an accepted
//  state), otherwise (a trial stage) the flow is 0.
scalar valveVolumetricFlow(const Valve& v, scalar opening, scalar rho,
                           scalar P_vessel_Pa, scalar level, bool strict,
                           const std::string& who);

//- Closed form: the level at which the valve passes exactly Q [m^3/s].
//      h* = (Q / (Cv x))^2 / g  -  (P_vessel - P_downstream) / (rho g)
scalar valveSteadyLevel(const Valve& v, scalar opening, scalar Q_m3s,
                        scalar rho, scalar P_vessel_Pa);

//- Mixture molar enthalpy [J/mol == kJ/kmol] of the holdup n (any positive
//  scaling) at T, on the package's liquid mixture surface.
scalar mixtureEnthalpy(const ThermoPackage& thermo, const sVector& n, scalar T);

//- Recover T from the stored H [kJ]:  n_tot hMix(n, T) = H  by a 1-D Newton
//  whose derivative is taken numerically from the SAME surface.
scalar temperatureFromEnthalpy(const ThermoPackage& thermo, const sVector& n,
                               scalar H, scalar Tguess);

} // namespace VariableVolumeHoldup
} // namespace Choupo
