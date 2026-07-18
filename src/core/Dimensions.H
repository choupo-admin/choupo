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
    Dimensions.H

Description
    A physical dimension tag.  Choupo tracks five base dimensions:

        index   symbol   dimension            SI canonical unit
        ----------------------------------------------------------
          0     M        mass                 kg
          1     L        length               m
          2     T        time                 s
          3     Θ        temperature          K
          4     N        amount of substance  kmol     (*)

    (*) Choupo uses kmol rather than mol as the canonical amount unit
        because chem-eng practice gives readable numbers (water at 1000
        kg/m³ is 55.5 kmol/m³, not 55500 mol/m³); molar masses match
        the literature directly (g/mol numerically equals kg/kmol).

    A `Dimensions` object is just five signed integers (the exponents
    of M, L, T, Θ, N).  Equality / multiplication / division work as
    expected; multiplication ADDS exponents and division SUBTRACTS.
    A default-constructed `Dimensions` is dimensionless ([0 0 0 0 0]).

    The `Dims::` namespace provides constexpr constants for the
    physical quantities the simulator handles, so call sites read:

        Dictionary::lookupScalar("P", Dims::pressure)

    instead of

        Dictionary::lookupScalar("P", Dimensions{1, -1, -2, 0, 0})

\*---------------------------------------------------------------------------*/

#pragma once

#include "Types.H"

#include <cstdint>
#include <string>

namespace Choupo {

struct Dimensions
{
    // Exponents.  Signed 8-bit is plenty for physical applications
    // (no real quantity needs exponents outside [-8, 8]).
    int8_t M     = 0;     // mass
    int8_t L     = 0;     // length
    int8_t T     = 0;     // time
    int8_t Theta = 0;     // temperature
    int8_t N     = 0;     // amount of substance

    constexpr Dimensions() = default;
    constexpr Dimensions(int m, int l, int t, int theta, int n)
  :   M(static_cast<int8_t>(m)),
        L(static_cast<int8_t>(l)),
        T(static_cast<int8_t>(t)),
        Theta(static_cast<int8_t>(theta)),
        N(static_cast<int8_t>(n)) {}

    constexpr bool operator==(const Dimensions& o) const
    {
        return M == o.M && L == o.L && T == o.T
            && Theta == o.Theta && N == o.N;
    }

    constexpr bool operator!=(const Dimensions& o) const
    {
        return !(*this == o);
    }

    constexpr Dimensions operator*(const Dimensions& o) const
    {
        return Dimensions(M+o.M, L+o.L, T+o.T, Theta+o.Theta, N+o.N);
    }

    constexpr Dimensions operator/(const Dimensions& o) const
    {
        return Dimensions(M-o.M, L-o.L, T-o.T, Theta-o.Theta, N-o.N);
    }

    constexpr Dimensions pow(int p) const
    {
        return Dimensions(M*p, L*p, T*p, Theta*p, N*p);
    }

    constexpr bool isDimensionless() const
    {
        return M == 0 && L == 0 && T == 0 && Theta == 0 && N == 0;
    }

    // "[M L T Θ N]" form, always exact:  e.g. "[1 -1 -2 0 0]".
    std::string toBracket() const;

