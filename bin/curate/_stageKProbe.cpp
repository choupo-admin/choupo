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
Application
    _stageKProbe  (a curation probe, not a shipped binary)

Description
    ThermoPackage::stageK at (T, P, z), for check_stagek_continuity
    (DEV.md 4c C245 slice 3, finding H1).  Usage:
        _stageKProbe <caseDir> <requestFile>
    A request line `SK T P z...` answers `OK K...` or `ERR <message>`,
    between `<<<PROBE` and `PROBE>>>`.  x and y passed to stageK are z
    itself (a reactive package ignores them).
\*---------------------------------------------------------------------------*/

#include "core/Dictionary.H"
#include "core/distribution/SizeDistribution.H"
#include "thermo/Database.H"
#include "thermo/PropertyContext.H"
#include "thermo/ThermoAnnounce.H"
#include "thermo/ThermoPackage.H"
#include "thermo/ThermoPackageBuilder.H"
#include "thermo/SurfaceTensionModel.H"
#include "thermo/activityCoefficient/ActivityModel.H"
#include "thermo/electrolyte/AqueousActivity.H"
#include "thermo/electrolyte/AqueousVolumetric.H"
#include "thermo/equationOfState/EquationOfState.H"
#include "thermo/heatCapacity/HeatCapacityModel.H"
#include "thermo/henrysLaw/HenrysLawRegistry.H"
#include "thermo/phase/Phase.H"
#include "thermo/pureFluid/PureFluidModel.H"
#include "thermo/solution/SolutionRegistry.H"
#include "thermo/transport/DiffusivityModel.H"
#include "thermo/transport/LiquidConductivityModel.H"
#include "thermo/transport/LiquidDiffusivityModel.H"
#include "thermo/transport/LiquidViscosityModel.H"
#include "thermo/transport/ThermalConductivityModel.H"
#include "thermo/transport/TransportModel.H"
#include "thermo/vaporPressure/VaporPressureModel.H"
#include "unitOperations/flash/StreamEquilibrium.H"
#include "unitOperations/saturation/BubblePoint.H"
#include "unitOperations/saturation/DewPoint.H"

#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <set>
#include <sstream>
#include <string>
#include <vector>

using namespace Choupo;
namespace fs = std::filesystem;

int main(int argc, char** argv)
{
    if (argc != 3)
    {
        std::cerr << "usage: _stageKProbe <caseDir> <requestFile>\n";
        return 2;
    }
    const bool info = std::string(argv[2]) == "--info";
    const bool names = std::string(argv[2]) == "--names";
    const std::string requestPath = (info || names) ? "" : fs::absolute(argv[2]).string();
    try
    {
        SizeDistribution::registerBuiltins();
        VaporPressureModel::registerBuiltins();
        ActivityModel::registerBuiltins();
        electrolyte::AqueousActivity::registerBuiltins();
        electrolyte::AqueousVolumetricModel::registerBuiltins();
        PureFluidModel::registerBuiltins();
        EquationOfState::registerBuiltins();
        TransportModel::registerBuiltins();
        SurfaceTensionModel::registerBuiltins();
        ThermalConductivityModel::registerBuiltins();
        DiffusivityModel::registerBuiltins();
        LiquidViscosityModel::registerBuiltins();
        LiquidConductivityModel::registerBuiltins();
        LiquidDiffusivityModel::registerBuiltins();
        HeatCapacityModel::registerBuiltins();
        Phase::registerBuiltins();

        fs::path dataRoot;
        if (const char* env = std::getenv("CHOUPO_HOME"))
            dataRoot = fs::path(env) / "data";
        fs::current_path(argv[1]);
        thermoAnnounceLevel() = 0;
        Database db(dataRoot.empty() ? "" : dataRoot.string());
        HenrysLawRegistry::loadFrom(dataRoot.string());
        SolutionRegistry::loadFrom(dataRoot.string());

        const std::string pkgPath = "constant/thermoPhysPropDict";
        auto sel = Dictionary::fromFile(pkgPath);
        ChemistrySystem chem = resolveChemistryContext(
            fs::path(pkgPath).parent_path().string());
        if (sel->found("inherits"))
        {
            std::set<std::string> visited;
            sel = resolvePropertyContext(
                fs::path(pkgPath).parent_path().string(), visited);
        }
        ThermoPackage thermo = ThermoPackageBuilder::build(
            sel, db, chem.present ? &chem : nullptr);
        const std::size_t n = thermo.n();
        if (info)
        {
            std::cout << "reactive " << (thermo.hasReactiveEquilibrium() ? 1 : 0)
                      << "\nidealVapour "
                      << ((thermo.hasEos() && thermo.eos().isIdeal()) ? 1 : 0)
                      << "\n";
            return 0;
        }

        if (names)
        {
            for (std::size_t i = 0; i < n; ++i)
                std::cout << thermo.components()[i].name() << "\n";
            return 0;
        }
        std::ifstream in(requestPath);
        std::ostringstream out;
        out.precision(17);
        std::string line;
        while (std::getline(in, line))
        {
            if (line.empty()) continue;
            std::istringstream ls(line);
            std::string op;
            scalar T = 0.0, P = 0.0;
            ls >> op >> T >> P;
            const std::size_t m = n;
            sVector v(m, 0.0);
            for (std::size_t k = 0; k < m; ++k) ls >> v[k];
            try
            {
                if (op == "SK")
                {
                    const sVector K = thermo.stageK(T, P, v, v, v);
                    out << "OK";
                    for (auto k : K) out << " " << k;
                    out << "\n";
                }
                else
                    out << "ERR unknown request '" << op << "'\n";
            }
            catch (const std::exception& e)
            {
                std::string w = e.what();
                for (auto& c : w) if (c == '\n') c = ' ';
                out << "ERR " << w << "\n";
            }
        }
        std::cout << "<<<PROBE\n" << out.str() << "PROBE>>>\n";
    }
    catch (const std::exception& e)
    {
        std::cerr << "_stageKProbe: " << e.what() << "\n";
        return 1;
    }
    return 0;
}
