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
    _columnThermoProbe  (a curation probe, not a shipped binary)

Description
    The PACKAGE'S OWN functions, asked by an auditor that does not share the
    column's arithmetic (DEV.md 4c C169).  `check_column_thermo_consistency`
    reads a converged column's published profile and products, and needs
    three primitives of the case's own thermophysical system to hold them to
    the thermodynamics their streams carry:

        HL T P z...       H_stream_formation(T, P, 0, z)   [J/mol]  a liquid
        HV T P z...       H_stream_formation(T, P, 1, z)   [J/mol]  a vapour
        K  T P x... y...  Kvec(T, P, x, y)                 the K-values at
                                                             the PUBLISHED y

    These are the functions the energy report prices a stream with and the
    package's equilibrium at its own vapour composition.  The probe never
    calls a unit operation, so it cannot reuse the column's answer to check
    the column's answer.

    Usage:  _columnThermoProbe <caseDir> <requestFile>
            _columnThermoProbe <caseDir> --info   (reactive / idealVapour flags)
    Each request line answers with one line `OK v...` or `ERR <message>`,
    in order, between `<<<PROBE` and `PROBE>>>`.
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
        std::cerr << "usage: _columnThermoProbe <caseDir> <requestFile>\n";
        return 2;
    }
    const bool info = std::string(argv[2]) == "--info";
    const std::string requestPath = info ? "" : fs::absolute(argv[2]).string();
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
            const std::size_t m = (op == "K") ? 2 * n : n;
            sVector v(m, 0.0);
            for (std::size_t k = 0; k < m; ++k) ls >> v[k];
            try
            {
                if (op == "HL" || op == "HV")
                {
                    const sVector z(v.begin(), v.begin() + n);
                    //  Evaluated BEFORE anything is written: a refusal must
                    //  not land on a line that already says OK.
                    const scalar h = thermo.H_stream_formation(
                        T, P, op == "HV" ? 1.0 : 0.0, z);
                    out << "OK " << h << "\n";
                }
                else if (op == "K")
                {
                    const sVector x(v.begin(), v.begin() + n);
                    const sVector y(v.begin() + n, v.end());
                    const sVector K = thermo.Kvec(T, P, x, y);
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
        std::cerr << "_columnThermoProbe: " << e.what() << "\n";
        return 1;
    }
    return 0;
}
