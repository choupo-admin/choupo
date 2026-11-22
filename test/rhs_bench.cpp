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
    SPDX-License-Identifier: GPL-3.0-or-later
-------------------------------------------------------------------------------
Micro-benchmark of the batch vessel's right-hand side and sparse analytic Jacobian (C473 part c):
microseconds per call at ONE fixed state.  A standalone program, NOT part of the engine: the engine
carries no timing hook, and the vessel's private members are reached through the declared
`friend struct BatchReactorBenchAccess` of BatchReactor.H.

    rhs_bench CASEDIR N [STATEFILE] [rhs|jac]

  CASEDIR    a batchReactor case (a copy is advisable: the case is entered, nothing is written)
  N          right-hand-side calls (and N/10 Jacobians); a positive integer, anything else is refused
  STATEFILE  one line: the n_i [kmol] in species order, then T [K] (default: the charge)
  rhs|jac    time one half only (a profile of the other half is then clean)

T moves by one part in 1e13 per call so nothing memoised per T (the Gibbs memo, the rate tables)
answers from the call before.  The Jacobian loop calls the right-hand side first, as a run does
(its memo), and takes that time out.

Build (after `make all`, from the project root; links the shared engine library):
    g++ -std=c++17 -O2 -I src test/rhs_bench.cpp -Lbuild/linux64Gcc -lchoupo \
        -Wl,-rpath,'$ORIGIN' -o build/linux64Gcc/rhs_bench
Run:  CHOUPO_HOME=$PWD build/linux64Gcc/rhs_bench CASEDIR 20000 STATEFILE
\*---------------------------------------------------------------------------*/

#include "core/Dictionary.H"
#include "core/DisplayUnits.H"
#include "materials/MaterialRegistry.H"
#include "thermo/membrane/MembraneRegistry.H"
#include "thermo/electrochem/EDStackRegistry.H"
#include "thermo/henrysLaw/HenrysLawRegistry.H"
#include "thermo/solution/SolutionRegistry.H"
#include "thermo/utility/UtilityCatalogue.H"
#include "thermo/Database.H"
#include "thermo/ThermoAnnounce.H"
#include "thermo/ThermoPackage.H"
#include "thermo/ThermoPackageBuilder.H"
#include "thermo/activityCoefficient/ActivityModel.H"
#include "thermo/electrolyte/AqueousActivity.H"
#include "thermo/electrolyte/AqueousVolumetric.H"
#include "thermo/pureFluid/PureFluidModel.H"
#include "thermo/SurfaceTensionModel.H"
#include "thermo/equationOfState/EquationOfState.H"
#include "thermo/transport/TransportModel.H"
#include "thermo/transport/ThermalConductivityModel.H"
#include "thermo/transport/DiffusivityModel.H"
#include "thermo/transport/LiquidViscosityModel.H"
#include "thermo/transport/LiquidConductivityModel.H"
#include "thermo/transport/LiquidDiffusivityModel.H"
#include "thermo/heatCapacity/HeatCapacityModel.H"
#include "thermo/phase/Phase.H"
#include "thermo/vaporPressure/VaporPressureModel.H"
#include "thermo/reaction/ReactionRate.H"
#include "thermo/liquidProperty/DensityMethod.H"
#include "unitOperations/heatTransfer/htc/HeatTransferCorrelation.H"
#include "unitOperations/batch/BatchUnitOperation.H"
#include "unitOperations/batch/BatchReactor.H"
#include "core/distribution/SizeDistribution.H"
#include "io/InternalStateIO.H"

#include <algorithm>
#include <chrono>
#include <cerrno>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>

namespace Choupo
{
struct BatchReactorBenchAccess
{
    static void run(BatchReactor& r, long N, const std::string& stateFile, const std::string& only)
    {
        const std::size_t n = r.state_.n.size();
        sVector y(n + 1);
        for (std::size_t i = 0; i < n; ++i) y[i] = r.state_.n[i];
        y[n] = r.state_.T;
        if (!stateFile.empty())
        {
            std::ifstream f(stateFile);
            std::string line;
            std::getline(f, line);
            std::istringstream is(line);
            sVector v;
            double x;
            while (is >> x) v.push_back(x);
            if (v.size() != n + 1)
                throw std::runtime_error("STATEFILE: expected " + std::to_string(n + 1)
                                         + " numbers (n_i then T), read " + std::to_string(v.size()));
            y = v;
        }
        using clk = std::chrono::steady_clock;
        const bool doRhs = only.empty() || only == "rhs", doJac = only.empty() || only == "jac";
        const double T0 = y[n];
        double sink = 0.0;
        sVector f0 = r.derivatives_(y);                    // warm-up, and the f0 of the Jacobian
        const auto ns = [](clk::time_point a, clk::time_point b)
        { return double(std::chrono::duration_cast<std::chrono::nanoseconds>(b - a).count()); };
        double usRhs = 0.0, usJac = -1.0;
        if (doRhs)
        {
            const auto t0 = clk::now();
            for (long k = 0; k < N; ++k)
            {
                y[n] = T0 * (1.0 + 1.0e-13 * double(k % 1000));
                f0 = r.derivatives_(y);
                sink += f0[n];
            }
            usRhs = 1e-3 * ns(t0, clk::now()) / double(N);
            y[n] = T0;
        }
        if (doJac && r.jacobianAnalytic_ && r.sparseLinear_)
        {
            solver::SparseJacobian J;
            const sVector typ(n + 1, 1.0e-10);
            r.odeJacobianSparse(y, f0, typ, J);            // warm-up
            const long M = std::max(1L, N / 10);
            const auto t0 = clk::now();
            for (long k = 0; k < M; ++k)
            {
                y[n] = T0 * (1.0 + 1.0e-13 * double(k % 1000));
                if (doRhs) f0 = r.derivatives_(y);         // as in a run: the right-hand side at T first
                r.odeJacobianSparse(y, f0, typ, J);
                sink += J.values[0];
            }
            usJac = 1e-3 * ns(t0, clk::now()) / double(M) - (doRhs ? usRhs : 0.0);
            y[n] = T0;
        }
        std::printf("BENCH rhs %.3f us/call  jacobian %.3f us/call  (T %.1f K, %ld calls, sink %.3e)\n",
                    usRhs, usJac, y[n], N, sink);
    }
};
}

