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

#include "core/Advisory.H"
#include "thermo/Component.H"
#include "thermo/ThermoPackage.H"

#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <vector>
#include "thermo/vaporPressure/VaporPressureModel.H"
#include "thermo/heatCapacity/HeatCapacityModel.H"

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

    //  LABEL THE CURVE WITH THE VALUE GIVEN, not a truncation of it.  The
    //  list is in PERCENT, and `static_cast<int>` collapsed anything below 1
    //  to the same "rh:0" -- so a user writing fractions (0.2 0.4 0.6 0.8,
    //  the other natural reading of "relative humidity") got FOUR curves all
    //  named rh:0, drawn on top of each other, and a chart that looked like
    //  it had one line.  Plausible and wrong, with nothing said.
    auto rhLabel = [](double phi)
    {
        std::ostringstream o;
        o << std::defaultfloat << phi;      // 60 -> "60", 0.2 -> "0.2"
        return o.str();
    };
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
        {
            csv << Tc_ << "," << ratio * pv / (P - pv) << ",saturation\n";
            //  Pin the ceiling at BOTH ends of the declared range.  Y_sat is
            //  ratio * Psat/(P - Psat), so it moves with the vapour-pressure
            //  model AND with `ratio` -- the molar-mass ratio of the DECLARED
            //  carrier.  That second dependence is the reason this chart is
            //  computed rather than copied: with N2 as carrier Y_sat(60 C) is
            //  0.1586, where a printed AIR chart reads 0.152.
            {
                const double ys = ratio * pv / (P - pv);
                if (!diag_.count("Y_sat_first")) diag_["Y_sat_first"] = ys;
                diag_["Y_sat_last"] = ys;
                diag_["nSaturationPoints"] = diag_["nSaturationPoints"] + 1.0;
            }
        }
        for (double phi : rhList)
        {
            const double pvp = (phi / 100.0) * pv;
            if (pvp > 0.0 && pvp < PV_CAP)
                csv << Tc_ << "," << ratio * pvp / (P - pvp)
                    << ",rh:" << rhLabel(phi) << "\n";
            diag_["nRhCurves"] = static_cast<double>(rhList.size());
        }
    }

    // -- adiabatic-saturation (wet-bulb) lines -- the drying tool -------------
    const bool canWB = carrier->hasCpIdealGas() && cond->hasCpIdealGas()
                    && cond->Hvap_Tb() > 0.0 && cond->Tc() > 0.0;
    if (!wbList.empty() && !canWB)
    {
        //  RIDE THE ADVISORY LOG, not only the console: the GUI's caveat
        //  band reads AdvisoryLog, so a console-only explanation left the
        //  chart visibly thinner with no visible reason (found 2026-08-31
        //  when the `air` carrier -- imported without an ideal-gas Cp --
        //  drew only saturation and RH and the reader had to guess why).
        const std::string why =
            "psychrometric chart: adiabatic-saturation and wet-bulb"
            " families SKIPPED -- carrier '" + carrierN + "' or condensable"
            " '" + condensableN + "' lacks an ideal-gas Cp, or the"
            " condensable lacks Hvap/Tc.  The chart shows only saturation"
            " and relative-humidity curves.";
        AdvisoryLog::instance().add("props", "warning",
                                    "psychro families", why);
        if (verbosity >= 1)
            std::cerr << "[psychro] " << why << "\n";
    }
    std::size_t nAdiabaticDrawn = 0;
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
                if (k == 0) ++nAdiabaticDrawn;
                //  The adiabatic line's END is where the latent-heat term has
                //  done its work; it moves with Hvap and with the moist-gas
                //  heat capacity, neither of which the saturation anchors see.
                diag_["Y_adiabatic_last"] = Y;
            }
        }

    //  COUNT WHAT WAS DRAWN, UNDER THE NAME OF THE FAMILY THAT WAS DRAWN.
    //
    //  This used to be `diag_["nWetBulbCurves"]`, assigned INSIDE the
    //  adiabatic loop from the REQUESTED list length.  Three things were
    //  wrong at once: it named the family it was not counting, it reported a
    //  request rather than a result, and it was the only number any golden
    //  could reach -- so psychro01, the corpus's only psychrometric witness,
    //  has been pinning `nWetBulbCurves 3` while emitting ZERO `wetbulb:`
    //  rows.  A golden pinning that key could not have seen the Lewis family
    //  appear or disappear, which is exactly what it looked like it was for.
    diag_["nAdiabaticCurves"] = static_cast<double>(nAdiabaticDrawn);

    // -- TRUE wet-bulb lines via the Lewis number (Chilton-Colburn) ----------
    // T_wb equals the adiabatic-saturation T ONLY when Le = alpha/D_AB ~ 1
    // (air-water, a near-coincidence).  For other pairs Le != 1 and the wet-bulb
    // line's slope is scaled by Le^(2/3) -- the two visibly diverge.  Needs gas
    // diffusivity (Fuller) + thermal conductivity (Eucken) in the package.
    //  A FAMILY THAT DRAWS NOTHING MUST SAY SO.  Every exit below was a bare
    //  `continue`: the block could be entered, iterate over all its requested
    //  temperatures, emit not one row, and leave no trace anywhere -- no
    //  diagnostic, no console line, nothing in the CSV.  Silence then meant
    //  three different things at once (the transport models were absent; they
    //  were present and one of them refused; the family was drawn) and a
    //  reader could not tell which.  So: count what is drawn, count each
    //  reason a curve was skipped, and publish both.
    std::size_t nTrueWetBulbDrawn = 0;
    std::size_t skipYas = 0, skipLatent = 0, skipTransport = 0, skipThrew = 0;
    const bool transportAvailable =
        thermo.hasDiffusivity() && thermo.hasThermalConductivity();
    if (canWB && transportAvailable)
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
            if (Yas < 0.0) { ++skipYas; continue; }
            const double lam = cond->Hvap_latent(Tas_K) / Mv * 1000.0;   // J/kg
            if (lam <= 0.0) { ++skipLatent; continue; }
            const double cpc = cpMass(*carrier, Tas_K);
            const double cpv = cpMass(*cond, Tas_K);
            double Le;
            try
            {
                const double Dab = thermo.diffusivityGas(Tas_K, P, iV, iC);   // m^2/s
                const double kg  = thermo.thermalConductivityGas(Tas_K, yC);  // W/(m K)
                const double rho = P * (Mc / 1000.0) / (R * Tas_K);           // kg/m^3
                const double alpha = kg / (rho * cpc);                        // m^2/s
                if (Dab <= 0.0 || alpha <= 0.0) { ++skipTransport; continue; }
                Le = alpha / Dab;
            }
            catch (const std::exception&) { ++skipThrew; continue; }
            const double cs = cpc + Yas * cpv;
            const double slope = cs * std::pow(Le, 2.0 / 3.0) / lam;   // Le^(2/3) factor
            for (std::size_t k = 0; k < n; ++k)
            {
                const double Tc_ = TasC + (TmaxC - TasC) * static_cast<double>(k) / static_cast<double>(n - 1);
                const double Y = Yas - slope * (Tc_ - TasC);
                if (Y < 0.0) break;
                csv << Tc_ << "," << Y << ",wetbulb:" << static_cast<int>(TasC) << "\n";
                if (k == 0)
                {
                    ++nTrueWetBulbDrawn;
                    //  Le is the WHOLE point of this family: at Le = 1 it lies
                    //  exactly on the adiabatic line and the two are one
                    //  quantity; away from 1 they diverge, and a reader with
                    //  only the curves cannot tell which situation is on the
                    //  chart.  Published so a golden reads the separation and
                    //  not merely that something was drawn.
                    diag_["Lewis_last"] = Le;
                }
            }
        }
    }

    diag_["nTrueWetBulbCurves"] = static_cast<double>(nTrueWetBulbDrawn);
    if (!wbList.empty() && nTrueWetBulbDrawn == 0)
    {
        std::ostringstream why;
        why << "psychrometric chart: the TRUE wet-bulb family (the"
               " Le^(2/3) one) drew NOTHING for the "
            << wbList.size() << " requested temperature(s).  The chart"
               " therefore shows only adiabatic-saturation lines, and"
               " reading them as wet-bulb lines assumes Le = 1.  Reason: ";
        if (!canWB)
            why << "the carrier or the condensable lacks an ideal-gas Cp,"
                   " or the condensable lacks Hvap/Tc.";
        else if (!transportAvailable)
            why << "the package declares no `transport { diffusivity;"
                   " thermalConductivity; }` models, so no Lewis number"
                   " can be formed.";
        else
            why << skipYas << " past boiling, " << skipLatent
                << " with no latent heat, " << skipTransport
                << " with a non-positive diffusivity or diffusivity of"
                   " heat, " << skipThrew
                << " where a transport model refused.";
        //  Same rule as the canWB skip above: the reason must reach the
        //  GUI's caveat band, not only the console.
        AdvisoryLog::instance().add("props", "warning",
                                    "psychro wet-bulb", why.str());
        if (verbosity >= 1)
            std::cout << why.str() << "\n";
    }

    if (verbosity >= 2)
        std::cout << "psychrometricChart: " << carrierN << " / " << condensableN
                  << " at " << P / 1000.0 << " kPa, " << TminC << "-" << TmaxC << " C.\n";
    return 0;
}

} // namespace Choupo
