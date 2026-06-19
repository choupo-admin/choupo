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

/*---------------------------------------------------------------------------*\
  PsychrometricChart — a humidity chart for ANY carrier gas + ANY condensable,
  at ANY pressure and temperature range.  (The textbook chart is locked to
  air-water, ~0-50 C; this is the same physics, unlocked — N2/acetone, hot-air
  drying to 260 C, etc.)

  Carrier = the non-condensing gas (air, N2, ...).  Condensable = the vapour
  (water, acetone, ...).  Both are components of the thermoPackage.  Everything
  comes from data Choupo already has per component: the condensable's vapour-
  pressure model P_sat(T), both MWs, ideal-gas Cp, and the Watson latent heat.

  Humidity ratio (mass vapour / mass dry carrier):
      Y(T, p_v) = (M_v / M_c) * p_v / (P - p_v)
  Curves emitted (CSV: T_C, Y, curve):
    * saturation : p_v = P_sat(T), drawn only where P_sat < P (so it caps at the
                   boiling point -- e.g. ~100 C for water at 1 atm; the chart's
                   T axis itself goes far higher, into the unsaturated drying
                   region the RH curves do not reach).
    * rh:<phi>   : p_v = phi * P_sat(T), one curve per requested relative humidity.
    * wetbulb:<Tas> : adiabatic-saturation lines (the drying tool) -- the locus
                   c_s*(T - T_as) = (Y_sat(T_as) - Y) * lambda(T_as), spanning the
                   full T range; c_s = humid heat, lambda = latent heat at T_as.

  Dictionary form:

        {
            name      psy;
            type      psychrometricChart;
            carrier      N2;          // the non-condensing gas
            condensable  water;       // the vapour
            P            101325;      // Pa (default 1 atm)
            TminC        0;  TmaxC 150;            // dry-bulb range [C]
            grid         { n 80; }
            relativeHumidity ( 10 20 30 40 50 60 70 80 90 );   // % curves
            wetBulb          ( 20 30 40 50 60 70 );            // adiab-sat lines [C]
            output    { file psychro.csv; }
        }

  Physics lives here; the GUI only draws it.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <string>

namespace Choupo {

class PsychrometricChart : public PropertyOperation
{
public:
    const std::string& type() const override { static const std::string t = "psychrometricChart"; return t; }
    int run(const DictPtr& dict, const ThermoPackage& thermo, int verbosity) override;
};

} // namespace Choupo
