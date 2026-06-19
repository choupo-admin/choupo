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
  SolventProperties -- temperature correlations of LIQUID WATER needed by the
  electrolyte models' Debye-Huckel / Born terms: the static relative
  permittivity epsilon_w(T) and the molar volume v_w(T).  Both are written in
  RELATIVE (anchored) form so that at the reference T = 25 C they return EXACTLY
  the values the 25 C electrolyte kernels were validated with
  (epsilon_w = 78.45, v_w = 1.807e-5 m3/mol) -- guaranteeing every 25 C golden
  master stays byte-identical while the off-25 C behaviour becomes physical.

  epsilon_w(T): Malmberg & Maryott, J. Res. NBS 56 (1956) 1 (US government, public
    domain): eps = 87.740 - 0.40008 t + 9.398e-4 t^2 - 1.410e-6 t^3  (t in C,
    0-100 C), used as a RATIO to the 25 C value and scaled to 78.45.
  rho_w(T):    Kell, J. Chem. Eng. Data 20 (1975) 97 (the standard public
    polynomial), used as a RATIO to anchor v_w to 1.807e-5 m3/mol at 25 C.
\*---------------------------------------------------------------------------*/

#pragma once

#include <cmath>

namespace Choupo {
namespace SolventProperties {

// Malmberg-Maryott static permittivity of water [-], t in degC.
inline double epsWaterMM(double t)
{
    return 87.740 - 0.40008 * t + 9.398e-4 * t * t - 1.410e-6 * t * t * t;
}

// Kell density of liquid water [kg/m^3], t in degC (0-100 C, 1 atm).
inline double rhoWaterKell(double t)
{
    const double num = 999.83952 + 16.945176 * t - 7.9870401e-3 * t * t
                     - 46.170461e-6 * t * t * t + 105.56302e-9 * t * t * t * t
                     - 280.54253e-12 * t * t * t * t * t;
    return num / (1.0 + 16.879850e-3 * t);
}

// epsilon_w(T) anchored to 78.45 at 25 C.  T in kelvin.
inline double epsWater(double T)
{
    const double t = T - 273.15;
    return 78.45 * epsWaterMM(t) / epsWaterMM(25.0);
}

// v_w(T) [m^3/mol] anchored to 1.807e-5 at 25 C.  T in kelvin.
inline double vWater(double T)
{
    const double t = T - 273.15;
    return 1.807e-5 * rhoWaterKell(25.0) / rhoWaterKell(t);
}

// Relative Debye-Huckel factor f(T) = (rho/rho25)^0.5 (eps25 T25 / (eps T))^1.5,
// = 1 at 25 C.  Multiplies the reference A_DH (eNRTL, mole-fraction) or A_phi
// (Pitzer, molality) so both stay byte-identical at 25 C and move physically off it.
inline double debyeHuckelFactor(double T)
{
    constexpr double T25 = 298.15, eps25 = 78.45;
    const double rhoRatio = rhoWaterKell(T - 273.15) / rhoWaterKell(25.0);
    return std::sqrt(rhoRatio) * std::pow(eps25 * T25 / (epsWater(T) * T), 1.5);
}

} // namespace SolventProperties
} // namespace Choupo