using namespace Choupo;
namespace fs = std::filesystem;

int main(int argc, char** argv)
try
{
    if (argc < 3 || argc > 5)
    {
        std::cerr << "usage: rhs_bench CASEDIR N [STATEFILE] [rhs|jac]\n";
        return 2;
    }
    const std::string caseDir = argv[1];
    char* end = nullptr;
    errno = 0;
    const long N = std::strtol(argv[2], &end, 10);
    if (errno != 0 || end == argv[2] || *end != '\0' || N < 1)
        throw std::runtime_error(std::string("N must be a positive integer, got '") + argv[2] + "'");
    const std::string stateFile = (argc > 3) ? fs::absolute(argv[3]).string() : std::string();
    const std::string only = (argc > 4) ? argv[4] : "";
    if (!only.empty() && only != "rhs" && only != "jac")
        throw std::runtime_error("the fourth argument is rhs or jac, got '" + only + "'");
    if (!fs::exists(caseDir)) throw std::runtime_error("no such case directory: " + caseDir);

    SizeDistribution::registerBuiltins();
    VaporPressureModel::registerBuiltins();
    ActivityModel::registerBuiltins();
    electrolyte::AqueousActivity::registerBuiltins();
    electrolyte::AqueousVolumetricModel::registerBuiltins();
    PureFluidModel::registerBuiltins();
    liquidProperty::DensityMethod::registerBuiltins();
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
    HeatTransferCorrelation::registerBuiltins();
    ReactionRate::registerBuiltins();
    BatchUnitOperation::registerBuiltins();

    fs::path dataRoot;
    if (const char* env = std::getenv("CHOUPO_HOME")) dataRoot = fs::path(env) / "data";
    else dataRoot = fs::current_path() / "data";
    Database db(dataRoot.string());
    fs::current_path(caseDir);
    MaterialRegistry::loadFrom(dataRoot.string());
    MembraneRegistry::loadFrom(dataRoot.string());
    EDStackRegistry::loadFrom(dataRoot.string());
    HenrysLawRegistry::loadFrom(dataRoot.string());
    SolutionRegistry::loadFrom(dataRoot.string());
    UtilityCatalogue::loadFrom(dataRoot.string());

    auto controlDict   = Dictionary::fromFile("system/controlDict");
    auto flowsheetDict = Dictionary::fromFile("system/flowsheetDict");
    auto thermoDict    = Dictionary::fromFile("constant/thermoPhysPropDict");
    DictPtr reactionsDict;
    if (fs::exists("constant/reactions")) reactionsDict = Dictionary::fromFile("constant/reactions");
    thermoAnnounceLevel() = 0;
    ThermoPackage thermo = ThermoPackageBuilder::build(thermoDict, db, nullptr);

    //  The vessel's holdup from 0/, as choupoBatch's seeding does for a 0-D holdup record.
    auto unitList = flowsheetDict->lookupDictList("units");
    std::map<std::string, InternalStateIO::HoldupUnit> decl;
    for (const auto& u : unitList)
        decl[u->lookupWord("name")] = { u->lookupWord("type"), BatchUnitOperation::readsHoldupRecord(u->lookupWord("type")) };
    const auto holdups = InternalStateIO::readHoldups("0", decl, "rhs_bench", 0);
    for (const auto& u : unitList)
    {
        auto it = holdups.find(u->lookupWord("name"));
        if (it != holdups.end()) u->insert("initial", it->second);
    }
    for (const auto& u : unitList)
    {
        if (u->lookupWord("type") != "batchReactor") continue;
        auto unit = BatchUnitOperation::New("batchReactor");
        unit->setName(u->lookupWord("name"));
        unit->initialise(u, thermo, reactionsDict);
        unit->attachThermo(&thermo);
        auto* r = dynamic_cast<BatchReactor*>(unit.get());
        if (!r) throw std::runtime_error("the unit is not a BatchReactor");
        BatchReactorBenchAccess::run(*r, N, stateFile, only);
        return 0;
    }
    throw std::runtime_error("the case has no batchReactor vessel");
}
catch (const std::exception& e)
{
    std::cerr << "rhs_bench: " << e.what() << "\n";
    return 1;
}
