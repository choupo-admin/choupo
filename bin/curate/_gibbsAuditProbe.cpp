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
    _gibbsAuditProbe  (a curation probe, not a shipped binary)

Description
    The case's OWN thermophysical package, asked by an auditor that calls no
    unit operation (DEV.md 4c C173, the external audit of the Gibbs and phase
    routes).  `check_gibbs_phase_audit` uses it for independent answers:

        NAMES                         the package's component order
        LNPHI V|L T P y...            ln phi_i on the vapour / liquid root
        K T P x... y...               the package's own VL K-values,
                                      Kvec(T, P, x, y)
        GRES T P y...                 g_res/RT = H_res/RT - S_res/R on the
                                      vapour root -- the function whose
                                      mole-number derivative IS ln phi_i
        REACT T P n0... nu...         ONE reaction's equilibrium extent from
                                      the fugacity condition
                                        sum_i nu_i (g_i/RT + ln y_i
                                                    + ln(P/P0) + ln phi_i) = 0
                                      with the package's ln phi at the
                                      CURRENT y, solved by bisection on the
                                      extent (the condition is dG/dxi of a
                                      convex G, so it is monotone).  Prints
                                      the extent and the mole fractions.
        REACTIDEAL T P n0... nu...    the same with ln phi = 0.

    Usage:  _gibbsAuditProbe <caseDir> <requestFile>
    Each request line answers `OK v...` or `ERR <message>`, in order, between
    `<<<PROBE` and `PROBE>>>`.
\*---------------------------------------------------------------------------*/

#include "core/Constants.H"
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

#include <cmath>
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
        std::cerr << "usage: _gibbsAuditProbe <caseDir> <requestFile>\n";
        return 2;
    }
    const std::string requestPath = fs::absolute(argv[2]).string();
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

        std::ifstream in(requestPath);
        std::ostringstream out;
        out.precision(17);
        std::string line;
        while (std::getline(in, line))
        {
            if (line.empty()) continue;
            std::istringstream ls(line);
            std::string op;
            ls >> op;
            try
            {
                if (op == "NAMES")
                {
                    out << "OK";
                    for (std::size_t i = 0; i < n; ++i)
                        out << " " << thermo.comp(i).name();
                    out << "\n";
                }
                else if (op == "LNPHI")
                {
                    std::string root; scalar T = 0.0, P = 0.0;
                    ls >> root >> T >> P;
                    sVector y(n, 0.0);
                    for (auto& v : y) ls >> v;
                    const sVector phi = (root == "L")
                        ? thermo.eos().phiLiquid(T, P, y)
                        : thermo.eos().phi(T, P, y);
                    out << "OK";
                    for (auto v : phi) out << " " << std::log(v);
                    out << "\n";
                }
                else if (op == "K")
                {
                    scalar T = 0.0, P = 0.0;
                    ls >> T >> P;
                    sVector x(n, 0.0), y(n, 0.0);
                    for (auto& v : x) ls >> v;
                    for (auto& v : y) ls >> v;
                    const sVector K = thermo.Kvec(T, P, x, y);
                    out << "OK";
                    for (auto v : K) out << " " << v;
                    out << "\n";
                }
                else if (op == "GRES")
                {
                    scalar T = 0.0, P = 0.0;
                    ls >> T >> P;
                    sVector y(n, 0.0);
                    for (auto& v : y) ls >> v;
                    const scalar RT = constant::R * T;
                    const scalar g = thermo.eos().H_residual(T, P, y) / RT
                                   - thermo.eos().S_residual(T, P, y) / constant::R;
                    out << "OK " << g << "\n";
                }
                else if (op == "REACT" || op == "REACTIDEAL")
                {
                    const bool ideal = (op == "REACTIDEAL");
                    scalar T = 0.0, P = 0.0;
                    ls >> T >> P;
                    sVector n0(n, 0.0), nu(n, 0.0);
                    for (auto& v : n0) ls >> v;
                    for (auto& v : nu) ls >> v;
                    sVector gRT(n, 0.0);
                    for (std::size_t i = 0; i < n; ++i)
                        if (nu[i] != 0.0 || n0[i] > 0.0)
                            gRT[i] = thermo.comp(i).g_pure_ig(T) / (constant::R * T);
                    const scalar lnP = std::log(P / constant::Pref);
                    //  the extent's admissible interval: every n_i >= 0
                    scalar lo = -1.0e300, hi = 1.0e300;
                    for (std::size_t i = 0; i < n; ++i)
                    {
                        if (nu[i] > 0.0) lo = std::max(lo, -n0[i] / nu[i]);
                        if (nu[i] < 0.0) hi = std::min(hi, -n0[i] / nu[i]);
                    }
                    auto yAt = [&](scalar xi) {
                        sVector nn(n); scalar N = 0.0;
                        for (std::size_t i = 0; i < n; ++i)
                        { nn[i] = n0[i] + nu[i] * xi; N += nn[i]; }
                        for (auto& v : nn) v /= N;
                        return nn;
                    };
                    auto dG = [&](scalar xi) {
                        const sVector y = yAt(xi);
                        sVector lnphi(n, 0.0);
                        if (!ideal)
                        {
                            const sVector phi = thermo.eos().phi(T, P, y);
                            for (std::size_t i = 0; i < n; ++i)
                                lnphi[i] = std::log(phi[i]);
                        }
                        scalar s = 0.0;
                        for (std::size_t i = 0; i < n; ++i)
                            if (nu[i] != 0.0)
                                s += nu[i] * (gRT[i] + std::log(y[i]) + lnP
                                              + lnphi[i]);
                        return s;
                    };
                    const scalar span = hi - lo;
                    scalar a = lo + 1.0e-13 * span, b = hi - 1.0e-13 * span;
                    for (int it = 0; it < 200; ++it)
                    {
                        const scalar m = 0.5 * (a + b);
                        (dG(m) > 0.0 ? b : a) = m;
                    }
                    const scalar xi = 0.5 * (a + b);
                    const sVector y = yAt(xi);
                    out << "OK " << xi;
                    for (auto v : y) out << " " << v;
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
        std::cerr << "_gibbsAuditProbe: " << e.what() << "\n";
        return 1;
    }
    return 0;
}