    // Reverse-lookup against the named-quantity table; falls back to
    // toBracket() when no name is registered.  Examples:
    //
    //     Dims::pressure        -->  "Pa"
    //     Dims::molarFlow       -->  "kmol/s"
    //     Dims::concentration   -->  "kmol/m^3"
    //     Dimensions(2, -1, 0, 0, 0)  -->  "[2 -1 0 0 0]"     (unnamed)
    std::string toPretty() const;
};

// =====================================================================
//  Named dimensions  (the catalogue the rest of the simulator reads)
//
//  Each constant is constexpr so the compiler folds it.  When you add
//  a derived quantity (e.g. a new transport coefficient for a future
//  unit op), drop it here and use it directly at call sites.
// =====================================================================
namespace Dims {

// ----- base ---------------------------------------------------------------
inline constexpr Dimensions dimensionless  = {  0,  0,  0,  0,  0 };

inline constexpr Dimensions mass           = {  1,  0,  0,  0,  0 };
inline constexpr Dimensions length         = {  0,  1,  0,  0,  0 };
inline constexpr Dimensions area           = {  0,  2,  0,  0,  0 };
inline constexpr Dimensions volume         = {  0,  3,  0,  0,  0 };
inline constexpr Dimensions time           = {  0,  0,  1,  0,  0 };
inline constexpr Dimensions temperature    = {  0,  0,  0,  1,  0 };
inline constexpr Dimensions amount         = {  0,  0,  0,  0,  1 };

// ----- mechanics ----------------------------------------------------------
inline constexpr Dimensions velocity       = {  0,  1, -1,  0,  0 };  // m/s
inline constexpr Dimensions acceleration   = {  0,  1, -2,  0,  0 };  // m/s²
inline constexpr Dimensions density        = {  1, -3,  0,  0,  0 };  // kg/m³
inline constexpr Dimensions force          = {  1,  1, -2,  0,  0 };  // N = kg·m/s²
inline constexpr Dimensions pressure       = {  1, -1, -2,  0,  0 };  // Pa = kg/(m·s²)

// ----- thermodynamics ----------------------------------------------------
inline constexpr Dimensions energy         = {  1,  2, -2,  0,  0 };  // J = kg·m²/s²
inline constexpr Dimensions power          = {  1,  2, -3,  0,  0 };  // W = J/s

inline constexpr Dimensions specificEnergy = {  0,  2, -2,  0,  0 };  // J/kg
inline constexpr Dimensions heatCapacity   = {  0,  2, -2, -1,  0 };  // J/(kg·K)   per-mass
inline constexpr Dimensions molarEnergy    = {  1,  2, -2,  0, -1 };  // J/kmol
inline constexpr Dimensions molarHeatCap   = {  1,  2, -2, -1, -1 };  // J/(kmol·K)
inline constexpr Dimensions molarEntropy   = molarHeatCap;            // same as above

// ----- composition & flow -------------------------------------------------
inline constexpr Dimensions molarMass      = {  1,  0,  0,  0, -1 };  // kg/kmol
inline constexpr Dimensions concentration  = {  0, -3,  0,  0,  1 };  // kmol/m³
inline constexpr Dimensions molality       = { -1,  0,  0,  0,  1 };  // kmol/kg (solvent) -- water-analysis totals
inline constexpr Dimensions specificVolume = { -1,  3,  0,  0,  0 };  // m³/kg -- e.g. a resin dose (L bed / kg water)
inline constexpr Dimensions molarFlow      = {  0,  0, -1,  0,  1 };  // kmol/s
inline constexpr Dimensions massFlow       = {  1,  0, -1,  0,  0 };  // kg/s
inline constexpr Dimensions volumetricFlow = {  0,  3, -1,  0,  0 };  // m³/s

// ----- transport ----------------------------------------------------------
inline constexpr Dimensions viscosity      = {  1, -1, -1,  0,  0 };  // Pa·s
inline constexpr Dimensions thermalCond    = {  1,  1, -3, -1,  0 };  // W/(m·K)
inline constexpr Dimensions diffusivity    = {  0,  2, -1,  0,  0 };  // m²/s
inline constexpr Dimensions surfaceTension = {  1,  0, -2,  0,  0 };  // N/m
inline constexpr Dimensions heatTransfer_h = {  1,  0, -3, -1,  0 };  // W/(m²·K)
inline constexpr Dimensions UA             = {  1,  2, -3, -1,  0 };  // W/K   (h · A)
inline constexpr Dimensions massTransferCoeff = velocity;             // m/s   (k_film)

// ----- membrane --------------------------------------------------
//   Water permeability A_w defined by  J_w = A_w · ΔP_net.
//     J_w in m/s,  ΔP in Pa  →  A_w in m/(s·Pa) = m·s/kg → [-1  2  1  0  0]
inline constexpr Dimensions permeabilityWater  = { -1,  2,  1,  0,  0 };
//   Solute permeability B_s defined by  J_s = B_s · Δc.
//     J_s in kmol/(m²·s),  Δc in kmol/m³  →  B_s in m/s, same as velocity.
inline constexpr Dimensions permeabilitySolute = velocity;

// ----- kinetic ------------------------------------------------------------
//   Arrhenius pre-exponential A_pre for a first-order reaction in s⁻¹.
inline constexpr Dimensions inverseTime    = {  0,  0, -1,  0,  0 };  // 1/s

} // namespace Dims

} // namespace Choupo
