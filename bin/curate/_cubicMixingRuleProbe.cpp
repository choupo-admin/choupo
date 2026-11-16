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
Application
    _cubicMixingRuleProbe  (a curation probe, not a shipped binary)

Description
    The fugacity coefficients of BOTH roots, the volumes of both roots and the
    enthalpy and entropy departures of SRK under each cubic mixing rule
    (no `mixingRule` word, vanDerWaalsOneFluid, MHV1, MHV2) at several states
    of methanol (1) + water (2), printed at 17 digits for
    check_cubic_mixing_rule.py (DEV.md 4c C408 (b)).  The G^E model is the
    catalogue's own NRTL pair, passed inline so the probe needs no record
    lookup.  The probe judges nothing.

    Output lines:   <rule> <k> state T P y1
                    <rule> <k> <key> <value ...>
\*---------------------------------------------------------------------------*/

#include "core/Dictionary.H"
#include "thermo/Component.H"
#include "thermo/activityCoefficient/ActivityModel.H"
#include "thermo/equationOfState/EquationOfState.H"
#include "thermo/heatCapacity/HeatCapacityModel.H"
#include "thermo/vaporPressure/VaporPressureModel.H"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <iostream>
#include <string>
#include <vector>

using namespace Choupo;

static Component fromCatalogue(const std::string& name)
{
    const char* h = std::getenv("CHOUPO_HOME");
    Component c;
    c.readFromDict(Dictionary::fromFile(
        std::string(h ? h : ".") + "/data/standards/components/" + name + ".dat"));
    return c;
}

int main(int argc, char** argv)
{
    VaporPressureModel::registerBuiltins();
    HeatCapacityModel::registerBuiltins();
    ActivityModel::registerBuiltins();
    EquationOfState::registerBuiltins();
    std::vector<Component> comps;
    comps.push_back(fromCatalogue("methanol"));
    comps.push_back(fromCatalogue("water"));

    //  The NRTL pair is passed by the gate, which reads it from the catalogue
    //  record: argv = a_ij b_ij a_ji b_ji alpha.
    if (argc < 6) { std::cerr << "usage: probe a_ij b_ij a_ji b_ji alpha\n"; return 2; }
    const std::string ge =
        std::string(" activityModel { model NRTL; pairs ( { i methanol; j water;")
        + " a_ij " + argv[1] + "; b_ij " + argv[2] + "; a_ji " + argv[3] + "; b_ji "
        + argv[4] + "; alpha " + argv[5] + "; } ); }";

    struct Cfg { std::string tag, dict; };
    const std::vector<Cfg> cfgs = {
        { "none",      "model SRK;" },
        { "oneFluid",  "model SRK; mixingRule vanDerWaalsOneFluid;" },
        { "MHV1",      "model SRK; mixingRule MHV1;" + ge },
        { "MHV2",      "model SRK; mixingRule MHV2;" + ge },
        //  the same rules on the fitted Mathias-Copeman alpha (C408 slice 0): a_i
        //  from the alpha feeds the rule
        { "oneFluidmc", "model SRK; mixingRule vanDerWaalsOneFluid; alphaFunction MathiasCopeman;" },
        { "MHV1mc",    "model SRK; mixingRule MHV1; alphaFunction MathiasCopeman;" + ge },
        { "MHV2mc",    "model SRK; mixingRule MHV2; alphaFunction MathiasCopeman;" + ge } };

    struct St { double T, P, y0; };
    const std::vector<St> states = {
        { 373.15, 2.5e5, 0.3 }, { 423.15, 10.0e5, 0.6 }, { 373.15, 1.01325e5, 0.05 },
        { 450.0, 20.0e5, 0.5 }, { 373.15, 2.5e5, 1.0 }, { 373.15, 2.5e5, 0.0 },
        { 500.0, 5.0e5, 0.4 }, { 360.0, 1.0e5, 0.8 } };

    std::cout << "<<<PROBE\n";
    for (const auto& cf : cfgs)
    {
        auto eos = EquationOfState::New(Dictionary::fromString(cf.dict), comps);
        for (std::size_t k = 0; k < states.size(); ++k)
        {
            const auto& s = states[k];
            const std::vector<double> y = { s.y0, 1.0 - s.y0 };
            std::printf("%s %zu state %.17g %.17g %.17g\n", cf.tag.c_str(), k, s.T,
                        s.P, s.y0);
            auto pv = eos->phi(s.T, s.P, y);
            auto pl = eos->phiLiquid(s.T, s.P, y);
            std::printf("%s %zu lnphiV %.17g %.17g\n", cf.tag.c_str(), k,
                        std::log(pv[0]), std::log(pv[1]));
            std::printf("%s %zu lnphiL %.17g %.17g\n", cf.tag.c_str(), k,
                        std::log(pl[0]), std::log(pl[1]));
            std::printf("%s %zu vol %.17g %.17g\n", cf.tag.c_str(), k,
                        eos->molarVolume(s.T, s.P, y),
                        eos->molarVolumeLiquid(s.T, s.P, y));
            std::printf("%s %zu HRSR %.17g %.17g\n", cf.tag.c_str(), k,
                        eos->H_residual(s.T, s.P, y), eos->S_residual(s.T, s.P, y));
        }
        //  the temperature differences, for H^R = -R T^2 d(sum y ln phi)/dT and
        //  S^R = -d(R T sum y ln phi)/dT on the VAPOUR root (the root the
        //  engine's departures are on), at +-h around two states.
        const double h = 0.02;
        const std::vector<St> tdStates = { { 373.15, 2.5e5, 0.3 }, { 423.15, 10.0e5, 0.6 },
                                           { 450.0, 20.0e5, 0.5 }, { 500.0, 5.0e5, 0.4 } };
        for (std::size_t k = 0; k < tdStates.size(); ++k)
        {
            const auto& s = tdStates[k];
            const std::vector<double> y = { s.y0, 1.0 - s.y0 };
            auto sumLn = [&](double T)
            {
                auto p = eos->phi(T, s.P, y);
                return y[0] * std::log(p[0]) + y[1] * std::log(p[1]);
            };
            std::printf("%s %zu dT %.17g %.17g %.17g %.17g %.17g %.17g\n", cf.tag.c_str(),
                        k, s.T, s.P, s.y0, sumLn(s.T - h), sumLn(s.T), sumLn(s.T + h));
            std::printf("%s %zu dTh %.17g\n", cf.tag.c_str(), k, h);
            std::printf("%s %zu dTHS %.17g %.17g\n", cf.tag.c_str(), k,
                        eos->H_residual(s.T, s.P, y), eos->S_residual(s.T, s.P, y));
        }
    }
    std::cout << "PROBE>>>\n";
    return 0;
}
