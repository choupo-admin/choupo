/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
-------------------------------------------------------------------------------
Namespace
    Choupo::reliefMath

Description
    THE RELIEF-SIZING ARITHMETIC, and nothing else: the published equations
    of API STD 520 Part I (gas or vapour, critical and subcritical; liquid),
    the API STD 521 fire heat input, the allowed accumulation of ASME VIII-1,
    and the API STD 526 orifice letters.  Pure functions of numbers: no
    dictionary, no thermodynamic package, no sizing record -- the sizer that
    calls them (`ReliefValveSize`) supplies every fluid property from the
    case's own package and says where each came from.

    THE SAME ARITHMETIC AS THE EDUTOOL, AND HELD TO IT.  The "Designing for
    overpressure" EduTool (DEV.md 4c C61) computes these equations in
    TypeScript (`gui/src/ui/methods/overpressure.ts`), and its test holds them
    to API 520's own worked Examples 1, 2 and 5.  Two implementations of one
    procedure drift unless something compares them, so
    `bin/curate/check_relief_valve.py` compiles a probe against THIS header,
    reproduces the same three examples to 1e-9 against the numbers the
    TypeScript test pins, and requires every constant below to equal its
    TypeScript twin.  Each function here mirrors one of that file's, and the
    names say which.

    WHERE EACH CONSTANT WAS READ -- the EduTool's own record, repeated here
    because a constant whose source is elsewhere is a constant nobody checks:
      * 0.03948, 17.9, 11.78, the critical-flow coefficient C(k), the
        subcritical F2 and the water reference density: API STD 520 Part I as
        the open-source `fluids` library implements it (C. Bell,
        fluids/safety_valve.py, MIT licence), which reproduces the standard's
        Examples 1, 2 and 5.  The standard itself was NOT read.
      * Q = C F A^0.82 with C = 21 000 or 34 500 (Btu/h, ft2): API STD 521
        6th ed. (2014) section 4.4.13.2.4.2 as the DIERS Users Group document
        "Fire Exposure of Low Volatility Liquids" (Rev. 9, 2018) quotes it.
        The standard itself was NOT read.  The SI form is converted here,
        exactly, from the US-customary one.
      * The accumulation (10 % or 3 psi for a single device, 21 % for fire):
        ASME BPVC VIII-1 UG-125(c) as a secondary summary quotes it.  The Code
        was NOT read.  The 16 % multiple-device allowance is not offered: the
        sizer models ONE device per protected item.
      * The API 526 letter areas D..T in square inches: `fluids`'
        `API526_A_sq_inch` (same file, same licence), which cites API STD 526.
        The standard itself was NOT read.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <algorithm>
#include <array>
#include <cmath>

