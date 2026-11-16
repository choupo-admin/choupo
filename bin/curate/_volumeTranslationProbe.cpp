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
    _volumeTranslationProbe  (a curation probe, not a shipped binary)

Description
    The fugacity coefficients, the enthalpy and entropy departures and the
    volume of a cubic WITHOUT and WITH a volume translation, at several
    states, printed at 17 digits for check_volume_translation.py (DEV.md 4c
    C408 (a)): ln phi per component and per root, H_residual, S_residual,
    molarVolume and molarVolumeLiquid.  The probe judges nothing.
\*---------------------------------------------------------------------------*/

#include "core/Dictionary.H"
#include "thermo/Component.H"
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

int main()
{
    VaporPressureModel::registerBuiltins();
    HeatCapacityModel::registerBuiltins();
    EquationOfState::registerBuiltins();
    std::vector<Component> comps;
    comps.push_back(fromCatalogue("nHexane"));
    comps.push_back(fromCatalogue("nDecane"));

    struct Cfg { std::string tag, off, on; };
    const std::vector<Cfg> cfgs = {
        { "SRK", "model SRK;",
          "model SRK; volumeTranslation { model Peneloux; components {"
          " nHexane { ZRA 0.2636; source \"probe\"; }"
          " nDecane { ZRA 0.2578; source \"probe\"; } } }" },
        { "PR", "model PengRobinson;",
          "model PengRobinson; volumeTranslation { model JhaveriYoungren; components {"
          " nHexane { shiftTable1 nHexane; source \"probe\"; }"
          " nDecane { family nAlkane; source \"probe\"; } } }" } };

    struct St { double T, P; double y0; };
    const std::vector<St> states = { {298.15, 1.01325e5, 0.5}, {400.0, 10.0e5, 0.3},
                                     {350.0, 50.0e5, 0.8}, {450.0, 2.0e5, 0.5} };

    std::cout << "<<<PROBE\n";
    for (const auto& cf : cfgs)
    {
        auto off = EquationOfState::New(Dictionary::fromString(cf.off), comps);
        auto on  = EquationOfState::New(Dictionary::fromString(cf.on),  comps);
        for (std::size_t k = 0; k < states.size(); ++k)
        {
            const auto& s = states[k];
            const std::vector<double> y = { s.y0, 1.0 - s.y0 };
            auto pv0 = off->phi(s.T, s.P, y),       pv1 = on->phi(s.T, s.P, y);
            auto pl0 = off->phiLiquid(s.T, s.P, y), pl1 = on->phiLiquid(s.T, s.P, y);
            auto emit = [&](const char* key, double a, double b)
            { std::printf("%s %zu %s %.17g %.17g\n", cf.tag.c_str(), k, key, a, b); };
            std::printf("%s %zu state %.17g %.17g %.17g\n", cf.tag.c_str(), k, s.T, s.P, s.y0);
            for (std::size_t i = 0; i < 2; ++i)
            {
                char key[32];
                std::snprintf(key, sizeof key, "lnphiV%zu", i);
                emit(key, std::log(pv0[i]), std::log(pv1[i]));
                std::snprintf(key, sizeof key, "lnphiL%zu", i);
                emit(key, std::log(pl0[i]), std::log(pl1[i]));
            }
            emit("HR", off->H_residual(s.T, s.P, y), on->H_residual(s.T, s.P, y));
            emit("SR", off->S_residual(s.T, s.P, y), on->S_residual(s.T, s.P, y));
            //  The LIQUID root's departures (C410): G = H - T S must close here too.
            emit("HRL", off->H_residualLiquid(s.T, s.P, y), on->H_residualLiquid(s.T, s.P, y));
            emit("SRL", off->S_residualLiquid(s.T, s.P, y), on->S_residualLiquid(s.T, s.P, y));
            emit("vV", off->molarVolume(s.T, s.P, y), on->molarVolume(s.T, s.P, y));
            emit("vL", off->molarVolumeLiquid(s.T, s.P, y), on->molarVolumeLiquid(s.T, s.P, y));
        }
    }
    std::cout << "PROBE>>>\n";
    return 0;
}
