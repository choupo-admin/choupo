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
    choupoCtrl

Description
    Dynamic continuous simulation binary (the third problem class,).  Equation form: dY/dt = f(Y, u, t) with control u(t)
    supplied by Controller objects that read measurements off the
    process and write back to manipulated variables.

    The time loop:

        for t in [startTime, endTime] step deltaT:
            for each controller:  controller.update(t, dt)
            for each unit:        unit.step(t, dt)
            if (t in writeInterval grid): emit snapshot

    Case dict layout:

        case/
        ├── system/
        │   ├── controlDict      verbosity + time settings
        │   └── flowsheetDict    units list + controllers list
        └── constant/
            ├── thermoPackage    components + γ-φ models
            └── reactions        named-reaction library     [optional]

    Output: trajectory.csv with state variables of every unit plus the
    last CV / MV of every controller.

    Usage:  choupoCtrl [case_dir]
\*---------------------------------------------------------------------------*/

#include "control/Controller.H"
#include "core/Banner.H"
#include "core/Dictionary.H"
#include "core/DisplayUnits.H"
#include "materials/MaterialRegistry.H"
#include "thermo/henrysLaw/HenrysLawRegistry.H"
#include "thermo/solution/SolutionRegistry.H"
#include "thermo/utility/UtilityCatalogue.H"
#include "thermo/Database.H"
#include "thermo/ThermoPackage.H"
#include "thermo/activityCoefficient/ActivityModel.H"
#include "thermo/electrolyte/AqueousActivity.H"
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
#include "unitOperations/heatTransfer/htc/HeatTransferCorrelation.H"
#include "thermo/vaporPressure/VaporPressureModel.H"
#include "unitOperations/dynamic/DynamicUnitOperation.H"

#include <algorithm>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <string>

using namespace Choupo;
namespace fs = std::filesystem;