namespace Choupo {
namespace reliefMath {

//  ---- units and constants (each the twin of an overpressure.ts export) ----

//  Standard atmosphere [Pa]: gauge + this = absolute.             P_ATM_PA
constexpr scalar pAtmPa = 101325.0;
//  1 psi [Pa], exact from 0.45359237 kg, g_n and 0.0254 m.          PSI_PA
constexpr scalar psiPa = 0.45359237 * 9.80665 / (0.0254 * 0.0254);
//  1 Btu/h [W], International Table Btu.                       BTU_PER_H_W
constexpr scalar btuPerHourW = 1055.05585262 / 3600.0;
//  ft2 per m2 (1 ft = 0.3048 m exactly).                       FT2_PER_M2
constexpr scalar ft2PerM2 = 1.0 / (0.3048 * 0.3048);
//  The water density API 520's specific gravity is referred to, as the open
//  `fluids` implementation takes it to reproduce Example 5.  WATER_REF_DENSITY
constexpr scalar waterRefDensity = 999.0107539518483;

//  API 520 Part I, SI form (A mm2, W kg/h, P kPa, T K, M kg/kmol, Q L/min).
constexpr scalar api520C0          = 0.03948;     //  API520_C0
constexpr scalar api520Subcritical = 17.9;        //  API520_SUBCRITICAL
constexpr scalar api520Liquid      = 11.78;       //  API520_LIQUID

//  The fire coefficient as published (Btu/h with A in ft2).     FIRE_C_USC
constexpr scalar fireCAdequate   = 21000.0;
constexpr scalar fireCInadequate = 34500.0;
constexpr scalar fireExponent    = 0.82;          //  FIRE_EXPONENT

//  The allowed accumulation above the MAWP while relieving.    ACCUMULATION
//  A single non-fire device: 10 % or 3 psi, whichever is larger; fire: 21 %,
//  quoted with no psi floor and coded with none.
constexpr scalar accumulationSingle      = 0.10;
constexpr scalar accumulationSingleMinPsi = 3.0;
constexpr scalar accumulationFire         = 0.21;

//  ---- the pressure ladder ---------------------------------------------------

//  The highest gauge pressure [Pa g] the item may see while one device set at
//  its MAWP relieves.                                   maxAccumulatedGauge
inline scalar maxAccumulatedGauge(scalar mawpGaugePa, bool fire)
{
    if (fire) return mawpGaugePa * (1.0 + accumulationFire);
    return std::max(mawpGaugePa * (1.0 + accumulationSingle),
                    mawpGaugePa + accumulationSingleMinPsi * psiPa);
}

//  The relieving pressure P1 [Pa abs] the equations take.  relievingPressureAbs
inline scalar relievingPressureAbs(scalar mawpGaugePa, bool fire)
{
    return maxAccumulatedGauge(mawpGaugePa, fire) + pAtmPa;
}

//  ---- gas or vapour ----------------------------------------------------------

//  The critical-flow coefficient C(k); k = 1 is the L'Hopital limit.
//                                                         criticalCoefficient
inline scalar criticalCoefficient(scalar k)
{
    if (std::fabs(k - 1.0) < 1.0e-9) return api520C0 * std::sqrt(1.0 / std::exp(1.0));
    return api520C0 * std::sqrt(k * std::pow(2.0 / (k + 1.0), (k + 1.0) / (k - 1.0)));
}

//  The critical pressure ratio P_cf/P1 = (2/(k+1))^(k/(k-1)). criticalPressureRatio
inline scalar criticalPressureRatio(scalar k)
{
    if (std::fabs(k - 1.0) < 1.0e-9) return std::exp(-0.5);
    return std::pow(2.0 / (k + 1.0), k / (k - 1.0));
}

//  The subcritical coefficient F2(k, r), r = P2/P1.       subcriticalCoefficient
inline scalar subcriticalCoefficient(scalar k, scalar r)
{
    return std::sqrt((k / (k - 1.0)) * std::pow(r, 2.0 / k)
                     * ((1.0 - std::pow(r, (k - 1.0) / k)) / (1.0 - r)));
}

struct GasSizing
{
    bool   critical = true;
    scalar A_mm2       = 0.0;
    scalar rc          = 0.0;    // the critical pressure ratio
    scalar r           = 0.0;    // the actual P2/P1
    scalar coefficient = 0.0;    // C(k) critical, F2 subcritical
};

//  The required effective area of a gas or vapour relief.            gasArea
//  W kg/h, T K, M kg/kmol, P1 and P2 kPa ABSOLUTE.
inline GasSizing gasArea(scalar W_kg_h, scalar T_K, scalar Z, scalar M,
                         scalar k, scalar P1_kPa, scalar P2_kPa,
                         scalar Kd, scalar Kb, scalar Kc)
{
    GasSizing g;
    g.rc = criticalPressureRatio(k);
    g.r  = P2_kPa / P1_kPa;
    if (g.r <= g.rc)
    {
        g.critical    = true;
        g.coefficient = criticalCoefficient(k);
        g.A_mm2 = W_kg_h / (g.coefficient * Kd * P1_kPa * Kb * Kc)
                * std::sqrt(T_K * Z / M);
        return g;
    }
    g.critical    = false;
    g.coefficient = subcriticalCoefficient(k, g.r);
    g.A_mm2 = api520Subcritical * W_kg_h / (g.coefficient * Kd * Kc)
            * std::sqrt(T_K * Z / (M * P1_kPa * (P1_kPa - P2_kPa)));
    return g;
}

//  ---- liquid -----------------------------------------------------------------

//  The required effective area of a liquid relief [mm2].          liquidArea
//  Q L/min, G the specific gravity against `waterRefDensity`, and the
//  pressure DIFFERENCE P1 - P2 in kPa (gauge or absolute alike).
inline scalar liquidArea(scalar Q_L_min, scalar G, scalar dP_kPa,
                         scalar Kd, scalar Kw, scalar Kc, scalar Kv)
{
    return api520Liquid * Q_L_min / (Kd * Kw * Kc * Kv) * std::sqrt(G / dP_kPa);
}

//  ---- the fire case ---------------------------------------------------------

//  The coefficient of Q = C F A^0.82 in W with A in m2.      fireCoefficientSI
inline scalar fireCoefficientSI(bool adequate)
{
    const scalar c = adequate ? fireCAdequate : fireCInadequate;
    return c * btuPerHourW * std::pow(ft2PerM2, fireExponent);
}

//  The heat a pool fire puts into the wetted surface [W].       fireHeatInput
inline scalar fireHeatInput(scalar A_wet_m2, scalar F, bool adequate)
{
    return fireCoefficientSI(adequate) * F * std::pow(A_wet_m2, fireExponent);
}

//  ---- API STD 526 orifice letters ---------------------------------------------

//  Letter and effective area [in2], smallest first (fluids' API526_A_sq_inch).
struct Orifice { char letter; scalar area_in2; };
constexpr std::array<Orifice, 14> api526 = {{
    {'D', 0.110}, {'E', 0.196}, {'F', 0.307}, {'G', 0.503}, {'H', 0.785},
    {'J', 1.287}, {'K', 1.838}, {'L', 2.853}, {'M', 3.60},  {'N', 4.34},
    {'P', 6.38},  {'Q', 11.05}, {'R', 16.00}, {'T', 26.00} }};
constexpr scalar mm2PerIn2 = 25.4 * 25.4;

//  The smallest API 526 orifice whose area is at least `A_mm2`, or nullptr
//  when one valve of the largest letter cannot pass it.
inline const Orifice* api526Select(scalar A_mm2)
{
    for (const auto& o : api526)
        if (o.area_in2 * mm2PerIn2 >= A_mm2) return &o;
    return nullptr;
}

} // namespace reliefMath
} // namespace Choupo

// ************************************************************************* //
