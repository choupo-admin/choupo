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
\*---------------------------------------------------------------------------*/

#include "CoolingTower.H"
#include "thermo/ThermoPackage.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <limits>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include "thermo/vaporPressure/VaporPressureModel.H"
#include "thermo/heatCapacity/HeatCapacityModel.H"

namespace Choupo {

int CoolingTower::solve(const DictPtr& dict,
                        const ThermoPackage& thermo,
                        int verbosity)
{
    const std::size_t n = thermo.n();

    auto ins = dict->lookupDictList("inputStreams");
    if (ins.size() < 2)
        throw std::runtime_error("CoolingTower: needs TWO inputs -- the hot water"
            " and the ambient air, e.g. inputs ( hotWater air ).");

    auto readComp = [&](const DictPtr& sd) -> sVector
    {
        sVector v(n, 0.0); auto c = sd->subDict("composition"); scalar s = 0.0;
        for (const auto& k : c->keys()) v[thermo.indexOf(k)] = c->lookupScalar(k);
        for (auto x : v) s += x;
        if (s > 0.0) for (auto& x : v) x /= s;
        return v;
    };

    // ---- Identify the two roles from the streams themselves ----------------
    // Names are checked against what they name, on a PHYSICAL criterion at
    // each stream's own conditions: the AIR inlet is dominated by a PERMANENT
    // gas there (stream T above the component's critical T -- N2 at 298 K is
    // 172 K above its Tc, whatever vapour-pressure fit its record carries for
    // the cryogenic range); the WATER inlet is dominated by a SUBCRITICAL
    // condensable that is a liquid at its (T, P) (Psat(T) < P).  Anything
    // else refuses rather than guesses.
    DictPtr waterDict, airDict;
    std::size_t iW = n;                              // condensable index
    for (const auto& s : ins)
    {
        const sVector z = readComp(s);
        std::size_t iMax = 0;
        for (std::size_t i = 1; i < n; ++i) if (z[i] > z[iMax]) iMax = i;
        const Component& c  = thermo.comp(iMax);
        const scalar     Ts = s->lookupScalar("T", Dims::temperature);
        const scalar     Ps = s->lookupScalar("P", Dims::pressure);
        const bool permanentGas = (c.Tc() > 0.0 && Ts > c.Tc());
        const bool liquidHere   = !permanentGas && c.hasVaporPressure()
                               && c.vp().Psat_Pa(Ts) < Ps;
        if (liquidHere)
        {
            if (waterDict)
                throw std::runtime_error("CoolingTower: BOTH inlets are liquids at"
                    " their own (T, P) -- cannot tell the water from the air."
                    "  One inlet must be dominated by a permanent gas (stream T"
                    " above the carrier's critical T, e.g. nitrogen / air).");
            waterDict = s; iW = iMax;
        }
        else if (permanentGas) airDict = s;
    }
    if (!waterDict || !airDict)
        throw std::runtime_error("CoolingTower: could not identify the hot water"
            " (a stream dominated by a subcritical liquid at its own T, P) and"
            " the air (a stream dominated by a permanent gas, T above its Tc)"
            " among the inputs.");

    const sVector yAir = readComp(airDict);
    std::size_t iC = 0;                              // carrier index
    for (std::size_t i = 1; i < n; ++i) if (yAir[i] > yAir[iC]) iC = i;
    if (iC == iW)
        throw std::runtime_error("CoolingTower: the air inlet is dominated by the"
            " condensable itself -- no carrier to hold the humidity.");

    const Component& condensable = thermo.comp(iW);
    const Component& carrier     = thermo.comp(iC);

    // ---- Property refusals, each naming component and slot -----------------
    auto need = [](bool ok, const std::string& what)
    {
        if (!ok) throw std::runtime_error("CoolingTower: missing datum -- " + what);
    };
    need(condensable.hasVaporPressure(),
         condensable.name() + " needs a vapour-pressure model (saturation curve).");
    need(condensable.hasCpLiquid(),
         condensable.name() + " needs a liquid Cp (water-side sensible heat).");
    need(condensable.hasCpIdealGas(),
         condensable.name() + " needs an ideal-gas Cp (vapour humid heat).");
    need(condensable.Hvap_Tb() > 0.0,
         condensable.name() + " needs a latent heat (Hvap).");
    need(carrier.hasCpIdealGas(),
         carrier.name() + " needs an ideal-gas Cp (dry-air humid heat).");

    // ---- Inlet states ------------------------------------------------------
    const scalar F_L  = waterDict->lookupScalar("F", Dims::molarFlow);   // kmol/s
    const scalar T_Lin = waterDict->lookupScalar("T", Dims::temperature);
    const scalar P     = waterDict->lookupScalar("P", Dims::pressure);
    const sVector zW   = readComp(waterDict);
    const scalar F_air = airDict->lookupScalar("F", Dims::molarFlow);
    const scalar T_Gin = airDict->lookupScalar("T", Dims::temperature);

    const scalar Mv = condensable.MW();                                  // kg/kmol
    const scalar Mc = carrier.MW();

    const scalar G_dry = F_air * yAir[iC] * Mc;                          // kg/s dry
    const scalar L_in  = F_L * zW[iW] * Mv;                             // kg/s water
    if (G_dry <= 0.0 || L_in <= 0.0)
        throw std::runtime_error("CoolingTower: a zero water or dry-air flow"
            " reached the tower -- nothing to contact.");
    const scalar Y1 = (yAir[iW] * F_air * Mv) / G_dry;                  // kg/kg dry

    // ---- Spec: EXACTLY ONE of merkelNumber | T_water_out -------------------
    auto op = dict->subDict("operation");
    const bool hasMe = op->found("merkelNumber");
    const bool hasT  = op->found("T_water_out");
    if (hasMe == hasT)
        throw std::runtime_error("CoolingTower: specify EXACTLY ONE of"
            " 'merkelNumber' (rating: T_water_out is the result) or"
            " 'T_water_out' (design: the required Merkel number is the"
            " result) in operation{}.");

    // ---- Humid-air construction (classical psychrometric datum) ------------
    // h per kg DRY air, datum: dry gas and LIQUID water at T0 = 273.15 K.
    const scalar T0   = 273.15;
    const scalar lam0 = condensable.Hvap_latent(T0) / Mv * 1000.0;       // J/kg
    const scalar Tmid_air = 0.5 * (T_Gin + T_Lin);
    const scalar cpc  = carrier.cpIdealGas().Cp(Tmid_air)     / Mc * 1000.0;  // J/(kg.K)
    const scalar cpv  = condensable.cpIdealGas().Cp(Tmid_air) / Mv * 1000.0;
    const scalar cpL  = condensable.cpLiquid().Cp(0.5 * (T_Lin + T0 + 25.0))
                        / Mv * 1000.0;                                   // J/(kg.K)

    auto Ysat = [&](scalar T) -> scalar
    {
        const scalar pv = condensable.vp().Psat_Pa(T);
        if (pv <= 0.0 || pv >= 0.95 * P)
            throw std::runtime_error("CoolingTower: saturation humidity is"
                " undefined at T = " + std::to_string(T) + " K (Psat out of"
                " range at this pressure) -- the water inlet is too hot for"
                " an evaporative tower at " + std::to_string(P / 1.0e5) + " bar.");
        return (Mv / Mc) * pv / (P - pv);
    };
    auto hHumid = [&](scalar T, scalar Y) -> scalar
    {
        return cpc * (T - T0) + Y * (lam0 + cpv * (T - T0));             // J/kg dry
    };
    auto hStar = [&](scalar T) -> scalar { return hHumid(T, Ysat(T)); };

    // ---- Inlet-air wet bulb (adiabatic saturation, Lewis = 1) --------------
    // Solve  Ysat(Twb) - Y1 = (cpc + Y1 cpv)(T_Gin - Twb) / lambda(Twb).
    auto fWb = [&](scalar Twb) -> scalar
    {
        const scalar lam = condensable.Hvap_latent(Twb) / Mv * 1000.0;
        return Ysat(Twb) - Y1 - (cpc + Y1 * cpv) * (T_Gin - Twb) / lam;
    };
    scalar wbLo = T0 + 0.5, wbHi = T_Gin;
    if (fWb(wbHi) < 0.0)
        throw std::runtime_error("CoolingTower: the inlet air is supersaturated"
            " (its humidity exceeds saturation at its own temperature) --"
            " check the air inlet composition.");
    for (int it = 0; it < 100 && (wbHi - wbLo) > 1.0e-7; ++it)
    { const scalar m = 0.5 * (wbLo + wbHi); (fWb(m) >= 0.0 ? wbHi : wbLo) = m; }
    const scalar T_wb = 0.5 * (wbLo + wbHi);

    const scalar h1 = hHumid(T_Gin, Y1);                                 // air inlet

    // ---- The Merkel integral over a candidate T_out ------------------------
    // Operating line from the BOTTOM (air in, water out):
    //   h(T) = h1 + (L cpL / G)(T - T_out).
    // Composite Simpson on NSEG intervals; a non-positive driving force
    // anywhere reports +infinity (the pinched / infeasible side), which the
    // rating bisection and the design refusal both read.
    const scalar LG = L_in / G_dry;                                      // kg/kg
    constexpr int NSEG = 200;                                            // even
    auto merkel = [&](scalar T_out) -> scalar
    {
        const scalar dT = (T_Lin - T_out) / NSEG;
        if (dT <= 0.0) return 0.0;
        scalar sum = 0.0;
        for (int k = 0; k <= NSEG; ++k)
        {
            const scalar T  = T_out + dT * k;
            const scalar df = hStar(T) - (h1 + LG * cpL * (T - T_out));
            if (df <= 0.0) return std::numeric_limits<scalar>::infinity();
            const scalar w = (k == 0 || k == NSEG) ? 1.0 : (k % 2 ? 4.0 : 2.0);
            sum += w / df;
        }
        return cpL * sum * dT / 3.0;
    };

    // ---- Solve the declared mode -------------------------------------------
    scalar T_out, Me;
    std::string mode;
    if (hasT)
    {
        mode  = "design";
        T_out = op->lookupScalar("T_water_out", Dims::temperature);
        if (T_out >= T_Lin)
            throw std::runtime_error("CoolingTower: T_water_out ("
                + std::to_string(T_out) + " K) must lie BELOW the water inlet ("
                + std::to_string(T_Lin) + " K) -- a tower only cools.");
        if (T_out <= T_wb)
            throw std::runtime_error("CoolingTower: T_water_out ("
                + std::to_string(T_out) + " K) is at or below the inlet-air"
                " wet bulb (" + std::to_string(T_wb) + " K) -- the"
                " thermodynamic floor of an evaporative tower.  Raise the"
                " target or bring drier/cooler air.");
        Me = merkel(T_out);
        if (!std::isfinite(Me))
            throw std::runtime_error("CoolingTower: the operating line touches"
                " the saturation curve before reaching T_water_out -- the"
                " tower is PINCHED at L/G = " + std::to_string(LG) + " kg/kg."
                "  Lower L/G (more air, or less water) or relax the target.");
    }
    else
    {
        mode = "rating";
        Me   = op->lookupScalar("merkelNumber");
        if (Me <= 0.0)
            throw std::runtime_error("CoolingTower: merkelNumber must be"
                " positive (KaV/L of the packing).");
        // Me(T_out) is monotone decreasing, +inf at the wet-bulb floor (or at
        // a pinch), -> 0 as T_out -> T_Lin: bisect.
        scalar lo = T_wb + 1.0e-4, hi = T_Lin - 1.0e-6;
        if (merkel(hi) > Me)
            throw std::runtime_error("CoolingTower: even a vanishing range"
                " needs more packing than merkelNumber = " + std::to_string(Me)
                + " -- check the spec (this indicates L/G far too high).");
        for (int it = 0; it < 200 && (hi - lo) > 1.0e-8; ++it)
        {
            const scalar m  = 0.5 * (lo + hi);
            const scalar Mm = merkel(m);
            (std::isfinite(Mm) && Mm <= Me ? hi : lo) = m;
        }
        T_out = 0.5 * (lo + hi);
    }

    // ---- Classical CTI four-point Chebyshev estimate, published beside -----
    {
        scalar sum = 0.0;
        bool   ok  = true;
        for (scalar f : { 0.1, 0.4, 0.6, 0.9 })
        {
            const scalar T  = T_out + f * (T_Lin - T_out);
            const scalar df = hStar(T) - (h1 + LG * cpL * (T - T_out));
            if (df <= 0.0) { ok = false; break; }
            sum += 1.0 / df;
        }
        if (ok) kpis_["merkelNumber_chebyshev4"]
            = cpL * (T_Lin - T_out) * sum / 4.0;
    }

    // ---- Air outlet: energy balance + the saturated-exit closure -----------
    const scalar range = T_Lin - T_out;
    const scalar h2 = h1 + LG * cpL * range;                             // J/kg dry
    scalar taLo = T_wb, taHi = T_Lin + 20.0;                             // h* monotone
    for (int it = 0; it < 100 && (taHi - taLo) > 1.0e-7; ++it)
    { const scalar m = 0.5 * (taLo + taHi); (hStar(m) >= h2 ? taHi : taLo) = m; }
    const scalar T_Gout = 0.5 * (taLo + taHi);
    const scalar Y2     = Ysat(T_Gout);

    const scalar evap_kg = G_dry * (Y2 - Y1);                            // kg/s
    const scalar evap_km = evap_kg / Mv;                                 // kmol/s
    if (evap_km > F_L * zW[iW])
        throw std::runtime_error("CoolingTower: the saturated-exit closure asks"
            " for more evaporation than the water fed -- the spec starves the"
            " tower (raise the water flow or lower the duty).");

    // ---- Outlet streams ----------------------------------------------------
    produced_.clear();
    ProcessStream wOut;
    wOut.name = "coolWater";  wOut.T = T_out;  wOut.P = P;  wOut.vf = 0.0;
    wOut.F = F_L - evap_km;
    wOut.z.assign(n, 0.0);
    if (wOut.F > 0.0)
        for (std::size_t i = 0; i < n; ++i)
            wOut.z[i] = (F_L * zW[i] - (i == iW ? evap_km : 0.0)) / wOut.F;
    produced_.push_back(wOut);

    ProcessStream aOut;
    aOut.name = "humidAir";  aOut.T = T_Gout;  aOut.P = P;  aOut.vf = 1.0;
    aOut.F = F_air + evap_km;
    aOut.z.assign(n, 0.0);
    if (aOut.F > 0.0)
        for (std::size_t i = 0; i < n; ++i)
            aOut.z[i] = (yAir[i] * F_air + (i == iW ? evap_km : 0.0)) / aOut.F;
    produced_.push_back(aOut);

    // ---- The Merkel diagram as the unit's profile --------------------------
    {
        UnitProfile p;
        p.xAxis = "T_K";
        constexpr int NP = 41;
        auto& colT  = p.columns["T_K"];
        auto& colOp = p.columns["h_operating_kJ_kg"];
        auto& colEq = p.columns["h_saturation_kJ_kg"];
        for (int k = 0; k < NP; ++k)
        {
            const scalar T = T_out + (T_Lin - T_out) * k / (NP - 1);
            colT.push_back(T);
            colOp.push_back((h1 + LG * cpL * (T - T_out)) / 1000.0);
            colEq.push_back(hStar(T) / 1000.0);
        }
        p.markers.push_back({ T_out, "water out (approach "
            + std::to_string(T_out - T_wb).substr(0, 5) + " K)" });
        p.markers.push_back({ T_Lin, "water in" });
        profile_ = p;
    }

    // ---- KPIs --------------------------------------------------------------
    kpis_["T_water_out"]   = T_out;
    kpis_["T_air_out"]     = T_Gout;
    kpis_["T_wb_in"]       = T_wb;
    kpis_["range_K"]       = range;
    kpis_["approach_K"]    = T_out - T_wb;
    kpis_["merkelNumber"]  = Me;
    kpis_["L_over_G"]      = LG;
    kpis_["Y_in"]          = Y1;
    kpis_["Y_out"]         = Y2;
    kpis_["evaporation_kg_s"] = evap_kg;
    kpis_["makeup_kg_s"]   = evap_kg;       // drift/blowdown not modelled
    kpis_["evaporation_pct_of_L"] = 100.0 * evap_kg / L_in;
    kpis_["Q_kW"]          = L_in * cpL * range / 1000.0;                // water side

    // ---- Announcements (the method's hypotheses, never silent) -------------
    if (verbosity >= 1)
        std::cout << "  [coolingTower] Merkel model: Lewis = 1; L held constant"
                     " inside the integral (loss reported: "
                  << std::fixed << std::setprecision(2)
                  << kpis_["evaporation_pct_of_L"] << " % of L); exit air"
                     " assumed SATURATED; cp at mean film T.\n";

    if (verbosity >= 2)
        std::cout << "\n======================  Cooling Tower Result  ====================\n"
                  << "  Mode: " << mode << "   (Merkel enthalpy driving force)\n"
                  << "  Water: " << std::setprecision(2) << T_Lin << " -> " << T_out
                  << " K   (range " << range << " K, approach "
                  << (T_out - T_wb) << " K over T_wb " << T_wb << " K)\n"
                  << "  Air:   " << T_Gin << " -> " << T_Gout << " K   Y: "
                  << std::setprecision(5) << Y1 << " -> " << Y2 << " kg/kg dry\n"
                  << "  L/G = " << std::setprecision(4) << LG
                  << " kg/kg   Me = KaV/L = " << Me
                  << (kpis_.count("merkelNumber_chebyshev4")
                      ? "   (Chebyshev-4: "
                        + std::to_string(kpis_["merkelNumber_chebyshev4"]).substr(0, 6) + ")"
                      : "")
                  << "\n  Evaporation = " << std::scientific << std::setprecision(3)
                  << evap_kg << " kg/s (= make-up; drift/blowdown not modelled)\n"
                  << "  Water-side duty = " << std::fixed << std::setprecision(1)
                  << kpis_["Q_kW"] << " kW\n"
                  << "==================================================================\n\n";
    return 0;
}

} // namespace Choupo
