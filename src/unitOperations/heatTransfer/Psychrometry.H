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
Namespace
    Choupo::psychrometry

Description
    THE PSYCHROMETRY THE DRYERS SHARE, in one home (2026-09-29).  Until then
    the GAB equilibrium moisture was written out in SolidDryer and copied
    "verbatim" into BatchDryer, and the wet-bulb bisection lived in
    CoolingTower and again in BatchDryer; a third dryer would have made a
    third copy.  Each function is the arithmetic those units ran, moved, not
    rewritten, so every golden that reads them is unmoved.

      Ysat(T)          saturation humidity ratio of the moisture in its
                       carrier gas at total pressure P,
                           Y_sat = (Mv/Mc) p_sat / (P - p_sat)
      airWaterActivity a_w = p_v / p_sat(T),  p_v = P Y / (Y + Mv/Mc)
      gabMoisture      the GAB isotherm on the solid's `sorption { Xm; C; K; }`
                           X_eq = Xm C K a_w / ((1 - K a_w)(1 - K a_w + C K a_w))
      wetBulb          the adiabatic-saturation equation at Lewis = 1,
                           Y_sat(T_wb) - Y = (cp_c + Y cp_v)(T - T_wb) / lambda(T_wb),
                       by bisection on [273.65 K, T] to 1e-7 K, the humid
                       heat evaluated at the air's own T (a HYPOTHESIS: cp
                       moves by well under a percent across the depression).
      gasWetBulb       the wet bulb of a GAS STREAM given as mole fractions
                       over the package's components (2026-10-05, DEV.md C35
                       item 7): the dry carrier's mean molar mass and mass
                       heat capacity at the gas's own T, its humidity ratio,
                       then `wetBulb`.  It is the FLOOR of the solid in the
                       two dryers whose solid and exhaust leave at one
                       temperature (SolidDryer, EvaporativeDryer): a wet
                       solid in a gas cools toward the gas's wet bulb, not
                       toward its own feed temperature.

    p_sat is the PACKAGE's (`ThermoPackage::Psat`, C39 2026-10-06): the
    helpers take the package and the moisture's index rather than its
    Component, so a declared pure-fluid method (`pureFluids { water {
    method IF97; } }`) owns the moisture's saturation curve here as it does
    in every K-value -- never the record's correlation past it.

    Humidities are kg moisture per kg DRY carrier; Mv and Mc are the
    moisture's and the dry carrier's molar masses [kg/kmol]; cp_c and cp_v
    are mass heat capacities [J/(kg K)].  Every refusal names its caller.

    CoolingTower's own saturation humidity and wet-bulb bisection were the
    same construction written out a third time; they call these since
    2026-10-05 (coolingTower01's golden unmoved), its refusal still naming
    the tower's own remedy.  The tower's Merkel enthalpy h* stays its own:
    it is the classical psychrometric datum the Merkel method is taught on,
    not a copy of anything here.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"
#include "thermo/Component.H"
#include "thermo/ThermoPackage.H"
#include "thermo/heatCapacity/HeatCapacityModel.H"
#include "thermo/vaporPressure/VaporPressureModel.H"

#include <cmath>
#include <stdexcept>
#include <string>

namespace Choupo {
namespace psychrometry {

inline scalar Ysat(const ThermoPackage& thermo, std::size_t iMoist,
                   scalar Mv, scalar Mc, scalar P, scalar T,
                   const std::string& who)
{
    const scalar pv = thermo.Psat(iMoist, T);
    if (pv <= 0.0 || pv >= 0.95 * P)
        throw std::runtime_error(who + ": the saturation humidity is"
            " undefined at T = " + std::to_string(T) + " K (the"
            " moisture's saturation pressure is out of range at "
            + std::to_string(P) + " Pa)");
    return (Mv / Mc) * pv / (P - pv);
}

//- The air's water activity, UNCLIPPED (the caller decides and announces
//  what it does above the isotherm's range).
inline scalar airWaterActivity(const ThermoPackage& thermo,
                               std::size_t iMoist, scalar Mv, scalar Mc,
                               scalar P, scalar T, scalar Y,
                               const std::string& who)
{
    const scalar pv   = P * Y / (Y + Mv / Mc);
    const scalar Psat = thermo.Psat(iMoist, T);
    if (Psat <= 0.0)
        throw std::runtime_error(who + ": the moisture's vapour pressure at"
            " the air temperature is not positive -- the water"
            " activity of the air cannot be formed");
    return pv / Psat;
}

inline scalar gabMoisture(const Component& sol, scalar aw,
                          const std::string& who)
{
    const scalar Ka = sol.sorpK() * aw;
    if (Ka >= 1.0)
        throw std::runtime_error(who + ": the GAB isotherm of '" + sol.name()
            + "' diverges at this air (K*a_w = " + std::to_string(Ka)
            + " >= 1) -- the air is outside the isotherm's domain");
    if (sol.sorpXm() <= 0.0)
        throw std::runtime_error(who + ": the sorption record of '"
            + sol.name() + "' declares a non-positive monolayer moisture Xm"
            " -- X_eq has no model");
    return sol.sorpXm() * sol.sorpC() * Ka
         / ((1.0 - Ka) * (1.0 - Ka + sol.sorpC() * Ka));
}

inline scalar wetBulb(const ThermoPackage& thermo, std::size_t iMoist,
                      scalar Mv, scalar Mc,
                      scalar cpc, scalar cpv, scalar P, scalar T, scalar Y,
                      const std::string& who)
{
    const Component& moist = thermo.comp(iMoist);
    auto fWb = [&](scalar Twb) -> scalar
    {
        const scalar lam = moist.Hvap_latent(Twb) / Mv * 1000.0;     // J/kg
        return Ysat(thermo, iMoist, Mv, Mc, P, Twb, who) - Y
             - (cpc + Y * cpv) * (T - Twb) / lam;
    };
    scalar lo = 273.65, hi = T;
    if (hi <= lo)
        throw std::runtime_error(who + ": the air temperature "
            + std::to_string(T) + " K is at or below the wet-bulb"
            " bracket floor (273.65 K) -- this psychrometry is"
            " written for air above freezing");
    //  AIR HOTTER THAN THE MOISTURE'S BOILING POINT (2026-09-29).  Above the
    //  temperature where p_sat reaches 0.95 P the saturation humidity is not
    //  defined, and air there cannot be supersaturated; the wet bulb lies
    //  below it, so the bracket's top is moved down to it.  Below it the
    //  bracket is [273.65 K, T] exactly as before.
    //
    //  AIR HOTTER THAN THE MOISTURE'S CRITICAL POINT (2026-10-05).  A flue
    //  gas at 950 K (the lithium plant's dryer) is above water's Tc, where
    //  there is no saturation curve to ask: the search for the 0.95 P point
    //  starts just below Tc instead of at T, which leaves every answer below
    //  Tc unchanged.  At a total pressure where even Tc does not reach
    //  0.95 P, the question has no answer and is refused by name.
    const scalar Tc   = moist.Tc();
    const scalar Ttop = (Tc > 0.0 && T >= Tc) ? std::nextafter(Tc, 0.0) : T;
    if (Ttop < T && thermo.Psat(iMoist, Ttop) < 0.95 * P)
        throw std::runtime_error(who + ": the gas at " + std::to_string(T)
            + " K is above the moisture's critical temperature, and at "
            + std::to_string(P) + " Pa its saturation pressure never reaches"
            " 0.95 P below it -- this psychrometry has no wet bulb there");
    if (thermo.Psat(iMoist, Ttop) >= 0.95 * P)
    {
        scalar a = lo, b = Ttop;
        for (int it = 0; it < 100 && (b - a) > 1.0e-9; ++it)
        {
            const scalar m = 0.5 * (a + b);
            (thermo.Psat(iMoist, m) >= 0.95 * P ? b : a) = m;
        }
        hi = a;
    }
    else if (fWb(hi) < 0.0)
        throw std::runtime_error(who + ": the air is supersaturated"
            " -- its humidity ratio Y exceeds saturation at its own"
            " temperature");
    for (int it = 0; it < 100 && (hi - lo) > 1.0e-7; ++it)
    { const scalar m = 0.5 * (lo + hi); (fWb(m) >= 0.0 ? hi : lo) = m; }
    return 0.5 * (lo + hi);
}

//- The wet bulb of a gas stream of mole fractions `y` (over the package's
//  components) at (T, P), the moisture being component `iMoist`.  Every
//  OTHER present component is the dry carrier, and each must carry an
//  ideal-gas heat capacity: the humid heat is formed from them, and a
//  component skipped in silence would move the wet bulb with no trace.
inline scalar gasWetBulb(const ThermoPackage& thermo, const sVector& y,
                         std::size_t iMoist, scalar T, scalar P,
                         const std::string& who)
{
    const Component& moist = thermo.comp(iMoist);
    const scalar Mv = moist.MW();
    scalar nDry = 0.0, mDry = 0.0, cpMolar = 0.0;   // per mole of gas
    for (std::size_t i = 0; i < thermo.n(); ++i)
    {
        if (i == iMoist || !(y[i] > 0.0)) continue;
        const Component& c = thermo.comp(i);
        if (!c.hasCpIdealGas())
            throw std::runtime_error(who + ": the drying gas carries '"
                + c.name() + "', which has no ideal-gas heat capacity -- the"
                " gas's humid heat, and so its wet-bulb temperature (the"
                " solid's floor), cannot be formed.  Curate its"
                " `idealGasHeatCapacity {}`.");
        nDry    += y[i];
        mDry    += y[i] * c.MW();
        cpMolar += y[i] * c.cpIdealGas().Cp(T);
    }
    if (!(nDry > 0.0))
        throw std::runtime_error(who + ": the drying gas carries no dry"
            " carrier -- it has no wet-bulb temperature");
    if (!moist.hasCpIdealGas())
        throw std::runtime_error(who + ": the moisture '" + moist.name()
            + "' has no ideal-gas heat capacity -- the gas's humid heat,"
              " and so its wet-bulb temperature, cannot be formed");
    const scalar Mc  = mDry / nDry;                              // kg/kmol
    const scalar cpc = (cpMolar / nDry) / Mc * 1000.0;           // J/(kg K)
    const scalar cpv = moist.cpIdealGas().Cp(T) / Mv * 1000.0;   // J/(kg K)
    const scalar Y   = (y[iMoist] > 0.0) ? y[iMoist] * Mv / mDry : 0.0;
    return wetBulb(thermo, iMoist, Mv, Mc, cpc, cpv, P, T, Y, who);
}

} // namespace psychrometry
} // namespace Choupo
