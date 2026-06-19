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

#include "PsychrometricChart.H"

#include "thermo/Component.H"
#include "thermo/ThermoPackage.H"

#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <vector>

namespace Choupo {

namespace {

const Component* byName(const ThermoPackage& t, const std::string& nm)
{
    for (const auto& c : t.components()) if (c.name() == nm) return &c;
    return nullptr;
}

// Mass-basis ideal-gas Cp [J/(kg.K)] from the molar model and MW [g/mol].
double cpMass(const Component& c, double T_K)
{
    return c.cpIdealGas().Cp(T_K) / c.MW() * 1000.0;
}

} // namespace

int PsychrometricChart::run(const DictPtr& dict, const ThermoPackage& thermo, int verbosity)
{
    const std::string carrierN     = dict->lookupWord("carrier");
    const std::string condensableN = dict->lookupWord("condensable");
    const Component* carrier     = byName(thermo, carrierN);
    const Component* cond        = byName(thermo, condensableN);
    if (!carrier)
        throw std::runtime_error("psychrometricChart: carrier '" + carrierN
            + "' is not a component of the thermoPackage");
    if (!cond)
        throw std::runtime_error("psychrometricChart: condensable '" + condensableN
            + "' is not a component of the thermoPackage");
    if (!cond->hasVaporPressure())
        throw std::runtime_error("psychrometricChart: condensable '" + condensableN
            + "' has no vapour-pressure model (needed for the humidity curves)");

    const double P   = dict->lookupScalarOrDefault("P", 101325.0);     // Pa
    // Cap the curves at a sane vapour mole fraction: as T -> boiling, P_sat -> P
    // and Y -> infinity (the gas becomes pure vapour -- a useless asymptote, the
    // "150 kg/kg" artefact).  Real charts stop at Y ~ 1 (vapour fraction ~0.65),
    // letting the saturation curve exit the top.  Pair-agnostic.
    const double PV_CAP = 0.65 * P;
    const double Mc  = carrier->MW();
    const double Mv  = cond->MW();
    const double ratio = Mv / Mc;                                       // (M_v/M_c)
    const double TminC = dict->lookupScalarOrDefault("TminC", 0.0);
    const double TmaxC = dict->lookupScalarOrDefault("TmaxC", 150.0);
    std::size_t n = 80;
    if (dict->found("grid") && dict->subDict("grid")->found("n"))
        n = std::max<std::size_t>(8, static_cast<std::size_t>(dict->subDict("grid")->lookupScalar("n")));

    std::vector<double> rhList;
    if (dict->found("relativeHumidity")) rhList = dict->lookupList("relativeHumidity");
    else rhList = { 10, 20, 30, 40, 50, 60, 70, 80, 90 };

    std::vector<double> wbList;
    if (dict->found("wetBulb")) wbList = dict->lookupList("wetBulb");

    auto outDict = dict->subDict("output");
    std::ofstream csv(outDict->lookupWord("file"));
    if (!csv.is_open())
        throw std::runtime_error("psychrometricChart: cannot open output file");
    csv << "T_C,Y,curve\n";
    csv << std::fixed << std::setprecision(6);

    auto psat = [&](double T_K) -> double {
        try { return cond->vp().Psat_Pa(T_K); } catch (const std::exception&) { return -1.0; }
    };
    auto Ysat = [&](double T_K) -> double {
        const double pv = psat(T_K);
        if (pv <= 0.0 || pv >= PV_CAP) return -1.0;  // past the sane vapour-fraction cap
        return ratio * pv / (P - pv);
    };

    const double dT = (TmaxC - TminC) / static_cast<double>(n - 1);

    // -- saturation (phi = 100%) + relative-humidity curves -------------------
    for (std::size_t k = 0; k < n; ++k)
    {
        const double Tc_ = TminC + dT * static_cast<double>(k);
        const double T_K = Tc_ + 273.15;
        const double pv = psat(T_K);
        if (pv <= 0.0) continue;
        if (pv < PV_CAP)
            csv << Tc_ << "," << ratio * pv / (P - pv) << ",saturation\n";
        for (double phi : rhList)
        {
            const double pvp = (phi / 100.0) * pv;
            if (pvp > 0.0 && pvp < PV_CAP)
                csv << Tc_ << "," << ratio * pvp / (P - pvp)
                    << ",rh:" << static_cast<int>(phi) << "\n";
        }
    }

    // -- adiabatic-saturation (wet-bulb) lines -- the drying tool -------------
    const bool canWB = carrier->hasCpIdealGas() && cond->hasCpIdealGas()
                    && cond->Hvap_Tb() > 0.0 && cond->Tc() > 0.0;
    if (!wbList.empty() && !canWB && verbosity >= 1)
        std::cerr << "[psychro] wet-bulb lines skipped: need carrier+condensable "
                     "ideal-gas Cp and the condensable's Hvap/Tc.\n";
    if (canWB)
        for (double TasC : wbList)
        {
            const double Tas_K = TasC + 273.15;
            const double Yas = Ysat(Tas_K);
            if (Yas < 0.0) continue;                       // T_as past boiling
            const double lam = cond->Hvap_latent(Tas_K) / Mv * 1000.0;   // J/kg
            if (lam <= 0.0) continue;
            const double cpc = cpMass(*carrier, Tas_K);
            const double cpv = cpMass(*cond,    Tas_K);
            // The line starts saturated at (T_as, Y_as) and runs to higher T / lower Y.
            for (std::size_t k = 0; k < n; ++k)
            {
                const double Tc_ = TasC + (TmaxC - TasC) * static_cast<double>(k) / static_cast<double>(n - 1);
                if (Tc_ < TasC) continue;
                double cs = cpc + Yas * cpv;               // humid heat (iterate once for Y)
                double Y  = Yas - cs * (Tc_ - TasC) / lam;
                cs = cpc + (Y > 0 ? Y : 0.0) * cpv;
                Y  = Yas - cs * (Tc_ - TasC) / lam;
                if (Y < 0.0) break;
                csv << Tc_ << "," << Y << ",adiabatic:" << static_cast<int>(TasC) << "\n";
            }
        }

    // -- TRUE wet-bulb lines via the Lewis number (Chilton-Colburn) ----------
    // T_wb equals the adiabatic-saturation T ONLY when Le = alpha/D_AB ~ 1
    // (air-water, a near-coincidence).  For other pairs Le != 1 and the wet-bulb
    // line's slope is scaled by Le^(2/3) -- the two visibly diverge.  Needs gas
    // diffusivity (Fuller) + thermal conductivity (Eucken) in the package.
    if (canWB && thermo.hasDiffusivity() && thermo.hasThermalConductivity())
    {
        std::size_t iC = 0, iV = 0;
        for (std::size_t i = 0; i < thermo.n(); ++i)
        {
            if (&thermo.comp(i) == carrier) iC = i;
            if (&thermo.comp(i) == cond)    iV = i;
        }
        sVector yC(thermo.n(), 0.0); yC[iC] = 1.0;       // carrier-dominated gas
        constexpr double R = 8.314462618;
        for (double TasC : wbList)
        {
            const double Tas_K = TasC + 273.15;
            const double Yas = Ysat(Tas_K);
            if (Yas < 0.0) continue;
            const double lam = cond->Hvap_latent(Tas_K) / Mv * 1000.0;   // J/kg
            if (lam <= 0.0) continue;
            const double cpc = cpMass(*carrier, Tas_K);
            const double cpv = cpMass(*cond, Tas_K);
            double Le;
            try
            {
                const double Dab = thermo.diffusivityGas(Tas_K, P, iV, iC);   // m^2/s
                const double kg  = thermo.thermalConductivityGas(Tas_K, yC);  // W/(m K)
                const double rho = P * (Mc / 1000.0) / (R * Tas_K);           // kg/m^3
                const double alpha = kg / (rho * cpc);                        // m^2/s
                if (Dab <= 0.0 || alpha <= 0.0) continue;
                Le = alpha / Dab;
            }
            catch (const std::exception&) { continue; }
            const double cs = cpc + Yas * cpv;
            const double slope = cs * std::pow(Le, 2.0 / 3.0) / lam;   // Le^(2/3) factor
            for (std::size_t k = 0; k < n; ++k)
            {
                const double Tc_ = TasC + (TmaxC - TasC) * static_cast<double>(k) / static_cast<double>(n - 1);
                const double Y = Yas - slope * (Tc_ - TasC);
                if (Y < 0.0) break;
                csv << Tc_ << "," << Y << ",wetbulb:" << static_cast<int>(TasC) << "\n";
            }
        }
    }

    if (verbosity >= 2)
        std::cout << "psychrometricChart: " << carrierN << " / " << condensableN
                  << " at " << P / 1000.0 << " kPa, " << TminC << "-" << TmaxC << " C.\n";
    return 0;
}

} // namespace Choupo