int main(int argc, char** argv)
try
{
    printBanner("  ctrl");

    VaporPressureModel::registerBuiltins();
    ActivityModel     ::registerBuiltins();
    electrolyte::AqueousActivity::registerBuiltins();   // aqueous per-ion gamma (Davies)
    PureFluidModel    ::registerBuiltins();   // pure-component absolute props (IF97)
    EquationOfState   ::registerBuiltins();
    TransportModel    ::registerBuiltins();
    SurfaceTensionModel::registerBuiltins();
    ThermalConductivityModel::registerBuiltins();
    DiffusivityModel      ::registerBuiltins();
    LiquidViscosityModel  ::registerBuiltins();
    LiquidConductivityModel ::registerBuiltins();
    LiquidDiffusivityModel::registerBuiltins();
    HeatCapacityModel ::registerBuiltins();
    Phase             ::registerBuiltins();
    HeatTransferCorrelation::registerBuiltins();
    DynamicUnitOperation::registerBuiltins();
    Controller        ::registerBuiltins();

    const std::string caseDir = (argc > 1) ? argv[1] : ".";
    if (!fs::exists(caseDir))
        throw std::runtime_error("Case directory does not exist: " + caseDir);

    // Database root resolution mirrors choupoBatch.
    const fs::path launchCwd = fs::current_path();
    fs::path dataRoot;
    if (const char* env = std::getenv("CHOUPO_HOME"))
        dataRoot = fs::path(env) / "data";
    else if (fs::exists(launchCwd / "data" / "standards" / "components"))
        dataRoot = launchCwd / "data";
    Database db(dataRoot.empty() ? "" : dataRoot.string());
    if (!dataRoot.empty())
    {
        MaterialRegistry::loadFrom(dataRoot.string());
        HenrysLawRegistry::loadFrom(dataRoot.string());

        SolutionRegistry::loadFrom(dataRoot.string());
        UtilityCatalogue::loadFrom(dataRoot.string());
    }

    fs::current_path(caseDir);
    std::cout << "Case directory: " << fs::current_path().string() << "\n"
              << "Database root:  " << db.root() << "\n\n";

    auto controlDict   = Dictionary::fromFile("system/controlDict");
    auto flowsheetDict = Dictionary::fromFile("system/flowsheetDict");
    auto thermoDict    = Dictionary::fromFile("constant/thermoPackage");

    DictPtr reactionsDict;
    if (fs::exists("constant/reactions"))
        reactionsDict = Dictionary::fromFile("constant/reactions");

    DisplayUnits::instance().readFrom(controlDict);
    DisplayUnits::instance().readPrecision(controlDict);

    const int verbosity = static_cast<int>(controlDict->lookupScalarOrDefault("verbosity", 3));
    const std::string application =
        controlDict->lookupWordOrDefault("application", "choupoCtrl");
    const std::string description =
        controlDict->lookupWordOrDefault("description", "");

    const scalar startTime     = controlDict->lookupScalarOrDefault("startTime", 0.0);
    const scalar endTime       = controlDict->lookupScalar("endTime");
    const scalar deltaT        = controlDict->lookupScalar("deltaT");
    const scalar writeInterval =
        controlDict->lookupScalarOrDefault("writeInterval", deltaT);

    std::cout << "Application:       " << application << "\n";
    if (!description.empty())
        std::cout << "Description:       " << description << "\n";
    std::cout << "Verbosity:         " << verbosity      << "\n"
              << "startTime:         " << startTime      << " s\n"
              << "endTime:           " << endTime        << " s\n"
              << "deltaT:            " << deltaT         << " s\n"
              << "writeInterval:     " << writeInterval  << " s\n"
              << "reactions library: "
              << (reactionsDict ? "loaded" : "not present")
              << "\n\n";

    ThermoPackage thermo;
    thermo.readFromDict(thermoDict, db);

    // ---- Build dynamic units -----------------------------------------
    auto unitList = flowsheetDict->lookupDictList("units");
    if (unitList.empty())
        throw std::runtime_error("choupoCtrl: flowsheetDict has no units");

    std::vector<std::unique_ptr<DynamicUnitOperation>> units;
    std::vector<std::string>                            unitNames;
    units.reserve(unitList.size());
    unitNames.reserve(unitList.size());

    for (const auto& uDict : unitList)
    {
        const std::string uname = uDict->lookupWord("name");
        const std::string utype = uDict->lookupWord("type");
        auto u = DynamicUnitOperation::New(utype);
        u->setName(uname);
        u->initialise(uDict, thermo, reactionsDict);
        unitNames.push_back(uname);
        units.push_back(std::move(u));
    }

    auto findUnit = [&](const std::string& nm) -> DynamicUnitOperation*
    {
        for (std::size_t i = 0; i < units.size(); ++i)
            if (unitNames[i] == nm) return units[i].get();
        return nullptr;
    };

    std::cout << "Units in process:";
    for (const auto& n : unitNames) std::cout << "  " << n;
    std::cout << "\n";

    // ---- Build controllers -------------------------------------------
    std::vector<std::unique_ptr<Controller>> controllers;
    std::vector<std::string>                  ctrlNames;
    if (flowsheetDict->found("controllers"))
    {
        auto ctrlList = flowsheetDict->lookupDictList("controllers");
        controllers.reserve(ctrlList.size());
        ctrlNames.reserve(ctrlList.size());
        for (const auto& cDict : ctrlList)
        {
            const std::string cname = cDict->lookupWord("name");
            const std::string ctype = cDict->lookupWord("type");
            auto c = Controller::New(ctype);
            c->setName(cname);
            c->initialise(cDict, findUnit);
            ctrlNames.push_back(cname);
            controllers.push_back(std::move(c));
        }
    }

    if (!controllers.empty())
    {
        std::cout << "Controllers:    ";
        for (const auto& n : ctrlNames) std::cout << "  " << n;
        std::cout << "\n";
    }
    std::cout << "\n";

    // ---- Trajectory CSV header --------------------------------------
    std::ofstream csv("trajectory.csv");
    if (!csv)
        throw std::runtime_error("choupoCtrl: cannot open trajectory.csv");
    csv << "t";
    for (const auto& u : units)
        for (const auto& lbl : u->stateLabels())
            csv << "," << u->name() << "." << lbl;
    for (const auto& c : controllers)
        csv << "," << c->name() << ".SP,"
            << c->name() << ".PV,"
            << c->name() << ".MV";
    csv << "\n";

    auto writeSnapshot = [&](scalar t)
    {
        csv << std::scientific << std::setprecision(8) << t;
        for (const auto& u : units)
            for (auto v : u->stateVector())
                csv << "," << v;
        for (const auto& c : controllers)
            csv << "," << c->setpoint()
                << "," << c->lastCV()
                << "," << c->lastMV();
        csv << "\n";
    };

    // ---- Time loop ---------------------------------------------------
    std::cout << "Time integration  (RK4 inside units, dt = " << deltaT << " s):\n";
    if (verbosity >= 3)
    {
        std::cout << "      t [s]    ";
        for (const auto& u : units)
            for (const auto& lbl : u->stateLabels())
                std::cout << std::setw(14) << (u->name() + "." + lbl);
        for (const auto& c : controllers)
            std::cout << std::setw(14) << (c->name() + ".PV")
                      << std::setw(14) << (c->name() + ".MV");
        std::cout << "\n";
    }

    auto echoLine = [&](scalar t)
    {
        std::cout << "  " << std::setw(9) << std::fixed << std::setprecision(2) << t << "  ";
        for (const auto& u : units)
            for (auto v : u->stateVector())
                std::cout << std::setw(14) << std::scientific << std::setprecision(5) << v;
        for (const auto& c : controllers)
            std::cout << std::setw(14) << std::scientific << std::setprecision(5) << c->lastCV()
                      << std::setw(14) << std::scientific << std::setprecision(5) << c->lastMV();
        std::cout << "\n";
    };

    scalar t         = startTime;
    scalar nextWrite = startTime;
    writeSnapshot(t);
    if (verbosity >= 3) echoLine(t);
    nextWrite += writeInterval;

    while (t < endTime - 1.0e-12)
    {
        scalar dt = deltaT;
        if (t + dt > endTime) dt = endTime - t;

        // Update controllers FIRST so the unit step sees the new MV.
        // (Causality choice: MV at time t acts on dY/dt in [t, t+dt].)
        for (auto& c : controllers) c->update(t, dt);

        // Advance each unit by dt with the current MV held constant
        // across the RK4 stages (zero-order hold).  Acceptable for
        // typical dt much smaller than the closed-loop time constant.
        for (auto& u : units) u->step(t, dt);

        t += dt;

        if (t >= nextWrite - 1.0e-9 || t >= endTime - 1.0e-12)
        {
            writeSnapshot(t);
            if (verbosity >= 3) echoLine(t);
            nextWrite += writeInterval;
        }
    }

    csv.close();
    std::cout << "\nTrajectory written: trajectory.csv\n";

    // ---- Final summary ----------------------------------------------
    std::cout << "\n=========================  Final state at t = " << t << " s  ===\n";
    for (const auto& u : units)
    {
        const auto labels = u->stateLabels();
        const auto vals   = u->stateVector();
        std::cout << "  Unit: " << u->name() << "  (" << u->type() << ")\n";
        for (std::size_t i = 0; i < labels.size(); ++i)
            std::cout << "    " << std::left << std::setw(20) << labels[i]
                      << std::right << std::scientific << std::setprecision(6)
                      << vals[i] << "\n";
    }
    for (const auto& c : controllers)
    {
        std::cout << "  Controller: " << c->name() << "  (" << c->type() << ")\n"
                  << "    SP = " << std::fixed << std::setprecision(4) << c->setpoint()
                  << "    PV = " << c->lastCV()
                  << "    MV = " << c->lastMV() << "\n";
    }
    std::cout << "==================================================\n";

    return 0;
}
catch (const std::exception& e)
{
    std::cerr << "\nERROR: " << e.what() << "\n";
    return 2;
}
